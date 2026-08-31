"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/lib/auth"
import { api, ApiError } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"
import { setProjectCrumb } from "@/components/dashboard/crumb-store"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { Button } from "@/components/ui/button"
import { PosCell, Sparkline, trendToSparkline, type MonthlySearch } from "@/components/dashboard/primitives"
import { StatCard } from "@/components/dashboard/stat-card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { AiOverviewPanel } from "@/components/dashboard/ai-overview-panel"
import { Favicon } from "@/components/favicon"
import { useEngines, engineOf, DEFAULT_ENGINE } from "@/hooks/use-engines"

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
  /** True only when this check read from position 1 and still didn't find the
      domain — i.e. absence was actually established, not merely unconfirmed. */
  notInTop?: boolean
  /** How deep this check looked. Free plans crawl to the trialCheckDepth admin
      setting rather than 100, so a missing position must be labelled with this. */
  depthSearched?: number | null
  /** Non-null when `competitors` were CARRIED FORWARD from an earlier check
      rather than observed by this one (a windowed fetch skips the top of the
      SERP and has no competitor data of its own). Holds that earlier check's
      timestamp, so the SERP tab can date them instead of implying they're current. */
  carriedFromAt?: string | null
  checkedAt: string
}

interface HistoryEntry {
  id: string
  position: number | null
  change: number | null
  monthlyTraffic: number | null
  revenueLoss: number | null
  depthSearched?: number | null
  checkedAt: string
}

interface KeywordDetail {
  id: string
  keyword: string
  location: string
  /** Set on sub-country keywords ("Austin,Texas,United States"); null = country. */
  locationLabel?: string | null
  locationCountry?: string | null
  device?: string
  /** Engine of THIS row. Absent on older responses; treated as Google. */
  engine?: string | null
  addedAt: string
  project: { id: string; name: string; domain: string }
  searchVolume?: number | null
  searchVolumeTrend?: MonthlySearch[] | null
  latestCheck: LatestCheck | null
  history: HistoryEntry[]
  /**
   * Every engine tracking this same keyword/market/device, keyed by engine id —
   * each engine is its own row with its own history, so this is what lets the
   * chart draw one line per engine instead of interleaving them into one.
   * Always contains at least this row's own engine.
   */
  historyByEngine?: Record<string, HistoryEntry[]>
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

type Tab = "overview" | "serp" | "aio" | "history"

const TABS: Tab[] = ["overview", "serp", "aio", "history"]

/** ?tab= deep link, so a shared URL can land straight on a given tab (e.g.
 *  ?tab=aio for the citations panel). Unrecognised or absent → overview. */
function tabFromParam(raw: string | null): Tab {
  return TABS.includes(raw as Tab) ? (raw as Tab) : "overview"
}

export default function KeywordDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()

  // Project id and keyword id both come from the route path now —
  // /dashboard/project/[id]/keywords/[kwId] — no query strings.
  const projectId = params.id as string
  const kwId = params.kwId as string

  const [data, setData] = useState<KeywordDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [tab, setTab] = useState<Tab>(() => tabFromParam(searchParams.get("tab")))
  const [historyPage, setHistoryPage] = useState(1)
  const { engines: availableEngines } = useEngines()
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

  const { keyword, location, locationLabel, device, addedAt, project, latestCheck, history } = data
  // `location` is a bare DataForSEO code below country level, so uppercasing it
  // yields "1026201". The label is the only readable form; strip the trailing
  // country because it is redundant next to the project's own market.
  const marketLabel = locationLabel
    ? locationLabel.split(",").slice(0, -1).join(", ") || locationLabel
    : location.toUpperCase()

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
  // How deep the latest check actually looked. Free plans crawl to the
  // trialCheckDepth admin setting, so "100+" was a lie for them; fall back to
  // 100 only for rows written before the depth was recorded.
  const notFoundDepth =
    latestCheck?.depthSearched && latestCheck.depthSearched > 0 ? latestCheck.depthSearched : 100
  const totalSerpPages = Math.ceil(competitors.length / ITEMS_PER_PAGE)
  const startSerpIndex = (serpPage - 1) * ITEMS_PER_PAGE
  const paginatedCompetitors = competitors.slice(startSerpIndex, startSerpIndex + ITEMS_PER_PAGE)

