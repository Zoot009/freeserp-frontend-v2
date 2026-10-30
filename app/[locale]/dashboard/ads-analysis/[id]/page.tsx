"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Printer, RefreshCw, Share2, XCircle } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { api, ApiError } from "@/lib/api"
import { isRunning, type AdsAnalysisResponse, type Assumptions } from "@/lib/ads-analysis"
import { Button } from "@/components/ui/button"
import { Alarm, heroButton, heroButtonPrimary } from "@/components/gbp-audit/report"
import { ShareAuditDialog } from "@/components/gbp-audit/share-dialog"
import { AdsHero, AdsProgress, AdsReport } from "@/components/ads-analysis/report"

const MAX_POLL_FAILURES = 5
const POLL_MS = 4000

export default function AdsAnalysisReportPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const { user, loading: authLoading } = useAuth()

  const [data, setData] = useState<AdsAnalysisResponse | null>(null)
  const [error, setError] = useState("")
  const [rerunning, setRerunning] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading, id])

  const load = async (gen: number) => {
    try {
      const res = await api.get<AdsAnalysisResponse>(`/api/ads-analysis/${id}`)
      if (gen !== pollGenRef.current) return
      failuresRef.current = 0
      setError("")
      setData(res)
      if (isRunning(res.analysis.status)) pollTimerRef.current = setTimeout(() => load(gen), POLL_MS)
    } catch (err) {
      if (gen !== pollGenRef.current) return
      const status = err instanceof ApiError ? err.status : 0
      failuresRef.current += 1
      if ((status >= 400 && status < 500) || failuresRef.current > MAX_POLL_FAILURES) {
        setError(status === 404 || status === 400 ? "That analysis doesn't exist, or belongs to another account." : err instanceof Error && err.message ? err.message : "Couldn't load this analysis.")
        return
      }
      pollTimerRef.current = setTimeout(() => load(gen), POLL_MS + 1000)
    }
  }

  const saveAssumptions = async (a: Partial<Assumptions>) => {
    const res = await api.patch<AdsAnalysisResponse>(`/api/ads-analysis/${id}/assumptions`, a)
    setData(res)
  }

  const rerun = async () => {
    if (!data || rerunning) return
    setRerunning(true)
    try {
      const { analysis: a } = data
      const { analysis } = await api.post<{ analysis: { id: string } }>("/api/ads-analysis", {
        url: a.origin,
        location: a.location,
        services: a.services,
        servicePages: a.servicePages ?? null,
        budgetUsd: data.assumptions.budgetUsd,
        jobValueUsd: data.assumptions.jobValueUsd,
      })
      router.push(`/dashboard/ads-analysis/${analysis.id}`)
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't start the analysis.")
      setRerunning(false)
    }
  }

  if (authLoading || !user) return null

  const back = (
    <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5 text-[13px]">
      <Link href="/dashboard/ads-analysis">
        <ArrowLeft className="h-4 w-4" /> All Google Ads analyses
      </Link>
    </Button>
  )

  if (!data) {
    return (
      <div className="page">
        <div className="mb-3 print:hidden">{back}</div>
        <div className="grid min-h-[50vh] place-items-center px-6">
          {error ? (
            <div className="max-w-sm text-center">
              <XCircle className="mx-auto h-8 w-8 text-destructive" />
              <h2 className="mt-3 text-lg font-semibold">Report unavailable</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{error}</p>
            </div>
          ) : (
            <div className="text-center">
              <RefreshCw className="mx-auto h-7 w-7 animate-spin text-primary" />
              <p className="mt-3 text-[13px] text-muted-foreground">Loading report…</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  const { analysis } = data
  const running = isRunning(analysis.status)
  const done = analysis.status === "COMPLETED" && data.result

  return (
    <div className="page">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 print:hidden">
        {back}
        {!running && (
          <div className="flex flex-wrap gap-2">
            {done && (
              <button type="button" className={heroButton} onClick={() => setShareOpen(true)}>
                <Share2 className="h-3.5 w-3.5" /> {analysis.shareToken ? "Shared" : "Share"}
              </button>
            )}
            {done && (
              <button type="button" className={heroButton} onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5" /> Print / PDF
              </button>
            )}
            <button type="button" className={heroButtonPrimary} onClick={rerun} disabled={rerunning}>
              <RefreshCw className={`h-3.5 w-3.5 ${rerunning ? "animate-spin" : ""}`} />
              {rerunning ? "Starting…" : "Run again"}
            </button>
          </div>
        )}
      </div>

      <AdsHero data={data} />
      <div className="mt-5 space-y-5">
        {error && <Alarm>{error}</Alarm>}
        {running && <AdsProgress progress={analysis.progress} />}
        {analysis.status === "FAILED" && analysis.error && <Alarm>{analysis.error}</Alarm>}
        {done && <AdsReport data={data} onSaveAssumptions={saveAssumptions} />}
      </div>

      <ShareAuditDialog
        auditId={analysis.id}
        apiPath="/api/ads-analysis"
        sharePath="/share/ads-analysis"
        shareToken={analysis.shareToken ?? null}
        open={shareOpen}
        onOpenChange={setShareOpen}
        onChange={(token) => setData((d) => (d ? { ...d, analysis: { ...d.analysis, shareToken: token } } : d))}
      />
    </div>
  )
}
