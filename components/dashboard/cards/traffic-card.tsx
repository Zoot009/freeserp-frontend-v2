"use client"

/**
 * Traffic Analytics — modelled organic traffic for the whole domain over the
 * selected range.
 *
 * Two of the four figures (bounce rate, pages per visit) describe on-site
 * behaviour, which no amount of rank data can produce. They print "—" with a
 * tooltip naming the integration that would fill them, rather than a modelled
 * number dressed up as a measurement.
 */

import { useState } from "react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { api, ApiError } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { GscState } from "@/components/dashboard/cards/setup-card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { InfoHint, Widget } from "@/components/dashboard/widget"
import { cn } from "@/lib/utils"

export type TrafficPoint = { t: string; traffic: number; pages: number }

const nf = (n: number) => n.toLocaleString()

const GoogleMark = () => (
  <svg width="14" height="14" viewBox="0 0 48 48" className="shrink-0" aria-hidden>
    <path fill="#4285f4" d="M45 24c0-1.6-.1-2.7-.4-4H24v8h12c-.2 2-1.5 4.9-4.4 6.9l6.7 5.2C42.2 36.4 45 30.8 45 24Z" />
    <path fill="#34a853" d="M24 46c6 0 11-2 14.3-5.4l-6.7-5.2c-1.8 1.2-4.3 2.1-7.6 2.1-5.8 0-10.8-3.8-12.6-9.1l-7 5.4C7.9 41 15.4 46 24 46Z" />
    <path fill="#fbbc05" d="M11.4 28.4A13.6 13.6 0 0 1 10.7 24c0-1.5.3-3 .7-4.4l-7-5.4A21.9 21.9 0 0 0 2 24c0 3.6.9 6.9 2.4 9.8l7-5.4Z" />
    <path fill="#ea4335" d="M24 10.5c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 4.4 30 2 24 2 15.4 2 7.9 7 4.4 14.2l7 5.4C13.2 14.3 18.2 10.5 24 10.5Z" />
  </svg>
)

/**
 * Which figures you're looking at.
 *
 * "FreeSERP Data" is what this card can compute on its own — positions × search
 * volume. "Google Data" is measured, not modelled, and lives behind an OAuth
 * connection, so the button hands off to the project's Search Console screen:
 * the sign-in flow when there's no connection yet, the real report once there
 * is. It deliberately does NOT flip the card into a half-populated Google view
 * — the two sources measure different things and stacking them in one frame
 * would invite reading a modelled number as a measured one.
 */
function SourceToggle({ gsc, onGoogle }: { gsc: GscState; onGoogle: () => void }) {
  // Three states, not two: an account can be connected while THIS project has no
  // property behind it, and "sign in with Google" would be wrong advice there.
  const hint = gsc.connected === null
    ? "Real clicks and impressions from Google Search Console, beside these modelled figures."
    : !gsc.connected
      ? "Sign in with Google to sit real Search Console clicks and impressions beside these modelled figures."
      : !gsc.siteUrl
        ? "Google is connected — pick the Search Console property that covers this project."
        : `Open the Search Console report — real clicks and impressions from ${gsc.siteUrl}.`
  return (
    <div className="inline-flex gap-0.5 rounded-[9px] bg-muted p-[3px]">
      <span className="rounded-[7px] bg-card px-2.5 py-[5px] text-[13px] font-semibold shadow-sm">FreeSERP Data</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onGoogle}
            className="inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-[5px] text-[13px] font-medium text-muted-foreground transition-colors hover:bg-border/60 hover:text-foreground"
          >
            <GoogleMark />
            Google Data
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-60 text-xs">{hint}</TooltipContent>
      </Tooltip>
    </div>
  )
}

function Stat({
  label, hint, value, dim, className,
}: {
  label: string
  hint: string
  value: React.ReactNode
  dim: boolean
  className?: string
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
        <span className="truncate">{label}</span>
        <InfoHint>{hint}</InfoHint>
      </div>
      <div className={cn("mt-0.5 text-[24px] font-bold leading-[1.3] tabular-nums", dim ? "text-muted-foreground/50" : "text-foreground")}>
        {value}
      </div>
    </div>
  )
}

