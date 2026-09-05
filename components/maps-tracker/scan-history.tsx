"use client"

import { FileText } from "lucide-react"
import { Link } from "@/i18n/navigation"
import { rankColor, MILES_TO_METERS, KM_TO_METERS } from "./grid"
import type { ScanHistoryItem, ScanHistoryKeyword, ScanStatus } from "./types"

// One row per (scan, keyword) — a scan of three keywords is three results, and
// they are read one at a time.
export interface ScanHistoryRow {
  scanId: string
  scanStatus: ScanStatus
  keyword: ScanHistoryKeyword
  locationName: string
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
      gridSize: h.gridSize,
      radiusMeters: h.radiusMeters,
      displayUnit: h.displayUnit,
      createdAt: h.createdAt,
    })),
  )
}

function MiniHeatmap({ row }: { row: ScanHistoryRow }) {
  const size = row.gridSize
  const byPos = new Map(row.keyword.points.map((p) => [`${p.row}:${p.col}`, p]))
  const dot = size > 9 ? 4 : size > 5 ? 6 : 8
  const cells = Array.from({ length: size * size }, (_, i) => byPos.get(`${Math.floor(i / size)}:${i % size}`) ?? null)
  return (
    <div
      className="mt-mini"
      style={{ gridTemplateColumns: `repeat(${size}, ${dot}px)`, width: size * (dot + 2) }}
      aria-hidden
    >
      {cells.map((p, i) => (
        <span key={i} style={{ background: p ? rankColor(p.rank, p.status).bg : "var(--bg-inset)" }} />
      ))}
    </div>
  )
}

function statusLabel(status: ScanStatus): { label: string; color: string } {
  if (status === "QUEUED" || status === "RUNNING") return { label: "Scanning…", color: "var(--brand)" }
  if (status === "FAILED") return { label: "Failed", color: "var(--neg)" }
  if (status === "CANCELLED") return { label: "Cancelled", color: "var(--text-mute)" }
  if (status === "PARTIAL") return { label: "Some points failed", color: "var(--warn)" }
  return { label: "Complete", color: "var(--pos)" }
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="tiny muted tabular" style={{ fontSize: 10.5 }}>{label}</div>
      <div className="tabular" style={{ fontSize: 14, fontWeight: 600, color }}>{value}</div>
    </div>
  )
}

export function ScanHistory({ rows, onOpenScan }: { rows: ScanHistoryRow[]; onOpenScan: (scanId: string) => void }) {
  if (rows.length === 0) {
    return (
      <div className="card" style={{ padding: 32, textAlign: "center" }}>
        <div className="tiny muted">No earlier scans yet.</div>
      </div>
    )
  }

  return (
    <div className="mt-hist">
      {rows.map((row) => {
        const live = row.scanStatus === "QUEUED" || row.scanStatus === "RUNNING"
        const status = statusLabel(row.scanStatus)
        const solv = row.keyword.solv
        const radius =
          row.displayUnit === "IMPERIAL"
            ? `${(row.radiusMeters / MILES_TO_METERS).toFixed(2)} mi`
            : `${(row.radiusMeters / KM_TO_METERS).toFixed(2)} km`
        return (
          <div key={`${row.scanId}-${row.keyword.id}`} style={{ position: "relative" }}>
            <button type="button" className="mt-histrow" onClick={() => onOpenScan(row.scanId)}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>
                  {new Date(row.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </div>
                <div className="tiny muted">
                  {new Date(row.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>&ldquo;{row.keyword.keyword}&rdquo;</div>
                <div className="tiny muted">
                  {row.locationName} · {row.gridSize} × {row.gridSize} · {radius} · {row.keyword.scoredPoints} points
                </div>
              </div>
              <div>
                {live ? <span className="tiny muted">Scanning…</span> : <MiniHeatmap row={row} />}
              </div>
              <div className="row" style={{ gap: 18 }}>
                <Stat
                  label="TOP 3"
                  value={solv != null ? `${solv.toFixed(0)}%` : "—"}
                  color={solv == null ? undefined : solv >= 30 ? "var(--pos)" : solv >= 12 ? "var(--warn)" : "var(--neg)"}
                />
                <Stat label="AVG RANK" value={row.keyword.arp != null ? row.keyword.arp.toFixed(1) : "—"} />
                <div>
                  <div className="tiny muted tabular" style={{ fontSize: 10.5 }}>STATUS</div>
                  <div className="tiny" style={{ color: status.color }}>{status.label}</div>
                </div>
              </div>
              <span />
            </button>
            {!live && (
              <Link
                href={`/reports/maps-tracker/${row.scanId}/${row.keyword.id}`}
                target="_blank"
                className="icon-btn"
                title="Open the shareable report"
                aria-label={`Open the report for "${row.keyword.keyword}"`}
                style={{ position: "absolute", right: 18, top: "50%", transform: "translateY(-50%)" }}
              >
                <FileText size={14} />
              </Link>
            )}
          </div>
        )
      })}
    </div>
  )
}
