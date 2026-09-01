"use client"

/**
 * Traffic Analytics — organic performance for the whole domain over the selected
 * range, from either of two sources.
 *
 *   FreeSERP Data  modelled from the positions we track × search volume. Always
 *                  available, never measured.
 *   Google Data    real clicks, impressions, CTR and average position from
 *                  Search Console. Measured, but only for the property linked to
 *                  this project, and only once someone has connected Google.
 *
 * The toggle swaps the card in place rather than navigating away. The two
 * sources are kept in separate views, never merged into one row of figures: they
 * measure different things, and a modelled visit sitting beside a measured click
 * invites reading one as the other. Each view labels which it is.
 */

import { useEffect, useState } from "react"
import Image from "next/image"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ArrowUpRight, ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react"
import { useRouter } from "@/i18n/navigation"
import { api, ApiError } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { type GscState, propertyCoversDomain } from "@/components/dashboard/gsc"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { InfoHint, Widget } from "@/components/dashboard/widget"
import { cn } from "@/lib/utils"

export type TrafficPoint = { t: string; traffic: number; pages: number }

/** The four figures Search Console reports for any slice. */
type GscMetrics = { clicks: number; impressions: number; ctr: number; position: number }
type GscPerformance = {
  siteUrl: string
  startDate: string
  endDate: string
  totals: GscMetrics
  previous: GscMetrics
  series: ({ date: string } & GscMetrics)[]
  /** Up to 1,000 rows each — already in the response, hence the pagination below. */
  topPages: ({ page: string } & GscMetrics)[]
  topQueries: ({ query: string } & GscMetrics)[]
}

type Source = "freeserp" | "google"

const nf = (n: number) => n.toLocaleString()

/**
 * Y-axis ticks, short enough to fit the gutter they are drawn in.
 *
 * The axis is 38px wide. "11,275" at 11px is wider than that, so the tick was
 * being clipped on its left edge and the scale read "l275 / 000 / 000 / 0" —
 * numbers that are not numbers, on a chart whose whole job is showing a
 * quantity. Compact notation fits in any gutter this card will ever have.
 */
const axisNf = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 })
const dayLabel = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" })

const GoogleMark = () => (
  <svg width="14" height="14" viewBox="0 0 48 48" className="shrink-0" aria-hidden>
    <path fill="#4285f4" d="M45 24c0-1.6-.1-2.7-.4-4H24v8h12c-.2 2-1.5 4.9-4.4 6.9l6.7 5.2C42.2 36.4 45 30.8 45 24Z" />
    <path fill="#34a853" d="M24 46c6 0 11-2 14.3-5.4l-6.7-5.2c-1.8 1.2-4.3 2.1-7.6 2.1-5.8 0-10.8-3.8-12.6-9.1l-7 5.4C7.9 41 15.4 46 24 46Z" />
    <path fill="#fbbc05" d="M11.4 28.4A13.6 13.6 0 0 1 10.7 24c0-1.5.3-3 .7-4.4l-7-5.4A21.9 21.9 0 0 0 2 24c0 3.6.9 6.9 2.4 9.8l7-5.4Z" />
    <path fill="#ea4335" d="M24 10.5c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 4.4 30 2 24 2 15.4 2 7.9 7 4.4 14.2l7 5.4C13.2 14.3 18.2 10.5 24 10.5Z" />
  </svg>
)

