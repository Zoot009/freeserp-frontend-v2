"use client"

/**
 * Page Audit — crawl a URL (or a whole site) with a real browser, run 63 SEO
 * rules over it, and render the report.
 *
 * The report UI itself is the imported package's, dropped in whole
 * (components/page-audit/audit-ui.tsx). This page owns everything around it:
 * the URL form, the job lifecycle, and the wiring to /api/page-audit — the
 * package's own flow went through Next route handlers that read a NextAuth
 * session out of a frontend Prisma client, neither of which exists here. Our
 * api client already carries the JWT, so the browser talks to the backend
 * directly like every other page in this dashboard.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, Search, ShieldAlert } from "lucide-react"
import { Link } from "@/i18n/navigation"
import { api, ApiError } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { AuditReportResults, transformReport, type AuditReport } from "@/components/page-audit/audit-ui"
import { cn } from "@/lib/utils"

type JobState = {
  jobId: string
  state: string
  progress: number
  reportId: string | null
  status: "PROCESSING" | "COMPLETED" | "FAILED"
  error: string | null
}

/** How often to ask the backend where the crawl has got to. */
const POLL_MS = 2500
/**
 * Give up polling after this long.
 *
 * A site-mode crawl is a real browser walking up to 100 pages, so the ceiling
 * has to be generous — but not unbounded, or a wedged job leaves the page
 * spinning forever with no way to tell the user anything useful.
 */
const POLL_TIMEOUT_MS = 15 * 60_000

/** Page allowance for this account. Free gets 100, any paid plan 500. */
type Limits = { maxPages: number; planMaxPages: number; maxConcurrent: number; plan: string }

const MODES = [
  { id: "single", label: "This page", hint: "Audit one URL" },
  { id: "site", label: "Whole site", hint: "Crawl outward from this URL" },
] as const

export default function PageAuditPage() {
  const [url, setUrl] = useState("")
  const [mode, setMode] = useState<"single" | "site">("single")
  const [job, setJob] = useState<JobState | null>(null)
  const [report, setReport] = useState<AuditReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [limits, setLimits] = useState<Limits | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAt = useRef(0)

  // Non-fatal: without it the form just doesn't name a page count, and the
  // server clamps to the plan budget regardless.
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
  }, [])

  useEffect(() => stopPolling, [stopPolling])

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
      if (Date.now() - startedAt.current > POLL_TIMEOUT_MS) {
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
        }
      } catch {
        // A single failed poll is not a failed audit — the next tick retries.
        // Only the timeout above ends it.
      }
    },
    [loadReport, stopPolling],
  )

  const start = async () => {
    if (!url.trim() || starting) return
    setStarting(true)
    setError(null)
    setReport(null)
    setJob(null)
    try {
      const res = await api.post<{ jobId: string }>("/api/page-audit", { url: url.trim(), mode })
      startedAt.current = Date.now()
      setJob({ jobId: res.jobId, state: "waiting", progress: 0, reportId: null, status: "PROCESSING", error: null })
      stopPolling()
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

  const reset = () => {
    stopPolling()
    setReport(null)
    setJob(null)
    setError(null)
  }

  // ── Finished: hand over to the package's report UI ──
  if (report) {
    return (
      <div className="px-6 pb-10 pt-5">
        <AuditReportResults report={report} onNewAudit={reset} isAuthenticated />
      </div>
    )
  }

  const running = !!job && job.status === "PROCESSING"

  return (
    <div className="flex flex-col gap-5 px-6 pb-10 pt-5">
      <div>
        <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em]">Page Audit</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Loads your page in a real browser and runs 63 SEO checks over it — technical, on-page,
          performance, accessibility, structured data and security.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              disabled={running}
              title={m.hint}
              className={cn(
                "rounded-[7px] px-3 py-1.5 text-[13px] transition-colors disabled:opacity-50",
                mode === m.id ? "bg-primary font-semibold text-primary-foreground" : "bg-muted font-medium text-muted-foreground hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
          <span className="text-xs text-muted-foreground">
            {mode === "site" && limits
              ? `Crawls up to ${limits.maxPages.toLocaleString()} pages on your plan`
              : MODES.find((m) => m.id === mode)!.hint}
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
            placeholder="example.com or https://example.com/pricing"
            disabled={running}
            className="min-w-[16rem] flex-1"
            inputMode="url"
            autoComplete="url"
          />
          <Button type="submit" disabled={running || starting || !url.trim()} className="gap-1.5">
            {running || starting ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            {running ? "Auditing…" : starting ? "Starting…" : "Run audit"}
          </Button>
        </form>

        {error && (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-[13px] leading-relaxed">{error}</p>
          </div>
        )}
      </div>

      {running && (
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[15px] font-semibold">Auditing {url}</span>
            <span className="text-[13px] tabular-nums text-muted-foreground">{Math.round(job.progress)}%</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-700"
              style={{ width: `${Math.max(4, job.progress)}%` }}
            />
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
            {mode === "site"
              ? "Crawling your site in a real browser, then scoring every page. This takes a few minutes — you can leave this page and come back."
              : "Loading the page in a real browser and running the checks. This usually takes under a minute."}
          </p>
          <div className="mt-4 space-y-2">
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        </div>
      )}
    </div>
  )
}
