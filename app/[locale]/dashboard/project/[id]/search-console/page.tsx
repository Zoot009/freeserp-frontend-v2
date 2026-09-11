"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useGoogleLogin } from "@react-oauth/google"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth"
import { api, ApiError } from "@/lib/api"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { StatCard } from "@/components/dashboard/stat-card"
import { Icon } from "@/components/dashboard/icons"
import { cn } from "@/lib/utils"
import { Dropdown } from "@/components/dashboard/dropdown"
import { propertyCoversDomain } from "@/components/dashboard/gsc"
import { AddToTrackerModal } from "@/components/dashboard/add-to-tracker-modal"
import { DEFAULT_ENGINE } from "@/hooks/use-engines"
import { fetchTrackedKeywords, isFullyTracked } from "@/lib/tracked-keywords"
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

/**
 * Row selection for the query tables. Present only where the rows ARE keywords
 * (the Queries tab, and a page's drill-down into its queries) — a country or a
 * device is not something the rank tracker can track.
 */
type QuerySelect = {
  selected: Set<string>
  isTracked: (query: string) => boolean
  onToggle: (query: string) => void
  onToggleAll: (queries: string[]) => void
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
/** "12 Jun" — the pager's window label, in the reader's own locale. */
const fmtDay = (ts: number) =>
  new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short" })

/** The four figures Search Console reports, and the order the tiles sit in. */
const METRIC_KEYS = ["clicks", "impressions", "ctr", "position"] as const
type MetricKey = (typeof METRIC_KEYS)[number]

/**
 * A fixed colour per metric, from the palette the keyword chart already uses.
 *
 * Keyed by metric, never by selection order. Assigning by position would
 * repaint impressions the moment clicks was unticked, and a reader who has
 * learned "blue is clicks" would be quietly lied to.
 */
const METRIC_COLORS: Record<MetricKey, string> = {
  clicks: "var(--primary)",
  impressions: "#7c3aed",
  ctr: "#0891b2",
  position: "#d97706",
}

/** Lower is better for position, so its axis runs the other way. */
const METRIC_INVERTED: Record<MetricKey, boolean> = {
  clicks: false,
  impressions: false,
  ctr: false,
  position: true,
}

/** What each figure means, and what a good one looks like. */
const METRIC_HINTS: Record<MetricKey, string> = {
  clicks: "Times someone clicked through to your site from Google, for this property and range.",
  impressions:
    "Times a link to your site appeared in results. High impressions with few clicks usually means you rank, but not high enough.",
  ctr: "Clicks divided by impressions. Compared against the previous period in percentage points, not percent — a move from 1% to 2% is +1 pp.",
  position:
    "Your average position across every query that showed your site. Lower is better, so a green arrow here means the number went down.",
}
const METRIC_FORMAT: Record<MetricKey, (v: number) => string> = {
  clicks: fmtInt,
  impressions: fmtInt,
  ctr: fmtPct,
  position: fmtPos,
}

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
  // ── Which metrics are plotted ─────────────────────────────────────────
  //
  // Tiles are checkboxes, the way Search Console's own are: tick two and both
  // are drawn, each against its own y-axis.
  //
  // Capped at two on purpose. Clicks and impressions differ by one to two
  // orders of magnitude on a real account (2,443 against 61), so they cannot
  // share a scale — the clicks line flattens onto the baseline and reads as
  // zero. Two series means two axes, which is what Google does and what this
  // was asked to match; a third would need a third scale nobody can label, so
  // ticking one drops the metric that has been selected longest.
  //
  // Worth knowing what that costs: with two scales, WHERE the lines cross is
  // set by how the axes were chosen, not by the data. Read each line against
  // its own axis, not against the other line.
  const [metrics, setMetrics] = useState<MetricKey[]>(["clicks"])

  const toggleMetric = (key: MetricKey) =>
    setMetrics((cur) => {
      if (cur.includes(key)) {
        // Never leave the chart with nothing to draw — the last remaining
        // metric stays stuck on rather than emptying the plot.
        return cur.length === 1 ? cur : cur.filter((k) => k !== key)
      }
      return cur.length < 2 ? [...cur, key] : [cur[1]!, key]
    })

  // One series, one colour, held by the metric rather than by its position in
  // the selection — so unticking clicks must not repaint impressions.
  const chartConfig = Object.fromEntries(
    METRIC_KEYS.map((k) => [k, { label: t(k), color: METRIC_COLORS[k] }]),
  ) satisfies ChartConfig

  // ── Chart paging ──────────────────────────────────────────────────────
  //
  // Ninety daily points in one plot is a sawtooth nobody can read a date off.
  // The series is cut into windows and paged instead, newest first, because
  // "how did last week go" is the question people open this page with.
  const CHART_PAGE_DAYS = 30
  const [chartPage, setChartPage] = useState(0)

  // Every metric is carried on every point, so ticking a tile redraws from data
  // already in hand rather than re-deriving the series on each toggle.
  const chartPoints = useMemo(
    () =>
      (perf?.series ?? []).map((d) => ({
        ts: new Date(d.date + "T00:00:00Z").getTime(),
        clicks: d.clicks,
        impressions: d.impressions,
        ctr: d.ctr,
        position: d.position,
      })),
    [perf],
  )

  const chartPageCount = Math.max(1, Math.ceil(chartPoints.length / CHART_PAGE_DAYS))

  // Land on the most recent window, and go back there whenever the range or
  // the metric changes — page 2 of the old data is meaningless against a new
  // range, and silently keeping the index shows a window the user did not ask
  // for.
  useEffect(() => {
    setChartPage(Math.max(0, Math.ceil((chartPoints.length || 1) / CHART_PAGE_DAYS) - 1))
  }, [chartPoints.length])

  const pageIndex = Math.min(chartPage, chartPageCount - 1)
  // Windows are measured back from the NEWEST point, not forward from the
  // oldest. Counting forward, a 31-day range splits into 30 + 1 — and since we
  // open on the newest window, that one point IS the landing page: a lone dot
  // with no line, which looks broken rather than sparse. Anchoring to the end
  // makes every window the reader opens a full one, and leaves any short
  // remainder on the oldest page where it reads as "this is all we have".
  const chartSlice = useMemo(() => {
    const end = chartPoints.length - (chartPageCount - 1 - pageIndex) * CHART_PAGE_DAYS
    return chartPoints.slice(Math.max(0, end - CHART_PAGE_DAYS), Math.max(0, end))
  }, [chartPoints, chartPageCount, pageIndex])

  // One y-scale for every page, taken from the WHOLE series.
  //
  // This is the part that makes paging honest. Letting each window scale to
  // its own maximum draws a quiet week and a record week as the same shape at
  // the same height, so paging through looks like nothing ever changes. A
  // fixed ceiling means a tall page really is a busier one.
  // One per metric, so a tile ticked on page 3 does not rescale page 1.
  const chartDomains = useMemo(() => {
    const out = {} as Record<MetricKey, [number, number]>
    for (const key of METRIC_KEYS) {
      const values = chartPoints.map((d) => d[key]).filter((v) => Number.isFinite(v))
      const max = Math.max(0, ...values)
      if (METRIC_INVERTED[key]) {
        // Position: 1 is the best a rank can be, and the axis is reversed at
        // render time. Asking for 0 would leave the line floating under an
        // empty band that means nothing.
        out[key] = [1, Math.max(2, Math.ceil(max) + 1)]
        continue
      }
      if (max <= 0) {
        out[key] = [0, 1]
        continue
      }
      // Round up to a clean step so the axis reads 0/100/200, not 0/93/186.
      const step = Math.pow(10, Math.floor(Math.log10(max))) / 2
      out[key] = [0, Math.ceil((max * 1.05) / step) * step]
    }
    return out
  }, [chartPoints])
  const [tab, setTab] = useState<TabKey>("queries")
  const [drill, setDrill] = useState<DetailResp | null>(null)
  const [drillLoading, setDrillLoading] = useState(false)

  // Queries ticked for the rank tracker, and what the project already tracks.
  // Selection is keyed by the raw query text so it survives a tab switch and the
  // drill-down (where the same query can appear under a page).
  const [selectedQueries, setSelectedQueries] = useState<Set<string>>(new Set())
  const [tracked, setTracked] = useState<Set<string> | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [perfLoading, setPerfLoading] = useState(false)
  // Whether the first performance request has come back at all — success or
  // failure. Distinct from perfLoading, which is true again on every refetch.
  const [perfSettled, setPerfSettled] = useState(false)
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
      setPerfSettled(true)
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

  // What this project already tracks, so a query that is already in the rank
  // tracker reads as such instead of being offered again. Refreshed after an add.
  const loadTracked = useCallback(() => {
    if (!user) return
    fetchTrackedKeywords(projectId)
      .then(setTracked)
      // Non-fatal — nothing is marked, and the backend still refuses duplicates.
      .catch(() => setTracked(new Set()))
  }, [user, projectId])

  useEffect(() => {
    loadTracked()
  }, [loadTracked])

  // Marking is done against Google alone: this is the Google rank tracker, and
  // the engine the modal defaults to. A keyword tracked only on Bing is still a
  // real add here, and the modal re-evaluates once engines are picked.
  const isQueryTracked = useCallback(
    (query: string) => tracked != null && isFullyTracked(tracked, query, [DEFAULT_ENGINE]),
    [tracked],
  )

  const toggleQuery = useCallback((query: string) => {
    setSelectedQueries((prev) => {
      const next = new Set(prev)
      if (next.has(query)) next.delete(query)
      else next.add(query)
      return next
    })
  }, [])

  // Header checkbox: ticks every selectable row on screen, or clears them when
  // they are all already ticked.
  const toggleAllQueries = useCallback(
    (queries: string[]) => {
      const selectable = queries.filter((q) => !isQueryTracked(q))
      setSelectedQueries((prev) => {
        const allOn = selectable.length > 0 && selectable.every((q) => prev.has(q))
        const next = new Set(prev)
        for (const q of selectable) {
          if (allOn) next.delete(q)
          else next.add(q)
        }
        return next
      })
    },
    [isQueryTracked],
  )

  const querySelect: QuerySelect = useMemo(
    () => ({ selected: selectedQueries, isTracked: isQueryTracked, onToggle: toggleQuery, onToggleAll: toggleAllQueries }),
    [selectedQueries, isQueryTracked, toggleQuery, toggleAllQueries],
  )

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

  // First paint, before we know whether this account is even connected. A
  // centred "Loading…" on an otherwise blank page told the reader nothing about
  // what was coming and then shoved the whole layout into place at once.
  //
  // Held until the first performance response too, not just the base load.
  // This page fetches in two stages — is there a connection, then what does it
  // say — and releasing the skeleton after stage one drew the real layout with
  // a SECOND set of placeholders inside it. One skeleton replacing another is
  // two loads as far as the reader is concerned, and the swap between the two
  // shapes is the flicker. perfSettled rather than !perfLoading, because there
  // is a gap between the two effects where no request is in flight yet and the
  // real page would flash through it.
  if (authLoading || loading || (siteUrl != null && !perfSettled)) {
    return <PageSkeleton />
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
          {/* Range controls.

              The two date inputs used to sit here permanently, so the page
              opened showing a pair of empty "mm/dd/yyyy" browser controls
              beside the presets — unstyled, unexplained, and irrelevant to
              the 3-month range actually selected. They are now behind a
              Custom segment and only appear once that is chosen. */}
          <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2.5">
            <span className="truncate font-mono text-xs text-muted-foreground">{siteHost(siteUrl)}</span>
            <div className="flex flex-wrap items-center gap-2.5">
              {/* One segmented control, so the presets and Custom read as the
                  single either/or choice they are. */}
              <div className="inline-flex rounded-lg border bg-card p-0.5 shadow-sm">
                {PRESETS.map((d) => {
                  const on = range.mode === "preset" && range.days === d
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setRange({ mode: "preset", days: d })}
                      className={cn(
                        "rounded-[6px] px-3 py-1.5 text-xs font-medium transition",
                        on
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {t(`range.${PRESET_LABEL[d]}`)}
                    </button>
                  )
                })}
                <button
                  type="button"
                  aria-pressed={range.mode === "custom"}
                  onClick={() =>
                    setRange((r) => (r.mode === "custom" ? r : { mode: "custom", start: "", end: "" }))
                  }
                  className={cn(
                    "rounded-[6px] px-3 py-1.5 text-xs font-medium transition",
                    range.mode === "custom"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {t("range.custom")}
                </button>
              </div>

              {range.mode === "custom" && (
                <div className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2 py-1 shadow-sm">
                  <input
                    type="date"
                    aria-label={t("range.custom")}
                    className="w-[8.5rem] bg-transparent px-1 py-1 text-xs text-foreground outline-none"
                    value={range.start}
                    onChange={(e) =>
                      setRange((r) => ({
                        mode: "custom",
                        start: e.target.value,
                        end: r.mode === "custom" ? r.end : "",
                      }))
                    }
                  />
                  <span className="text-muted-foreground">–</span>
                  <input
                    type="date"
                    aria-label={t("range.custom")}
                    className="w-[8.5rem] bg-transparent px-1 py-1 text-xs text-foreground outline-none"
                    value={range.end}
                    onChange={(e) =>
                      setRange((r) => ({
                        mode: "custom",
                        start: r.mode === "custom" ? r.start : "",
                        end: e.target.value,
                      }))
                    }
                  />
                </div>
              )}
            </div>
          </div>
          {/* KPI tiles with period-over-period deltas. Same grid and spacing
              as the project page's stat strip — this row used to be four tall
              tiles on a page whose siblings all show the compact strip.

              Placeholders only when there is nothing yet. On a refetch `perf`
              still holds the last answer, so the figures stay put and the card
              dims: the old numbers are true right up until the new ones land,
              and replacing them with grey bars on every range click would throw
              away a reading the user may still be looking at. */}
          {!perf && perfLoading ? (
            <KpiSkeleton />
          ) : (
            <div className="mb-3.5 grid grid-cols-2 gap-3.5 md:grid-cols-4">
              {METRIC_KEYS.map((key) => (
                <Kpi
                  key={key}
                  metricKey={key}
                  label={t(key)}
                  hint={METRIC_HINTS[key]}
                  value={perf ? METRIC_FORMAT[key](perf.totals[key]) : "—"}
                  cur={perf?.totals[key]}
                  prev={perf?.previous[key]}
                  // CTR moves in percentage POINTS, not percent: 1% to 2% is
                  // +1 pp, and calling that "+100%" would be true of the ratio
                  // and useless to the reader.
                  format={key === "ctr" ? (v) => `${(v * 100).toFixed(2)} pp` : METRIC_FORMAT[key]}
                  lowerIsBetter={METRIC_INVERTED[key]}
                  selected={metrics.includes(key)}
                  onClick={() => toggleMetric(key)}
                />
              ))}
            </div>
          )}

          {/* Trend chart */}
          <div
            className={cn(
              // overflow-hidden is load-bearing, not cosmetic. ChartContainer
              // debounces its ResizeObserver by 120ms so that animating the
              // sidebar does not re-lay-out every chart on every observed
              // frame — which means the SVG keeps its OLD pixel width for the
              // length of the gesture. That is fine inside a box that clips it
              // and very visible inside one that does not: the plot spilled
              // past the card edge every time the sidebar opened or closed.
              // The overview's traffic card has always clipped; this one did
              // not, which is why only this page showed it.
              "mb-3.5 overflow-hidden rounded-xl border bg-card p-4.5 shadow-sm transition-opacity",
              perfLoading && "opacity-60",
            )}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              {/* Names every plotted series, with its colour beside it. With
                  two lines on two scales, which colour is which is the first
                  thing the reader needs and the axis tint alone is too quiet
                  to carry it. */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {metrics.map((key) => (
                  <span key={key} className="flex items-center gap-1.5 text-[13px] font-medium">
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: METRIC_COLORS[key] }}
                    />
                    <span className="text-muted-foreground">{t(key)}</span>
                  </span>
                ))}
              </div>
              {perf && (
                <span className="font-mono text-xs text-muted-foreground">
                  {perf.startDate} → {perf.endDate}
                </span>
              )}
            </div>
            {perf && perf.series.length > 0 ? (
              <>
                {/* keyed on the window and the selection so the reveal replays
                    when either changes — the animation is what tells you the
                    plot changed, on a chart whose shape can otherwise look
                    similar from one page to the next. */}
                <div key={`${metrics.join("-")}-${pageIndex}`} className="fs-chart-reveal">
                  <ChartContainer config={chartConfig} className="!aspect-auto h-[380px] w-full">
                    <AreaChart data={chartSlice} margin={{ top: 10, right: 8, bottom: 0, left: 4 }}>
                      <defs>
                        {/* Light. The fill gives each line a base; it is not
                            meant to be the loudest thing on the card. With two
                            series it is lighter still, since two overlapping
                            fills otherwise muddy into a third colour. */}
                        {metrics.filter((k) => metrics.length === 1 && !METRIC_INVERTED[k]).map((key) => (
                          <linearGradient key={key} id={`gscFill-${key}`} x1="0" y1="0" x2="0" y2="1">
                            <stop
                              offset="0%"
                              stopColor={METRIC_COLORS[key]}
                              stopOpacity={metrics.length > 1 ? 0.1 : 0.18}
                            />
                            <stop offset="100%" stopColor={METRIC_COLORS[key]} stopOpacity={0} />
                          </linearGradient>
                        ))}
                      </defs>
                      {/* Solid hairline, horizontal only. Dashes read as a
                          threshold or a projection when they are just a grid. */}
                      <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.7} />
                      <XAxis
                        dataKey="ts"
                        type="number"
                        scale="time"
                        domain={["dataMin", "dataMax"]}
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        minTickGap={40}
                        tickFormatter={(v) =>
                          new Date(Number(v)).toLocaleDateString(undefined, { day: "numeric", month: "short" })
                        }
                      />
                      {/* An axis per selected metric: first left, second right.
                          They cannot share one — clicks and impressions differ
                          by up to two orders of magnitude, and on a single scale
                          the clicks line sits flat on the baseline reading as
                          zero. Each axis is tinted to its series, because with
                          two scales the only way to read a line is against the
                          right one. */}
                      {metrics.map((key, i) => (
                        <YAxis
                          key={key}
                          yAxisId={key}
                          orientation={i === 0 ? "left" : "right"}
                          width={52}
                          tickLine={false}
                          axisLine={false}
                          allowDecimals={key === "ctr"}
                          reversed={METRIC_INVERTED[key]}
                          domain={chartDomains[key]}
                          tickFormatter={METRIC_FORMAT[key]}
                          tick={{ fill: METRIC_COLORS[key] }}
                        />
                      ))}
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            labelFormatter={(_, pl) =>
                              new Date(Number(pl?.[0]?.payload?.ts)).toLocaleDateString(undefined, {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })
                            }
                            formatter={(v, name) => [
                              METRIC_FORMAT[name as MetricKey]?.(Number(v)) ?? String(v),
                              ` ${t(String(name))}`,
                            ]}
                          />
                        }
                      />
                      {metrics.map((key) => (
                        <Area
                          key={key}
                          yAxisId={key}
                          dataKey={key}
                          type="monotone"
                          stroke={METRIC_COLORS[key]}
                          strokeWidth={2}
                          /**
                           * No fill unless this is the only series on a
                           * normal axis.
                           *
                           * An Area fills toward its axis BASELINE. Position
                           * runs on a reversed axis, so its baseline is at the
                           * TOP — the fill hung down across the whole plot as a
                           * solid block with the line buried under it. The
                           * keyword-history chart hit this exact thing and
                           * solved it the same way.
                           *
                           * Two series drop their fills for a second reason:
                           * overlapping translucent fills blend into a third
                           * colour that belongs to neither line.
                           */
                          fill={
                            metrics.length === 1 && !METRIC_INVERTED[key]
                              ? `url(#gscFill-${key})`
                              : "none"
                          }
                          // A month of points is sparse enough to mark each one,
                          // which is what makes a single day findable to hover.
                          dot={{ r: 2.5, strokeWidth: 0, fill: METRIC_COLORS[key], fillOpacity: 0.55 }}
                          activeDot={{ r: 5, strokeWidth: 2, fill: "var(--background)" }}
                          // Recharts animates an Area by growing it upward, which
                          // fights the left-to-right reveal the wrapper performs.
                          isAnimationActive={false}
                        />
                      ))}
                    </AreaChart>
                  </ChartContainer>
                </div>

                {/* Two scales mean the crossing point is an artefact of how the
                    axes were picked, not something in the data. Said once, under
                    the chart, rather than left for the reader to infer. */}
                {metrics.length > 1 && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {metrics.map((k) => t(k)).join(" and ")} use separate scales — read each line against its own
                    axis, not against the other line.
                  </p>
                )}

                {/* Pager. Hidden when everything already fits in one window — a
                    7-day range has nothing to page through. */}
                {chartPageCount > 1 && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                    <span className="font-mono text-xs text-muted-foreground">
                      {chartSlice.length > 0 && `${fmtDay(chartSlice[0]!.ts)} – ${fmtDay(chartSlice[chartSlice.length - 1]!.ts)}`}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setChartPage((i) => Math.max(0, i - 1))}
                        disabled={pageIndex === 0}
                        aria-label="Earlier dates"
                        className="rounded-md border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                      >
                        ←
                      </button>
                      {/* Dots, not page numbers: the pages are windows of time,
                          and "3" names nothing a reader can hold on to. The date
                          range beside them is the real label. */}
                      <div className="flex items-center gap-1 px-1">
                        {Array.from({ length: chartPageCount }, (_, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setChartPage(i)}
                            aria-label={`Window ${i + 1} of ${chartPageCount}`}
                            aria-current={i === pageIndex}
                            className={cn(
                              "h-1.5 rounded-full transition-all",
                              i === pageIndex
                                ? "w-5 bg-primary"
                                : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60",
                            )}
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setChartPage((i) => Math.min(chartPageCount - 1, i + 1))}
                        disabled={pageIndex >= chartPageCount - 1}
                        aria-label="Later dates"
                        className="rounded-md border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                      >
                        →
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : perfLoading ? (
              <ChartSkeleton />
            ) : (
              <div className="py-10 text-center text-[13px] text-muted-foreground">{t("noData")}</div>
            )}
          </div>

          {/* Dimension tabs */}
          <div className="rounded-xl border bg-card p-4.5 shadow-sm">
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
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                {/* Only once something is ticked.
                    It used to sit on the Queries tab permanently, greyed out —
                    a primary-styled button doing nothing, which reads as the
                    main action of the card being broken rather than as one
                    waiting on a selection. It still follows a selection across
                    tabs: switching to Pages to drill into a keyword keeps what
                    was ticked, and hiding the button there would strand it. */}
                {selectedQueries.size > 0 && (
                  <button
                    type="button"
                    className="btn primary"
                    style={{ fontSize: 12 }}
                    onClick={() => setShowAddModal(true)}
                  >
                    {t("addSelectedToTracker", { count: selectedQueries.size })}
                  </button>
                )}
                {perf && (
                  <button type="button" className="btn" style={{ fontSize: 12 }} onClick={() => exportTab(tab, perf, t)}>
                    {t("exportCsv")}
                  </button>
                )}
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              {!perf ? (
                perfLoading ? (
                  <RowsSkeleton rows={8} />
                ) : (
                  <div className="muted" style={{ fontSize: 13, padding: "20px 0", textAlign: "center" }}>
                    {t("noData")}
                  </div>
                )
              ) : (
                <DimTable tab={tab} perf={perf} t={t} onDrill={openDrill} select={querySelect} />
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
                  <RowsSkeleton rows={4} />
                ) : drill.rows.length === 0 ? (
                  <div className="muted" style={{ fontSize: 13, padding: "16px 0", textAlign: "center" }}>{t("noData")}</div>
                ) : (
                  <MetricsTable
                    head={t(drill.returnDim === "page" ? "page" : "query")}
                    rows={drill.rows.map((r) => ({ label: r.key, m: r, mono: drill.returnDim === "page" }))}
                    t={t}
                    // The queries a given page ranks for are the most useful
                    // rows on this screen to hand to the tracker.
                    select={drill.returnDim === "query" ? querySelect : undefined}
                  />
                )}
              </div>
            )}
          </div>
        </>
      )}

      {showAddModal && (
        <AddToTrackerModal
          keywords={[...selectedQueries]}
          projectId={projectId}
          projectLabel={projectDomain || (siteUrl ? siteHost(siteUrl) : undefined)}
          source="search-console"
          onClose={() => setShowAddModal(false)}
          onAdded={() => {
            // Clear the ticks and re-read what the project tracks, so the rows
            // that just landed come back marked rather than offered again.
            setSelectedQueries(new Set())
            loadTracked()
          }}
        />
      )}
    </div>
  )
}

