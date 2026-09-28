"use client"

import { ChevronDown, ExternalLink, Map as MapIcon } from "lucide-react"
import { AreaDifficultyPill, BusinessAvatar, RankBadge, RatingStars } from "./business-bits"
import { rankColor } from "./grid"
import type { AreaDifficulty, CompetitorRow as Row } from "./types"

/**
 * A Google Maps link for a business we did not resolve ourselves.
 *
 * `cid` is Google's own map-entity id and gives the most reliable deep link.
 * place_id needs the `query` parameter filled as well — Google rejects a
 * query_place_id on its own — so the name goes in as the query. With neither
 * id, a plain name+address search is still better than no link, because the
 * user's actual question is "who is this", not "open this exact record".
 */
export function googleMapsUrl(row: Row): string {
  if (row.cid) return `https://maps.google.com/?cid=${encodeURIComponent(row.cid)}`
  const query = encodeURIComponent([row.name, row.address].filter(Boolean).join(" "))
  if (row.placeId) {
    return `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${encodeURIComponent(row.placeId)}`
  }
  return `https://www.google.com/maps/search/?api=1&query=${query}`
}

/**
 * One business in the report's competitor list, expanding in place.
 *
 * Laid out in columns on the report's full width — who they are, then where
 * they were found, how often they were top 3, and how visible they are across
 * the grid — so each figure sits straight under its header and the list reads
 * down a column rather than row by row. On a narrow screen the columns fold
 * back into the stacked layout (see the container query in position-map.css).
 *
 * The badge is the business's average rank, in the pins' own colours; the
 * order of the list is the server's (share of top-3 spots). The visibility bar
 * is drawn on the same 0-100 scale on every row, so the shape of that column
 * answers "who actually owns this area" before any number is read.
 */
export function CompetitorRowItem({
  row,
  expanded,
  comparing,
  areaDifficulty,
  onToggle,
  onCompare,
}: {
  row: Row
  expanded: boolean
  comparing: boolean
  areaDifficulty: AreaDifficulty | null
  onToggle: () => void
  onCompare: () => void
}) {
  // Same colour the pins and the rank badge use, so a row's bar and its badge
  // can never tell different stories about the same business.
  const fill = rankColor(row.arp == null ? null : Math.round(row.arp), "SUCCEEDED").bg
  const pct = row.visibility ?? 0

  return (
    <div className="mt-cmp" data-target={row.isTarget || undefined} data-expanded={expanded || undefined}>
      <button type="button" className="mt-cmp-head" aria-expanded={expanded} onClick={onToggle}>
        <RankBadge arp={row.arp} size={30} />
        <BusinessAvatar name={row.name} imageUrl={row.imageUrl} size={44} />

        <span className="mt-cmp-id">
          <span className="nm">
            {row.name}
            {row.isTarget && <span className="you">You</span>}
          </span>
          <span className="sub">
            {row.address && <span className="ad">{row.address}</span>}
            {row.category && <span className="ct">{row.category}</span>}
          </span>
          <RatingStars rating={row.rating} reviewCount={row.reviewCount} />
        </span>

        <span className="mt-cmp-num" data-label="Found in" title="Grid points where they appear in the top 20">
          {row.foundPoints}
          <span className="of"> / {row.scoredPoints}</span>
        </span>
        <span className="mt-cmp-num" data-label="Top 3" title="Share of the grid where they rank in the top 3">
          {row.solv != null ? `${Math.round(row.solv)}%` : "—"}
        </span>

        {/* The row's own visibility, on the same scale as every other row. */}
        <span className="mt-cmp-bar" title={`Visible at ${Math.round(pct)}% across this grid`}>
          <span className="track">
            <i style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: fill }} />
          </span>
          <span className="pct">{row.visibility != null ? `${Math.round(row.visibility)}%` : "—"}</span>
        </span>

        <ChevronDown size={15} className="chev" aria-hidden />
      </button>

      {expanded && (
        <div className="mt-cmp-body">
          <div className="mt-cmp-facts">
            <Fact label="Top 3" value={row.solv != null ? `${Math.round(row.solv)}%` : "—"} />
            <Fact label="Found at" value={`${row.foundPoints}/${row.scoredPoints}`} />
            <Fact label="Avg rank" value={row.arp != null ? row.arp.toFixed(1) : "—"} />
            <Fact label="Coverage" value={`${row.percentOfResults.toFixed(0)}%`} />
          </div>

          <div className="mt-cmp-diff">
            <AreaDifficultyPill difficulty={areaDifficulty} />
          </div>

          <div className="mt-cmp-acts">
            <a className="btn sm" href={googleMapsUrl(row)} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={12} /> Open in Google Maps
            </a>
            {!row.isTarget && (
              <button
                type="button"
                className={comparing ? "btn sm primary" : "btn sm"}
                onClick={onCompare}
                aria-pressed={comparing}
              >
                <MapIcon size={12} /> {comparing ? "Showing on map" : "Compare on map"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-cmp-fact">
      <span className="l">{label}</span>
      <span className="v">{value}</span>
    </div>
  )
}
