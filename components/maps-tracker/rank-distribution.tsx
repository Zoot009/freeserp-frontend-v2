"use client"

import { RANK_BANDS, type RankBandKey } from "./grid"
import type { ScanPointSummary } from "./types"

/** Only points that actually returned a result are banded — see bandKeyFor. */
function scoredOnly(points: ScanPointSummary[]) {
  return points.filter((p) => p.status === "SUCCEEDED")
}

function counts(points: ScanPointSummary[]) {
  const scored = scoredOnly(points)
  const total = scored.length || 1
  return RANK_BANDS.map((b) => {
    const count = scored.filter((p) => b.test(p.rank)).length
    return { ...b, count, pct: (count / total) * 100 }
  })
}

/**
 * Where the points landed.
 *
 * This replaces the rank matrix — a grid of 49 to 441 coloured cells with
 * numbers in them, which showed everything and communicated nothing. A reader
 * wants the shape first; the individual points are still one click away on the
 * map, which is where a coordinate actually means something.
 *
 * Clicking a band filters the map to those points, so the summary and the
 * detail are the same gesture.
 */
export function RankDistributionCard({
  points,
  bestRank,
  worstRank,
  activeBand,
  onBandToggle,
}: {
  points: ScanPointSummary[]
  bestRank: number | null
  worstRank: number | null
  activeBand: RankBandKey | null
  onBandToggle: (key: RankBandKey) => void
}) {
  const bands = counts(points)
  const total = scoredOnly(points).length

  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Where the {total} points landed</span>
        {bestRank != null && (
          <span className="tiny muted">Best #{bestRank} · worst #{worstRank}</span>
        )}
      </div>
      <div className="tiny muted" style={{ margin: "2px 0 16px" }}>
        {activeBand
          ? `Showing ${RANK_BANDS.find((b) => b.key === activeBand)?.label} on the map · click again to clear`
          : "Click a band to highlight those points on the map"}
      </div>

      <div className="mt-distbar" style={{ marginBottom: 14 }}>
        {bands.map((b) => (
          <i key={b.key} style={{ width: `${b.pct}%`, background: b.color }} />
        ))}
      </div>

      {bands.map((b) => (
        <button
          key={b.key}
          type="button"
          className="mt-bandrow"
          aria-pressed={activeBand === b.key}
          onClick={() => onBandToggle(b.key)}
        >
          <i className="sw" style={{ background: b.color }} aria-hidden />
          <span className="nm">{b.label}</span>
          <span className="ct">{b.count}</span>
          <span className="pc">{b.pct.toFixed(0)}%</span>
        </button>
      ))}
    </div>
  )
}

/** The report's single legend. Same bands, same colours, no interaction. */
export function RankLegend({ points }: { points: ScanPointSummary[] }) {
  return (
    <div className="mt-legend">
      {counts(points).map((b) => (
        <span key={b.key}>
          <i style={{ background: b.color }} aria-hidden />
          {b.label} · {b.count}
        </span>
      ))}
    </div>
  )
}
