"use client"

/**
 * The audit form and its job lifecycle, shared by the two audit pages.
 *
 * "Full Website Audit" (/dashboard/site-audit) and "Page Audit"
 * (/dashboard/page-audit) were one page with a mode toggle for a while. They
 * are two routes now, because that is how the sidebar has always named them and
 * how people ask for them — but they are still one crawler, one job endpoint and
 * one report, so the machinery lives here once and each page supplies its mode.
 *
 * The report UI itself is the imported package's, dropped in whole
 * (components/page-audit/audit-ui.tsx). This component owns everything around
 * it: the URL form, the job lifecycle, and the wiring to /api/page-audit — the
 * package's own flow went through Next route handlers that read a NextAuth
 * session out of a frontend Prisma client, neither of which exists here. Our
 * api client already carries the JWT, so the browser talks to the backend
 * directly like every other page in this dashboard.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { CreditCost } from "@/components/dashboard/credit-cost"
import { CREDIT_ACTION_KEYS } from "@/lib/credits"
import { Loader2, Search, ShieldAlert } from "lucide-react"
import { Link, useRouter } from "@/i18n/navigation"
import { api, ApiError } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { transformReport, type AuditReport } from "@/components/page-audit/audit-ui"
import { AuditHistory } from "@/components/page-audit/audit-history"
import { AuditProgressOverlay, type LiveTally } from "@/components/page-audit/audit-progress"
import { ToolContext } from "@/components/dashboard/tool-context"

export type AuditMode = "single" | "site"

type JobState = {
  jobId: string
  state: string
  progress: number
  /** Live crawl detail. Present only while the crawl phase is running. */
  pagesDone?: number | null
  pagesKnown?: number | null
  recent?: { url: string; ok: boolean }[] | null
  tally?: LiveTally | null
  reportId: string | null
  status: "PROCESSING" | "COMPLETED" | "FAILED"
  error: string | null
}

/** How often to ask the backend where the crawl has got to. */
const POLL_MS = 2500
/**
 * Give up polling after this long — scaled to the pages this account may crawl.
 *
 * It was a flat 15 minutes, and its own comment gave the reason away: "up to
 * 100 pages". Paid plans crawl 500. A real browser at roughly six seconds a
 * page walks 500 of them in fifty minutes, so the client was abandoning
 * perfectly healthy audits three quarters of the way through and telling the
 * user it had taken too long — while the job ran on and quietly finished in
 * the history table.
 *
 * Still bounded. A wedged job has to end in something we can say, not a page
 * spinning forever.
 */
const MS_PER_PAGE = 6_000
const POLL_TIMEOUT_FLOOR_MS = 8 * 60_000
const POLL_TIMEOUT_CEILING_MS = 75 * 60_000
const pollTimeoutFor = (maxPages: number | undefined) =>
  Math.min(
    POLL_TIMEOUT_CEILING_MS,
    Math.max(POLL_TIMEOUT_FLOOR_MS, (maxPages ?? 100) * MS_PER_PAGE),
  )

/** Page allowance for this account. Free gets 100, any paid plan 500. */
type Limits = { maxPages: number; planMaxPages: number; maxConcurrent: number; plan: string }

/**
 * Everything that differs between the two pages, in one place.
 *
 * The pages themselves are then three lines each, which is the point of the
 * split: two routes, two names, two descriptions — one audit.
 */
const COPY = {
  single: {
    title: "Page Audit",
    lede: "A full check of one page — technical health, on-page content, speed, accessibility, structured data and security — with the exact fixes, in priority order.",
    placeholder: "example.com/pricing",
    submit: "Run audit",
    running: "Auditing…",
    toolContext: "page-audit",
    crossLink: {
      href: "/dashboard/site-audit",
      lead: "Want every page checked?",
      label: "Run a full website audit",
    },
  },
  site: {
    title: "Full Website Audit",
    lede: "Crawls outward from one URL with a real browser and audits every page it reaches — technical health, on-page content, speed, accessibility, structured data and security — then rolls the findings up into one prioritised list.",
    placeholder: "example.com",
    submit: "Crawl site",
    running: "Crawling…",
    toolContext: "website-audit",
    crossLink: {
      href: "/dashboard/page-audit",
      lead: "Only interested in one page?",
      label: "Audit a single page",
    },
  },
} as const

