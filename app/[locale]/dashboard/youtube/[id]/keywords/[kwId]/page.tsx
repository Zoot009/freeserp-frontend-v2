"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { Link, useRouter } from "@/i18n/navigation"
import { useAuth } from "@/lib/auth"
import { api, ApiError } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"
import { LineChart, StatTile } from "@/components/dashboard/primitives"
import {
  BlockChip,
  SnapshotTable,
  VideoMetaCell,
  VideoThumb,
  VolatilityNote,
  YtPosCell,
  formatViews,
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

export default function YoutubeKeywordDetailPage() {
  const params = useParams<{ id: string; kwId: string }>()
  const { id: projectId, kwId } = params
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const [data, setData] = useState<DetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [tab, setTab] = useState<Tab>((searchParams.get("tab") as Tab) || "history")
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

  // The snapshot is the one heavy read (~tens of KB), so it loads lazily when the
  // tab is opened rather than riding along with the detail response.
  const latestCheckId = data?.latestCheck?.id
  useEffect(() => {
    if (tab !== "serp" || !latestCheckId || snapshot?.checkId === latestCheckId) return
    setSnapshotLoading(true)
    api
      .get<SnapshotResponse>(`/api/youtube/checks/${latestCheckId}/snapshot`)
      .then(setSnapshot)
      .catch(() => setSnapshot(null))
      .finally(() => setSnapshotLoading(false))
  }, [tab, latestCheckId, snapshot?.checkId])

  const chartData = useMemo(() => {
    if (!data) return []
    return [...data.history]
      .slice(0, 60)
      .reverse()
      .map((h, i) => ({
        day: i,
        // A miss plots just past the depth checked, so the line stays continuous
        // and the drop reads at its true magnitude. The caption below says so.
        pos: h.bestVideoPosition ?? h.depth + 1,
      }))
  }, [data])

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
        </div>
        {latest?.checkUrl && (
          <a href={latest.checkUrl} target="_blank" rel="noopener noreferrer" className="btn">
            Open on YouTube <Icon.external size={13} />
          </a>
        )}
      </div>

      <div className="grid g-4" style={{ marginBottom: 14 }}>
        <StatTile
          lbl="Current position"
          val={
            <YtPosCell
              position={latest?.bestVideoPosition ?? null}
              notInTop={latest?.notInTop ?? false}
              depth={latest?.depth ?? data.keyword.depth}
              checked={!!latest}
            />
          }
          tip={latest ? `of top ${latest.depth} checked` : "not checked yet"}
        />
        <StatTile lbl="Best ever" val={bestEver ?? "—"} tip={`across ${data.history.length} checks`} />
        <StatTile
          lbl="Results owned"
          val={latest?.ownedCount ?? 0}
          tip={latest && latest.ownedCount > 1 ? "this keyword returns several of your videos" : "for this keyword"}
        />
        <StatTile lbl="Absolute rank" val={latest?.bestRankAbsolute ?? "—"} tip="incl. ads & shelves" />
      </div>

      <div className="tabs" style={{ marginBottom: 12 }}>
        {(
          [
            ["history", "Position history"],
            ["owned", `Your results${latest?.ownedCount ? ` (${latest.ownedCount})` : ""}`],
            ["serp", "SERP snapshot"],
          ] as const
        ).map(([key, label]) => (
          <button key={key} className={`tab ${tab === key ? "active" : ""}`.trim()} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "history" && (
        <>
          {/* Disclaimer #3 of 3 — full card, next to the chart it explains. */}
          <VolatilityNote checkUrl={latest?.checkUrl} />
          {chartData.length > 1 ? (
            <div className="card">
              <div className="card-h">
                <div>
                  <div className="t">Position history</div>
                  <div className="tiny muted">
                    {chartData.length} checks · oldest to newest. Points at the very top of the axis mean the target
                    wasn&apos;t found within the depth checked for that run.
                  </div>
                </div>
              </div>
              <LineChart data={chartData} invert yFormat={(v) => "#" + Math.round(v)} height={240} />
            </div>
          ) : (
            <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
              Not enough history yet — run a couple of checks to see a trend.
            </div>
          )}

          <div className="card" style={{ marginTop: 14, padding: 0 }}>
            <div className="tbl-scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Checked</th>
                    <th style={{ width: 140 }}>Position</th>
                    <th style={{ width: 70 }}>Abs.</th>
                    <th style={{ width: 80 }}>Owned</th>
                    <th style={{ width: 90 }}>Block</th>
                    <th>Ranking video</th>
                  </tr>
                </thead>
                <tbody>
                  {data.history.map((h) => (
                    <tr key={h.id}>
                      <td className="tiny muted">{new Date(h.checkedAt).toLocaleString()}</td>
                      <td>
                        <YtPosCell position={h.bestVideoPosition} notInTop={h.notInTop} depth={h.depth} />
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
