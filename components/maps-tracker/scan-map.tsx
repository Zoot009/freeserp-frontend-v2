"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Map, AdvancedMarker, useMap } from "@vis.gl/react-google-maps"
import {
  bandKeyFor,
  deriveSpacingMeters,
  formatDistance,
  generateGrid,
  pointOffsetMeters,
  rankColor,
  type DistanceUnit,
  type PointStatus,
  type RankBandKey,
} from "./grid"

export interface MapPinData {
  row: number
  col: number
  lat: number
  lng: number
  status: PointStatus
  rank: number | null
  pointId?: string
}

// Google's publicly documented placeholder Map ID — works out of the box for
// Advanced Markers without a custom map style. Override with
// NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID once a styled map is configured.
const DEFAULT_MAP_ID = "DEMO_MAP_ID"

/**
 * Anchor every marker on its own centre.
 *
 * The library's defaults are anchorLeft "-50%" and anchorTop "-100%", i.e. the
 * bottom tip of a teardrop pin. Our pins are circles, so the default parked
 * each one a full pin-height ABOVE the coordinate it was reporting — on a tool
 * whose entire premise is "this dot is that street corner", that is wrong.
 *
 * `anchorPoint` would say the same thing in one prop but is deprecated as of
 * @vis.gl/react-google-maps 1.9.
 */
const CENTRE_ANCHOR = { anchorLeft: "-50%", anchorTop: "-50%" } as const

// Halo tuning. Named and kept together because these are the two numbers that
// decide whether the map reads as a coverage cloud or as scattered dots, and
// they want adjusting against real scans rather than reasoning.
//
// The ratio is against the grid SPACING, so the cloud keeps its density at any
// grid size or radius. Above ~1.0 each circle reaches its neighbour's centre
// and the field becomes continuous; below ~0.8 the points read separately.
const HALO_RADIUS_RATIO = 1.15;
// Low, because overlap is what does the work: where neighbouring points agree
// the fills stack and darken on their own. Raising this instead of the ratio
// makes individual discs obvious and muddies the overlaps.
const HALO_OPACITY = 0.16;
// Must stay visible, or a band filter looks like the halo layer was switched
// off rather than filtered.
const HALO_OPACITY_DIMMED = 0.03;

/**
 * The coverage cloud: one translucent circle per scored point, drawn under the
 * pins.
 *
 * `google.maps.Circle` rather than CSS, and the radius in METRES, because a
 * halo sized in pixels stays the same size as the user zooms — which would make
 * the cloud silently misstate how much ground each point represents. That is
 * the one thing a geo-grid tool cannot get wrong. Circles scale with zoom
 * natively; a radial-gradient on a marker does not.
 *
 * Overlapping low-opacity fills darken where points agree, which IS the effect.
 * No blur filter, no compositing tricks.
 *
 * FAILED points get no halo at all: the search never ran there, and painting
 * coverage over a hole would render our own outage as data.
 */
function HaloLayer({
  pins,
  spacingMeters,
  dimBand,
  rankFor,
}: {
  pins: MapPinData[]
  spacingMeters: number
  dimBand: RankBandKey | null
  /** Which rank to colour a pin by — the target's, or a compared competitor's. */
  rankFor: (pin: MapPinData) => number | null
}) {
  const map = useMap()
  const circlesRef = useRef<google.maps.Circle[]>([])

  useEffect(() => {
    if (!map || typeof google === "undefined" || !google.maps?.Circle) return

    const circles = pins
      .filter((p) => p.status === "SUCCEEDED")
      .map((p) => {
        const rank = rankFor(p)
        const dimmed = dimBand != null && bandKeyFor(rank, p.status) !== dimBand
        return new google.maps.Circle({
          map,
          center: { lat: p.lat, lng: p.lng },
          radius: spacingMeters * HALO_RADIUS_RATIO,
          fillColor: rankColor(rank, p.status).bg,
          fillOpacity: dimmed ? HALO_OPACITY_DIMMED : HALO_OPACITY,
          strokeWeight: 0,
          clickable: false,
          zIndex: 0,
        })
      })

    circlesRef.current = circles
    return () => {
      for (const c of circles) c.setMap(null)
      circlesRef.current = []
    }
  }, [map, pins, spacingMeters, dimBand, rankFor])

  return null
}

