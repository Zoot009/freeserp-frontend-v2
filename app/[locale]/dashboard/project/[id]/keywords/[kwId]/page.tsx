"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth"
import { api, ApiError } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"
import { setProjectCrumb } from "@/components/dashboard/crumb-store"
import { LineChart, PosCell, Sparkline, trendToSparkline, type MonthlySearch } from "@/components/dashboard/primitives"
import { Favicon } from "@/components/favicon"

interface Competitor {
  position: number
  domain: string
  url: string
  title: string
  snippet: string
}

interface LatestCheck {
  position: number | null
  url: string | null
  change: number | null
  previousPos: number | null
  competitors: Competitor[] | null
  monthlyTraffic: number | null
  revenueLoss: number | null
  status: string
  checkedAt: string
}

interface HistoryEntry {
  id: string
  position: number | null
  change: number | null
  monthlyTraffic: number | null
  revenueLoss: number | null
  checkedAt: string
}

interface KeywordDetail {
  id: string
  keyword: string
  location: string
  device?: string
  addedAt: string
  project: { id: string; name: string; domain: string }
  searchVolume?: number | null
  searchVolumeTrend?: MonthlySearch[] | null
  latestCheck: LatestCheck | null
  history: HistoryEntry[]
  // Effective status including an in-flight SerpTask: PENDING/PROCESSING while
  // a check is running, COMPLETED/FAILED/null otherwise.
  inFlightStatus?: string | null
}