export type TrafficProps = {
  projectId: string
  loading: boolean
  history: TrafficPoint[]
  estTraffic: number
  pages: number
  rangeLabel: string
  /** Account grant + this project's linked property. `connected` is null while
   *  the check is in flight — unknown, not disconnected. */
  gsc: GscState
  /** Pull fresh figures once a queued check has had time to land. */
  onChecked?: () => void
}

export function TrafficCard(p: TrafficProps) {
  const router = useRouter()
  const [running, setRunning] = useState(false)

  // The same endpoint the keywords page uses for "check now". A 429 here is the
  // rate limiter doing its job, so it's reported as such rather than as failure.
  const runCheck = async () => {
    setRunning(true)
    try {
      await api.post(`/api/projects/${p.projectId}/check`, {})
      toast.success("Check queued — the panels fill in as results land.")
      // The job runs on a worker, so nothing changes the instant this resolves.
      // Refetching after a beat is what makes the button feel like it did
      // something rather than printing a toast into a frozen page.
      if (p.onChecked) setTimeout(p.onChecked, 6000)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't start a check — please try again.")
    } finally {
      setRunning(false)
    }
  }

  const chart = p.history.map((h) => ({
    label: new Date(h.t).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    traffic: h.traffic,
  }))

  return (
    <Widget
      id="traffic"
      title="Traffic Analytics"
      hint="Modelled traffic for the whole domain, updated after each completed check."
      actions={
        <SourceToggle
          gsc={p.gsc}
          onGoogle={() => router.push(`/dashboard/project/${p.projectId}/search-console`)}
        />
      }
      meta={
        <>
          <span>{p.rangeLabel}</span>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[13px] font-semibold" onClick={runCheck} disabled={running}>
            <RefreshCw className={cn("size-3.5", running && "animate-spin")} />
            Run a check
          </Button>
        </>
      }
      bodyClassName="p-5"
    >
      <div className="grid grid-cols-2 gap-y-5 sm:grid-cols-4">
        <Stat
          label="Est. Visits"
          hint="Estimated organic sessions in the selected range, modelled from position × search volume."
          value={p.loading ? <Skeleton className="h-6 w-16" /> : nf(p.estTraffic)}
          dim={p.estTraffic === 0}
          className="pr-4"
        />
        <Stat
          label="Ranking Pages"
          hint="Distinct URLs on this domain that rank for at least one tracked keyword."
          value={p.loading ? <Skeleton className="h-6 w-12" /> : nf(p.pages)}
          dim={p.pages === 0}
          className="px-4 sm:border-l"
        />
        <Stat
          label="Bounce Rate"
          hint="Share of sessions that end without a second pageview. On-site behaviour, so it needs Google Analytics — rank data can't model it."
          value="—"
          dim
          className="pr-4 sm:border-l sm:px-4"
        />
        <Stat
          label="Pages / Visit"
          hint="Average pageviews per organic session. On-site behaviour, so it needs Google Analytics — rank data can't model it."
          value="—"
          dim
          className="pl-4 sm:border-l"
        />
      </div>

      {p.loading ? (
        <Skeleton className="mt-5 h-[190px] w-full rounded-[10px]" />
      ) : chart.length > 1 ? (
        <div className="mt-5 overflow-hidden rounded-[10px] border bg-bg-inset">
          <ChartContainer config={{ traffic: { label: "Est. visits", color: "var(--primary)" } }} className="!aspect-auto h-[190px] w-full">
            <AreaChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="tr-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-traffic)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--color-traffic)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} className="text-[11px]" />
              <ChartTooltip content={<ChartTooltipContent labelKey="label" />} />
              <Area dataKey="traffic" type="monotone" stroke="var(--color-traffic)" strokeWidth={2} fill="url(#tr-fill)" dot={false} isAnimationActive={false} />
            </AreaChart>
          </ChartContainer>
        </div>
      ) : (
        <div className="mt-5 grid h-[190px] place-items-center rounded-[10px] border border-dashed bg-bg-inset text-center">
          <div className="px-4">
            <p className="text-[13px] text-muted-foreground">
              No completed checks in this range yet — pick a longer range, or run a check.
            </p>
            <Button size="sm" className="mt-3 h-[34px] text-[13px] font-semibold" onClick={runCheck} disabled={running}>
              {running ? "Starting…" : "Run a check now"}
            </Button>
          </div>
        </div>
      )}
    </Widget>
  )
}
