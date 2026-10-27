"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Download, RefreshCw, XCircle } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { api, ApiError } from "@/lib/api"
import { fmtDay, isRunning, type AeoReport, type AuditStatus, type Breakdown } from "@/lib/aeo"
import { Button } from "@/components/ui/button"
import { QuestionChoice } from "@/components/aeo/question-choice"
import {
  AiVisibility,
  Alarm,
  Categories,
  Comparison,
  CrawlSummary,
  EngineReadiness,
  FixList,
  OtherAudits,
  Overview,
  PageDetails,
  Progress,
  ReportHeader,
} from "@/components/aeo/report"

// Consecutive failed polls (5xx / network) tolerated before giving up.
const MAX_POLL_FAILURES = 5
const POLL_MS = 3000

const STATUS: Record<AuditStatus, string> = {
  QUEUED: "Queued",
  CRAWLING: "Crawling the site",
  CHECKING: "Running checks",
  ANALYZING: "Asking the AI engines",
  SCORING: "Scoring",
  COMPLETED: "Finished",
  FAILED: "Failed",
}

export default function AeoAuditReportPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const { user, loading: authLoading } = useAuth()

  const [report, setReport] = useState<AeoReport | null>(null)
  const [error, setError] = useState("")
  const [rerunning, setRerunning] = useState(false)
  const [pdfState, setPdfState] = useState<"idle" | "building" | "failed">("idle")
  // One poll chain at a time: leaving the page or switching audit bumps the generation, so an in-flight poll drops its
  // result instead of rescheduling.
  const pollGenRef = useRef(0)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const failuresRef = useRef(0)

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login")
      return
    }
    if (!authLoading && user && id) load(++pollGenRef.current)
    return () => {
      pollGenRef.current++
      clearTimeout(pollTimerRef.current)
    }
    // user?.id, not user: AuthProvider swaps in a fresh user object after /api/auth/me, which would start a second loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading, id])

  const load = async (gen: number) => {
    try {
      const data = await api.get<{ report: AeoReport }>(`/api/aeo-audit/${id}`)
      if (gen !== pollGenRef.current) return
      failuresRef.current = 0
      setError("")
      setReport(data.report)
      if (isRunning(data.report.audit.status)) pollTimerRef.current = setTimeout(() => load(gen), POLL_MS)
    } catch (err) {
      if (gen !== pollGenRef.current) return
      // A 4xx (not found, no access) won't change by asking again; a 5xx or network blip might.
      const status = err instanceof ApiError ? err.status : 0
      failuresRef.current += 1
      if ((status >= 400 && status < 500) || failuresRef.current > MAX_POLL_FAILURES) {
        setError(status === 404 ? "That audit doesn't exist, or belongs to another account." : err instanceof Error && err.message ? err.message : "Couldn't load this audit.")
        return
      }
      pollTimerRef.current = setTimeout(() => load(gen), POLL_MS + 1000)
    }
  }

  const rerun = async () => {
    if (!report || rerunning) return
    setRerunning(true)
    try {
      const { audit } = await api.post<{ audit: { id: string } }>("/api/aeo-audit", { url: report.audit.origin, pages: report.audit.maxPages })
      router.push(`/dashboard/aeo-audit/${audit.id}`)
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't start the audit. Please try again.")
      setRerunning(false)
    }
  }

  const downloadPdf = async () => {
    if (!report || pdfState === "building") return
    setPdfState("building")
    try {
      // Loaded on demand: the PDF renderer is large, and most visits never ask for a PDF.
      const { downloadReportPdf } = await import("@/components/aeo/report-pdf")
      await downloadReportPdf(report)
      setPdfState("idle")
    } catch {
      setPdfState("failed")
    }
  }

  if (authLoading || !user) return null

  const back = (
    <div className="mb-3">
      <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5 text-[13px]">
        <Link href="/dashboard/aeo-audit">
          <ArrowLeft className="h-4 w-4" /> All AEO audits
        </Link>
      </Button>
    </div>
  )

  if (!report) {
    return (
      <div className="page">
        {back}
        {error ? (
          <div className="grid min-h-[50vh] place-items-center px-6">
            <div className="max-w-sm text-center">
              <XCircle className="mx-auto h-8 w-8 text-destructive" />
              <h2 className="mt-3 text-lg font-semibold">Report unavailable</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{error}</p>
            </div>
          </div>
        ) : (
          <div className="grid min-h-[50vh] place-items-center">
            <div className="text-center">
              <RefreshCw className="mx-auto h-7 w-7 animate-spin text-primary" />
              <p className="mt-3 text-[13px] text-muted-foreground">Loading report…</p>
            </div>
          </div>
        )}
      </div>
    )
  }

  const { audit, site, breakdown, origin, host, pages, findings, fixes, strengths, previous, others, seconds } = report
  const running = isRunning(audit.status)
  const measured = breakdown?.measured ?? []
  const meta = [
    fmtDay(audit.createdAt),
    STATUS[audit.status] + (running ? "… this page updates by itself" : seconds !== null ? ` in ${seconds}s` : ""),
    pages.length ? `${pages.length} pages read` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="page">
      {back}
      <ReportHeader
        origin={audit.origin}
        meta={meta}
        actions={
          !running && (
            <>
              {breakdown && (
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={downloadPdf} disabled={pdfState === "building"}>
                  {pdfState === "building" ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                  {pdfState === "building" ? "Preparing…" : "Download PDF"}
                </Button>
              )}
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={rerun} disabled={rerunning}>
                <RefreshCw className={`h-3 w-3 ${rerunning ? "animate-spin" : ""}`} />
                {rerunning ? "Starting…" : "Run again"}
              </Button>
            </>
          )
        }
      />

      <div className="space-y-5">
        {pdfState === "failed" && <Alarm>Couldn&apos;t create the PDF. Please try again.</Alarm>}
        {error && <Alarm>{error}</Alarm>}
        {running && <Progress status={audit.status} progress={audit.progress} attempts={audit.attempts} maxAttempts={report.maxAttempts} />}
        {running && audit.progress?.choosing && <QuestionChoice auditId={audit.id} until={audit.progress.choosing} />}
        {audit.error && <Alarm>{audit.error}</Alarm>}
        {breakdown && (
          <>
            <Overview report={report as AeoReport & { breakdown: Breakdown }} />
            <FixList fixes={fixes} origin={origin} />
            <AiVisibility measured={measured} host={host.replace(/^www\./, "")} />
            <EngineReadiness engines={breakdown.engines} measured={measured} />
            {previous && <Comparison breakdown={breakdown} previous={previous} />}
            <Categories breakdown={breakdown} fixes={fixes} strengths={strengths} />
          </>
        )}
        {pages.length > 0 && <PageDetails pages={pages} findings={findings} origin={origin} />}
        {site && <CrawlSummary site={site} />}
        <OtherAudits audits={others} />
      </div>
    </div>
  )
}
