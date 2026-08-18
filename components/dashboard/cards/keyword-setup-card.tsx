"use client"

/**
 * Keyword setup state for a project with no keywords yet.
 *
 * Mirrors the Site Audit card's running state — an indeterminate striped bar
 * and a plain description of what's happening — because the two are the same
 * kind of wait: a background job with no percentage to report.
 *
 * It reads the REAL run (GET …/keyword-suggestions) rather than assuming one is
 * in flight, so each state says something true:
 *   • no run yet   → offer to start it (and say what it will do)
 *   • PENDING/RUNNING → collecting data, with the stripe
 *   • COMPLETED    → suggestions are ready to pick from
 *   • FAILED       → what went wrong, plus add-by-hand and retry
 *
 * Between the start POST returning and that run row becoming readable there is
 * a gap, and the card used to fall back to "no run yet" inside it — offering the
 * button again for a job that was already queued. Combined with a start guard
 * that latched on failure as well as success, a first click that lost the race
 * left every subsequent click a silent no-op. `awaitingRun` covers the gap.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { Link } from "@/i18n/navigation"
import { Sparkles } from "lucide-react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

type RunStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED"
type Run = { id: string; status: RunStatus; error: string | null; completedAt: string | null }

const POLL_MS = 4_000
/** How long to keep showing "collecting…" on the strength of an accepted POST
 *  alone, before admitting the run never appeared. */
const AWAIT_RUN_TIMEOUT_MS = 30_000

/** Indeterminate progress — the job reports no percentage, so this reports none. */
function Stripe() {
  return (
    <div
      aria-hidden
      className="h-2 overflow-hidden rounded-full"
      style={{
        background: "var(--bg-inset)",
        backgroundImage: "repeating-linear-gradient(45deg, var(--border) 0 10px, var(--bg-inset) 10px 20px)",
        backgroundSize: "28px 28px",
        animation: "fs-crawl-stripe 1s linear infinite",
      }}
    />
  )
}

export function KeywordSetupCard({
  projectId, domain, autoStart = false,
}: {
  projectId: string
  domain: string
  /** Kick the analysis off on mount when the project has never had one. */
  autoStart?: boolean
}) {
  const [run, setRun] = useState<Run | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  // The job was accepted but no run row has come back yet. Without this the card
  // fell back to its "No keywords yet" state between the POST returning and the
  // row becoming visible — so a started analysis looked like a button that had
  // done nothing, which is what made people click it again and again.
  const [awaitingRun, setAwaitingRun] = useState(false)
  const statusRef = useRef<RunStatus | null>(null)
  const awaitingRef = useRef(false)
  const awaitingSinceRef = useRef(0)
  // Guards the POST across StrictMode's mount → unmount → remount in dev, so a
  // single project can't enqueue two analyses.
  const startedRef = useRef(false)

  const setAwaiting = useCallback((on: boolean) => {
    awaitingRef.current = on
    awaitingSinceRef.current = on ? Date.now() : 0
    setAwaitingRun(on)
  }, [])

  const load = useCallback(async () => {
    try {
      const { run: r } = await api.get<{ run: Run | null }>(`/api/projects/${projectId}/keyword-suggestions`)
      setRun(r)
      statusRef.current = r?.status ?? null
      // The row exists now — the optimistic wait can stop standing in for it.
      if (r) setAwaiting(false)
      return r
    } catch {
      return null
    }
  }, [projectId, setAwaiting])

  const start = useCallback(async () => {
    if (startedRef.current) return
    startedRef.current = true
    setStarting(true)
    setStartError(null)
    try {
      await api.post(`/api/projects/${projectId}/keyword-suggestions`, {})
      setAwaiting(true)
      await load()
    } catch (err: unknown) {
      // The guard must NOT latch on a failed start. It did, so one failed POST
      // — a quota 402, a network blip — left the button permanently inert:
      // every later click returned at the first line, silently, with the card
      // still inviting the click.
      startedRef.current = false
      setAwaiting(false)
      setStartError(err instanceof Error ? err.message : "Couldn't start the analysis.")
    } finally {
      setStarting(false)
    }
  }, [projectId, load, setAwaiting])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void load().then((r) => {
      if (cancelled) return
      setLoading(false)
      if (autoStart && !r) void start()
    })
    return () => { cancelled = true }
  }, [load, start, autoStart])

  // Poll while there's something to wait for — including the window where we
  // believe a job was accepted but have not yet seen its row.
  useEffect(() => {
    const t = setInterval(() => {
      if (awaitingRef.current) {
        // Don't believe it forever. If nothing has materialised in this long,
        // the enqueue silently didn't take, and the honest thing is to say so
        // and let the button work again rather than spin indefinitely.
        if (Date.now() - awaitingSinceRef.current > AWAIT_RUN_TIMEOUT_MS) {
          setAwaiting(false)
          startedRef.current = false
          setStartError("The analysis didn't start. Please try again.")
          return
        }
        void load()
        return
      }
      if (statusRef.current === "PENDING" || statusRef.current === "RUNNING") void load()
    }, POLL_MS)
    return () => clearInterval(t)
  }, [load, setAwaiting])

  if (loading) return <Skeleton className="h-24 w-full rounded-lg" />

  const working = starting || awaitingRun || run?.status === "PENDING" || run?.status === "RUNNING"

  return (
    <section className="rounded-lg border bg-card p-4 shadow-sm">
      {working ? (
        <>
          <div className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold">
            <Sparkles className="size-4 text-primary" /> Collecting keyword data…
          </div>
          <Stripe />
          <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
            We&apos;re reading <span className="font-medium text-foreground">{domain}</span>, picking the keywords it
            should rank for, and checking where it stands today. This usually takes a minute or two — you can leave
            this page, it keeps running in the background.
          </p>
        </>
      ) : run?.status === "COMPLETED" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold">Your keywords are ready to pick</div>
            <p className="mt-1 text-xs text-muted-foreground">
              We analysed {domain} and shortlisted the keywords worth tracking. Choose the ones you want and we&apos;ll
              start checking their rank.
            </p>
          </div>
          <Button asChild size="sm" className="h-8 text-xs">
            <Link href={`/dashboard/project/${projectId}/keywords`}>Choose keywords</Link>
          </Button>
        </div>
      ) : run?.status === "FAILED" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold">We couldn&apos;t analyse {domain}</div>
            <p className="mt-1 max-w-xl text-xs text-muted-foreground">
              {run.error || "The site blocked our crawler, or it was unreachable."} You can add keywords by hand instead.
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { startedRef.current = false; void start() }}>Try again</Button>
            <Button asChild size="sm" className="h-8 text-xs"><Link href={`/dashboard/project/${projectId}/keywords`}>Add keywords</Link></Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold">No keywords yet</div>
            <p className="mt-1 max-w-xl text-xs text-muted-foreground">
              Let AI read {domain} and suggest the keywords it should rank for — or add your own and we&apos;ll start
              tracking them right away.
            </p>
            {/* A failed start used to produce nothing at all on screen. */}
            {startError && (
              <p className="mt-1.5 max-w-xl text-xs font-medium text-amber-600 dark:text-amber-400">{startError}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={starting} onClick={() => void start()}>
              <Sparkles className="size-3.5" /> {starting ? "Starting…" : startError ? "Try again" : "Analyse with AI"}
            </Button>
            <Button asChild size="sm" variant="outline" className="h-8 text-xs">
              <Link href={`/dashboard/project/${projectId}/keywords`}>Add manually</Link>
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
