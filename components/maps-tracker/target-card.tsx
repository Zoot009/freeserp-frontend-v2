"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { MetricTiles, SolvHero } from "./results-summary"
import {
  AreaDifficultyPill,
  BusinessAvatar,
  DeltaChip,
  RankBadge,
  RatingStars,
  VisibilityBar,
} from "./business-bits"
import type { AreaDifficulty, CompetitorRow, Scan, ScanKeyword } from "./types"

/**
 * The headline element of the rail: your business, and how it did.
 *
 * Everything here answers "where do I stand" in one glance — a rank, a
 * visibility bar, how hard the area is. The analytical numbers (ARP / ATRP /
 * SoLV) are real value and do not disappear; they move into a disclosure
 * directly below, collapsed, because they answer a second question and were
 * previously crowding out the first.
 */
export function TargetCard({
  scan,
  keyword,
  targetRow,
  areaDifficulty,
  leaderSolv,
  rankDelta,
  visibilityDelta,
  deltaNote,
}: {
  scan: Scan
  keyword: ScanKeyword
  /** The target's own row from the leaderboard — the only source of a listing photo. */
  targetRow: CompetitorRow | null
  areaDifficulty: AreaDifficulty | null
  leaderSolv: number | null
  /** Change in ARP vs the previous comparable scan. Lower is better. */
  rankDelta: number | null
  /** Change in visibility % vs the previous comparable scan. Higher is better. */
  visibilityDelta: number | null
  /** What the deltas are measured against, for the caption under them. */
  deltaNote: string | null
}) {
  const [metricsOpen, setMetricsOpen] = useState(false)
  const visibility = keyword.visibility

  return (
    <>
      <div className="mt-target">
        <div className="mt-target-top">
          <RankBadge arp={keyword.arp} />
          <BusinessAvatar name={scan.location.name} imageUrl={targetRow?.imageUrl ?? null} size={64} />
          <div className="mt-target-id">
            <div className="nm">{scan.location.name}</div>
            <div className="ad" title={scan.location.address}>{scan.location.address}</div>
            {scan.location.primaryCategory && <div className="ct">{scan.location.primaryCategory}</div>}
            <RatingStars rating={scan.location.rating} reviewCount={scan.location.reviewCount} />
          </div>
        </div>

        {(rankDelta != null || visibilityDelta != null) && (
          <div className="mt-target-deltas">
            <span className="k">Rank</span>
            <DeltaChip delta={rankDelta} improvementIs="lower" format={(n) => Math.abs(n).toFixed(1)} />
            <span className="k">Visibility</span>
            <DeltaChip
              delta={visibilityDelta}
              improvementIs="higher"
              format={(n) => `${Math.abs(Math.round(n))}%`}
            />
          </div>
        )}
        {deltaNote && <div className="mt-target-deltanote">{deltaNote}</div>}

        <VisibilityBar visibility={visibility} arp={keyword.arp} />

        <div className="mt-target-foot">
          <AreaDifficultyPill difficulty={areaDifficulty} />
          <span className="tiny muted">
            {keyword.foundPoints} of {keyword.scoredPoints} points
          </span>
        </div>
      </div>

      {/* ARP / ATRP / SoLV — still here, just no longer the first thing read. */}
      <div className="mt-disclose" data-open={metricsOpen || undefined}>
        <button
          type="button"
          className="mt-disclose-h"
          aria-expanded={metricsOpen}
          onClick={() => setMetricsOpen((v) => !v)}
        >
          <span>Full metrics</span>
          <ChevronDown size={14} className="chev" aria-hidden />
        </button>
        {metricsOpen && (
          <div className="mt-disclose-b">
            <SolvHero solv={keyword.solv} scoredPoints={keyword.scoredPoints} leaderSolv={leaderSolv} />
            <MetricTiles arp={keyword.arp} atrp={keyword.atrp} />
          </div>
        )}
      </div>
    </>
  )
}
