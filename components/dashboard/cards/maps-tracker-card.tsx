"use client"

/**
 * Google Maps Tracker — the latest grid scan, on the Overview.
 *
 * Position Tracking is recognisable by its area chart; this tool is
 * recognisable by the GRID, so the grid is what the card leads with. A strong
 * centre with weak edges is a different problem from being weak everywhere, and
 * an average is exactly the thing that hides the difference — which is the
 * argument for the tool existing at all, so a card that showed only averages
 * would be arguing against its own product.
 *
 * Every colour here comes out of rankColor()/RANK_BANDS rather than a palette
 * of its own, on the instruction grid.ts already carries: a band can never be
 * painted a different green from the pins it claims to describe. The scan
 * detail page and this card therefore agree by construction.
 *
 * Nothing new is fetched. /api/maps-tracker/scans already returns solv, arp,
 * scoredPoints and the per-point ranks for every scan; this reads the newest
 * completed one.
 */

import { useMemo } from "react"
import { APIProvider } from "@vis.gl/react-google-maps"
import { Link } from "@/i18n/navigation"
import { Widget } from "@/components/dashboard/widget"
import { Skeleton } from "@/components/ui/skeleton"
import { rankColor, RANK_BANDS } from "@/components/maps-tracker/grid"
import { ScanMap, type MapPinData } from "@/components/maps-tracker/scan-map"
import type { Scan, ScanKeyword } from "@/components/maps-tracker/types"

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

const LIST = "/dashboard/google-maps-tracker"

/** Miles or kilometres, however the scan itself was set up. */
function radiusLabel(scan: Scan): string {
  const divisor = scan.displayUnit === "IMPERIAL" ? 1609.344 : 1000
  const unit = scan.displayUnit === "IMPERIAL" ? "mi" : "km"
  return `${(scan.radiusMeters / divisor).toFixed(1)} ${unit}`
}

function scanDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

/**
 * The bare grid — the fallback when there is no Maps key configured.
 *
 * It holds the same information as the map, minus where any of it is, so it is
 * worth having when the map cannot load: a card that renders nothing because an
 * API key is missing is worse than one that renders the ranks without the
 * streets they sit on.
 *
 * Ranks are drawn for a 3x3 and a 5x5 and dropped beyond that: past 25 cells
 * the number is smaller than the eye can use in a card this wide, and the
 * colour is carrying the reading anyway.
 */
