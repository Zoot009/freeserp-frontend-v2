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
 * The rail's version: the stacked bar and the legend, no card chrome.
 *
 * Same `counts()` and the same click-to-filter gesture as the card above —
 * clicking a band dims every non-matching pin AND its halo on the map. That
 * gesture is the best thing in the old UI and it survives the redesign
 * unchanged, including Esc unwinding the drawer before the band filter.
 */
export function RankDistributionStrip({
  points,
  activeBand,
  onBandToggle,
}: {
  points: ScanPointSummary[]
  activeBand: RankBandKey | null
  onBandToggle: (key: RankBandKey) => void
}) {
  const bands = counts(points)
  const total = scoredOnly(points).length

  return (
    <div className="mt-strip">
      <div className="mt-strip-h">
        <span className="t">{total} points searched</span>
        {activeBand && (
          <button type="button" className="mt-link" onClick={() => onBandToggle(activeBand)}>
            Clear filter
          </button>
        )}
      </div>

      <div className="mt-distbar" style={{ height: 10 }}>
        {bands.map((b) => (
          <i key={b.key} style={{ width: `${b.pct}%`, background: b.color }} />
        ))}
      </div>

      <div className="mt-strip-legend">
        {bands.map((b) => (
          <button
            key={b.key}
            type="button"
            className="mt-strip-band"
            aria-pressed={activeBand === b.key}
            data-dim={activeBand != null && activeBand !== b.key ? true : undefined}
            onClick={() => onBandToggle(b.key)}
            title={`${b.count} points ranked ${b.label}`}
          >
            <i className="sw" style={{ background: b.color }} aria-hidden />
            <span className="nm">{b.label}</span>
            <span className="ct">{b.count}</span>
          </button>
        ))}
      </div>
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
