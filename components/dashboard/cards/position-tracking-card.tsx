"use client"

/**
 * Position Tracking — visibility and average position over the selected range,
 * beside a breakdown of where every tracked keyword currently sits.
 *
 * The bands are EXCLUSIVE (Top 3, 4–10, 11–20, 21–100, Unranked) rather than
 * cumulative, so the counts sum to the number of keywords tracked and the
 * "Unranked" row can carry the ones that rank nowhere at all — on a young
 * project that row is the whole story, and a cumulative table hid it.
 */

import { useTranslations, useLocale } from "next-intl"
import { useState } from "react"
import { Area, AreaChart, XAxis, YAxis } from "recharts"
import { Link, useRouter } from "@/i18n/navigation"
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Monitor, Smartphone } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ALL_LOCATIONS, POPULAR_LOCATIONS } from "@/lib/locations"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { InfoHint, Widget } from "@/components/dashboard/widget"
import { cn } from "@/lib/utils"

/** The SERP these positions came from — the project's dominant market/device,
 *  plus how many distinct ones there actually are. */
export type Scope = {
  location: string
  device: string
  mixed: boolean
  locationCount?: number
  deviceCount?: number
  /** Every distinct market / device in play, busiest first. */
  locations?: string[]
  devices?: string[]
}

/**
 * Market → display name.
 *
 * Uppercasing the fallback is right for an ISO2 ("us" -> "US") and wrong for
 * anything else: a sub-country market arrives here already named ("Austin"),
 * and shouting it was the only reason cities read as "AUSTIN".
 */
function countryName(code: string): string {
  return (
    ALL_LOCATIONS.find((l) => l.code === code)?.name ??
    POPULAR_LOCATIONS.find((l) => l.code === code)?.name ??
    (code.length === 2 ? code.toUpperCase() : code)
  )
}

/**
 * Visibility is a share of ALL tracked search volume, so a strong rank on a
 * low-volume term is a genuinely tiny number. Rounding that to "0%" beside an
 * average position of 2.5 reads as a bug rather than as a small figure, so
 * anything above zero is reported as such.
 */
function formatVisibility(v: number): string {
  if (v <= 0) return "0%"
  if (v < 0.1) return "<0.1%"
  return `${Math.round(v * 10) / 10}%`
}

/** One row of the band table. `added`/`lost` are null where the movement isn't
 *  meaningful (nothing "enters" the unranked band — it's the remainder). */
export type Band = { label: string; count: number; added: number | null; lost: number | null; share: number; highlight?: boolean }
export type TopKeyword = {
  id: string
  keyword: string
  position: number | null
  delta: number | null
  visibility: number
  /** A completed rank check exists. With `position: null` this is the difference
   *  between "ranks past #100" and "not checked yet" — see PosCell in
   *  components/dashboard/primitives.tsx, which draws the same distinction. */
  checked?: boolean
  volume?: number | null
  /** Existing competitor-analysis report, if one has completed. */
  latestAnalysisId?: string | null
  /** Whether offering "take this to #1" is honest yet — false while a first rank
   *  check is still in flight. */
  canRank?: boolean
}
export type PositionPoint = { t: string; avgPos: number }

/**
 * Which SERP these positions came from.
 *
 * Styled as a quiet bordered pill, but it opens: a control that looks
 * interactive and isn't is worse than no control. The chevron is the tell, and
 * the item inside is the only place per-keyword market/device can be changed.
 */
