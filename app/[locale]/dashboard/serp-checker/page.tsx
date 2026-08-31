"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Favicon } from "@/components/favicon"
import { useCredits } from "@/lib/credits"
import { useLocale, useTranslations } from "next-intl"
import { api, ApiError } from "@/lib/api"
import { fetchBillingConfig } from "@/lib/billing-config"
import { ALL_LOCATIONS } from "@/lib/locations"
import { Flag } from "@/components/flag"
import { Icon } from "@/components/dashboard/icons"
import { Dropdown } from "@/components/dashboard/dropdown"
import {
  StatTile,
  FeatChip,
  serpFeaturesToChips,
  type SerpFeatures,
} from "@/components/dashboard/primitives"
import { ToolContext } from "@/components/dashboard/tool-context"

type SerpResultRow = {
  position: number
  domain: string
  url: string
  title: string
  snippet: string | null
}

type CompositionRow = { type: string; label: string; count: number }

type CheckResponse = {
  keyword: string
  domain: string | null
  country: string
  device: "desktop" | "mobile"
  checkedAt: string
  position: number | null
  url: string | null
  found: boolean
  searchVolume: number | null
  totalResults: number
  topCompetitor: { domain: string; position: number } | null
  results: SerpResultRow[]
  serpFeatures: SerpFeatures | null
  composition: CompositionRow[]
  aiOverview: { present: boolean; sources: number; cited: boolean } | null
}

type CheckStatus = "PROCESSING" | "COMPLETED" | "FAILED"

// Row in the "previous searches" list (summary shape from GET /api/serp-check).
type HistoryItem = {
  id: string
  keyword: string
  domain: string | null
  country: string
  device: "desktop" | "mobile"
  status: CheckStatus
  position: number | null
  createdAt: string
}

// Full row from GET /api/serp-check/:id — `result` is the CheckResponse once done.
type CheckRow = {
  id: string
  status: CheckStatus
  result: CheckResponse | null
  error: string | null
  keyword: string
  createdAt: string
}

// Daily-quota cost of one live SERP lookup — offline fallback only; the live
// value comes from GET /api/billing/config (backend LIVE_SERP_CHECK_UNITS).
const LIVE_CHECK_COST_FALLBACK = 1

// The date fell back to a hardcoded "en-US", so a French or German reader got
// "Jul 31" in the middle of their own language.
function relativeTime(iso: string, t: ReturnType<typeof useTranslations>, locale: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return t("time.justNow")
  if (mins < 60) return t("time.minutesAgo", { count: mins })
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return t("time.hoursAgo", { count: hrs })
  return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" })
}

/** "31 Jul, 14:22" — inside a group every run is the SAME query, so the clock is
 *  the only thing that tells one from another. */
function absoluteTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  })
}

/** One row of the history list, grouped by the query it repeats. */
type HistoryGroup = {
  key: string
  /** Most recent run — what the collapsed row reports and opens. */
  latest: HistoryItem
  /** Every run of this query, newest first. */
  items: HistoryItem[]
}

function fmtVolume(v: number | null): string {
  if (v == null) return "—"
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1) + "M"
  if (v >= 1_000) return Math.round(v / 1_000) + "k"
  return v.toLocaleString()
}

