"use client"

/* eslint-disable @typescript-eslint/no-explicit-any -- run payloads are read loosely by the sections */
import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowLeft, Check, CheckCircle2, History, Loader2, Printer, XCircle } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { api, ApiError } from "@/lib/api"
import { def, knownSections, readReport, runsFor, type Deliverable, type GbpPost, type Inputs, type RunKey, type StoredReport } from "@/lib/report-builder"
import { RUNS, domainOf, errorMessage } from "@/components/report-builder/runs"
import { AeoSection, AiPostSection, CitationsSection, DirectionsSection, GbpPlanSection, Pending, Section, SiteAuditSection } from "@/components/report-builder/sections"
import {
  AdsSection,
  AiPromptsSection,
  CompetitorSection,
  KeywordMagicSection,
  KeywordScoreSection,
  LinksSection,
  MapsTrackerSection,
  RankSection,
  SerpSection,
  YoutubeSection,
} from "@/components/report-builder/tool-sections"

// Every run is checked at most once per tick, one after another: a dozen tools
// polled every few seconds from one browser would trip the API's per-IP limit.
const TICK_MS = 10_000

type RunState = { id?: string; state: "waiting" | "running" | "done" | "failed"; data?: any; error?: string }
type Plan = { id: string; createdAt: string; sel: Deliverable[]; inputs: Inputs; cached: boolean; hidden: Deliverable[] }

