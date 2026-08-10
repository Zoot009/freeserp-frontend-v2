"use client"

/**
 * A publicly shared audit report.
 *
 * Deliberately OUTSIDE /dashboard: this route is for people with no account, so
 * it must not sit under the authenticated shell. It reads
 * /api/public/page-audit/shared/<token>, which only ever resolves COMPLETED
 * reports whose owner explicitly published them, and never returns the owner's
 * id.
 *
 * `shared` on the report component hides the owner-only controls — the share
 * dialog, the AI panel, and anything that would write back.
 */

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { RefreshCw, XCircle } from "lucide-react"
import { API_BASE } from "@/lib/api"
import {
  AuditReportResults,
  SECTION_INTERNAL_LINKS,
  transformReport,
  type AuditReport,
} from "@/components/page-audit/audit-ui"

export default function SharedAuditPage() {
  const params = useParams()
  const token = String(params.token ?? "")
  const [report, setReport] = useState<AuditReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    // Plain fetch, not the api client: that one attaches a JWT and will try to
    // refresh or bounce to /login on a 401. This page has no session by design.
    fetch(`${API_BASE}/api/public/page-audit/shared/${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        return res.json()
      })
      .then((data) => { if (!cancelled) setReport(transformReport(data)) })
      .catch(() => {
        if (!cancelled) setError("This shared report is no longer available. The link may have been revoked.")
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token])

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-4">
        <div className="text-center">
          <RefreshCw className="mx-auto size-7 animate-spin text-primary" />
          <p className="mt-3 text-[13px] text-muted-foreground">Loading report…</p>
        </div>
      </main>
    )
  }

  if (error || !report) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-4">
        <div className="max-w-sm text-center">
          <XCircle className="mx-auto size-8 text-destructive" />
          <h1 className="mt-3 text-lg font-semibold">Report unavailable</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{error}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1400px] px-4 py-8">
        <AuditReportResults
          report={report}
          onNewAudit={() => { window.location.href = "/" }}
          shared
          hiddenSections={[SECTION_INTERNAL_LINKS]}
        />
      </div>
    </main>
  )
}