/**
 * The audit in flight, remembered across a reload.
 *
 * The job lived only in React state, so refreshing the page — or following a
 * link and coming back — left a crawl running on the server with nothing on
 * screen saying so. The audit still finished and still landed in the history,
 * which made it look like the run had been silently dropped.
 *
 * Per mode, because a single-page audit and a site crawl are separate runs on
 * separate routes and each should find its own.
 *
 * localStorage rather than the server: the jobId is all that is needed, it is
 * meaningless to anyone else, and the alternative is a new endpoint that scans
 * the queue on every page load. The cost is that it does not follow you to
 * another browser — where the audit still completes and still appears in the
 * history, which is the same outcome as before.
 */
const RUNNING_KEY = (mode: AuditMode) => `fs.audit.running.${mode}`

type RunningRun = { jobId: string; url: string; startedAt: number; timeoutMs: number }

function readRunning(mode: AuditMode): RunningRun | null {
  try {
    const raw = localStorage.getItem(RUNNING_KEY(mode))
    if (!raw) return null
    const run = JSON.parse(raw) as RunningRun
    if (!run?.jobId || typeof run.startedAt !== "number") return null
    // Past its own deadline: the job is finished, failed, or gone. Resuming
    // would poll a jobId BullMQ has already retired and show a spinner forever.
    if (Date.now() - run.startedAt > run.timeoutMs) {
      localStorage.removeItem(RUNNING_KEY(mode))
      return null
    }
    return run
  } catch {
    // Private mode, disabled storage, or a value from an older shape.
    return null
  }
}

function writeRunning(mode: AuditMode, run: RunningRun | null): void {
  try {
    if (run) localStorage.setItem(RUNNING_KEY(mode), JSON.stringify(run))
    else localStorage.removeItem(RUNNING_KEY(mode))
  } catch {
    /* storage unavailable — the run simply won't survive a reload */
  }
}

