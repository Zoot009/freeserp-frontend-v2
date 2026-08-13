"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { APIProvider } from "@vis.gl/react-google-maps"
import { api, ApiError } from "@/lib/api"
import { ScanMap, type MapPinData } from "@/components/maps-tracker/scan-map"
import { spacingCaption } from "@/components/maps-tracker/grid-controls"
import { MetricInsights } from "@/components/maps-tracker/metric-insights"
import { CompetitorTable } from "@/components/maps-tracker/competitor-table"
import type { Scan, CompetitorLeaderboard } from "@/components/maps-tracker/types"
import { Logo } from "@/components/brand/logo"

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

function MetricBox({ label, value }: { label: string; value: number | null }) {
  return (
    <div
      style={{
        flex: "1 1 0",
        minWidth: 0,
        textAlign: "center",
        padding: "12px 10px",
        borderRadius: "var(--r-md)",
        border: "1px solid var(--border)",
        background: "var(--bg-elev)",
      }}
    >
      <div className="tiny muted" style={{ letterSpacing: "0.04em", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{value != null ? value.toFixed(2) : "—"}</div>
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

  // Separate fetch: the competitor leaderboard is its own on-demand
  // computation (see competitors.service.ts) rather than part of the scan
  // payload, so a slow leaderboard computation never blocks the rest of the
  // report from rendering.
  useEffect(() => {
    let cancelled = false
    api
      .get<CompetitorLeaderboard>(`/api/maps-tracker/scans/${params.scanId}/keywords/${params.keywordId}/competitors`)
      .then((data) => {
        if (!cancelled) setLeaderboard(data)
      })
      .catch(() => {
        /* non-fatal — report still renders without the leaderboard */
      })
    return () => {
      cancelled = true
    }
  }, [params.scanId, params.keywordId])

  if (error) {
    return <div style={{ padding: 60, textAlign: "center" }} className="tiny muted">{error}</div>
  }
  if (!scan) {
    return <div style={{ padding: 60, textAlign: "center" }} className="tiny muted">Loading report…</div>
  }

  const keyword = scan.keywords.find((k) => k.id === params.keywordId)
  if (!keyword) {
    return <div style={{ padding: 60, textAlign: "center" }} className="tiny muted">This keyword isn&apos;t part of this scan.</div>
  }

  const unit = scan.displayUnit
  const radiusInUnit = unit === "IMPERIAL" ? scan.radiusMeters / 1609.344 : scan.radiusMeters / 1000
  const areaInUnit = (radiusInUnit * 2) ** 2 // bounding square: side = 2x radius
  const unitLabel = unit === "IMPERIAL" ? "mi" : "km"

  const pins: MapPinData[] = keyword.points.map((p) => ({
    row: p.row,
    col: p.col,
    lat: p.latitude,
    lng: p.longitude,
    status: p.status,
    rank: p.rank,
  }))

  return (
    <div className="page" style={{ maxWidth: 920, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 8, marginTop: 8 }}>
        <div className="row" style={{ justifyContent: "center", gap: 8, alignItems: "center" }}>
          <Logo size={28} className="rounded-lg" />
          <span style={{ fontSize: 22, fontWeight: 800 }}>FreeSERP</span>
        </div>
        <div className="tiny muted">Rank Tracker</div>
      </div>
      <h1 style={{ textAlign: "center", fontSize: 20, marginBottom: 20 }}>Scan Report</h1>

      <div style={{ textAlign: "center", marginBottom: 16, fontSize: 14 }}>
        Searching <strong>&quot;{keyword.keyword}&quot;</strong> on <strong>Google Maps</strong> for:
      </div>

      <div className="card" style={{ maxWidth: 420, margin: "0 auto 24px", textAlign: "center" }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{scan.location.name}</div>
        <div className="tiny muted" style={{ marginTop: 2 }}>{scan.location.address}</div>
        {scan.location.rating != null && (
          <div style={{ marginTop: 8, fontSize: 13 }}>
            {scan.location.rating.toFixed(1)}{" "}
            <span style={{ color: "#F59E0B" }}>{"★".repeat(Math.round(scan.location.rating))}</span>{" "}
            <span className="tiny muted">({scan.location.reviewCount ?? 0})</span>
          </div>
        )}
      </div>

      <div className="row" style={{ justifyContent: "center", gap: 12, marginBottom: 24, flexWrap: "nowrap", maxWidth: 420, margin: "0 auto 24px" }}>
        <MetricBox label="ARP" value={keyword.arp} />
        <MetricBox label="ATRP" value={keyword.atrp} />
        <MetricBox label="SoLV" value={keyword.solv} />
      </div>

      <div style={{ textAlign: "center", fontSize: 13 }}>
        Searched using a <strong>{scan.gridSize} × {scan.gridSize}</strong> grid with a{" "}
        <strong>{radiusInUnit.toFixed(2)}{unitLabel}</strong> radius covering{" "}
        <strong>{areaInUnit.toFixed(2)}{unitLabel}²</strong>
      </div>
      <div className="tiny muted" style={{ textAlign: "center", marginBottom: 24 }}>
        The center point for this grid is <strong>{scan.centerLat.toFixed(7)}, {scan.centerLng.toFixed(7)}</strong>
      </div>

      {GOOGLE_MAPS_API_KEY ? (
        <>
          <div style={{ height: 440, borderRadius: "var(--r-lg)", overflow: "hidden", border: "1px solid var(--border)" }}>
            <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
              <ScanMap
                centerLat={scan.centerLat}
                centerLng={scan.centerLng}
                gridSize={scan.gridSize}
                radiusMeters={scan.radiusMeters}
                pins={pins}
                defaultZoom={14}
                showCenterMarker
              />
            </APIProvider>
          </div>
          <div className="tiny muted" style={{ textAlign: "center", marginTop: 8 }}>
            {spacingCaption(scan.gridSize, radiusInUnit, unit)}
          </div>
        </>
      ) : (
        <div className="tiny muted" style={{ textAlign: "center", padding: 24 }}>
          Map unavailable — NEXT_PUBLIC_GOOGLE_MAPS_API_KEY isn&apos;t configured.
        </div>
      )}

      {leaderboard && (
        <>
          <MetricInsights leaderboard={leaderboard} unit={unit} />
          <CompetitorTable rows={leaderboard.rows} />
        </>
      )}

      <div className="tiny muted" style={{ textAlign: "center", marginTop: 28 }}>
        Search performed on{" "}
        {new Date(scan.createdAt).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" })}
      </div>

      <div style={{ textAlign: "center", marginTop: 40, paddingTop: 20, borderTop: "1px solid var(--border)", paddingBottom: 40 }}>
        <div className="tiny muted">Prepared by FreeSERP</div>
      </div>
    </div>
  )
}
