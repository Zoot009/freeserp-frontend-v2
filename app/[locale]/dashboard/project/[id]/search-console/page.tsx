"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useGoogleLogin } from "@react-oauth/google"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth"
import { api, ApiError } from "@/lib/api"
import { LineChart } from "@/components/dashboard/primitives"
import { Dropdown } from "@/components/dashboard/dropdown"
import { propertyCoversDomain } from "@/components/dashboard/cards/setup-card"
import { downloadCSV } from "@/lib/csv"

const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"

type Metrics = { clicks: number; impressions: number; ctr: number; position: number }
type Connection = { connected: boolean; googleEmail: string | null }
type Site = { siteUrl: string; permissionLevel: string }
type Dim<K extends string> = ({ [P in K]: string } & Metrics)
type Performance = {
  siteUrl: string
  startDate: string
  endDate: string
  previousStartDate: string
  previousEndDate: string
  totals: Metrics
  previous: Metrics
  series: ({ date: string } & Metrics)[]
  topQueries: Dim<"query">[]
  topPages: Dim<"page">[]
  devices: Dim<"device">[]
  countries: Dim<"country">[]
  searchAppearance: Dim<"appearance">[]
}
type DetailResp = {
  for: "page" | "query"
  value: string
  returnDim: "page" | "query"
  rows: ({ key: string } & Metrics)[]
}

type RangeState = { mode: "preset"; days: 7 | 28 | 90 } | { mode: "custom"; start: string; end: string }
const PRESETS: (7 | 28 | 90)[] = [7, 28, 90]
const PRESET_LABEL: Record<number, "7d" | "28d" | "3m"> = { 7: "7d", 28: "28d", 90: "3m" }

type TabKey = "queries" | "pages" | "countries" | "devices" | "appearance" | "days"
const TAB_KEYS: TabKey[] = ["queries", "pages", "countries", "devices", "appearance", "days"]

// Strip protocol/sc-domain prefix so a GSC property reads like a plain host.
function siteHost(siteUrl: string): string {
  return siteUrl.replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/$/, "")
}

