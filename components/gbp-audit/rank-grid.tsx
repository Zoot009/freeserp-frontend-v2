"use client"

// The audit's 3×3 rank grid on the real Google map, drawn exactly as Google
// Maps Tracker draws a scan: its ScanMap, its pins, its rank colours and bands.
// The grid IS a Maps Tracker scan, so it is shown the tracker's way. Without a
// key, or when Google refuses the one there is, the box says so instead of
// letting a map error take the whole report down.
import { Component, useEffect, useState, type ReactNode } from "react"
import { APIProvider } from "@vis.gl/react-google-maps"
import { MapPinOff } from "lucide-react"
import { ScanMap, type MapPinData } from "@/components/maps-tracker/scan-map"
import { formatDistance, RANK_BANDS, rankColor, type DistanceUnit } from "@/components/maps-tracker/grid"
import { pointPlace, type Grid } from "@/lib/gbp-audit"

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

const keyOf = (p: { row: number; col: number }) => `${p.row}:${p.col}`

/**
 * Contains a map that throws. A rejected key (InvalidKeyMapError, a referrer
 * restriction, billing off) makes the Maps library throw while the markers
 * mount, and uncaught that took the whole report down to the dashboard's error
 * page. Here it only replaces the map with a note.
 */
class MapBoundary extends Component<{ fallback: ReactNode; onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.warn("[gbp-audit] map failed to load:", error)
    this.props.onError()
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** The map box, and the band legend under it. */
export function RankGridView({
  grid,
  unit,
  selected,
  onSelect,
  size = "md",
  legend = true,
}: {
  grid: Grid
  unit: DistanceUnit
  selected: string | null
  onSelect: (key: string) => void
  /** sm: one of a row of small maps (the competitors' grids). */
  size?: "sm" | "md" | "lg"
  /** Off when several maps share one legend. */
  legend?: boolean
}) {
  const [mapFailed, setMapFailed] = useState(false)
  // The grid card runs the full width of the report, so the map can be tall
  // enough for its nine pins to sit apart.
  const height = size === "lg" ? 440 : size === "sm" ? 250 : 360

  // Google reports a rejected key through this global rather than by throwing.
  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) return
    const w = window as Window & { gm_authFailure?: () => void }
    const previous = w.gm_authFailure
    w.gm_authFailure = () => {
      setMapFailed(true)
      previous?.()
    }
    return () => {
      w.gm_authFailure = previous
    }
  }, [])

  const unavailable = (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-muted/40 px-6 text-center">
      <MapPinOff className="h-6 w-6 text-muted-foreground" />
      <p className="text-xs text-muted-foreground">
        {GOOGLE_MAPS_API_KEY
          ? "Google Maps didn’t load — check the Maps API key."
          : "Map unavailable — NEXT_PUBLIC_GOOGLE_MAPS_API_KEY isn’t configured."}
      </p>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border border-border" style={{ height }}>
        {GOOGLE_MAPS_API_KEY && !mapFailed ? (
          <MapBoundary fallback={unavailable} onError={() => setMapFailed(true)}>
            <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
              <ScanMap
                centerLat={grid.centerLat}
                centerLng={grid.centerLng}
                gridSize={grid.gridSize}
                radiusMeters={grid.radiusMeters}
                pins={grid.points.map<MapPinData>((p) => ({ row: p.row, col: p.col, lat: p.lat, lng: p.lng, status: p.status, rank: p.rank, pointId: keyOf(p) }))}
                unit={unit}
                showCenterMarker={false}
                interactive={false}
                zoomable
                openPointId={selected}
                onPinClick={(pin) => pin.pointId && onSelect(pin.pointId)}
                framePadding={0.14}
                pinBoost={size === "lg" ? 1.3 : size === "sm" ? 0.95 : 1.1}
              />
            </APIProvider>
          </MapBoundary>
        ) : (
          unavailable
        )}
      </div>
      {legend && <RankLegend spacing={formatDistance(grid.spacingMeters, unit)} />}
    </div>
  )
}

/** The rank bands' colours, and how far apart the points are. */
export function RankLegend({ spacing }: { spacing: string }) {
  return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {RANK_BANDS.map((b) => (
            <span key={b.key} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />
              {b.label}
            </span>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground">{spacing} between points</span>
      </div>
  )
}

/** One grid point opened: the business's rank there and the three that top the search. */
export function PointDetail({ grid, pointKey }: { grid: Grid; pointKey: string | null }) {
  const point = grid.points.find((p) => keyOf(p) === pointKey) ?? grid.points.find((p) => p.isCenter)!
  const c = rankColor(point.rank, point.status)
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold">{pointPlace(point.row, point.col, grid.gridSize)}</div>
        <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: c.bg, color: c.fg }}>
          {point.status === "FAILED" ? "No data" : point.rank ? `You: #${point.rank}` : "You: 20+"}
        </span>
      </div>
      {point.status === "FAILED" ? (
        <p className="mt-2 text-xs text-muted-foreground">This point&apos;s search didn&apos;t run, so it&apos;s left out of the numbers.</p>
      ) : (
        <ol className="mt-2 space-y-1.5">
          {point.top.map((t) => (
            <li key={`${t.rank}-${t.title}`} className={`flex items-center gap-2 text-xs ${t.isTarget ? "font-semibold text-brand" : ""}`}>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-card text-[10px] font-bold ring-1 ring-border">{t.rank}</span>
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              {t.rating !== null && (
                <span className="shrink-0 text-muted-foreground">
                  {t.rating.toFixed(1)}★{t.reviewCount !== null ? ` · ${t.reviewCount.toLocaleString()}` : ""}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export { keyOf as gridPointKey }