function SourceToggle({
  source, onChange, gsc,
}: {
  source: Source
  onChange: (s: Source) => void
  gsc: GscState
}) {
  // Three states, not two: an account can be connected while THIS project has no
  // property behind it, and "sign in with Google" would be wrong advice there.
  const hint = gsc.connected === null
    ? "Real clicks and impressions from Google Search Console."
    : !gsc.connected
      ? "Sign in with Google to see real Search Console clicks and impressions here."
      : !gsc.siteUrl
        ? "Google is connected — pick the Search Console property that covers this project."
        : `Real clicks and impressions from ${gsc.siteUrl}.`

  const base = "inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-[5px] text-[13px] transition-colors"
  const on = "bg-card font-semibold shadow-sm"
  const off = "font-medium text-muted-foreground hover:bg-border/60 hover:text-foreground"

  return (
    <div className="inline-flex gap-0.5 rounded-[9px] bg-muted p-[3px]">
      {/* Our mark beside Google's. Without it the active half read as a plain
          label while the inactive half was branded, which made Google look like
          the real source and FreeSERP like the placeholder. */}
      <button type="button" onClick={() => onChange("freeserp")} className={cn(base, source === "freeserp" ? on : off)}>
        <Image src="/logo.png" alt="" width={14} height={14} className="shrink-0" />
        FreeSERP Data
      </button>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={() => onChange("google")} className={cn(base, source === "google" ? on : off)}>
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
  label, hint, value, delta, dim, className,
}: {
  label: string
  hint: string
  value: React.ReactNode
  /** Change against the preceding window of equal length. */
  delta?: { text: string; good: boolean } | null
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
      {delta && (
        <span
          className={cn(
            "mt-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
            delta.good ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-600 dark:text-red-400",
          )}
        >
          {delta.text}
        </span>
      )}
    </div>
  )
}

type Series = { key: string; label: string; color: string }

/** Shared chart frame, so the two sources can't drift apart visually. */
function TimeChart({
  data, series, domainStart, now, ticks, zeroFloor,
}: {
  data: { ts: number }[]
  /** One or more series drawn on a shared axis. All are counts, so a shared
   *  scale is honest; a second axis would invite comparing two different units. */
  series: Series[]
  domainStart: number
  now: number
  ticks: number[]
  zeroFloor: boolean
}) {
  const config = Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: s.color }]))
  // A line needs two points. With one check in the range there is nothing to
  // draw between, so the panel is 230px of empty grid with a dot in the corner
  // — which reads as a chart that failed rather than a chart with one
  // measurement in it. The dot stays (it is real data), and the reason it is
  // alone is said in the middle of the space it leaves.
  const single = data.length < 2
  return (
    <div className="relative mt-5 overflow-hidden rounded-[10px] border bg-bg-inset">
      <ChartContainer config={config} className="!aspect-auto h-[230px] w-full">
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={`var(--color-${s.key})`} stopOpacity={0.28} />
                <stop offset="100%" stopColor={`var(--color-${s.key})`} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          {/* A TIME axis, not a category axis. Keyed on the date label, recharts
              spaced samples evenly no matter when they were taken — two checks
              two days apart were drawn stretched across a whole 30-day window,
              reading as a month of steady growth. */}
          <XAxis
            type="number"
            dataKey="ts"
            scale="time"
            domain={[domainStart, now]}
            ticks={ticks}
            tickFormatter={dayLabel}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            className="text-[11px]"
          />
          {/* Baseline pinned to 0 where the metric is a count. Letting recharts
              pick dataMin made a series of 0 → 2 fill the whole panel, so one
              visit looked like a vertical takeoff. */}
          <YAxis
            width={38}
            tickFormatter={(v: number) => axisNf.format(v)}
            allowDecimals={false}
            domain={zeroFloor ? [0, (max: number) => Math.max(1, Math.ceil(max))] : ["auto", "auto"]}
            tickLine={false}
            axisLine={false}
            className="text-[11px]"
          />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, pl) => dayLabel(Number(pl?.[0]?.payload?.ts))} />} />
          {series.map((s) => (
            <Area
              key={s.key}
              dataKey={s.key}
              type="monotone"
              stroke={`var(--color-${s.key})`}
              strokeWidth={2}
              fill={`url(#fill-${s.key})`}
              /* Dots on, deliberately. With them off, three samples in a 30-day
                 window are indistinguishable from thirty — the line looks
                 continuous either way. The dots are the honest signal of how
                 much was actually measured. */
              dot={{ r: 2.5, strokeWidth: 0, fill: `var(--color-${s.key})` }}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </AreaChart>
      </ChartContainer>

      {single && (
        // pointer-events-none so the dot underneath keeps its tooltip.
        <div className="pointer-events-none absolute inset-0 grid place-items-center p-4">
          <p className="max-w-[30ch] rounded-lg border bg-card/85 px-3 py-2 text-center text-xs leading-relaxed text-muted-foreground shadow-sm backdrop-blur-[2px]">
            One check so far. The line appears from the second one — checks run
            on this project&rsquo;s schedule.
          </p>
        </div>
      )}
    </div>
  )
}

/** Names the lines. Only worth drawing when there's more than one. */
function ChartLegend({ series }: { series: Series[] }) {
  if (series.length < 2) return null
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="h-[3px] w-3.5 shrink-0 rounded-full" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  )
}