// ── KPI tile with period-over-period delta ──────────────────────────────────
// ── Loading placeholders ────────────────────────────────────────────────────
//
// These mirror the real layout rather than being generic grey bars, so nothing
// moves when the data lands — the whole point of a skeleton over a spinner is
// that the page is already the right shape before it has anything to say.
//
// They are for a FIRST load only, when there is nothing on screen yet. A
// refetch — changing the range, paging the chart — keeps the previous render
// and dims it instead. Swapping real data out for placeholders on every filter
// click makes the page flash and loses the reader's place, and the old numbers
// are still true right up until the new ones arrive.

/** The four headline figures, at the exact height StatCard renders. */
function KpiSkeleton() {
  return (
    <div className="mb-3.5 grid grid-cols-2 gap-3.5 md:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="min-w-0 rounded-xl border bg-card px-4.5 py-4 shadow-sm">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="mt-3 h-8 w-20" />
          <Skeleton className="mt-2.5 h-3 w-14" />
        </div>
      ))}
    </div>
  )
}

/**
 * The plot area: axis ticks down the left, a soft body, dates along the bottom.
 *
 * Deliberately not a single flat block. A bare rectangle the size of a chart
 * reads as a broken image; a shape with axes reads as a chart that has not
 * arrived, which is what it is.
 */