export function AuditRunner({
  mode,
  initialUrl = "",
  autoFresh = false,
}: {
  mode: AuditMode
  /** Prefilled target, from ?url= — used by "Run fresh" on a report. */
  initialUrl?: string
  /** Start immediately, past the two-week cache. From ?fresh=1. */
  autoFresh?: boolean
}) {
  const router = useRouter()
  const copy = COPY[mode]
  const [historyKey, setHistoryKey] = useState(0)
  const [url, setUrl] = useState(initialUrl)
  const [job, setJob] = useState<JobState | null>(null)
  const [report, setReport] = useState<AuditReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [limits, setLimits] = useState<Limits | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  /** Set once the mount-time resume has decided; gates the auto-fresh start. */
  const resumed = useRef(false)
  /** Set once a run has been started or adopted, so neither happens twice. */
  const autoStarted = useRef(false)
  /** stopPolling is defined below; the resume effect needs it by reference. */
  const stopPollingRef = useRef<(() => void) | null>(null)
  const startedAt = useRef(0)
  // Held in a ref rather than read from `limits` inside poll: poll is a
  // useCallback the interval closes over, and adding a dependency that arrives
  // asynchronously would rebuild it mid-run.
  const pollTimeout = useRef(pollTimeoutFor(undefined))

  // Non-fatal: without it the form just doesn't name a page count, and the
  // server clamps to the plan budget regardless. Only site mode shows it, but
  // fetching unconditionally keeps the hook order identical on both pages.
  useEffect(() => {
    let cancelled = false
    api
      .get<Limits>("/api/page-audit/limits")
      .then((l) => { if (!cancelled) setLimits(l) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  const stopPolling = useCallback(() => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    // Every path into here is an end state — completed, failed, or timed out —
    // so this is the one place that has to forget the run.
    writeRunning(mode, null)
  }, [mode])

  useEffect(() => stopPolling, [stopPolling])
  stopPollingRef.current = stopPolling

  const loadReport = useCallback(async (reportId: string) => {
    try {
      const data = await api.get<Record<string, unknown>>(`/api/page-audit/reports/${reportId}`)
      setReport(transformReport(data))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load the finished report.")
    }
  }, [])

  const poll = useCallback(
    async (jobId: string) => {
      if (Date.now() - startedAt.current > pollTimeout.current) {
        stopPolling()
        setError("This audit is taking longer than expected. It may still finish — check back shortly.")
        return
      }
      try {
        const next = await api.get<JobState>(`/api/page-audit/jobs/${jobId}`)
        setJob(next)
        if (next.status === "COMPLETED" && next.reportId) {
          stopPolling()
          await loadReport(next.reportId)
        } else if (next.status === "FAILED" || next.state === "failed") {
          stopPolling()
          setError(next.error ?? "The audit failed.")
          // A failed audit still writes a row, so the table needs to know.
          setHistoryKey((k) => k + 1)
        }
      } catch {
        // A single failed poll is not a failed audit — the next tick retries.
        // Only the timeout above ends it.
      }
    },
    [loadReport, stopPolling],
  )

  /**
   * Pick the run back up after a reload.
   *
   * Runs before the auto-fresh effect can fire and guards it, so landing on
   * ?fresh=1 and then refreshing reattaches to the crawl already running rather
   * than starting a second one and spending the credits twice.
   *
   * No deps but the ones that make it possible: this is a mount-time recovery,
   * not something to redo when state changes.
   */
  useEffect(() => {
    if (resumed.current) return
    const run = readRunning(mode)
    if (!run) {
      // Nothing to resume — release the auto-start.
      resumed.current = true
      return
    }
    resumed.current = true
    autoStarted.current = true // never auto-start over a run already in flight
    setUrl(run.url)
    startedAt.current = run.startedAt
    pollTimeout.current = run.timeoutMs
    setJob({
      jobId: run.jobId,
      state: "active",
      progress: 0,
      reportId: null,
      status: "PROCESSING",
      error: null,
    })
    stopPollingRef.current?.()
    timer.current = setInterval(() => void poll(run.jobId), POLL_MS)
    void poll(run.jobId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  /**
   * Arrived from "Run fresh" on a report: start immediately, past the cache.
   *
   * Once only, and only with a URL to run — a re-render or a back-navigation
   * must not spend another 500 credits. Waits for `limits`, because the
   * progress poll's timeout is derived from the page budget.
   */
  useEffect(() => {
    if (!resumed.current || !autoFresh || autoStarted.current || !initialUrl.trim() || !limits) return
    autoStarted.current = true
    void start({ forceRecrawl: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFresh, initialUrl, limits, job])

  const start = async (opts: { forceRecrawl?: boolean } = {}) => {
    if (!url.trim() || starting) return
    setStarting(true)
    setError(null)
    setReport(null)
    setJob(null)
    // A new run gets the full screen back, even if the last one was dismissed.
    try {
      const res = await api.post<{ jobId: string; reportId?: string | null }>("/api/page-audit", {
        url: url.trim(),
        mode,
        // Past the two-week reuse window. Only ever set by "Run fresh" on a
        // report — a plain submit should keep returning the saved one.
        ...(opts.forceRecrawl ? { forceRecrawl: true } : {}),
      })
      // An existing recent report — go straight to it. No spinner, no polling,
      // no mention of why: from here it is simply the audit for that URL.
      if (res.reportId) {
        router.push(`/dashboard/page-audit/${res.reportId}`)
        return
      }
      startedAt.current = Date.now()
      // A single-page audit is one page whatever the plan allows.
      pollTimeout.current = pollTimeoutFor(mode === "site" ? limits?.maxPages : 1)
      setJob({ jobId: res.jobId, state: "waiting", progress: 0, reportId: null, status: "PROCESSING", error: null })
      stopPolling()
      writeRunning(mode, {
        jobId: res.jobId,
        url: url.trim(),
        startedAt: startedAt.current,
        timeoutMs: pollTimeout.current,
      })
      timer.current = setInterval(() => void poll(res.jobId), POLL_MS)
      void poll(res.jobId)
    } catch (err) {
      // The backend refuses with a specific reason (bad URL, too many running),
      // and each is worth showing verbatim.
      setError(err instanceof ApiError ? err.message : "Couldn't start the audit.")
    } finally {
      setStarting(false)
    }
  }

  /**
   * A finished audit redirects to its own URL rather than swapping in place.
   *
   * The report then lives somewhere linkable and survives a refresh, the back
   * button returns here, and the history table's rows and a fresh run land on
   * exactly the same page instead of two subtly different renderings of it.
   *
   * Both modes share that route: a report is a report, and which form started
   * it stops mattering the moment it exists.
   */
  useEffect(() => {
    if (report?.id) router.replace(`/dashboard/page-audit/${report.id}`)
  }, [report?.id, router])

  const running = !!job && job.status === "PROCESSING"

  return (
    <div className="flex flex-col gap-5 px-6 pb-10 pt-5">
      <div>
        <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em]">{copy.title}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">{copy.lede}</p>
      </div>

      <ToolContext id={copy.toolContext} />

      <div className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px]">
          <span className="text-muted-foreground">
            {mode === "site"
              ? limits
                ? `Crawls up to ${limits.maxPages.toLocaleString()} pages on your plan`
                : "Crawls outward from the URL you enter"
              : "Audits the single URL you enter"}
          </span>
          {/* The other audit is one click away, and named — the two used to be
              a toggle, and someone who lands on the wrong one shouldn't have to
              go back to the sidebar to find that out. */}
          <span className="text-muted-foreground">
            {copy.crossLink.lead}{" "}
            <Link href={copy.crossLink.href} className="font-semibold text-primary hover:underline">
              {copy.crossLink.label}
            </Link>
          </span>
        </div>

        {/* Named, not silently applied. A free account asking for a 500-page
            crawl and quietly getting 100 looks like the crawler gave up. */}
        {mode === "site" && limits && limits.plan === "free" && (
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Free plans audit up to {limits.maxPages.toLocaleString()} pages per site.{" "}
            <Link href="/dashboard/billing" className="font-semibold text-primary hover:underline">
              Upgrade
            </Link>{" "}
            to raise it to 500.
          </p>
        )}

        <form
          className="mt-3.5 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void start()
          }}
        >
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={copy.placeholder}
            disabled={running}
            className="min-w-[16rem] flex-1"
            inputMode="url"
            autoComplete="url"
          />
          <Button type="submit" disabled={running || starting || !url.trim()} className="gap-1.5">
            {running || starting ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            {running ? copy.running : starting ? "Starting…" : copy.submit}
          </Button>
        </form>
        {/* Priced per 20 pages, so a whole-site crawl is not a single-page
            price. Units are the plan's clamped page budget — the same number
            the server charges against, not the number typed into the box. */}
        {/* Two actions, two prices. A single URL is one audit at one credit;
            a site crawl is priced per TWENTY pages, so 100 pages is 5 credits.
            Quoting page_audit.run for both said "Uses 500 credits" for a crawl
            the price list puts at 25 — and the server was charging that too. */}
        <CreditCost
          className="mt-2"
          action={mode === "site" ? CREDIT_ACTION_KEYS.siteCrawlPage : CREDIT_ACTION_KEYS.pageAudit}
          units={mode === "site" ? (limits?.maxPages ?? 1) : 1}
        />

        {error && (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-[13px] leading-relaxed">{error}</p>
          </div>
        )}
      </div>

{/*
        The run, in the page rather than over it.

        This was a full-screen modal. On a 500-page crawl that is a quarter of
        an hour during which the only thing the app will let you look at is a
        progress bar, and the only way out was an X that hid the findings
        entirely. Inline, the same content reads as the report assembling
        itself: the stages tick over, the findings accumulate, the page list
        grows, and when the crawl ends the finished report takes its place.

        Nothing is hidden behind a dismiss any more, so hideProgress is gone
        with it — there is nothing left to dismiss.
      */}
      {running && (
        <div className="rounded-xl border bg-card px-5 py-6 shadow-sm">
          <AuditProgressOverlay
            inline
            url={url.trim()}
            mode={mode}
            progress={job.progress}
            pagesDone={job.pagesDone}
            pagesKnown={job.pagesKnown}
            recent={job.recent}
            tally={job.tally}
            onHide={() => {}}
          />
        </div>
      )}

      {/* refreshKey re-runs the query when an audit finishes, so the new row
          appears without a manual reload. `mode` keeps each page's history to
          its own kind of audit, rather than mixing both. */}
      <AuditHistory refreshKey={historyKey} mode={mode} />
    </div>
  )
}
