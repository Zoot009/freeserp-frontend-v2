"use client"

/**
 * The headline number, then the two averages.
 *
 * Plain-English labels with the acronym as a caption underneath — "ARP" tells
 * a first-time reader nothing, and it was the label before.
 */
export function SolvHero({
  solv,
  scoredPoints,
  leaderSolv,
}: {
  solv: number | null
  scoredPoints: number
  leaderSolv: number | null
}) {
  const pct = solv ?? 0
  return (
    <div className="mt-hero">
      <div className="tiny" style={{ color: "var(--text-soft)" }}>You rank in the top 3 at</div>
      <div className="row" style={{ alignItems: "baseline", gap: 10 }}>
        <span className="mt-hero-big">{solv != null ? `${solv.toFixed(0)}%` : "—"}</span>
        <span style={{ fontSize: 14, color: "var(--text-soft)" }}>of {scoredPoints} points</span>
      </div>
      <div className="mt-bar" style={{ marginTop: 14 }}>
        <i style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
      <div className="tiny muted" style={{ marginTop: 8 }}>
        Share of Local Voice (SoLV)
        {leaderSolv != null && ` · leader in this grid holds ${leaderSolv.toFixed(0)}%`}
      </div>
    </div>
  )
}

export function MetricTiles({ arp, atrp }: { arp: number | null; atrp: number | null }) {
  return (
    <div className="mt-tiles">
      <div className="mt-tile">
        <div className="lbl">Average rank<br />where you were found</div>
        <div className="val">{arp != null ? arp.toFixed(1) : "—"}</div>
        <div className="acr">ARP</div>
      </div>
      <div className="mt-tile">
        <div className="lbl">Average rank<br />across every point</div>
        <div className="val">{atrp != null ? atrp.toFixed(1) : "—"}</div>
        <div className="acr">ATRP</div>
      </div>
    </div>
  )
}
