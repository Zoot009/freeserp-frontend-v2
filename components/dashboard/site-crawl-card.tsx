"use client"

/**
 * Site Audit widget — the whole-site crawl for the project's domain.
 *
 * Site Health is the headline gauge; errors/warnings come from the crawl's
 * severity buckets; and the bar under "Crawled Pages" breaks every page we
 * fetched down by what the server actually returned (2xx / 3xx / 4xx-5xx /
 * unreachable). Hovering a segment names it and gives its count.
 *
 * Results are cached for 15 days — a whole-site audit is the most expensive job
 * here and technical health doesn't move day to day. Two buttons override that:
 * a targeted retry of just the pages that failed, and a full re-crawl.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, RefreshCw, RotateCcw } from "lucide-react"
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
  error?: string | null
}

const POLL_MS = 8_000

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
      <div className="relative shrink-0" style={{ width: GAUGE, height: GAUGE }}>
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
            <div className="text-[30px] font-bold tabular-nums tracking-[-0.02em]">
              {value != null ? Math.round(v) : "—"}
              {value != null && <span className="text-[15px] font-semibold text-muted-foreground">%</span>}
            </div>
            {value != null && grade && (
              <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Grade {grade}
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

/** "in 12 days" / "in 4 hours" / "shortly" — coarse on purpose, this is a cache. */
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
 * The two ways to refresh an audit, and the cache line that explains why you
 * usually don't need either.
 *
 * They are separate buttons rather than one with a menu because they cost wildly
 * different amounts: the targeted retry re-fetches a handful of known-bad URLs,
 * while a full audit re-walks the entire domain and is the most expensive job
 * this app runs. Collapsing them into one control would hide that difference at
 * exactly the moment it matters.
 */
function RecrawlControls({
  audit,
  projectId,
  onQueued,
}: {
  audit: SiteAudit
  projectId: string
  onQueued: () => void
}) {
  const [busy, setBusy] = useState<"FULL" | "FAILED_ONLY" | null>(null)
  const failed = audit.failedPages ?? 0
  const cooldownUntil = audit.recrawlAvailableAt
  const cooling = !!cooldownUntil && new Date(cooldownUntil).getTime() > Date.now()

  const run = async (mode: "FULL" | "FAILED_ONLY") => {
    setBusy(mode)
    try {
      await api.post(`/api/projects/${projectId}/site-crawl/recrawl`, { mode })
      toast.success(
        mode === "FULL"
          ? "Full site crawl queued — this takes a few minutes."
          : `Retrying ${failed} page${failed === 1 ? "" : "s"} — results merge into this report.`,
      )
      onQueued()
    } catch (err) {
      // The backend refuses with a specific reason (already running, cooldown,
      // nothing to retry) and each is worth surfacing verbatim — "try again"
      // would be wrong advice for every one of them.
      toast.error(err instanceof ApiError ? err.message : "Couldn't start the crawl — please try again.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-4 border-t pt-3.5">
      <div className="flex flex-wrap items-center gap-2">
        {failed > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            disabled={busy !== null || cooling}
            onClick={() => void run("FAILED_ONLY")}
          >
            <RotateCcw className={cn("size-3.5", busy === "FAILED_ONLY" && "animate-spin")} />
            Retry {failed} failed page{failed === 1 ? "" : "s"}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          disabled={busy !== null || cooling}
          onClick={() => void run("FULL")}
        >
          <RefreshCw className={cn("size-3.5", busy === "FULL" && "animate-spin")} />
          Re-crawl whole site
        </Button>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        {cooling && cooldownUntil ? (
          <>This site was crawled recently — you can run another {untilLabel(cooldownUntil)}.</>
        ) : audit.cacheExpiresAt && !audit.stale ? (
          <>
            Cached for {audit.cacheDays ?? 15} days. Re-crawls automatically {untilLabel(audit.cacheExpiresAt)}.
          </>
        ) : (
          <>This report is out of date and will be re-crawled on its next run.</>
        )}
        {audit.lastMode === "FAILED_ONLY" && (
          <> Scores below are from the last full crawl — a retry only updates page status.</>
        )}
      </p>
    </div>
  )
}

export function SiteCrawlCard({ projectId, className }: { projectId: string; className?: string }) {
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
      } catch {
        if (!cancelled) setAudit(null)
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
  const pct = typeof audit.auditProgress === "number" ? Math.max(0, Math.min(100, audit.auditProgress)) : null
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
        ) : updated ? <span>Updated: {updated}</span> : null
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
            This usually takes a few minutes. You can leave this page — we&apos;ll keep auditing in the
            background, and the full report will be here when you come back.
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
        <>
          <p className="py-4 text-xs leading-relaxed text-muted-foreground">
            {audit.error || "We couldn't crawl your website — it's blocking automated access, or the site is unreachable."}
          </p>
          {/* A failed crawl is exactly when someone wants to try again — fixed
              the robots.txt, lifted the firewall rule, brought the site back. */}
          <RecrawlControls audit={audit} projectId={projectId} onQueued={() => setReloadKey((k) => k + 1)} />
        </>
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
                <p className="max-w-56 text-xs leading-relaxed text-muted-foreground">
                  We reached your site but couldn&apos;t score it — it may be blocking automated access.
                </p>
              ) : (
                <HealthGauge value={health} grade={audit.grade} />
              )}
            </div>

            {/* Label left, count right — the same three rows the crawling state
                holds open, so the card fills in rather than rearranging. */}
            <div className="flex flex-col gap-2.5 border-t pt-3.5">
              <Metric label="Errors" hint="High-severity problems — fix these first." value={audit.issuesHigh ?? 0} tone={(audit.issuesHigh ?? 0) > 0 ? "text-red-600 dark:text-red-400" : undefined} />
              <Metric label="Warnings" hint="Medium-severity issues worth addressing." value={audit.issuesMedium ?? 0} tone={(audit.issuesMedium ?? 0) > 0 ? "text-amber-600 dark:text-amber-400" : undefined} />
              <Metric label="Notices" hint="Low-severity observations." value={audit.issuesLow ?? 0} />
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
                Crawled Pages <InfoHint>Pages reached in this crawl, split by the status their server returned.</InfoHint>
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

          <RecrawlControls audit={audit} projectId={projectId} onQueued={() => setReloadKey((k) => k + 1)} />
        </>
      )}
    </Widget>
  )
}
