"use client"

/**
 * A shared Google Maps audit, for anyone with the link: no account needed.
 *
 * Deliberately outside /dashboard, so it never sits under the signed-in shell.
 * It reads /api/public/gbp-audit/shared/<token>, which only resolves finished
 * reports their owner shared, never returns the owner's account or their other
 * audits, and carries the competitors' grids (a visitor can't ask Maps Tracker).
 */
import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { AlertCircle, Printer, RefreshCw, XCircle } from "lucide-react"
import { API_BASE } from "@/lib/api"
import { CACHE_DAYS, type GbpAuditResponse } from "@/lib/gbp-audit"
import { Button } from "@/components/ui/button"
import {
  heroButton,
  ReportHero,
  ReportSections,
  SharedReportContext,
  Tabs,
  TABS,
  usePrintAll,
  type TabKey,
} from "@/components/gbp-audit/report"

export default function SharedMapsAuditPage() {
  const params = useParams()
  const token = String(params.token ?? "")
  const [data, setData] = useState<GbpAuditResponse | null>(null)
  // "gone" is only the backend's 404 (never shared, or sharing stopped);
  // anything else is a hiccup worth retrying, not a dead link.
  const [error, setError] = useState<"gone" | "unavailable" | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [tab, setTab] = useState<TabKey>("overview")
  const { printAll, print } = usePrintAll()

  useEffect(() => {
    const fromHash = window.location.hash.slice(1) as TabKey
    if (TABS.some((t) => t.key === fromHash)) setTab(fromHash)
  }, [])
  const openTab = (t: TabKey) => {
    setTab(t)
    window.history.replaceState(null, "", `#${t}`)
  }

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setError(null)
    // Plain fetch, not the api client: that one sends a session and bounces to
    // /login on a 401. This page has no session by design.
    fetch(`${API_BASE}/api/public/gbp-audit/shared/${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        return (await res.json()) as GbpAuditResponse
      })
      .then((d) => {
        if (!cancelled) setData(d)
      })
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
  if (!data?.facts || !data.report) {
    return (
      <Centered>
        <RefreshCw className="mx-auto size-7 animate-spin text-primary" />
        <p className="mt-3 text-[13px] text-muted-foreground">Loading report…</p>
      </Centered>
    )
  }

  const { facts, report, audit } = data
  return (
    <SharedReportContext.Provider value={{ leaderboard: data.leaderboard ?? null }}>
      <main className="min-h-screen bg-background">
        <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-6 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div className="text-[13px] text-muted-foreground">
              <span className="font-semibold text-foreground">FreeSERP</span> · Google Maps audit
            </div>
            <button type="button" className={heroButton} onClick={print} disabled={printAll}>
              <Printer className="h-3.5 w-3.5" /> {printAll ? "Preparing…" : "Print / PDF"}
            </button>
          </div>

          <ReportHero data={data} onOpenPlan={() => openTab("plan")} />
          <Tabs active={tab} onChange={openTab} counts={{ profile: report.findings.length }} />
          <ReportSections data={data} tab={tab} printAll={printAll} onOpen={openTab} />

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Data from Google via DataForSEO, fetched {new Date(facts.fetchedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
            {audit.fromCache ? `; reused from the ${CACHE_DAYS}-day cache` : ""}. The rank grid is a Google Maps Tracker scan. The profile score is
            FreeSERP&apos;s weighted checklist, not a score Google publishes.
          </p>

          <div className="flex flex-col items-start gap-3 rounded-[10px] border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
            <div className="text-[13px]">
              <b className="font-medium">Want this audit for your own business?</b>
              <span className="text-muted-foreground"> Run a Google Maps audit free on FreeSERP.</span>
            </div>
            <Link href="/signup" className="inline-flex h-8 items-center rounded-[7px] bg-brand px-3 text-[13px] font-medium text-white hover:bg-brand-deep">
              Create a free account
            </Link>
          </div>
        </div>
      </main>
    </SharedReportContext.Provider>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <div className="max-w-sm text-center">{children}</div>
    </main>
  )
}