function CenterMarker({
  lat,
  lng,
  onCenterChange,
}: {
  lat: number
  lng: number
  /** When set, the marker is draggable — dropping it moves the grid to preview
   *  ranking from that spot instead of the business's stored address. */
  onCenterChange?: (lat: number, lng: number) => void
}) {
  return (
    <AdvancedMarker
      position={{ lat, lng }}
      zIndex={10}
      {...CENTRE_ANCHOR}
      draggable={onCenterChange != null}
      onDragEnd={(e) => {
        const pos = e.latLng
        if (pos && onCenterChange) onCenterChange(pos.lat(), pos.lng())
      }}
    >
      {/* Brand blue, not the red it used to be: #DC2626 is also the "ranked
          16-20" colour on this very map, so a red centre marker was
          indistinguishable from a bad result sitting on top of the business. */}
      <div
        className="mt-pin mt-pin--centre"
        style={{ cursor: onCenterChange ? "grab" : "default" }}
        title={onCenterChange ? "Drag to preview ranking from a different spot" : undefined}
        aria-label="Business location"
      />
    </AdvancedMarker>
  )
}

/**
 * Pin diameter, by how many pins share the map.
 *
 * One fixed size cannot serve both ends of the grid range. 26px was chosen so
 * that 121 pins at 11x11 do not read as a wall of circles — but the same pin on
 * a 3x3, which spreads nine points over a mile and a half, is a speck sitting
 * on a city block, and the rank inside it is barely legible.
 *
 * So it scales with the grid. Small grids have the room and take it; dense
 * grids keep roughly what they had. The idle and live variants derive from the
 * same number at the ratios they already used (12/26 and 16/26), so the three
 * states stay in proportion at every size.
 */
function pinScale(gridSize: number): { scored: number; font: number; idle: number; live: number } {
  const scored =
    gridSize <= 5 ? 38
    : gridSize <= 7 ? 34
    : gridSize <= 9 ? 30
    : gridSize <= 11 ? 28
    : gridSize <= 15 ? 26
    : 24
  return {
    scored,
    font: Math.round(scored * 0.44 * 10) / 10,
    idle: Math.round(scored * 0.46),
    live: Math.round(scored * 0.62),
  }
}

function GridPin({
  pin,
  rank,
  spacingMeters,
  gridSize,
  unit,
  dimmed,
  open,
  onClick,
}: {
  pin: MapPinData
  /** Whose rank is being drawn — the target's, or a compared competitor's. */
  rank: number | null
  spacingMeters: number
  gridSize: number
  unit: DistanceUnit
  dimmed: boolean
  open: boolean
  onClick?: () => void
}) {
  const color = rankColor(rank, pin.status)
  const idle = pin.status === "PENDING"
  const live = pin.status === "RUNNING"
  const scored = !idle && !live

  const { distanceMeters, bearing } = pointOffsetMeters(pin.row, pin.col, gridSize, spacingMeters)
  const where = `${formatDistance(distanceMeters, unit)} ${bearing}`
  const what =
    pin.status === "FAILED" ? "Search failed here"
    : rank != null ? `Rank #${rank}`
    : pin.status === "SUCCEEDED" ? "Not in the top 20"
    : "Not searched yet"

  const cls = [
    "mt-pin",
    idle ? "mt-pin--idle" : live ? "mt-pin--live" : "mt-pin--scored",
    dimmed ? "mt-pin--dim" : "",
    open ? "mt-pin--open" : "",
  ].filter(Boolean).join(" ")

  // The scale on :hover lives on this element, while the library applies the
  // anchor offset as a transform on the wrapper it renders around it. Putting
  // both on one node would make the pin jump off its coordinate on hover.
  // Size is inline rather than a CSS class because it varies per scan. The
  // stylesheet still carries the defaults, so a pin renders correctly even if
  // this is ever bypassed.
  const size = pinScale(gridSize)
  // "20+" is the only three-character label and the one a weak scan is full
  // of, so it gets a slightly smaller face rather than touching its ring.
  const fontSize = color.label.length >= 3 ? Math.round(size.font * 0.82 * 10) / 10 : size.font
  const content = (
    <span
      className={cls}
      style={
        scored
          ? {
              background: color.bg,
              color: color.fg,
              width: size.scored,
              height: size.scored,
              fontSize,
            }
          : idle
            ? { width: size.idle, height: size.idle }
            : { width: size.live, height: size.live }
      }
      title={`${what} · ${where}`}
    >
      {scored ? color.label : ""}
    </span>
  )

  return (
    <AdvancedMarker
      position={{ lat: pin.lat, lng: pin.lng }}
      zIndex={idle ? 1 : live ? 3 : open ? 6 : 5}
      {...CENTRE_ANCHOR}
      onClick={onClick}
    >
      {onClick ? (
        <button type="button" className="mt-pin-hit" onClick={onClick} aria-label={`${what}, ${where}`}
          style={{ border: "none", background: "none", padding: 0, cursor: "pointer" }}>
          {content}
        </button>
      ) : (
        content
      )}
    </AdvancedMarker>
  )
}

