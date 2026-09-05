"use client"

import type { CompetitorRow } from "./types"

function solvColor(solv: number | null): string | undefined {
  if (solv == null) return undefined
  return solv >= 30 ? "var(--pos)" : solv >= 12 ? "var(--warn)" : "var(--neg)"
}

/**
 * Who else appears in this grid, ranked by how often they take a top-3 slot.
 *
 * Sorted by the server on the same field the last column shows, so the order
 * can never contradict the number it claims to be ordered by.
 */
export function CompetitorTable({ rows }: { rows: CompetitorRow[] }) {
  if (rows.length === 0) {
    return <div className="tiny muted" style={{ padding: 24, textAlign: "center" }}>No competitor data was captured for this scan.</div>
  }

  return (
    <div>
      <div
        className="mt-cmprow"
        style={{ background: "var(--bg-sub)", borderRadius: 8, borderTop: "none", padding: "11px 0" }}
      >
        <span className="tiny muted tabular" style={{ paddingLeft: 12 }}>#</span>
        <span className="tiny muted tabular">BUSINESS</span>
        <span className="tiny muted tabular">FOUND IN</span>
        <span className="tiny muted tabular">AVG RANK</span>
        <span className="tiny muted tabular">TOP 3</span>
      </div>

      {rows.map((r, i) => (
        <div className={"mt-cmprow" + (r.isTarget ? " you" : "")} key={r.key}>
          <span className="num" style={{ marginLeft: 12 }}>{i + 1}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>
              {r.name}
              {r.isTarget && <span className="tiny" style={{ color: "var(--brand)" }}> You</span>}
            </div>
            <div className="tiny muted">
              {r.address ?? "—"}
              {r.rating != null && ` · ${r.rating} ★ (${r.reviewCount ?? 0})`}
            </div>
          </div>
          <span className="tiny" style={{ color: "var(--text-soft)" }}>{r.foundPoints} points</span>
          <span className="tabular" style={{ fontSize: 13 }}>{r.arp != null ? r.arp.toFixed(1) : "—"}</span>
          <span className="tabular" style={{ fontSize: 13, fontWeight: 600, color: solvColor(r.solv) }}>
            {r.solv != null ? `${r.solv.toFixed(0)}%` : "—"}
          </span>
        </div>
      ))}
    </div>
  )
}