function ScopeLine({ projectId, scope }: { projectId: string; scope: Scope }) {
  const t = useTranslations("dashOverview.position")
  const locale = useLocale()
  // router.push in onSelect rather than <Link> inside the item: Radix closes the
  // menu on select, which can cancel an anchor's navigation before it commits.
  // This router is the i18n one, so the locale prefix survives the jump.
  const router = useRouter()
  const country = countryName(scope.location)
  const mobile = scope.device === "mobile"
  const DeviceIcon = mobile ? Smartphone : Monitor

  // Location and device are per keyword, so naming only the dominant market was
  // a claim that every tracked keyword is checked there. With 10 in India and 2
  // in Canada that's untrue, and a bare "+1" told you a market was missing
  // without saying which. Every market is named instead.
  const markets = (scope.locations?.length ? scope.locations : [scope.location]).map(countryName)
  // Three is where the pill stops fitting beside "View full report"; the rest
  // are still listed in the menu below.
  // Intl.ListFormat knows each language own conjunction and comma rules.
  const marketList = new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(markets)
  const shown = markets.slice(0, 3)
  const hidden = markets.length - shown.length

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger className="inline-flex shrink-0 items-center gap-1.5 rounded-full border py-[3px] pl-2.5 pr-2 text-xs text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        <DeviceIcon className="size-3.5 shrink-0 text-primary" />
        {shown.map((name) => (
          <span key={name} className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[11px] font-semibold text-foreground">
            {name}
          </span>
        ))}
        {hidden > 0 && (
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[11px] font-semibold text-foreground">
            +{hidden}
          </span>
        )}
        <span className="shrink-0">{t("engineLang")}</span>
        <ChevronDown className="size-3.5 shrink-0" strokeWidth={2.25} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 p-1.5">
        <DropdownMenuLabel className="text-xs font-normal leading-relaxed text-muted-foreground">
          {/* t.rich, because the emphasis sits INSIDE the sentence and every
              language puts it somewhere different — pulling the bold parts out
              as separate nodes would fix English word order for all of them.

              The market list is joined by Intl.ListFormat rather than by hand.
              The old code special-cased two ("A and B") and three-or-more
              ("A, B and C"), which is an English rule: Spanish switches "y" to
              "e" before an i- sound, and German uses no serial comma at all. */}
          {scope.mixed
            ? t.rich("scopeMixed", {
                markets: marketList,
                country,
                device: mobile ? t("deviceMobile") : t("deviceDesktop"),
                b: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
              })
            : t.rich("scopeSingle", {
                country,
                device: mobile ? t("deviceMobile") : t("deviceDesktop"),
                b: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
              })}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          // focus:text-foreground as well as focus:bg-muted. The base item style
          // pairs bg-accent with text-accent-foreground, and this theme maps
          // --accent to brand blue, so accent-foreground is WHITE. Overriding
          // only the background left white text on a light grey highlight —
          // the row vanished the moment you pointed at it.
          className="text-[13px] focus:bg-muted focus:text-foreground"
          onSelect={() => router.push(`/dashboard/project/${projectId}/keywords?add=1`)}
        >
          {t("setPerKeyword")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** A headline figure with its label, greyed when there's nothing to report. */
function Figure({ label, hint, value, dim }: { label: string; hint: string; value: React.ReactNode; dim: boolean }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
        <span className="truncate">{label}</span>
        <InfoHint>{hint}</InfoHint>
      </div>
      <div className={cn("mt-1 text-[28px] font-bold leading-tight tracking-[-0.02em] tabular-nums", dim ? "text-muted-foreground/50" : "text-primary")}>
        {value}
      </div>
    </div>
  )
}

const TH = "pb-[7px] text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground"
const TD = "border-t py-2"

/**
 * Top five. Everything below it is work still to do, which is the whole split.
 *
 * Deliberately tighter than page one: positions 6–10 are on page one but pick up
 * a fraction of the clicks the top few do, so counting them as wins would flatter
 * the number and hide keywords that are still worth pushing.
 */
const WINNER_MAX_POSITION = 5
/** Rows per page. Ten keeps the card roughly level with the Site Audit panel
 *  beside it whatever the project's size. */
const PAGE_SIZE = 10

/**
 * "Take this keyword to #1" — the same action as the Rank button on the keywords
 * page, routing to exactly the same two places:
 *
 *   • an analysis already exists → open that report
 *   • none yet                   → the competitor-analysis setup, pre-filled
 *
 * Opening the existing report is deliberate, and matches the keywords page: a
 * fresh analysis is a PAID run, so this must not quietly spend when a finished
 * report is sitting there. Starting a new one is a separate, explicit action.
 *
 * Only rendered when there's a measured position to improve ON — a keyword whose
 * first check is still in flight would mean promising "→ #1" against a rank we
 * haven't taken yet.
 */
function RankAction({ projectId, k }: { projectId: string; k: TopKeyword }) {
  const t = useTranslations("dashOverview.position")
  const router = useRouter()
  if (!k.canRank) return null

  const href = k.latestAnalysisId
    ? `/dashboard/project/${projectId}/competitor-analysis/results?analysisId=${k.latestAnalysisId}`
    : `/dashboard/project/${projectId}/competitor-analysis?keyword=${encodeURIComponent(k.keyword)}&keywordId=${k.id}`
  const from = k.position != null ? `#${k.position}` : "#100+"

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => router.push(href)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Rank
          <span className="inline-flex items-center gap-1 tabular-nums">
            {from}
            <ArrowRight className="size-3 opacity-70" strokeWidth={2.5} />
            <span className="font-bold">#1</span>
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent className="text-xs">
        {k.latestAnalysisId
          ? t("openAnalysis")
          : t("seeWhatItTakes", { from })}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Winners and losers, split at the top five.
 *
 * The Rank action lives on the LOSERS tab only. On a winner it would be noise —
 * a keyword at #4 doesn't need to be told it could rank — and on the losers tab
 * it's the obvious next step for every row, which is the point of the split.
 */
function KeywordTabs({ projectId, keywords }: { projectId: string; keywords: TopKeyword[] }) {
  const t = useTranslations("dashOverview.position")
  const [tab, setTab] = useState<"losers" | "winners">("losers")
  const [page, setPage] = useState(0)

  const winners = keywords
    .filter((k) => k.position != null && k.position <= WINNER_MAX_POSITION)
    .sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
  // Ranking past the top five, or not ranking at all. Ordered by search volume, so
  // the biggest prize is the first thing to act on rather than whichever
  // keyword happens to sit at #11.
  const losers = keywords
    .filter((k) => k.position == null || k.position > WINNER_MAX_POSITION)
    .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))

  const all = tab === "winners" ? winners : losers

  // ONE grid definition shared by the header and every row. They used to be
  // written out twice ending in `auto`, and `auto` sizes to content — the
  // header's empty last cell measured 0 while the rows' Rank button measured
  // ~130px, so the two grids resolved to different track widths and no column
  // heading sat above its own data. A fixed track can't drift.
  //
  // The Rank column only exists on the losers tab, so the winners grid drops it
  // rather than leaving 130px of dead space.
  const GRID =
    tab === "losers"
      ? "grid grid-cols-[minmax(0,1fr)_66px_78px_130px]"
      : "grid grid-cols-[minmax(0,1fr)_66px_78px]"
  // Clamped rather than reset-on-change: deleting keywords (or switching to a
  // shorter tab) can strand `page` past the end, which would render an empty
  // list with no way back other than paging blindly.
  const pageCount = Math.max(1, Math.ceil(all.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const start = current * PAGE_SIZE
  const rows = all.slice(start, start + PAGE_SIZE)

  const Tab = ({ id, label, count }: { id: "winners" | "losers"; label: string; count: number }) => (
    <button
      type="button"
      onClick={() => { setTab(id); setPage(0) }}
      className={cn(
        "rounded-[7px] px-2.5 py-[5px] text-[13px] transition-colors",
        tab === id ? "bg-card font-semibold shadow-sm" : "font-medium text-muted-foreground hover:text-foreground",
      )}
    >
      {label} <span className="tabular-nums opacity-60">{count}</span>
    </button>
  )

  return (
    <div className="mt-5 border-t pt-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex gap-0.5 rounded-[9px] bg-muted p-[3px]">
          <Tab id="winners" label={t("tabWinners")} count={winners.length} />
          <Tab id="losers" label={t("tabLosers")} count={losers.length} />
        </div>
        <InfoHint>
          Winners rank in the top {WINNER_MAX_POSITION}, where most of the clicks are. Losers rank below
          that or not at all, ordered by search volume so the biggest opportunity is first.
        </InfoHint>
        <Link
          href={`/dashboard/project/${projectId}/keywords`}
          className="ml-auto text-[13px] font-semibold text-primary hover:underline"
        >
          All keywords
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">
          {tab === "winners"
            ? `No keywords in the top ${WINNER_MAX_POSITION} yet. The losers tab is where to start.`
            : `Every tracked keyword is in the top ${WINNER_MAX_POSITION}. Nothing to fix here.`}
        </p>
      ) : (
        <>
          <div className={cn(GRID, "gap-x-3 border-b pb-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground")}>
            <span>{t("colKeyword")}</span>
            <span className="text-right">{t("colPosition")}</span>
            <span className="text-right">{t("colVolume")}</span>
            {tab === "losers" && <span className="text-right">{t("colWantToRank")}</span>}
          </div>
          {/* Paged, not scrolled. A scroll area sized for ten rows put a stubby
              little gutter beside every list, and hid the rest behind a gesture
              with no indication of how much was down there. */}
          <div>
            {rows.map((k) => (
              <div
                key={k.id}
                className={cn(GRID, "items-center gap-x-3 border-b py-2 text-[13px] last:border-0")}
              >
                <Link
                  href={`/dashboard/project/${projectId}/keywords/${k.id}`}
                  className="truncate text-primary hover:underline"
                >
                  {k.keyword}
                </Link>
                <span className={cn("text-right tabular-nums", k.position == null && "text-muted-foreground")}>
                  {/* "100+" only when a check actually completed — the rule
                      PosCell uses. A never-checked keyword is "—". */}
                  {k.position ?? (k.checked ? "100+" : "—")}
                  {k.delta != null && k.delta !== 0 && (
                    <span
                      className={cn(
                        "ml-1 text-xs",
                        k.delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
                      )}
                    >
                      {Math.abs(k.delta)}
                    </span>
                  )}
                </span>
                <span className="text-right tabular-nums text-muted-foreground">
                  {k.volume != null ? k.volume.toLocaleString() : "—"}
                </span>
                {/* Losers only — see the note on KeywordTabs. The wrapper always
                    renders so the track stays occupied even when a keyword has
                    no measured position to improve on and RankAction bails. */}
                {tab === "losers" && (
                  <span className="flex justify-end">
                    <RankAction projectId={projectId} k={k} />
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Always shows the range and total, even on a single page — "1–6 of 6"
              answers "is that all of them?", which a bare list doesn't. */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">
              {start + 1}–{start + rows.length} of {all.length}
            </span>
            {pageCount > 1 && (
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage(current - 1)}
                  disabled={current === 0}
                  aria-label={t("prevPage")}
                  className="grid size-7 place-items-center rounded-md border transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {current + 1} / {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(current + 1)}
                  disabled={current >= pageCount - 1}
                  aria-label={t("nextPage")}
                  className="grid size-7 place-items-center rounded-md border transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export type PositionTrackingProps = {
  projectId: string
  loading: boolean
  visibility: number
  avgPos: number | null
  history: PositionPoint[]
  bands: Band[]
  tracked: number
  ranked: number
  rangeLabel: string
  /** Days the selected range covers — sets the chart's time axis. */
  rangeDays: number
  /**
   * Days inside the range that produced a completed check, ranked or not.
   *
   * `history` only carries days where something ranked, so on its own it can't
   * tell "you haven't checked yet" from "you've checked and nothing ranks" —
   * and the empty state was giving the first answer to people in the second
   * situation.
   */
  checkDays: number
  scope: Scope
  /** Every tracked keyword, split into Winners/Losers by the tabs below. */
  keywords: TopKeyword[]
}

const dayLabel = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" })

export function PositionTrackingCard(p: PositionTrackingProps) {
  const t = useTranslations("dashOverview.position")
  // Plotted against real timestamps inside the selected window — see the same
  // note on TrafficCard. A category axis spaced samples evenly, so two checks
  // days apart were drawn as though they spanned the whole range.
  const chart = p.history.map((h) => ({ ts: new Date(h.t).getTime(), pos: h.avgPos }))
  const now = Date.now()
  const domainStart = now - p.rangeDays * 86_400_000
  const ticks = [domainStart, (domainStart + now) / 2, now]

  return (
    <Widget
      id="position-tracking"
      title={t("title")}
      hint={t("hint")}
      meta={
        <>
          <ScopeLine projectId={p.projectId} scope={p.scope} />
          <Link href={`/dashboard/project/${p.projectId}/keywords`} className="font-semibold text-primary hover:underline">
            {t("viewFullReport")}
          </Link>
        </>
      }
      bodyClassName="p-5"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Visibility, average position, and the trend ── */}
        <div className="min-w-0">
          <div className="flex flex-wrap gap-x-8 gap-y-4">
            {p.loading ? (
              <>
                <Skeleton className="h-14 w-28" />
                <Skeleton className="h-14 w-28" />
              </>
            ) : (
              <>
                <Figure
                  label={t("visibility")}
                  hint={t("visibilityHint")}
                  value={formatVisibility(p.visibility)}
                  dim={p.visibility <= 0}
                />
                <Figure
                  label={t("avgPosition")}
                  hint={t("avgPositionHint")}
                  value={p.avgPos ?? "—"}
                  dim={p.avgPos == null}
                />
              </>
            )}
          </div>

          {p.loading ? (
            <Skeleton className="mt-4 h-[158px] w-full rounded-[10px]" />
          ) : chart.length > 1 ? (
            <div className="mt-4 overflow-hidden rounded-[10px] border bg-bg-inset">
              <ChartContainer config={{ pos: { label: t("avgPosition"), color: "var(--primary)" } }} className="!aspect-auto h-[158px] w-full">
                <AreaChart data={chart} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="pt-vis" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-pos)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--color-pos)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis type="number" dataKey="ts" scale="time" domain={[domainStart, now]} ticks={ticks} hide />
                  {/* Reversed: a lower number is a better rank, so the line climbs when you improve. */}
                  <YAxis hide reversed domain={["dataMin - 2", "dataMax + 2"]} />
                  <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, pl) => dayLabel(Number(pl?.[0]?.payload?.ts))} />} />
                  <Area
                    dataKey="pos"
                    type="monotone"
                    stroke="var(--color-pos)"
                    strokeWidth={2}
                    fill="url(#pt-vis)"
                    dot={{ r: 2.5, strokeWidth: 0, fill: "var(--color-pos)" }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ChartContainer>
            </div>
          ) : (
            <div className="mt-4 grid h-[158px] place-items-center rounded-[10px] border border-dashed bg-bg-inset px-4 text-center">
              {/* Says WHICH of the two reasons applies. "The curve starts after
                  the second daily check" was shown even to a project that HAD
                  run several checks — the checks just found nothing ranking, and
                  a line of average position can't be drawn from days with no
                  ranked keywords. Being told to wait for a check you already ran
                  reads as the card being broken. */}
              <div>
                <div className="text-[13px] font-medium text-muted-foreground">
                  {chart.length === 1 ? t("onlyOneDay") : t("notEnoughHistory")}
                </div>
                <div className="mt-1 max-w-[15rem] text-xs leading-relaxed text-muted-foreground/70">
                  {chart.length === 1 && p.checkDays > 1 ? (
                    <>
                      {p.checkDays} checks ran in this range, but only one found keywords inside the top 100 —
                      the curve needs two.
                    </>
                  ) : chart.length === 1 ? (
                    <>{t("curveAppears")}</>
                  ) : p.checkDays > 0 ? (
                    <>
                      {p.checkDays} check{p.checkDays === 1 ? "" : "s"} ran in this range, but nothing ranked inside
                      the top 100 yet.
                    </>
                  ) : (
                    <>{t("noChecksInRange")}</>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Range endpoints, not data endpoints. The axis describes the window
              you picked, so a short series reads as short rather than as one
              that happens to fill it. */}
          {chart.length > 1 && (
            <div className="mt-2 flex justify-between text-xs text-muted-foreground/70">
              {ticks.map((t) => <span key={t}>{dayLabel(t)}</span>)}
            </div>
          )}
        </div>

        {/* ── Where the keywords sit ── */}
        <div className="min-w-0">
          <div className="mb-2.5 flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
            <span>{t("bandsTitle")}</span>
            <InfoHint>{t("bandsHint")}</InfoHint>
          </div>

          {p.loading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : (
            <>
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    <th className={cn(TH, "pr-2 text-left")}>{t("colBand")}</th>
                    <th className={cn(TH, "px-2 text-right")}>{t("colKeywords")}</th>
                    <th className={cn(TH, "w-[30%] px-2")} />
                    <th className={cn(TH, "px-2 text-right")}>{t("colNew")}</th>
                    <th className={cn(TH, "pl-2 text-right")}>{t("colLost")}</th>
                  </tr>
                </thead>
                <tbody>
                  {p.bands.map((b) => (
                    <tr key={b.label}>
                      <td className={cn(TD, "pr-2", b.highlight && "font-semibold text-primary")}>{t(b.label)}</td>
                      <td className={cn(TD, "px-2 text-right font-semibold tabular-nums", b.highlight && "text-primary")}>{b.count}</td>
                      <td className={cn(TD, "px-2")}>
                        <div className="h-[5px] overflow-hidden rounded-[3px] bg-muted">
                          {b.share > 0 && (
                            <div className={cn("h-full rounded-[3px]", b.highlight ? "bg-primary" : "bg-primary/50")} style={{ width: `${Math.min(100, b.share)}%` }} />
                          )}
                        </div>
                      </td>
                      <td className={cn(TD, "px-2 text-right tabular-nums", b.added ? "font-medium text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                        {b.added ?? "—"}
                      </td>
                      <td className={cn(TD, "pl-2 text-right tabular-nums", b.lost ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                        {b.lost ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="mt-3 text-xs leading-relaxed text-muted-foreground/80">
                {p.tracked === 0
                  ? t("noKeywordsYet")
                  : p.ranked === 0
                    ? `All ${p.tracked} tracked keyword${p.tracked === 1 ? "" : "s"} sit outside the top 100 today. First movement usually shows within two weeks.`
                    : t("rankSummary", { ranked: p.ranked, tracked: p.tracked })}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Full width under both columns — the keyword list is the actionable half
          of this card and needs the room for a real Rank button, which the narrow
          Keyword Movement panel couldn't give it. */}
      {!p.loading && p.keywords.length > 0 && (
        <KeywordTabs projectId={p.projectId} keywords={p.keywords} />
      )}
    </Widget>
  )
}
