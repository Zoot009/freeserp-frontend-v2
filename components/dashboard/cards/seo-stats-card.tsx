"use client"

/**
 * SEO widget — the six headline numbers for the selected project.
 *
 * Each metric is a self-contained tile: the label, the figure at display size,
 * its change beside it, and a small visual (sparkline, gauge or share bar) that
 * gives the number context. Every figure is derived from real rank checks or the
 * domain's authority record.
 */

import { Area, AreaChart } from "recharts"
import { ChartContainer } from "@/components/ui/chart"
import { SeoTilesSkeleton } from "@/components/dashboard/shell-skeleton"
import { InfoHint, Widget } from "@/components/dashboard/widget"
import { cn } from "@/lib/utils"

const nf = (n: number) => n.toLocaleString()

export type TrendPoint = { label: string; v: number }

function Spark({ data, id }: { data: TrendPoint[]; id: string }) {
  if (data.length < 2) return <div className="h-8" />
  return (
    <ChartContainer config={{ v: { color: "var(--primary)" } }} className="!aspect-auto h-8 w-full">
      <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-v)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--color-v)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area dataKey="v" type="monotone" stroke="var(--color-v)" strokeWidth={1.8} fill={`url(#${id})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ChartContainer>
  )
}

/**
 * Score band → colour. Weak scores are red, middling amber, strong green, so
 * the tile says how you're doing before the number is even read.
 */
const scoreBand = (v: number | null) => {
  if (v == null) return { bar: "bg-muted-foreground/30", text: "" }
  if (v >= 60) return { bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" }
  if (v >= 30) return { bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" }
  return { bar: "bg-red-500", text: "text-red-600 dark:text-red-400" }
}

/**
 * Filled share of a track. Every tile's visual is exactly h-8, so the six
 * numbers, bars and footers line up across the row whatever they contain.
 */
function ShareBar({ pct, className }: { pct: number; className?: string }) {
  return (
    <div className="flex h-8 items-center">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full bg-primary transition-[width]", className)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
    </div>
  )
}

/**
 * Plain coloured text beside the figure, as in the reference — a pill here
 * competed with the number it was meant to annotate. Zero still prints, greyed,
 * so "no change" reads differently from "not measured".
 */
function Delta({ v, suffix = "" }: { v: number | null; suffix?: string }) {
  if (v == null) return null
  if (v === 0) return <span className="text-[13px] tabular-nums text-muted-foreground">0{suffix}</span>
  return (
    <span className={cn("text-[13px] font-medium tabular-nums", v > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
      {v > 0 ? "+" : ""}{v}{suffix}
    </span>
  )
}

function Tile({
  label, hint, value, valueClassName, delta, footer, visual,
}: {
  label: string
  hint: string
  value: React.ReactNode
  valueClassName?: string
  delta?: React.ReactNode
  footer?: React.ReactNode
  visual?: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-lg border bg-background p-3.5 transition-colors hover:border-primary/30 hover:bg-primary/[0.02]">
      {/* Sentence case at 13px, matching the reference — the uppercase 11px
          micro-label read as a form field rather than a metric name. Fixed h-5
          keeps every tile's number on the same baseline. */}
      <div className="flex h-5 items-center gap-1">
        <span className="truncate text-[13px] text-foreground/70">{label}</span>
        <InfoHint>{hint}</InfoHint>
      </div>

      <div className="mt-2 flex h-[28px] flex-wrap items-baseline gap-x-2">
        <span className={cn("text-[28px] font-bold leading-none tracking-tight tabular-nums", valueClassName ?? "text-primary")}>{value}</span>
        {delta}
      </div>

      <div className="mt-2.5">{visual}</div>
      {/* mt-auto pins the footer to the bottom, so all six align even if a tile
          above it grows. */}
      <div className="mt-auto truncate pt-2.5 text-[12px] text-muted-foreground">{footer}</div>
    </div>
  )
}

export type SeoStatsProps = {
  loading: boolean
  da: number | null
  estTraffic: number
  trafficTrend: TrendPoint[]
  organicKeywords: number
  keywordsDelta: number
  keywordsTrend: TrendPoint[]
  tracked: number
  backlinks: number | null
  visibility: number
  visibilityDelta: number
  avgPos: number | null
  updatedAt?: string | null
}

export function SeoStatsCard(p: SeoStatsProps) {
  const rankedPct = p.tracked ? Math.round((p.organicKeywords / p.tracked) * 100) : 0
  const daBand = scoreBand(p.da)

  return (
    <Widget
      id="seo"
      pill={{ label: "SEO" }}
      bodyClassName="p-3.5"
      meta={p.updatedAt ? <span className="hidden lg:inline">Updated {p.updatedAt}</span> : null}
    >
      {/* The SAME tiles the shell's placeholder grid draws. Six solid slabs here
          meant the shape changed halfway through a refresh, which read as a
          second, separate skeleton rather than one continuous load. */}
      {p.loading ? (
        <SeoTilesSkeleton />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Tile
            label="Authority Score"
            hint="Domain authority (0–100) derived from the site's backlink profile. Under 30 is weak, 30–59 middling, 60+ strong."
            value={p.da ?? "—"}
            valueClassName={daBand.text}
            footer={<>{p.da == null ? "not measured yet" : p.da >= 60 ? "strong · of 100" : p.da >= 30 ? "moderate · of 100" : "weak · of 100"}</>}
            visual={<ShareBar pct={p.da ?? 0} className={daBand.bar} />}
          />

          <Tile
            label="Organic Traffic"
            hint="Estimated monthly organic visits, modelled from each keyword's position × search volume."
            value={nf(p.estTraffic)}
            footer="est. monthly visits"
            visual={<Spark data={p.trafficTrend} id="seo-spark-traffic" />}
          />

          <Tile
            label="Organic Keywords"
            hint="Tracked keywords currently ranking inside Google's top 100."
            value={nf(p.organicKeywords)}
            delta={<Delta v={p.keywordsDelta} />}
            footer="ranking in top 100"
            visual={<Spark data={p.keywordsTrend} id="seo-spark-keywords" />}
          />

          <Tile
            label="Tracked Keywords"
            hint="Every keyword in this project, ranking or not."
            value={nf(p.tracked)}
            footer={<>{rankedPct}% of them rank</>}
            visual={<ShareBar pct={rankedPct} />}
          />

          <Tile
            label="Backlinks"
            hint="Total inbound links to the domain, refreshed daily from the backlink provider."
            value={p.backlinks != null ? nf(p.backlinks) : "—"}
            footer="inbound links"
            visual={<ShareBar pct={p.backlinks ? 100 : 0} className="bg-sky-500" />}
          />

          <Tile
            label="Visibility"
            hint="CTR-weighted share of the searches your tracked keywords cover. 100% would mean every keyword ranks #1."
            value={`${p.visibility}%`}
            delta={<Delta v={p.visibilityDelta} suffix="%" />}
            footer={<>avg. position {p.avgPos ?? "—"}</>}
            visual={<ShareBar pct={p.visibility} className="bg-fuchsia-500" />}
          />
        </div>
      )}
    </Widget>
  )
}