const PENDING_TEXT: Record<RunKey, string> = {
  gbp: "Auditing the Google Business Profile",
  site: "Crawling the website",
  page: "Auditing the homepage",
  aeo: "Asking the AI assistants about the site",
  serp: "Searching Google",
  rank: "Checking Google rankings",
  maps: "Scanning the grid on Google Maps",
  llm: "Asking ChatGPT, Gemini, Claude and Perplexity",
  ads: "Analysing the site for Google Ads",
  comp: "Comparing with the pages ranking above",
  links: "Mapping the site's internal links",
  magic: "Researching keywords",
  score: "Scoring the homepage for the keyword",
  yt: "Checking YouTube",
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })

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
  const runsRef = useRef(runs)
  runsRef.current = runs
  const started = useRef(new Set<RunKey>())
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
      setPlan({ id: report.id, createdAt: report.createdAt, sel: knownSections(report.sel), inputs: report.inputs, cached, hidden })
    }
    open().catch((e) => {
      if (alive.current) setMissing(e instanceof ApiError && e.status === 404 ? "This report has expired or doesn't exist. Reports are kept for 10 days." : errorMessage(e, "The report couldn't be opened."))
    })
    return () => {
      alive.current = false
    }
  }, [user?.inhouse])

  const setRun = useCallback((k: RunKey, s: RunState) => {
    runsRef.current = { ...runsRef.current, [k]: s }
    setRuns(runsRef.current)
  }, [])

  // The PDF's file name: the business and the report, not the app's page title.
  const titleName = runs.gbp?.data?.facts?.business?.name ?? plan?.inputs.name ?? domainOf(plan?.inputs.web)
  useEffect(() => {
    if (!plan) return
    const before = document.title
    document.title = `${titleName || "Your business"} · Local growth report`
    return () => {
      document.title = before
    }
  }, [plan, titleName])

  // A PDF can't be clicked: rows that fold away (the AEO fixes) print open.
  useEffect(() => {
    let opened: HTMLDetailsElement[] = []
    const open = () => {
      // Added to, not replaced: Chrome can fire beforeprint twice for one print.
      const shut = [...document.querySelectorAll<HTMLDetailsElement>("details:not([open])")].filter((d) => !d.parentElement?.closest("details"))
      shut.forEach((d) => (d.open = true))
      opened = [...opened, ...shut]
    }
    const close = () => {
      opened.forEach((d) => (d.open = false))
      opened = []
    }
    window.addEventListener("beforeprint", open)
    window.addEventListener("afterprint", close)
    return () => {
      window.removeEventListener("beforeprint", open)
      window.removeEventListener("afterprint", close)
    }
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
    const tick = async () => {
      let changed = false
      for (const k of keys) {
        if (!alive.current) return
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
            const id = await runDef.start(plan.inputs, deps)
            setRun(k, { id, state: "running" })
          } catch (e) {
            setRun(k, { state: "failed", error: errorMessage(e, "Couldn't start this check.") })
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
          // A refusal is final; a network blip is retried on the next tick.
          if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 429) {
            setRun(k, { ...r, state: "failed", error: e.message })
            changed = true
          }
        }
      }
      if (changed) persist()
      const open = keys.some((k) => !runsRef.current[k] || ["waiting", "running"].includes(runsRef.current[k]!.state))
      if (open && alive.current) timer = setTimeout(tick, TICK_MS)
    }
    void tick()
    return () => clearTimeout(timer)
  }, [plan, user?.inhouse, setRun, persist])

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

  // The same choices and details, run again from scratch as a new report.
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
  const grid = Number(inputs.grid) || 3
  const titleOf = (d: Deliverable) => (d === "mapsTracker" ? `${def(d).title} (${grid}×${grid} grid)` : def(d).title)
  const allDone = runsFor(sel).every((k) => runs[k]?.state === "done" || runs[k]?.state === "failed")
  const shown = sel.filter((d) => !off.includes(d))
  const numberOf = (d: Deliverable) => (shown.includes(d) ? shown.indexOf(d) + 1 : null)
  const dirty = off.length !== plan.hidden.length || off.some((d) => !plan.hidden.includes(d))
  // Printed pages: A4, and a footer of our own with the business and the page
  // number. The cover page has no top or bottom margin, which leaves no room for
  // the browser's date-and-address header and footer, so Chrome drops them on
  // every page. Its sides match the other pages: Chrome lays every page out at
  // the first page's width.
  const footer = `${business} · Local growth report`.replace(/["\\<>]/g, "")
  const pageCss = `@media print {
  @page { size: A4; margin: 14mm 12mm 16mm;
    @bottom-left { content: "${footer}"; font: 8pt system-ui, sans-serif; color: #71717a; }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt system-ui, sans-serif; color: #71717a; }
  }
  @page cover { margin: 0 12mm; @bottom-left { content: none; } @bottom-right { content: none; } }
}`
  const toggle = (d: Deliverable) => {
    setSaveState("idle")
    setOff((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))
  }

  const content = (d: Deliverable) => {
    const r = runOf(d)
    if (r?.state === "failed") return <p className="text-[13px] text-red-500">{r.error}</p>
    if (r?.state !== "done") return <Pending what={r?.state === "waiting" ? "Waiting for the check it builds on" : PENDING_TEXT[def(d).run]} detail="This section fills in by itself." />
    const data = r.data
    switch (d) {
      case "gbpAudit":
        return (
          <div className="space-y-8">
            <GbpPlanSection data={data} />
            <div>
              <h3 className="mb-3 text-[15px] font-semibold tracking-tight">3 citations we&apos;ll create first</h3>
              <CitationsSection data={data} />
            </div>
          </div>
        )
      case "aiPost":
        return <AiPostSection data={data} post={post} onRegenerate={() => writePost(true)} busy={writing} />
      case "directions":
        return <DirectionsSection data={data} />
      case "mapsTracker":
        return <MapsTrackerSection scan={data} />
      case "rankTracker":
        return <RankSection data={data} />
      case "quickSerp":
        return <SerpSection data={data} />
      case "youtube":
        return <YoutubeSection data={data} />
      case "aiPrompts":
        return <AiPromptsSection data={data} brand={inputs.name ?? business} />
      case "siteAudit":
      case "pageAudit":
        return <SiteAuditSection report={data.report} groups={data.groups} />
      case "ads":
        return <AdsSection data={data} />
      case "competitor":
        return <CompetitorSection analysis={data} />
      case "links":
        return <LinksSection analysis={data} />
      case "aeo":
        return <AeoSection report={data} />
      case "keywordMagic":
        return <KeywordMagicSection data={data} />
      case "keywordScore":
        return <KeywordScoreSection analysis={data} keyword={inputs.kw ?? ""} />
    }
  }

  return (
    <div className="page space-y-8 print:px-[3px]! print:py-0!">
      <style>{pageCss}</style>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/dashboard/report-builder" className="inline-flex items-center gap-1.5 text-[13px] font-medium hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> All reports
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">{!allDone ? "Sections still running print as \u201cin progress\u201d." : "Untick a section to leave it out of the PDF."}</span>
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
          <button type="button" onClick={rebuild} disabled={rebuilding} className="font-medium text-brand hover:underline disabled:opacity-50">
            {rebuilding ? "Starting…" : "Build a fresh one"}
          </button>
        </div>
      )}

      <header className="rounded-2xl border border-border bg-gradient-to-br from-brand/10 via-card to-card p-6 sm:p-8 print:mb-0 print:mt-[12mm] print:flex print:h-[272mm] print:flex-col print:bg-none print:bg-brand/5 print:p-[14mm] print:[page:cover]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 print:gap-3">
            <Image src="/logo.png" alt="FreeSERP" width={44} height={44} className="size-9 rounded-lg object-contain print:size-11" priority />
            <div className="leading-tight">
              <div className="text-[15px] font-semibold tracking-tight print:text-[18px]">FreeSERP</div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-brand">Local growth report</div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Report ID <span className="font-mono font-semibold text-foreground">{plan.id.toUpperCase()}</span>
          </div>
        </div>
        <div className="print:my-auto">
          <h1 className="mt-4 text-[28px] font-semibold leading-tight tracking-tight print:text-[40px]">{business}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground print:mt-3 print:text-[15px]">
            Prepared {day(plan.createdAt)}
            {inputs.web ? ` · ${domainOf(inputs.web)}` : ""}
          </p>
        </div>
        <div className="mb-3 hidden text-xs font-semibold uppercase tracking-wider text-muted-foreground print:block">What&apos;s inside</div>
        <ol className="mt-5 grid gap-2 sm:grid-cols-2 print:mt-0 print:grid-cols-1 print:gap-4 print:border-t print:border-border print:pt-4">
          {sel.map((d) => {
            const s = runOf(d)?.state
            const n = numberOf(d)
            return (
              <li key={d} className={`flex items-center gap-2 text-[13px] print:items-start print:gap-3 ${n ? "" : "text-muted-foreground line-through print:hidden"}`}>
                {s === "done" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400 print:mt-0.5" aria-hidden />
                ) : s === "failed" ? (
                  <XCircle className="h-4 w-4 shrink-0 text-red-500" aria-hidden />
                ) : (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground print:hidden" aria-hidden />
                )}
                <span className="min-w-0">
                  <span className="print:text-[15px] print:font-semibold">
                    {n ? `${n}. ` : ""}
                    {titleOf(d)}
                  </span>
                  <span className="hidden text-[13px] leading-relaxed text-muted-foreground print:mt-0.5 print:block">{def(d).promise}</span>
                </span>
              </li>
            )
          })}
        </ol>
        {!allDone && (
          <p className="mt-4 text-xs text-muted-foreground print:hidden">
            The sections fill in as each tool finishes, usually within 2 to 8 minutes. You can leave this page: the report is saved, and reopening it from the history carries on.
          </p>
        )}
      </header>

      {sel.map((d) => (
        <Section key={d} n={numberOf(d)} title={titleOf(d)} promise={def(d).promise} included={!off.includes(d)} onToggle={() => toggle(d)}>
          {content(d)}
        </Section>
      ))}

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
    </div>
  )
}
