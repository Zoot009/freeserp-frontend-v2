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
 *   • PENDING/PROCESSING → collecting data, with the stripe
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
import { hasDeclinedKeywordAi, declineKeywordAi } from "@/lib/keywordAiChoice"
import { Link } from "@/i18n/navigation"
import { Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { DEFAULT_ENGINE } from "@/hooks/use-engines"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

// PROCESSING, not RUNNING. The backend's AnalysisStatus enum is
// PENDING | PROCESSING | COMPLETED | FAILED (prisma/schema.prisma), and this
// file checked for "RUNNING" — a value the API has never sent. So for the whole
// length of the analysis every branch missed, and the card fell through to its
// "No keywords yet — Analyse with AI" state while the run it was offering to
// start was already underway. "RUNNING" stays in the union only so an older
// deployment that does send it is still read as in-flight.
type RunStatus = "PENDING" | "PROCESSING" | "RUNNING" | "COMPLETED" | "FAILED"

/** One AI-proposed keyword. `volume` is null when the provider had no figure. */
type Suggestion = {
  keyword: string
  volume: number | null
  rationale?: string
}

type Run = {
  id: string
  status: RunStatus
  error: string | null
  /** When the run was created — the elapsed clock counts from here. */
  createdAt?: string | null
  completedAt: string | null
  /**
   * The shortlist itself, which this endpoint has always returned and this card
   * always dropped. Reading it is what lets "Choose keywords" put the keywords
   * on screen instead of a link to the page that has them.
   *
   * Optional because an older deployment may answer without it — the card falls
   * back to the keywords page when it does.
   */
  suggestions?: {
    location: string
    suggestions: Suggestion[]
  } | null
}

/** How many of the shortlist arrive ticked. They come volume-sorted, so this is
 *  the head of the list. */
const PRESELECT_COUNT = 10

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k`
  return String(v)
}

const IN_FLIGHT: ReadonlySet<string> = new Set(["PENDING", "PROCESSING", "RUNNING"])

const POLL_MS = 4_000
/** How long to keep showing "collecting…" on the strength of an accepted POST
 *  alone, before admitting the run never appeared. */
const AWAIT_RUN_TIMEOUT_MS = 30_000

/**
 * Creating a project enqueues a keyword analysis server-side
 * (projects.service.ts → ksService.enqueueForNewProject), and that call is
 * fire-and-forget, so the HTTP response can beat the run row into existence.
 * "No run" is therefore not proof that none is coming — for this long after
 * mount it means "not yet", and the card waits rather than offering to start
 * the analysis that is already starting.
 */
const RUN_APPEAR_GRACE_MS = 15_000

/** "1m 12s". The run reports no percentage, so elapsed time is the only honest
 *  signal that something is still happening. */
function elapsedLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const sec = total % 60
  return m > 0 ? `${m}m ${String(sec).padStart(2, "0")}s` : `${sec}s`
}

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
              <Link href={`/dashboard/project/${projectId}/keywords?add=1`}>Add them myself</Link>
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

/**
 * Pick from the shortlist, on the dashboard, without going anywhere.
 *
 * "Choose keywords" used to be a link. It read as an offer to choose and
 * behaved as a redirect: you arrived on the rank tracker — a page about
 * keywords you already track — to do the thing you had just asked to do, and
 * the shortlist was another click away behind a second button.
 *
 * So the choosing happens here. The top few arrive ticked, because the whole
 * point of running an analysis is that it already worked out what is worth
 * tracking: the common path is one click, and disagreeing is possible rather
 * than required.
 */
function KeywordPicker({
  projectId,
  domain,
  suggestions,
  location,
  onClose,
  onAdded,
}: {
  projectId: string
  domain: string
  suggestions: Suggestion[]
  /** The locale the analysis ran in. The keywords are tracked in the same one,
   *  so the picks mean what the volumes beside them said. */
  location: string
  onClose: () => void
  onAdded: () => void
}) {
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(suggestions.slice(0, PRESELECT_COUNT).map((s) => s.keyword)),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Not while the POST is in flight — escaping then hides work that is
      // still going to land.
      if (e.key === "Escape" && !saving) onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose, saving])

  const toggle = (kw: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(kw)) next.delete(kw)
      else next.add(kw)
      return next
    })

  const allPicked = suggestions.length > 0 && picked.size === suggestions.length

  const submit = async () => {
    const picks = suggestions.filter((s) => picked.has(s.keyword)).map((s) => s.keyword)
    if (!picks.length) return
    setSaving(true)
    setError(null)
    try {
      // The same shape the Add keywords modal posts, so both paths create
      // identical rows: one per keyword per engine.
      const res = await api.post<{ added?: number }>(`/api/projects/${projectId}/keywords`, {
        keywords: picks.map((k) => ({ keyword: k, location, device: "desktop", engines: [DEFAULT_ENGINE] })),
      })
      // The insert is skipDuplicates server-side, so "added" can legitimately
      // come back lower than asked. Say which happened — silence there is
      // indistinguishable from a failure.
      const added = res?.added ?? picks.length
      toast.success(
        added === 0
          ? "Those keywords are already tracked."
          : `Now tracking ${added} keyword${added === 1 ? "" : "s"} — the first check is queued.`,
      )
      onAdded()
    } catch (err: unknown) {
      // Stay open. The picks are the user's work, and closing throws them away
      // along with the error that explains why.
      setSaving(false)
      setError(err instanceof Error ? err.message : "Couldn't add those keywords.")
    }
  }

  return (
    <div className="fs-app">
      <div className="modal-bg" onClick={() => { if (!saving) onClose() }}>
        <div
          className="modal"
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: 520 }}
          role="dialog"
          aria-modal="true"
          aria-label="Choose keywords to track"
        >
          <div className="modal-h">
            <div>
              <div className="b" style={{ fontSize: 17, letterSpacing: "-0.01em" }}>Choose your keywords</div>
              <p className="tiny muted" style={{ marginTop: 4 }}>
                {`From our analysis of ${domain}. The top ${Math.min(PRESELECT_COUNT, suggestions.length)} are ticked — untick anything you don't want.`}
              </p>
            </div>
          </div>

          <div
            className="modal-b"
            style={{ maxHeight: 320, display: "flex", flexDirection: "column", gap: 2, padding: "12px 14px" }}
          >
            {suggestions.map((s) => {
              const on = picked.has(s.keyword)
              return (
                <label
                  key={s.keyword}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "7px 8px", borderRadius: 8,
                    cursor: saving ? "default" : "pointer",
                    background: on ? "var(--brand-soft)" : "transparent",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={saving}
                    onChange={() => toggle(s.keyword)}
                    style={{ width: 15, height: 15, accentColor: "var(--brand)", flexShrink: 0 }}
                  />
                  <span
                    title={s.rationale ?? s.keyword}
                    style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {s.keyword}
                  </span>
                  {s.volume != null && (
                    <span className="tiny muted" style={{ fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                      {formatVolume(s.volume)}/mo
                    </span>
                  )}
                </label>
              )
            })}
          </div>

          {error && (
            <p className="tiny" style={{ margin: 0, padding: "0 22px 10px", color: "var(--neg)" }}>{error}</p>
          )}

          <div className="modal-f" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <button
              type="button"
              disabled={saving}
              onClick={() => setPicked(allPicked ? new Set() : new Set(suggestions.map((s) => s.keyword)))}
              style={{ background: "none", border: "none", padding: 0, color: "var(--brand)", cursor: "pointer", fontWeight: 500, fontSize: 12 }}
            >
              {allPicked ? "Clear all" : `Select all ${suggestions.length}`}
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                size="sm"
                variant="outline"
                className="h-9 text-[13px] hover:bg-muted hover:text-foreground"
                disabled={saving}
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-9 gap-1.5 text-[13px]"
                disabled={saving || picked.size === 0}
                onClick={() => void submit()}
              >
                {saving && <Loader2 className="size-3.5 animate-spin" />}
                {saving ? "Adding…" : `Track ${picked.size} keyword${picked.size === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function KeywordSetupCard({
  projectId, domain, onStatus, onAdded,
}: {
  projectId: string
  domain: string
  /** Reports whether an analysis is in flight, so the Next steps card can show
   *  the same spinner without a second poller on the same endpoint. */
  onStatus?: (running: boolean) => void
  /** Keywords were just added from the picker — the page refetches instead of
   *  waiting out its five-second poll to notice. */
  onAdded?: () => void
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
  // The shortlist picker, open on the dashboard — see KeywordPicker above.
  const [picking, setPicking] = useState(false)
  const [graceOver, setGraceOver] = useState(false)
  const graceOverRef = useRef(false)
  const onStatusRef = useRef(onStatus)
  onStatusRef.current = onStatus
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

  useEffect(() => {
    const t = setTimeout(() => {
      graceOverRef.current = true
      setGraceOver(true)
    }, RUN_APPEAR_GRACE_MS)
    return () => clearTimeout(t)
  }, [projectId])

  // Ticks once a second while something is running, purely to move the elapsed
  // figure — the one thing guaranteed to change on a job with no percentage.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
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
      setAskDismissed(hasDeclinedKeywordAi(projectId))
    } catch {
      setAskDismissed(false)
    }
  }, [projectId])

  const dismissAsk = useCallback(() => {
    setAskDismissed(true)
    try {
      declineKeywordAi(projectId)
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
      if (statusRef.current && IN_FLIGHT.has(statusRef.current)) return void load()
      // Still waiting for the auto-started run to show up. Not worth polling
      // for at all when the owner declined one — there is nothing to find.
      if (!statusRef.current && !graceOverRef.current && !hasDeclinedKeywordAi(projectId)) void load()
    }, POLL_MS)
    return () => clearInterval(t)
  }, [load, setAwaiting, projectId])

  // Derived above the early return, because the effect that reports upward is
  // a hook and hooks cannot follow a conditional return.
  const working = starting || awaitingRun || (!!run && IN_FLIGHT.has(run.status))
  const idle = !working && !run
  /**
   * No run yet, and it is too early to conclude there won't be one.
   *
   * The grace period exists because project-create used to start a run
   * server-side: "no run" meant "the row has not appeared yet", and saying so
   * beat an empty card that flickered into a spinner a second later.
   *
   * That stopped being true when suggestions became opt-in. For someone who
   * chose "I'll add my own" no run is ever coming, so the grace period had
   * nothing to wait for and the card announced "Starting keyword analysis…"
   * for a run the server had correctly declined to start. Worse, the timer
   * restarts on mount — so it came back every time they returned to Overview.
   *
   * askDismissed === true means they declined. Nothing is pending; say nothing.
   */
  const waitingForRun = idle && !graceOver && askDismissed !== true
  const runStartedAt = run?.createdAt ? new Date(run.createdAt).getTime() : null
  const runElapsed = runStartedAt && Number.isFinite(runStartedAt) ? now - runStartedAt : null
  const busy = working || waitingForRun

  // One place tells the page whether work is in flight, so every path that
  // changes the phase — a poll, a manual start, the grace window expiring — is
  // covered without each one remembering to report.
  useEffect(() => {
    onStatusRef.current?.(busy)
  }, [busy])

  // The card unmounts the moment the analysis lands keywords on the project, so
  // without this the page would hold "analysing" true forever after a success.
  useEffect(() => () => onStatusRef.current?.(false), [])

  // What this run actually produced. A COMPLETED run with an empty list is a
  // real outcome — the crawl found nothing to suggest, or the account had no
  // credits for the analysis — so every use of this checks the length rather
  // than assuming a completed run has keywords in it.
  const shortlist = run?.suggestions?.suggestions ?? []
  const shortlistLocation = run?.suggestions?.location ?? "in"

  if (loading) return <Skeleton className="h-24 w-full rounded-lg" />



  // Nothing to report in place — the offer is a dialog now, not a card.
  if (idle && !waitingForRun) {
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
      {working || waitingForRun ? (
        <>
          <div className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold">
            <Sparkles className="size-4 text-primary" />
            {waitingForRun ? "Starting keyword analysis…" : "Finding your keywords…"}
          </div>
          <Stripe />
          <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
            {/* Written for what actually happens: adding a project starts this
                by itself, so the copy reports work rather than describing an
                option. */}
            We&apos;re reading <span className="font-medium text-foreground">{domain}</span>, working out the keywords
            it should rank for, and checking where it stands today. This usually takes a minute or two — you can leave
            this page, it keeps running in the background.
          </p>
          {runElapsed != null && (
            <p className="mt-2 text-xs tabular-nums text-muted-foreground">{elapsedLabel(runElapsed)} elapsed</p>
          )}
        </>
      ) : run?.status === "COMPLETED" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold">Your keywords are ready to pick</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {shortlist.length > 0
                ? `We analysed ${domain} and shortlisted ${shortlist.length} keyword${shortlist.length === 1 ? "" : "s"} worth tracking. Pick the ones you want and we'll start checking their rank.`
                : `We analysed ${domain}. Add the keywords you want and we'll start checking their rank.`}
            </p>
          </div>
          {shortlist.length > 0 ? (
            // Opens the list right here. This was a link to the rank tracker —
            // a page for keywords you already track — so the button that
            // promised a choice spent the click on a page change and then asked
            // for the same choice again.
            <Button size="sm" className="h-8 text-xs" onClick={() => setPicking(true)}>Choose keywords</Button>
          ) : (
            // The run finished with nothing to offer. There is no choice to
            // make, so this is honestly a link to the manual box.
            <Button asChild size="sm" className="h-8 text-xs">
              <Link href={`/dashboard/project/${projectId}/keywords?add=1`}>Add keywords</Link>
            </Button>
          )}
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
            <Button asChild size="sm" className="h-8 text-xs"><Link href={`/dashboard/project/${projectId}/keywords?add=1`}>Add keywords</Link></Button>
          </div>
        </div>
      ) : null}

      {picking && shortlist.length > 0 && (
        <KeywordPicker
          projectId={projectId}
          domain={domain}
          suggestions={shortlist}
          location={shortlistLocation}
          onClose={() => setPicking(false)}
          onAdded={() => { setPicking(false); onAdded?.() }}
        />
      )}
    </section>
  )
}
