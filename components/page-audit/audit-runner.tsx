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
import { useTranslations } from "next-intl"
import { CreditCost, CreditCostConfirm, CONFIRM_THRESHOLD } from "@/components/dashboard/credit-cost"
import { CREDIT_ACTION_KEYS, quoteCredits, useCreditRates, useCredits } from "@/lib/credits"
import { CheckCircle2, Loader2, Search, ShieldAlert, Square } from "lucide-react"
import { Link, usePathname, useRouter } from "@/i18n/navigation"
import { api, ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
    toolContext: "website-audit",
    crossLink: {
      href: "/dashboard/page-audit",
      lead: "Only interested in one page?",
      label: "Audit a single page",
    },
  },
} as const

/**
 * The audits in flight, remembered across a reload.
 *
 * The jobs lived only in React state, so refreshing the page — or following a
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
 *
 * A LIST, because a crawl of hundreds of pages takes a quarter of an hour and
 * the form used to lock for all of it: one audit at a time, no way out but to
 * wait. The server allows limits.maxConcurrent at once, so the page does too.
 */
const RUNNING_KEY = (userId: string, mode: AuditMode) => `fs.audit.running.${userId}.${mode}`

type RunningRun = { jobId: string; url: string; startedAt: number; timeoutMs: number }

function readRuns(key: string): RunningRun[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    // A single object is the shape from before audits could run side by side.
    const list = (Array.isArray(parsed) ? parsed : [parsed]) as RunningRun[]
    // Past its own deadline: the job is finished, failed, or gone. Resuming
    // would poll a jobId BullMQ has already retired and show a spinner forever.
    return list.filter(
      (r) => !!r?.jobId && typeof r.startedAt === "number" && Date.now() - r.startedAt <= r.timeoutMs,
    )
  } catch {
    // Private mode, disabled storage, or a value from an older shape.
    return []
  }
}

function writeRuns(key: string | null, runs: RunningRun[]): void {
  if (!key) return
  try {
    if (runs.length) localStorage.setItem(key, JSON.stringify(runs))
    else localStorage.removeItem(key)
  } catch {
    /* storage unavailable — the runs simply won't survive a reload */
  }
}

/** Enough to tell "example.com" and "https://www.example.com/" are one target. */
const sameTarget = (a: string, b: string) => {
  const norm = (u: string) =>
    u.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "")
  return norm(a) === norm(b)
}

type RunEnd = { reportId: string } | { error: string } | { notice: string }

/**
 * One audit in flight: polls its own job and can stop it.
 *
 * The interval lives and dies with the card. Leaving the page stops polling and
 * nothing more; the saved run is forgotten only when onEnd fires because the
 * audit really ended. `live` drops a response that lands after that.
 */