export default function SerpCheckerPage() {
  // Worker subscribers still meter in daily checks; everyone else in credits.
  const { credits: creditSummary } = useCredits()
  const onCredits = creditSummary?.mode === "credits"
  const t = useTranslations("dashSerpChecker")
  // Live quota cost per lookup from the backend's pricing config.
  const [liveCheckCost, setLiveCheckCost] = useState(LIVE_CHECK_COST_FALLBACK)
  useEffect(() => {
    void fetchBillingConfig().then((cfg) => {
      if (typeof cfg.liveCheckUnits === "number") setLiveCheckCost(cfg.liveCheckUnits)
    })
  }, [])
  const [domain, setDomain] = useState("")
  const [keyword, setKeyword] = useState("")
  const [country, setCountry] = useState("us")
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop")

  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CheckResponse | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  // Which grouped query is showing its individual runs. One at a time — the
  // list is a sidebar-width column, not a tree to browse.
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const locale = useLocale()

  /**
   * Repeats of the same query collapse into one row.
   *
   * The list is a log, and running the same check a dozen times is the normal
   * way to use this tool — which produced a dozen identical rows, each 64px
   * tall, all reading "seo · US · freeserp.com · Jul 31 · 100+". A list where
   * every row says the same thing cannot be read and cannot be picked from:
   * clicking one was a coin toss between twelve results.
   *
   * `history` arrives newest-first and Map keeps insertion order, so the first
   * run seen for a key is the latest and the groups stay in recency order.
   */
  const groups = useMemo<HistoryGroup[]>(() => {
    const by = new Map<string, HistoryGroup>()
    for (const h of history) {
      const key = `${h.keyword.trim().toLowerCase()}|${h.country}|${h.device}|${(h.domain ?? "").toLowerCase()}`
      const g = by.get(key)
      if (g) g.items.push(h)
      else by.set(key, { key, latest: h, items: [h] })
    }
    return [...by.values()]
  }, [history])

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // A check is "in progress" while the POST is in flight or a row is PROCESSING.
  const processing = submitting || processingId != null
  const canSubmit = keyword.trim().length > 0 && !processing

  const loadHistory = useCallback(async (): Promise<HistoryItem[]> => {
    try {
      const { items } = await api.get<{ items: HistoryItem[] }>("/api/serp-check")
      setHistory(items)
      return items
    } catch {
      return []
    }
  }, [])

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  // Poll a PROCESSING check until it terminates, then surface the result/error.
  const pollCheck = useCallback(
    (id: string) => {
      stopPolling()
      setProcessingId(id)
      const tick = async () => {
        try {
          const { check } = await api.get<{ check: CheckRow }>(`/api/serp-check/${id}`)
          if (check.status === "COMPLETED" || check.status === "FAILED") {
            stopPolling()
            setProcessingId(null)
            if (check.status === "COMPLETED" && check.result) setResult(check.result)
            if (check.status === "FAILED") setError(check.error || t("errors.checkFailed"))
            void loadHistory()
            window.dispatchEvent(new Event("usage:refresh"))
          }
        } catch {
          /* transient — keep polling */
        }
      }
      void tick()
      pollRef.current = setInterval(() => void tick(), 2000)
    },
    [loadHistory, stopPolling, t],
  )

  // On mount: load previous searches and resume any in-flight check so a page
  // reload doesn't lose a running lookup.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const items = await loadHistory()
      if (cancelled) return
      const inFlight = items.find((i) => i.status === "PROCESSING")
      if (inFlight) pollCheck(inFlight.id)
    })()
    return () => {
      cancelled = true
      stopPolling()
    }
  }, [loadHistory, pollCheck, stopPolling])

  // Submitting the form opens the confirmation step — the actual check (which
  // spends `liveCheckCost` daily checks) only runs once the user confirms.
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    setShowConfirm(true)
  }

  async function runCheck() {
    setShowConfirm(false)
    if (keyword.trim().length === 0 || processing) return
    setError(null)
    setResult(null)
    setSubmitting(true)
    try {
      const { id } = await api.post<{ id: string; status: CheckStatus }>("/api/serp-check", {
        keyword: keyword.trim(),
        domain: domain.trim() || undefined,
        country,
        device,
      })
      // Quota is reserved when the check is created — refresh the navbar meter.
      window.dispatchEvent(new Event("usage:refresh"))
      void loadHistory()
      pollCheck(id)
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("errors.generic")
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // Open a past search's full result (or resume polling if still processing).
  const openHistory = useCallback(
    async (item: HistoryItem) => {
      if (item.status === "PROCESSING") {
        pollCheck(item.id)
        return
      }
      if (item.status === "FAILED") {
        setError(t("errors.historyFailed"))
        return
      }
      try {
        const { check } = await api.get<{ check: CheckRow }>(`/api/serp-check/${item.id}`)
        if (check.result) {
          setResult(check.result)
          setError(null)
        }
      } catch {
        setError(t("errors.loadFailed"))
      }
    },
    [pollCheck, t],
  )

  function exportReport() {
    if (!result) return
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `serp-check-${result.keyword.replace(/\s+/g, "-").toLowerCase()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const chips = result ? serpFeaturesToChips(result.serpFeatures) : []
  const compMax = result ? Math.max(1, ...result.composition.map((c) => c.count)) : 1

  return (
    <div className="page">
      <div className="page-h">
        <div style={{ minWidth: 0 }}>
          <h1>{t("title")}</h1>
          <div className="sub">{t("subtitle")}</div>
        </div>
        {/* Export only makes sense once a check has produced a result. */}
        {result && (
          <div className="row">
            <button className="btn" onClick={exportReport}>
              <Icon.download /> {t("exportReport")}
            </button>
          </div>
        )}
      </div>

      <ToolContext id="quick-serp" />

      {/* Query form.
          The query on top, the settings under it. It was a 2x2 grid — which gave
          the optional Domain field the same weight as the required Keyword, and
          put Domain FIRST — over a full-width slab of a button, the loudest
          thing on a page that had not run anything yet. */}
      <form className="card" onSubmit={handleSubmit} style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          {/* The one required field, so it leads and takes the width. */}
          <Field label={t("form.keyword")} style={{ flex: "1 1 320px" }}>
            <div style={{ position: "relative" }}>
              <span style={FIELD_ICON}><Icon.search /></span>
              <input
                className="input lg"
                style={{ paddingLeft: 38 }}
                placeholder={t("form.keywordPlaceholder")}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                autoFocus
                required
              />
            </div>
          </Field>
          <Field label={t("form.domain")} hint={t("form.optional")} style={{ flex: "1 1 260px" }}>
            <div style={{ position: "relative" }}>
              <span style={FIELD_ICON}><Icon.globe /></span>
              <input
                className="input lg"
                style={{ paddingLeft: 38 }}
                placeholder={t("form.domainPlaceholder")}
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              />
            </div>
          </Field>
        </div>

        {/* Country, device, and the submit pushed to the end of the same line.
            margin-left:auto rather than a spacer element, so the button still
            sits right when the row wraps on a narrow screen. */}
        <div className="row" style={{ gap: 12, marginTop: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label={t("form.country")} style={{ flex: "0 1 220px" }}>
            <Dropdown
              block
              menuAlign="left"
              value={country}
              options={ALL_LOCATIONS.map((loc) => ({
                value: loc.code,
                label: (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <Flag code={loc.code} size={15} /> {loc.name}
                  </span>
                ),
              }))}
              onChange={setCountry}
              ariaLabel={t("form.country")}
            />
          </Field>
          <Field label={t("form.device")} style={{ flex: "0 0 auto" }}>
            <div className="pill-toggle">
              {(["desktop", "mobile"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  className={device === d ? "active" : ""}
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "7px 14px" }}
                  onClick={() => setDevice(d)}
                >
                  {d === "desktop" ? <Icon.monitor size={15} /> : <Icon.smartphone size={15} />}
                  {d === "desktop" ? t("form.desktop") : t("form.mobile")}
                </button>
              ))}
            </div>
          </Field>

          <button
            type="submit"
            className="btn primary"
            style={{ marginLeft: "auto", minWidth: 180, height: 38, justifyContent: "center" }}
            disabled={!canSubmit}
          >
            {processing ? <><Icon.refresh /> {t("form.checking")}</> : <><Icon.zap /> {t("form.checkRankings")}</>}
          </button>
        </div>

        <div className="tiny muted" style={{ marginTop: 12 }}>
          {t(onCredits ? "form.costNoteCredits" : "form.costNote", { count: liveCheckCost })}
        </div>

        {error && (
          <div
            className="tiny"
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: "var(--r-md)",
              background: "var(--neg-soft)",
              color: "var(--neg)",
            }}
          >
            {error}
          </div>
        )}
      </form>

      {/* Processing state — survives reloads (resumed from history on mount). */}
      {processing && !result && (
        <div className="card" style={{ padding: 60, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
          <span className="spin" style={{ display: "inline-flex", marginRight: 8 }}><Icon.refresh /></span>
          {keyword.trim() ? t("processing.withKeyword", { keyword: keyword.trim() }) : t("processing.noKeyword")}
        </div>
      )}

      {/* Nothing run yet. The page used to end at the form, so two-thirds of the
          viewport was blank white — a tool that looks broken before its first
          use. This says what a check actually returns instead.
          Only with no history: "Nothing checked yet" is false once Previous
          searches is on screen, and that card already fills the space. */}
      {!result && !processing && history.length === 0 && (
        <div className="card" style={{ padding: "44px 32px" }}>
          <div style={{ textAlign: "center" }}>
            <div
              aria-hidden
              style={{
                width: 46, height: 46, margin: "0 auto 14px",
                display: "grid", placeItems: "center",
                borderRadius: 14, background: "var(--brand-soft)", color: "var(--brand)",
              }}
            >
              <Icon.zap />
            </div>
            <div className="b" style={{ fontSize: 17, letterSpacing: "-0.01em" }}>{t("empty.title")}</div>
            {/* Not className="sub": that rule only exists under .page-h, so it
                styles nothing here — the copy would render at full body size. */}
            <div className="muted" style={{ margin: "6px auto 0", maxWidth: 470, fontSize: 13.5, lineHeight: 1.6 }}>
              {t("empty.body")}
            </div>
          </div>

          <div
            className="grid g-3"
            style={{ marginTop: 28, maxWidth: 740, marginInline: "auto", gap: 22 }}
          >
            {[
              { key: "position", icon: <Icon.chart />, title: t("empty.positionTitle"), body: t("empty.positionBody") },
              { key: "page", icon: <Icon.search />, title: t("empty.pageTitle"), body: t("empty.pageBody") },
              { key: "features", icon: <Icon.ai />, title: t("empty.featuresTitle"), body: t("empty.featuresBody") },
            ].map((f) => (
              <div key={f.key} className="col" style={{ gap: 7 }}>
                <span style={{ display: "inline-flex", color: "var(--brand)" }}>{f.icon}</span>
                <span className="b" style={{ fontSize: 13 }}>{f.title}</span>
                <span className="tiny muted" style={{ lineHeight: 1.55 }}>{f.body}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          <div className="grid g-4" style={{ marginBottom: 16 }}>
            <StatTile
              lbl={t("stats.yourPosition")}
              val={result.domain ? (result.found ? `#${result.position}` : "100+") : "—"}
              tip={
                result.domain
                  ? result.found
                    ? t("stats.forDomain", { domain: result.domain })
                    : t("stats.notInTop100")
                  : t("stats.addDomain")
              }
            />
            <StatTile
              lbl={t("stats.serpFeatures")}
              val={chips.length}
              tip={chips.length ? chips.map((c) => featLabel(c, t)).join(" · ") : t("stats.featuresNone")}
            />
            <StatTile
              lbl={t("stats.topCompetitor")}
              val={
                result.topCompetitor ? (
                  // The mark makes the competitor recognisable at a glance; the
                  // domain alone reads as text and is easy to skim past.
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                    <Favicon domain={result.topCompetitor.domain} size={20} bare />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {result.topCompetitor.domain}
                    </span>
                  </span>
                ) : (
                  "—"
                )
              }
              tip={result.topCompetitor ? t("stats.competitorResult", { position: result.topCompetitor.position }) : undefined}
            />
            <StatTile
              lbl={t("stats.searchVolume")}
              val={fmtVolume(result.searchVolume)}
              tip={t("stats.volumePerMonth", { country: result.country.toUpperCase() })}
            />
          </div>

          <div className="grid g-21">
            {/* Results list */}
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div
                className="row"
                style={{ justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid var(--border)" }}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="b">{t("results.heading", { count: result.results.length, keyword: result.keyword })}</div>
                  <div className="tiny muted mono" style={{ marginTop: 2 }}>
                    google.com · {result.country.toUpperCase()} · {result.device}
                  </div>
                </div>
                <a
                  className="btn sm"
                  href={`https://www.google.com/search?q=${encodeURIComponent(result.keyword)}&gl=${result.country}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon.globe /> {t("results.openInGoogle")}
                </a>
              </div>

              {result.aiOverview?.present && (
                <div
                  className="row"
                  style={{
                    gap: 8,
                    alignItems: "center",
                    padding: "10px 16px",
                    background: "var(--brand-soft, rgba(59,130,246,0.08))",
                    borderBottom: "1px solid var(--border)",
                    fontSize: 12.5,
                  }}
                >
                  <span className="chip outline" style={{ color: "var(--brand)" }}><Icon.ai /> {t("aiOverview.label")}</span>
                  <span className="muted">
                    {result.aiOverview.sources > 0
                      ? t("aiOverview.cited", { count: result.aiOverview.sources })
                      : t("aiOverview.shown")}
                    {result.domain && (result.aiOverview.cited ? t("aiOverview.youCited") : t("aiOverview.youNotCited"))}
                  </span>
                </div>
              )}

              {result.results.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
                  {t("results.empty")}
                </div>
              ) : (
                <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {result.results.map((r) => {
                    const mine =
                      result.domain != null &&
                      (r.domain === result.domain || r.domain.endsWith(`.${result.domain}`))
                    return (
                      <li
                        key={r.position}
                        className="row"
                        style={{
                          gap: 12,
                          alignItems: "flex-start",
                          padding: "12px 16px",
                          borderBottom: "1px solid var(--border)",
                          background: mine ? "var(--pos-soft)" : undefined,
                        }}
                      >
                        <span className={"pos-badge " + (r.position <= 3 ? "top3" : r.position <= 10 ? "top10" : "")}>
                          {r.position}
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="row" style={{ gap: 6, alignItems: "center" }}>
                            <Favicon domain={r.domain} size={16} bare />
                            <span className="b" style={{ fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {r.title || r.domain}
                            </span>
                            {mine && <span className="chip">{t("results.you")}</span>}
                          </div>
                          <a
                            className="url tiny"
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          >
                            {r.url.replace(/^https?:\/\//, "")}
                          </a>
                          {r.snippet && (
                            <div className="tiny muted" style={{ marginTop: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                              {r.snippet}
                            </div>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>

            {/* SERP composition */}
            <div className="card">
              <div className="b" style={{ marginBottom: 4 }}>{t("composition.title")}</div>
              <div className="tiny muted" style={{ marginBottom: 14 }}>
                {t("composition.subtitle")}
              </div>
              {result.composition.length === 0 ? (
                <div className="tiny muted">{t("composition.noData")}</div>
              ) : (
                <div className="col" style={{ gap: 12 }}>
                  {result.composition.map((c) => (
                    <div key={c.type}>
                      <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                        <span className="tiny">{c.label}</span>
                        <span className="tiny b tabular">{c.count}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 999, background: "var(--bg-inset)", overflow: "hidden" }}>
                        <div
                          style={{
                            height: "100%",
                            width: `${Math.round((c.count / compMax) * 100)}%`,
                            background: "var(--brand)",
                            borderRadius: 999,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {chips.length > 0 && (
                <>
                  <div className="tiny muted" style={{ margin: "16px 0 8px" }}>{t("composition.serpFeatures")}</div>
                  <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                    {chips.map((f) => <FeatChip key={f} f={f} />)}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Previous searches — one row per QUERY, not per run. See `groups`. */}
      {history.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: "hidden", marginTop: 16 }}>
          <div className="card-h" style={{ padding: "13px 16px", marginBottom: 0, borderBottom: "1px solid var(--border)" }}>
            <div className="b">{t("history.title")}</div>
            <span className="tiny muted">
              {t("history.summary", { queries: groups.length, checks: history.length })}
            </span>
          </div>

          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {groups.map((g) => {
              const h = g.latest
              const expanded = openGroup === g.key
              return (
                <li key={g.key} className="sc-hist-item">
                  <div className="sc-hist-line">
                    {/* The row opens the latest run. The runs chip beside it is
                        a separate control, so one click never has to mean two
                        different things. */}
                    <button
                      type="button"
                      className="sc-hist-open"
                      onClick={() => void openHistory(h)}
                      disabled={h.status === "PROCESSING"}
                    >
                      <span className="sc-hist-dev">
                        {h.device === "mobile" ? <Icon.smartphone size={14} /> : <Icon.monitor size={14} />}
                      </span>
                      <span className="b sc-hist-kw">{h.keyword}</span>
                      <span className="tiny muted sc-hist-meta">
                        {h.country.toUpperCase()}{h.domain ? ` · ${h.domain}` : ""}
                      </span>
                    </button>

                    {g.items.length > 1 && (
                      <button
                        type="button"
                        className="sc-hist-runs"
                        aria-expanded={expanded}
                        onClick={() => setOpenGroup(expanded ? null : g.key)}
                      >
                        {t("history.runs", { count: g.items.length })}
                        <span className={"sc-hist-chev" + (expanded ? " open" : "")}><Icon.chevD /></span>
                      </button>
                    )}

                    <HistoryStatus item={h} t={t} />
                    <span className="tiny muted tabular sc-hist-when">{relativeTime(h.createdAt, t, locale)}</span>
                  </div>

                  {expanded && (
                    <ul className="sc-hist-sub">
                      {g.items.map((it) => (
                        <li key={it.id}>
                          <button
                            type="button"
                            className="sc-hist-subrow"
                            onClick={() => void openHistory(it)}
                            disabled={it.status === "PROCESSING"}
                          >
                            <span className="tiny muted tabular" style={{ flex: 1, minWidth: 0 }}>
                              {absoluteTime(it.createdAt, locale)}
                            </span>
                            <HistoryStatus item={it} t={t} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Confirmation — warn that a live check spends daily checks. */}
      {showConfirm && (
        <div className="modal-bg" onClick={() => setShowConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-h">
              <div>
                <div className="eyebrow" style={{ margin: 0, fontSize: 11 }}>
                  <span className="spark"><Icon.zap /></span> {t("confirm.eyebrow")}
                </div>
                <div className="b" style={{ fontSize: 18, marginTop: 4 }}>{t(onCredits ? "confirm.titleCredits" : "confirm.title", { count: liveCheckCost })}</div>
              </div>
              <button onClick={() => setShowConfirm(false)} className="icon-btn" aria-label={t("confirm.close")}><Icon.close /></button>
            </div>
            <div className="modal-b">
              <div className="tiny muted">
                {t.rich("confirm.body", {
                  keyword: keyword.trim(),
                  count: liveCheckCost,
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </div>
            </div>
            <div className="modal-f">
              <button className="btn" onClick={() => setShowConfirm(false)}>{t("confirm.cancel")}</button>
              <button className="btn primary" onClick={() => void runCheck()}>
                <Icon.zap /> {t("confirm.confirm", { count: liveCheckCost })}
              </button>
            </div>
          </div>
        </div>
      )}
      <style jsx>{`
        /* Previous searches. A hover-highlighted line that holds two separate
           controls, so the whole row can't be one button. */
        .sc-hist-item { border-bottom: 1px solid var(--border); }
        .sc-hist-item:last-child { border-bottom: none; }
        .sc-hist-line {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 16px;
        }
        .sc-hist-line:hover { background: var(--bg-inset); }
        .sc-hist-open {
          display: flex; align-items: center; gap: 10px;
          flex: 1; min-width: 0;
          padding: 0; border: none; background: transparent;
          color: inherit; text-align: left; cursor: pointer;
        }
        .sc-hist-open:disabled { cursor: default; }
        .sc-hist-dev { flex-shrink: 0; display: inline-flex; color: var(--text-mute); }
        /* The keyword takes what it needs and the market line gives way first —
           it is the part you can afford to lose. */
        .sc-hist-kw {
          font-size: 13px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          flex: 0 1 auto;
        }
        .sc-hist-meta {
          min-width: 0; flex: 1 1 auto;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .sc-hist-runs {
          flex-shrink: 0;
          display: inline-flex; align-items: center; gap: 3px;
          padding: 3px 7px 3px 9px;
          border: 1px solid var(--border); border-radius: 999px;
          background: transparent; color: var(--text-mute);
          font-size: 11.5px; font-weight: 500; white-space: nowrap;
          cursor: pointer;
        }
        .sc-hist-runs:hover { color: var(--text); border-color: var(--border-strong); }
        .sc-hist-chev { display: inline-flex; transition: transform 120ms ease; }
        .sc-hist-chev.open { transform: rotate(180deg); }
        .sc-hist-when { flex-shrink: 0; width: 62px; text-align: right; }

        /* The runs of one query, indented to sit under its keyword. */
        .sc-hist-sub { list-style: none; margin: 0; padding: 0; background: var(--bg-sub); }
        .sc-hist-subrow {
          display: flex; align-items: center; gap: 10px;
          width: 100%;
          padding: 7px 16px 7px 42px;
          border: none; background: transparent;
          text-align: left; cursor: pointer;
        }
        .sc-hist-subrow:hover { background: var(--bg-inset); }
        .sc-hist-subrow:disabled { cursor: default; }
      `}</style>
    </div>
  )
}

/**
 * What came of one check: a position pill, or why there isn't one.
 *
 * Not `.pos-badge`: that is a fixed 30x30 square built for "#4", and "100+"
 * simply overflowed it — the miss case, which is most of them, was the one it
 * couldn't draw. This sizes to its text.
 */
function HistoryStatus({ item, t }: { item: HistoryItem; t: ReturnType<typeof useTranslations> }) {
  if (item.status === "PROCESSING") {
    return <span className="tiny" style={{ flexShrink: 0, color: "var(--brand)" }}>{t("history.checking")}</span>
  }
  if (item.status === "FAILED") {
    return <span className="tiny" style={{ flexShrink: 0, color: "var(--neg)" }}>{t("history.failed")}</span>
  }
  const p = item.position
  const tone =
    p == null ? { background: "var(--bg-inset)", color: "var(--text-mute)" }
      : p <= 3 ? { background: "var(--brand)", color: "#fff" }
      : p <= 10 ? { background: "var(--brand-soft)", color: "var(--brand)" }
      : { background: "var(--bg-inset)", color: "var(--text)" }
  return (
    <span
      className="tabular"
      style={{
        flexShrink: 0,
        display: "inline-grid", placeItems: "center",
        minWidth: 38, height: 24, padding: "0 8px",
        borderRadius: 7, fontSize: 12, fontWeight: 600,
        ...tone,
      }}
    >
      {p == null ? "100+" : `#${p}`}
    </span>
  )
}

/** Leading icon inside a text input, matching the Keyword Magic search box. */
const FIELD_ICON: React.CSSProperties = {
  position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)",
  color: "var(--text-mute)", display: "inline-flex", pointerEvents: "none",
}

function Field({
  label, hint, style, children,
}: {
  label: string
  /** Sits beside the label — "optional" and the like. */
  hint?: string
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  return (
    <label className="col" style={{ gap: 6, minWidth: 0, ...style }}>
      <span className="row" style={{ gap: 6, alignItems: "baseline" }}>
        <span className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>
          {label}
        </span>
        {/* Beside the label, not in the placeholder: the placeholder disappears
            the moment you type, which is when you would wonder whether the
            field was required. */}
        {hint && (
          <span className="tiny muted" style={{ fontWeight: 500, opacity: 0.7 }}>{hint}</span>
        )}
      </span>
      {children}
    </label>
  )
}

function featLabel(code: string, t: ReturnType<typeof useTranslations>): string {
  const labels = t.raw("featLabels") as Record<string, string>
  return labels[code] ?? code
}
