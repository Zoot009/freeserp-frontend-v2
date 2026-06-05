"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { api, ApiError } from "@/lib/api"
import { ALL_LOCATIONS, flagFor } from "@/lib/locations"
import { Icon } from "@/components/dashboard/icons"
import {
  StatTile,
  FeatChip,
  serpFeaturesToChips,
  type SerpFeatures,
} from "@/components/dashboard/primitives"

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

// Daily-quota cost of one live SERP lookup. Keep in sync with the backend's
// LIVE_SERP_CHECK_UNITS (default 4).
const LIVE_CHECK_COST = 4

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short" })
}

function fmtVolume(v: number | null): string {
  if (v == null) return "—"
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1) + "M"
  if (v >= 1_000) return Math.round(v / 1_000) + "k"
  return v.toLocaleString()
}

export default function SerpCheckerPage() {
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
            if (check.status === "FAILED") setError(check.error || "The check failed. Please try again.")
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
    [loadHistory, stopPolling],
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
  // spends 4 daily checks) only runs once the user confirms.
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
            : "Something went wrong. Please try again."
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
        setError("That check failed — try running it again.")
        return
      }
      try {
        const { check } = await api.get<{ check: CheckRow }>(`/api/serp-check/${item.id}`)
        if (check.result) {
          setResult(check.result)
          setError(null)
        }
      } catch {
        setError("Couldn't load that result.")
      }
    },
    [pollCheck],
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
          <div className="eyebrow"><span className="spark"><Icon.zap /></span> QUICK SERP</div>
          <h1>Quick Serp</h1>
          <div className="sub">Run an unbiased Google query from a clean server. Top 100, depersonalized.</div>
        </div>
        <div className="row">
          <button className="btn" disabled={!result} onClick={exportReport}>
            <Icon.download /> Export report
          </button>
        </div>
      </div>

      {/* Query form */}
      <form className="card" onSubmit={handleSubmit} style={{ marginBottom: 16 }}>
        <div className="grid g-2" style={{ marginBottom: 14 }}>
          <Field label="Domain">
            <input
              className="input"
              placeholder="yourdomain.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
          </Field>
          <Field label="Keyword">
            <input
              className="input"
              placeholder="best running shoes"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              required
            />
          </Field>
          <Field label="Country">
            <select
              className="input"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            >
              {ALL_LOCATIONS.map((loc) => (
                <option key={loc.code} value={loc.code}>
                  {flagFor(loc.code)} {loc.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Device">
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
                  {d === "desktop" ? "Desktop" : "Mobile"}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <button type="submit" className="btn primary" style={{ width: "100%", justifyContent: "center" }} disabled={!canSubmit}>
          {processing ? <><Icon.refresh /> Checking…</> : <><Icon.zap /> Check Rankings</>}
        </button>
        <div className="tiny muted" style={{ textAlign: "center", marginTop: 10 }}>
          Live Google query · uses 4 checks · ~10 seconds
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
          Querying Google{keyword.trim() ? ` for “${keyword.trim()}”` : ""}… you can leave this page and come back.
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          <div className="grid g-4" style={{ marginBottom: 16 }}>
            <StatTile
              lbl="Your position"
              val={result.domain ? (result.found ? `#${result.position}` : "100+") : "—"}
              tip={
                result.domain
                  ? result.found
                    ? `for ${result.domain}`
                    : "not in top 100"
                  : "add a domain to track"
              }
            />
            <StatTile
              lbl="SERP features"
              val={chips.length}
              tip={chips.length ? chips.map((c) => featLabel(c)).join(" · ") : "none detected"}
            />
            <StatTile
              lbl="Top competitor"
              val={result.topCompetitor ? result.topCompetitor.domain : "—"}
              tip={result.topCompetitor ? `#${result.topCompetitor.position} result` : undefined}
            />
            <StatTile
              lbl="Search volume"
              val={fmtVolume(result.searchVolume)}
              tip={`/mo in ${result.country.toUpperCase()}`}
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
                  <div className="b">Top {result.results.length} results for “{result.keyword}”</div>
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
                  <Icon.globe /> Open in Google
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
                  <span className="chip outline" style={{ color: "var(--brand)" }}><Icon.ai /> AI Overview</span>
                  <span className="muted">
                    {result.aiOverview.sources > 0
                      ? `Cited ${result.aiOverview.sources} source${result.aiOverview.sources === 1 ? "" : "s"}`
                      : "Shown"}
                    {result.domain && (result.aiOverview.cited ? " · you're cited" : ` · you're not one of them`)}
                  </span>
                </div>
              )}

              {result.results.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
                  No organic results returned.
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
                            <span className="b" style={{ fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {r.title || r.domain}
                            </span>
                            {mine && <span className="chip">You</span>}
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
              <div className="b" style={{ marginBottom: 4 }}>SERP composition</div>
              <div className="tiny muted" style={{ marginBottom: 14 }}>
                Elements Google rendered for this query.
              </div>
              {result.composition.length === 0 ? (
                <div className="tiny muted">No data.</div>
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
                  <div className="tiny muted" style={{ margin: "16px 0 8px" }}>SERP features</div>
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
            <div className="b">Previous searches</div>
            <span className="tiny muted">{history.length} recent</span>
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
                      {h.domain ? ` · ${h.domain}` : ""} · {relativeTime(h.createdAt)}
                    </span>
                  </span>
                  <span style={{ flexShrink: 0 }}>
                    {h.status === "PROCESSING" ? (
                      <span className="tiny" style={{ color: "var(--brand)" }}>Checking…</span>
                    ) : h.status === "FAILED" ? (
                      <span className="tiny" style={{ color: "var(--neg)" }}>Failed</span>
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
                  <span className="spark"><Icon.zap /></span> CONFIRM CHECK
                </div>
                <div className="b" style={{ fontSize: 18, marginTop: 4 }}>This uses {LIVE_CHECK_COST} checks</div>
              </div>
              <button onClick={() => setShowConfirm(false)} className="icon-btn" aria-label="Close"><Icon.close /></button>
            </div>
            <div className="modal-b">
              <div className="tiny muted">
                Running a live SERP lookup for <strong>“{keyword.trim()}”</strong> queries Google in real time and
                will consume <strong>{LIVE_CHECK_COST} of your daily checks</strong>. This can’t be undone.
              </div>
            </div>
            <div className="modal-f">
              <button className="btn" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className="btn primary" onClick={() => void runCheck()}>
                <Icon.zap /> Use {LIVE_CHECK_COST} checks
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

const FEAT_LABELS: Record<string, string> = {
  AI: "AI", FS: "Featured", PAA: "PAA", VID: "Video", IMG: "Images", LOCAL: "Local", KG: "Knowledge",
}
function featLabel(code: string): string {
  return FEAT_LABELS[code] ?? code
}
