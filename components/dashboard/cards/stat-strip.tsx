"use client"

/**
 * The five headline figures across the top of the dashboard.
 *
 * Plain cards rather than one bordered widget: each number stands on its own,
 * and grouping them inside a panel added a frame around a frame. A zero prints
 * greyed, so on a new project the eye goes to the figures that actually carry a
 * measurement.
 *
 * Only metrics that are genuinely OUT OF something get a filled bar. Authority
 * is a score out of 100 and the tracked-keyword bar is the share of them that
 * rank; backlinks, organic keywords and traffic have no ceiling, so their track
 * stays empty rather than inventing a proportion to fill it with.
 */

import { InfoHint } from "@/components/dashboard/widget"
import { StatStripSkeleton } from "@/components/dashboard/shell-skeleton"
import { cn } from "@/lib/utils"

const nf = (n: number) => n.toLocaleString()
const clamp = (n: number) => Math.max(0, Math.min(100, n))

/** Weak scores red, middling amber, strong green — the band is readable before
 *  the number is. */
const scoreBand = (v: number | null) => {
  if (v == null) return { bar: "bg-muted-foreground/30", text: "text-muted-foreground/50" }
  if (v >= 60) return { bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" }
  if (v >= 30) return { bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" }
  return { bar: "bg-red-500", text: "text-red-600 dark:text-red-400" }
}

function Stat({
  label, hint, value, caption, tone, fill, fillClass,
}: {
  label: string
  hint: string
  value: React.ReactNode
  caption: string
  tone?: string
  /** Percentage of the track to fill, or null when the metric has no ceiling. */
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
        <span className={cn("text-[34px] font-bold leading-none tracking-[-0.02em] tabular-nums", tone ?? "text-primary")}>{value}</span>
        <span className="text-[13px] text-muted-foreground">{caption}</span>
      </div>
      <div className="mt-3.5 h-[5px] overflow-hidden rounded-[3px] bg-muted">
        {fill != null && fill > 0 && (
          <div className={cn("h-full rounded-[3px]", fillClass ?? "bg-primary")} style={{ width: `${clamp(fill)}%` }} />
        )}
      </div>
    </div>
  )
}

export type StatStripProps = {
  loading: boolean
  da: number | null
  backlinks: number | null
  tracked: number
  organicKeywords: number
  estTraffic: number
}

export function StatStrip(p: StatStripProps) {
  const band = scoreBand(p.da)
  const rankedPct = p.tracked ? Math.round((p.organicKeywords / p.tracked) * 100) : 0
  /** Greyed when there is nothing to report, so real numbers stand out. */
  const dim = (n: number | null) => (n ? undefined : "text-muted-foreground/50")

  // The SAME placeholders the shell draws, so the hand-off mid-load is invisible.
  if (p.loading) return <StatStripSkeleton />

  return (
    <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-5">
      <Stat
        label="Authority Score"
        hint="A 0–100 estimate of the domain's strength, from the number and quality of sites linking to it. Under 30 is weak, 30–59 middling, 60+ strong."
        value={p.da ?? "—"}
        tone={band.text}
        caption={p.da == null ? "not measured yet" : p.da >= 60 ? "strong · of 100" : p.da >= 30 ? "moderate · of 100" : "weak · of 100"}
        fill={p.da}
        fillClass={band.bar}
      />

      <Stat
        label="Backlinks"
        hint="Total inbound links we have found pointing at this domain, refreshed daily from the backlink provider."
        value={p.backlinks != null ? nf(p.backlinks) : "—"}
        tone={dim(p.backlinks)}
        caption="inbound links"
        // No ceiling to be a proportion of, so the track stays empty.
        fill={null}
      />

      <Stat
        label="Tracked Keywords"
        hint="Keywords you have added to Position Tracking. We check each one on your project's schedule."
        value={nf(p.tracked)}
        tone={dim(p.tracked)}
        caption={`${rankedPct}% of them rank`}
        fill={rankedPct}
      />

      <Stat
        label="Organic Keywords"
        hint="Keywords where this domain appears anywhere in the top 100 organic results."
        value={nf(p.organicKeywords)}
        tone={dim(p.organicKeywords)}
        caption="ranking in top 100"
        fill={null}
      />

      <Stat
        label="Organic Traffic"
        hint="Estimated monthly organic visits, modelled from each keyword's position × search volume."
        value={nf(p.estTraffic)}
        tone={dim(p.estTraffic)}
        caption="est. monthly visits"
        fill={null}
      />
    </div>
  )
}
