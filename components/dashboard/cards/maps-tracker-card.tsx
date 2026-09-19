"use client"

/**
 * Google Maps Tracker — the latest grid scan, on the Overview.
 *
 * NO MAP. It carried two findings and both survive without it, for none of the
 * cost: a live Google map bills per load on the most-visited page in the app,
 * and the card is a reader's view that nobody pans or clicks.
 *
 *   how much of the area is green  ->  the band bar, which is the grid's shape
 *                                      with the geography taken out
 *   which side is weak             ->  a sentence naming the direction
 *
 * The direction line is arguably the better of the two: "weakest to the
 * south-east" is something you act on without interpreting a picture, and it
 * survives being read on a phone.
 *
 * Every colour comes out of RANK_BANDS rather than a palette of its own, on the
 * instruction grid.ts already carries — a band can never be painted a different
 * green from the pins it claims to describe — so this card and the scan report
 * agree by construction.
 *
 * The type scale is Position Tracking's, not its own: 13px labels, a 28px
 * figure in text-primary, 11px uppercase column heads, 13px rows, grid rows
 * rather than a table. Two cards in one column disagreeing about what a metric
 * looks like is what makes a dashboard read as assembled rather than designed.
 */

import { useMemo } from "react"
import { Link } from "@/i18n/navigation"
import { Widget } from "@/components/dashboard/widget"
import { RANK_BANDS, bandKeyFor } from "@/components/maps-tracker/grid"
import type { ScanHistoryItem, ScanHistoryKeyword, ScanHistoryPoint } from "@/components/maps-tracker/types"
import { cn } from "@/lib/utils"

const LIST = "/dashboard/google-maps-tracker"

/**
 * What an unranked point counts as when averaging.
 *
 * Not zero, which would read as the best possible rank and turn a dead corner
 * into the strongest one. The grid only looks 20 deep, so "worse than anything
 * we saw" is 21.
 */
const NOT_FOUND_RANK = 21

/** An axis only names a direction when its two sides differ by this much. */
const MIN_GAP = 1.5

/** Miles or kilometres, however the scan itself was set up. */
function radiusLabel(scan: ScanHistoryItem): string {
  const divisor = scan.displayUnit === "IMPERIAL" ? 1609.344 : 1000
  const unit = scan.displayUnit === "IMPERIAL" ? "mi" : "km"
  return `${(scan.radiusMeters / divisor).toFixed(1)} ${unit}`
}

function scanDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

/**
 * Which way the visibility leans.
 *
 * Row 0 is the northern edge of the grid and column 0 the western one, so the
 * halves of each axis are directly comparable. An axis only counts when its two
 * sides differ by more than MIN_GAP ranks — below that the grid is genuinely
 * even, and naming a direction anyway invents a finding out of noise. When
 * neither axis clears it this returns null and the card says nothing, which is
 * the honest outcome rather than a missing feature.
 */
function leaning(points: ScanHistoryPoint[], gridSize: number) {
  if (gridSize < 3) return null
  const mid = (gridSize - 1) / 2

  // A FAILED point has no rank because the search never ran — that is not
  // evidence about the business, so it is excluded rather than counted a miss.
  const rankOf = (p: ScanHistoryPoint) =>
    p.status === "SUCCEEDED" ? (p.rank ?? NOT_FOUND_RANK) : null

  const avg = (keep: (p: ScanHistoryPoint) => boolean): number | null => {
    const vals = points.filter(keep).map(rankOf).filter((v): v is number => v != null)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }

  const north = avg((p) => p.row < mid)
  const south = avg((p) => p.row > mid)
  const west = avg((p) => p.col < mid)
  const east = avg((p) => p.col > mid)

  const strong: string[] = []
  const weak: string[] = []
  let best: number | null = null
  let worst: number | null = null

  // Lower rank is better, so the smaller average is the strong side.
  if (north != null && south != null && Math.abs(north - south) >= MIN_GAP) {
    const northBetter = north < south
    strong.push(northBetter ? "north" : "south")
    weak.push(northBetter ? "south" : "north")
    best = Math.min(north, south)
    worst = Math.max(north, south)
  }
  if (west != null && east != null && Math.abs(west - east) >= MIN_GAP) {
    const westBetter = west < east
    strong.push(westBetter ? "west" : "east")
    weak.push(westBetter ? "east" : "west")
    const b = Math.min(west, east)
    const w = Math.max(west, east)
    best = best == null ? b : (best + b) / 2
    worst = worst == null ? w : (worst + w) / 2
  }

  if (strong.length === 0 || best == null || worst == null) return null
  return { strong: strong.join("-"), weak: weak.join("-"), best, worst }
}

