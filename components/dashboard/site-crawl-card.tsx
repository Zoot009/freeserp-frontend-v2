"use client"

/**
 * Site Audit widget — the whole-site crawl for the project's domain.
 *
 * Site Health is the headline gauge; errors/warnings come from the crawl's
 * severity buckets; and the bar under "Crawled Pages" breaks every page we
 * fetched down by what the server actually returned (2xx / 3xx / 4xx-5xx /
 * unreachable). Hovering a segment names it and gives its count.
 *
 * Results are cached server-side and re-crawled on a cadence, because a
 * whole-site audit is the most expensive job here and technical health doesn't
 * move day to day. That's deliberately not surfaced: one "Re-crawl website"
 * button is the whole control surface.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, Check, ChevronDown, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { api, ApiError } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { InfoHint, Widget } from "@/components/dashboard/widget"
import { cn } from "@/lib/utils"

type AuditPage = {
  url: string
  title: string | null
  statusCode: number | null
  wordCount: number | null
  loadTime: number | null
  lcp: number | null
}

type AuditCategory = { category: string; score: number; grade?: string; issueCount?: number; passingCount?: number }

type SiteAudit = {
  status: "NONE" | "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED"
  domain: string
  pagesFound?: number
  /** When the last WHOLE-site crawl landed. A failed-page retry doesn't move it. */
  fullCrawlAt?: string | null
  /** When this cached result is re-crawled automatically. */
  cacheExpiresAt?: string | null
  cacheDays?: number
  stale?: boolean
  lastMode?: "FULL" | "FAILED_ONLY" | null
  /** How many pages a "retry what failed" pass would pick up. */
  failedPages?: number
  /** Manual re-crawls are refused until this time. */
  recrawlAvailableAt?: string | null
  /** 0–100 from the upstream audit. Null once our own crawler takes over — that
   *  path reports real page counts instead. */
  auditProgress?: number | null
  /** The crawl's page budget (SITE_CRAWL_MAX_PAGES), for the "N of up to M" line. */
  maxPages?: number
  healthScore?: number | null
  grade?: string | null
  tier?: string | null
  totalIssues?: number
  totalPassing?: number
  issuesHigh?: number
  issuesMedium?: number
  issuesLow?: number
  categories?: AuditCategory[]
  pages?: AuditPage[]
  finishedAt?: string | null
  /** When the current run began. Absent on backends that predate the field. */
  startedAt?: string | null
  error?: string | null
}

// 4s, not 8: upstream reports progress in coarse jumps, and an 8s window on
// top of that meant the figure could sit unchanged for a quarter of a minute
// with no way to tell a slow crawl from a dead card.
const POLL_MS = 4_000

/** Health drives the colour: green is a pass, amber a warning, red a problem. */
function healthColor(score: number): string {
  if (score >= 80) return "var(--pos)"
  if (score >= 50) return "var(--warn)"
  return "var(--neg)"
}

// ── Site Health gauge ────────────────────────────────────────────────────────

/** Plain-language reading of the score, so the number isn't the whole story. */
function verdictFor(v: number): { label: string; copy: string } {
  if (v >= 90) return { label: "Excellent", copy: "Almost every check passed. Skim the notices when you have time." }
  if (v >= 80) return { label: "Good", copy: "A solid site. Clearing the warnings is what moves it into the 90s." }
  if (v >= 50) return { label: "Needs work", copy: "Start with the errors below — they cost the most points each." }
  return { label: "Poor", copy: "Enough is broken to hold rankings back. Fix the errors first." }
}

const GAUGE = 132
const RING = 11
const RADIUS = (GAUGE - RING) / 2
const CIRC = 2 * Math.PI * RADIUS

/**
 * A full donut, not the half-arc this used to be.
 *
 * The semicircle wasted the card's whole right half, put the number in the
 * hollow under the arc where it collided with the caption, and — because both
 * the track and the value arc carried round caps — the value's cap poked out
 * past the start of the track at low scores, which read as a rendering bug.
 * A closed ring has no start to overshoot, centres the number in its own
 * space, and leaves room beside it for what the score actually means.
 */
