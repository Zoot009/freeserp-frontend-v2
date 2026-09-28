"use client"

import { FileText } from "lucide-react"
import { Link } from "@/i18n/navigation"
import { rankColor, MILES_TO_METERS, KM_TO_METERS } from "./grid"
import type { ScanHistoryItem, ScanHistoryKeyword, ScanStatus } from "./types"

const hasResults = (status: ScanStatus) => status === "COMPLETED" || status === "PARTIAL"
const isRunning = (status: ScanStatus) => status === "QUEUED" || status === "RUNNING"

/**
 * How the tile draws a grid of `n` × `n`.
 *
 * The tile is one fixed size, so everything else scales with the grid: the gap
 * narrows as points multiply, the rank number is printed only while a pin is
 * big enough to hold it (3 × 3 and 5 × 5), and past 15 × 15 the pins become
 * edge-to-edge tiles — a heatmap, rather than a speckle of dots too small to
 * see.
 */
function layoutFor(n: number): { size: number; gap: number; font: number | null; shape: "dot" | "tile" } {
  // A little smaller for the smallest grids, whose nine pins would otherwise
  // be the heaviest thing on the page.
  if (n <= 3) return { size: 116, gap: 12, font: 12, shape: "dot" }
  if (n <= 5) return { size: 132, gap: 6, font: 9, shape: "dot" }
  if (n <= 7) return { size: 140, gap: 4, font: null, shape: "dot" }
  if (n <= 11) return { size: 140, gap: 2, font: null, shape: "dot" }
  if (n <= 15) return { size: 140, gap: 1, font: null, shape: "tile" }
  return { size: 140, gap: 0, font: null, shape: "tile" }
}

/**
 * The scan's grid, drawn the way the scan map draws it: the same pins, the same
 * colours and the same rank numbers (rankColor), each where it sits — row 0 is
 * north, column 0 is west. A card therefore reads as a small copy of a map the
 * user already knows, which is what makes it understandable without a key:
 * green where they're in the top 3, "20+" where they're not found at all.
 */
function MapTile({ scan, keyword }: { scan: ScanHistoryItem; keyword: ScanHistoryKeyword }) {
  const n = scan.gridSize
  const layout = layoutFor(n)
  return (
    <span className="mt-card-map" aria-hidden>
      {keyword.points.length > 0 ? (
        <span
          className={`mt-card-grid ${layout.shape}`}
          style={{
            width: layout.size,
            height: layout.size,
            gridTemplateColumns: `repeat(${n}, 1fr)`,
            gridTemplateRows: `repeat(${n}, 1fr)`,
            gap: layout.gap,
          }}
        >
          {keyword.points.map((p) => {
            const pin = rankColor(p.rank, p.status)
            return (
              <i
                key={`${p.row}-${p.col}`}
                style={{
                  gridRow: p.row + 1,
                  gridColumn: p.col + 1,
                  background: pin.bg,
                  color: pin.fg,
                  fontSize: layout.font ?? undefined,
                }}
              >
                {layout.font ? pin.label : null}
              </i>
            )
          })}
        </span>
      ) : (
        <span className="mt-card-grid-empty">Waiting to start</span>
      )}
      {/* Where a map carries its scale. */}
      <span className="mt-card-size">
        {n} × {n} · {radiusOf(scan)}
      </span>
    </span>
  )
}

type Tone = "pos" | "warn" | "neg" | "mute" | "brand"

/**
 * One word for how the keyword is doing, so the card answers "is this good?"
 * before anyone reads a percentage. Driven by the same two facts the numbers
 * below show: the top-3 share, and how much of the grid the business appears
 * in at all.
 */
function verdictOf(scan: ScanHistoryItem, keyword: ScanHistoryKeyword): { label: string; tone: Tone } | null {
  if (isRunning(scan.status)) {
    const pct = scan.totalPoints ? Math.round((scan.pointsDone / scan.totalPoints) * 100) : 0
    return { label: `Scanning ${pct}%`, tone: "brand" }
  }
  if (scan.status === "FAILED") return { label: "Failed", tone: "neg" }
  if (scan.status === "CANCELLED") return { label: "Cancelled", tone: "mute" }

  const scored = keyword.points.filter((p) => p.status === "SUCCEEDED")
  if (scored.length === 0) return null
  const found = scored.filter((p) => p.rank != null).length
  const top3 = keyword.solv ?? 0
  if (found === 0) return { label: "Not ranking", tone: "neg" }
  if (top3 >= 50) return { label: "Strong", tone: "pos" }
  if (top3 >= 15 || found / scored.length >= 0.5) return { label: "Mixed", tone: "warn" }
  return { label: "Weak", tone: "neg" }
}

