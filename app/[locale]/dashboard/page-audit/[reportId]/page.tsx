"use client"

/**
 * A single saved audit report, on its own URL.
 *
 * Having a real route per report is what makes the history table clickable, the
 * browser back button work, and a report linkable to a colleague who has an
 * account. (The public, no-account version is /audit/shared/<token>.)
 *
 * One route for both kinds of report. A finished audit is a document — which
 * form started it only decides where the "back" link points, which is why that
 * href follows the report's own mode rather than the route it sits on.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { AlertCircle, ArrowLeft, RefreshCw, XCircle } from "lucide-react"
import { Link, useRouter } from "@/i18n/navigation"
import { api, ApiError } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { CreditBalance } from "@/components/dashboard/credit-balance"
import {
  AuditReportResults,
  transformReport,
  type AuditReport,
} from "@/components/page-audit/audit-ui"
import { SiteIssues } from "@/components/page-audit/site-issues"

/** How often to re-read a report that is still changing. */
const POLL_MS = 5000
/**
 * When to stop re-reading it.
 *
 * PageSpeed normally lands within a couple of minutes, and a report is
 * PROCESSING only while its pages are being written. One still unchanged after
 * ten minutes is stuck, and a tab left open on it would otherwise poll forever.
 */
const POLL_LIMIT_MS = 10 * 60_000

/**
 * The new copy of the report, keeping the previous link graph if it's unchanged.
 *
 * Every poll parses a fresh report, and the internal-link graph rebuilds its
 * force layout — and re-fits its zoom — whenever its nodes and edges change
 * identity. The graph is written once, by the audit worker, so while PageSpeed
 * was pending the reader's pan, zoom and selection were thrown away every five
 * seconds for identical data.
 */
function keepLinkGraph(prev: AuditReport | null, next: AuditReport): AuditReport {
  if (!prev?.linkGraph || !next.linkGraph) return next
  return JSON.stringify(prev.linkGraph) === JSON.stringify(next.linkGraph)
    ? { ...next, linkGraph: prev.linkGraph }
    : next
}

/** Everything that isn't the report itself: one centred message and a way back. */
function StatusScreen({
  icon,
  title,
  children,
  backHref,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
  backHref: string
}) {
  return (
    <div className="grid min-h-[60vh] place-items-center px-6">
      <div className="max-w-sm text-center">
        {icon}
        <h2 className="mt-3 text-lg font-semibold">{title}</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{children}</p>
        <Button asChild variant="outline" size="sm" className="mt-5 gap-1.5">
          <Link href={backHref}>
            <ArrowLeft className="size-4" /> Back to audits
          </Link>
        </Button>
      </div>
    </div>
  )
}

