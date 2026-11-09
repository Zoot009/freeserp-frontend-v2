"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, Loader2, Printer, XCircle } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { api } from "@/lib/api"
import { isRunning as gbpRunning, type GbpAuditResponse } from "@/lib/gbp-audit"
import { isRunning as aeoRunning, type AeoReport } from "@/lib/aeo"
import { DELIVERABLES, readRunIds, type Deliverable, type GbpPost, type RunIds } from "@/lib/report-builder"
import {
  AeoSection,
  AiPostSection,
  CitationsSection,
  DirectionsSection,
  GbpPlanSection,
  Pending,
  Section,
  SiteAuditSection,
  type IssueGroup,
  type SiteReport,
} from "@/components/report-builder/sections"

const POLL_MS = 5000

type Run<T> = { state: "idle" | "running" | "done" | "failed"; data?: T; error?: string }

const PROMISES: Record<Deliverable, string> = {
  citations: "Three local listings we'll create first, ready to submit with your exact business details.",
  gbpPlan: "Your Google Business Profile audit: the overall recommendation, the 30-day plan and every fix.",
  aiPost: "A sample of the Google Posts we'll write and publish for you, every day.",
  directions: "Driving routes from your top competitors to you, which we'll build and add for you.",
  siteAudit: "Everything our crawler found on your website, which we'll fix for you.",
  aeo: "How AI assistants see your business, and what to fix first so they recommend you.",
}

