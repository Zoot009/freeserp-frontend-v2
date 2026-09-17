"use client"

import { Star } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { rankColor, type AreaDifficulty } from "./grid"

/**
 * The pieces the target card and every competitor row both render.
 *
 * They live together because "the same number must mean the same thing for you
 * and for them" is the rule the whole leaderboard rests on — a visibility bar
 * that looked different in the two places would quietly undo that.
 */

/**
 * Listing photo, or a monogram built from the name.
 *
 * Never an empty frame or a placeholder image: `imageUrl` is absent for every
 * scan that ran before the provider mapper captured it, and a broken-image icon
 * would read as "this business has no photo" rather than "we didn't fetch one".
 */
export function BusinessAvatar({
  name,
  imageUrl,
  size = 48,
}: {
  name: string
  imageUrl: string | null
  size?: number
}) {
  const initials = monogram(name)
  return (
    <span
      className="mt-avatar"
      style={{ width: size, height: size, fontSize: Math.round(size / 2.9) }}
      aria-hidden
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- provider CDN host is not known ahead of time, so next/image cannot be configured for it
        <img src={imageUrl} alt="" loading="lazy" onError={hideBrokenImage} />
      ) : (
        initials
      )}
    </span>
  )
}

/** A photo URL that 404s falls back to the monogram underneath rather than a broken icon. */
function hideBrokenImage(e: React.SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.style.display = "none"
}

function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase()
  return (words[0]![0]! + words[1]![0]!).toUpperCase()
}

/**
 * The rank badge, coloured on the same scale as the map pins.
 *
 * Labelled with ARP rounded to a whole number, not SoLV: "Rank 6" is what a
 * person looks for first, and a percentage in a round badge reads as a score
 * out of the wrong thing.
 */
export function RankBadge({ arp, size = 34 }: { arp: number | null; size?: number }) {
  const rank = arp == null ? null : Math.round(arp)
  const color = rankColor(rank, "SUCCEEDED")
  return (
    <span
      className="mt-rankbadge"
      style={{ width: size, height: size, background: color.bg, color: color.fg, fontSize: Math.round(size / 2.4) }}
      title={arp == null ? "Not found anywhere in this grid" : `Average rank ${arp.toFixed(1)}`}
    >
      {rank ?? "—"}
    </span>
  )
}

/** Stars + the numeric value + the review count. Renders nothing without a rating. */
export function RatingStars({ rating, reviewCount }: { rating: number | null; reviewCount: number | null }) {
  if (rating == null) return null
  const rounded = Math.round(rating)
  return (
    <span className="mt-stars" title={`${rating.toFixed(1)} out of 5`}>
      <span className="ico" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} size={10} fill={i <= rounded ? "currentColor" : "none"} strokeWidth={1.5} />
        ))}
      </span>
      <span className="v">{rating.toFixed(1)}</span>
      {reviewCount != null && <span className="n">({reviewCount.toLocaleString()})</span>}
    </span>
  )
}

/**
 * Visibility as a label, a percentage and a filled track.
 *
 * The bar is filled with the rank colour for the equivalent position rather
 * than a single brand colour, so a bad visibility number looks bad at a glance
 * and matches the pins that produced it.
 */
export function VisibilityBar({
  visibility,
  arp,
  compact = false,
}: {
  visibility: number | null
  arp: number | null
  compact?: boolean
}) {
  const pct = visibility ?? 0
  const fill = rankColor(arp == null ? null : Math.round(arp), "SUCCEEDED").bg
  return (
    <div className={compact ? "mt-vis compact" : "mt-vis"}>
      <div className="mt-vis-h">
        <span className="lbl">Visibility</span>
        <span className="val">{visibility != null ? `${Math.round(visibility)}%` : "—"}</span>
      </div>
      <div className="mt-vis-track">
        <i style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: fill }} />
      </div>
    </div>
  )
}

const DIFFICULTY_LABEL: Record<AreaDifficulty, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
}

/**
 * How contested this area looks.
 *
 * A property of the MARKET, so it is the same value everywhere it appears in
 * one keyword's results — it is not a score for any one business. The tooltip
 * says "heuristic" in as many words, because that is what it is: two proxy
 * signals bucketed into three bands, not a measurement.
 */
export function AreaDifficultyPill({ difficulty }: { difficulty: AreaDifficulty | null }) {
  if (difficulty == null) {
    return (
      <span className="mt-diff" data-level="none" title="This scan ran before review counts were captured, so difficulty cannot be worked out for it.">
        Difficulty not available
      </span>
    )
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="mt-diff" data-level={difficulty.toLowerCase()} tabIndex={0}>
            {DIFFICULTY_LABEL[difficulty]} difficulty
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[260px] text-[12px] leading-relaxed">
          A heuristic, not a measurement. It combines how often one business holds the
          top spot across the grid with how many reviews the top-3 businesses carry.
          Same value for every business here — it describes the area, not you.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * A change chip against the previous comparable scan.
 *
 * `improvementIs` is the whole point. A LOWER rank number is better and a
 * HIGHER visibility percentage is better, so the two chips derive their colour
 * from opposite comparisons off the same delta. Getting this backwards makes
 * the card lie, which is worse than showing no chip at all.
 */
export function DeltaChip({
  delta,
  improvementIs,
  format = (n: number) => `${Math.abs(n)}`,
}: {
  delta: number | null
  improvementIs: "lower" | "higher"
  format?: (n: number) => string
}) {
  if (delta == null) return null
  if (Math.abs(delta) < 0.5) {
    return <span className="mt-delta" data-dir="flat" title="No change since the previous scan">—</span>
  }

  const improved = improvementIs === "lower" ? delta < 0 : delta > 0
  // The arrow follows the NUMBER's direction; the colour follows whether that
  // direction is good. They disagree for rank, and that is correct.
  const arrow = delta < 0 ? "▼" : "▲"

  return (
    <span
      className="mt-delta"
      data-dir={improved ? "up" : "down"}
      title={`${improved ? "Improved" : "Worse"} by ${format(delta)} since the previous comparable scan`}
    >
      {arrow} {format(delta)}
    </span>
  )
}