export function MapsTrackerCard({ scan }: { scan: ScanHistoryItem }) {
  // The keyword the business does best on leads. Taking the first would make
  // the headline figure depend on what somebody happened to type first.
  const lead = useMemo<ScanHistoryKeyword | null>(() => {
    const scored = scan.keywords.filter((k) => k.solv != null)
    if (scored.length === 0) return scan.keywords[0] ?? null
    return scored.reduce((b, k) => ((k.solv ?? 0) > (b.solv ?? 0) ? k : b))
  }, [scan])

  // Points per band, in band order, dropping the bands this grid never reached:
  // a key listing six colours over a bar using three describes a chart that is
  // not on the screen.
  const bands = useMemo(() => {
    if (!lead) return []
    const counted = RANK_BANDS.map((b) => ({
      key: b.key,
      label: b.label,
      color: b.color,
      count: lead.points.filter((p) => bandKeyFor(p.rank, p.status) === b.key).length,
    })).filter((b) => b.count > 0)
    const total = counted.reduce((s, b) => s + b.count, 0)
    return counted.map((b) => ({ ...b, pct: total ? (b.count / total) * 100 : 0 }))
  }, [lead])

  const lean = useMemo(() => (lead ? leaning(lead.points, scan.gridSize) : null), [lead, scan.gridSize])

  if (!lead) return null

  const solv = lead.solv
  const running = scan.status === "QUEUED" || scan.status === "RUNNING"

  return (
    <Widget
      id="maps-tracker"
      title="Google Maps Tracker"
      hint="Where this business appears in Google Maps results across a grid of points around it. Each point on the grid is one real search."
      meta={
        <>
          <span className="max-w-[160px] truncate">{scan.location.name}</span>
          <Link href={`${LIST}/${scan.id}`} className="text-[13px] font-semibold text-primary hover:underline">
            View full report
          </Link>
        </>
      }
    >
      {/* The previous scan's figures stay put while a new one runs. Blanking the
          card for the fifty seconds a scan takes removes the only numbers
          anyone has, to say what this line is already saying. */}
      {running && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-[13px] font-medium text-primary">
          <span className="size-3 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />
          Scanning {scan.pointsDone} of {scan.totalPoints} points
        </div>
      )}

      <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Left — the share, the shape, and which way it leans. */}
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-muted-foreground">You rank in the top 3 at</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-2">
            <span
              className={cn(
                "text-[28px] font-bold leading-tight tracking-[-0.02em] tabular-nums",
                solv ? "text-primary" : "text-muted-foreground/50",
              )}
            >
              {solv != null ? `${solv.toFixed(0)}%` : "—"}
            </span>
            <span className="text-[13px] text-muted-foreground">of {lead.scoredPoints} points</span>
          </div>

          {/* The grid's shape in one line: how much of the area sits in which
              band. This is what the map was really being read for. */}
          <div className="mt-3.5 flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
            {bands.map((b) => (
              <span
                key={b.key}
                style={{ width: `${b.pct}%`, background: b.color }}
                title={`${b.label}: ${b.count}`}
              />
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[11px] text-muted-foreground">
            {bands.map((b) => (
              <span key={b.key} className="inline-flex items-center gap-1.5">
                <i className="size-2.5 shrink-0 rounded-[3px]" style={{ background: b.color }} />
                {b.label} <span className="tabular-nums">{b.count}</span>
              </span>
            ))}
          </div>

          {lean && (
            <p className="mt-4 rounded-lg bg-muted/60 px-3 py-2.5 text-[13px] leading-relaxed text-muted-foreground">
              Strongest to the <span className="font-semibold text-foreground">{lean.strong}</span>, weakest to
              the <span className="font-semibold text-foreground">{lean.weak}</span> — average rank{" "}
              <span className="tabular-nums">{lean.best.toFixed(1)}</span> against{" "}
              <span className="tabular-nums">{lean.worst.toFixed(1)}</span>.
            </p>
          )}
        </div>

        {/* Right — the same scan, keyword by keyword. Grid rows rather than a
            table, matching the keyword list in Position Tracking. */}
        <div className="min-w-0">
          <div className="grid grid-cols-[minmax(0,1fr)_56px_68px] gap-x-3 border-b pb-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
            <span>Keyword</span>
            <span className="text-right">Top 3</span>
            <span className="text-right">Avg rank</span>
          </div>
          {scan.keywords.map((k) => (
            <div
              key={k.id}
              className="grid grid-cols-[minmax(0,1fr)_56px_68px] items-center gap-x-3 border-b py-2 text-[13px] last:border-0"
            >
              <span className="truncate" title={k.keyword}>
                {k.keyword}
              </span>
              <span className="text-right font-semibold tabular-nums">
                {k.solv != null ? `${k.solv.toFixed(0)}%` : "—"}
              </span>
              {/* An em dash, never 0: a business that ranks nowhere has no
                  average rank, and 0 would read as a position. */}
              <span className="text-right tabular-nums text-muted-foreground">
                {k.arp != null ? k.arp.toFixed(1) : "—"}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-[13px] text-muted-foreground">
        <span>
          Scanned {scanDate(scan.createdAt)} · {scan.gridSize} × {scan.gridSize} grid · {radiusLabel(scan)}
        </span>
        <Link href={`${LIST}/new?from=${scan.id}`} className="font-semibold text-primary hover:underline">
          Re-scan
        </Link>
      </div>
    </Widget>
  )
}
