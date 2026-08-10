"use client"

/**
 * Organic Rankings widget — the estimated-traffic curve for the range, plus how
 * many tracked keywords moved up, moved down, entered or left the top 100 over
 * the last 7 days (straight from the per-keyword deltas).
 */

import { Area, AreaChart, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { InfoHint, Widget } from "@/components/dashboard/widget"
import { cn } from "@/lib/utils"
import type { TrafficPoint } from "@/components/dashboard/cards/traffic-card"

export type Movements = { improved: number; declined: number; added: number; lost: number }

const ROWS = [
  { key: "improved", label: "Improved", tone: "bg-emerald-500", text: "text-emerald-600" },
  { key: "declined", label: "Declined", tone: "bg-amber-500", text: "text-amber-600" },
  { key: "added", label: "New", tone: "bg-primary", text: "text-primary" },
  { key: "lost", label: "Lost", tone: "bg-red-500", text: "text-red-500" },
] as const

export function OrganicRankingsCard({
  loading, history, movements, rangeLabel, className,
}: { loading: boolean; history: TrafficPoint[]; movements: Movements; rangeLabel: string; className?: string }) {
  const data = history.map((h) => ({ label: new Date(h.t).toLocaleDateString(undefined, { month: "short", day: "numeric" }), traffic: h.traffic }))
  const max = Math.max(1, ...ROWS.map((r) => movements[r.key]))

  return (
    <Widget
      id="organic-rankings"
      className={className}
      title="Organic Rankings"
      hint="Your estimated organic traffic over the range, and the keyword movement behind it."
      meta={<span>{rangeLabel}</span>}
    >
      <div className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground">
        Organic Traffic <InfoHint>Modelled from position × search volume for every completed check in the range.</InfoHint>
      </div>
      {loading ? (
        <Skeleton className="h-24 w-full" />
      ) : data.length > 1 ? (
        <ChartContainer config={{ traffic: { label: "Est. traffic", color: "var(--primary)" } }} className="!aspect-auto h-24 w-full">
          <AreaChart data={data} margin={{ top: 6, right: 2, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="or-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-traffic)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--color-traffic)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <ChartTooltip content={<ChartTooltipContent labelKey="label" />} />
            <Area dataKey="traffic" type="monotone" stroke="var(--color-traffic)" strokeWidth={1.8} fill="url(#or-fill)" dot={false} isAnimationActive={false} />
          </AreaChart>
        </ChartContainer>
      ) : (
        <div className="grid h-24 place-items-center rounded-md border border-dashed text-xs text-muted-foreground">No history yet</div>
      )}

      <div className="mb-2 mt-4 flex items-center gap-1 text-xs text-muted-foreground">
        Keyword Position Changes <InfoHint>Compared with 7 days ago: improved, declined, newly ranking, and dropped out of the top 100.</InfoHint>
      </div>
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}</div>
      ) : (
        <div className="flex flex-col gap-2">
          {ROWS.map((r) => {
            const v = movements[r.key]
            return (
              <div key={r.key} className="grid grid-cols-[62px_minmax(0,1fr)_28px] items-center gap-2.5 text-xs">
                <span className="text-muted-foreground">{r.label}</span>
                <span className="h-2.5 overflow-hidden rounded-sm bg-muted">
                  <span className={cn("block h-full rounded-sm", r.tone)} style={{ width: `${v ? Math.max(4, (v / max) * 100) : 0}%` }} />
                </span>
                <span className={cn("text-right tabular-nums font-medium", v ? r.text : "text-muted-foreground")}>{v}</span>
              </div>
            )
          })}
        </div>
      )}
    </Widget>
  )
}