function RunCard({
  run,
  mode,
  onEnd,
}: {
  run: RunningRun
  mode: AuditMode
  onEnd: (jobId: string, end: RunEnd) => void
}) {
  const [job, setJob] = useState<JobState | null>(null)
  const [stopping, setStopping] = useState(false)
  const [stopError, setStopError] = useState<string | null>(null)
  // A ref, so a new onEnd each parent render doesn't restart the interval.
  const onEndRef = useRef(onEnd)
  useEffect(() => {
    onEndRef.current = onEnd
  })

  useEffect(() => {
    let live = true
    const end = (e: RunEnd) => {
      live = false
      onEndRef.current(run.jobId, e)
    }

    const tick = async () => {
      if (!live) return
      if (Date.now() - run.startedAt > run.timeoutMs) {
        end({ error: "This audit is taking longer than expected. It may still finish — check your history shortly." })
        return
      }
      try {
        const next = await api.get<JobState>(`/api/page-audit/jobs/${run.jobId}`)
        if (!live) return
        if (next.status === "COMPLETED" && next.reportId) end({ reportId: next.reportId })
        else if (next.status === "FAILED" || next.state === "failed") end({ error: next.error ?? "The audit failed." })
        else
          // Never backwards. The worker reports coarse stage numbers and a
          // finer crawl percentage, and responses can land out of order; either
          // way a bar that jumps back reads as a restart.
          setJob((prev) => (prev && prev.progress > next.progress ? { ...next, progress: prev.progress } : next))
      } catch (err) {
        if (!live) return
        // The queue has let go of the job and no report was written for it:
        // there is nothing left to wait for.
        if (err instanceof ApiError && err.status === 404) {
          end({ error: "This audit is no longer running and didn't produce a report. Please run it again." })
        }
        // Anything else is one failed poll, not a failed audit — the next tick retries.
      }
    }

    const id = setInterval(() => void tick(), POLL_MS)
    void tick()
    return () => {
      live = false
      clearInterval(id)
    }
  }, [run.jobId, run.startedAt, run.timeoutMs])

  /**
   * Stop, without throwing the work away.
   *
   * A queued audit is cancelled and refunded. A crawling one stops before its
   * next page and the pages already read become the report — charged per page,
   * like any crawl — so someone who has waited ten minutes leaves with ten
   * minutes of findings rather than nothing. Polling carries on to that report.
   */
  const stop = async () => {
    setStopping(true)
    setStopError(null)
    try {
      const res = await api.post<{ stopped: "cancelled" | "stopping" }>(`/api/page-audit/jobs/${run.jobId}/stop`)
      if (res.stopped === "cancelled") onEndRef.current(run.jobId, { notice: "Audit cancelled before it started — nothing was charged." })
    } catch (err) {
      setStopping(false)
      setStopError(err instanceof ApiError ? err.message : "Couldn't stop the audit. Try again.")
    }
  }

  return (
    <div className="rounded-xl border bg-card px-5 py-6 shadow-sm">
      <AuditProgressOverlay
        inline
        url={run.url}
        mode={mode}
        progress={job?.progress ?? 0}
        pagesDone={job?.pagesDone}
        pagesKnown={job?.pagesKnown}
        recent={job?.recent}
        tally={job?.tally}
        onHide={() => {}}
        action={
          // Site crawls only: a single page is done in under a minute, and once
          // its one page is being read there is nothing left to stop.
          mode === "site" && (
            <div className="flex flex-col items-center gap-1.5">
              <Button type="button" variant="outline" size="sm" onClick={() => void stop()} disabled={stopping} className="gap-1.5">
                {stopping ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3.5" />}
                {stopping ? "Stopping…" : "Stop & see results so far"}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                {stopping
                  ? "Finishing the current page, then building the report from the pages already read."
                  : "Ends the crawl and builds the report from the pages already read."}
              </p>
              {stopError && <p className="text-[11px] text-amber-600 dark:text-amber-400">{stopError}</p>}
            </div>
          )
        }
      />
    </div>
  )
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
  const [runs, setRuns] = useState<RunningRun[]>([])
  const [error, setError] = useState<string | null>(null)
  /** Neutral news: a run finished while another is still going, or a cancel. */
  const [notice, setNotice] = useState<{ text: string; href?: string } | null>(null)
  const [starting, setStarting] = useState(false)
  const [limits, setLimits] = useState<Limits | null>(null)
  const tc = useTranslations("credits")
  const { credits } = useCredits()
  const { rates } = useCreditRates()
  // Audits are free on a worker plan, so credit wording and confirms are for
  // credits accounts only — and neither shows until the mode is known.
  const isCreditsMode = credits?.mode === "credits"
  const perPage = quoteCredits(rates, CREDIT_ACTION_KEYS.siteCrawlPage, 1)
  /** The ceiling of a site crawl: the plan's page budget at the per-page rate. */
  const siteCeiling = limits ? quoteCredits(rates, CREDIT_ACTION_KEYS.siteCrawlPage, limits.maxPages) : null
  /** Set when a start waits on the confirm — fresh, or a plain submit. */
  const [confirmStart, setConfirmStart] = useState<{ forceRecrawl: boolean } | null>(null)
  /** Set once the mount-time resume has decided; gates the auto-fresh start. */
  const resumed = useRef(false)
  /** Set once a run has been started or adopted, so neither happens twice. */
  const autoStarted = useRef(false)
  /**
   * The runs as of right now, for the handlers. Two audits can end in the same
   * tick, and "was that the last one?" must not read a stale render.
   */
  const runsRef = useRef<RunningRun[]>([])

  const updateRuns = useCallback(
    (fn: (prev: RunningRun[]) => RunningRun[]) => {
      const next = fn(runsRef.current)
      runsRef.current = next
      writeRuns(runKey, next)
      setRuns(next)
    },
    [runKey],
  )

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

  /**
   * Pick the runs back up after a reload.
   *
   * Runs before the auto-fresh effect can fire and guards it, so landing on
   * ?fresh=1 and then refreshing reattaches to the crawl already running rather
   * than starting a second one and spending the credits twice.
   */
  useEffect(() => {
    if (resumed.current || !runKey) return
    resumed.current = true
    const saved = readRuns(runKey)
    // Nothing to resume — the auto-start is released.
    if (!saved.length) return
    autoStarted.current = true // never auto-start over a run already in flight
    updateRuns(() => saved)
  }, [runKey, updateRuns])

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
   * can't be sent twice.
   */
  useEffect(() => {
    if (!resumed.current || !autoFresh) return
    if (!autoStarted.current) {
      // Also waits for the billing mode: whether this asks first depends on it.
      if (!initialUrl.trim() || !limits || !credits) return
      autoStarted.current = true
      // "Run fresh" was clicked on the report, where no price was shown. A
      // credits account is charged for the crawl, so it confirms here with the
      // price in view rather than starting the moment the page loads.
      if (isCreditsMode) setConfirmStart({ forceRecrawl: true })
      else void start({ forceRecrawl: true })
    }
    router.replace(`${pathname}?url=${encodeURIComponent(initialUrl.trim())}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFresh, initialUrl, limits, runKey, credits])

  const start = async (opts: { forceRecrawl?: boolean } = {}) => {
    const target = url.trim()
    if (!target || starting) return
    // Already on screen below: a second crawl of the same site is the same
    // answer, charged twice.
    if (runsRef.current.some((r) => sameTarget(r.url, target))) {
      setError("That one is already being audited — see its progress below.")
      return
    }
    setStarting(true)
    setError(null)
    setNotice(null)
    try {
      const res = await api.post<{ jobId: string; reportId?: string | null }>("/api/page-audit", {
        url: target,
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
      const run: RunningRun = {
        jobId: res.jobId,
        url: target,
        startedAt: Date.now(),
        // A single-page audit is one page whatever the plan allows.
        timeoutMs: pollTimeoutFor(mode === "site" ? limits?.maxPages : 1),
      }
      updateRuns((prev) => [run, ...prev])
      // The form is free for the next one; the run shows its own target.
      setUrl("")
    } catch (err) {
      // The backend refuses with a specific reason (bad URL, too many running),
      // and each is worth showing verbatim.
      setError(err instanceof ApiError ? err.message : "Couldn't start the audit.")
    } finally {
      setStarting(false)
    }
  }

  /**
   * A run is over — done, failed, or cancelled.
   *
   * A finished audit redirects to its own URL rather than swapping in place, so
   * the report lives somewhere linkable and survives a refresh. But only when it
   * was the last one on screen: with another crawl still going, yanking the
   * page away from it would be its own kind of trap, so it is announced instead.
   */
  const endRun = (jobId: string, end: RunEnd) => {
    const run = runsRef.current.find((r) => r.jobId === jobId)
    if (!run) return // already ended — a cancel and a late poll can both report it
    updateRuns((prev) => prev.filter((r) => r.jobId !== jobId))
    // A failed audit still writes a row, so the table needs to know either way.
    setHistoryKey((k) => k + 1)
    if ("reportId" in end) {
      const href = `/dashboard/page-audit/${end.reportId}`
      if (runsRef.current.length === 0) router.replace(href)
      else setNotice({ text: `The audit of ${run.url} is ready.`, href })
    } else if ("error" in end) setError(end.error)
    else setNotice({ text: end.notice })
  }

  const atCapacity = !!limits && runs.length >= limits.maxConcurrent

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
                charge is for the pages we actually find, so the sentence
                has to carry both or it reads as a flat fee. */}
            {mode === "site"
              ? limits
                ? `Crawls up to ${limits.maxPages.toLocaleString()} pages on your plan`
                : "Crawls outward from the URL you enter"
              : "Audits the single URL you enter"}
            {mode === "site" && isCreditsMode && perPage != null && ` · ${tc("auditPerPage", { count: perPage, n: perPage })}`}
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
            {tc("auditUpgradeMore")}
          </p>
        )}

        <form
          className="mt-3.5 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!url.trim()) return
            // A site crawl can run to hundreds of credits, so a big ceiling
            // is confirmed with the balance in view rather than just labelled.
            if (isCreditsMode && mode === "site" && (siteCeiling ?? 0) >= CONFIRM_THRESHOLD) {
              setConfirmStart({ forceRecrawl: false })
            } else void start()
          }}
        >
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={copy.placeholder}
            className="min-w-[16rem] flex-1"
            inputMode="url"
            autoComplete="url"
          />
          <Button type="submit" disabled={starting || atCapacity || !url.trim()} className="gap-1.5">
            {starting ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            {starting ? "Starting…" : copy.submit}
          </Button>
        </form>
        {/* Said before the click rather than as a 409 after it — and after the
            credits confirm, which would otherwise be asked for nothing. */}
        {atCapacity && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {limits.maxConcurrent} audits are running — the most at once. Stop one or wait for it to finish.
          </p>
        )}
        {/*
          A single URL is one audit; a crawl is priced per page found (the rate
          card's site_crawl.page, currently a credit per twenty pages).

          The units here are the plan's page BUDGET, which is a ceiling and not
          a bill: the server charges for the pages actually crawled, so a
          twenty-page site on a five-hundred-page plan pays twenty. Quoting the
          ceiling as a flat price would say "500 credits" to somebody who is
          about to be charged twenty, so the site line says up to.
        */}
        {/* A site crawl's ceiling is the plan's page budget, so it waits for
            the limits: before they load (or if they fail) there is no honest
            number, and "Up to 1 credit" was a confident wrong one. */}
        {(mode !== "site" || limits) && (
          <CreditCost
            className="mt-2"
            action={mode === "site" ? CREDIT_ACTION_KEYS.siteCrawlPage : CREDIT_ACTION_KEYS.pageAudit}
            units={mode === "site" ? (limits?.maxPages ?? 1) : 1}
            upTo={mode === "site"}
          />
        )}
        {mode === "site" && isCreditsMode && perPage != null && (
          <p className="mt-1 text-xs text-muted-foreground">
            {tc("auditChargedPerPage", { pages: 20, credits: perPage * 20 })}
          </p>
        )}
        <CreditCostConfirm
          action={mode === "site" ? CREDIT_ACTION_KEYS.siteCrawlPage : CREDIT_ACTION_KEYS.pageAudit}
          units={mode === "site" ? (limits?.maxPages ?? 1) : 1}
          upTo={mode === "site"}
          title={confirmStart?.forceRecrawl ? tc("auditFreshTitle") : tc("auditStartTitle")}
          description={
            confirmStart?.forceRecrawl
              ? `${tc("auditFreshBody")}${mode === "site" ? ` ${tc("auditStartBody")}` : ""}`
              : tc("auditStartBody")
          }
          open={confirmStart != null}
          onOpenChange={(open) => {
            if (!open) setConfirmStart(null)
          }}
          onConfirm={() => void start({ forceRecrawl: confirmStart?.forceRecrawl ?? false })}
        />

        {error && (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-[13px] leading-relaxed">{error}</p>
          </div>
        )}
        {notice && (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p className="text-[13px] leading-relaxed">
              {notice.text}
              {notice.href && (
                <>
                  {" "}
                  <Link href={notice.href} className="font-semibold text-primary hover:underline">
                    View report
                  </Link>
                </>
              )}
            </p>
          </div>
        )}
      </div>

      {/*
        The runs, in the page rather than over it.

        This was a full-screen modal. On a 500-page crawl that is a quarter of
        an hour during which the only thing the app will let you look at is a
        progress bar. Inline, the same content reads as the report assembling
        itself: the stages tick over, the findings accumulate, the page list
        grows, and when the crawl ends the finished report takes its place.
      */}
      {runs.map((run) => (
        <RunCard key={run.jobId} run={run} mode={mode} onEnd={endRun} />
      ))}

      {/* refreshKey re-runs the query when an audit finishes, so the new row
          appears without a manual reload. `mode` keeps each page's history to
          its own kind of audit, rather than mixing both. */}
      <AuditHistory refreshKey={historyKey} mode={mode} />
    </div>
  )
}
