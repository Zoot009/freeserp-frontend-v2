"use client"

import type { CompetitorRow } from "./types"

function ScoreBadge({ value, good }: { value: number | null; good: boolean | null }) {
  const bg = good == null ? "var(--bg-inset)" : good ? "#16A34A" : good === false ? "#DC2626" : "#EAB308"
  const fg = good == null ? "var(--text-mute)" : "#FFFFFF"
  return (
    <span
      style={{
        display: "inline-block",
        width: 56,
        textAlign: "center",
        padding: "6px 4px",
        borderRadius: "var(--r-sm, 6px)",
        background: bg,
        color: fg,
        fontSize: 12.5,
        fontWeight: 700,
      }}
    >
      {value != null ? value.toFixed(2) : "—"}
    </span>
  )
}

export function CompetitorTable({ rows }: { rows: CompetitorRow[] }) {
  if (rows.length === 0) {
    return <div className="tiny muted" style={{ textAlign: "center", padding: 24 }}>No competitor data captured for this scan.</div>
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table className="tbl" style={{ minWidth: 720, width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              <th style={{ width: "44%" }}>Business information</th>
              <th style={{ width: "18%" }}>Found in</th>
              <th style={{ width: "auto", textAlign: "center" }}>ARP</th>
              <th style={{ width: "auto", textAlign: "center" }}>ATRP</th>
              <th style={{ width: "auto", textAlign: "center" }}>SoLV</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.key}
                style={{
                  background: row.isTarget ? "var(--pos-soft, rgba(22,163,74,0.06))" : undefined,
                  borderTop: i === 0 ? undefined : "1px solid var(--border)",
                }}
              >
                <td style={{ padding: "16px 16px 16px 12px", verticalAlign: "top" }}>
                  <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <span
                      style={{
                        flexShrink: 0,
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: row.isTarget ? "var(--brand)" : "var(--bg-inset)",
                        color: row.isTarget ? "#fff" : "var(--text)",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 12.5,
                        fontWeight: 700,
                      }}
                    >
                      {i + 1}
                    </span>
                    <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span className="b" style={{ fontSize: 14 }}>{row.name}</span>
                        {row.isTarget && <span className="chip">You</span>}
                      </div>
                      {row.address && <div className="tiny muted">{row.address}</div>}
                      {row.rating != null && (
                        <div className="tiny muted">
                          {row.rating.toFixed(1)} <span style={{ color: "#F59E0B" }}>{"★".repeat(Math.round(row.rating))}</span>{" "}
                          ({row.reviewCount ?? 0})
                        </div>
                      )}
                      {row.category && (
                        <div className="tiny muted" style={{ fontStyle: "italic", letterSpacing: "0.02em" }}>
                          {row.category.toUpperCase()}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="tiny muted" style={{ padding: "16px 12px", verticalAlign: "top", whiteSpace: "nowrap", lineHeight: 1.6 }}>
                  {row.foundPoints} data point{row.foundPoints === 1 ? "" : "s"}
                  <br />
                  {row.percentOfResults.toFixed(2)}% of results
                </td>
                <td style={{ padding: "16px 8px", verticalAlign: "top", textAlign: "center" }}>
                  <ScoreBadge value={row.arp} good={row.arp == null ? null : row.arp <= 5} />
                </td>
                <td style={{ padding: "16px 8px", verticalAlign: "top", textAlign: "center" }}>
                  <ScoreBadge value={row.atrp} good={row.atrp == null ? null : row.atrp <= 8} />
                </td>
                <td style={{ padding: "16px 12px 16px 8px", verticalAlign: "top", textAlign: "center" }}>
                  <ScoreBadge value={row.solv} good={row.solv == null ? null : row.solv >= 30} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
