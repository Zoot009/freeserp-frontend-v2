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

import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { ArrowLeft, RefreshCw, XCircle } from "lucide-react"
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

export default function AuditReportPage() {
  const params = useParams()
  const router = useRouter()
  const reportId = String(params.reportId ?? "")
  const [report, setReport] = useState<AuditReport | null>(null)
  const [totals, setTotals] = useState({ pages: 0, issues: 0 })
  const [isSite, setIsSite] = useState(false)
  // Kept so "Run fresh" can re-crawl the same target. The transformed report is
  // the UI's shape, not the API's, so this is read off the raw response.
  const [sourceUrl, setSourceUrl] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const data = await api.get<Record<string, unknown>>(`/api/page-audit/reports/${reportId}`)
      setReport(transformReport(data))
      // Kept off the AuditReport shape: `totals` is ours, not the imported UI's,
      // and transformReport would drop it.
      const t = data.totals as { pages?: number; issues?: number } | undefined
      setTotals({ pages: t?.pages ?? 0, issues: t?.issues ?? 0 })
      setIsSite((data.mode as string) === "SITE")
      setSourceUrl(String(data.url ?? ""))
      setError(null)
    } catch (err) {
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

  // PageSpeed lands after the report does, so keep polling while it's pending —
  // the performance scores change under the reader without a refresh.
  useEffect(() => {
    if (!report || report.pageSpeedStatus !== "pending") return
    const id = setInterval(() => void load(), 5000)
    return () => clearInterval(id)
  }, [report, load])

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
      <div className="grid min-h-[60vh] place-items-center px-6">
        <div className="max-w-sm text-center">
          <XCircle className="mx-auto size-8 text-destructive" />
          <h2 className="mt-3 text-lg font-semibold">Report unavailable</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{error}</p>
          <Button asChild variant="outline" size="sm" className="mt-5 gap-1.5">
            <Link href={backHref}>
              <ArrowLeft className="size-4" /> Back to audits
            </Link>
          </Button>
        </div>
      </div>
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
            <SiteIssues reportId={reportId} pagesAnalyzed={totals.pages} totalIssues={totals.issues} />
          ) : undefined
        }
      />
    </div>
  )
}