function downloadCSV(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n")
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Backend stores `change = previousPos - position`, so the sign reads as:
//   > 0 → position NUMBER went DOWN → ranking IMPROVED → green
//   < 0 → position NUMBER went UP   → ranking DROPPED → red
function ChangeCell({ change }: { change: number | null }) {
  if (change == null || !Number.isFinite(change) || change === 0) {
    return <span className="delta-cell flat" title="No previous check to compare against">—</span>
  }
  const improved = change > 0
  const delta = Math.abs(change)
  return (
    <span
      className={"delta-cell " + (improved ? "up" : "down")}
      title={improved
        ? `Ranking improved — moved up ${delta} position${delta === 1 ? "" : "s"}`
        : `Ranking dropped — moved down ${delta} position${delta === 1 ? "" : "s"}`}
    >
      {improved ? <Icon.arrowUp /> : <Icon.arrowDown />}{delta}
    </span>
  )
}

// Position delta vs the most recent check at least `days` old. History is sorted
// newest-first; `change` is `pastPos - currentPos` so >0 = improved (matches the
// backend convention used by ChangeCell).
function deltaOver(
  history: { position: number | null; checkedAt: string }[],
  current: number | null,
  days: number,
): number | null {
  if (current == null) return null
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  const past = history.find((h) => h.position != null && new Date(h.checkedAt).getTime() <= cutoff)
  return past?.position != null ? past.position - current : null
}

type Tab = "overview" | "serp" | "history"

export default function KeywordDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  // Project id and keyword id both come from the route path now —
  // /dashboard/project/[id]/keywords/[kwId] — no query strings.
  const projectId = params.id as string
  const kwId = params.kwId as string

  const [data, setData] = useState<KeywordDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [tab, setTab] = useState<Tab>("overview")
  const [historyPage, setHistoryPage] = useState(1)
  const [serpPage, setSerpPage] = useState(1)
  const ITEMS_PER_PAGE = 10

  useEffect(() => {
    if (!authLoading && !user) router.push("/login")
  }, [user, authLoading, router])

  // Feed the topbar breadcrumb the real project name instead of "Project" —
  // covers hard refreshes directly on this page.
  useEffect(() => {
    if (data?.project) setProjectCrumb(data.project.id, data.project.name || data.project.domain)
  }, [data])

  // Fetch keyword detail via the shared client — it carries the access token,
  // refreshes it on 401, and runs in parallel with useAuth()'s /me round-trip.
  const fetchDetail = useCallback(async (): Promise<KeywordDetail | null> => {
    if (!kwId || !projectId) return null
    try {
      return await api.get<KeywordDetail>(`/api/projects/${projectId}/keywords/${kwId}/detail`)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.push("/login")
        return null
      }
      throw err
    }
  }, [kwId, projectId, router])

  useEffect(() => {
    let cancelled = false
    fetchDetail()
      .then((d) => { if (!cancelled && d) setData(d) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [fetchDetail])

  // Poll while a check is in flight so the page reflects status without manual
  // refresh. Stops once the status is terminal.
  useEffect(() => {
    const s = data?.inFlightStatus
    if (s !== "PENDING" && s !== "PROCESSING") return
    const timer = setInterval(() => {
      fetchDetail().then((d) => { if (d) setData(d) }).catch(() => undefined)
    }, 3000)
    return () => clearInterval(timer)
  }, [data?.inFlightStatus, fetchDetail])

  if (loading) {
    return (
      <div className="page" style={{ color: "var(--text-mute)", fontSize: 13, padding: 60, textAlign: "center" }}>
        Loading keyword…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="page" style={{ padding: 60, textAlign: "center" }}>
        <div style={{ color: "var(--neg)", fontSize: 13, marginBottom: 12 }}>{error || "Keyword not found"}</div>
        <button className="btn sm" onClick={() => router.back()}>← Go back</button>
      </div>
    )
  }

  const { keyword, location, device, addedAt, project, latestCheck, history } = data

  // 1-day / 7-day position movement + the search-volume trend — these used to be
  // table columns; they now live here on the detail page.
  const d1 = deltaOver(history, latestCheck?.position ?? null, 1)
  const d7 = deltaOver(history, latestCheck?.position ?? null, 7)
  const volTrend = trendToSparkline(data.searchVolumeTrend ?? null)

  const handleExportSERP = () => {
    downloadCSV(`serp-${keyword.replace(/\s+/g, "_")}.csv`, [
      ["Position", "Title", "Domain", "URL", "Snippet"],
      ...(latestCheck?.competitors ?? []).map((c) => [
        String(c.position), c.title, c.domain, c.url, c.snippet,
      ]),
    ])
  }

  const handleExportHistory = () => {
    downloadCSV(`history-${keyword.replace(/\s+/g, "_")}.csv`, [
      ["Date", "Position", "Change", "Monthly Traffic", "Revenue Loss"],
      ...history.map((h) => [
        new Date(h.checkedAt).toLocaleString(),
        String(h.position ?? "N/A"),
        String(h.change ?? "--"),
        String(h.monthlyTraffic ?? "--"),
        String(h.revenueLoss ?? "--"),
      ]),
    ])
  }

  const competitors = latestCheck?.competitors || []
  const totalSerpPages = Math.ceil(competitors.length / ITEMS_PER_PAGE)
  const startSerpIndex = (serpPage - 1) * ITEMS_PER_PAGE
  const paginatedCompetitors = competitors.slice(startSerpIndex, startSerpIndex + ITEMS_PER_PAGE)

  const totalHistoryPages = Math.ceil(history.length / ITEMS_PER_PAGE)
  const startHistoryIndex = (historyPage - 1) * ITEMS_PER_PAGE
  const paginatedHistory = history.slice(startHistoryIndex, startHistoryIndex + ITEMS_PER_PAGE)

  // Build chart data from history. Sort oldest-first so the line reads
  // left-to-right and reuse the dashboard's LineChart helper.
  const chartData = history.length > 0
    ? [...history]
        .filter((h) => h.position != null)
        .slice(0, 60)
        .reverse()
        .map((h, i) => ({ day: i, pos: h.position as number }))
    : []

  const inFlight = data.inFlightStatus === "PENDING" || data.inFlightStatus === "PROCESSING"

  return (
    <div className="page">
      <button onClick={() => router.back()} className="kd-back" type="button">
        ← Back
      </button>

      <div className="page-h" style={{ alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ wordBreak: "break-word" }}>{keyword}</h1>
          <div className="sub">
            {location.toUpperCase()} · {(device ?? "desktop").toUpperCase()} · Added{" "}
            {new Date(addedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
            {inFlight && (
              <>
                {" · "}
                <span style={{ color: "var(--brand)" }}>
                  <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--brand)", marginRight: 6, animation: "shim 1.4s ease-in-out infinite" }} />
                  Checking ranking…
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={"tab " + (tab === "overview" ? "active" : "")} onClick={() => setTab("overview")}>
          Overview
        </button>
        <button className={"tab " + (tab === "serp" ? "active" : "")} onClick={() => setTab("serp")}>
          SERP results {competitors.length > 0 && <span className="muted" style={{ marginLeft: 4 }}>({competitors.length})</span>}
        </button>
        <button className={"tab " + (tab === "history" ? "active" : "")} onClick={() => setTab("history")}>
          History {history.length > 0 && <span className="muted" style={{ marginLeft: 4 }}>({history.length})</span>}
        </button>
      </div>

      {tab === "overview" && (
        <>
          {/* STAT TILES */}
          <div className="grid g-4" style={{ marginBottom: 14 }}>
            <div className="stat">
              <div className="lbl">Position</div>
              <div className="val tabular">
                {inFlight
                  ? "—"
                  : latestCheck?.position != null
                    ? `#${latestCheck.position}`
                    : "100+"}
              </div>
              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                <ChangeCell change={latestCheck?.change ?? null} />
                {latestCheck?.previousPos != null && (
                  <span className="tiny muted">from #{latestCheck.previousPos}</span>
                )}
              </div>
            </div>
            <div className="stat">
              <div className="lbl">1-day change</div>
              <div className="val" style={{ fontSize: 18 }}><ChangeCell change={d1} /></div>
              <span className="tiny muted">vs ~24 hours ago</span>
            </div>
            <div className="stat">
              <div className="lbl">7-day change</div>
              <div className="val" style={{ fontSize: 18 }}><ChangeCell change={d7} /></div>
              <span className="tiny muted">vs ~7 days ago</span>
            </div>
            <div className="stat">
              <div className="lbl">Search volume</div>
              <div className="val tabular">
                {data.searchVolume != null ? data.searchVolume.toLocaleString() : "—"}
              </div>
              {volTrend.length > 0 ? (
                <div style={{ marginTop: 4 }}><Sparkline data={volTrend} /></div>
              ) : (
                <span className="tiny muted">/mo · trend builds over time</span>
              )}
            </div>
            <div className="stat">
              <div className="lbl">Monthly traffic</div>
              <div className="val tabular">
                {latestCheck?.monthlyTraffic != null ? latestCheck.monthlyTraffic.toLocaleString() : "—"}
              </div>
              <span className="tiny muted">modelled from position × volume</span>
            </div>
            <div className="stat">
              <div className="lbl">Last checked</div>
              <div className="val" style={{ fontSize: 18 }}>
                {latestCheck?.checkedAt
                  ? new Date(latestCheck.checkedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
                  : "Never"}
              </div>
              <span className="tiny muted">
                {latestCheck?.checkedAt
                  ? new Date(latestCheck.checkedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                  : "Run a check from the project page"}
              </span>
            </div>
            <div className="stat">
              <div className="lbl">SERP features</div>
              <div className="val" style={{ fontSize: 18 }}>{competitors.length}</div>
              <span className="tiny muted">competitor pages ranked</span>
            </div>
          </div>

          {/* Rank chart */}
          {chartData.length > 1 && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="card-h">
                <div>
                  <div className="t">Rank history</div>
                  <div className="tiny muted" style={{ marginTop: 2 }}>
                    {chartData.length} check{chartData.length === 1 ? "" : "s"} · oldest to newest
                  </div>
                </div>
              </div>
              <LineChart
                data={chartData}
                invert
                yFormat={(v) => "#" + Math.round(v)}
                height={240}
              />
            </div>
          )}

          {/* Ranking URL */}
          {latestCheck?.url && (
            <div className="card">
              <div className="card-h">
                <div className="t">Ranking URL</div>
                <a
                  href={latestCheck.url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn sm"
                >
                  Open <Icon.chevR />
                </a>
              </div>
              <a
                href={latestCheck.url}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "block",
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  color: "var(--brand)",
                  wordBreak: "break-all",
                }}
              >
                {latestCheck.url}
              </a>
            </div>
          )}
        </>
      )}

      {tab === "serp" && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            className="card-h"
            style={{ padding: "16px 18px", marginBottom: 0, borderBottom: "1px solid var(--border)" }}
          >
            <div>
              <div className="t">SERP results</div>
              <div className="tiny muted" style={{ marginTop: 2 }}>
                {competitors.length > 0
                  ? `Showing ${startSerpIndex + 1}–${Math.min(startSerpIndex + ITEMS_PER_PAGE, competitors.length)} of ${competitors.length}`
                  : "Top ranking pages for this keyword"}
              </div>
            </div>
            {competitors.length > 0 && (
              <button className="btn sm" onClick={handleExportSERP}>
                <Icon.download /> Export CSV
              </button>
            )}
          </div>

          {competitors.length > 0 ? (
            <>
              <div className="cmp-list">
              {paginatedCompetitors.map((c) => {
                const normalizedProject = project.domain.replace(/^www\./, "").toLowerCase()
                const normalizedResult = c.domain.replace(/^www\./, "").toLowerCase()
                const isOwnSite =
                  normalizedResult === normalizedProject || normalizedResult.endsWith(`.${normalizedProject}`)
                // Build a breadcrumb-style URL like Google ("example.com › path › ›")
                // from the raw URL. Stripping the protocol + splitting on `/`
                // gives a short, decoded trail that reads cleanly.
                let breadcrumb = c.url.replace(/^https?:\/\//, "")
                try {
                  const u = new URL(c.url)
                  const parts = u.pathname.split("/").filter(Boolean).slice(0, 3)
                  const decoded = parts.map((p) => {
                    try { return decodeURIComponent(p) } catch { return p }
                  })
                  breadcrumb = decoded.length > 0
                    ? `${u.hostname.replace(/^www\./, "")} › ${decoded.join(" › ")}`
                    : u.hostname.replace(/^www\./, "")
                } catch { /* keep the stripped fallback */ }

                const host = c.domain.replace(/^www\./, "").toLowerCase()
                return (
                  <div
                    key={c.position + c.url}
                    className="cmp-card static"
                    style={isOwnSite ? { borderColor: "var(--brand)", background: "var(--brand-soft)" } : undefined}
                  >
                    <div className="body">
                      <div className="url-line" style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-sans)" }}>
                        <Favicon domain={c.domain} fallbackColor={isOwnSite ? "var(--brand)" : undefined} />
                        <div style={{ minWidth: 0, lineHeight: 1.25 }}>
                          <div style={{ fontSize: 13, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {host}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                            <span style={{ fontSize: 12, color: "var(--text-mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {breadcrumb}
                            </span>
                            <a
                              href={c.url}
                              target="_blank"
                              rel="noreferrer"
                              className="cmp-open"
                              title="Open page in a new tab"
                              aria-label={`Open ${host} in a new tab`}
                              style={{ display: "inline-flex", flexShrink: 0, color: "var(--text-mute)" }}
                            >
                              <Icon.external size={12} />
                            </a>
                          </div>
                        </div>
                        {isOwnSite && (
                          <span className="chip brand" style={{ marginLeft: 4, fontSize: 10 }} title="Your site">
                            Your site
                          </span>
                        )}
                      </div>
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className="title"
                        style={{
                          display: "inline-block",
                          color: "var(--brand)",
                          textDecoration: "none",
                          fontSize: 16,
                          lineHeight: 1.3,
                          marginBottom: 4,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                        onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                      >
                        {c.title || c.url}
                      </a>
                      {c.snippet && <div className="desc">{c.snippet}</div>}
                    </div>
                    <span className={"cmp-rank" + (c.position <= 3 ? " top" : "")} title={`Ranks #${c.position}`}>
                      #{c.position}
                    </span>
                  </div>
                )
              })}
              </div>

              {totalSerpPages > 1 && (
                <div className="row" style={{ justifyContent: "space-between", padding: "12px 18px", gap: 8, borderTop: "1px solid var(--border)" }}>
                  <div className="tiny muted">Page {serpPage} of {totalSerpPages}</div>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn sm" onClick={() => setSerpPage(1)} disabled={serpPage === 1}>First</button>
                    <button className="btn sm" onClick={() => setSerpPage((p) => Math.max(1, p - 1))} disabled={serpPage === 1}>Prev</button>
                    <button className="btn sm" onClick={() => setSerpPage((p) => Math.min(totalSerpPages, p + 1))} disabled={serpPage === totalSerpPages}>Next</button>
                    <button className="btn sm" onClick={() => setSerpPage(totalSerpPages)} disabled={serpPage === totalSerpPages}>Last</button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
              No SERP data yet. Run a check from the project page to populate this view.
            </div>
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            className="card-h"
            style={{ padding: "16px 18px", marginBottom: 0, borderBottom: "1px solid var(--border)" }}
          >
            <div>
              <div className="t">Rank history</div>
              <div className="tiny muted" style={{ marginTop: 2 }}>
                Showing {history.length > 0 ? startHistoryIndex + 1 : 0}–{Math.min(startHistoryIndex + ITEMS_PER_PAGE, history.length)} of {history.length}
              </div>
            </div>
            {history.length > 0 && (() => {
              const histPositions = history.map((h) => h.position).filter((p): p is number => p != null)
              const best = histPositions.length ? Math.min(...histPositions) : null
              const worst = histPositions.length ? Math.max(...histPositions) : null
              return (
                <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
                  {best != null && (
                    <span className="tiny muted" style={{ whiteSpace: "nowrap" }}>
                      Best <span className="b tabular" style={{ color: "var(--pos)" }}>#{best}</span>
                    </span>
                  )}
                  {worst != null && worst !== best && (
                    <span className="tiny muted" style={{ whiteSpace: "nowrap" }}>
                      Worst <span className="b tabular" style={{ color: "var(--text)" }}>#{worst}</span>
                    </span>
                  )}
                  <button className="btn sm" onClick={handleExportHistory}>
                    <Icon.download /> Export CSV
                  </button>
                </div>
              )
            })()}
          </div>

          {history.length > 0 ? (
            <>
              <div className="tbl-scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 260 }}>Date</th>
                    <th style={{ width: 130 }}>Position</th>
                    <th style={{ width: 120 }}>Change</th>
                    <th>Monthly traffic</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedHistory.map((h, i) => {
                    const isLatest = i === 0 && historyPage === 1
                    const d = new Date(h.checkedAt)
                    return (
                      <tr key={h.id} style={isLatest ? { background: "var(--bg-sub)" } : undefined}>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <span className="tabular" style={{ fontWeight: 500 }}>
                            {d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                          </span>
                          <span className="tiny muted tabular" style={{ marginLeft: 8 }}>
                            {d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {isLatest && (
                            <span className="chip pos" style={{ marginLeft: 10 }}>Latest</span>
                          )}
                        </td>
                        <td>
                          <PosCell position={h.position} />
                        </td>
                        <td><ChangeCell change={h.change} /></td>
                        <td className="tabular">{h.monthlyTraffic?.toLocaleString() ?? "—"}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>

              {totalHistoryPages > 1 && (
                <div className="row" style={{ justifyContent: "space-between", padding: "12px 18px", gap: 8 }}>
                  <div className="tiny muted">Page {historyPage} of {totalHistoryPages}</div>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn sm" onClick={() => setHistoryPage(1)} disabled={historyPage === 1}>First</button>
                    <button className="btn sm" onClick={() => setHistoryPage((p) => Math.max(1, p - 1))} disabled={historyPage === 1}>Prev</button>
                    <button className="btn sm" onClick={() => setHistoryPage((p) => Math.min(totalHistoryPages, p + 1))} disabled={historyPage === totalHistoryPages}>Next</button>
                    <button className="btn sm" onClick={() => setHistoryPage(totalHistoryPages)} disabled={historyPage === totalHistoryPages}>Last</button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
              No rank history yet.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