function HealthGauge({ value, grade }: { value: number | null; grade?: string | null }) {
  const v = Math.max(0, Math.min(100, value ?? 0))
  // Render at zero, then animate to the real value on the next frame. The ring
  // filling itself is the cue that this number came from a crawl rather than
  // being a static badge.
  const [drawn, setDrawn] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setDrawn(value == null ? 0 : v), 60)
    return () => clearTimeout(t)
  }, [v, value])

  const verdict = verdictFor(v)
  const color = healthColor(v)

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <div
        className="relative shrink-0"
        style={{ width: GAUGE, height: GAUGE }}
        title={value != null ? `Site health ${Math.round(v)} of 100` : undefined}
      >
        {/* -rotate-90 starts the fill at 12 o'clock instead of 3. */}
        <svg width={GAUGE} height={GAUGE} viewBox={`0 0 ${GAUGE} ${GAUGE}`} className="block -rotate-90" aria-hidden>
          <circle cx={GAUGE / 2} cy={GAUGE / 2} r={RADIUS} fill="none" stroke="var(--muted)" strokeWidth={RING} />
          {value != null && (
            <circle
              cx={GAUGE / 2}
              cy={GAUGE / 2}
              r={RADIUS}
              fill="none"
              stroke={color}
              strokeWidth={RING}
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC - (drawn / 100) * CIRC}
              /* Class, not an inline style: an inline `transition` would beat
                 the motion-reduce override on specificity. */
              className="transition-[stroke-dashoffset] duration-[900ms] ease-out motion-reduce:transition-none"
            />
          )}
        </svg>

        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center leading-none">
            {/* The grade, not the percentage. Two readings of one number sat
                stacked on each other — "66%" over "GRADE C+" — and the ring
                already encodes the magnitude, so the digits were the third
                telling of the same thing. The letter is what anyone actually
                repeats out loud; the exact score lives on the tooltip for
                whoever wants it. */}
            {value != null && grade ? (
              <>
                <div className="text-[34px] font-bold uppercase leading-none tracking-[-0.02em]" style={{ color }}>
                  {grade}
                </div>
                <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Grade
                </div>
              </>
            ) : (
              // No grade from the backend (older rows) — fall back to the score
              // rather than leaving an empty ring.
              <div className="text-[30px] font-bold tabular-nums tracking-[-0.02em]">
                {value != null ? Math.round(v) : "—"}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* min-w-[9rem] rather than a fixed column: in the narrow layout the
          verdict wraps under the ring instead of squeezing to one word a line. */}
      {value != null && (
        <div className="min-w-[9rem] flex-1">
          <div className="flex items-center gap-2 text-[13px] font-semibold" style={{ color }}>
            <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
            {verdict.label}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{verdict.copy}</p>
        </div>
      )}
    </div>
  )
}

// ── Crawled-pages breakdown ──────────────────────────────────────────────────
type Segment = { key: string; label: string; count: number; color: string }

/**
 * Stacked bar of page states. Hovering a segment raises a legend naming every
 * state, with the hovered one held at full strength and the rest dimmed — so the
 * colour you're pointing at is unambiguous.
 */
