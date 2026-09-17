"use client"

import { useMemo, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { formatDistance, type DistanceUnit } from "./grid"
import { CompetitorRowItem } from "./competitor-row"
import type { CompetitorLeaderboard, CompetitorRow } from "./types"

/** Above this many rows the list windows itself; a 21x21 scan can surface a few hundred businesses. */
const VIRTUALIZE_ABOVE = 50
const COLLAPSED_ROW_PX = 92

/**
 * The ranked list of everyone in this grid.
 *
 * The target appears inline at its own position, marked "You", as well as in
 * its own card above. A leaderboard that hides where you sit among the rows is
 * harder to read than one that shows you in place — the card answers "how am I
 * doing", the inline row answers "who is directly above me".
 */
export function CompetitorList({
  leaderboard,
  rows,
  loading,
  unit,
  comparingKey,
  onCompare,
}: {
  leaderboard: CompetitorLeaderboard | null
  /** Already filtered by the caller; ordering is the server's. */
  rows: CompetitorRow[]
  loading: boolean
  unit: DistanceUnit
  comparingKey: string | null
  onCompare: (row: CompetitorRow | null) => void
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const summary = useMemo(() => standingSentence(leaderboard, unit), [leaderboard, unit])

  if (loading && !leaderboard) {
    return <div className="mt-cmp-note">Working out who else appears here…</div>
  }
  if (!leaderboard) {
    return <div className="mt-cmp-note">Couldn&apos;t load the competitor comparison for this keyword.</div>
  }
  if (rows.length === 0) {
    return <div className="mt-cmp-note">No businesses match these filters.</div>
  }

  const body =
    rows.length > VIRTUALIZE_ABOVE ? (
      <VirtualRows
        rows={rows}
        scrollRef={scrollRef}
        expandedKey={expandedKey}
        comparingKey={comparingKey}
        areaDifficulty={leaderboard.areaDifficulty}
        onToggle={setExpandedKey}
        onCompare={onCompare}
      />
    ) : (
      rows.map((row) => (
        <CompetitorRowItem
          key={row.key}
          row={row}
          expanded={expandedKey === row.key}
          comparing={comparingKey === row.key}
          areaDifficulty={leaderboard.areaDifficulty}
          onToggle={() => setExpandedKey((k) => (k === row.key ? null : row.key))}
          onCompare={() => onCompare(comparingKey === row.key ? null : row)}
        />
      ))
    )

  return (
    <>
      {/* What the standalone "Where you stand" card used to say, as one line. */}
      {summary && <div className="mt-cmp-summary">{summary}</div>}
      <div className="mt-cmp-list" ref={scrollRef}>
        {body}
      </div>
    </>
  )
}

/**
 * Windowed rendering for long lists.
 *
 * Only ever measures the COLLAPSED height up front and lets `measureElement`
 * correct a row that expands — an expanded row is several times taller, and a
 * fixed estimate would leave it overlapping its neighbour.
 */
function VirtualRows({
  rows,
  scrollRef,
  expandedKey,
  comparingKey,
  areaDifficulty,
  onToggle,
  onCompare,
}: {
  rows: CompetitorRow[]
  scrollRef: React.RefObject<HTMLDivElement | null>
  expandedKey: string | null
  comparingKey: string | null
  areaDifficulty: CompetitorLeaderboard["areaDifficulty"]
  onToggle: (key: string | null) => void
  onCompare: (row: CompetitorRow | null) => void
}) {
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => COLLAPSED_ROW_PX,
    overscan: 8,
    getItemKey: (i) => rows[i]!.key,
  })

  return (
    <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
      {virtualizer.getVirtualItems().map((v) => {
        const row = rows[v.index]!
        return (
          <div
            key={row.key}
            ref={virtualizer.measureElement}
            data-index={v.index}
            style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${v.start}px)` }}
          >
            <CompetitorRowItem
              row={row}
              expanded={expandedKey === row.key}
              comparing={comparingKey === row.key}
              areaDifficulty={areaDifficulty}
              onToggle={() => onToggle(expandedKey === row.key ? null : row.key)}
              onCompare={() => onCompare(comparingKey === row.key ? null : row)}
            />
          </div>
        )
      })}
    </div>
  )
}

/**
 * The one-line replacement for the old "Where you stand" card.
 *
 * Built from the unfiltered leaderboard on purpose: your position in the market
 * is a fact about the market, and it must not change because the reader ticked
 * a rating filter.
 */
function standingSentence(leaderboard: CompetitorLeaderboard | null, unit: DistanceUnit): string | null {
  if (!leaderboard) return null
  const all = leaderboard.rows
  const place = all.findIndex((r) => r.isTarget) + 1
  if (place < 1) return null

  const { isMarketLeader, topSolv, yourTop3DistanceMeters, marketAverageTop3DistanceMeters } = leaderboard.insights

  const lead = isMarketLeader
    ? `You lead this grid of ${all.length} businesses`
    : `You rank ${place} of ${all.length} businesses here${topSolv != null ? `, behind a leader holding ${Math.round(topSolv)}% of top-3 spots` : ""}`

  if (yourTop3DistanceMeters != null && marketAverageTop3DistanceMeters != null) {
    return `${lead}. Your top-3 ring reaches ${formatDistance(yourTop3DistanceMeters, unit)} against a market average of ${formatDistance(marketAverageTop3DistanceMeters, unit)}.`
  }
  return `${lead}.`
}
