"use client"

/**
 * One headline figure, with the label, an explanation and an optional track.
 *
 * Extracted from the Overview's StatStrip so the project page can be headed the
 * same way. It was a private component there, and copying it would have meant
 * two stat designs drifting apart the moment either was touched — which is how
 * the project page ended up with a different one in the first place.
 *
 * The InfoHint is the point of the component as much as the number is. A figure
 * like "2.5" or "9 / 100" means nothing without knowing what it counts and what
 * counts as good, and that explanation has nowhere to live in a bare label.
 */

import { InfoHint } from "@/components/dashboard/widget"
import { cn } from "@/lib/utils"

const clamp = (n: number) => Math.max(0, Math.min(100, n))

export function StatCard({
  label,
  hint,
  value,
  caption,
  tone,
  fill,
  fillClass,
}: {
  label: string
  /** What the number means, and what a good one looks like. */
  hint: React.ReactNode
  value: React.ReactNode
  /** Sub-line under the figure. A node, so a delta pill can sit here. */
  caption?: React.ReactNode
  tone?: string
  /**
   * Percentage of the track to fill, or null when the metric has no ceiling.
   * Only a metric that is genuinely OUT OF something gets a bar — inventing a
   * proportion for backlinks or traffic would draw a progress bar toward a
   * maximum that does not exist.
   */
  fill?: number | null
  fillClass?: string
}) {
  return (
    <div className="min-w-0 rounded-xl border bg-card px-4.5 py-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
        <span className="truncate">{label}</span>
        <InfoHint>{hint}</InfoHint>
      </div>
      <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2">
        <span
          className={cn(
            "text-[34px] font-bold leading-none tracking-[-0.02em] tabular-nums",
            tone ?? "text-primary",
          )}
        >
          {value}
        </span>
      </div>
      <div className="mt-2 min-h-5 text-[13px] text-muted-foreground">{caption}</div>
      {/* The empty track is only drawn when there IS a proportion to show.
          Rendering it regardless put a stray grey rule under every card that
          has no ceiling — position, dates, counts — which read as a divider to
          nowhere rather than as an empty bar. */}
      {fill != null && (
        <div className="mt-2 h-[5px] overflow-hidden rounded-[3px] bg-muted">
          {fill > 0 && (
            <div
              className={cn("h-full rounded-[3px]", fillClass ?? "bg-primary")}
              style={{ width: `${clamp(fill)}%` }}
            />
          )}
        </div>
      )}
    </div>
  )
}

/** Weak red, middling amber, strong green — the band reads before the number. */
export function scoreBand(v: number | null) {
  if (v == null) return { bar: "bg-muted-foreground/30", text: "text-muted-foreground/50" }
  if (v >= 60) return { bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" }
  if (v >= 30) return { bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" }
  return { bar: "bg-red-500", text: "text-red-600 dark:text-red-400" }
}
