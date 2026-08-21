"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Favicon } from "@/components/favicon"
import { useCredits } from "@/lib/credits"
import { useTranslations } from "next-intl"
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

function relativeTime(iso: string, t: ReturnType<typeof useTranslations>): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return t("time.justNow")
  if (mins < 60) return t("time.minutesAgo", { count: mins })
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return t("time.hoursAgo", { count: hrs })
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short" })
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
          <div className="eyebrow"><span className="spark"><Icon.zap /></span> {t("eyebrow")}</div>
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

      {/* Query form */}
      <form className="card" onSubmit={handleSubmit} style={{ marginBottom: 16 }}>
        <div className="grid g-2" style={{ marginBottom: 14 }}>
          <Field label={t("form.domain")}>
            <input
              className="input"
              placeholder={t("form.domainPlaceholder")}
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
          </Field>
          <Field label={t("form.keyword")}>
            <input
              className="input"
              placeholder={t("form.keywordPlaceholder")}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              required
            />
          </Field>
          <Field label={t("form.country")}>
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
          <Field label={t("form.device")}>
            <div className="pill-toggle" style={{ width: "100%" }}>
              {(["desktop", "mobile"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  className={device === d ? "active" : ""}
                  style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }}
                  onClick={() => setDevice(d)}
                >
                  {d === "desktop" ? <Icon.monitor size={15} /> : <Icon.smartphone size={15} />}
                  {d === "desktop" ? t("form.desktop") : t("form.mobile")}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <button type="submit" className="btn primary" style={{ width: "100%", justifyContent: "center" }} disabled={!canSubmit}>
          {processing ? <><Icon.refresh /> {t("form.checking")}</> : <><Icon.zap /> {t("form.checkRankings")}</>}
        </button>
        <div className="tiny muted" style={{ textAlign: "center", marginTop: 10 }}>
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
              textAlign: "center",
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

      {/* Previous searches */}
      {history.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: "hidden", marginTop: 16 }}>
          <div className="card-h" style={{ padding: "14px 16px", marginBottom: 0, borderBottom: "1px solid var(--border)" }}>
            <div className="b">{t("history.title")}</div>
            <span className="tiny muted">{t("history.recent", { count: history.length })}</span>
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {history.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => void openHistory(h)}
                  disabled={h.status === "PROCESSING"}
                  style={{
                    display: "flex",
                    width: "100%",
                    textAlign: "left",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 16px",
                    border: "none",
                    borderBottom: "1px solid var(--border)",
                    background: "transparent",
                    cursor: h.status === "PROCESSING" ? "default" : "pointer",
                  }}
                >
                  <span style={{ flexShrink: 0, color: "var(--text-mute)" }}>
                    {h.device === "mobile" ? <Icon.smartphone size={15} /> : <Icon.monitor size={15} />}
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="b" style={{ fontSize: 13, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {h.keyword}
                    </span>
                    <span className="tiny muted">
                      {h.country.toUpperCase()}
                      {h.domain ? ` · ${h.domain}` : ""} · {relativeTime(h.createdAt, t)}
                    </span>
                  </span>
                  <span style={{ flexShrink: 0 }}>
                    {h.status === "PROCESSING" ? (
                      <span className="tiny" style={{ color: "var(--brand)" }}>{t("history.checking")}</span>
                    ) : h.status === "FAILED" ? (
                      <span className="tiny" style={{ color: "var(--neg)" }}>{t("history.failed")}</span>
                    ) : (
                      <span className={"pos-badge " + (h.position == null ? "" : h.position <= 3 ? "top3" : h.position <= 10 ? "top10" : "")}>
                        {h.position == null ? "100+" : `#${h.position}`}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
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
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="col" style={{ gap: 6 }}>
      <span className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>
        {label}
      </span>
      {children}
    </label>
  )
}

function featLabel(code: string, t: ReturnType<typeof useTranslations>): string {
  const labels = t.raw("featLabels") as Record<string, string>
  return labels[code] ?? code
}
