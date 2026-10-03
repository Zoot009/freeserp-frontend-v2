"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { Link, useRouter } from "@/i18n/navigation"
import { useAuth } from "@/lib/auth"
import { api, ApiError } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"
import { DeltaCell, LineChart } from "@/components/dashboard/primitives"
import {
  BlockChip,
  SnapshotTable,
  VideoMetaCell,
  VideoThumb,
  VolatilityNote,
  formatViews,
  YtPosCell,
  type YtSnapshotItem,
} from "@/components/dashboard/youtube"

interface HistoryPoint {
  id: string
  depth: number
  notInTop: boolean
  bestVideoPosition: number | null
  bestRankAbsolute: number | null
  ownedCount: number
  change: number | null
  topVideoTitle: string | null
  topVideoUrl: string | null
  topChannelName: string | null
  topBlockName: string | null
  topItemType: string | null
  topViews: number | null
  topPublishedAt: string | null
  topDurationSeconds: number | null
  adsCount: number
  checkUrl: string | null
  status: string
  checkedAt: string
}

interface OwnedResult {
  id: string
  rankAbsolute: number
  videoPosition: number | null
  itemType: string
  blockName: string | null
  videoId: string | null
  url: string | null
  title: string | null
  channelName: string | null
  views: number | null
  publishedAt: string | null
  durationSeconds: number | null
  durationTime: string | null
  matchStrategy: string
}

interface DetailResponse {
  keyword: {
    id: string
    keyword: string
    locationLabel: string
    languageCode: string
    depth: number
    lastCheckedAt: string | null
  }
  project: { id: string; name: string; targetType: "CHANNEL" | "VIDEO"; targetLabel: string | null }
  status: string | null
  latestCheck: (HistoryPoint & { results: OwnedResult[] }) | null
  history: HistoryPoint[]
}

interface SnapshotResponse {
  checkId: string
  keyword: string
  checkedAt: string
  depth: number
  notInTop: boolean
  adsCount: number
  checkUrl: string | null
  truncated: boolean
  ownedRanks: number[]
  items: YtSnapshotItem[]
}

type Tab = "history" | "serp" | "owned"
const TABS: Tab[] = ["owned", "serp", "history"]

const shortDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })

