"use client"

/* eslint-disable @typescript-eslint/no-explicit-any -- run payloads are read loosely by the sections */
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Check, History, Loader2, Printer, RefreshCw, Share2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useAuth } from "@/lib/auth"
import { api, ApiError, errorReason, isTransient } from "@/lib/api"
import { def, knownSections, readReport, runsFor, type Deliverable, type GbpPost, type Inputs, type RunKey, type StoredReport } from "@/lib/report-builder"
import { RUNS, domainOf } from "@/components/report-builder/runs"
import { ReportDocument, day, type RunState } from "@/components/report-builder/report-document"
import { ShareAuditDialog } from "@/components/gbp-audit/share-dialog"

// Every run is checked at most once per tick, one after another: a dozen tools
// polled every few seconds from one browser would trip the API's per-IP limit.
const TICK_MS = 10_000
/** Starting a check is tried this many times when it fails on a blip, then it shows as failed. */
const START_TRIES = 3

type Plan = { id: string; createdAt: string; expiresAt: string; sel: Deliverable[]; inputs: Inputs; cached: boolean; hidden: Deliverable[]; shareToken: string | null; fresh: boolean }

export default function ReportBuilderReport() {
  const { user, loading } = useAuth()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [missing, setMissing] = useState("")
  const [runs, setRuns] = useState<Partial<Record<RunKey, RunState>>>({})
  const [post, setPost] = useState<GbpPost | null>(null)
  const [writing, setWriting] = useState(false)
  const [rebuilding, setRebuilding] = useState(false)
  // Sections ticked off on screen; `plan.hidden` is what's saved.
  const [off, setOff] = useState<Deliverable[]>([])
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [shareOpen, setShareOpen] = useState(false)
  const [freshOpen, setFreshOpen] = useState(false)
  const runsRef = useRef(runs)
  runsRef.current = runs
  const started = useRef(new Set<RunKey>())
  // Tries at starting each check: a blip is retried, up to START_TRIES.
  const startTries = useRef(new Map<RunKey, number>())
  // Bumped to restart the checks' loop after it has settled (a section tried again).
  const [kick, setKick] = useState(0)
  const alive = useRef(true)
  const saving = useRef<Promise<unknown>>(Promise.resolve())

  // Open the stored report; an older link with everything in its address is stored first.
  useEffect(() => {
    alive.current = true // re-armed on every mount: React mounts twice in development
    if (!user?.inhouse) return
    const q = new URLSearchParams(window.location.search)
    const open = async () => {
      let report: StoredReport
      let cached = q.get("cached") === "1"
      if (q.get("id")) {
        report = (await api.get<{ report: StoredReport }>(`/api/report-builder/reports/${encodeURIComponent(q.get("id")!)}`)).report
      } else {
        const old = readReport(window.location.search)
        if (!old.sel.length) throw new ApiError("No report was chosen.", 404)
        const r = await api.post<{ report: StoredReport; reused: boolean }>("/api/report-builder/reports", old)
        report = r.report
        cached = r.reused
        window.history.replaceState(null, "", `${window.location.pathname}?id=${report.id}`)
      }
      if (!alive.current) return
      const initial: Partial<Record<RunKey, RunState>> = {}
      for (const [k, id] of Object.entries(report.ids) as [RunKey, string][]) {
        initial[k] = { id, state: "running" }
        started.current.add(k)
      }
      // A run that couldn't start stays failed, rather than starting again on every visit.
      for (const [k, error] of Object.entries(report.errors) as [RunKey, string][]) {
        if (initial[k]) continue
        initial[k] = { state: "failed", error }
        started.current.add(k)
      }
      runsRef.current = initial
      setRuns(initial)
      const hidden = knownSections(report.hidden ?? [])
      setOff(hidden)
      setPlan({ id: report.id, createdAt: report.createdAt, expiresAt: report.expiresAt, sel: knownSections(report.sel), inputs: report.inputs, cached, hidden, shareToken: report.shareToken ?? null, fresh: report.fresh === true })
    }
    open().catch((e) => {
      if (alive.current) setMissing(e instanceof ApiError && e.status === 404 ? "This report has expired or doesn't exist. Reports are kept for 30 days." : errorReason(e, "The report couldn't be opened."))
    })
    return () => {
      alive.current = false
    }
  }, [user?.inhouse])

  const setRun = useCallback((k: RunKey, s: RunState) => {
    runsRef.current = { ...runsRef.current, [k]: s }
    setRuns(runsRef.current)
  }, [])

  // Store the runs' ids and outcomes with the report, one save after another so
  // an older view never lands last.
  const persist = useCallback(() => {
    if (!plan) return
    const ids: Record<string, string> = {}
    const status: Record<string, "done" | "failed"> = {}
    const errors: Record<string, string> = {}
    for (const [k, s] of Object.entries(runsRef.current) as [RunKey, RunState][]) {
      if (s.id) ids[k] = s.id
      if (s.state === "done" || s.state === "failed") status[k] = s.state
      if (s.state === "failed" && s.error) errors[k] = s.error.slice(0, 500)
    }
    const business = runsRef.current.gbp?.data?.facts?.business?.name ?? plan.inputs.name ?? null
    saving.current = saving.current.then(() => api.patch(`/api/report-builder/reports/${plan.id}`, { ids, status, errors, business }).catch(() => undefined))
  }, [plan])

  useEffect(() => {
    if (!plan || !user?.inhouse) return
    const keys = runsFor(plan.sel)
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    const tick = async () => {
      let changed = false
      for (const k of keys) {
        if (!alive.current || stopped) return
        const r = runsRef.current[k]
        const runDef = RUNS[k]
        if (!r?.id) {
          if (started.current.has(k)) continue
          const dep = runDef.after ? runsRef.current[runDef.after] : undefined
          if (runDef.after && dep?.state !== "done") {
            if (dep?.state === "failed") {
              setRun(k, { state: "failed", error: "It needed another check that didn't finish." })
              changed = true
            } else setRun(k, { state: "waiting" })
            continue
          }
          started.current.add(k)
          try {
            const deps = Object.fromEntries(Object.entries(runsRef.current).map(([key, s]) => [key, s?.data]))
            const id = await runDef.start(plan.inputs, deps, plan.fresh)
            setRun(k, { id, state: "running" })
          } catch (e) {
            const tries = (startTries.current.get(k) ?? 0) + 1
            startTries.current.set(k, tries)
            if (isTransient(e) && tries < START_TRIES) {
              // No connection, a timeout, a rate limit: start it again on the next tick.
              started.current.delete(k)
              continue
            }
            setRun(k, { state: "failed", error: errorReason(e, "This check couldn't start.") })
          }
          changed = true
          continue
        }
        if (r.state !== "running") continue
        try {
          const res = await runDef.poll(r.id, plan.inputs)
          if (res.state === "done") setRun(k, { ...r, state: "done", data: res.data })
          else if (res.state === "failed") setRun(k, { ...r, state: "failed", error: res.error })
          changed ||= res.state !== "running"
        } catch (e) {
          // A refusal is final; a blip is retried on the next tick.
          if (!isTransient(e)) {
            setRun(k, { ...r, state: "failed", error: errorReason(e, "This check stopped answering.") })
            changed = true
          }
        }
      }
      if (changed) persist()
      const open = keys.some((k) => !runsRef.current[k] || ["waiting", "running"].includes(runsRef.current[k]!.state))
      if (open && alive.current) timer = setTimeout(tick, TICK_MS)
    }
    void tick()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [plan, user?.inhouse, setRun, persist, kick])

  // A failed section, tried again: its check (and any check that was waiting on
  // it) starts over, as if it had never run.
  const retry = useCallback(
    (d: Deliverable) => {
      const k = def(d).run
      const next = { ...runsRef.current }
      for (const key of Object.keys(RUNS) as RunKey[]) {
        if (key !== k && !(RUNS[key].after === k && next[key]?.state === "failed")) continue
        delete next[key]
        started.current.delete(key)
        startTries.current.delete(key)
      }
      runsRef.current = next
      setRuns(next)
      persist()
      setKick((n) => n + 1)
    },
    [persist],
  )

  // The AI post, once the Maps audit it's written from is in.
  const gbpRun = runs.gbp
  const writePost = useCallback(
    async (regenerate = false) => {
      if (!gbpRun?.id) return
      setWriting(true)
      try {
        const res = await api.post<{ post: GbpPost }>("/api/report-builder/post", { gbpAuditId: gbpRun.id, regenerate })
        if (alive.current) setPost(res.post)
      } catch {
        /* the section keeps its "writing" note and the retry link */
      } finally {
        if (alive.current) setWriting(false)
      }
    },
    [gbpRun?.id],
  )
  useEffect(() => {
    if (gbpRun?.state === "done" && plan?.sel.includes("aiPost") && !post && !writing) void writePost()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gbpRun?.state])

  // Which sections go to the client, saved with the report.
  const saveSections = () => {
    if (!plan) return
    const hidden = off
    setSaveState("saving")
    // Queued behind the page's own saves: the server merges each into what it last stored.
    const done = saving.current.then(() => api.patch(`/api/report-builder/reports/${plan.id}`, { hidden }))
    saving.current = done.catch(() => undefined)
    done.then(
      () => {
        if (!alive.current) return
        setPlan((p) => (p ? { ...p, hidden } : p))
        setSaveState("saved")
        setTimeout(() => alive.current && setSaveState((s) => (s === "saved" ? "idle" : s)), 1800)
      },
      () => alive.current && setSaveState("error"),
    )
  }

  // The same choices and details, run again from scratch as a new report: every
  // tool starts over, past its own cache (the crawl, the profile, the rankings).
  const rebuild = async () => {
    if (!plan) return
    setRebuilding(true)
    try {
      const r = await api.post<{ report: StoredReport }>("/api/report-builder/reports", { sel: plan.sel, inputs: plan.inputs, fresh: true })
      window.location.assign(`${window.location.pathname}?id=${r.report.id}`)
    } catch {
      setRebuilding(false)
    }
  }

  if (loading) return null
  if (!user?.inhouse) {
    return (
      <div className="page">
        <p className="text-[13px] text-muted-foreground">This page isn&apos;t available for this account.</p>
      </div>
    )
  }
  if (missing) {
    return (
      <div className="page space-y-3">
        <p className="text-[13px] text-muted-foreground">{missing}</p>
        <Link href="/dashboard/report-builder" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Build a report
        </Link>
      </div>
    )
  }
  if (!plan) return null

  const { sel, inputs } = plan
  const business = runs.gbp?.data?.facts?.business?.name ?? inputs.name ?? (domainOf(inputs.web) || "Your business")
  const runOf = (d: Deliverable) => runs[def(d).run]
  const allDone = runsFor(sel).every((k) => runs[k]?.state === "done" || runs[k]?.state === "failed")
  const shown = sel.filter((d) => !off.includes(d))
  const dirty = off.length !== plan.hidden.length || off.some((d) => !plan.hidden.includes(d))
  const toggle = (d: Deliverable) => {
    setSaveState("idle")
    setOff((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))
  }
  // What a shared link shows: every finished run's data, by run, and the sample post.
  const shareCopy = () => ({
    data: Object.fromEntries(Object.entries(runs).flatMap(([k, r]) => (r?.state === "done" ? [[k, r.data]] : []))),
    post,
  })

  return (
    <div className="page space-y-8 print:px-[3px]! print:py-0!">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/dashboard/report-builder" className="inline-flex items-center gap-1.5 text-[13px] font-medium hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> All reports
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">{!allDone ? "Sections still running print as \u201cin progress\u201d." : "Untick a section to leave it out of the PDF."}</span>
          <button
            type="button"
            onClick={() => setFreshOpen(true)}
            disabled={rebuilding}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-50"
            title="Crawl the website and run every check again, without saved results"
          >
            <RefreshCw className={`h-4 w-4 ${rebuilding ? "animate-spin" : ""}`} aria-hidden /> {rebuilding ? "Starting…" : "Run fresh"}
          </button>
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            disabled={!allDone}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            title={allDone ? "A link the client can open without an account" : "Sharing opens once every section has finished"}
          >
            <Share2 className="h-4 w-4" aria-hidden /> {plan.shareToken ? "Shared" : "Share"}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-deep"
            title="Save the whole report as a PDF: choose “Save as PDF” in the print window"
          >
            <Printer className="h-4 w-4" aria-hidden /> Print / PDF
          </button>
        </div>
      </div>

      {plan.cached && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/30 bg-brand/5 px-4 py-3 text-[13px] print:hidden">
          <span className="flex items-center gap-2">
            <History className="h-4 w-4 shrink-0 text-brand" aria-hidden />
            Opened from history: this report was built on {day(plan.createdAt)} with the same details, so nothing ran again.
          </span>
          <button type="button" onClick={() => setFreshOpen(true)} disabled={rebuilding} className="font-medium text-brand hover:underline disabled:opacity-50">
            {rebuilding ? "Starting…" : "Run everything fresh"}
          </button>
        </div>
      )}

      <ReportDocument
        id={plan.id}
        createdAt={plan.createdAt}
        sel={sel}
        inputs={inputs}
        business={business}
        runOf={runOf}
        post={post}
        off={off}
        onToggle={toggle}
        onRegenerate={() => writePost(true)}
        writing={writing}
        onRetry={retry}
      />

      {/* Unsaved section choices: a bar floating at the foot of the screen until they're saved or reset. */}
      {(dirty || saveState !== "idle") && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 print:hidden">
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-white/10 bg-zinc-900 py-2 pl-5 pr-2 text-white shadow-2xl animate-in fade-in slide-in-from-bottom-4 dark:bg-zinc-800">
            <span className="flex items-center gap-2 text-[13px] font-medium">
              {saveState === "saved" ? (
                <>
                  <Check className="h-4 w-4 text-green-400" aria-hidden /> Saved
                </>
              ) : saveState === "error" ? (
                "Couldn\u2019t save. Try again."
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden />
                  Unsaved changes · {shown.length} of {sel.length} sections in the report
                </>
              )}
            </span>
            {dirty && (
              <>
                <button type="button" onClick={() => setOff(plan.hidden)} className="h-8 rounded-lg px-3 text-[13px] font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white">
                  Reset
                </button>
                <button
                  type="button"
                  onClick={saveSections}
                  disabled={saveState === "saving"}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
                >
                  {saveState === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />} Save
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={freshOpen} onOpenChange={setFreshOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run every check again from scratch?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  This crawls {inputs.web ? domainOf(inputs.web) : "the website"} once again and re-runs every section of this report, the Google Business Profile, the
                  rankings and the rest, instead of using saved results.
                </p>
                <p>It builds a new report with a new ID and takes about 2 to 8 minutes. This report stays in the history.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={rebuild}>Yes, run everything again</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ShareAuditDialog
        auditId={plan.id}
        apiPath="/api/report-builder/reports"
        sharePath="/share/report"
        body={shareCopy}
        expiresAt={plan.expiresAt}
        shareToken={plan.shareToken}
        open={shareOpen}
        onOpenChange={setShareOpen}
        onChange={(token) => setPlan((p) => (p ? { ...p, shareToken: token } : p))}
      />
    </div>
  )
}
