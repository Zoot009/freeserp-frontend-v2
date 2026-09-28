"use client"

import { RANK_BANDS } from "./grid"
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

/** The report's single legend. Same bands, same colours as the pins, no interaction. */
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
