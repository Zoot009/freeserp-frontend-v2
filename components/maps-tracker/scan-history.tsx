"use client"

import type { ReactNode } from "react"
import { FileText } from "lucide-react"
import { Link } from "@/i18n/navigation"
import { rankColor, MILES_TO_METERS, KM_TO_METERS } from "./grid"
import type { ScanHistoryItem, ScanHistoryKeyword, ScanHistoryPoint, ScanStatus } from "./types"

const hasResults = (status: ScanStatus) => status === "COMPLETED" || status === "PARTIAL"
const isRunning = (status: ScanStatus) => status === "QUEUED" || status === "RUNNING"

/** Gap between cells, shrinking as the grid grows so the cells keep their size. */
const gapFor = (n: number) => (n <= 3 ? 4 : n <= 5 ? 3 : n <= 7 ? 2 : n <= 11 ? 1 : 0)

/** Dots while they're big enough to read as dots; tiles, then a heatmap, past that. */
const shapeFor = (n: number) => (n <= 7 ? "" : n <= 11 ? " tiles" : " solid")

/** A point's cell: its rank colour, grey for searched-and-absent, faint for no answer yet. */
function cellFor(p: ScanHistoryPoint): { className?: string; background?: string } {
  if (p.status !== "SUCCEEDED") return { className: "wait" }
  if (p.rank == null) return { className: "none" }
  return { background: rankColor(p.rank, p.status).bg }
}

/**
 * The scan's grid in miniature: one cell per point, where it sits on the map —
 * row 0 is north, column 0 is west, as the map draws them — in the map's own
 * rank colours. Where a keyword is strong reads at a glance, which is what the
 * report one click away then shows in full.
 *
 * This column was a thumbnail once and became a bar, because one fixed box drew
 * a 3 × 3 scan as three fat squares and a 21 × 21 one as speckle. Both are now
 * handled in the drawing rather than by dropping the grid: the box stays the
 * same size, the gap shrinks as the grid grows, and the cells go from dots to
 * tiles past 7 × 7 and to an edge-to-edge heatmap past 11 × 11.
 *
 * NOT FOUND IS GREY, not the map's #7F1D1D. On a list, a business missing from
 * most of its grid would otherwise put a dark red block on every row — which is
 * why the bar stopped drawing it. Grey reads as what it is, nothing there, and
 * lets the ranked cells stand out. Points still waiting, or whose search failed,
 * are fainter again: no finding either way.
 */
function MiniGrid({ scan, keyword }: { scan: ScanHistoryItem; keyword: ScanHistoryKeyword }) {
  const n = scan.gridSize
  // Nothing to place yet — hold the column open without drawing an empty grid
  // that reads as a result.
  if (!n || keyword.points.length === 0) return <span className="mt-mini-none" aria-hidden />

  const scored = keyword.points.filter((p) => p.status === "SUCCEEDED")
  const found = scored.filter((p) => p.rank != null).length
  const top3 = scored.filter((p) => p.rank != null && p.rank <= 3).length
  const label =
    scored.length === 0
      ? `${n} × ${n} grid, no results yet`
      : `${n} × ${n} grid: found at ${found} of ${scored.length} points, top 3 at ${top3}`

  return (
    <span
      className={`mt-minigrid${shapeFor(n)}`}
      style={{ gridTemplateColumns: `repeat(${n}, 1fr)`, gridTemplateRows: `repeat(${n}, 1fr)`, gap: gapFor(n) }}
      role="img"
      aria-label={label}
      title={label}
    >
      {keyword.points.map((p) => {
        const cell = cellFor(p)
        return (
          <i
            key={`${p.row}-${p.col}`}
            className={cell.className}
            style={{ gridRow: p.row + 1, gridColumn: p.col + 1, background: cell.background }}
          />
        )
      })}
    </span>
  )
}

/** Only states worth reacting to get a colour. "Complete" is the norm, and
 *  colouring the norm is what stops the exceptions standing out. */
function statusNote(scan: ScanHistoryItem): { label: string; color: string } | null {
  const { status } = scan
  if (isRunning(status)) return { label: "Scanning…", color: "var(--brand)" }
  if (status === "PARTIAL") {
    return { label: `${scan.totalPoints - scan.pointsDone} points failed`, color: "var(--warn)" }
  }
  if (status === "FAILED") {
    // The reason beats the word. "Failed" alone leaves someone staring at two
    // dashes with nothing to do about it.
    return { label: scan.errorMessage ?? "Failed — credits were returned", color: "var(--neg)" }
  }
  if (status === "CANCELLED") return { label: "Cancelled", color: "var(--text-mute)" }
  return null
}

const solvColor = (solv: number | null) =>
  solv == null ? undefined : solv >= 30 ? "var(--pos)" : solv >= 12 ? "var(--warn)" : "var(--neg)"

