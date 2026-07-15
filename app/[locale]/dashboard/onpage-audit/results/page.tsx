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

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })

function scoreColorVar(v: number): string {
  if (v >= 80) return "var(--pos)"
  if (v >= 60) return "var(--brand)"
  return "var(--neg)"
}

function scoreToneVar(v: number): { color: string; bg: string } {
  if (v >= 80) return { color: "var(--pos)", bg: "var(--pos-soft)" }
  if (v >= 60) return { color: "var(--brand)", bg: "var(--brand-soft)" }
  return { color: "var(--neg)", bg: "var(--neg-soft)" }
}

// Eased 0→target ramp driven by rAF, shared by the ring and the count-up
// number so they land in sync instead of the number popping in instantly.
function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    let raf: number
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setVal(target * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return val
}

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  const target = value ?? 0
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setWidth(target))
    return () => cancelAnimationFrame(raf)
  }, [target])
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 5 }}>
        <span className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
        <span className="tiny b tabular">{value ?? "—"}</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: "var(--bg-inset)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${width}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${scoreColorVar(target)} 75%, transparent), ${scoreColorVar(target)})`, borderRadius: 999, transition: "width .8s cubic-bezier(.16,1,.3,1)" }} />
      </div>
    </div>
  )
}

// Circular gauge for the headline score — colored by tier so the ring itself
// communicates pass/warn/fail at a glance. Fills and counts up together on
// mount so the score feels "revealed" rather than just printed on the page.
function ScoreRing({ value, color, size = 132, stroke = 11 }: { value: number; color: string; size?: number; stroke?: number }) {
  const display = useCountUp(value)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, display))
  const offset = c - (pct / 100) * c
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0, filter: `drop-shadow(0 0 14px color-mix(in srgb, ${color} 35%, transparent))` }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="oa-ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.65" />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-inset)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="url(#oa-ring-grad)" strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={offset}
          strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
        <div style={{ fontSize: 34, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums", color }}>{Math.round(display)}</div>
      </div>
    </div>
  )
}

// Compact inline label/value pair for the hero's meta strip — deliberately not
// a boxed .stat card, so four low-density facts don't read as four more panels.
function MetaFact({ icon, lbl, val, tone }: { icon: React.ReactNode; lbl: string; val: React.ReactNode; tone?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      <span style={{ width: 32, height: 32, borderRadius: 9, background: "var(--bg-inset)", color: tone ?? "var(--text-mute)", display: "grid", placeItems: "center", flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ minWidth: 0 }}>
        <span className="tiny muted" style={{ display: "block" }}>{lbl}</span>
        <span className="b tabular" style={{ fontSize: 15, color: tone ?? "var(--text)", display: "block", whiteSpace: "nowrap" }}>{val}</span>
      </span>
    </div>
  )
}

function ScoreCard({ audit, report }: { audit: Audit; report: AuditReport }) {
  const overall = report.scoring?.overall
  const categories = report.scoring?.categories ?? {}
  const onPage = categories.onPage
  const total = overall?.score ?? 0
  const tone = scoreToneVar(total)
  const pagesAnalyzed = report.pagesAnalyzed ?? report.pages?.length ?? null
  const issuesCount = report.issues?.length ?? 0
  const passingCount = report.passingChecks?.length ?? 0

  return (
    <div
      className="card oa-hero oa-fade-up"
      style={{
        marginBottom: 16,
        background: `radial-gradient(ellipse 760px 260px at 0% 0%, ${tone.bg}, transparent 60%), radial-gradient(ellipse 500px 200px at 100% 120%, var(--brand-soft), transparent 65%), var(--bg-elev)`,
        borderTop: `3px solid ${tone.color}`,
      }}
    >
      <div className="grid g-21" style={{ gap: 28, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
          <ScoreRing value={total} color={tone.color} />
          <div style={{ minWidth: 0 }}>
            <span
              className="tiny b"
              style={{
                display: "inline-block", marginBottom: 10, padding: "3px 10px", borderRadius: 999,
                textTransform: "uppercase", letterSpacing: "0.06em",
                background: `linear-gradient(135deg, ${tone.bg}, transparent)`,
                border: `1px solid color-mix(in srgb, ${tone.color} 40%, transparent)`, color: tone.color,
              }}
            >
              Grade {overall?.grade ?? "—"}{overall?.tier ? ` · ${overall.tier}` : ""}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 220 }}>
              <ScoreBar label="On-Page SEO" value={onPage?.score ?? null} />
              {categories.technical && <ScoreBar label={CATEGORY_LABELS.technical} value={categories.technical.score} />}
              {categories.performance && <ScoreBar label={CATEGORY_LABELS.performance} value={categories.performance.score} />}
            </div>
          </div>
        </div>
        <div className="tiny muted" style={{ lineHeight: 1.5 }}>
          Overall audit score across technical, on-page, performance, accessibility, links, structured data &amp; security. Expand the sections below for every check and prioritized fix.
        </div>
      </div>

      <div
        className="row"
        style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid var(--border)", gap: 28, flexWrap: "wrap" }}
      >
        <MetaFact icon={<Icon.monitor size={15} />} lbl="Pages analyzed" val={pagesAnalyzed ?? "—"} />
        <MetaFact icon={<Icon.close />} lbl="Issues found" val={issuesCount} tone={issuesCount > 0 ? "var(--neg)" : undefined} />
        <MetaFact icon={<Icon.check size={15} />} lbl="Passing checks" val={passingCount} tone="var(--pos)" />
        <MetaFact icon={<Icon.refresh />} lbl="Audited" val={audit.completedAt ? fmtDate(audit.completedAt) : "—"} />
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
      <div className="halo">
        <div className="page-h" style={{ marginBottom: 0 }}>
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
          <ScoreCard audit={audit} report={audit.report} />
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