export default function ReportBuilderReport() {
  const { user, loading } = useAuth()
  const [ids, setIds] = useState<RunIds | null>(null)
  const [gbp, setGbp] = useState<Run<GbpAuditResponse>>({ state: "idle" })
  const [site, setSite] = useState<Run<{ report: SiteReport; groups: IssueGroup[] }>>({ state: "idle" })
  const [aeo, setAeo] = useState<Run<AeoReport>>({ state: "idle" })
  const [post, setPost] = useState<GbpPost | null>(null)
  const [writing, setWriting] = useState(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true // re-armed on every mount: React mounts twice in development
    setIds(readRunIds(window.location.search))
    return () => {
      alive.current = false
    }
  }, [])

  // Follow each run until it finishes.
  useEffect(() => {
    if (!ids || !user?.inhouse) return
    const timers: ReturnType<typeof setTimeout>[] = []
    const later = (fn: () => void) => timers.push(setTimeout(fn, POLL_MS))

    const loadGbp = async () => {
      try {
        const d = await api.get<GbpAuditResponse>(`/api/gbp-audit/${ids.gbp}`)
        if (!alive.current) return
        if (gbpRunning(d.audit.status)) {
          setGbp({ state: "running", data: d })
          later(loadGbp)
        } else if (d.audit.status === "FAILED" || !d.facts) setGbp({ state: "failed", error: d.audit.error ?? "The Google Maps audit failed." })
        else setGbp({ state: "done", data: d })
      } catch (e) {
        setGbp({ state: "failed", error: e instanceof Error ? e.message : "Couldn't load the Google Maps audit." })
      }
    }
    const loadSite = async () => {
      try {
        const job = await api.get<{ state: string; progress: number; reportId: string | null; error?: string | null }>(`/api/page-audit/jobs/${ids.siteJob}`)
        if (!alive.current) return
        if (job.state === "completed" && job.reportId) {
          const [report, issues] = await Promise.all([
            api.get<SiteReport>(`/api/page-audit/reports/${job.reportId}`),
            api.get<{ groups: IssueGroup[] }>(`/api/page-audit/reports/${job.reportId}/issue-groups`),
          ])
          setSite({ state: "done", data: { report, groups: issues.groups } })
        } else if (job.state === "failed") setSite({ state: "failed", error: job.error ?? "The website audit failed." })
        else {
          setSite({ state: "running" })
          later(loadSite)
        }
      } catch (e) {
        setSite({ state: "failed", error: e instanceof Error ? e.message : "Couldn't load the website audit." })
      }
    }
    const loadAeo = async () => {
      try {
        const { report } = await api.get<{ report: AeoReport }>(`/api/aeo-audit/${ids.aeo}`)
        if (!alive.current) return
        if (aeoRunning(report.audit.status)) {
          setAeo({ state: "running" })
          later(loadAeo)
        } else if (report.audit.status === "FAILED") setAeo({ state: "failed", error: report.audit.error ?? "The AEO audit failed." })
        else setAeo({ state: "done", data: report })
      } catch (e) {
        setAeo({ state: "failed", error: e instanceof Error ? e.message : "Couldn't load the AEO audit." })
      }
    }
    if (ids.gbp) void loadGbp()
    if (ids.siteJob) void loadSite()
    if (ids.aeo) void loadAeo()
    return () => timers.forEach(clearTimeout)
  }, [ids, user?.inhouse])

  // The AI post, once the Maps audit it's written from is in.
  const writePost = async (regenerate = false) => {
    if (!ids?.gbp) return
    setWriting(true)
    try {
      const { post } = await api.post<{ post: GbpPost }>("/api/report-builder/post", { gbpAuditId: ids.gbp, regenerate })
      if (alive.current) setPost(post)
    } catch {
      /* the section says it's still writing; the retry link stays */
    } finally {
      if (alive.current) setWriting(false)
    }
  }
  useEffect(() => {
    if (gbp.state === "done" && ids?.sel.includes("aiPost") && !post && !writing) void writePost()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gbp.state])

  if (loading || !ids) return null
  if (!user?.inhouse) {
    return (
      <div className="page">
        <p className="text-[13px] text-muted-foreground">This page isn&apos;t available for this account.</p>
      </div>
    )
  }

  const business = gbp.data?.facts?.business.name ?? (site.data?.report.url ? new URL(site.data.report.url).hostname.replace(/^www\./, "") : aeo.data?.host) ?? "Your business"
  const runFor = (d: Deliverable) => (d === "siteAudit" ? site : d === "aeo" ? aeo : gbp)
  const steps = ids.sel.map((d) => ({ d, run: runFor(d) }))
  const allDone = steps.every((s) => s.run.state === "done" || s.run.state === "failed")
  const title = (d: Deliverable) => DELIVERABLES.find((x) => x.key === d)!.title

  const body = (d: Deliverable, i: number) => {
    const run = runFor(d)
    const inner =
      run.state === "failed" ? (
        <p className="text-[13px] text-red-500">{run.error}</p>
      ) : run.state !== "done" ? (
        <Pending what={d === "siteAudit" ? "Crawling the website" : d === "aeo" ? "Asking the AI assistants" : "Auditing the Google Business Profile"} detail="This section fills in by itself." />
      ) : d === "citations" ? (
        <CitationsSection data={gbp.data!} />
      ) : d === "gbpPlan" ? (
        <GbpPlanSection data={gbp.data!} />
      ) : d === "aiPost" ? (
        <AiPostSection data={gbp.data!} post={post} onRegenerate={() => writePost(true)} busy={writing} />
      ) : d === "directions" ? (
        <DirectionsSection data={gbp.data!} />
      ) : d === "siteAudit" ? (
        <SiteAuditSection report={site.data!.report} groups={site.data!.groups} />
      ) : (
        <AeoSection report={aeo.data!} />
      )
    return (
      <Section key={d} n={i + 1} title={title(d)} promise={PROMISES[d]}>
        {inner}
      </Section>
    )
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

      {/* Cover */}
      <header className="rounded-2xl border border-border bg-gradient-to-br from-brand/10 via-card to-card p-6 sm:p-8">
        <div className="text-xs font-semibold uppercase tracking-wider text-brand">FreeSERP · Local growth report</div>
        <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-tight">{business}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">Prepared {new Date().toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })}</p>
        <ol className="mt-5 grid gap-2 sm:grid-cols-2">
          {steps.map(({ d, run }, i) => (
            <li key={d} className="flex items-center gap-2 text-[13px]">
              {run.state === "done" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" aria-hidden />
              ) : run.state === "failed" ? (
                <XCircle className="h-4 w-4 shrink-0 text-red-500" aria-hidden />
              ) : (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground print:hidden" aria-hidden />
              )}
              <span>
                {i + 1}. {title(d)}
              </span>
            </li>
          ))}
        </ol>
        {!allDone && <p className="mt-4 text-xs text-muted-foreground print:hidden">The sections fill in as each check finishes, usually within 2 to 6 minutes. You can leave this page open.</p>}
      </header>

      {ids.sel.map((d, i) => body(d, i))}
    </div>
  )
}