function PagesBar({ segments }: { segments: Segment[] }) {
  const [hover, setHover] = useState<string | null>(null)
  const total = segments.reduce((s, x) => s + x.count, 0)
  if (!total) return null

  return (
    <div className="relative">
      {hover && (
        <div className="absolute bottom-full left-0 z-20 mb-2 w-52 rounded-lg border bg-popover p-2 shadow-lg">
          {segments.map((s) => {
            const on = s.key === hover
            return (
              <div key={s.key} className={cn("flex items-center gap-2 rounded px-1.5 py-1 text-xs transition-opacity", on ? "opacity-100" : "opacity-40")}>
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className={cn("truncate", on && "font-medium")}>{s.label}</span>
                <span className={cn("ml-auto tabular-nums", on ? "font-semibold text-primary" : "text-muted-foreground")}>{s.count}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* h-2.5, not h-6: with a handful of pages a tall bar reads as a warning
          banner rather than a distribution. */}
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" onMouseLeave={() => setHover(null)}>
        {segments.filter((s) => s.count > 0).map((s) => (
          <button
            key={s.key}
            type="button"
            aria-label={`${s.label}: ${s.count} page${s.count === 1 ? "" : "s"}`}
            onMouseEnter={() => setHover(s.key)}
            onFocus={() => setHover(s.key)}
            onBlur={() => setHover(null)}
            className="h-full min-w-1.5 transition-opacity first:rounded-l-full last:rounded-r-full"
            style={{ flexGrow: s.count, background: s.color, opacity: hover && hover !== s.key ? 0.45 : 1 }}
          />
        ))}
      </div>

      {/* A static legend as well as the hover one — on a 3-page crawl there's
          not enough bar to explore, and the counts matter more than the ratio. */}
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.filter((s) => s.count > 0).map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
            {s.label} <span className="font-medium text-foreground tabular-nums">{s.count}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/** One issue-severity row: name on the left, count on the right. */
function Metric({ label, hint, value, tone }: { label: string; hint: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[13px]">
      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        <span className="truncate">{label}</span><InfoHint>{hint}</InfoHint>
      </span>
      <span className={cn("shrink-0 font-semibold tabular-nums", tone ?? "text-foreground")}>{value}</span>
    </div>
  )
}

// TECHNICAL -> Technical, ON_PAGE -> On page
const prettyCategory = (c: string) =>
  c.replace(/_/g, " ").toLowerCase().replace(/^\w/, (m) => m.toUpperCase())

/**
 * Per-area scores from the audit. These were being fetched and thrown away,
 * while the card sat half empty — they're the most actionable thing in the
 * report, since they say WHERE the site is losing points.
 */
function CategoryScores({ categories }: { categories: AuditCategory[] }) {
  const rows = categories.filter((c) => c.score > 0).slice(0, 5)
  if (rows.length === 0) return null
  return (
    <div className="min-w-0">
      <div className="mb-2.5 flex items-center gap-1 text-[13px] text-foreground/70">
        Scores by area <InfoHint>How the crawled pages scored in each part of the audit, 0–100.</InfoHint>
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((c) => {
          const score = Math.round(c.score)
          return (
            <div key={c.category} className="grid grid-cols-[minmax(0,1fr)_90px_28px] items-center gap-2.5 text-xs">
              <span className="truncate text-muted-foreground">{prettyCategory(c.category)}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full" style={{ width: `${score}%`, background: healthColor(score) }} />
              </span>
              <span className="text-right font-medium tabular-nums">{score}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Re-crawl ─────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000

/** "in 4 hours" / "in 20 min" — coarse on purpose; it's a cooldown, not a deadline. */
function untilLabel(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return "now"
  const days = Math.round(ms / DAY_MS)
  if (days >= 1) return `in ${days} day${days === 1 ? "" : "s"}`
  const hours = Math.round(ms / 3_600_000)
  if (hours >= 1) return `in ${hours} hour${hours === 1 ? "" : "s"}`
  const mins = Math.max(1, Math.round(ms / 60_000))
  return `in ${mins} min`
}

/**
 * The re-crawl action, in the card HEADER beside the "Updated" date.
 *
 * It sat at the bottom of the body, below the page list, which put it a scroll
 * away from the date it relates to and left it stranded in the empty space this
 * card has whenever the taller panel beside it sets the row height. It belongs
 * next to "Updated: Aug 8" — that's the line that prompts the question.
 *
 * A link-style button, not a filled one: it matches "View full report" in the
 * neighbouring card, and a full site audit is not the primary thing to do here.
 *
 * This briefly carried a second "retry only the failed pages" button and a line
 * explaining the 15-day cache. Both were removed as noise — the cache is an
 * implementation detail that costs the reader something and gives nothing back,
 * and a choice between two kinds of crawl is a decision nobody opening a
 * dashboard wants to make. FAILED_ONLY still exists on the API; the card just
 * always asks for a full crawl.
 */
function RecrawlAction({
  audit,
  projectId,
  onQueued,
}: {
  audit: SiteAudit
  projectId: string
  onQueued: () => void
}) {
  const [busy, setBusy] = useState(false)
  const cooldownUntil = audit.recrawlAvailableAt
  const cooling = !!cooldownUntil && new Date(cooldownUntil).getTime() > Date.now()

  const run = async () => {
    setBusy(true)
    try {
      await api.post(`/api/projects/${projectId}/site-crawl/recrawl`, { mode: "FULL" })
      toast.success("Re-crawl queued — this takes a few minutes.")
      onQueued()
    } catch (err) {
      // The backend refuses with a specific reason (already running, cooldown)
      // and each is worth surfacing verbatim — "try again" would be wrong advice
      // for both of them.
      toast.error(err instanceof ApiError ? err.message : "Couldn't start the crawl — please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={busy || cooling}
      // The cooldown is the only reason this is ever disabled, and a control
      // greyed out with no explanation reads as broken — so it says so on hover
      // rather than in a line of body copy nobody needed the rest of the time.
      title={cooling && cooldownUntil ? `Crawled recently — you can run another ${untilLabel(cooldownUntil)}` : undefined}
      className="inline-flex items-center gap-1.5 font-semibold text-primary transition-opacity hover:underline disabled:pointer-events-none disabled:opacity-40"
    >
      <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
      {busy ? "Queueing…" : "Re-crawl"}
    </button>
  )
}

/**
 * What the crawl is doing right now, from the signals the row actually carries.
 *
 * A single percentage was the whole story before, and upstream reports it in
 * coarse jumps — it can read "5%" for minutes on a site that is being crawled
 * perfectly well. One frozen number is indistinguishable from a broken job, so
 * the stage it belongs to is named alongside it: the work visibly moves through
 * Queued → Crawling → Auditing → Report even when the digits don't.
 *
 * Nothing here is invented. Each stage is inferred from a real field: the job
 * status, our crawler's page count, and the upstream audit's own progress.
 */
const CRAWL_STAGES = ["Queued", "Crawling pages", "Running checks", "Building report"] as const

function stageIndexFor(status: SiteAudit["status"], pagesFound: number, auditPct: number | null): number {
  if (status === "QUEUED") return 0
  if (auditPct != null) return auditPct >= 100 ? 3 : 2
  if (pagesFound > 0) return 1
  return 1
}

/**
 * Remaining time, extrapolated from THIS run's own rate: if 40% took five
 * minutes, the rest takes about seven and a half more.
 *
 * Held back until there is enough of a sample to be worth printing — an
 * estimate off the first few percent swings between two minutes and forty and
 * is worse than saying nothing. Above the upstream deadline the number stops
 * meaning anything, so it degrades to a phrase instead.
 */
function etaLabel(elapsedMs: number, pct: number | null): string | null {
  if (pct == null || pct < 5 || pct >= 100) return null
  if (elapsedMs < 45_000) return null
  const remainingMs = (elapsedMs / pct) * (100 - pct)
  const mins = Math.round(remainingMs / 60_000)
  if (mins > 20) return "several more minutes"
  if (mins <= 1) return "under a minute left"
  return `about ${mins} min left`
}

/** "2m 14s" — so a long wait is legibly a long wait, not a hung card. */
function elapsedLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`
}

function CrawlStages({
  current,
  startedAt,
  pct,
}: {
  current: number
  startedAt: string | null | undefined
  pct: number | null
}) {
  // Ticks once a second purely to move the elapsed figure. Cheap, and it is the
  // one thing on this card guaranteed to change while the crawl is slow.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const started = startedAt ? new Date(startedAt).getTime() : null
  const elapsed = started && Number.isFinite(started) ? now - started : null

  return (
    <div className="mt-3.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
      {CRAWL_STAGES.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <span key={label} className="inline-flex items-center gap-2">
            {i > 0 && <span aria-hidden className="text-muted-foreground/40">→</span>}
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-xs",
                active ? "font-semibold text-foreground" : done ? "text-muted-foreground" : "text-muted-foreground/50",
              )}
            >
              {done ? (
                <Check className="size-3 shrink-0" strokeWidth={3} />
              ) : active ? (
                <Loader2 className="size-3 shrink-0 animate-spin" />
              ) : (
                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current opacity-50" />
              )}
              {label}
            </span>
          </span>
        )
      })}
      {elapsed != null && (
        <span className="ml-auto text-xs text-muted-foreground">
          <span className="tabular-nums">{elapsedLabel(elapsed)}</span> elapsed
          {(() => {
            const eta = etaLabel(elapsed, pct)
            return eta ? <> · {eta}</> : null
          })()}
        </span>
      )}
    </div>
  )
}

export function SiteCrawlCard({
  projectId,
  className,
  onStatus,
}: {
  projectId: string
  className?: string
  /** Reports each polled status to the page. This card already fetches the row
   *  on a timer; a second component polling the same endpoint for the same
   *  answer would be the wasteful way to share it. */
  onStatus?: (status: SiteAudit["status"] | null) => void
}) {
  const [audit, setAudit] = useState<SiteAudit | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPages, setShowPages] = useState(false)
  // Bumped after a re-crawl is queued. Re-runs the loader immediately so the
  // card flips to "Crawling…" instead of sitting on the finished report until
  // the next 8s tick — and the poll only restarts once the status says RUNNING.
  const [reloadKey, setReloadKey] = useState(0)
  // In a ref so the interval reads the latest status without being torn down
  // and recreated every tick.
  const statusRef = useRef<SiteAudit["status"] | null>(null)
  // Fallback clock for backends that don't send startedAt: the moment this card
  // first saw the crawl running. Understates a crawl that began before the page
  // was opened, which is why the server's own timestamp wins when present.
  const firstSeenRunningRef = useRef<string | null>(null)
  // Upstream progress can be re-reported lower after a retry. A bar that walks
  // backwards reads as a fault, so the figure only ever moves up within a run.
  const peakPctRef = useRef(0)
  const onStatusRef = useRef(onStatus)
  onStatusRef.current = onStatus

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    setLoading(true)
    setAudit(null)

    const load = async () => {
      try {
        const data = await api.get<SiteAudit>(`/api/projects/${projectId}/site-crawl`)
        if (cancelled) return
        setAudit(data)
        statusRef.current = data.status
        onStatusRef.current?.(data.status)
        if (data.status === "QUEUED" || data.status === "RUNNING") {
          firstSeenRunningRef.current ??= new Date().toISOString()
        } else {
          firstSeenRunningRef.current = null
          peakPctRef.current = 0
        }
      } catch {
        if (!cancelled) { setAudit(null); onStatusRef.current?.(null) }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    const timer = setInterval(() => {
      if (statusRef.current === "QUEUED" || statusRef.current === "RUNNING") void load()
    }, POLL_MS)
    return () => { cancelled = true; clearInterval(timer) }
  }, [projectId, reloadKey])

  // Every page we fetched, bucketed by what the server returned. "Blocked" is a
  // page we couldn't get a status for at all.
  const segments = useMemo<Segment[]>(() => {
    const pages = audit?.pages ?? []
    const inRange = (lo: number, hi: number) => pages.filter((p) => p.statusCode != null && p.statusCode >= lo && p.statusCode <= hi).length
    return [
      { key: "healthy", label: "Healthy", count: inRange(200, 299), color: "var(--pos)" },
      { key: "broken", label: "Broken", count: inRange(400, 599), color: "var(--neg)" },
      { key: "redirect", label: "Redirect", count: inRange(300, 399), color: "var(--brand)" },
      { key: "blocked", label: "Blocked", count: pages.filter((p) => p.statusCode == null).length, color: "var(--border-strong)" },
    ]
  }, [audit])

  if (loading) {
    return (
      <Widget id="site-crawl" title="Site Audit" className={className}>
        <Skeleton className="h-48 w-full rounded-lg" />
      </Widget>
    )
  }

  // No row at all (project predates the feature, or no API key) — render nothing
  // rather than an empty card promising data that isn't coming.
  if (!audit || audit.status === "NONE") return null

  const running = audit.status === "QUEUED" || audit.status === "RUNNING"
  const found = audit.pagesFound ?? 0
  const budget = audit.maxPages ?? 100
  // Only meaningful while running and before any page count exists.
  const rawPct = typeof audit.auditProgress === "number" ? Math.max(0, Math.min(100, audit.auditProgress)) : null
  if (rawPct != null) peakPctRef.current = Math.max(peakPctRef.current, rawPct)
  const pct = rawPct == null ? null : peakPctRef.current
  const health = audit.healthScore ?? null
  // Degraded: the audit couldn't score the site (blocked or timed out) and we
  // fell back to crawling for structure only.
  const degraded = audit.status === "COMPLETED" && health == null
  const updated = audit.finishedAt
    ? new Date(audit.finishedAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })
    : null

  return (
    <Widget
      id="site-crawl"
      title="Site Audit"
      className={className}
      hint="A crawl of up to 100 pages, checking status codes, titles, meta, headings and internal links."
      meta={
        running ? (
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-[3px] text-xs font-semibold text-primary">Crawling…</span>
        ) : (
          <>
            {updated && <span>Updated: {updated}</span>}
            <RecrawlAction audit={audit} projectId={projectId} onQueued={() => setReloadKey((k) => k + 1)} />
          </>
        )
      }
      bodyClassName="p-5"
    >
      {running ? (
        <div>
          {/* Two different measurements, never mixed. Our own crawler counts
              PAGES, so it reads "12 of up to 100 pages". The upstream audit only
              ever reports a PERCENTAGE — it sends no page count while running —
              so it reads "40% audited". Labelling a percentage as pages would
              read as a page count that happens to agree today, because the page
              budget is also 100. */}
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[28px] font-bold leading-none tracking-[-0.02em] tabular-nums">
              {found > 0 ? found : pct != null ? `${pct}%` : "—"}
            </span>
            <span className="text-[13px] text-muted-foreground">
              {found > 0 ? `of up to ${budget} pages` : pct != null ? "audited so far" : `of up to ${budget} pages`}
            </span>
          </div>

          {/* Determinate as soon as EITHER signal exists — our crawler's page
              count, or the audit's own percentage. The striped indeterminate bar
              is now only for the gap before the first poll comes back. */}
          {found > 0 || pct != null ? (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="relative h-full overflow-hidden rounded-full bg-primary transition-[width] duration-700"
                style={{ width: `${found > 0 ? Math.min(100, Math.round((found / budget) * 100)) : pct}%` }}
              >
                {/* Sweeping highlight so a percentage that only ticks every few
                    minutes still reads as active rather than stuck. */}
                <span aria-hidden className="fs-crawl-sweep absolute inset-0" />
              </div>
            </div>
          ) : (
            <div
              aria-hidden
              className="mt-3 h-1.5 overflow-hidden rounded-full"
              style={{
                background: "var(--bg-inset)",
                backgroundImage: "repeating-linear-gradient(45deg, var(--border) 0 10px, var(--bg-inset) 10px 20px)",
                backgroundSize: "28px 28px",
                animation: "fs-crawl-stripe 1s linear infinite",
              }}
            />
          )}

          {/* Named stages under the bar. The percentage alone could sit on "5%"
              for minutes; this says which of four things is happening, and how
              long it has been happening for. */}
          <CrawlStages
            current={stageIndexFor(audit.status, found, pct)}
            startedAt={audit.startedAt ?? firstSeenRunningRef.current}
            pct={pct}
          />

          {/* Pages already reached, newest first — the crawl stops being a black
              box the moment it can name what it found. */}
          {(audit.pages?.length ?? 0) > 0 && (
            <div className="fs-quiet-scroll mt-3 max-h-44 overflow-y-auto rounded-md border">
              {[...(audit.pages ?? [])].reverse().map((p) => (
                <div key={p.url} className="flex items-center gap-2 border-b px-3 py-1.5 text-xs last:border-0">
                  <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
                  <span className="truncate" title={p.url}>{p.title || p.url}</span>
                </div>
              ))}
            </div>
          )}

          <p className="mt-3.5 text-[13px] leading-relaxed text-muted-foreground">
            {/* "A few minutes" was set for a small site. A full audit of up to
                100 pages runs 5–15 minutes on a large one, and a promise the
                job routinely breaks is what makes a working crawl look broken. */}
            Auditing up to {budget} pages takes 5–15 minutes, longer on a big site. You can leave this
            page — we&apos;ll keep going in the background, and the full report will be here when you
            get back.
          </p>

          {/* The same three rows the finished card shows, holding their places
              at "—". Without them the card changes shape when the crawl lands,
              which reads as a different card rather than the same one filled in. */}
          <div className="mt-4 flex flex-col gap-2.5 border-t pt-3.5">
            {["Errors", "Warnings", "Notices"].map((label) => (
              <div key={label} className="flex items-center justify-between text-[13px]">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-semibold text-muted-foreground/50">—</span>
              </div>
            ))}
          </div>
        </div>
      ) : audit.status === "FAILED" ? (
        // The header's Re-crawl link covers the retry — a failed crawl is exactly
        // when someone wants one, and it's already in view here.
        <p className="py-4 text-xs leading-relaxed text-muted-foreground">
          {audit.error || "We couldn't crawl your website — it's blocking automated access, or the site is unreachable."}
        </p>
      ) : (
        <>
          {/* Stacked, not three across: this card now sits in the narrow column
              beside Position Tracking, where three columns squeezed the gauge
              and the category bars into unreadable slivers. */}
          <div className="grid gap-4">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-1 text-[13px] text-foreground/70">
                Site Health <InfoHint>Overall score for the crawled site, 0–100. Based on how many checks passed against how many ran.</InfoHint>
              </div>
              {degraded ? (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                  <div className="flex items-center gap-1.5 text-[13px] font-semibold text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="size-3.5 shrink-0" strokeWidth={2.5} /> Finished without a score
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    We reached your site and mapped {audit.pagesFound ?? 0} pages, but the checks couldn&apos;t run
                    — it looks like automated access is being blocked. Allow our crawler, or re-crawl to try again.
                  </p>
                </div>
              ) : (
                <HealthGauge value={health} grade={audit.grade} />
              )}
            </div>

            {/* Label left, count right — the same three rows the crawling state
                holds open, so the card fills in rather than rearranging. */}
            <div className="flex flex-col gap-2.5 border-t pt-3.5">
              {/* "0 errors, 0 warnings, 0 notices" is a statement that the site
                  is clean. After a run that couldn't score anything it is the
                  opposite of the truth — nothing was checked, so nothing was
                  found. A dash says that; a zero lies about it. */}
              <Metric
                label="Errors"
                hint={degraded ? "No checks ran on this crawl, so nothing was counted." : "High-severity problems — fix these first."}
                value={degraded ? "—" : (audit.issuesHigh ?? 0)}
                tone={!degraded && (audit.issuesHigh ?? 0) > 0 ? "text-red-600 dark:text-red-400" : degraded ? "text-muted-foreground" : undefined}
              />
              <Metric
                label="Warnings"
                hint={degraded ? "No checks ran on this crawl, so nothing was counted." : "Medium-severity issues worth addressing."}
                value={degraded ? "—" : (audit.issuesMedium ?? 0)}
                tone={!degraded && (audit.issuesMedium ?? 0) > 0 ? "text-amber-600 dark:text-amber-400" : degraded ? "text-muted-foreground" : undefined}
              />
              <Metric
                label="Notices"
                hint={degraded ? "No checks ran on this crawl, so nothing was counted." : "Low-severity observations."}
                value={degraded ? "—" : (audit.issuesLow ?? 0)}
                tone={degraded ? "text-muted-foreground" : undefined}
              />
            </div>

            <div className="min-w-0 border-t pt-3.5">
              <CategoryScores categories={audit.categories ?? []} />
              {(audit.totalPassing ?? 0) > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">{audit.totalPassing}</span> checks passed
                  {(audit.totalIssues ?? 0) > 0 && <> of {(audit.totalPassing ?? 0) + (audit.totalIssues ?? 0)}</>}
                </p>
              )}
            </div>
          </div>

          {/* Crawled pages. Constrained rather than full-bleed: stretched edge
              to edge, two colours read as a status banner instead of a
              breakdown of three pages. */}
          <div className="mt-5 border-t pt-4">
            <div className="mb-2.5 flex items-baseline gap-2">
              <span className="flex items-center gap-1 text-[13px] text-foreground/70">
                Crawled Pages <InfoHint>Pages reached in this crawl, split by the status their server returned. These come from our own crawler, so they are recorded even when the scored checks can&apos;t run.</InfoHint>
              </span>
              <span className="text-[22px] font-bold leading-none tabular-nums text-primary">{audit.pagesFound ?? 0}</span>
            </div>
            <div className="max-w-xl">
              <PagesBar segments={segments} />
            </div>
          </div>

          {(audit.pages?.length ?? 0) > 0 && (
            <>
              <Button variant="outline" size="sm" className="mt-4 h-7 gap-1.5 text-xs" onClick={() => setShowPages((s) => !s)}>
                {showPages ? "Hide pages" : "View full report"}
                <ChevronDown className={cn("size-3.5 transition-transform", showPages && "rotate-180")} />
              </Button>

              {showPages && (
                <div className="fs-quiet-scroll mt-3 max-h-64 overflow-y-auto rounded-md border">
                  {(audit.pages ?? []).map((p) => {
                    const code = p.statusCode
                    const tone = code == null ? "text-muted-foreground"
                      : code >= 400 ? "text-red-600 dark:text-red-400"
                      : code >= 300 ? "text-primary"
                      : "text-emerald-600 dark:text-emerald-400"
                    return (
                      <div key={p.url} className="flex items-center gap-3 border-b px-3 py-2 text-xs last:border-0">
                        <span className={cn("w-9 shrink-0 tabular-nums font-medium", tone)}>{code ?? "—"}</span>
                        <a href={p.url} target="_blank" rel="noopener noreferrer" className="truncate hover:underline" title={p.url}>
                          {p.title || p.url}
                        </a>
                        {p.wordCount != null && <span className="ml-auto shrink-0 text-muted-foreground">{p.wordCount.toLocaleString()} words</span>}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}
    </Widget>
  )
}