function MiniGrid({ keyword, gridSize }: { keyword: ScanKeyword; gridSize: number }) {
  const cells = useMemo(() => {
    const byIndex = new Map<string, (typeof keyword.points)[number]>()
    for (const p of keyword.points) byIndex.set(`${p.row}:${p.col}`, p)
    return Array.from({ length: gridSize * gridSize }, (_, i) => {
      const row = Math.floor(i / gridSize)
      const col = i % gridSize
      return byIndex.get(`${row}:${col}`) ?? null
    })
  }, [keyword.points, gridSize])

  const showNumbers = gridSize <= 5

  return (
    <div
      className="grid w-full max-w-[212px] gap-1"
      style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`, aspectRatio: "1 / 1" }}
      role="img"
      aria-label={`${gridSize} by ${gridSize} grid of ranks for ${keyword.keyword}`}
    >
      {cells.map((p, i) => {
        // A point with no row in the payload is a gap in the data, not a
        // ranking of any kind, so it gets the neutral treatment rather than
        // being coloured as if the search had run and found nothing.
        if (!p) return <div key={i} className="rounded-[5px] bg-muted" />
        const c = rankColor(p.rank, p.status)
        return (
          <div
            key={i}
            className="grid place-items-center rounded-[5px] text-[11.5px] font-semibold tabular-nums"
            style={{ background: c.bg, color: c.fg }}
            title={p.rank != null ? `Rank ${p.rank}` : "Not found here"}
          >
            {showNumbers ? c.label : ""}
          </div>
        )
      })}
    </div>
  )
}

export function MapsTrackerCard({
  scan,
  loading,
}: {
  /** The newest completed scan, in full — the per-point coordinates are what
   *  put the ranks on a map rather than in a bare grid. */
  scan: Scan | null
  loading: boolean
}) {
  // The keyword the business does best on leads the grid. Showing the first
  // keyword alphabetically would make the headline figure depend on what
  // somebody happened to type first.
  const lead = useMemo(() => {
    if (!scan) return null
    const scored = scan.keywords.filter((k) => k.solv != null)
    if (scored.length === 0) return scan.keywords[0] ?? null
    return scored.reduce((best, k) => ((k.solv ?? 0) > (best.solv ?? 0) ? k : best))
  }, [scan])

  if (loading) {
    return (
      <Widget id="maps-tracker" title="Google Maps Tracker">
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-[260px] w-full" />
          <Skeleton className="h-[260px] w-full" />
        </div>
      </Widget>
    )
  }

  if (!scan || !lead) return null

  const solv = lead.solv
  const running = scan.status === "QUEUED" || scan.status === "RUNNING"

  // One pin per point of the LEAD keyword. The map draws one keyword at a time
  // for the same reason the grid did: five keywords of pins stacked on one
  // coordinate is a colour nobody can read back to a rank.
  const pins: MapPinData[] = lead.points.map((pt) => ({
    row: pt.row,
    col: pt.col,
    lat: pt.latitude,
    lng: pt.longitude,
    status: pt.status,
    rank: pt.rank,
    pointId: pt.id,
  }))
  const bandsInUse = RANK_BANDS.filter((b) => lead.points.some((p) => p.status === "SUCCEEDED" && b.test(p.rank)))

  return (
    <Widget
      id="maps-tracker"
      title="Google Maps Tracker"
      bodyClassName="p-0"
      hint="Where this business appears in Google Maps results across a grid of points around it. Each cell is one real search."
      meta={
        <div className="flex items-center gap-2.5">
          <span className="max-w-[150px] truncate text-[12.5px] text-muted-foreground">{scan.location.name}</span>
          <Link href={`${LIST}/${scan.id}`} className="whitespace-nowrap text-[12.5px] font-medium text-primary hover:underline">
            View full report ↗
          </Link>
        </div>
      }
    >
      {/* Progress replaces nothing: the previous scan's figures stay visible
          underneath. Blanking the card for the ~50s a scan takes would remove
          the only numbers anyone has, to say what this line already says. */}
      {running && (
        <div className="-mt-px flex items-center gap-2 border-b bg-primary/10 px-4 py-2.5 text-[12.5px] font-medium text-primary">
          <span className="size-3 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />
          Scanning {scan.pointsDone} of {scan.totalPoints} points
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        {/* Left — the share, then the grid it was measured from. */}
        <div className="min-w-0 p-4">
          <div className="text-[12.5px] text-muted-foreground">You rank in the top 3 at</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-2">
            <span className="text-[38px] font-bold leading-none tracking-[-0.03em] tabular-nums">
              {solv != null ? `${solv.toFixed(0)}%` : "—"}
            </span>
            <span className="text-[13px] text-muted-foreground">of {lead.scoredPoints} points</span>
          </div>

          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, Math.max(0, solv ?? 0))}%`,
                background: rankColor(1, "SUCCEEDED").bg,
              }}
            />
          </div>
          <div className="mt-2 text-[11.5px] text-muted-foreground">
            Share of Local Voice · {lead.keyword}
          </div>

          <div className="mt-5">
            {/* The ranks where they actually are. A 3x3 of coloured squares
                says how many points are green; the map says WHICH SIDE of the
                business is green, and that is the finding somebody acts on --
                you cannot open a second location on the strength of a square.

                interactive={false}, as on the report: this is a reader's view,
                not a tool. Clicking through to the full report is the way in. */}
            {GOOGLE_MAPS_API_KEY ? (
              <div className="overflow-hidden rounded-lg border" style={{ height: 232 }}>
                <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
                  <ScanMap
                    centerLat={scan.centerLat}
                    centerLng={scan.centerLng}
                    gridSize={scan.gridSize}
                    radiusMeters={scan.radiusMeters}
                    pins={pins}
                    unit={scan.displayUnit}
                    interactive={false}
                    showCenterMarker
                    defaultZoom={13}
                  />
                </APIProvider>
              </div>
            ) : (
              <MiniGrid keyword={lead} gridSize={scan.gridSize} />
            )}
            {/* Only the bands actually present. A legend listing six colours
                over a grid using three is a key to a map that does not exist. */}
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
              {bandsInUse.map((b) => (
                <span key={b.key} className="inline-flex items-center gap-1.5">
                  <i className="size-2.5 shrink-0 rounded-[3px]" style={{ background: b.color }} />
                  {b.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Right — the same scan, keyword by keyword. */}
        <div className="min-w-0 border-t p-4 md:border-l md:border-t-0">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                <th className="pb-2 text-left font-semibold">Keyword</th>
                <th className="pb-2 text-right font-semibold">Top 3</th>
                <th className="pb-2 text-right font-semibold">Avg rank</th>
              </tr>
            </thead>
            <tbody>
              {scan.keywords.map((k) => (
                <tr key={k.id} className="border-t">
                  <td className="max-w-0 truncate py-2.5 pr-2.5 font-medium" title={k.keyword}>
                    {k.keyword}
                  </td>
                  <td className="py-2.5 text-right tabular-nums">
                    <span className="relative inline-block min-w-[46px] text-right">
                      <i
                        className="absolute inset-y-0.5 right-0 rounded-[3px]"
                        style={{
                          width: `${Math.max(3, k.solv ?? 0)}%`,
                          background: `color-mix(in srgb, ${rankColor(1, "SUCCEEDED").bg} 16%, transparent)`,
                        }}
                      />
                      <span className="relative px-1 font-semibold">
                        {k.solv != null ? `${k.solv.toFixed(0)}%` : "—"}
                      </span>
                    </span>
                  </td>
                  {/* An em dash, never 0: a business that ranks nowhere has no
                      average rank, and 0 would read as a position. */}
                  <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                    {k.arp != null ? k.arp.toFixed(1) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/40 px-4 py-2.5 text-[12px] text-muted-foreground">
        <span>
          Scanned {scanDate(scan.createdAt)} · {scan.gridSize} × {scan.gridSize} grid · {radiusLabel(scan)} radius
        </span>
        <Link href={`${LIST}/new?from=${scan.id}`} className="whitespace-nowrap font-medium text-primary hover:underline">
          Re-scan
        </Link>
      </div>
    </Widget>
  )
}