export default function YoutubeKeywordDetailPage() {
  const params = useParams<{ id: string; kwId: string }>()
  const { id: projectId, kwId } = params
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const [data, setData] = useState<DetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [tab, setTabState] = useState<Tab>(() => {
    const t = searchParams.get("tab") as Tab
    return TABS.includes(t) ? t : "owned"
  })
  // replaceState, not router.replace: the tab is view state, and a navigation
  // would re-run the page's data loads for nothing.
  const setTab = (t: Tab) => {
    setTabState(t)
    const url = new URL(window.location.href)
    url.searchParams.set("tab", t)
    window.history.replaceState(null, "", url)
  }
  const [checking, setChecking] = useState(false)
  const [snapshot, setSnapshot] = useState<SnapshotResponse | null>(null)
  const [snapshotLoading, setSnapshotLoading] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) router.push("/login")
  }, [user, authLoading, router])

  const load = useCallback(async () => {
    try {
      setData(await api.get<DetailResponse>(`/api/youtube/projects/${projectId}/keywords/${kwId}/detail`))
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 404) router.replace(`/dashboard/youtube/${projectId}/keywords`)
      else setError(err instanceof Error ? err.message : "Failed to load keyword")
    } finally {
      setLoading(false)
    }
  }, [projectId, kwId, router])

  useEffect(() => {
    void load()
  }, [load])

  // While a check is in flight, poll until it lands so the page updates itself.
  const inFlight = checking || data?.status === "PENDING" || data?.status === "PROCESSING"
  useEffect(() => {
    if (!inFlight) return
    const t = setInterval(() => void load(), 5000)
    return () => clearInterval(t)
  }, [inFlight, load])
  useEffect(() => {
    if (data?.status !== "PENDING" && data?.status !== "PROCESSING") setChecking(false)
  }, [data?.latestCheck?.id, data?.status])

  const runCheck = async () => {
    setChecking(true)
    try {
      const res = await api.post<{ scheduled: number }>(`/api/youtube/projects/${projectId}/check`, {
        keywordIds: [kwId],
      })
      if (!res?.scheduled) {
        setChecking(false)
        setError("Check couldn't be scheduled — your plan's check quota may be used up.")
      } else {
        setError("")
        setTimeout(() => void load(), 1500)
      }
    } catch (err: unknown) {
      setChecking(false)
      // 402 is handled globally by the quota upsell modal via the api client.
      if (!(err instanceof ApiError && err.status === 402)) {
        setError(err instanceof Error ? err.message : "Failed to start check")
      }
    }
  }

  // The snapshot is the one heavy read (~tens of KB), so it stays a separate call
  // rather than riding along with the detail response. The hero's results list
  // and the SERP tab both read it.
  const latestCheckId = data?.latestCheck?.id
  useEffect(() => {
    if (!latestCheckId || snapshot?.checkId === latestCheckId) return
    setSnapshotLoading(true)
    api
      .get<SnapshotResponse>(`/api/youtube/checks/${latestCheckId}/snapshot`)
      .then(setSnapshot)
      .catch(() => setSnapshot(null))
      .finally(() => setSnapshotLoading(false))
  }, [latestCheckId, snapshot?.checkId])

  const chartData = useMemo(() => {
    if (!data) return []
    return data.history
      .slice(0, 60)
      .reverse()
      .map((h) => ({
        day: h.checkedAt,
        // A miss plots just past the depth checked, so the line stays continuous
        // and the drop reads at its true magnitude. The caption below says so.
        pos: h.bestVideoPosition ?? h.depth + 1,
        miss: h.bestVideoPosition == null,
        depth: h.depth,
      }))
  }, [data])
  // Anything plotted past the deepest check is a miss, and says so on the axis
  // and tooltip instead of reading as a real "#21".
  const maxDepth = useMemo(() => Math.max(0, ...(data?.history.map((h) => h.depth) ?? [])), [data])

  if (authLoading || loading) {
    return (
      <div className="page" style={{ color: "var(--text-mute)", fontSize: 13, padding: 60, textAlign: "center" }}>
        Loading…
      </div>
    )
  }
  if (!data) {
    return (
      <div className="page" style={{ color: "var(--neg)", fontSize: 13, padding: 60, textAlign: "center" }}>
        {error || "Keyword not found"}
      </div>
    )
  }

  const latest = data.latestCheck
  const bestEver = data.history.reduce<number | null>(
    (best, h) => (h.bestVideoPosition == null ? best : best == null ? h.bestVideoPosition : Math.min(best, h.bestVideoPosition)),
    null,
  )

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <div className="tiny muted">
            <Link href={`/dashboard/youtube/${projectId}/keywords`}>{data.project.name}</Link> ·{" "}
            {data.keyword.locationLabel} · {data.keyword.languageCode.toUpperCase()}
          </div>
          <div className="t">{data.keyword.keyword}</div>
          <div className="tiny muted" style={{ marginTop: 2 }}>
            {inFlight
              ? "Checking now…"
              : data.keyword.lastCheckedAt
                ? `Last checked ${shortDate(data.keyword.lastCheckedAt)}`
                : "Not checked yet"}
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {latest?.checkUrl && (
            <a href={latest.checkUrl} target="_blank" rel="noopener noreferrer" className="btn">
              Open on YouTube <Icon.external size={13} />
            </a>
          )}
          <button className="btn primary" onClick={() => void runCheck()} disabled={inFlight}>
            {inFlight ? "Checking…" : "Check now"}
          </button>
        </div>
      </div>

      {error && (
        <div className="tiny" style={{ color: "var(--neg)", marginBottom: 12 }}>
          {error}
        </div>
      )}

      <ResultHero
        keyword={data.keyword.keyword}
        location={data.keyword.locationLabel}
        latest={latest}
        bestEver={bestEver}
        checks={data.history.length}
        snapshot={snapshot}
        snapshotLoading={snapshotLoading}
      />

      <div className="tabs" style={{ marginBottom: 12 }}>
        {(
          [
            ["owned", `Your results${latest?.ownedCount ? ` (${latest.ownedCount})` : ""}`],
            ["serp", "SERP snapshot"],
            ["history", "Position history"],
          ] as const
        ).map(([key, label]) => (
          <button key={key} className={`tab ${tab === key ? "active" : ""}`.trim()} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "history" && (
        <>
          {chartData.length > 1 ? (
            <div className="card tight">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Position history</div>
                <div className="tiny muted">Last {chartData.length} checks · bottom = not found</div>
              </div>
              <LineChart
                data={chartData}
                invert
                label="Position"
                yFormat={(v) => (v > maxDepth ? "n/f" : "#" + Math.round(v))}
                xFormat={(d, i) =>
                  `${shortDate(String(d.day))}${chartData[i]?.miss ? ` · not in top ${chartData[i]!.depth}` : ""}`
                }
                // The svg scales to full width at a 760:height aspect, so this is
                // a ratio, not pixels: 120 renders about 1/6 of the card's width.
                height={120}
              />
            </div>
          ) : (
            <div className="card tight tiny muted" style={{ textAlign: "center" }}>
              The position trend chart appears after the second check.
            </div>
          )}

          {/* Disclaimer #3 of 3 — full card, under the chart it explains. */}
          <div style={{ marginTop: 14 }}>
            <VolatilityNote checkUrl={latest?.checkUrl} />
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div className="tbl-scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Checked</th>
                    <th style={{ width: 140 }}>Position</th>
                    <th style={{ width: 70 }}>Change</th>
                    <th style={{ width: 70 }}>Abs.</th>
                    <th style={{ width: 80 }}>Owned</th>
                    <th style={{ width: 90 }}>Block</th>
                    <th>Ranking video</th>
                  </tr>
                </thead>
                <tbody>
                  {data.history.map((h) => (
                    <tr key={h.id}>
                      <td className="tiny muted" title={new Date(h.checkedAt).toLocaleString()}>
                        {shortDate(h.checkedAt)}
                      </td>
                      <td>
                        <YtPosCell position={h.bestVideoPosition} notInTop={h.notInTop} depth={h.depth} />
                      </td>
                      <td>
                        <DeltaCell from={h.change} to={0} />
                      </td>
                      <td className="tabular tiny muted">{h.bestRankAbsolute ?? "—"}</td>
                      <td className="tabular tiny">{h.ownedCount}</td>
                      <td>
                        <BlockChip blockName={h.topBlockName} itemType={h.topItemType} />
                      </td>
                      <td className="tiny">
                        {h.topVideoUrl ? (
                          <a href={h.topVideoUrl} target="_blank" rel="noopener noreferrer">
                            {h.topVideoTitle ?? h.topVideoUrl}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === "owned" && (
        <div className="card" style={{ padding: 0 }}>
          {!latest || latest.results.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
              {latest?.notInTop
                ? `No video from this target appeared in the top ${latest.depth} for this keyword.`
                : "No check has completed for this keyword yet."}
            </div>
          ) : (
            <div className="tbl-scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>Position</th>
                    <th style={{ width: 60 }}>Abs.</th>
                    <th style={{ width: 76 }}>Thumb</th>
                    <th>Title</th>
                    <th style={{ width: 200 }}>Stats</th>
                    <th style={{ width: 90 }}>Block</th>
                    <th style={{ width: 110 }}>Matched by</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Every occurrence, not just the headline — a channel routinely
                      holds several results for one keyword. */}
                  {latest.results.map((r) => {
                    return (
                      <tr key={r.id}>
                        <td className="tabular">{r.videoPosition ?? "—"}</td>
                        <td className="tabular muted tiny">{r.rankAbsolute}</td>
                        <td>
                          <VideoThumb videoId={r.videoId} durationSeconds={r.durationSeconds} width={64} />
                        </td>
                        <td>
                          {r.url ? (
                            <a href={r.url} target="_blank" rel="noopener noreferrer">
                              {r.title ?? r.url}
                            </a>
                          ) : (
                            (r.title ?? "—")
                          )}
                        </td>
                        <td>
                          <VideoMetaCell views={r.views} publishedAt={r.publishedAt} />
                        </td>
                        <td>
                          <BlockChip blockName={r.blockName} itemType={r.itemType} />
                        </td>
                        <td>
                          <span
                            className={`chip ${r.matchStrategy === "channel_name" ? "warn" : "outline"}`}
                            title={
                              r.matchStrategy === "channel_name"
                                ? "Matched by channel name — less certain than an ID match."
                                : `Matched by ${r.matchStrategy.replace(/_/g, " ")}`
                            }
                          >
                            {r.matchStrategy.replace(/_/g, " ")}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "serp" && (
        <div className="card" style={{ padding: 0 }}>
          <div className="card-h">
            <div>
              <div className="t">SERP snapshot</div>
              <div className="tiny muted">
                {snapshot
                  ? `Top ${snapshot.depth} as of ${new Date(snapshot.checkedAt).toLocaleString()}${
                      snapshot.adsCount > 0 ? ` · ${snapshot.adsCount} ad${snapshot.adsCount === 1 ? "" : "s"}` : ""
                    }${snapshot.truncated ? " · truncated" : ""}`
                  : "The full result list as of the last check."}
              </div>
            </div>
            {snapshot?.checkUrl && (
              <a href={snapshot.checkUrl} target="_blank" rel="noopener noreferrer" className="btn sm">
                Verify on YouTube <Icon.external size={12} />
              </a>
            )}
          </div>
          {snapshotLoading ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
              Loading snapshot…
            </div>
          ) : snapshot ? (
            <SnapshotTable items={snapshot.items} ownedRanks={snapshot.ownedRanks} keyword={snapshot.keyword} />
          ) : (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
              No snapshot available. Run a check to populate this view.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** [1, 11, 19] → "#1, #11 and #19" */
function listPositions(ps: number[]): string {
  const tags = ps.map((p) => `#${p}`)
  return tags.length < 2 ? tags.join("") : `${tags.slice(0, -1).join(", ")} and ${tags[tags.length - 1]}`
}

/** Plain-English reading of a position, so the number means something on sight. */
function verdict(pos: number | null, depth: number): { title: string; body: string; tone: string } {
  if (pos == null)
    return {
      title: `Not in the top ${depth}`,
      body: "None of your videos showed up in the results we checked for this search.",
      tone: "var(--neg)",
    }
  if (pos === 1) return { title: "Top spot", body: "Your video is the first result people see.", tone: "var(--pos)" }
  if (pos <= 3) return { title: "Top 3", body: "Your video is among the first results people see.", tone: "var(--pos)" }
  if (pos <= 10)
    return { title: "On the first screen", body: "Visible without much scrolling, but not at the top.", tone: "var(--brand)" }
  return { title: "Further down", body: "People have to scroll a fair way to find your video.", tone: "var(--warn)" }
}

function ResultHero({
  keyword,
  location,
  latest,
  bestEver,
  checks,
  snapshot,
  snapshotLoading,
}: {
  keyword: string
  location: string
  latest: DetailResponse["latestCheck"]
  bestEver: number | null
  checks: number
  snapshot: SnapshotResponse | null
  snapshotLoading: boolean
}) {
  const [showAll, setShowAll] = useState(false)
  if (!latest) {
    return (
      <div className="card" style={{ padding: 32, textAlign: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>No result yet</div>
        <div className="tiny muted" style={{ marginTop: 4 }}>
          Run a check to see where your videos rank for &ldquo;{keyword}&rdquo;.
        </div>
      </div>
    )
  }

  const pos = latest.bestVideoPosition
  const v = verdict(pos, latest.depth)
  const ownedPositions = new Set(latest.results.map((r) => r.videoPosition).filter((p): p is number => p != null))
  const top = [...latest.results].sort((a, b) => (a.videoPosition ?? 1e9) - (b.videoPosition ?? 1e9))[0]
  const share = Math.round((ownedPositions.size / latest.depth) * 100)
  const change = latest.change

  return (
    <div className="card" style={{ marginBottom: 14, padding: 20 }}>
      <div
        style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))" }}
      >
        {/* The answer: where you rank, in one big number and one sentence. */}
        <div className="row" style={{ gap: 18, alignItems: "center" }}>
          <div
            className="tabular"
            style={{
              fontSize: pos == null ? 28 : 64,
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: "-0.04em",
              color: v.tone,
              minWidth: 90,
              textAlign: "center",
            }}
          >
            {pos == null ? "—" : `#${pos}`}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: v.tone }}>{v.title}</div>
            <div className="tiny muted" style={{ marginTop: 2 }}>
              on YouTube for &ldquo;{keyword}&rdquo; · {location}
            </div>
            <div style={{ fontSize: 13, marginTop: 6 }}>{v.body}</div>
            <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              {change ? (
                <span className={`chip ${change > 0 ? "pos" : "neg"}`}>
                  {change > 0 ? "▲" : "▼"} {Math.abs(change)} since last check
                </span>
              ) : (
                <span className="chip outline">{checks > 1 ? "No change since last check" : "First check"}</span>
              )}
              {bestEver != null && <span className="chip outline">Best ever #{bestEver}</span>}
              {latest.bestRankAbsolute != null && latest.bestRankAbsolute !== pos && (
                <span className="chip outline" title="Counting ads, shelves and channel cards">
                  #{latest.bestRankAbsolute} incl. ads & shelves
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Which video earned it — the thing the user actually recognises. */}
        {top && (
          <div className="row" style={{ gap: 12, alignItems: "center", minWidth: 0 }}>
            <VideoThumb videoId={top.videoId} durationSeconds={top.durationSeconds} width={160} />
            <div style={{ minWidth: 0 }}>
              <div className="tiny muted">Your best-ranking video</div>
              <div style={{ fontWeight: 600, fontSize: 14, margin: "2px 0 6px", lineHeight: 1.3 }}>
                {top.url ? (
                  <a href={top.url} target="_blank" rel="noopener noreferrer">
                    {top.title ?? top.url}
                  </a>
                ) : (
                  (top.title ?? "—")
                )}
              </div>
              <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <VideoMetaCell views={top.views} publishedAt={top.publishedAt} />
                <BlockChip blockName={top.blockName} itemType={top.itemType} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* The results page itself, your rows highlighted: what a viewer actually sees. */}
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {ownedPositions.size === 0
              ? `None of the top ${latest.depth} results are yours`
              : `${ownedPositions.size} of the top ${latest.depth} results are yours`}
          </div>
          {ownedPositions.size > 0 && (
            <div className="tiny muted" style={{ marginTop: 2 }}>
              {ownedPositions.size === 1 ? "Position" : "Positions"} {listPositions([...ownedPositions].sort((a, b) => a - b))}{" "}
              · {share}% of what people see for this search
            </div>
          )}
        </div>
        {snapshotLoading && !snapshot ? (
          <div className="tiny muted" style={{ padding: 16, textAlign: "center" }}>
            Loading results…
          </div>
        ) : snapshot ? (
          <ResultsList snapshot={snapshot} showAll={showAll} onToggle={() => setShowAll((v) => !v)} />
        ) : null}
      </div>
    </div>
  )
}

/** Rows always shown above the fold of the list; past that only your own rows. */
const LIST_HEAD = 5

/**
 * A compact copy of the YouTube results page. Collapsed, it shows the top few
 * plus every one of your rows, with "…" where rows were skipped, so your
 * placements are visible without scrolling through all of the competition.
 */
function ResultsList({
  snapshot,
  showAll,
  onToggle,
}: {
  snapshot: SnapshotResponse
  showAll: boolean
  onToggle: () => void
}) {
  const owned = new Set(snapshot.ownedRanks)
  const videos = snapshot.items
    .filter((it) => it.videoPosition != null)
    .sort((a, b) => a.videoPosition! - b.videoPosition!)
  const visible = showAll ? videos : videos.filter((it, i) => i < LIST_HEAD || owned.has(it.rankAbsolute))
  const hidden = videos.length - visible.length

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
      {visible.map((it, i) => {
        const mine = owned.has(it.rankAbsolute)
        const gap = i > 0 && it.videoPosition! - visible[i - 1]!.videoPosition! > 1
        return (
          <div key={it.rankAbsolute}>
            {gap && (
              <div className="tiny muted" style={{ padding: "2px 12px", background: "var(--bg-sub)", borderTop: "1px solid var(--border)" }}>
                ⋯
              </div>
            )}
            <div
              className="row"
              style={{
                gap: 12,
                alignItems: "center",
                padding: "8px 12px",
                borderTop: i > 0 || gap ? "1px solid var(--border)" : undefined,
                background: mine ? "var(--brand-soft)" : undefined,
                boxShadow: mine ? "inset 3px 0 0 var(--brand)" : undefined,
              }}
            >
              <span
                className="tabular"
                style={{
                  width: 32,
                  flexShrink: 0,
                  fontWeight: 700,
                  fontSize: 14,
                  color: mine ? "var(--brand)" : "var(--text-mute)",
                }}
              >
                #{it.videoPosition}
              </span>
              <VideoThumb videoId={it.videoId} durationLabel={it.durationTime} durationSeconds={it.durationSeconds} width={80} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: mine ? 600 : 500,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {it.url ? (
                    <a href={it.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
                      {it.title ?? it.url}
                    </a>
                  ) : (
                    (it.title ?? "—")
                  )}
                </div>
                <div className="tiny muted" style={{ marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {[it.channelName, formatViews(it.views) && `${formatViews(it.views)} views`].filter(Boolean).join(" · ")}
                </div>
              </div>
              {mine && <span className="chip brand">Your video</span>}
            </div>
          </div>
        )
      })}
      {(hidden > 0 || showAll) && (
        <button
          className="btn sm"
          onClick={onToggle}
          style={{ width: "100%", borderRadius: 0, border: 0, borderTop: "1px solid var(--border)", justifyContent: "center" }}
        >
          {showAll ? "Show less" : `Show all ${videos.length} results`}
        </button>
      )}
    </div>
  )
}
