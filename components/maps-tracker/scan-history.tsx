"use client"

import type { ReactNode } from "react"
import { FileText } from "lucide-react"
import { Link } from "@/i18n/navigation"
import { RANK_BANDS, bandKeyFor, MILES_TO_METERS, KM_TO_METERS } from "./grid"
import type { ScanHistoryItem, ScanHistoryKeyword, ScanStatus } from "./types"

const hasResults = (status: ScanStatus) => status === "COMPLETED" || status === "PARTIAL"
const isRunning = (status: ScanStatus) => status === "QUEUED" || status === "RUNNING"

/**
 * How a scan's points fall across the rank bands, as one bar.
 *
 * This replaced a miniature of the grid itself. At 52px a 3 × 3 was three fat
 * squares of flat colour and a 21 × 21 was speckle, so neither end of the range
 * actually showed a shape — a column of them read as mud rather than as data.
 *
 * A bar does the thing a thumbnail grid could never do in a LIST: every bar is
 * the same width, so two scans compare by eye straight down the column. That is
 * the question this screen exists to answer — is this run better or worse than
 * that one — and it is the same bar the Overview card draws, so "the shape of a
 * scan" looks the same everywhere it appears.
 *
 * What is given up is WHERE in the grid the strength sits. That was already
 * unreadable at this size, and the report one click away draws it properly.
 */
function MiniBands({ keyword }: { keyword: ScanHistoryKeyword }) {
  const bands = RANK_BANDS.map((b) => ({
    key: b.key,
    label: b.label,
    color: b.color,
    count: keyword.points.filter((p) => bandKeyFor(p.rank, p.status) === b.key).length,
  })).filter((b) => b.count > 0)

  const total = bands.reduce((sum, b) => sum + b.count, 0)
  // Every point failed, or none ran. Nothing to draw a distribution of.
  if (!total) return <span className="mt-mini-none" aria-hidden />

  return (
    <span className="mt-bands" title={bands.map((b) => `${b.label}: ${b.count}`).join(" · ")}>
      {bands.map((b) => (
        <span key={b.key} style={{ width: `${(b.count / total) * 100}%`, background: b.color }} />
      ))}
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
        {/* A scan that never ran has no distribution to show. A grey bar in
            its place looks like a result, which is worse than an empty cell. */}
        {scored ? <MiniBands keyword={keyword} /> : <span className="mt-mini-none" aria-hidden />}
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
