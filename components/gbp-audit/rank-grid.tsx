"use client"

// The audit's 3×3 rank grid, drawn the way Google Maps Tracker draws a scan:
// the same rank colours and bands, and — when a Maps key is configured — the
// tracker's own map with its own pins. Without a key, or when Google refuses the
// one there is, it falls back to a heatmap tile grid, so the report never shows
// an empty box or loses the page to a map error.
import { Component, useEffect, useState, type ReactNode } from "react"
import { APIProvider } from "@vis.gl/react-google-maps"
import { Grid3x3, Map as MapIcon, MapPin } from "lucide-react"
import { ScanMap, type MapPinData } from "@/components/maps-tracker/scan-map"
import { formatDistance, RANK_BANDS, rankColor, type DistanceUnit } from "@/components/maps-tracker/grid"
import { pointPlace, type Grid, type GridPoint } from "@/lib/gbp-audit"

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

const keyOf = (p: { row: number; col: number }) => `${p.row}:${p.col}`

/**
 * Contains a map that throws. A rejected key (InvalidKeyMapError, a referrer
 * restriction, billing off) makes the Maps library throw while the markers
 * mount, and uncaught that took the whole report down to the dashboard's error
 * page. Here it only swaps the map for the tile grid.
 */
class MapBoundary extends Component<{ fallback: ReactNode; onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.warn("[gbp-audit] map failed, showing the tile grid instead:", error)
    this.props.onError()
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** The view switch, the grid itself (map or tiles), and the band legend. */
export function RankGridView({
  grid,
  unit,
  selected,
  onSelect,
  size = "md",
}: {
  grid: Grid
  unit: DistanceUnit
  selected: string | null
  onSelect: (key: string) => void
  size?: "md" | "lg"
}) {
  const [view, setView] = useState<"map" | "tiles">(GOOGLE_MAPS_API_KEY ? "map" : "tiles")
  const [mapFailed, setMapFailed] = useState(false)
  const height = size === "lg" ? 500 : 320

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

  const tiles = <TileGrid grid={grid} selected={selected} onSelect={onSelect} />
  const canMap = !!GOOGLE_MAPS_API_KEY && !mapFailed
  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border border-border" style={{ height }}>
        {view === "map" && canMap ? (
          <MapBoundary fallback={tiles} onError={() => setMapFailed(true)}>
            <APIProvider apiKey={GOOGLE_MAPS_API_KEY!}>
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
                framePadding={0.12}
                pinBoost={size === "lg" ? 1.5 : 1.25}
              />
            </APIProvider>
          </MapBoundary>
        ) : (
          tiles
        )}
        {mapFailed && (
          <div className="absolute bottom-2 left-2 right-2 z-10 rounded-lg bg-card/95 px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-sm ring-1 ring-border print:hidden">
            Google Maps didn&apos;t load (check the Maps API key), so the grid is shown without the map.
          </div>
        )}
        {canMap && (
          <div className="absolute left-2 top-2 z-10 flex rounded-lg border border-border bg-card/95 p-0.5 text-[11px] font-medium shadow-sm backdrop-blur print:hidden">
            {(
              [
                ["map", MapIcon, "Map"],
                ["tiles", Grid3x3, "Grid"],
              ] as const
            ).map(([v, Icon, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`flex items-center gap-1 rounded-md px-2 py-1 transition-colors ${view === v ? "bg-brand text-white" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Icon className="h-3 w-3" /> {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {RANK_BANDS.map((b) => (
            <span key={b.key} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />
              {b.label}
            </span>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground">{formatDistance(grid.spacingMeters, unit)} between points</span>
      </div>
    </div>
  )
}

/** The fallback: nine rank tiles on a stylised street grid, the business at the centre. */
function TileGrid({ grid, selected, onSelect }: { grid: Grid; selected: string | null; onSelect: (key: string) => void }) {
  const ordered = [...grid.points].sort((a, b) => a.row - b.row || a.col - b.col)
  return (
    <div className="relative h-full w-full bg-[#e9eef5] dark:bg-[#111823]">
      {/* Streets and blocks, so the tiles read as places rather than a table. */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-70 dark:opacity-[0.12]"
        style={{
          backgroundImage:
            "linear-gradient(0deg, transparent 47%, rgba(255,255,255,.95) 47%, rgba(255,255,255,.95) 53%, transparent 53%), linear-gradient(90deg, transparent 47%, rgba(255,255,255,.95) 47%, rgba(255,255,255,.95) 53%, transparent 53%)",
          backgroundSize: "64px 64px",
        }}
      />
      {/* One main road across the blocks, under the tiles. */}
      <div aria-hidden className="absolute -left-10 top-[58%] h-5 w-[140%] -rotate-[8deg] bg-white/90 dark:bg-white/10" />

      <div className="absolute inset-0 m-auto grid aspect-square h-[82%] max-w-full grid-cols-3 grid-rows-3 place-items-center">
        {ordered.map((p) => (
          <Tile key={keyOf(p)} point={p} size={grid.gridSize} selected={selected === keyOf(p)} onClick={() => onSelect(keyOf(p))} />
        ))}
      </div>
    </div>
  )
}

function Tile({ point, size, selected, onClick }: { point: GridPoint; size: number; selected: boolean; onClick: () => void }) {
  const c = rankColor(point.rank, point.status)
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${pointPlace(point.row, point.col, size)}: ${point.status === "FAILED" ? "search failed" : point.rank ? `#${point.rank}` : "not in the top 20"}`}
      className={`relative flex h-14 w-14 items-center justify-center rounded-full text-base font-bold shadow-[0_6px_16px_-6px_rgba(15,23,42,.55)] ring-4 transition-transform hover:scale-110 sm:h-16 sm:w-16 sm:text-lg ${
        selected ? "scale-110 ring-brand" : "ring-white/90 dark:ring-white/20"
      }`}
      style={{ background: c.bg, color: c.fg }}
    >
      {c.label}
      {point.isCenter && (
        <span className="absolute -top-3 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full bg-[#0f2440] text-white shadow ring-2 ring-white">
          <MapPin className="h-3.5 w-3.5" />
        </span>
      )}
    </button>
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