const radiusOf = (scan: ScanHistoryItem) =>
  scan.displayUnit === "IMPERIAL"
    ? `${(scan.radiusMeters / MILES_TO_METERS).toFixed(2)} mi`
    : `${(scan.radiusMeters / KM_TO_METERS).toFixed(2)} km`

const settingsOf = (scan: ScanHistoryItem) =>
  `${scan.gridSize} × ${scan.gridSize} · ${radiusOf(scan)} · ${scan.totalPoints} points`

const stampOf = (scan: ScanHistoryItem) =>
  `${new Date(scan.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ` +
  `${new Date(scan.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`

/** The five cells every row shares, so the header labels sit over their values. */
function Row({
  scan,
  keyword,
  meta,
  onOpen,
}: {
  scan: ScanHistoryItem
  keyword: ScanHistoryKeyword
  meta?: ReactNode
  onOpen: () => void
}) {
  const scored = hasResults(scan.status)
  return (
    <div className="mt-kwrow-wrap">
      <button type="button" className="mt-kwrow" onClick={onOpen}>
        {/* Drawn while the scan runs too: cells fill in as points land, and
            the list's own polling keeps it moving. */}
        <MiniGrid scan={scan} keyword={keyword} />
        <span style={{ minWidth: 0 }}>
          <span className="mt-kwrow-name">{keyword.keyword}</span>
          {meta && <span className="mt-kwrow-meta">{meta}</span>}
        </span>
        <span className="tabular mt-kwrow-v" style={{ color: solvColor(keyword.solv) }}>
          {keyword.solv != null ? `${keyword.solv.toFixed(0)}%` : "—"}
        </span>
        <span className="tabular mt-kwrow-v">{keyword.arp != null ? keyword.arp.toFixed(1) : "—"}</span>
        <span />
      </button>
      {/* No report for a scan with no results — it would open an empty one. */}
      {scored && (
        <Link
          href={`/reports/maps-tracker/${scan.id}/${keyword.id}`}
          target="_blank"
          className="icon-btn mt-kwrow-report"
          title="Open the shareable report"
          aria-label={`Open the shareable report for "${keyword.keyword}"`}
        >
          <FileText size={13} />
        </Link>
      )}
    </div>
  )
}

/**
 * Past scans.
 *
 * A run of several keywords states its date, business and settings once and
 * lists its readings beneath — repeating all of that per keyword was noise.
 * But most runs have a single keyword, and for those a group header plus one
 * row is two lines to say what fits on one, so they collapse: the settings
 * ride along under the keyword instead.
 */
export function ScanHistory({
  scans,
  onOpen,
  emptyLabel = "No scans yet.",
}: {
  scans: ScanHistoryItem[]
  onOpen: (scanId: string, keywordId: string) => void
  emptyLabel?: string
}) {
  if (scans.length === 0) {
    return (
      <div className="card" style={{ padding: 32, textAlign: "center" }}>
        <div className="tiny muted">{emptyLabel}</div>
      </div>
    )
  }

  return (
    <div className="mt-hist">
      {/* Said once, rather than reprinted on every row. */}
      <div className="mt-hist-head">
        <span />
        <span>Keyword</span>
        <span style={{ textAlign: "right" }}>Top 3</span>
        <span style={{ textAlign: "right" }}>Avg rank</span>
        <span />
      </div>

      {scans.map((scan) => {
        const note = statusNote(scan)
        const single = scan.keywords.length === 1

        if (single && scan.keywords[0]) {
          const k = scan.keywords[0]
          return (
            <section className="mt-scan" key={scan.id}>
              <Row
                scan={scan}
                keyword={k}
                onOpen={() => onOpen(scan.id, k.id)}
                meta={
                  <>
                    {stampOf(scan)} · {scan.location.name} · {settingsOf(scan)}
                    {note && <span style={{ color: note.color }}> · {note.label}</span>}
                  </>
                }
              />
            </section>
          )
        }

        return (
          <section className="mt-scan" key={scan.id}>
            <header className="mt-scan-h">
              <div style={{ minWidth: 0 }}>
                <span className="mt-scan-date">{stampOf(scan)}</span>
                <span className="mt-scan-biz">{scan.location.name}</span>
              </div>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                <span className="chip outline">{scan.gridSize} × {scan.gridSize}</span>
                <span className="chip outline">{radiusOf(scan)}</span>
                <span className="chip outline">
                  {hasResults(scan.status) || !isRunning(scan.status)
                    ? `${scan.totalPoints} points`
                    : `${scan.pointsDone} of ${scan.totalPoints} points`}
                </span>
                {note && <span className="tiny" style={{ color: note.color }}>{note.label}</span>}
              </div>
            </header>
            {scan.keywords.map((k) => (
              <Row key={k.id} scan={scan} keyword={k} onOpen={() => onOpen(scan.id, k.id)} />
            ))}
          </section>
        )
      })}
    </div>
  )
}