export default function AuditReportPage() {
  const params = useParams()
  const router = useRouter()
  const reportId = String(params.reportId ?? "")
  const [report, setReport] = useState<AuditReport | null>(null)
  const [isSite, setIsSite] = useState(false)
  // Kept so "Run fresh" can re-crawl the same target. The transformed report is
  // the UI's shape, not the API's, so this is read off the raw response.
  const [sourceUrl, setSourceUrl] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  /** Polling gave up while the report was still changing. */
  const [stalled, setStalled] = useState(false)
  /** A report has loaded at least once — from then on, a failed refresh keeps it. */
  const loaded = useRef(false)

  const load = useCallback(async () => {
    try {
      const data = await api.get<Record<string, unknown>>(`/api/page-audit/reports/${reportId}`)
      const next = transformReport(data)
      setReport((prev) => keepLinkGraph(prev, next))
      setIsSite((data.mode as string) === "SITE")
      setSourceUrl(String(data.url ?? ""))
      loaded.current = true
      setError(null)
    } catch (err) {
      /**
       * A failed refresh leaves the report on screen.
       *
       * One failed poll while PageSpeed was pending used to swap the whole
       * report for "Report unavailable", and the next good poll mounted it
       * again from scratch — taking the Ask AI conversation with it. The next
       * tick simply retries; only a first load with nothing to show is an error.
       */
      if (loaded.current) return
      setError(
        err instanceof ApiError && err.status === 404
          ? "That report doesn't exist, or belongs to another account."
          : err instanceof ApiError
            ? err.message
            : "Couldn't load this report.",
      )
    } finally {
      setLoading(false)
    }
  }, [reportId])

  // Until the report loads we don't know which of the two audits it came from;
  // the single-page form is the safe default for the error state.
  const backHref = isSite ? "/dashboard/site-audit" : "/dashboard/page-audit"

  useEffect(() => {
    if (reportId) void load()
  }, [reportId, load])

  // Keep re-reading while the report is still changing: its pages are being
  // written, or PageSpeed lands after the report does and the performance
  // scores change under the reader without a refresh.
  const changing =
    report?.status === "PROCESSING" ||
    (report?.status === "COMPLETED" && report.pageSpeedStatus === "pending")

  useEffect(() => {
    if (!changing) return
    const started = Date.now()
    const id = setInterval(() => {
      if (Date.now() - started > POLL_LIMIT_MS) {
        clearInterval(id)
        setStalled(true)
        return
      }
      void load()
    }, POLL_MS)
    return () => clearInterval(id)
  }, [changing, load])

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center px-6">
        <div className="text-center">
          <RefreshCw className="mx-auto size-7 animate-spin text-primary" />
          <p className="mt-3 text-[13px] text-muted-foreground">Loading report…</p>
        </div>
      </div>
    )
  }

  if (error || !report) {
    return (
      <StatusScreen
        icon={<XCircle className="mx-auto size-8 text-destructive" />}
        title="Report unavailable"
        backHref={backHref}
      >
        {error}
      </StatusScreen>
    )
  }

  /*
    Only a COMPLETED report has scores to show. Opened by URL, a failed or
    unfinished one used to render as a finished report with every score at 0 —
    and the AI assistant offering to explain it.
  */
  if (report.status === "FAILED") {
    return (
      <StatusScreen
        icon={<XCircle className="mx-auto size-8 text-destructive" />}
        title="This audit failed"
        backHref={backHref}
      >
        {report.errorMessage || "It stopped before it could produce a report."}
      </StatusScreen>
    )
  }

  if (report.status === "PROCESSING") {
    return (
      <StatusScreen
        icon={
          stalled ? (
            <AlertCircle className="mx-auto size-8 text-amber-500" />
          ) : (
            <RefreshCw className="mx-auto size-7 animate-spin text-primary" />
          )
        }
        title={stalled ? "This report hasn't finished" : "Finishing this report…"}
        backHref={backHref}
      >
        {stalled
          ? "It's taking far longer than it should. Check your audit history in a little while."
          : "The audit has run and its results are being saved. The report opens here as soon as it's ready."}
      </StatusScreen>
    )
  }

  return (
    <div className="px-6 pb-10 pt-5">
      {/*
        The balance rides on the back-link row.

        This route runs in the shell's focus mode, which drops the whole chrome —
        sidebar and header — so the report reads as a document. The credit
        counter lives in that header, so it disappeared exactly where people care
        about it most: this page is what a run of credits was just spent ON, and
        re-running an audit from here spends 500 more.

        Put back here rather than by re-enabling the header, because the rest of
        the chrome is deliberately gone and the back-link row was already half
        empty.
      */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="gap-1.5 text-[13px]">
          <Link href={backHref}>
            <ArrowLeft className="size-4" /> All audits
          </Link>
        </Button>
        <CreditBalance />
      </div>
      {/* Polling has stopped, so "Score will update automatically" under the
          Performance section is no longer true. Say so. */}
      {stalled && report.pageSpeedStatus === "pending" && (
        <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-[13px] leading-relaxed">
            PageSpeed is taking longer than usual, so this page has stopped checking for it. Reload
            later to see the performance scores.
          </p>
        </div>
      )}
      <AuditReportResults
        report={report}
        onNewAudit={() => router.push(backHref)}
        /**
         * Re-crawl this exact target, past the cache.
         *
         * Reports are reused for two weeks, so going back to the form and
         * re-entering the same URL returns this same report. That is right
         * almost always — and useless on the one occasion someone has just
         * changed their site and wants to see whether it helped. forceRecrawl
         * is the API's existing escape hatch; it simply had no button.
         */
        onRunFresh={
          sourceUrl
            ? () => router.push(`${backHref}?url=${encodeURIComponent(sourceUrl)}&fresh=1`)
            : undefined
        }
        isAuthenticated
        /* Site audits replace the Recommendations section with the rollup. Same
           slot — first thing after the scores — and the list it displaces is
           empty here regardless. A single-page report keeps the original. */
        recommendationsSlot={
          isSite ? (
            <SiteIssues
              reportId={reportId}
              pagesAnalyzed={report.totals?.pages ?? report.pagesAnalyzed}
              totalIssues={report.totals?.issues ?? report.issues.length}
            />
          ) : undefined
        }
      />
    </div>
  )
}