// Assumes an ancestor <APIProvider> (see page.tsx — it wraps the whole page so
// LocationPicker's useMapsLibrary("places") shares the same Maps JS context
// as this map, rather than each component loading/checking for its own).
export function ScanMap({
  centerLat,
  centerLng,
  gridSize,
  radiusMeters,
  pins,
  onPinClick,
  defaultZoom = 14,
  showCenterMarker = true,
  onCenterChange,
  dimBand = null,
  openPointId = null,
  unit = "IMPERIAL",
  interactive = true,
  rankOverride = null,
  haloes = true,
}: {
  centerLat: number
  centerLng: number
  gridSize: number
  radiusMeters: number
  /** When null, idle preview pins are generated locally (pre-scan). Once a scan exists, pass its live points. */
  pins: MapPinData[] | null
  onPinClick?: (pin: MapPinData) => void
  /** Initial zoom before any fitBounds call — lower before a location is picked so the map isn't zoomed into an arbitrary fallback point. */
  defaultZoom?: number
  /** False before a real business location is chosen — there's nothing to mark yet. */
  showCenterMarker?: boolean
  /** Makes the center pin draggable — provide only pre-scan; a running/completed scan's center is locked (it's what was actually scanned). */
  onCenterChange?: (lat: number, lng: number) => void
  /** When set, pins outside this rank band fade back so the band stands alone. */
  dimBand?: RankBandKey | null
  /** The pin whose drawer is open — gets a ring so the drawer has a visible source. */
  openPointId?: string | null
  /** Only affects the distance shown in a pin's tooltip. */
  unit?: DistanceUnit
  /** False on the report: a reader looks, they don't pan or click. */
  interactive?: boolean
  /**
   * "Compare on map": `row:col` -> that competitor's rank at the point. When
   * set, every pin and halo is drawn from THIS instead of the target's own
   * rank. A key that is absent means the competitor was not in the top 20
   * there — a real not-found, drawn exactly as the target's would be.
   */
  rankOverride?: Map<string, number | null> | null
  /** Off for the pre-scan preview, where there is nothing to shade. */
  haloes?: boolean
}) {
  const spacingMeters = deriveSpacingMeters(gridSize, radiusMeters)

  // Stable identity so HaloLayer's effect doesn't tear down and rebuild every
  // circle on each two-second poll.
  const rankFor = useCallback(
    (pin: MapPinData): number | null =>
      rankOverride ? (rankOverride.get(`${pin.row}:${pin.col}`) ?? null) : pin.rank,
    [rankOverride],
  )

  const previewPins = useMemo<MapPinData[]>(() => {
    if (pins) return pins
    if (radiusMeters <= 0) return []
    return generateGrid(centerLat, centerLng, gridSize, radiusMeters)
      .filter((p) => !p.isCenter)
      .map((p) => ({ row: p.row, col: p.col, lat: p.lat, lng: p.lng, status: "PENDING" as PointStatus, rank: null }))
  }, [pins, centerLat, centerLng, gridSize, radiusMeters])

  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null)
  // Set the moment the user drags the map. After that we never re-frame it —
  // yanking the view back while someone is examining a corner is worse than
  // an imperfect fit.
  const [userMoved, setUserMoved] = useState(false)
  const [sizeTick, setSizeTick] = useState(0)

  // The map card's height changes between screens: the tall setup rail is
  // replaced by three short progress cards when a scan starts, so the map gets
  // shorter. A fitBounds computed at the old height is never corrected, which
  // left the whole grid as a speck in the middle of a city while the scan ran
  // — exactly when the pins landing are the thing worth watching.
  useEffect(() => {
    if (!mapInstance || typeof ResizeObserver === "undefined") return
    const el = mapInstance.getDiv()
    if (!el) return
    const ro = new ResizeObserver(() => setSizeTick((t) => t + 1))
    ro.observe(el)
    return () => ro.disconnect()
  }, [mapInstance])

  // A new area to frame means the user's old pan no longer applies.
  useEffect(() => {
    setUserMoved(false)
  }, [centerLat, centerLng, gridSize, radiusMeters])

  // Framed from the grid's geometry rather than from `pins`, which is a fresh
  // array on every two-second poll — fitting off that would re-frame the map
  // continuously while a scan ran.
  useEffect(() => {
    // Nothing to fit yet (no location picked, radiusMeters is 0) — leave the
    // default center/zoom alone rather than collapsing to a single-point zoom.
    if (!mapInstance || radiusMeters <= 0 || userMoved) return
    const grid = generateGrid(centerLat, centerLng, gridSize, radiusMeters)
    if (grid.length === 0) return
    const bounds = new google.maps.LatLngBounds()
    for (const p of grid) bounds.extend({ lat: p.lat, lng: p.lng })
    // Padding scales with the viewport rather than the old flat 48px, which was
    // tuned when the map was a ~400px card. On the full-height canvas a fixed
    // 48 left a large grid as a speck with empty map all around it; on a phone
    // the same 48 ate most of the width. Proportional, then clamped.
    const el = mapInstance.getDiv()
    const smaller = el ? Math.min(el.clientWidth, el.clientHeight) : 400
    const pad = Math.round(Math.max(28, Math.min(96, smaller * 0.08)))
    mapInstance.fitBounds(bounds, pad)
  }, [mapInstance, centerLat, centerLng, gridSize, radiusMeters, sizeTick, userMoved])

  return (
    <Map
      mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || DEFAULT_MAP_ID}
      defaultCenter={{ lat: centerLat, lng: centerLng }}
      defaultZoom={defaultZoom}
      // "greedy" captured every mouse-wheel tick for map zoom, so scrolling
      // the page while the cursor happened to be over the map did nothing.
      // "cooperative" requires Ctrl/Cmd+scroll to zoom the map (shows a small
      // hint overlay) and passes a plain wheel-scroll through to the page —
      // the standard fix for an embedded map inside a scrollable page.
      gestureHandling={interactive ? "cooperative" : "none"}
      disableDefaultUI={!interactive}
      onIdle={(e) => setMapInstance(e.map)}
      onDragstart={() => setUserMoved(true)}
      style={{ width: "100%", height: "100%" }}
    >
      {showCenterMarker && (
        <CenterMarker lat={centerLat} lng={centerLng} onCenterChange={interactive ? onCenterChange : undefined} />
      )}
      {haloes && (
        <HaloLayer pins={previewPins} spacingMeters={spacingMeters} dimBand={dimBand} rankFor={rankFor} />
      )}
      {previewPins.map((p) => (
        <GridPin
          key={`${p.row}-${p.col}`}
          pin={p}
          rank={rankFor(p)}
          gridSize={gridSize}
          spacingMeters={spacingMeters}
          unit={unit}
          dimmed={dimBand != null && bandKeyFor(rankFor(p), p.status) !== dimBand}
          open={openPointId != null && p.pointId === openPointId}
          // Only SUCCEEDED pins have a top-results payload to show — only
          // those look/act clickable, so hover state doesn't lie.
          onClick={interactive && onPinClick && p.status === "SUCCEEDED" ? () => onPinClick(p) : undefined}
        />
      ))}
    </Map>
  )
}