  const totalHistoryPages = Math.ceil(history.length / ITEMS_PER_PAGE)
  const startHistoryIndex = (historyPage - 1) * ITEMS_PER_PAGE
  const paginatedHistory = history.slice(startHistoryIndex, startHistoryIndex + ITEMS_PER_PAGE)

  // Build chart data from history. Sort oldest-first so the line reads
  // left-to-right and reuse the dashboard's LineChart helper.
  const thisEngine = engineOf(data)
  // Labels come from the registry so the legend says "Google"/"Bing" rather than
  // the raw ids, and a future engine needs no change here.
  const engineLabels: Record<string, string> = Object.fromEntries(
    availableEngines.map((e) => [e.id, e.label]),
  )

  // One series per engine, pivoted onto a shared timeline.
  //
  // Engines must never share a line. Google rank 4 and Bing rank 19 plotted as
  // one series reads as a catastrophic drop, and it is a plausible-looking lie
  // rather than an obvious glitch — so each engine gets its own dataKey and any
  // timestamp an engine has no check for stays UNDEFINED. Undefined leaves a gap;
  // 0 would draw a line plunging to the top of a reversed axis, which is the very
  // false-crash reading this exists to prevent.
  const byEngine: Record<string, HistoryEntry[]> =
    data.historyByEngine && Object.keys(data.historyByEngine).length > 0
      ? data.historyByEngine
      : { [thisEngine]: history }

  // Google first so it keeps the primary colour and the legend order is stable.
  const chartEngines = Object.keys(byEngine).sort((a, b) =>
    a === DEFAULT_ENGINE ? -1 : b === DEFAULT_ENGINE ? 1 : a.localeCompare(b),
  )

  const chartData = (() => {
    const rows = new Map<number, Record<string, number>>()
    for (const engineId of chartEngines) {
      for (const h of (byEngine[engineId] ?? []).filter((x) => x.position != null).slice(0, 60)) {
        const ts = new Date(h.checkedAt).getTime()
        const row = rows.get(ts) ?? {}
        row[engineId] = h.position as number
        rows.set(ts, row)
      }
    }
    return [...rows.entries()]
      .sort(([a], [b]) => a - b)
      // checkedAt rides along so the axis and tooltip can say WHEN, rather than
      // numbering the checks "1, 2, 3" and leaving the reader to guess whether
      // that was yesterday or last month.
      .map(([ts, positions], i) => ({ day: i, ts, ...positions }))
  })()

  // Distinct, colour-blind-safe hues. Google keeps var(--primary) so nothing
  // changes visually for the overwhelming majority of users, who track it alone.
  const ENGINE_COLORS = ["var(--primary)", "#d97706", "#7c3aed", "#0891b2"]
  const chartConfig = Object.fromEntries(
    chartEngines.map((id, i) => [
      id,
      {
        // With one engine the tooltip keeps saying "Position", exactly as it did
        // before this feature existed. Naming the engine is only informative
        // once there is another engine to tell it apart from — otherwise every
        // Google-only user sees a gratuitous change.
        label: chartEngines.length > 1 ? (engineLabels[id] ?? id) : "Position",
        color: ENGINE_COLORS[i % ENGINE_COLORS.length],
      },
    ]),
  )

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
            {marketLabel} · {(device ?? "desktop").toUpperCase()}
            {/* Only when more than one engine is offered — otherwise every page
                would gain a redundant "GOOGLE" for a distinction that does not
                exist yet. */}
            {availableEngines.length > 1 && ` · ${(engineLabels[thisEngine] ?? thisEngine).toUpperCase()}`}
            {" · "}Added{" "}
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
        <button className={"tab " + (tab === "aio" ? "active" : "")} onClick={() => setTab("aio")}>
          AI Overview
        </button>
        <button className={"tab " + (tab === "history" ? "active" : "")} onClick={() => setTab("history")}>
          History {history.length > 0 && <span className="muted" style={{ marginLeft: 4 }}>({history.length})</span>}
        </button>
      </div>

