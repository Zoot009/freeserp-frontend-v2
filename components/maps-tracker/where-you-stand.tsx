"use client"

import { formatDistance, type DistanceUnit } from "./grid"
import type { CompetitorLeaderboard } from "./types"

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="mt-standrow">
      <span className="nm">{label}</span>
      <span className="v" style={color ? { color } : undefined}>{value}</span>
    </div>
  )
}

/**
 * The context for the headline number: who else is here, and how far your
 * top-3 ring actually reaches.
 *
 * Best and worst come off the scan itself so they render immediately; the rest
 * needs the competitor leaderboard, which is a separate request. When that
 * request hasn't landed (or failed) the card shows what it has rather than
 * blocking or disappearing.
 */
export function WhereYouStand({
  leaderboard,
  bestRank,
  worstRank,
  unit,
  loading,
}: {
  leaderboard: CompetitorLeaderboard | null
  bestRank: number | null
  worstRank: number | null
  unit: DistanceUnit
  loading: boolean
}) {
  const rows = leaderboard?.rows ?? []
  const place = rows.findIndex((r) => r.isTarget) + 1
  const insights = leaderboard?.insights

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Where you stand</div>

      {place > 0 && <Row label="Rank in this market" value={`${place} of ${rows.length}`} />}
      {insights?.topSolv != null && (
        <Row
          label={insights.isMarketLeader ? "You hold the top spot at" : "Leader's top-3 coverage"}
          value={`${insights.topSolv.toFixed(0)}%`}
        />
      )}
      {bestRank != null && <Row label="Best point" value={`#${bestRank}`} color="var(--pos)" />}
      {worstRank != null && <Row label="Worst point" value={`#${worstRank}`} color="var(--neg)" />}
      {insights?.yourTop3DistanceMeters != null && (
        <Row label="Top-3 ring reaches" value={formatDistance(insights.yourTop3DistanceMeters, unit)} />
      )}

      {insights?.marketAverageTop3DistanceMeters != null && insights.yourTop3DistanceMeters != null && (
        <div className="tiny muted" style={{ marginTop: 10, lineHeight: 1.5 }}>
          The market average reaches {formatDistance(insights.marketAverageTop3DistanceMeters, unit)}.
        </div>
      )}
      {loading && !leaderboard && (
        <div className="tiny muted" style={{ marginTop: 10 }}>Working out who else appears here…</div>
      )}
      {!loading && !leaderboard && (
        <div className="tiny muted" style={{ marginTop: 10 }}>
          Couldn&apos;t load the competitor comparison for this keyword.
        </div>
      )}
    </div>
  )
}
