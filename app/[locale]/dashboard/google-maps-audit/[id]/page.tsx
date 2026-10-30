"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, ExternalLink, Printer, RefreshCw, Share2, XCircle } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { api, ApiError } from "@/lib/api"
import { CACHE_DAYS, isRunning, type GbpAuditResponse } from "@/lib/gbp-audit"
import { Button } from "@/components/ui/button"
import {
  Alarm,
  heroButton,
  heroButtonPrimary,
  Notice,
  OtherAudits,
  Progress,
  ReportHero,
  ReportSections,
  Tabs,
  TABS,
  usePrintAll,
  type TabKey,
} from "@/components/gbp-audit/report"
import { ShareAuditDialog } from "@/components/gbp-audit/share-dialog"

// Consecutive failed polls (5xx / network) tolerated before giving up.
const MAX_POLL_FAILURES = 5
const POLL_MS = 3000

export default function GoogleMapsAuditReportPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const { user, loading: authLoading } = useAuth()

  const [data, setData] = useState<GbpAuditResponse | null>(null)
  const [error, setError] = useState("")
  const [starting, setStarting] = useState<"rerun" | "keyword" | null>(null)
  const [tab, setTab] = useState<TabKey>("overview")
  const [shareOpen, setShareOpen] = useState(false)
  // Print / PDF lays out the whole report, not just the open tab.
  const { printAll, print } = usePrintAll()
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

  /**
   * A new audit of the same listing. Inside the cache window "Run again" is
   * served from the cache (free) — the business isn't fetched from Google again
   * for CACHE_DAYS, whoever asks. A new keyword reuses the cached listing and
   * reviews and only runs that keyword's grid.
   */
  const start = async (kind: "rerun" | "keyword", keyword?: string) => {
    if (!data || starting) return
    setStarting(kind)
    try {
      // The listing's own Maps link when we have it: it names the business exactly, whatever was pasted the first time.
      const url = data.facts?.business.mapsUrl ?? data.audit.input
      const body = { url, keyword: kind === "rerun" ? data.audit.keyword : keyword }
      const { audit } = await api.post<{ audit: { id: string } }>("/api/gbp-audit", body)
      router.push(`/dashboard/google-maps-audit/${audit.id}${kind === "keyword" ? "#rankings" : ""}`)
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't start the audit. Please try again.")
      setStarting(null)
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5 text-[13px]">
          <Link href="/dashboard/google-maps-audit">
            <ArrowLeft className="h-4 w-4" /> All Google Maps audits
          </Link>
        </Button>
        {!running && (
          <div className="flex flex-wrap gap-2">
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={heroButton}>
                <ExternalLink className="h-3.5 w-3.5" /> Open on Google Maps
              </a>
            )}
            {report && audit.status === "COMPLETED" && (
              <button type="button" className={heroButton} onClick={() => setShareOpen(true)}>
                <Share2 className="h-3.5 w-3.5" /> {audit.shareToken ? "Shared" : "Share"}
              </button>
            )}
            {report && (
              <button type="button" className={heroButton} onClick={print} disabled={printAll}>
                <Printer className="h-3.5 w-3.5" /> {printAll ? "Preparing…" : "Print / PDF"}
              </button>
            )}
            <button
              type="button"
              className={heroButtonPrimary}
              onClick={() => start("rerun")}
              disabled={starting !== null}
              title={`Google data is kept for ${CACHE_DAYS} days: running again inside that window reuses it for free`}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${starting === "rerun" ? "animate-spin" : ""}`} />
              {starting === "rerun" ? "Starting…" : "Run again"}
            </button>
          </div>
        )}
      </div>
      <ReportHero data={data} onOpenPlan={() => openTab("plan")} />

      <div className="mt-5 space-y-5">
        {error && <Alarm>{error}</Alarm>}
        {running && <Progress step={audit.progress?.step ?? null} />}
        {audit.status === "FAILED" && audit.error && <Alarm>{audit.error}</Alarm>}
        {facts?.notes.map((n) => <Notice key={n}>{n}</Notice>)}

        {facts && report && (
          <>
            <Tabs active={tab} onChange={openTab} counts={{ profile: report.findings.length }} />
            <ReportSections
              data={data}
              tab={tab}
              printAll={printAll}
              onOpen={openTab}
              onCheckKeyword={(k) => start("keyword", k)}
              checking={starting === "keyword"}
            />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Data from Google via DataForSEO, fetched {new Date(facts.fetchedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
              {audit.fromCache ? `; the profile and reviews were reused from the ${CACHE_DAYS}-day cache and not charged` : ""}. The rank grid is a Google Maps
              Tracker scan. The profile score is FreeSERP&apos;s weighted checklist, not a score Google publishes.
            </p>
            <div className="print:hidden">
              <OtherAudits audits={data.others} />
            </div>
          </>
        )}
      </div>
      <ShareAuditDialog
        auditId={audit.id}
        shareToken={audit.shareToken ?? null}
        open={shareOpen}
        onOpenChange={setShareOpen}
        onChange={(token) => setData((d) => (d ? { ...d, audit: { ...d.audit, shareToken: token } } : d))}
      />
    </div>
  )
}