      {tab === "overview" && (
        <>
          {/* The same StatCard the Overview and the project page use, so a
              figure is presented identically wherever it appears — and so each
              one carries an explanation rather than a bare label. */}
          <div className="mb-3.5 grid grid-cols-2 gap-3.5 md:grid-cols-4">
            <StatCard
              label="Position"
              hint={`Where this keyword ranks on Google right now. Anything below the top ${notFoundDepth} shows as ${notFoundDepth}+.`}
              value={
                inFlight
                  ? "—"
                  : latestCheck?.position != null
                    ? `#${latestCheck.position}`
                    : `${notFoundDepth}+`
              }
              caption={
                <span className="flex items-center gap-2">
                  <ChangeCell change={latestCheck?.change ?? null} />
                  {latestCheck?.previousPos != null && <span>from #{latestCheck.previousPos}</span>}
                </span>
              }
              fill={null}
            />
            <StatCard
              label="1-day change"
              hint="How the position has moved since yesterday. A positive number means it improved."
              value={<ChangeCell change={d1} />}
              caption="vs ~24 hours ago"
              fill={null}
            />
            <StatCard
              label="7-day change"
              hint="How the position has moved over the past week. Steadier than the daily figure."
              value={<ChangeCell change={d7} />}
              caption="vs ~7 days ago"
              fill={null}
            />
            <StatCard
              label="Search volume"
              hint="How many people search this keyword each month in its country."
              value={data.searchVolume != null ? data.searchVolume.toLocaleString() : "—"}
              tone={data.searchVolume ? undefined : "text-muted-foreground/50"}
              caption={
                volTrend.length > 0 ? <Sparkline data={volTrend} /> : "/mo · trend builds over time"
              }
              fill={null}
            />
            <StatCard
              label="Monthly traffic"
              hint="How many visits this keyword is likely bringing you each month."
              value={latestCheck?.monthlyTraffic != null ? latestCheck.monthlyTraffic.toLocaleString() : "—"}
              tone={latestCheck?.monthlyTraffic ? undefined : "text-muted-foreground/50"}
              caption="visits per month"
              fill={null}
            />
            <StatCard
              label="Last checked"
              hint="When this keyword was last checked. Checks run on your project's schedule, or whenever you run one."
              value={
                latestCheck?.checkedAt
                  ? new Date(latestCheck.checkedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
                  : "Never"
              }
              caption={
                latestCheck?.checkedAt
                  ? new Date(latestCheck.checkedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                  : "Run a check from the project page"
              }
              fill={null}
            />
            <StatCard
              label="SERP features"
              hint="How many competitor pages are showing in the search results for this keyword."
              value={competitors.length}
              tone={competitors.length ? undefined : "text-muted-foreground/50"}
              caption="competitor pages ranked"
              fill={null}
            />
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
              {/* shadcn's chart container over Recharts, the same components
                  the Overview's position card uses — rather than the
                  hand-rolled SVG that was here, which had no dates on the x
                  axis and drew its own tooltip.

                  Height is 220 and the fill is light on purpose: a keyword
                  parked at #1 is a flat line at the top of its domain, so a
                  heavy gradient under it filled the whole card with a blue
                  block and buried the one thing worth reading. */}
              <ChartContainer config={chartConfig} className="!aspect-auto h-[200px] w-full">
                {/* A LINE, not an area.
                    On a reversed axis an <Area> fills toward the axis baseline,
                    which is now ABOVE the data — so the gradient hung over the
                    line as a floating block instead of sitting under it. A rank
                    history needs no fill to be readable, and dropping it removes
                    the whole class of problem rather than tuning a baseline. */}
                <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 4 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="ts"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={32}
                    tickFormatter={(v) =>
                      new Date(Number(v)).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                    }
                  />
                  {/* Reversed, because a lower number is a better rank — the
                      line has to climb when the keyword improves. allowDecimals
                      off: there is no position #2.5, and letting Recharts pick
                      fractional ticks is what printed "#2" twice before. */}
                  {/* Reversed, because a lower number is a better rank — the
                      line has to climb when the keyword improves.

                      The domain is clamped at 1: "dataMin - 1" on a keyword at
                      #1 asked for position #0, which does not exist, and left
                      the line sitting in the lower half under an empty band.
                      allowDecimals off for the same reason there is no #2.5. */}
                  <YAxis
                    reversed
                    allowDecimals={false}
                    width={40}
                    tickLine={false}
                    axisLine={false}
                    domain={[
                      (min: number) => Math.max(1, Math.floor(min) - 1),
                      (max: number) => Math.ceil(max) + 1,
                    ]}
                    tickFormatter={(v) => `#${v}`}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(_, pl) =>
                          new Date(Number(pl?.[0]?.payload?.ts)).toLocaleString("en-IN", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        }
                        formatter={(v) => [`#${v}`, " Position"]}
                      />
                    }
                  />
                  <Line
                    dataKey={chartEngines[0]}
                    type="monotone"
                    stroke={`var(--color-${chartEngines[0]})`}
                    strokeWidth={2}
                    dot={{ r: 3, strokeWidth: 2, fill: "var(--bg)", stroke: `var(--color-${chartEngines[0]})` }}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                    // A missing check must break the line, not bridge it: joining
                    // across a gap invents a trend that was never measured.
                    connectNulls={false}
                  />
                  {chartEngines.slice(1).map((id) => (
                    <Line
                      key={id}
                      dataKey={id}
                      type="monotone"
                      stroke={`var(--color-${id})`}
                      strokeWidth={2}
                      dot={{ r: 3, strokeWidth: 2, fill: "var(--bg)", stroke: `var(--color-${id})` }}
                      activeDot={{ r: 5 }}
                      isAnimationActive={false}
                      connectNulls={false}
                    />
                  ))}
                </LineChart>
              </ChartContainer>
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
                  ? `${competitors.length} ranking page${competitors.length === 1 ? "" : "s"} for this keyword`
                  : "Top ranking pages for this keyword"}
              </div>
              {/* The latest check read only a slice of the SERP (a windowed
                  fetch, which skips the top), so these rivals were carried
                  forward from an earlier check. Say so — the position above IS
                  current, but these rows are not, and silently presenting them
                  as today's SERP is what makes people act on stale data. */}
              {latestCheck?.carriedFromAt && (
                <div
                  className="tiny"
                  style={{ marginTop: 4, color: "var(--warn)" }}
                  title="This check measured your position without re-reading the top of the SERP, so the competitor list below is from the date shown."
                >
                  Competitors as of{" "}
                  {new Date(latestCheck.carriedFromAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                  {" — not re-checked today"}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Range and arrows in the header, the same pager the Search
                  Console tables use. It used to be a First/Prev/Next/Last row
                  buried under the results, so paging a hundred of them meant
                  scrolling to the bottom, clicking, and scrolling back up. */}
              {totalSerpPages > 1 && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    {startSerpIndex + 1}–
                    {Math.min(startSerpIndex + ITEMS_PER_PAGE, competitors.length)} of{" "}
                    {competitors.length}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-7"
                    disabled={serpPage === 1}
                    onClick={() => setSerpPage((p) => Math.max(1, p - 1))}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="size-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-7"
                    disabled={serpPage === totalSerpPages}
                    onClick={() => setSerpPage((p) => Math.min(totalSerpPages, p + 1))}
                    aria-label="Next page"
                  >
                    <ChevronRight className="size-3.5" />
                  </Button>
                </div>
              )}
              {competitors.length > 0 && (
                <button className="btn sm" onClick={handleExportSERP}>
                  <Icon.download /> Export CSV
                </button>
              )}
            </div>
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

              {/* The pager lives in the header — see there. Repeating it down
                  here would be two controls for one list. */}
            </>
          ) : (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
              No SERP data yet. Run a check from the project page to populate this view.
            </div>
          )}
        </div>
      )}

      {/* The organic results go in so the panel can say which cited sources
          also rank, and where — the page already has them for the SERP tab. */}
      {tab === "aio" && (
        <AiOverviewPanel
          projectId={projectId}
          keywordId={kwId}
          projectDomain={project.domain}
          organic={competitors.map((c) => ({ position: c.position, domain: c.domain }))}
        />
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
                {history.length} check{history.length === 1 ? "" : "s"} · newest first
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
                  {/* Same header pager as the SERP tab and the Search Console
                      tables, rather than a First/Prev/Next/Last row under the
                      table that has to be scrolled to and scrolled back from. */}
                  {totalHistoryPages > 1 && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="tabular-nums">
                        {startHistoryIndex + 1}–
                        {Math.min(startHistoryIndex + ITEMS_PER_PAGE, history.length)} of{" "}
                        {history.length}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-7"
                        disabled={historyPage === 1}
                        onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="size-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-7"
                        disabled={historyPage === totalHistoryPages}
                        onClick={() => setHistoryPage((p) => Math.min(totalHistoryPages, p + 1))}
                        aria-label="Next page"
                      >
                        <ChevronRight className="size-3.5" />
                      </Button>
                    </div>
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
                          <PosCell position={h.position} depthSearched={h.depthSearched} />
                        </td>
                        <td><ChangeCell change={h.change} /></td>
                        <td className="tabular">{h.monthlyTraffic?.toLocaleString() ?? "—"}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>

              {/* Pager is in the header — see there. */}
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
