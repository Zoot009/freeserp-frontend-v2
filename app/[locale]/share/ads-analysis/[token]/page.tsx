"use client"

/**
 * A shared Google Ads Analysis, for anyone with the link: no account needed.
 * Reads /api/public/ads-analysis/shared/<token>, which only resolves finished
 * reports their owner shared, and leaves out the owner's own rankings.
 */
import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { AlertCircle, Printer, RefreshCw, XCircle } from "lucide-react"
import { API_BASE } from "@/lib/api"
import type { AdsAnalysisResponse } from "@/lib/ads-analysis"
import { Button } from "@/components/ui/button"
import { heroButton } from "@/components/gbp-audit/report"
import { AdsHero, AdsReport } from "@/components/ads-analysis/report"

export default function SharedAdsAnalysisPage() {
  const params = useParams()
  const token = String(params.token ?? "")
  const [data, setData] = useState<AdsAnalysisResponse | null>(null)
  const [error, setError] = useState<"gone" | "unavailable" | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setError(null)
    // Plain fetch: the api client sends a session and bounces to /login on a 401.
    fetch(`${API_BASE}/api/public/ads-analysis/shared/${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        return (await res.json()) as AdsAnalysisResponse
      })
      .then((d) => !cancelled && setData(d))
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
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">This shared report is no longer available. Its owner may have stopped sharing it.</p>
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
  if (!data?.result) {
    return (
      <Centered>
        <RefreshCw className="mx-auto size-7 animate-spin text-primary" />
        <p className="mt-3 text-[13px] text-muted-foreground">Loading report…</p>
      </Centered>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="text-[13px] text-muted-foreground">
            <span className="font-semibold text-foreground">FreeSERP</span> · Google Ads analysis
          </div>
          <button type="button" className={heroButton} onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" /> Print / PDF
          </button>
        </div>

        <AdsHero data={data} />
        <AdsReport data={data} />

        <div className="flex flex-col items-start gap-3 rounded-[10px] border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
          <div className="text-[13px]">
            <b className="font-medium">Want this analysis for your own site?</b>
            <span className="text-muted-foreground"> Run a Google Ads analysis on FreeSERP.</span>
          </div>
          <Link href="/signup" className="inline-flex h-8 items-center rounded-[7px] bg-brand px-3 text-[13px] font-medium text-white hover:bg-brand-deep">
            Create a free account
          </Link>
        </div>
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
