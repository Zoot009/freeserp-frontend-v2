"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { APIProvider } from "@vis.gl/react-google-maps"
import { ScanMap, type MapPinData } from "./scan-map"
import { RankLegend } from "./rank-distribution"
import { CompetitorList } from "./competitor-list"
import { PointDrawer } from "./point-drawer"
import { AiAnalysis } from "./ai-analysis"
import { MILES_TO_METERS, KM_TO_METERS, deriveSpacingMeters, formatDistance } from "./grid"
import type { CompetitorLeaderboard, CompetitorRow, Scan, ScanKeyword } from "./types"

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

function Stat({ label, value, acronym }: { label: string; value: string; acronym: string }) {
  return (
    <div>
      <div className="tiny" style={{ color: "var(--text-soft)" }}>{label}</div>
      <div className="val">{value}</div>
      <div className="tiny muted tabular">{acronym}</div>
    </div>
  )
}

/**
 * One keyword's reading of a scan, as a report: the headline, three numbers,
 * the map, and who else ranks in the grid.
 *
 * The same document wherever it is read — inside the dashboard, where a scan
 * opens, and on its own at /reports/maps-tracker/…, the page that gets shared
 * and printed. One component, so the two can never drift apart. The page
 * around it supplies the chrome: the dashboard adds its actions, the shared
 * report its letterhead.
 *
 * Still interactive where it helps reading: a pin opens what Google returned
 * at that point, and "Compare on map" in the competitor list recolours the
 * pins with that business's ranks.
 */
