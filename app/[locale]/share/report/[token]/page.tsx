"use client"

/**
 * A shared client report (the Local growth report), for anyone with the link:
 * no account needed. Outside /dashboard, so it never sits under the signed-in
 * shell. It reads /api/public/report-builder/shared/<token>: the copy of each
 * finished section the team shared, minus any section they've since left out.
 */
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { AlertCircle, Printer, RefreshCw, XCircle } from "lucide-react"
import { API_BASE } from "@/lib/api"
import { def, knownSections, type GbpPost, type Inputs, type RunKey } from "@/lib/report-builder"
import { domainOf } from "@/components/report-builder/runs"
import { ReportDocument } from "@/components/report-builder/report-document"
import { Button } from "@/components/ui/button"

type Shared = {
  report: { id: string; createdAt: string; expiresAt: string; sel: string[]; inputs: Inputs; business: string | null }
  data: Partial<Record<RunKey, any>>
  post: GbpPost | null
}

export default function SharedReportPage() {
  const params = useParams()
  const token = String(params.token ?? "")
  const [shared, setShared] = useState<Shared | null>(null)
  // "gone" is only the backend's 404 (never shared, sharing stopped, or the
  // report's 10 days are up); anything else is a hiccup worth retrying.
  const [error, setError] = useState<"gone" | "unavailable" | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setError(null)
    // Plain fetch, not the api client: this page has no session by design.
    fetch(`${API_BASE}/api/public/report-builder/shared/${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        return (await res.json()) as Shared
      })
      .then((d) => !cancelled && setShared(d))
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error && (err.message === "404" || err.message === "400") ? "gone" : "unavailable")
      })
    return () => {
      cancelled = true
    }
  }, [token, attempt])

  if (error === "gone") {
    return (
      <Centered>
        <XCircle className="mx-auto size-8 text-destructive" />
        <h1 className="mt-3 text-lg font-semibold">Report unavailable</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">This shared report is no longer available. Ask whoever sent it for a new link.</p>
      </Centered>
    )
  }
  if (error === "unavailable") {
    return (
      <Centered>
        <AlertCircle className="mx-auto size-8 text-amber-500" />
        <h1 className="mt-3 text-lg font-semibold">This report can&apos;t be loaded right now</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">The link is fine; our server didn&apos;t answer this time. Please try again in a moment.</p>
        <Button variant="outline" size="sm" className="mt-5" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </Button>
      </Centered>
    )
  }
  if (!shared) {
    return (
      <Centered>
        <RefreshCw className="mx-auto size-7 animate-spin text-primary" />
        <p className="mt-3 text-[13px] text-muted-foreground">Loading report…</p>
      </Centered>
    )
  }

  const { report, data, post } = shared
  // Only the sections whose results came with the link.
  // Only the sections whose results came with the link (the sample post, when it was written).
  const sel = knownSections(report.sel).filter((d) => data[def(d).run] !== undefined && (d !== "aiPost" || !!post))
  const business = data.gbp?.facts?.business?.name ?? report.business ?? report.inputs.name ?? (domainOf(report.inputs.web) || "Your business")
  return (
    <main className="min-h-screen bg-background">
      <div className="fs-app mx-auto max-w-[1200px] space-y-8 px-4 py-6 sm:px-6 print:max-w-none print:px-[3px] print:py-0" style={{ background: "transparent" }}>
        <div className="flex justify-end print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-deep"
            title="Save the whole report as a PDF: choose “Save as PDF” in the print window"
          >
            <Printer className="h-4 w-4" aria-hidden /> Print / PDF
          </button>
        </div>
        <ReportDocument
          id={report.id}
          createdAt={report.createdAt}
          sel={sel}
          inputs={report.inputs}
          business={business}
          runOf={(d) => ({ state: "done", data: data[def(d).run] })}
          post={post}
          shared
        />
      </div>
    </main>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <div className="max-w-sm text-center">{children}</div>
    </main>
  )
}
