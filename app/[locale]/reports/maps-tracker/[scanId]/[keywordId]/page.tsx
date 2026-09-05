"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { APIProvider } from "@vis.gl/react-google-maps"
import { api, ApiError } from "@/lib/api"
import { ScanMap, type MapPinData } from "@/components/maps-tracker/scan-map"
import { RankLegend } from "@/components/maps-tracker/rank-distribution"
import { CompetitorTable } from "@/components/maps-tracker/competitor-table"
import { MILES_TO_METERS, KM_TO_METERS } from "@/components/maps-tracker/grid"
import type { Scan, CompetitorLeaderboard } from "@/components/maps-tracker/types"

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

export default function ScanReportPage() {
  const params = useParams<{ scanId: string; keywordId: string }>()
  const [scan, setScan] = useState<Scan | null>(null)
  const [leaderboard, setLeaderboard] = useState<CompetitorLeaderboard | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .get<{ scan: Scan }>(`/api/maps-tracker/scans/${params.scanId}`)
      .then(({ scan }) => {
        if (!cancelled) setScan(scan)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Couldn't load this report.")
      })
    return () => {
      cancelled = true
    }
  }, [params.scanId])

  // Separate fetch: the leaderboard is its own on-demand computation, so a
  // slow one never blocks the rest of the report from rendering, and a failed
  // one still leaves a readable report.
  useEffect(() => {
    let cancelled = false
    api
      .get<CompetitorLeaderboard>(`/api/maps-tracker/scans/${params.scanId}/keywords/${params.keywordId}/competitors`)
      .then((data) => {
        if (!cancelled) setLeaderboard(data)
      })
      .catch(() => {
        /* non-fatal */
      })
    return () => {
      cancelled = true
    }
  }, [params.scanId, params.keywordId])

  if (error) return <div style={{ padding: 60, textAlign: "center" }} className="tiny muted">{error}</div>
  if (!scan) return <div style={{ padding: 60, textAlign: "center" }} className="tiny muted">Loading report…</div>

  const keyword = scan.keywords.find((k) => k.id === params.keywordId)
  if (!keyword) {
    return <div style={{ padding: 60, textAlign: "center" }} className="tiny muted">This keyword isn&apos;t part of this scan.</div>
  }

  const unitLabel = scan.displayUnit === "IMPERIAL" ? "mi" : "km"
  const radiusInUnit = scan.radiusMeters / (scan.displayUnit === "IMPERIAL" ? MILES_TO_METERS : KM_TO_METERS)

  const pins: MapPinData[] = keyword.points.map((p) => ({
    row: p.row, col: p.col, lat: p.latitude, lng: p.longitude, status: p.status, rank: p.rank,
  }))

  return (
    <div className="mt-page mt-report">
      <div className="mt-sheet">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 40 }}>
          <div className="row" style={{ gap: 9 }}>
            <span className="mt-mark">F</span>
            <span style={{ fontSize: 14.5, fontWeight: 600 }}>FreeSERP Rank Tracker</span>
          </div>
          <div className="tiny muted tabular">
            {new Date(scan.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }).toUpperCase()}
          </div>
        </div>

        <div style={{ maxWidth: 640, marginBottom: 32 }}>
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

        {GOOGLE_MAPS_API_KEY ? (
          <div style={{ margin: "32px 0 14px", height: 460, borderRadius: "var(--r-md)", overflow: "hidden", border: "1px solid var(--border)" }}>
            <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
              <ScanMap
                centerLat={scan.centerLat}
                centerLng={scan.centerLng}
                gridSize={scan.gridSize}
                radiusMeters={scan.radiusMeters}
                pins={pins}
                unit={scan.displayUnit}
                // Same as the results screen: the centre already has a scored
                // pin, and the marker would cover its rank.
                showCenterMarker={false}
                // A report is read, not driven.
                interactive={false}
              />
            </APIProvider>
          </div>
        ) : (
          <div className="tiny muted" style={{ textAlign: "center", padding: 24 }}>
            Map unavailable — NEXT_PUBLIC_GOOGLE_MAPS_API_KEY isn&apos;t configured.
          </div>
        )}

        {/* The one legend. It reads from the same bands as the pins above it. */}
        <div style={{ marginBottom: 40 }}>
          <RankLegend points={keyword.points} />
        </div>

        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Who else appears in this grid</div>
        <div className="tiny muted" style={{ marginBottom: 14 }}>Ranked by how often each business lands in the top 3</div>
        {leaderboard ? (
          <CompetitorTable rows={leaderboard.rows} />
        ) : (
          <div className="tiny muted" style={{ padding: 24, textAlign: "center" }}>Loading the competitor comparison…</div>
        )}

        <div className="tiny muted" style={{ marginTop: 40, paddingTop: 18, borderTop: "1px solid var(--border)" }}>
          Prepared by FreeSERP · every figure measured from the {keyword.scoredPoints} searches above
        </div>
      </div>
    </div>
  )
}
