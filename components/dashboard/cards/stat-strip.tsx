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

// Stat and scoreBand now live in components/dashboard/stat-card, so the project
// page presents a figure identically instead of carrying its own copy that
// drifts the moment either is touched.
import { StatCard as Stat, scoreBand } from "@/components/dashboard/stat-card"
import { StatStripSkeleton } from "@/components/dashboard/shell-skeleton"

const nf = (n: number) => n.toLocaleString()

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
        hint="How strong this domain is, from 0 to 100. Under 30 is weak, 30–59 middling, 60+ strong."
        value={p.da ?? "—"}
        tone={band.text}
        caption={p.da == null ? "not measured yet" : p.da >= 60 ? "strong · of 100" : p.da >= 30 ? "moderate · of 100" : "weak · of 100"}
        fill={p.da}
        fillClass={band.bar}
      />

      <Stat
        label="Backlinks"
        hint="How many links from other sites point at this domain."
        value={p.backlinks != null ? nf(p.backlinks) : "—"}
        tone={dim(p.backlinks)}
        caption="inbound links"
        // No ceiling to be a proportion of, so the track stays empty.
        fill={null}
      />

      <Stat
        label="Tracked Keywords"
        hint="How many keywords you're tracking. Each is checked on your project's schedule."
        value={nf(p.tracked)}
        tone={dim(p.tracked)}
        caption={`${rankedPct}% of them rank`}
        fill={rankedPct}
      />

      <Stat
        label="Organic Keywords"
        hint="Keywords where this site appears in the top 100 results."
        value={nf(p.organicKeywords)}
        tone={dim(p.organicKeywords)}
        caption="ranking in top 100"
        fill={null}
      />

      <Stat
        label="Organic Traffic"
        hint="How many visits your keywords are likely bringing you each month."
        value={nf(p.estTraffic)}
        tone={dim(p.estTraffic)}
        caption="visits per month"
        fill={null}
      />
    </div>
  )
}
