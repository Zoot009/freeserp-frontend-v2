"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, ExternalLink, Printer, RefreshCw, XCircle } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { api, ApiError } from "@/lib/api"
import { isRunning, type GbpAuditResponse } from "@/lib/gbp-audit"
import { Button } from "@/components/ui/button"
import {
  ActionPlan,
  Alarm,
  Notice,
  OtherAudits,
  Overview,
  ProfileAudit,
  Progress,
  Rankings,
  ReportHeader,
  Reviews,
  Tabs,
  TABS,
  type TabKey,
} from "@/components/gbp-audit/report"

// Consecutive failed polls (5xx / network) tolerated before giving up.
const MAX_POLL_FAILURES = 5
const POLL_MS = 3000

export default function GoogleMapsAuditReportPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const { user, loading: authLoading } = useAuth()

  const [data, setData] = useState<GbpAuditResponse | null>(null)
  const [error, setError] = useState("")
  const [rerunning, setRerunning] = useState(false)
  const [tab, setTab] = useState<TabKey>("overview")
  // One poll chain at a time: leaving the page or switching audit bumps the generation, so an in-flight poll drops its
  // result instead of rescheduling.
  const pollGenRef = useRef(0)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const failuresRef = useRef(0)

  // The tab lives in the hash, so a link or a reload lands on the same one.
  useEffect(() => {
    const fromHash = window.location.hash.slice(1) as TabKey
    if (TABS.some((t) => t.key === fromHash)) setTab(fromHash)
  }, [])
  const openTab = (t: TabKey) => {
    setTab(t)
    window.history.replaceState(null, "", `#${t}`)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

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
      const res = await api.get<GbpAuditResponse>(`/api/gbp-audit/${id}`)
      if (gen !== pollGenRef.current) return
      failuresRef.current = 0
      setError("")
      setData(res)
      if (isRunning(res.audit.status)) pollTimerRef.current = setTimeout(() => load(gen), POLL_MS)
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
    if (!data || rerunning) return
    setRerunning(true)
    try {
      // The listing's own Maps link when we have it: it names the business exactly, whatever was pasted the first time.
      const url = data.facts?.business.mapsUrl ?? data.audit.input
      const { audit } = await api.post<{ audit: { id: string } }>("/api/gbp-audit", { url })
      router.push(`/dashboard/google-maps-audit/${audit.id}`)
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't start the audit. Please try again.")
      setRerunning(false)
    }
  }

  if (authLoading || !user) return null

  const back = (
    <div className="mb-3 print:hidden">
      <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5 text-[13px]">
        <Link href="/dashboard/google-maps-audit">
          <ArrowLeft className="h-4 w-4" /> All Google Maps audits
        </Link>
      </Button>
    </div>
  )

  if (!data) {
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

  const { audit, facts, report } = data
  const running = isRunning(audit.status)
  const mapsUrl = facts?.business.mapsUrl

  return (
    <div className="page">
      {back}
      <ReportHeader
        data={data}
        actions={
          !running && (
            <div className="flex flex-wrap gap-2 print:hidden">
              {mapsUrl && (
                <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3" /> Google Maps
                  </a>
                </Button>
              )}
              {report && (
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => window.print()}>
                  <Printer className="h-3 w-3" /> Print / PDF
                </Button>
              )}
              <Button size="sm" className="gap-1.5 bg-brand text-xs text-white hover:bg-brand-deep" onClick={rerun} disabled={rerunning}>
                <RefreshCw className={`h-3 w-3 ${rerunning ? "animate-spin" : ""}`} />
                {rerunning ? "Starting…" : "Run again"}
              </Button>
            </div>
          )
        }
      />

      <div className="space-y-4">
        {error && <Alarm>{error}</Alarm>}
        {running && <Progress step={audit.progress?.step ?? null} />}
        {audit.status === "FAILED" && audit.error && <Alarm>{audit.error}</Alarm>}
        {facts?.notes.map((n) => <Notice key={n}>{n}</Notice>)}

        {facts && report && (
          <>
            <Tabs active={tab} onChange={openTab} counts={{ profile: report.findings.length }} />
            {tab === "overview" && <Overview data={data} report={report} onOpen={openTab} />}
            {tab === "profile" && <ProfileAudit facts={facts} report={report} />}
            {tab === "reviews" && <Reviews facts={facts} report={report} />}
            {tab === "rankings" && <Rankings facts={facts} report={report} />}
            {tab === "plan" && <ActionPlan report={report} />}
            <p className="pt-2 text-[11px] leading-relaxed text-muted-foreground">
              Data from Google via DataForSEO, fetched {new Date(facts.fetchedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}.
              The profile score is FreeSERP&apos;s weighted checklist, not a score Google publishes; rankings are one search from the
              business&apos;s own location.
            </p>
            <OtherAudits audits={data.others} />
          </>
        )}
      </div>
    </div>
  )
}
