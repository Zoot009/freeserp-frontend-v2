"use client"

import { Sparkles } from "lucide-react"
import { RailSection } from "./position-map-shell"
import { KeywordChips } from "./keyword-chips"
import { RankDistributionStrip } from "./rank-distribution"
import { TargetCard } from "./target-card"
import { CompetitorFilters, type CompetitorFilterState } from "./competitor-filters"
import { CompetitorList } from "./competitor-list"
import type { RankBandKey } from "./grid"
import type { CompetitorLeaderboard, CompetitorRow, Scan, ScanKeyword } from "./types"
import type { ScanDeltas } from "./use-scan-history"

/**
 * Everything in the docked rail, in one component.
 *
 * Extracted from the page so the desktop rail and the below-lg bottom sheet
 * render the exact same tree — the alternative is two copies of the rail that
 * drift apart, which is how a filter ends up working on one breakpoint only.
 */
export function PositionRail({
  scan,
  activeKeyword,
  leaderboard,
  leaderboardLoading,
  filteredRows,
  filters,
  onFiltersChange,
  deltas,
  activeBand,
  onBandToggle,
  onKeywordChange,
  comparingKey,
  onCompare,
  onOpenAi,
}: {
  scan: Scan
  activeKeyword: ScanKeyword
  leaderboard: CompetitorLeaderboard | null
  leaderboardLoading: boolean
  filteredRows: CompetitorRow[]
  filters: CompetitorFilterState
  onFiltersChange: (f: CompetitorFilterState) => void
  deltas: ScanDeltas
  activeBand: RankBandKey | null
  onBandToggle: (k: RankBandKey) => void
  onKeywordChange: (id: string) => void
  comparingKey: string | null
  onCompare: (row: CompetitorRow | null) => void
  onOpenAi: () => void
}) {
  const allRows = leaderboard?.rows ?? []
  const targetRow = allRows.find((r) => r.isTarget) ?? null
  const filtered = filteredRows.length !== allRows.length

  const aiState = aiButtonState(scan)

  return (
    <>
      <RailSection title={`Keywords · ${scan.keywords.length}`}>
        <KeywordChips keywords={scan.keywords} activeId={activeKeyword.id} onChange={onKeywordChange} />
      </RailSection>

      <RailSection>
        <RankDistributionStrip
          points={activeKeyword.points}
          activeBand={activeBand}
          onBandToggle={onBandToggle}
        />
      </RailSection>

      <RailSection>
        <TargetCard
          scan={scan}
          keyword={activeKeyword}
          targetRow={targetRow}
          areaDifficulty={activeKeyword.areaDifficulty ?? leaderboard?.areaDifficulty ?? null}
          leaderSolv={leaderboard?.insights.topSolv ?? null}
          rankDelta={deltas.rankDelta}
          visibilityDelta={deltas.visibilityDelta}
          deltaNote={
            deltas.previous
              ? `vs ${new Date(deltas.previous.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
              : null
          }
        />

        {aiState !== "hidden" && (
          <button
            type="button"
            className={aiState === "ready" ? "btn primary mt-aibtn" : "btn mt-aibtn"}
            disabled={aiState !== "ready"}
            onClick={onOpenAi}
          >
            {aiState === "working" ? (
              <>
                <span className="mt-spinner sm" aria-hidden /> Analysing this scan
              </>
            ) : aiState === "failed" ? (
              "Analysis unavailable"
            ) : (
              <>
                <Sparkles size={14} /> View AI recommendations
              </>
            )}
          </button>
        )}
      </RailSection>

      <RailSection
        flush
        title={
          filtered
            ? `Competitors · ${filteredRows.length} of ${allRows.length}`
            : `Competitors · ${allRows.length}`
        }
        aside={<CompetitorFilters value={filters} onChange={onFiltersChange} rows={allRows} />}
      >
        <CompetitorList
          leaderboard={leaderboard}
          rows={filteredRows}
          loading={leaderboardLoading}
          unit={scan.displayUnit}
          comparingKey={comparingKey}
          onCompare={onCompare}
        />
      </RailSection>
    </>
  )
}

/**
 * The AI button has four states and only one of them is a button you can press.
 *
 * "Generate analysis" for a scan that never requested one is deliberately NOT
 * offered: there is no endpoint to generate a report after the fact, and the
 * spec allows hiding the button instead of inventing one. A button that cannot
 * work is worse than no button.
 */
function aiButtonState(scan: Scan): "ready" | "working" | "failed" | "hidden" {
  if (!scan.aiAnalysisRequested) return "hidden"
  const report = scan.aiReport
  if (!report || report.status === "PENDING" || report.status === "GENERATING") return "working"
  if (report.status === "FAILED" || !report.content) return "failed"
  return "ready"
}