function ChartSkeleton() {
  return (
    <div className="flex h-[380px] gap-3 px-1 pb-1 pt-2">
      <div className="flex w-10 flex-col justify-between py-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-2.5 w-7" />
        ))}
      </div>
      <div className="flex flex-1 flex-col">
        <Skeleton className="flex-1 rounded-lg" />
        <div className="mt-3 flex justify-between">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-2.5 w-10" />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Table rows. `rows` is set by the caller so the gap matches what it replaces. */
function RowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2.5 py-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          {/* Staggered widths: equal-length bars read as a table of one repeated
              value rather than as a list of different things. */}
          <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${72 - (i % 3) * 12}%` }} />
          <Skeleton className="h-3.5 w-12 shrink-0" />
          <Skeleton className="h-3.5 w-12 shrink-0" />
          <Skeleton className="h-3.5 w-12 shrink-0" />
        </div>
      ))}
    </div>
  )
}

/** The whole page, for the first paint before we know anything at all. */
function PageSkeleton() {
  return (
    <div className="page">
      <div className="page-h">
        <div style={{ minWidth: 0 }}>
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="mt-3 h-7 w-52" />
          <Skeleton className="mt-2.5 h-3.5 w-80" />
        </div>
      </div>
      <div className="mb-3.5 mt-4 flex items-center justify-between">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-8 w-64 rounded-lg" />
      </div>
      <KpiSkeleton />
      <div className="mb-3.5 rounded-xl border bg-card p-4.5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3 w-40" />
        </div>
        <ChartSkeleton />
      </div>
      <div className="rounded-xl border bg-card p-4.5 shadow-sm">
        <Skeleton className="h-8 w-72 rounded-lg" />
        <RowsSkeleton rows={6} />
      </div>
    </div>
  )
}

/**
 * One Search Console headline figure.
 *
 * Built on the shared StatCard rather than the old `.stat` class this page
 * used to carry. The two had drifted into visibly different cards — this page
 * showed tall bordered tiles with a bare label while every other project page
 * showed the compact strip with an InfoHint — which is exactly the split
 * StatCard was extracted to stop.
 *
 * Clicks and impressions are selectable, because the tile doubles as the
 * chart's metric switch. That is why the selected one is wrapped in a button
 * with a ring instead of a recoloured border: a border change on a card that
 * already has one reads as a rendering glitch, and a plain div gave no
 * keyboard route to a control the mouse could reach.
 */
function Kpi({
  metricKey,
  label,
  hint,
  value,
  cur,
  prev,
  format,
  lowerIsBetter = false,
  selected,
  onClick,
}: {
  metricKey: MetricKey
  label: string
  hint: React.ReactNode
  value: React.ReactNode
  cur?: number
  prev?: number
  format: (v: number) => string
  lowerIsBetter?: boolean
  selected?: boolean
  onClick?: () => void
}) {
  // Period-over-period movement. Rendered only when there is real movement to
  // report — a "0" delta pill is noise dressed as information.
  let caption: React.ReactNode = null
  if (cur != null && prev != null) {
    const diff = cur - prev
    if (Math.abs(diff) > 1e-9) {
      const improved = lowerIsBetter ? diff < 0 : diff > 0
      caption = (
        <span className={"delta " + (improved ? "up" : "down")}>
          {improved ? <Icon.arrowUp /> : <Icon.arrowDown />} {format(Math.abs(diff))}
        </span>
      )
    } else {
      caption = <span className="text-muted-foreground/60">No change</span>
    }
  }

  const color = METRIC_COLORS[metricKey]

  const card = (
    <StatCard
      // A tick-box in the label, the way Search Console marks which figures
      // are on the chart. Purely decorative — the whole tile is the control,
      // so a real <input> here would be a second focus stop for one action.
      label={
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn(
              "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border text-[9px] font-bold leading-none text-white transition-colors",
              !selected && "border-muted-foreground/40",
            )}
            style={selected ? { background: color, borderColor: color } : undefined}
          >
            {selected ? "✓" : ""}
          </span>
          <span className="truncate">{label}</span>
        </span>
      }
      hint={hint}
      value={value}
      caption={caption}
      tone={value === "—" ? "text-muted-foreground/50" : undefined}
      fill={null}
      // The figure wears its series colour only while plotted, so the tile
      // and the line are tied together without a legend to look up.
      valueStyle={selected && value !== "—" ? { color } : undefined}
    />
  )

  if (!onClick) return card

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "min-w-0 rounded-xl text-left transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "ring-2" : "opacity-90 hover:opacity-100 hover:shadow-md",
      )}
      // Ring in the series colour rather than a fixed accent: with two tiles
      // ticked, one blue ring on both would say they are the same series.
      style={selected ? ({ "--tw-ring-color": color } as React.CSSProperties) : undefined}
    >
      {card}
    </button>
  )
}
// ── Active-tab table ────────────────────────────────────────────────────────
function DimTable({
  tab,
  perf,
  t,
  onDrill,
  select,
}: {
  tab: TabKey
  perf: Performance
  t: (k: string) => string
  onDrill: (forDim: "page" | "query", value: string) => void
  select?: QuerySelect
}) {
  if (tab === "queries") {
    return (
      <MetricsTable
        head={t("query")}
        rows={perf.topQueries.map((r) => ({ label: r.query, m: r, onClick: () => onDrill("query", r.query) }))}
        t={t}
        select={select}
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

/** Which column a table is ordered by. `null` keeps Google's own ordering. */
type SortKey = "label" | "clicks" | "impressions" | "ctr" | "position"
type SortState = { key: SortKey; dir: "asc" | "desc" } | null

/**
 * A sortable column heading.
 *
 * The caret only appears on the active column. Showing a neutral double arrow
 * on every heading — the usual way of advertising that a table sorts — puts six
 * pieces of chrome in a row where the reader needs to find one thing, and the
 * active state then has to shout over its own decoration to be seen.
 */
function SortHead({
  label,
  col,
  sort,
  onSort,
  align = "right",
}: {
  label: string
  col: SortKey
  sort: SortState
  onSort: (k: SortKey) => void
  align?: "left" | "right"
}) {
  const active = sort?.key === col
  return (
    <th style={{ textAlign: align }}>
      <button
        type="button"
        onClick={() => onSort(col)}
        aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
        className={cn(
          "inline-flex w-full items-center gap-1 whitespace-nowrap transition-colors hover:text-foreground",
          align === "right" ? "justify-end" : "justify-start",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        <span aria-hidden className={cn("text-[9px] leading-none", active ? "opacity-100" : "opacity-0")}>
          {active && sort!.dir === "asc" ? "▲" : "▼"}
        </span>
      </button>
    </th>
  )
}

const TABLE_PAGE_SIZE = 25

function MetricsTable({
  head,
  rows,
  t,
  select,
}: {
  head: string
  rows: { label: string; m: Metrics; mono?: boolean; onClick?: () => void }[]
  t: (k: string) => string
  /** Supplied only for keyword rows — see QuerySelect. */
  select?: QuerySelect
}) {
  const [sort, setSort] = useState<SortState>(null)
  const [page, setPage] = useState(0)

  // Sort the WHOLE set, then cut the page out of the result. Sorting only the
  // visible page would reorder twenty-five rows inside a list of six hundred
  // and call it sorted, which is worse than not offering it.
  const sorted = useMemo(() => {
    if (!sort) return rows
    const dir = sort.dir === "asc" ? 1 : -1
    return [...rows].sort((a, b) => {
      if (sort.key === "label") return a.label.localeCompare(b.label) * dir
      return (a.m[sort.key] - b.m[sort.key]) * dir
    })
  }, [rows, sort])

  const pageCount = Math.max(1, Math.ceil(sorted.length / TABLE_PAGE_SIZE))
  const pageIndex = Math.min(page, pageCount - 1)
  const visible = useMemo(
    () => sorted.slice(pageIndex * TABLE_PAGE_SIZE, pageIndex * TABLE_PAGE_SIZE + TABLE_PAGE_SIZE),
    [sorted, pageIndex],
  )

  // Any change to what is being listed puts the reader back at the top. Staying
  // on page 9 after re-sorting leaves them somewhere in a list they have never
  // seen the start of.
  useEffect(() => setPage(0), [sort, rows])

  const onSort = (key: SortKey) =>
    setSort((s) => {
      // First click: biggest first for a measure, A–Z for a name. Opening a
      // clicks column at its smallest values would be a useless first view.
      //
      // The two columns therefore START in opposite directions, which is why
      // the flip is written against `first` rather than hard-coded to "desc" —
      // doing that skipped Z–A entirely, so the name column could only ever be
      // sorted one way.
      const first: "asc" | "desc" = key === "label" ? "asc" : "desc"
      if (s?.key !== key) return { key, dir: first }
      if (s.dir === first) return { key, dir: first === "asc" ? "desc" : "asc" }
      // Third click returns to Google's own order rather than trapping the
      // reader in a sort they cannot undo.
      return null
    })

  if (rows.length === 0) {
    return <div className="muted" style={{ fontSize: 13, padding: "20px 0", textAlign: "center" }}>{t("noData")}</div>
  }

  // Header tick-box covers the rows actually on screen. A control that silently
  // selects six hundred rows from a view of twenty-five is a nasty surprise
  // when the next button says "add to rank tracker".
  const pageLabels = visible.map((r) => r.label)
  const selectable = select ? pageLabels.filter((l) => !select.isTracked(l)) : []
  const allSelected = select != null && selectable.length > 0 && selectable.every((l) => select.selected.has(l))

  return (
    <>
      <table className="tbl">
        <thead>
          <tr>
            {select && (
              <th style={{ width: 32 }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  disabled={selectable.length === 0}
                  onChange={() => select.onToggleAll(pageLabels)}
                  aria-label={t("selectAll")}
                  title={t("selectAll")}
                />
              </th>
            )}
            <SortHead label={head} col="label" sort={sort} onSort={onSort} align="left" />
            <SortHead label={t("clicks")} col="clicks" sort={sort} onSort={onSort} />
            <SortHead label={t("impressions")} col="impressions" sort={sort} onSort={onSort} />
            <SortHead label={t("ctr")} col="ctr" sort={sort} onSort={onSort} />
            <SortHead label={t("position")} col="position" sort={sort} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {visible.map((r, i) => {
            const isTracked = select?.isTracked(r.label) ?? false
            return (
              <tr key={r.label + i} onClick={r.onClick} style={{ cursor: r.onClick ? "pointer" : "default" }}>
                {select && (
                  // stopPropagation: the row itself opens the drill-down, and ticking
                  // a box must not also navigate away from the list being ticked.
                  <td onClick={(e) => e.stopPropagation()} style={{ width: 32 }}>
                    <input
                      type="checkbox"
                      checked={select.selected.has(r.label)}
                      disabled={isTracked}
                      onChange={() => select.onToggle(r.label)}
                      aria-label={isTracked ? t("alreadyTracked") : r.label}
                      title={isTracked ? t("alreadyTracked") : undefined}
                    />
                  </td>
                )}
                <td
                  className={r.mono ? "mono tiny" : ""}
                  style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  title={r.label}
                >
                  {r.mono ? siteHost(r.label) || r.label : r.label}
                  {isTracked && <span className="tag" style={{ marginLeft: 8 }}>{t("tracked")}</span>}
                </td>
                <td className="tabular" style={{ textAlign: "right" }}>{fmtInt(r.m.clicks)}</td>
                <td className="tabular" style={{ textAlign: "right" }}>{fmtInt(r.m.impressions)}</td>
                <td className="tabular" style={{ textAlign: "right" }}>{fmtPct(r.m.ctr)}</td>
                <td className="tabular" style={{ textAlign: "right" }}>{fmtPos(r.m.position)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {pageCount > 1 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <span className="text-xs text-muted-foreground">
            {pageIndex * TABLE_PAGE_SIZE + 1}–{Math.min(sorted.length, (pageIndex + 1) * TABLE_PAGE_SIZE)} of{" "}
            {sorted.length.toLocaleString()}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((i) => Math.max(0, i - 1))}
              disabled={pageIndex === 0}
              aria-label="Previous page"
              className="rounded-md border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              ←
            </button>
            <span className="px-1 font-mono text-xs text-muted-foreground">
              {pageIndex + 1} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((i) => Math.min(pageCount - 1, i + 1))}
              disabled={pageIndex >= pageCount - 1}
              aria-label="Next page"
              className="rounded-md border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              →
            </button>
          </div>
        </div>
      )}
    </>
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