// ── Top pages / queries ──────────────────────────────────────────────────────

const PAGE_SIZE = 10

/** Path only, so a column of URLs doesn't repeat the same origin 10 times. */
function shortUrl(raw: string): string {
  try {
    const u = new URL(raw)
    const path = `${u.pathname}${u.search}`
    return path === "/" ? "/" : path.replace(/\/$/, "")
  } catch {
    return raw
  }
}

type Row = GscMetrics & { key: string; href?: string }

/**
 * The pages and queries behind the totals above.
 *
 * Search Console returns up to 1,000 of each and the card was throwing both
 * away, sending anyone who wanted to know WHICH page earned the clicks off to
 * the full report. Ten at a time with pagination: enough to see the shape
 * without turning a dashboard card into a table nobody scrolls.
 */
function DimTable({ perf }: { perf: GscPerformance }) {
  const [tab, setTab] = useState<"pages" | "queries">("pages")
  const [page, setPage] = useState(0)

  const rows: Row[] =
    tab === "pages"
      ? (perf.topPages ?? []).map((r) => ({ ...r, key: shortUrl(r.page), href: r.page }))
      : (perf.topQueries ?? []).map((r) => ({ ...r, key: r.query }))

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  // Clamp rather than reset in an effect: switching to a shorter tab while on
  // page 8 should land on its last page, not silently snap to the first.
  const current = Math.min(page, pageCount - 1)
  const slice = rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)

  const GRID = "grid grid-cols-[minmax(0,1fr)_72px_92px_64px_72px] items-center gap-3"
  const TABS = [
    { id: "pages", label: "Top pages", n: perf.topPages?.length ?? 0 },
    { id: "queries", label: "Top queries", n: perf.topQueries?.length ?? 0 },
  ] as const

  return (
    <div className="mt-6 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex gap-0.5 rounded-[9px] bg-muted p-[3px]">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setTab(t.id); setPage(0) }}
              className={cn(
                "rounded-[7px] px-2.5 py-[5px] text-[13px] transition-colors",
                tab === t.id ? "bg-card font-semibold shadow-sm" : "font-medium text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label} <span className="tabular-nums opacity-60">{t.n}</span>
            </button>
          ))}
        </div>

        {pageCount > 1 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {current * PAGE_SIZE + 1}–{Math.min(rows.length, (current + 1) * PAGE_SIZE)} of {rows.length}
            </span>
            <Button variant="outline" size="icon" className="size-7" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Previous page">
              <ChevronLeft className="size-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="size-7" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)} aria-label="Next page">
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">
          Google reports no {tab} for this range.
        </p>
      ) : (
        <div className="mt-3">
          <div className={cn(GRID, "border-b pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground")}>
            <span>{tab === "pages" ? "Page" : "Query"}</span>
            <span className="text-right">Clicks</span>
            <span className="text-right">Impressions</span>
            <span className="text-right">CTR</span>
            <span className="text-right">Position</span>
          </div>
          {slice.map((r) => (
            <div key={r.key} className={cn(GRID, "border-b py-2 text-[13px] last:border-0")}>
              {r.href ? (
                <a href={r.href} target="_blank" rel="noopener noreferrer" title={r.href} className="truncate text-primary hover:underline">
                  {r.key}
                </a>
              ) : (
                <span className="truncate" title={r.key}>{r.key}</span>
              )}
              <span className="text-right font-semibold tabular-nums">{nf(r.clicks)}</span>
              <span className="text-right tabular-nums text-muted-foreground">{nf(r.impressions)}</span>
              <span className="text-right tabular-nums text-muted-foreground">{(r.ctr * 100).toFixed(1)}%</span>
              <span className="text-right tabular-nums text-muted-foreground">{r.position ? r.position.toFixed(1) : "—"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Centred message + optional action, used by every not-yet-usable Google state. */
function Notice({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="mt-5 grid min-h-[248px] place-items-center rounded-[10px] border border-dashed bg-bg-inset px-4 text-center">
      <div>
        <p className="text-[13px] font-semibold">{title}</p>
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground">{body}</p>
        {action && <div className="mt-4">{action}</div>}
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
  domain: string
  rangeLabel: string
  /** Days the selected range covers. Sets the chart's time axis, so a sample
   *  sits at the date it was taken instead of at an evenly-spaced slot. */
  rangeDays: number
  /** Account grant + this project's linked property. `connected` is null while
   *  the check is in flight — unknown, not disconnected. */
  gsc: GscState
}

export function TrafficCard(p: TrafficProps) {
  const router = useRouter()
  const [source, setSource] = useState<Source>("freeserp")
  const [perf, setPerf] = useState<GscPerformance | null>(null)
  const [perfLoading, setPerfLoading] = useState(false)
  const [perfError, setPerfError] = useState<string | null>(null)

  const ready = p.gsc.connected === true && !!p.gsc.siteUrl

  // Fetched on demand, not on mount: this is a live Google API round trip, and
  // most dashboard loads never open the Google view at all.
  useEffect(() => {
    if (source !== "google" || !ready) return
    let cancelled = false
    setPerfLoading(true)
    setPerfError(null)
    api
      .get<GscPerformance>(`/api/gsc/projects/${p.projectId}/performance`, { query: { days: p.rangeDays } })
      .then((data) => { if (!cancelled) setPerf(data) })
      .catch((err) => {
        if (cancelled) return
        setPerf(null)
        setPerfError(err instanceof ApiError ? err.message : "Couldn't load Search Console data.")
      })
      .finally(() => { if (!cancelled) setPerfLoading(false) })
    return () => { cancelled = true }
  }, [source, ready, p.projectId, p.rangeDays])

  const now = Date.now()
  const domainStart = now - p.rangeDays * 86_400_000
  // Ticks from the RANGE, not the data — the axis then describes the window you
  // selected, which is what makes the gap either side of a short series legible.
  const ticks = [domainStart, (domainStart + now) / 2, now]

  // `pages` was already in this payload and never drawn — only surfaced as the
  // single "Ranking Pages" figure. At full width there's room to show how it
  // moved alongside traffic, which is the more useful reading: visits climbing
  // while ranking pages stay flat means existing pages improved, whereas both
  // climbing means new pages started ranking.
  const ownChart = p.history.map((h) => ({ ts: new Date(h.t).getTime(), traffic: h.traffic, pages: h.pages }))
  const ownSeries: Series[] = [
    { key: "traffic", label: "Est. visits", color: "var(--primary)" },
    { key: "pages", label: "Ranking pages", color: "var(--warn)" },
  ]
  const gscChart = (perf?.series ?? []).map((s) => ({ ts: new Date(s.date).getTime(), clicks: s.clicks }))

  /** Absolute change vs the preceding window. Lower is better for position. */
  const delta = (nowV: number, prev: number, lowerIsBetter = false, suffix = "") => {
    const d = nowV - prev
    if (Math.abs(d) < 0.005) return null
    const up = d > 0
    return {
      text: `${up ? "▲" : "▼"} ${Math.abs(d).toFixed(suffix ? 2 : 0).replace(/\.00$/, "")}${suffix}`,
      good: lowerIsBetter ? !up : up,
    }
  }

  // The linked property must actually cover this project's domain. It's checked
  // here as well as on the setup card because this view PRESENTS that property's
  // numbers as the project's — a mismatch here isn't a setup nag, it's wrong data.
  const mismatched = ready && !!p.domain && !!p.gsc.siteUrl && !propertyCoversDomain(p.gsc.siteUrl, p.domain)

  return (
    <Widget
      id="traffic"
      title="Traffic Analytics"
      hint={
        source === "google"
          ? "Measured clicks, impressions, CTR and average position from the Search Console property linked to this project."
          : "Modelled traffic for the whole domain, updated after each completed check."
      }
      actions={<SourceToggle source={source} onChange={setSource} gsc={p.gsc} />}
      meta={
        <>
          <span>{p.rangeLabel}</span>
          {source === "google" && ready && (
            <button
              type="button"
              onClick={() => router.push(`/dashboard/project/${p.projectId}/search-console`)}
              className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
            >
              Full report <ArrowUpRight className="size-3.5" />
            </button>
          )}
        </>
      }
      bodyClassName="p-5"
    >
      {source === "freeserp" ? (
        <>
          <div className="grid grid-cols-2 gap-y-5 sm:grid-cols-4">
            <Stat
              label="Est. Visits"
              hint="Estimated organic sessions in the selected range, modelled from position × search volume. Not measured traffic — switch to Google Data for that."
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
              hint="Share of sessions that end without a second pageview. On-site behaviour, so it needs Google Analytics — neither rank data nor Search Console can provide it."
              value="—"
              dim
              className="pr-4 sm:border-l sm:px-4"
            />
            <Stat
              label="Pages / Visit"
              hint="Average pageviews per organic session. On-site behaviour, so it needs Google Analytics — neither rank data nor Search Console can provide it."
              value="—"
              dim
              className="pl-4 sm:border-l"
            />
          </div>

          {p.loading ? (
            <Skeleton className="mt-5 h-[190px] w-full rounded-[10px]" />
          ) : ownChart.length > 0 ? (
            <>
              <TimeChart
                data={ownChart}
                series={ownSeries}
                domainStart={domainStart}
                now={now}
                ticks={ticks}
                zeroFloor
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <ChartLegend series={ownSeries} />
                {/* Only the plural case. The single-check line used to live
                    here too, in 11px grey under a panel of empty grid, where
                    it was the explanation for the emptiness and nowhere near
                    it. The chart says that one itself now. */}
                {ownChart.length > 1 && (
                  <p className="text-[11px] text-muted-foreground">
                    {`${ownChart.length} checks in this range. Each dot is one day's measurement.`}
                  </p>
                )}
              </div>
            </>
          ) : (
            <Notice
              title="No completed checks in this range"
              body="Pick a longer range above, or start a check from the Keywords page."
            />
          )}
        </>
      ) : p.gsc.connected === null ? (
        <Skeleton className="mt-5 h-[248px] w-full rounded-[10px]" />
      ) : !p.gsc.connected ? (
        <Notice
          title="Google Search Console isn't connected"
          body="Connect it once and this view fills with the clicks, impressions and average position Google actually recorded for your site."
          action={
            <Button size="sm" className="h-[34px] gap-1.5 text-[13px] font-semibold" onClick={() => router.push(`/dashboard/project/${p.projectId}/search-console`)}>
              <GoogleMark /> Connect Search Console
            </Button>
          }
        />
      ) : !p.gsc.siteUrl ? (
        <Notice
          title="No property linked to this project"
          body="Your Google account is connected, but this project isn't pointed at a Search Console property yet. Pick the one that covers your domain."
          action={
            <Button variant="outline" size="sm" className="h-[34px] text-[13px] font-semibold" onClick={() => router.push(`/dashboard/project/${p.projectId}/search-console`)}>
              Choose a property
            </Button>
          }
        />
      ) : perfLoading ? (
        <>
          <div className="grid grid-cols-2 gap-y-5 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-24" />)}
          </div>
          <Skeleton className="mt-5 h-[190px] w-full rounded-[10px]" />
        </>
      ) : perfError ? (
        <Notice
          title="Couldn't load Search Console data"
          body={perfError}
          action={
            <Button variant="outline" size="sm" className="h-[34px] text-[13px] font-semibold" onClick={() => router.push(`/dashboard/project/${p.projectId}/search-console`)}>
              Open Search Console settings
            </Button>
          }
        />
      ) : perf ? (
        <>
          {/* A mismatched property is the one case where showing the numbers
              would be worse than showing nothing — they'd be somebody else's
              site's numbers under this project's name. Shown, but banner-first. */}
          {mismatched && (
            <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="min-w-0 text-[13px] leading-relaxed">
                <span className="font-semibold">These figures are for a different site.</span>{" "}
                This project tracks <span className="font-medium">{p.domain}</span>, but the linked property is{" "}
                <span className="font-medium">{perf.siteUrl}</span>.{" "}
                <button
                  type="button"
                  onClick={() => router.push(`/dashboard/project/${p.projectId}/search-console`)}
                  className="font-semibold text-primary hover:underline"
                >
                  Change property
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-y-5 sm:grid-cols-4">
            <Stat
              label="Total clicks"
              hint="Times someone clicked through to your site from Google search results. Measured by Google, not modelled."
              value={nf(perf.totals.clicks)}
              delta={delta(perf.totals.clicks, perf.previous.clicks)}
              dim={perf.totals.clicks === 0}
              className="pr-4"
            />
            <Stat
              label="Impressions"
              hint="Times a link to your site appeared in search results, whether or not it was clicked."
              value={nf(perf.totals.impressions)}
              delta={delta(perf.totals.impressions, perf.previous.impressions)}
              dim={perf.totals.impressions === 0}
              className="px-4 sm:border-l"
            />
            <Stat
              label="Average CTR"
              hint="Clicks divided by impressions — how often people who saw you chose you."
              value={`${(perf.totals.ctr * 100).toFixed(1)}%`}
              delta={delta(perf.totals.ctr * 100, perf.previous.ctr * 100, false, " pp")}
              dim={perf.totals.ctr === 0}
              className="pr-4 sm:border-l sm:px-4"
            />
            <Stat
              label="Average position"
              hint="Mean position across every impression in the range. Lower is better, so a fall here is an improvement."
              value={perf.totals.position ? perf.totals.position.toFixed(1) : "—"}
              delta={delta(perf.totals.position, perf.previous.position, true, "")}
              dim={!perf.totals.position}
              className="pl-4 sm:border-l"
            />
          </div>

          {gscChart.length > 0 ? (
            <>
              {/* Clicks only. Impressions are in this payload too, but they run
                  one to two orders of magnitude higher (2,443 vs 61 on a real
                  account) — on the shared axis these series use, the clicks line
                  would flatten onto the baseline and read as zero. */}
              <TimeChart
                data={gscChart}
                series={[{ key: "clicks", label: "Clicks", color: "var(--primary)" }]}
                domainStart={domainStart}
                now={now}
                ticks={ticks}
                zeroFloor
              />
              <p className="mt-2 text-[11px] text-muted-foreground">
                Clicks per day from {perf.siteUrl}. Google&apos;s data lags roughly two days, so the last day or two
                may look low.
              </p>
            </>
          ) : (
            <Notice
              title="No Search Console data in this range"
              body="Google reports nothing for these dates. Its data also lags about two days, so a very short range can come back empty."
            />
          )}

          <DimTable perf={perf} />
        </>
      ) : null}
    </Widget>
  )
}
