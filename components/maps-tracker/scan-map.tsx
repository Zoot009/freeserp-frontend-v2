"use client"

import { useEffect, useMemo, useState } from "react"
import { Map, AdvancedMarker } from "@vis.gl/react-google-maps"
import { generateGrid, rankColor, type PointStatus } from "./grid"

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
      draggable={onCenterChange != null}
      onDragEnd={(e) => {
        const pos = e.latLng
        if (pos && onCenterChange) onCenterChange(pos.lat(), pos.lng())
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          border: "3px solid #DC2626",
          background: "rgba(220,38,38,0.15)",
          boxSizing: "border-box",
          cursor: onCenterChange ? "grab" : "default",
        }}
        title={onCenterChange ? "Drag to preview ranking from a different spot" : undefined}
        aria-label="Business location"
      />
    </AdvancedMarker>
  )
}

function GridPin({ pin, onClick }: { pin: MapPinData; onClick?: () => void }) {
  const color = rankColor(pin.rank, pin.status)
  const idle = pin.status === "PENDING"
  return (
    <AdvancedMarker position={{ lat: pin.lat, lng: pin.lng }} onClick={onClick}>
      <div
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={(e) => {
          if (onClick && (e.key === "Enter" || e.key === " ")) onClick()
        }}
        style={{
          width: idle ? 14 : 26,
          height: idle ? 14 : 26,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          fontSize: 11,
          fontWeight: 700,
          cursor: onClick ? "pointer" : "default",
          background: idle ? "transparent" : color.bg,
          color: color.fg,
          border: idle ? "2px solid #9CA3AF" : pin.status === "RUNNING" ? "2px solid #FFFFFF" : "none",
          opacity: pin.status === "RUNNING" ? 0.75 : 1,
          boxShadow: idle ? "none" : "0 1px 3px rgba(0,0,0,0.3)",
        }}
        aria-label={`Point ${pin.row},${pin.col}${pin.rank != null ? `, rank ${pin.rank}` : ""}`}
      >
        {!idle && color.label}
      </div>
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
}) {
  const previewPins = useMemo<MapPinData[]>(() => {
    if (pins) return pins
    if (radiusMeters <= 0) return []
    return generateGrid(centerLat, centerLng, gridSize, radiusMeters)
      .filter((p) => !p.isCenter)
      .map((p) => ({ row: p.row, col: p.col, lat: p.lat, lng: p.lng, status: "PENDING" as PointStatus, rank: null }))
  }, [pins, centerLat, centerLng, gridSize, radiusMeters])

  // Re-fit bounds whenever the settings change (before a scan runs) — the
  // preview must be live, per spec §10.9. Once a scan is in flight we
  // deliberately do NOT re-fit, so the user can examine a specific area.
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null)
  useEffect(() => {
    // Nothing to fit yet (no location picked, radiusMeters is 0) — leave the
    // default center/zoom alone rather than collapsing to a single-point zoom.
    if (!mapInstance || pins || previewPins.length === 0) return
    const bounds = new google.maps.LatLngBounds()
    bounds.extend({ lat: centerLat, lng: centerLng })
    for (const p of previewPins) bounds.extend({ lat: p.lat, lng: p.lng })
    mapInstance.fitBounds(bounds, 48)
  }, [mapInstance, previewPins, centerLat, centerLng, pins])

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
      gestureHandling="cooperative"
      disableDefaultUI={false}
      onIdle={(e) => setMapInstance(e.map)}
      style={{ width: "100%", height: "100%" }}
    >
      {showCenterMarker && <CenterMarker lat={centerLat} lng={centerLng} onCenterChange={onCenterChange} />}
      {previewPins.map((p) => (
        <GridPin
          key={`${p.row}-${p.col}`}
          pin={p}
          // Only SUCCEEDED pins have a top-results payload to show — only
          // those look/act clickable, so hover state doesn't lie.
          onClick={onPinClick && p.status === "SUCCEEDED" ? () => onPinClick(p) : undefined}
        />
      ))}
    </Map>
  )
}