const fmtInt = (v: number) => Math.round(v).toLocaleString()
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`
const fmtPos = (v: number) => v.toFixed(1)

export default function SearchConsolePage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const { user, loading: authLoading } = useAuth()
  const t = useTranslations("dashSearchConsole")

  const [conn, setConn] = useState<Connection | null>(null)
  const [siteUrl, setSiteUrl] = useState<string | null>(null)
  const [projectDomain, setProjectDomain] = useState<string>("")
  const [sites, setSites] = useState<Site[] | null>(null)
  // Property picked in the "link a property" dropdown; null = not touched yet
  // (falls back to the suggested match for the project domain).
  const [chosenSite, setChosenSite] = useState<string | null>(null)
  const [perf, setPerf] = useState<Performance | null>(null)

  const [range, setRange] = useState<RangeState>({ mode: "preset", days: 90 })
  const [metric, setMetric] = useState<"clicks" | "impressions">("clicks")
  const [tab, setTab] = useState<TabKey>("queries")
  const [drill, setDrill] = useState<DetailResp | null>(null)
  const [drillLoading, setDrillLoading] = useState(false)

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [perfLoading, setPerfLoading] = useState(false)
  const [error, setError] = useState("")
  // Google rejected the stored grant — the row still says "connected", but only
  // signing in again will fix it.
  const [needsReauth, setNeedsReauth] = useState(false)

  // The query object sent to the backend for the active range.
  const rangeQuery = useMemo(
    () =>
      range.mode === "custom" && range.start && range.end
        ? { startDate: range.start, endDate: range.end }
        : { days: range.mode === "preset" ? range.days : 90 },
    [range],
  )

  useEffect(() => {
    if (!authLoading && !user) router.push("/login")
  }, [user, authLoading, router])

  const loadBase = useCallback(async () => {
    const [c, link] = await Promise.all([
      api.get<Connection>("/api/gsc/connection"),
      api.get<{ siteUrl: string | null; projectDomain: string }>(`/api/gsc/projects/${projectId}/site`),
    ])
    setConn(c)
    setSiteUrl(link.siteUrl)
    setProjectDomain(link.projectDomain)
    return { connected: c.connected, linked: link.siteUrl }
  }, [projectId])

  /**
   * A stored connection can stop working without us being told: revoking access
   * from a Google account, or letting an unused refresh token lapse, kills the
   * grant while our row survives. /api/gsc/connection only reports whether that
   * row EXISTS, so `connected` stayed true, the reconnect button (which renders
   * only when disconnected) stayed hidden, and the page offered nothing but
   * "Disconnect" beside an error telling you to reconnect.
   *
   * Any 401 from a GSC call means the grant is dead, whatever the row says.
   */
  const noteError = useCallback((err: unknown, fallback: string) => {
    if (err instanceof ApiError && err.status === 401) setNeedsReauth(true)
    setError(err instanceof Error ? err.message : fallback)
  }, [])

  const loadSites = useCallback(async () => {
    try {
      const { sites } = await api.get<{ sites: Site[] }>("/api/gsc/sites")
      setSites(sites)
      setNeedsReauth(false)
    } catch (err) {
      noteError(err, "Failed to load properties")
    }
  }, [noteError])

  const loadPerformance = useCallback(async () => {
    setError("")
    setPerfLoading(true)
    setDrill(null)
    try {
      const data = await api.get<Performance>(`/api/gsc/projects/${projectId}/performance`, {
        query: rangeQuery,
      })
      setPerf(data)
      setNeedsReauth(false)
    } catch (err) {
      setPerf(null)
      noteError(err, "Failed to load performance")
    } finally {
      setPerfLoading(false)
    }
  }, [projectId, rangeQuery, noteError])

  useEffect(() => {
    if (!user) return
    let active = true
    ;(async () => {
      setLoading(true)
      try {
        const base = await loadBase()
        if (!active) return
        if (base.connected && !base.linked) await loadSites()
      } catch (err) {
        if (active) noteError(err, "Failed to load")
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [user, loadBase, loadSites, noteError])

  useEffect(() => {
    if (user && siteUrl) loadPerformance()
  }, [user, siteUrl, loadPerformance])

  const connectGsc = useGoogleLogin({
    flow: "auth-code",
    scope: GSC_SCOPE,
    onSuccess: async ({ code }) => {
      setBusy(true)
      setError("")
      try {
        await api.post("/api/gsc/connect", { code })
        toast.success(t("connectedToast"))
        setNeedsReauth(false)
        const base = await loadBase()
        if (base.connected && !base.linked) await loadSites()
        // Reconnecting from the revoked state: the property was already linked,
        // so go straight back to the report rather than leaving the stale error
        // and an empty panel on screen.
        if (base.linked) await loadPerformance()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to connect")
      } finally {
        setBusy(false)
      }
    },
    onError: () => setError(t("connectError")),
  })

  /**
   * Link a property, honouring the server's domain-coverage check.
   *
   * The API rejects a property that doesn't cover the project's domain with
   * `gsc_property_domain_mismatch` rather than silently accepting it — linking
   * the wrong one puts another site's clicks and impressions under this
   * project's name everywhere. That's recoverable but genuinely wanted
   * sometimes (a migration, an oddly-named property), so the refusal is turned
   * into a question here and retried with `confirm` if the answer is yes.
   */
  const linkSite = useCallback(
    async (url: string) => {
      setBusy(true)
      setError("")
      try {
        await api.put(`/api/gsc/projects/${projectId}/site`, { siteUrl: url })
        setSiteUrl(url)
      } catch (err) {
        if (err instanceof ApiError && err.code === "gsc_property_domain_mismatch") {
          const ok = window.confirm(
            `${url} doesn't look like it covers ${projectDomain}.\n\n` +
              `Linking it will show that site's clicks, impressions and average position under this project ` +
              `everywhere in the dashboard.\n\nLink it anyway?`,
          )
          if (!ok) {
            setBusy(false)
            return
          }
          try {
            await api.put(`/api/gsc/projects/${projectId}/site`, { siteUrl: url, confirm: true })
            setSiteUrl(url)
          } catch (retryErr) {
            setError(retryErr instanceof Error ? retryErr.message : "Failed to link property")
          } finally {
            setBusy(false)
          }
          return
        }
        setError(err instanceof Error ? err.message : "Failed to link property")
      } finally {
        setBusy(false)
      }
    },
    [projectId, projectDomain],
  )

  const disconnect = useCallback(async () => {
    setBusy(true)
    try {
      await api.delete("/api/gsc/connection")
      setConn({ connected: false, googleEmail: null })
      setSiteUrl(null)
      setSites(null)
      setPerf(null)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
    } finally {
      setBusy(false)
    }
  }, [])

  const changeProperty = useCallback(async () => {
    setSiteUrl(null)
    setPerf(null)
    await loadSites()
  }, [loadSites])

  const openDrill = useCallback(
    async (forDim: "page" | "query", value: string) => {
      setDrillLoading(true)
      setDrill({ for: forDim, value, returnDim: forDim === "page" ? "query" : "page", rows: [] })
      try {
        const data = await api.get<DetailResp>(`/api/gsc/projects/${projectId}/detail`, {
          query: { for: forDim, value, ...rangeQuery },
        })
        setDrill(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load detail")
        setDrill(null)
      } finally {
        setDrillLoading(false)
      }
    },
    [projectId, rangeQuery],
  )

  // Substring matching used to be enough here, but "includes" happily suggests
  // notfreeserp.com for a freeserp.com project. propertyCoversDomain compares
  // hosts on label boundaries, so only a property that genuinely covers this
  // domain (itself, a parent, or a subdomain of it) gets pre-selected.
  const suggestedSite = useMemo(() => {
    if (!sites || !projectDomain) return null
    return sites.find((s) => propertyCoversDomain(s.siteUrl, projectDomain))?.siteUrl ?? null
  }, [sites, projectDomain])

  if (authLoading || loading) {
    return (
      <div className="page" style={{ color: "var(--text-mute)", fontSize: 13, padding: 60, textAlign: "center" }}>
        {t("loading")}
      </div>
    )
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="page-h">
        <div style={{ minWidth: 0 }}>
          <Link href={`/dashboard/project/${projectId}/keywords`} className="kd-back" style={{ display: "inline-flex" }}>
            ← {t("backToProject")}
          </Link>
          <h1 style={{ margin: "8px 0 0" }}>{t("title")}</h1>
          <div className="sub">{t("subtitle")}</div>
        </div>
        {conn?.connected && (
          <div className="col" style={{ alignItems: "flex-end", gap: 6 }}>
            {conn.googleEmail && <span className="tiny muted mono">{conn.googleEmail}</span>}
            <div className="row" style={{ gap: 8 }}>
              {siteUrl && (
                <button type="button" className="btn" onClick={changeProperty} disabled={busy}>
                  {t("changeProperty")}
                </button>
              )}
              <button
                type="button"
                className="btn"
                style={{ borderColor: "var(--neg)", color: "var(--neg)" }}
                onClick={disconnect}
                disabled={busy}
              >
                {t("disconnect")}
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div
          className="card tight row"
          style={{ marginBottom: 14, gap: 12, alignItems: "center", flexWrap: "wrap", borderColor: "var(--neg)", background: "var(--neg-soft)", color: "var(--neg)", fontSize: 12 }}
        >
          <span style={{ flex: 1, minWidth: 200 }}>{error}</span>
          {/* The only thing that fixes a revoked grant is signing in again, so
              the banner that reports it carries the button that does it. */}
          {needsReauth && (
            <button type="button" className="btn primary" onClick={() => connectGsc()} disabled={busy}>
              {busy ? t("connecting") : t("reconnectCta")}
            </button>
          )}
        </div>
      )}

      {/* State 1 — not connected */}
      {!conn?.connected && (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <h2 style={{ marginTop: 0 }}>{t("connectTitle")}</h2>
          <p className="muted" style={{ maxWidth: 460, margin: "8px auto 20px", fontSize: 13 }}>
            {t("connectDesc")}
          </p>
          <button type="button" className="btn primary" onClick={() => connectGsc()} disabled={busy}>
            {busy ? t("connecting") : t("connectCta")}
          </button>
        </div>
      )}

      {/* State 2 — connected, no property linked yet */}
      {conn?.connected && !siteUrl && (
        <div className="card" style={{ padding: 32 }}>
          <h2 style={{ marginTop: 0 }}>{t("selectTitle")}</h2>
          <p className="muted" style={{ fontSize: 13 }}>{t("selectDesc")}</p>
          {sites && sites.length === 0 && <p className="muted" style={{ fontSize: 13 }}>{t("noProperties")}</p>}
          {sites && sites.length > 0 && (
            <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <Dropdown
                menuAlign="left"
                style={{ minWidth: 280 }}
                block
                value={chosenSite ?? suggestedSite ?? ""}
                placeholder={t("choosePropertyPlaceholder")}
                options={sites.map((s) => ({ value: s.siteUrl, label: siteHost(s.siteUrl) }))}
                onChange={setChosenSite}
                disabled={busy}
                ariaLabel={t("choosePropertyPlaceholder")}
              />
              <button
                type="button"
                className="btn primary"
                disabled={busy || !(chosenSite ?? suggestedSite)}
                onClick={() => {
                  const site = chosenSite ?? suggestedSite
                  if (site) linkSite(site)
                }}
              >
                {t("linkCta")}
              </button>
            </div>
          )}
        </div>
      )}

      {/* State 3 — linked: full report */}
      {conn?.connected && siteUrl && (
        <>
          {/* Range controls */}
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <span className="tiny muted mono">{siteHost(siteUrl)}</span>
            <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div className="row" style={{ gap: 6 }}>
                {PRESETS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={"btn" + (range.mode === "preset" && range.days === d ? " primary" : "")}
                    style={{ paddingTop: 6, paddingBottom: 6, fontSize: 12 }}
                    onClick={() => setRange({ mode: "preset", days: d })}
                  >
                    {t(`range.${PRESET_LABEL[d]}`)}
                  </button>
                ))}
              </div>
              <div className="row" style={{ gap: 4, alignItems: "center" }}>
                <input
                  type="date"
                  className="input"
                  style={{ width: "auto", paddingTop: 6, paddingBottom: 6, fontSize: 12 }}
                  value={range.mode === "custom" ? range.start : ""}
                  onChange={(e) =>
                    setRange((r) => ({
                      mode: "custom",
                      start: e.target.value,
                      end: r.mode === "custom" ? r.end : "",
                    }))
                  }
                />
                <span className="tiny muted">–</span>
                <input
                  type="date"
                  className="input"
                  style={{ width: "auto", paddingTop: 6, paddingBottom: 6, fontSize: 12 }}
                  value={range.mode === "custom" ? range.end : ""}
                  onChange={(e) =>
                    setRange((r) => ({
                      mode: "custom",
                      start: r.mode === "custom" ? r.start : "",
                      end: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
          </div>

          {/* KPI tiles with period-over-period deltas */}
          <div className="grid g-4" style={{ marginBottom: 14 }}>
            <Kpi
              label={t("clicks")}
              value={perf ? fmtInt(perf.totals.clicks) : "—"}
              cur={perf?.totals.clicks}
              prev={perf?.previous.clicks}
              format={fmtInt}
              selected={metric === "clicks"}
              onClick={() => setMetric("clicks")}
            />
            <Kpi
              label={t("impressions")}
              value={perf ? fmtInt(perf.totals.impressions) : "—"}
              cur={perf?.totals.impressions}
              prev={perf?.previous.impressions}
              format={fmtInt}
              selected={metric === "impressions"}
              onClick={() => setMetric("impressions")}
            />
            <Kpi
              label={t("ctr")}
              value={perf ? fmtPct(perf.totals.ctr) : "—"}
              cur={perf?.totals.ctr}
              prev={perf?.previous.ctr}
              format={(v) => `${(v * 100).toFixed(2)} pp`}
            />
            <Kpi
              label={t("position")}
              value={perf ? fmtPos(perf.totals.position) : "—"}
              cur={perf?.totals.position}
              prev={perf?.previous.position}
              format={(v) => v.toFixed(1)}
              lowerIsBetter
            />
          </div>

          {/* Trend chart */}
          <div className="card" style={{ padding: 18, marginBottom: 14, opacity: perfLoading ? 0.6 : 1 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <span className="b">{metric === "clicks" ? t("clicks") : t("impressions")}</span>
              {perf && <span className="tiny muted mono">{perf.startDate} → {perf.endDate}</span>}
            </div>
            {perf && perf.series.length > 0 ? (
              <LineChart
                data={perf.series.map((d) => ({ day: d.date, value: metric === "clicks" ? d.clicks : d.impressions }))}
                height={280}
                color="var(--brand)"
                yFormat={fmtInt}
              />
            ) : (
              <div className="muted" style={{ fontSize: 13, padding: "40px 0", textAlign: "center" }}>
                {perfLoading ? t("loading") : t("noData")}
              </div>
            )}
          </div>

          {/* Dimension tabs */}
          <div className="card" style={{ padding: 18 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div className="tabs">
                {TAB_KEYS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={"tab" + (tab === k ? " active" : "")}
                    onClick={() => { setTab(k); setDrill(null) }}
                  >
                    {t(`tabs.${k}`)}
                  </button>
                ))}
              </div>
              {perf && (
                <button type="button" className="btn" style={{ fontSize: 12 }} onClick={() => exportTab(tab, perf, t)}>
                  {t("exportCsv")}
                </button>
              )}
            </div>

            <div style={{ marginTop: 12 }}>
              {!perf ? (
                <div className="muted" style={{ fontSize: 13, padding: "20px 0", textAlign: "center" }}>
                  {perfLoading ? t("loading") : t("noData")}
                </div>
              ) : (
                <DimTable tab={tab} perf={perf} t={t} onDrill={openDrill} />
              )}
            </div>

            {/* Drill-down panel */}
            {drill && (
              <div className="card tight" style={{ marginTop: 14, background: "var(--bg-inset)" }}>
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                  <span className="sm">
                    <span className="muted">{t(`drillFor.${drill.for}`)}</span>{" "}
                    <span className="b mono">{drill.for === "page" ? siteHost(drill.value) : drill.value}</span>
                  </span>
                  <button type="button" className="btn" style={{ fontSize: 12 }} onClick={() => setDrill(null)}>
                    {t("close")}
                  </button>
                </div>
                {drillLoading ? (
                  <div className="muted" style={{ fontSize: 13, padding: "16px 0", textAlign: "center" }}>{t("loading")}</div>
                ) : drill.rows.length === 0 ? (
                  <div className="muted" style={{ fontSize: 13, padding: "16px 0", textAlign: "center" }}>{t("noData")}</div>
                ) : (
                  <MetricsTable
                    head={t(drill.returnDim === "page" ? "page" : "query")}
                    rows={drill.rows.map((r) => ({ label: r.key, m: r, mono: drill.returnDim === "page" }))}
                    t={t}
                  />
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── KPI tile with period-over-period delta ──────────────────────────────────
function Kpi({
  label,
  value,
  cur,
  prev,
  format,
  lowerIsBetter = false,
  selected,
  onClick,
}: {
  label: string
  value: React.ReactNode
  cur?: number
  prev?: number
  format: (v: number) => string
  lowerIsBetter?: boolean
  selected?: boolean
  onClick?: () => void
}) {
  let delta: React.ReactNode = null
  if (cur != null && prev != null) {
    const diff = cur - prev
    const changed = Math.abs(diff) > 1e-9
    const improved = lowerIsBetter ? diff < 0 : diff > 0
    const cls = !changed ? "flat" : improved ? "up" : "down"
    delta = (
      <span className={"delta " + cls}>
        {changed ? (improved ? "▲" : "▼") : "—"} {changed ? format(Math.abs(diff)) : ""}
      </span>
    )
  }
  const inner = (
    <>
      <div className="lbl">{label}</div>
      <div className="val tabular">{value}</div>
      {delta && <div className="row" style={{ gap: 8, alignItems: "center" }}>{delta}</div>}
    </>
  )
  if (onClick) {
    return (
      <button
        type="button"
        className="stat"
        onClick={onClick}
        style={{ textAlign: "left", cursor: "pointer", borderColor: selected ? "var(--brand)" : undefined }}
      >
        {inner}
      </button>
    )
  }
  return <div className="stat">{inner}</div>
}

// ── Active-tab table ────────────────────────────────────────────────────────
function DimTable({
  tab,
  perf,
  t,
  onDrill,
}: {
  tab: TabKey
  perf: Performance
  t: (k: string) => string
  onDrill: (forDim: "page" | "query", value: string) => void
}) {
  if (tab === "queries") {
    return (
      <MetricsTable
        head={t("query")}
        rows={perf.topQueries.map((r) => ({ label: r.query, m: r, onClick: () => onDrill("query", r.query) }))}
        t={t}
      />
    )
  }
  if (tab === "pages") {
    return (
      <MetricsTable
        head={t("page")}
        rows={perf.topPages.map((r) => ({ label: r.page, m: r, mono: true, onClick: () => onDrill("page", r.page) }))}
        t={t}
      />
    )
  }
  if (tab === "countries") {
    return <MetricsTable head={t("country")} rows={perf.countries.map((r) => ({ label: r.country.toUpperCase(), m: r }))} t={t} />
  }
  if (tab === "devices") {
    return <MetricsTable head={t("device")} rows={perf.devices.map((r) => ({ label: r.device, m: r }))} t={t} />
  }
  if (tab === "appearance") {
    return <MetricsTable head={t("appearance")} rows={perf.searchAppearance.map((r) => ({ label: r.appearance, m: r }))} t={t} />
  }
  // days
  return <MetricsTable head={t("date")} rows={perf.series.map((r) => ({ label: r.date, m: r, mono: true }))} t={t} />
}

// ── Generic metrics table ───────────────────────────────────────────────────
function MetricsTable({
  head,
  rows,
  t,
}: {
  head: string
  rows: { label: string; m: Metrics; mono?: boolean; onClick?: () => void }[]
  t: (k: string) => string
}) {
  if (rows.length === 0) {
    return <div className="muted" style={{ fontSize: 13, padding: "20px 0", textAlign: "center" }}>{t("noData")}</div>
  }
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>{head}</th>
          <th style={{ textAlign: "right" }}>{t("clicks")}</th>
          <th style={{ textAlign: "right" }}>{t("impressions")}</th>
          <th style={{ textAlign: "right" }}>{t("ctr")}</th>
          <th style={{ textAlign: "right" }}>{t("position")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} onClick={r.onClick} style={{ cursor: r.onClick ? "pointer" : "default" }}>
            <td
              className={r.mono ? "mono tiny" : ""}
              style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              title={r.label}
            >
              {r.mono ? siteHost(r.label) || r.label : r.label}
            </td>
            <td className="tabular" style={{ textAlign: "right" }}>{fmtInt(r.m.clicks)}</td>
            <td className="tabular" style={{ textAlign: "right" }}>{fmtInt(r.m.impressions)}</td>
            <td className="tabular" style={{ textAlign: "right" }}>{fmtPct(r.m.ctr)}</td>
            <td className="tabular" style={{ textAlign: "right" }}>{fmtPos(r.m.position)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── CSV export for the active tab ───────────────────────────────────────────
const TAB_LABEL_KEY: Record<TabKey, string> = {
  queries: "query",
  pages: "page",
  countries: "country",
  devices: "device",
  appearance: "appearance",
  days: "date",
}
function exportTab(tab: TabKey, perf: Performance, t: (k: string) => string) {
  const header = [t(TAB_LABEL_KEY[tab]), "clicks", "impressions", "ctr", "position"]
  const pick = (label: string, m: Metrics) => [label, m.clicks, m.impressions, m.ctr, m.position]
  let body: (string | number)[][] = []
  if (tab === "queries") body = perf.topQueries.map((r) => pick(r.query, r))
  else if (tab === "pages") body = perf.topPages.map((r) => pick(r.page, r))
  else if (tab === "countries") body = perf.countries.map((r) => pick(r.country.toUpperCase(), r))
  else if (tab === "devices") body = perf.devices.map((r) => pick(r.device, r))
  else if (tab === "appearance") body = perf.searchAppearance.map((r) => pick(r.appearance, r))
  else body = perf.series.map((r) => pick(r.date, r))
  downloadCSV(`gsc-${tab}-${perf.startDate}_${perf.endDate}.csv`, [header, ...body])
}
