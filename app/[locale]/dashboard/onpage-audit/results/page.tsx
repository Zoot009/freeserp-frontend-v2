"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useRouter } from "@/i18n/navigation"
import { api } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"
import { AuditReport as AuditReportView } from "@/components/audit-report"
import type { AuditReport, ScoringCategoryKey } from "@/types/onpage-audit"

type Audit = {
  id: string
  url: string
  domain: string | null
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"
  error: string | null
  report: AuditReport | null
  overallScore: number | null
  onPageScore: number | null
  grade: string | null
  createdAt: string
  completedAt: string | null
}

const POLL_MS = 2500

const CATEGORY_LABELS: Record<ScoringCategoryKey, string> = {
  technical: "Technical",
  onPage: "On-Page",
  performance: "Performance",
  accessibility: "Accessibility",
  links: "Links",
  structuredData: "Structured Data",
  security: "Security",
}

function scoreColorVar(v: number): string {
  if (v >= 80) return "var(--pos)"
  if (v >= 60) return "var(--warn)"
  return "var(--neg)"
}

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  const v = value ?? 0
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 5 }}>
        <span className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
        <span className="tiny b tabular">{value ?? "—"}</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: "var(--bg-inset)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${v}%`, background: scoreColorVar(v), borderRadius: 999, transition: "width .3s" }} />
      </div>
    </div>
  )
}

function ScoreCard({ report }: { report: AuditReport }) {
  const overall = report.scoring?.overall
  const categories = report.scoring?.categories ?? {}
  const onPage = categories.onPage
  const total = overall?.score ?? 0
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="grid g-21" style={{ gap: 24, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ textAlign: "center", flexShrink: 0 }}>
            <div style={{ fontSize: 52, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums", color: scoreColorVar(total) }}>{total}</div>
            <div className="tiny muted" style={{ marginTop: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {overall?.grade ?? "—"}{overall?.tier ? ` · ${overall.tier}` : ""}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            <ScoreBar label="On-Page SEO" value={onPage?.score ?? null} />
            {categories.technical && <ScoreBar label={CATEGORY_LABELS.technical} value={categories.technical.score} />}
            {categories.performance && <ScoreBar label={CATEGORY_LABELS.performance} value={categories.performance.score} />}
          </div>
        </div>
        <div className="tiny muted" style={{ lineHeight: 1.5 }}>
          Overall audit score across technical, on-page, performance, accessibility, links, structured data &amp; security. Expand the sections below for every check and prioritized fix.
        </div>
      </div>
    </div>
  )
}

function ResultsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = searchParams.get("id") || ""

  const [audit, setAudit] = useState<Audit | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!id) {
      setError("Missing audit id.")
      return
    }
    let cancelled = false

    const poll = async () => {
      try {
        const data = await api.get<{ audit: Audit }>(`/api/on-page-audit/${id}`)
        if (cancelled) return
        setAudit(data.audit)
        if (data.audit.status === "PENDING" || data.audit.status === "PROCESSING") {
          timer.current = setTimeout(poll, POLL_MS)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load audit.")
      }
    }
    poll()

    return () => {
      cancelled = true
      if (timer.current) clearTimeout(timer.current)
    }
  }, [id])

  const status = audit?.status
  const inProgress = !audit || status === "PENDING" || status === "PROCESSING"

  return (
    <div className="page">
      <div className="page-h">
        <div style={{ minWidth: 0 }}>
          <button
            className="btn sm"
            onClick={() => router.push("/dashboard/onpage-audit")}
            style={{ marginBottom: 12 }}
          >
            <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><Icon.chevR /></span> Back
          </button>
          <div className="eyebrow"><span className="spark"><Icon.monitor /></span> On-Page Audit</div>
          <h1>Audit report</h1>
          {audit && (
            <div className="sub">
              <a className="url" href={audit.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand)" }}>
                {audit.url.replace(/^https?:\/\//, "")}
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {(error || status === "FAILED") && (
        <div className="card" style={{ display: "flex", gap: 10, alignItems: "flex-start", borderColor: "var(--neg)", background: "var(--neg-soft)" }}>
          <span style={{ color: "var(--neg)", flexShrink: 0, marginTop: 1 }}><Icon.close /></span>
          <div className="tiny" style={{ color: "var(--neg)" }}>
            {error || audit?.error || "Audit failed. Please try again."}
          </div>
        </div>
      )}

      {/* Loading */}
      {!error && inProgress && status !== "FAILED" && (
        <div className="card" style={{ padding: 60, textAlign: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <span className="spin" style={{ display: "inline-flex", color: "var(--brand)" }}><Icon.refresh /></span>
            <div>
              <div className="b" style={{ fontSize: 14, marginBottom: 4 }}>Auditing your page…</div>
              <div className="tiny muted">Crawling the page and scoring technical, on-page, performance &amp; more</div>
              <div className="tiny muted" style={{ marginTop: 6, opacity: 0.7 }}>This usually takes 20–90 seconds</div>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {!error && status === "COMPLETED" && audit?.report && (
        <>
          <ScoreCard report={audit.report} />
          <AuditReportView report={audit.report} />
        </>
      )}
    </div>
  )
}

export default function OnPageAuditResultsPage() {
  return (
    <Suspense fallback={
      <div className="page" style={{ display: "flex", justifyContent: "center", padding: 80 }}>
        <span className="spin" style={{ color: "var(--brand)" }}><Icon.refresh /></span>
      </div>
    }>
      <ResultsContent />
    </Suspense>
  )
}
