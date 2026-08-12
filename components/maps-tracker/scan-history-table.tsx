"use client"

import { MapPin, FileText } from "lucide-react"
import { Link } from "@/i18n/navigation"
import { rankColor } from "./grid"
import type { ScanHistoryItem, ScanHistoryKeyword } from "./types"

// One row per (scan, keyword) — mirrors LocalFalcon's history table shape,
// scoped down per the user's call: compact row only (date, parameters, a
// mini heatmap, ARP/ATRP/SoLV), no checkboxes/pagination/filter bar/action
// icons — those need real features (bulk delete, PDF export, competitor
// view) that don't exist yet.
export interface ScanHistoryRow {
  scanId: string
  scanStatus: ScanHistoryItem["status"]
  keyword: ScanHistoryKeyword
  locationName: string
  locationAddress: string
  gridSize: number
  radiusMeters: number
  displayUnit: ScanHistoryItem["displayUnit"]
  createdAt: string
}

export function flattenHistoryRows(history: ScanHistoryItem[]): ScanHistoryRow[] {
  return history.flatMap((h) =>
    h.keywords.map((k) => ({
      scanId: h.id,
      scanStatus: h.status,
      keyword: k,
      locationName: h.location.name,
      locationAddress: h.location.address,
      gridSize: h.gridSize,
      radiusMeters: h.radiusMeters,
      displayUnit: h.displayUnit,
      createdAt: h.createdAt,
    })),
  )
}

function MiniHeatmap({ row }: { row: ScanHistoryRow }) {
  const size = Math.max(1, Math.round(Math.sqrt(row.gridSize * row.gridSize)))
  const byPos = new Map(row.keyword.points.map((p) => [`${p.row}:${p.col}`, p]))
  const cells = Array.from({ length: size * size }, (_, i) => {
    const r = Math.floor(i / size)
    const c = i % size
    return byPos.get(`${r}:${c}`) ?? null
  })
  const dotSize = size > 9 ? 6 : size > 5 ? 8 : 11

  if (row.scanStatus === "QUEUED" || row.scanStatus === "RUNNING") {
    return <span className="tiny muted">Scanning…</span>
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${size}, ${dotSize}px)`,
        gap: 3,
      }}
      aria-hidden="true"
    >
      {cells.map((p, i) => {
        const color = p ? rankColor(p.rank, p.status) : { bg: "var(--bg-inset)", fg: "", label: "" }
        return (
          <span
            key={i}
            style={{
              width: dotSize,
              height: dotSize,
              borderRadius: "50%",
              background: color.bg,
              display: "inline-block",
            }}
          />
        )
      })}
    </div>
  )
}

// Green when good, red when bad, matching the pin rank-color bands loosely —
// gives the row an at-a-glance read without opening the detail view.
function MetricBadge({ label, value, good }: { label: string; value: string; good: boolean | null }) {
  const bg = good == null ? "var(--bg-inset)" : good ? "#16A34A" : "#DC2626"
  const fg = good == null ? "var(--text-mute)" : "#FFFFFF"
  return (
    <span
      title={label}
      style={{
        display: "inline-block",
        minWidth: 52,
        textAlign: "center",
        padding: "4px 8px",
        borderRadius: "var(--r-sm, 6px)",
        background: bg,
        color: fg,
        fontSize: 12.5,
        fontWeight: 700,
      }}
    >
      {value}
    </span>
  )
}

function statusChip(status: ScanHistoryRow["scanStatus"]): { label: string; color: string } | null {
  if (status === "QUEUED" || status === "RUNNING") return { label: "Running…", color: "var(--brand)" }
  if (status === "FAILED") return { label: "Failed", color: "var(--neg)" }
  if (status === "CANCELLED") return { label: "Cancelled", color: "var(--text-mute)" }
  if (status === "PARTIAL") return { label: "Partial", color: "var(--warn)" }
  return null
}

export function ScanHistoryTable({ rows, onOpenScan }: { rows: ScanHistoryRow[]; onOpenScan: (scanId: string) => void }) {
  if (rows.length === 0) {
    return (
      <div className="card" style={{ padding: 32, textAlign: "center" }}>
        <div className="tiny muted">No scans yet. Pick a location and keyword, then run one above.</div>
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table className="tbl" style={{ minWidth: 640 }}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Scan parameters</th>
              <th>Heatmap</th>
              <th>ARP</th>
              <th>ATRP</th>
              <th>SoLV</th>
              <th>Report</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const chip = statusChip(row.scanStatus)
              const radiusLabel = row.displayUnit === "IMPERIAL" ? `${(row.radiusMeters / 1609.344).toFixed(2)} mi` : `${(row.radiusMeters / 1000).toFixed(2)} km`
              return (
                <tr
                  key={`${row.scanId}-${row.keyword.id}`}
                  onClick={() => onOpenScan(row.scanId)}
                  style={{ cursor: "pointer" }}
                >
                  <td className="tiny muted" style={{ whiteSpace: "nowrap" }}>
                    {new Date(row.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    <br />
                    {new Date(row.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                  </td>
                  <td>
                    <div className="b" style={{ fontSize: 13 }}>&quot;{row.keyword.keyword}&quot;</div>
                    <div className="tiny muted row" style={{ gap: 4, alignItems: "center", marginTop: 2 }}>
                      <MapPin size={11} /> {row.locationName}, {row.locationAddress}
                    </div>
                    <div className="row" style={{ gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                      <span className="chip outline" style={{ fontSize: 10.5 }}>{row.gridSize} × {row.gridSize} grid</span>
                      <span className="chip outline" style={{ fontSize: 10.5 }}>{radiusLabel} radius</span>
                      <span className="chip outline" style={{ fontSize: 10.5 }}>{row.keyword.scoredPoints} data points</span>
                      {chip && (
                        <span className="chip outline" style={{ fontSize: 10.5, color: chip.color }}>{chip.label}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <MiniHeatmap row={row} />
                  </td>
                  <td>
                    <MetricBadge
                      label="Average Rank Position — only where found"
                      value={row.keyword.arp != null ? row.keyword.arp.toFixed(2) : "—"}
                      good={row.keyword.arp == null ? null : row.keyword.arp <= 5}
                    />
                  </td>
                  <td>
                    <MetricBadge
                      label="Average Total Rank Position — across the whole grid"
                      value={row.keyword.atrp != null ? row.keyword.atrp.toFixed(2) : "—"}
                      good={row.keyword.atrp == null ? null : row.keyword.atrp <= 8}
                    />
                  </td>
                  <td>
                    <MetricBadge
                      label="Share of Local Voice — % of points ranking top 3"
                      value={row.keyword.solv != null ? row.keyword.solv.toFixed(2) : "—"}
                      good={row.keyword.solv == null ? null : row.keyword.solv >= 30}
                    />
                  </td>
                  <td>
                    {row.scanStatus === "QUEUED" || row.scanStatus === "RUNNING" ? (
                      <span className="tiny muted">—</span>
                    ) : (
                      <Link
                        href={`/reports/maps-tracker/${row.scanId}/${row.keyword.id}`}
                        target="_blank"
                        className="icon-btn"
                        title="Open scan report in a new tab"
                        aria-label="Open scan report in a new tab"
                        onClick={(e) => e.stopPropagation()} // don't also trigger the row's onOpenScan
                      >
                        <FileText size={14} />
                      </Link>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
