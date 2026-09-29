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
import { Link, usePathname, useRouter } from "@/i18n/navigation"
import { api, ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth"
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
 *
 * Per user too. The storage belongs to the browser, not the account, so a
 * mode-only key let whoever signed in next on the same machine pick up — and
 * sit watching — the previous person's crawl.
 */
const RUNNING_KEY = (userId: string, mode: AuditMode) => `fs.audit.running.${userId}.${mode}`

type RunningRun = { jobId: string; url: string; startedAt: number; timeoutMs: number }

function readRunning(key: string): RunningRun | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const run = JSON.parse(raw) as RunningRun
    if (!run?.jobId || typeof run.startedAt !== "number") return null
    // Past its own deadline: the job is finished, failed, or gone. Resuming
    // would poll a jobId BullMQ has already retired and show a spinner forever.
    if (Date.now() - run.startedAt > run.timeoutMs) {
      localStorage.removeItem(key)
      return null
    }
    return run
  } catch {
    // Private mode, disabled storage, or a value from an older shape.
    return null
  }
}

function writeRunning(key: string | null, run: RunningRun | null): void {
  if (!key) return
  try {
    if (run) localStorage.setItem(key, JSON.stringify(run))
    else localStorage.removeItem(key)
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
  const pathname = usePathname()
  // The dashboard shell renders nothing until the user is known, so this is
  // set from the first render; the null case only satisfies the types.
  const { user } = useAuth()
  const runKey = user ? RUNNING_KEY(user.id, mode) : null
  const copy = COPY[mode]
  const [historyKey, setHistoryKey] = useState(0)
  const [url, setUrl] = useState(initialUrl)
  const [job, setJob] = useState<JobState | null>(null)
  const [report, setReport] = useState<AuditReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [limits, setLimits] = useState<Limits | null>(null)
  /** Set once the mount-time resume has decided; gates the auto-fresh start. */
  const resumed = useRef(false)
  /** Set once a run has been started or adopted, so neither happens twice. */
  const autoStarted = useRef(false)
  const startedAt = useRef(0)
  // Held in a ref rather than read from `limits` inside the polling effect: a
  // resumed run brings its own deadline, and a dependency that arrives
  // asynchronously would restart the interval mid-run.
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

  const loadReport = useCallback(async (reportId: string) => {
    try {
      const data = await api.get<Record<string, unknown>>(`/api/page-audit/reports/${reportId}`)
      setReport(transformReport(data))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load the finished report.")
    }
  }, [])

  /**
   * Poll the running job — as an effect of there being one.
   *
   * This was an interval threaded through start, resume and every end state,
   * cleared by a stopPolling that ALSO forgot the saved run. Unmounting called
   * it, and so did the resume itself, so a reload or a trip to another page
   * wiped the run mid-crawl. Back on a "Run fresh" link (?fresh=1) there was
   * then nothing to say a crawl was already going, and the page started — and
   * charged for — a second one.
   *
   * Now the interval lives and dies with the job it polls. Leaving the page
   * stops it and nothing more; the saved run is forgotten only when the audit
   * really ends. `live` also drops a response that lands after that, so a late
   * "still running" can't re-lock a form a failure has just unlocked.
   */
  const pollingId = job?.status === "PROCESSING" ? job.jobId : null

  useEffect(() => {
    if (!pollingId) return
    let live = true

    /** A real end state: forget the run so a reload doesn't reattach to it. */
    const end = (message: string) => {
      writeRunning(runKey, null)
      // Clearing the job is what unlocks the form: `running` reads its status.
      setJob(null)
      setError(message)
      // A failed audit still writes a row, so the table needs to know.
      setHistoryKey((k) => k + 1)
    }

    const tick = async () => {
      if (Date.now() - startedAt.current > pollTimeout.current) {
        // Not an end state — the audit may yet finish — so the saved run
        // stays; a reload past this deadline finds it expired (readRunning).
        setJob(null)
        setError("This audit is taking longer than expected. It may still finish — check back shortly.")
        return
      }
      try {
        const next = await api.get<JobState>(`/api/page-audit/jobs/${pollingId}`)
        if (!live) return
        if (next.status === "COMPLETED" && next.reportId) {
          writeRunning(runKey, null)
          setJob(next)
          await loadReport(next.reportId)
        } else if (next.status === "FAILED" || next.state === "failed") {
          end(next.error ?? "The audit failed.")
        } else {
          // Never backwards for the same job. The worker reports coarse stage
          // numbers and a finer crawl percentage, and responses can land out
          // of order; either way a bar that jumps back reads as a restart.
          setJob((prev) =>
            prev?.jobId === next.jobId && prev.progress > next.progress
              ? { ...next, progress: prev.progress }
              : next,
          )
        }
      } catch (err) {
        if (!live) return
        // The queue has let go of the job and no report was written for it:
        // there is nothing left to wait for, and polling on would spin until
        // the timeout.
        if (err instanceof ApiError && err.status === 404) {
          end("This audit is no longer running and didn't produce a report. Please run it again.")
        }
        // Anything else is one failed poll, not a failed audit — the next
        // tick retries.
      }
    }

    const id = setInterval(() => void tick(), POLL_MS)
    void tick()
    return () => {
      live = false
      clearInterval(id)
    }
  }, [pollingId, runKey, loadReport])

  /**
   * Pick the run back up after a reload.
   *
   * Runs before the auto-fresh effect can fire and guards it, so landing on
   * ?fresh=1 and then refreshing reattaches to the crawl already running rather
   * than starting a second one and spending the credits twice.
   *
   * Once per mount: setting the job is all it does — polling follows from that.
   */
  useEffect(() => {
    if (resumed.current || !runKey) return
    resumed.current = true
    const run = readRunning(runKey)
    // Nothing to resume — the auto-start is released.
    if (!run) return
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
  }, [runKey])

  /**
   * Arrived from "Run fresh" on a report: start immediately, past the cache.
   *
   * Once only, and only with a URL to run — a re-render or a back-navigation
   * must not spend another 500 credits. Waits for `limits`, because the
   * progress poll's timeout is derived from the page budget.
   *
   * The flag is spent as soon as it has been acted on — by starting the run,
   * or by finding one already going. Left in the address bar, a reload or a
   * Back to this page read ?fresh=1 again. Replaced before the POST resolves,
   * so even a start that times out on our side but was queued on the server
   * can't be sent twice. The url stays, so the form still shows the target.
   */
  useEffect(() => {
    if (!resumed.current || !autoFresh) return
    if (!autoStarted.current) {
      if (!initialUrl.trim() || !limits) return
      autoStarted.current = true
      void start({ forceRecrawl: true })
    }
    router.replace(`${pathname}?url=${encodeURIComponent(initialUrl.trim())}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFresh, initialUrl, limits, runKey])

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
      writeRunning(runKey, {
        jobId: res.jobId,
        url: url.trim(),
        startedAt: startedAt.current,
        timeoutMs: pollTimeout.current,
      })
      // Polling starts from this — see the job effect above.
      setJob({ jobId: res.jobId, state: "waiting", progress: 0, reportId: null, status: "PROCESSING", error: null })
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
            {/* "Up to", because the number is a ceiling and not a price. The
                charge is one credit per page we actually find, so the sentence
                has to carry both or it reads as a flat fee. */}
            {mode === "site"
              ? limits
                ? `Crawls up to ${limits.maxPages.toLocaleString()} pages on your plan · 1 page = 1 credit`
                : "Crawls outward from the URL you enter · 1 page = 1 credit"
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
        {/*
          One page, one credit — for a single URL and for a crawl alike.

          The units here are the plan's page BUDGET, which is a ceiling and not
          a bill: the server charges for the pages actually crawled, so a
          twenty-page site on a five-hundred-page plan pays twenty. Quoting the
          ceiling as a flat price would say "500 credits" to somebody who is
          about to be charged twenty, so the site line says up to.
        */}
        <CreditCost
          className="mt-2"
          action={mode === "site" ? CREDIT_ACTION_KEYS.siteCrawlPage : CREDIT_ACTION_KEYS.pageAudit}
          units={mode === "site" ? (limits?.maxPages ?? 1) : 1}
        />
        {mode === "site" && (
          <p className="mt-1 text-xs text-muted-foreground">
            You&apos;re only charged for the pages we find — a 20-page site costs 20 credits,
            whatever your plan allows.
          </p>
        )}

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
