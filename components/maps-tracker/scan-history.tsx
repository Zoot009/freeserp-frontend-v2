"use client"

import type { ReactNode } from "react"
import { FileText } from "lucide-react"
import { Link } from "@/i18n/navigation"
import { rankColor, MILES_TO_METERS, KM_TO_METERS } from "./grid"
import type { ScanHistoryItem, ScanHistoryKeyword, ScanStatus } from "./types"

const hasResults = (status: ScanStatus) => status === "COMPLETED" || status === "PARTIAL"
const isRunning = (status: ScanStatus) => status === "QUEUED" || status === "RUNNING"

/**
 * A scan's heatmap thumbnail, always the same footprint.
 *
 * The cells divide a fixed box rather than being a fixed size each, so a 3 × 3
 * and a 21 × 21 occupy identical space — the column stays aligned and rows keep
 * the same height. A big grid just renders at finer resolution, which is the
 * honest thing for a thumbnail whose job is the shape, not the values.
 */
function MiniHeatmap({ keyword, gridSize }: { keyword: ScanHistoryKeyword; gridSize: number }) {
  const byPos = new Map(keyword.points.map((p) => [`${p.row}:${p.col}`, p]))
  const cells = Array.from({ length: gridSize * gridSize }, (_, i) =>
    byPos.get(`${Math.floor(i / gridSize)}:${i % gridSize}`) ?? null,
  )
  return (
    <div
      className="mt-mini"
      // A 1px gutter is nothing at 3 × 3 and over a third of the width at
      // 21 × 21, where it turns the thumbnail into speckle. Big grids close up.
      style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)`, gap: gridSize > 11 ? 0 : 1 }}
      aria-hidden
    >
      {cells.map((p, i) => (
        <span key={i} style={{ background: p ? rankColor(p.rank, p.status).bg : "var(--bg-inset)" }} />
      ))}
    </div>
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
        {/* A scan that never ran has no shape to show. A grey grid in its place
            looks like a result, which is worse than an empty cell. */}
        {scored ? <MiniHeatmap keyword={keyword} gridSize={scan.gridSize} /> : <span className="mt-mini-none" aria-hidden />}
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
