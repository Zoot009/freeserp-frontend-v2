"use client"

/**
 * A single saved audit report, on its own URL.
 *
 * Having a real route per report is what makes the history table clickable, the
 * browser back button work, and a report linkable to a colleague who has an
 * account. (The public, no-account version is /audit/shared/<token>.)
 */

import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { ArrowLeft, RefreshCw, XCircle } from "lucide-react"
import { Link, useRouter } from "@/i18n/navigation"
import { api, ApiError } from "@/lib/api"
import { Button } from "@/components/ui/button"
import {
  AuditReportResults,
  SECTION_INTERNAL_LINKS,
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
            <Link href="/dashboard/page-audit">
              <ArrowLeft className="size-4" /> Back to Page Audit
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="px-6 pb-10 pt-5">
      <Button asChild variant="ghost" size="sm" className="mb-3 gap-1.5 text-[13px]">
        <Link href="/dashboard/page-audit">
          <ArrowLeft className="size-4" /> All audits
        </Link>
      </Button>
      <AuditReportResults
        report={report}
        onNewAudit={() => router.push("/dashboard/page-audit")}
        isAuthenticated
        // Internal Links needs a link-graph service that wasn't part of the port.
        hiddenSections={[SECTION_INTERNAL_LINKS]}
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
