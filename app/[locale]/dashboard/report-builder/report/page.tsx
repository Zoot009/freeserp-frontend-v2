"use client"

/* eslint-disable @typescript-eslint/no-explicit-any -- run payloads are read loosely by the sections */
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, Loader2, Printer, XCircle } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { api, ApiError } from "@/lib/api"
import { def, readReport, reportHref, runsFor, type Deliverable, type GbpPost, type Inputs, type RunKey } from "@/lib/report-builder"
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

export default function ReportBuilderReport() {
  const { user, loading } = useAuth()
  const [plan, setPlan] = useState<{ sel: Deliverable[]; inputs: Inputs } | null>(null)
  const [runs, setRuns] = useState<Partial<Record<RunKey, RunState>>>({})
  const [post, setPost] = useState<GbpPost | null>(null)
  const [writing, setWriting] = useState(false)
  const runsRef = useRef(runs)
  runsRef.current = runs
  const started = useRef(new Set<RunKey>())
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true // re-armed on every mount: React mounts twice in development
    const r = readReport(window.location.search)
    setPlan({ sel: r.sel, inputs: r.inputs })
    const initial: Partial<Record<RunKey, RunState>> = {}
    for (const [k, id] of Object.entries(r.ids) as [RunKey, string][]) {
      initial[k] = { id, state: "running" }
      started.current.add(k)
    }
    setRuns(initial)
    return () => {
      alive.current = false
    }
  }, [])

  const setRun = useCallback((k: RunKey, s: RunState) => {
    runsRef.current = { ...runsRef.current, [k]: s }
    setRuns(runsRef.current)
  }, [])

  // Keep the started runs in the address, so a reload follows them instead of starting again.
  const remember = useCallback(() => {
    if (!plan) return
    const ids: Partial<Record<RunKey, string>> = {}
    for (const [k, s] of Object.entries(runsRef.current) as [RunKey, RunState][]) if (s?.id) ids[k] = s.id
    const query = reportHref(plan.sel, plan.inputs, ids).split("?")[1]
    window.history.replaceState(null, "", `${window.location.pathname}?${query}`)
  }, [plan])

  useEffect(() => {
    if (!plan || !user?.inhouse) return
    const keys = runsFor(plan.sel)
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      for (const k of keys) {
        if (!alive.current) return
        const r = runsRef.current[k]
        const runDef = RUNS[k]
        if (!r?.id) {
          if (started.current.has(k)) continue
          const dep = runDef.after ? runsRef.current[runDef.after] : undefined
          if (runDef.after && dep?.state !== "done") {
            if (dep?.state === "failed") setRun(k, { state: "failed", error: "It needed another check that didn't finish." })
            else setRun(k, { state: "waiting" })
            continue
          }
          started.current.add(k)
          try {
            const deps = Object.fromEntries(Object.entries(runsRef.current).map(([key, s]) => [key, s?.data]))
            const id = await runDef.start(plan.inputs, deps)
            setRun(k, { id, state: "running" })
            remember()
          } catch (e) {
            setRun(k, { state: "failed", error: errorMessage(e, "Couldn't start this check.") })
          }
          continue
        }
        if (r.state !== "running") continue
        try {
          const res = await runDef.poll(r.id, plan.inputs)
          if (res.state === "done") setRun(k, { ...r, state: "done", data: res.data })
          else if (res.state === "failed") setRun(k, { ...r, state: "failed", error: res.error })
        } catch (e) {
          // A refusal is final; a network blip is retried on the next tick.
          if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 429) setRun(k, { ...r, state: "failed", error: e.message })
        }
      }
      const open = keys.some((k) => !runsRef.current[k] || ["waiting", "running"].includes(runsRef.current[k]!.state))
      if (open && alive.current) timer = setTimeout(tick, TICK_MS)
    }
    void tick()
    return () => clearTimeout(timer)
  }, [plan, user?.inhouse, setRun, remember])

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

  if (loading || !plan) return null
  if (!user?.inhouse) {
    return (
      <div className="page">
        <p className="text-[13px] text-muted-foreground">This page isn&apos;t available for this account.</p>
      </div>
    )
  }

  const { sel, inputs } = plan
  const business = runs.gbp?.data?.facts?.business?.name ?? inputs.name ?? (domainOf(inputs.web) || "Your business")
  const runOf = (d: Deliverable) => runs[def(d).run]
  const grid = Number(inputs.grid) || 3
  const titleOf = (d: Deliverable) => (d === "mapsTracker" ? `${def(d).title} (${grid}×${grid} grid)` : def(d).title)
  const allDone = runsFor(sel).every((k) => runs[k]?.state === "done" || runs[k]?.state === "failed")

  const content = (d: Deliverable) => {
    const r = runOf(d)
    if (r?.state === "failed") return <p className="text-[13px] text-red-500">{r.error}</p>
    if (r?.state !== "done") return <Pending what={r?.state === "waiting" ? "Waiting for the check it builds on" : PENDING_TEXT[def(d).run]} detail="This section fills in by itself." />
    const data = r.data
    switch (d) {
      case "citations":
        return <CitationsSection data={data} />
      case "gbpPlan":
        return <GbpPlanSection data={data} />
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
    <div className="page space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/dashboard/report-builder" className="inline-flex items-center gap-1.5 text-[13px] font-medium hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> New report
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!allDone}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
          title={allDone ? "Save the whole report as a PDF" : "Available once every section is ready"}
        >
          <Printer className="h-4 w-4" aria-hidden /> Print / PDF
        </button>
      </div>

      <header className="rounded-2xl border border-border bg-gradient-to-br from-brand/10 via-card to-card p-6 sm:p-8">
        <div className="text-xs font-semibold uppercase tracking-wider text-brand">FreeSERP · Local growth report</div>
        <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-tight">{business}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Prepared {new Date().toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })}
          {inputs.web ? ` · ${domainOf(inputs.web)}` : ""}
        </p>
        <ol className="mt-5 grid gap-2 sm:grid-cols-2">
          {sel.map((d, i) => {
            const s = runOf(d)?.state
            return (
              <li key={d} className="flex items-center gap-2 text-[13px]">
                {s === "done" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" aria-hidden />
                ) : s === "failed" ? (
                  <XCircle className="h-4 w-4 shrink-0 text-red-500" aria-hidden />
                ) : (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground print:hidden" aria-hidden />
                )}
                <span>
                  {i + 1}. {titleOf(d)}
                </span>
              </li>
            )
          })}
        </ol>
        {!allDone && <p className="mt-4 text-xs text-muted-foreground print:hidden">The sections fill in as each tool finishes, usually within 2 to 8 minutes. You can leave this page open.</p>}
      </header>

      {sel.map((d, i) => (
        <Section key={d} n={i + 1} title={titleOf(d)} promise={def(d).promise}>
          {content(d)}
        </Section>
      ))}
    </div>
  )
}