const solvColor = (solv: number | null) =>
  solv == null ? undefined : solv >= 30 ? "var(--pos)" : solv >= 12 ? "var(--warn)" : "var(--neg)"

const radiusOf = (scan: ScanHistoryItem) =>
  scan.displayUnit === "IMPERIAL"
    ? `${(scan.radiusMeters / MILES_TO_METERS).toFixed(2)} mi`
    : `${(scan.radiusMeters / KM_TO_METERS).toFixed(2)} km`

const stampOf = (scan: ScanHistoryItem) =>
  `${new Date(scan.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ` +
  `${new Date(scan.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`

/** Only states worth reacting to get a note; "complete" is the norm. */
function noteOf(scan: ScanHistoryItem): { label: string; color: string } | null {
  if (scan.status === "PARTIAL") {
    return { label: `${scan.totalPoints - scan.pointsDone} points failed`, color: "var(--warn)" }
  }
  if (scan.status === "FAILED") {
    // The reason beats the word — "Failed" alone leaves nothing to do about it.
    return { label: scan.errorMessage ?? "Credits were returned", color: "var(--neg)" }
  }
  return null
}

function ReportCard({
  scan,
  keyword,
  onOpen,
}: {
  scan: ScanHistoryItem
  keyword: ScanHistoryKeyword
  onOpen: () => void
}) {
  const withResults = hasResults(scan.status)
  const scored = keyword.points.filter((p) => p.status === "SUCCEEDED")
  const found = scored.filter((p) => p.rank != null).length
  const verdict = verdictOf(scan, keyword)
  const note = noteOf(scan)

  return (
    <div className="mt-card-wrap">
      <button type="button" className="mt-card" onClick={onOpen}>
        <MapTile scan={scan} keyword={keyword} />
        <span className="mt-card-b">
          <span className="mt-card-t">
            <span style={{ minWidth: 0 }}>
              <span className="mt-card-kw">{keyword.keyword}</span>
              <span className="mt-card-biz">{scan.location.name}</span>
            </span>
            {verdict && <span className={`mt-card-verdict ${verdict.tone}`}>{verdict.label}</span>}
          </span>

          {/* Labelled, with the definition on hover: three numbers nobody has
              to already know the jargon for. */}
          <span className="mt-card-stats">
            <span title="Share of the grid where you rank in the top 3 on Google Maps">
              <span className="k">Top 3</span>
              <span className="v tabular" style={{ color: solvColor(keyword.solv) }}>
                {keyword.solv != null ? `${keyword.solv.toFixed(0)}%` : "—"}
              </span>
            </span>
            <span title="Your average position, counting only the points where you appear">
              <span className="k">Avg rank</span>
              <span className="v tabular">{keyword.arp != null ? keyword.arp.toFixed(1) : "—"}</span>
            </span>
            <span title="Grid points where you appear in the top 20, out of those searched">
              <span className="k">Found</span>
              <span className="v tabular">{scored.length ? `${found}/${scored.length}` : "—"}</span>
            </span>
          </span>

          <span className="mt-card-when">
            {stampOf(scan)}
            {note && <span style={{ color: note.color }}> · {note.label}</span>}
          </span>
        </span>
      </button>
      {/* No report for a scan with no results — it would open an empty one. */}
      {withResults && (
        <Link
          href={`/reports/maps-tracker/${scan.id}/${keyword.id}`}
          target="_blank"
          className="icon-btn mt-card-report"
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
 * Past scans, one card per keyword reading, newest first.
 *
 * A card rather than a table row, because the most useful thing about a scan
 * is its shape — where on the map the business is strong — and that needs room
 * to be drawn as a map rather than squeezed into a thumbnail. A run of several
 * keywords is several cards, each carrying its own business and date.
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
    <div className="mt-cards">
      {scans.flatMap((scan) =>
        scan.keywords.map((k) => (
          <ReportCard key={k.id} scan={scan} keyword={k} onOpen={() => onOpen(scan.id, k.id)} />
        )),
      )}
    </div>
  )
}