export function ScanReport({
  scan,
  keyword,
  leaderboard,
  leaderboardLoading,
}: {
  scan: Scan
  keyword: ScanKeyword
  leaderboard: CompetitorLeaderboard | null
  leaderboardLoading: boolean
}) {
  const [openPointId, setOpenPointId] = useState<string | null>(null)
  const [comparing, setComparing] = useState<CompetitorRow | null>(null)
  const mapRef = useRef<HTMLDivElement | null>(null)

  // Everything here is scoped to one keyword: a comparison or an open point
  // from the previous one would describe ranks never measured for this one.
  useEffect(() => {
    setOpenPointId(null)
    setComparing(null)
  }, [keyword.id])

  // Esc unwinds nearest-first: the point drawer, then the comparison.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (openPointId) setOpenPointId(null)
      else if (comparing) setComparing(null)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [openPointId, comparing])

  // Memoised: the map's halo layer rebuilds every circle when this array's
  // identity changes, so a fresh array per render redraws hundreds for nothing.
  const pins = useMemo<MapPinData[]>(
    () =>
      keyword.points.map((p) => ({
        row: p.row, col: p.col, lat: p.latitude, lng: p.longitude,
        status: p.status, rank: p.rank, pointId: p.id,
      })),
    [keyword],
  )

  /**
   * "Compare on map": `row:col` -> the compared business's rank there, built
   * from the leaderboard's own index space so a point it was absent from stays
   * absent and is drawn as a genuine not-found.
   */
  const rankOverride = useMemo(() => {
    if (!comparing || !leaderboard) return null
    const m = new Map<string, number | null>()
    leaderboard.points.forEach((p, idx) => m.set(`${p.row}:${p.col}`, comparing.ranks[idx] ?? null))
    return m
  }, [comparing, leaderboard])

  function compare(row: CompetitorRow | null) {
    setComparing(row)
    // The list sits below the map. Without this the pins change out of sight
    // and the button looks like it did nothing.
    if (row) mapRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  const unitLabel = scan.displayUnit === "IMPERIAL" ? "mi" : "km"
  const radiusInUnit = scan.radiusMeters / (scan.displayUnit === "IMPERIAL" ? MILES_TO_METERS : KM_TO_METERS)

  return (
    <>
      <div style={{ maxWidth: 680, marginBottom: 36 }}>
        <div className="mt-eyebrow" style={{ marginBottom: 10 }}>Google Maps · &ldquo;{keyword.keyword}&rdquo;</div>
        <h2>
          {keyword.solv != null
            ? `Top 3 across ${keyword.solv.toFixed(0)}% of the neighbourhood`
            : "Local ranking across the neighbourhood"}
        </h2>
        <p className="mt-lede">
          {scan.location.name}, {scan.location.address}. {keyword.scoredPoints} searches on a {scan.gridSize} × {scan.gridSize} grid,
          {" "}{radiusInUnit.toFixed(2)}{unitLabel} radius, each one a real Google Maps query from that coordinate.
        </p>
      </div>

      <div className="mt-rstats">
        <Stat label="Top-3 coverage" value={keyword.solv != null ? `${keyword.solv.toFixed(0)}%` : "—"} acronym="SOLV" />
        <Stat label="Average rank where found" value={keyword.arp != null ? keyword.arp.toFixed(1) : "—"} acronym="ARP" />
        <Stat label="Average rank across grid" value={keyword.atrp != null ? keyword.atrp.toFixed(1) : "—"} acronym="ATRP" />
      </div>

      {comparing && (
        <div className="mt-rcompare" role="status">
          The map shows <b>{comparing.name}</b>&apos;s ranks.
          <button type="button" className="mt-link" onClick={() => setComparing(null)}>
            Back to yours
          </button>
        </div>
      )}

      {GOOGLE_MAPS_API_KEY ? (
        <div ref={mapRef} className="mt-rmap">
          <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
            <ScanMap
              centerLat={scan.centerLat}
              centerLng={scan.centerLng}
              gridSize={scan.gridSize}
              radiusMeters={scan.radiusMeters}
              pins={pins}
              unit={scan.displayUnit}
              // The centre has a scored pin of its own; the marker would
              // cover the rank at the business's own address.
              showCenterMarker={false}
              // Read, not driven: no panning or map-type controls. Pins still
              // open and the map still zooms — a wide grid covers a whole
              // district, and a reader will want to look closer at one corner.
              interactive={false}
              zoomable
              openPointId={openPointId}
              rankOverride={rankOverride}
              onPinClick={(pin) => {
                if (pin.status === "SUCCEEDED" && pin.pointId) setOpenPointId(pin.pointId)
              }}
              // The grid fills the frame; nobody pans a report.
              framePadding={0.045}
              // The map has the full width with nothing beside it, so the pins
              // can afford to carry the page.
              pinBoost={1.3}
            />
          </APIProvider>
        </div>
      ) : (
        <div className="tiny muted" style={{ textAlign: "center", padding: 24 }}>
          Map unavailable — NEXT_PUBLIC_GOOGLE_MAPS_API_KEY isn&apos;t configured.
        </div>
      )}

      {/* The scale. Without it a grid covering four streets and one covering a
          county look identical. */}
      <div className="tiny muted mt-rscale">
        {formatDistance(deriveSpacingMeters(scan.gridSize, scan.radiusMeters), scan.displayUnit)} between map pins
      </div>

      {/* The one legend, from the same bands as the pins above it. */}
      <div style={{ marginBottom: 40 }}>
        <RankLegend points={keyword.points} />
      </div>

      {/* Only for a scan that asked for it. AiAnalysis carries its own heading
          and renders nothing for a scan without one. */}
      {scan.aiAnalysisRequested && (
        <section className="mt-rsec mt-aisheet">
          <AiAnalysis scan={scan} />
        </section>
      )}

      <section className="mt-rsec">
        <div className="mt-rsec-t">Who else appears in this grid</div>
        <div className="tiny muted" style={{ marginBottom: 14 }}>
          Ranked by how often each business lands in the top 3. Open one to compare it on the map.
        </div>
        <CompetitorList
          leaderboard={leaderboard}
          rows={leaderboard?.rows ?? []}
          loading={leaderboardLoading}
          unit={scan.displayUnit}
          comparingKey={comparing?.key ?? null}
          onCompare={compare}
        />
      </section>

      {/* The top 20 Google returned at one coordinate. */}
      {openPointId && (
        <PointDrawer
          scanId={scan.id}
          pointId={openPointId}
          keyword={keyword.keyword}
          unit={scan.displayUnit}
          onClose={() => setOpenPointId(null)}
        />
      )}
    </>
  )
}
