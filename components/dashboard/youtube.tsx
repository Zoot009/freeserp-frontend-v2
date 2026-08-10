"use client"

import { useMemo, useState } from "react"
import { Icon } from "./icons"
import { PosBadge } from "./primitives"

// ---------------------------------------------------------------------------
// Shared types (mirror the /api/youtube contracts)
// ---------------------------------------------------------------------------

export type YtKeywordRow = {
  id: string
  keyword: string
  locationCode: number
  locationLabel: string
  locationIso2: string | null
  languageCode: string
  device: string
  depth: number | null
  addedAt: string
  latestCheckId: string | null
  checkedDepth: number | null
  notInTop: boolean
  bestVideoPosition: number | null
  bestRankAbsolute: number | null
  ownedCount: number
  change: number | null
  previousPos: number | null
  topVideoId: string | null
  topVideoUrl: string | null
  topVideoTitle: string | null
  topChannelName: string | null
  topBlockName: string | null
  topItemType: string | null
  topViews: number | null
  topPublishedAt: string | null
  topDurationSeconds: number | null
  adsCount: number
  checkUrl: string | null
  firstPosition: number | null
  d1: number | null
  d7: number | null
  d30: number | null
  status: string | null
  checkedAt: string | null
}

export type YtSnapshotItem = {
  rankAbsolute: number
  videoPosition: number | null
  itemType: string
  blockName: string | null
  videoId: string | null
  url: string | null
  title: string | null
  channelName: string | null
  channelUrl: string | null
  views: number | null
  publicationDate: string | null
  publishedAt: string | null
  durationSeconds: number | null
  durationTime: string | null
  isShorts: boolean
  isLive: boolean
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function formatViews(views: number | null | undefined): string | null {
  if (views == null || !Number.isFinite(views)) return null
  if (views >= 1_000_000_000) return `${(views / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  if (views >= 1_000) return `${(views / 1_000).toFixed(1).replace(/\.0$/, "")}K`
  return String(views)
}

export function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`
}

/** Coarse relative age. Video age is a first-order driver of YouTube ranking, so
 *  it sits next to the position rather than being buried in a detail view. */
export function formatAge(publishedAt: string | null | undefined): string | null {
  if (!publishedAt) return null
  const ms = Date.now() - new Date(publishedAt).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  const days = Math.floor(ms / 86_400_000)
  if (days < 1) return "today"
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} mo ago`
  return `${Math.floor(months / 12)}y ago`
}

/** Thumbnails are rebuilt from the video id rather than stored — see
 *  youtube.schemas.ts, where dropping the URLs keeps the snapshot column small. */
export function thumbnailFor(videoId: string | null | undefined): string | null {
  return videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : null
}

// ---------------------------------------------------------------------------
// Position cell
// ---------------------------------------------------------------------------

/**
 * YouTube position cell.
 *
 * NOT a reuse of PosCell: that renders the literal string "100+" when a checked
 * keyword has no position, which is true against Google's Top-100 ceiling and a
 * flat lie at depth 20. YouTube has no ceiling, so the honest statement is
 * bounded by the depth we actually checked.
 */
export function YtPosCell({
  position,
  notInTop,
  depth,
  processing = false,
  checked = true,
}: {
  position: number | null | undefined
  notInTop: boolean
  depth: number | null | undefined
  processing?: boolean
  checked?: boolean
}) {
  if (processing) {
    return (
      <span className="pos-badge" role="status" title="Check in progress" aria-label="Check in progress">
        <span
          className="spin"
          aria-hidden
          style={{
            display: "block",
            width: 14,
            height: 14,
            borderRadius: "50%",
            border: "2px solid var(--border-strong)",
            borderTopColor: "var(--brand)",
            boxSizing: "border-box",
          }}
        />
      </span>
    )
  }
  if (position != null && Number.isFinite(position)) return <PosBadge pos={position} />
  if (notInTop && depth != null) {
    return (
      <span className="chip" title={`Checked the top ${depth} results — no video from this target appeared.`}>
        Not in top {depth}
      </span>
    )
  }
  // Never checked, or the check failed. Deliberately distinct from "not in top N".
  return (
    <span className="tiny muted" title={checked ? "No result recorded" : "Not checked yet"}>
      —
    </span>
  )
}

/**
 * A channel can hold several results for one keyword. The table headlines the
 * best position, so this is what tells the user the rest exist.
 */
export function OwnedCountBadge({ count }: { count: number }) {
  if (count <= 1) return null
  return (
    <span
      className="chip brand"
      title={`This target holds ${count} results for this keyword. The position shown is the best of them.`}
    >
      ×{count}
    </span>
  )
}

/**
 * Views / age / duration next to the position. On YouTube these are what make a
 * ranking movement explainable at all — far more so than on Google, where a
 * position mostly stands on its own.
 */
export function VideoMetaCell({
  views,
  publishedAt,
  durationSeconds,
}: {
  views: number | null
  publishedAt: string | null
  durationSeconds: number | null
}) {
  const parts = [
    formatViews(views) != null ? `${formatViews(views)} views` : null,
    formatAge(publishedAt),
    formatDuration(durationSeconds),
  ].filter(Boolean)
  if (parts.length === 0) return <span className="tiny muted">—</span>
  return <span className="tiny muted">{parts.join(" · ")}</span>
}

/**
 * Where the result came from. A Shorts-shelf placement is not the same
 * achievement as an organic video result, and the table says so rather than
 * flattening them into one number.
 */
export function BlockChip({ blockName, itemType }: { blockName: string | null; itemType: string | null }) {
  if (!itemType && !blockName) return <span className="tiny muted">—</span>
  const label =
    itemType === "youtube_channel"
      ? "Channel"
      : itemType === "youtube_playlist"
        ? "Playlist"
        : itemType === "youtube_video_paid"
          ? "Ad"
          : blockName || "Video"
  const tone = itemType === "youtube_video_paid" ? "warn" : label === "Video" ? "" : "outline"
  return (
    <span className={`chip ${tone}`.trim()} title={`${itemType ?? "result"}${blockName ? ` · ${blockName}` : ""}`}>
      {label}
    </span>
  )
}

/**
 * The volatility disclaimer. YouTube search is heavily personalised and moves
 * through the day, so a tracked position is directional, not exact — saying so
 * plainly is more useful than implying a precision we don't have.
 */
export function VolatilityNote({ checkUrl, compact = false }: { checkUrl?: string | null; compact?: boolean }) {
  const text =
    "YouTube positions are a directional snapshot. Results are personalised and shift through the day, so treat movement as a trend rather than an exact rank."
  if (compact) {
    return (
      <div className="tiny muted" style={{ marginTop: 6 }}>
        {text}{" "}
        {checkUrl && (
          <a href={checkUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand)" }}>
            Open the live search <Icon.external size={11} />
          </a>
        )}
      </div>
    )
  }
  return (
    <div className="card tight" style={{ borderStyle: "dashed", background: "transparent", marginBottom: 14 }}>
      <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
        <span style={{ color: "var(--warn)", flexShrink: 0, marginTop: 2 }}>
          <Icon.info size={14} />
        </span>
        <div>
          <div className="tiny" style={{ fontWeight: 600, marginBottom: 2 }}>
            About these positions
          </div>
          <div className="tiny muted">
            {text} A gap in the chart means the target wasn&apos;t found within the depth checked for that run — not
            that it vanished from YouTube.
          </div>
          {checkUrl && (
            <a
              href={checkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="tiny"
              style={{ color: "var(--brand)", display: "inline-block", marginTop: 6 }}
            >
              Open this search on YouTube <Icon.external size={11} />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SERP snapshot
// ---------------------------------------------------------------------------

const SNAPSHOT_PAGE_SIZE = 20

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * The full result list for one check, at absolute rank order, with the target's
 * own results highlighted. This is the "what does a winning video look like"
 * view — which is why every row carries channel, views, age and duration.
 */
export function SnapshotTable({
  items,
  ownedRanks,
  keyword,
}: {
  items: YtSnapshotItem[]
  ownedRanks: number[]
  keyword: string
}) {
  const [page, setPage] = useState(0)
  const owned = useMemo(() => new Set(ownedRanks), [ownedRanks])
  const pages = Math.max(1, Math.ceil(items.length / SNAPSHOT_PAGE_SIZE))
  const visible = items.slice(page * SNAPSHOT_PAGE_SIZE, (page + 1) * SNAPSHOT_PAGE_SIZE)

  const downloadCsv = () => {
    const header = ["absolute", "videoPosition", "type", "block", "title", "channel", "views", "published", "duration", "url"]
    const rows = items.map((i) => [
      i.rankAbsolute,
      i.videoPosition ?? "",
      i.itemType,
      i.blockName ?? "",
      i.title ?? "",
      i.channelName ?? "",
      i.views ?? "",
      i.publishedAt ?? i.publicationDate ?? "",
      i.durationTime ?? "",
      i.url ?? "",
    ])
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `youtube-serp-${keyword.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (items.length === 0) {
    return (
      <div style={{ padding: "40px 32px", textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
        No snapshot stored for this check yet.
      </div>
    )
  }

  return (
    <>
      <div className="tbl-scroll">
        <table className="tbl" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ width: 56 }} title="Position in the full result list, ads and shelves included">
                #
              </th>
              <th style={{ width: 56 }} title="Position counting standalone organic videos only">
                Video
              </th>
              <th style={{ width: 76 }}>Thumb</th>
              <th>Title</th>
              <th style={{ width: "18%" }}>Channel</th>
              <th style={{ width: 90 }}>Views</th>
              <th style={{ width: 90 }}>Published</th>
              <th style={{ width: 80 }}>Length</th>
              <th style={{ width: 90 }}>Type</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => {
              const isOwned = owned.has(item.rankAbsolute)
              const thumb = thumbnailFor(item.videoId)
              return (
                <tr
                  key={`${item.rankAbsolute}-${item.videoId ?? item.itemType}`}
                  style={isOwned ? { background: "var(--brand-soft)" } : undefined}
                >
                  <td className="tabular">{item.rankAbsolute}</td>
                  <td className="tabular muted">{item.videoPosition ?? "—"}</td>
                  <td>
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt=""
                        width={64}
                        height={36}
                        loading="lazy"
                        style={{ borderRadius: 4, objectFit: "cover", display: "block" }}
                      />
                    ) : (
                      <span className="tiny muted">—</span>
                    )}
                  </td>
                  <td>
                    {item.url ? (
                      <a href={item.url} target="_blank" rel="noopener noreferrer" title={item.title ?? undefined}>
                        {item.title ?? item.url}
                      </a>
                    ) : (
                      (item.title ?? "—")
                    )}
                    {isOwned && (
                      <span className="chip brand" style={{ marginLeft: 6 }}>
                        Yours
                      </span>
                    )}
                  </td>
                  <td className="tiny">
                    {item.channelUrl ? (
                      <a href={item.channelUrl} target="_blank" rel="noopener noreferrer">
                        {item.channelName ?? "—"}
                      </a>
                    ) : (
                      (item.channelName ?? "—")
                    )}
                  </td>
                  <td className="tabular tiny">{formatViews(item.views) ?? "—"}</td>
                  <td className="tiny muted">{formatAge(item.publishedAt) ?? item.publicationDate ?? "—"}</td>
                  <td className="tabular tiny">{item.durationTime ?? formatDuration(item.durationSeconds) ?? "—"}</td>
                  <td>
                    <BlockChip blockName={item.blockName} itemType={item.itemType} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ justifyContent: "space-between", padding: "10px 14px", alignItems: "center" }}>
        <span className="tiny muted">
          {items.length} result{items.length === 1 ? "" : "s"} · page {page + 1} of {pages}
        </span>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={downloadCsv}>
            <Icon.download /> CSV
          </button>
          <button className="btn sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            Prev
          </button>
          <button
            className="btn sm"
            disabled={page >= pages - 1}
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
          >
            Next
          </button>
        </div>
      </div>
    </>
  )
}
