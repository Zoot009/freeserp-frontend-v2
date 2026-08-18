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

const dismissKey = (projectId: string) => `fs.kwai.${projectId}`

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

/**
 * The offer to find keywords for you, asked rather than assumed.
 *
 * This was a full-width card wedged above the stat strip, permanently occupying
 * the best real estate on the dashboard to ask one question. It is a question,
 * so it gets a dialog: answer it, dismiss it, and the dashboard is a dashboard
 * again. Dismissal is remembered per project — an offer that returns on every
 * visit after you have declined it is nagging, not helping.
 *
 * Only the IDLE state moved here. A crawl in flight and a finished shortlist
 * both still render in place, because those are progress worth seeing on the
 * page rather than a question waiting for an answer.
 */
function KeywordAiPrompt({
  domain,
  starting,
  error,
  projectId,
  onStart,
  onDismiss,
}: {
  domain: string
  starting: boolean
  error: string | null
  projectId: string
  onStart: () => void
  onDismiss: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onDismiss])

  return (
    <div className="fs-app">
      <div className="modal-bg" onClick={onDismiss}>
        <div
          className="modal"
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: 440 }}
          role="dialog"
          aria-modal="true"
          aria-label="Find keywords with AI"
        >
          <div className="modal-b" style={{ padding: "26px 24px 20px", textAlign: "center" }}>
            <div
              aria-hidden
              style={{
                width: 46,
                height: 46,
                margin: "0 auto 14px",
                display: "grid",
                placeItems: "center",
                borderRadius: 14,
                background: "var(--brand-soft)",
                color: "var(--brand)",
              }}
            >
              <Sparkles className="size-5" />
            </div>
            <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}>
              Want us to find your keywords?
            </div>
            {/* Built as one string rather than JSX text either side of {domain}:
                as separate text nodes the space next to the domain kept being
                eaten, and it shipped reading "bikewale.comand suggest". */}
            <p
              className="tiny muted"
              style={{ margin: "8px auto 0", maxWidth: 340, fontSize: 13, lineHeight: 1.55 }}
            >
              {`We'll read ${domain}, work out what it should rank for, and check where it stands today. It takes a minute or two.`}
            </p>
            {error && (
              <p className="tiny" style={{ marginTop: 10, color: "var(--neg)" }}>
                {error}
              </p>
            )}
          </div>
          <div
            className="modal-f"
            style={{ justifyContent: "center", gap: 10, paddingTop: 16, paddingBottom: 16 }}
          >
            <Button size="sm" className="h-9 gap-1.5 text-[13px]" disabled={starting} onClick={onStart}>
              <Sparkles className="size-3.5" />
              {starting ? "Starting…" : error ? "Try again" : "Analyse with AI"}
            </Button>
            <Button asChild size="sm" variant="outline" className="h-9 text-[13px] hover:bg-muted hover:text-foreground">
              <Link href={`/dashboard/project/${projectId}/keywords`}>Add them myself</Link>
            </Button>
          </div>
          {/* A quiet third option. "Not now" belongs below the two real answers,
              not beside them competing for the same weight. */}
          <button
            type="button"
            onClick={onDismiss}
            className="mx-auto mb-4 block bg-transparent text-xs text-muted-foreground hover:text-foreground"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}

export function KeywordSetupCard({
  projectId, domain,
}: {
  projectId: string
  domain: string
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
  // null until the stored preference is read, so a dismissed prompt never
  // flashes on its way to being hidden.
  const [askDismissed, setAskDismissed] = useState<boolean | null>(null)
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
    try {
      setAskDismissed(window.localStorage.getItem(dismissKey(projectId)) === "0")
    } catch {
      setAskDismissed(false)
    }
  }, [projectId])

  const dismissAsk = useCallback(() => {
    setAskDismissed(true)
    try {
      window.localStorage.setItem(dismissKey(projectId), "0")
    } catch {
      /* preference simply doesn't persist */
    }
  }, [projectId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void load().then(() => {
      if (cancelled) return
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [load])

  // The start guard exists to stop a double-enqueue, so it may only outlive a
  // start that is actually in flight. Any moment where nothing is starting,
  // nothing is awaited and no run exists is a moment the button must be live —
  // without this, a run that vanishes (a cleaned-up failure) drops the card back
  // to the offer with a latched guard, and the click does nothing at all.
  useEffect(() => {
    if (!starting && !awaitingRun && !run) startedRef.current = false
  }, [starting, awaitingRun, run])

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
  const idle = !working && !run

  // Nothing to report in place — the offer is a dialog now, not a card.
  if (idle) {
    if (askDismissed !== false) return null
    return (
      <KeywordAiPrompt
        domain={domain}
        projectId={projectId}
        starting={starting}
        error={startError}
        onStart={() => void start()}
        onDismiss={dismissAsk}
      />
    )
  }

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
      ) : null}
    </section>
  )
}
