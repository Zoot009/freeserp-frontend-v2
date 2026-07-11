"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useRouter } from "@/i18n/navigation"
import { api } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"
import { StatTile } from "@/components/dashboard/primitives"
import { KeywordAnalysisReport } from "@/components/keyword-analysis-report"
import { computeSeoScore } from "@/lib/seoScorer"
import type { CrawlData } from "@/types/competitor-analysis"

type Analysis = {
  id: string
  keyword: string
  url: string
  domain: string | null
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"
  error: string | null
  crawlData: CrawlData | null
  domainAuthority: number | null
  pageAuthority: number | null
  domainBacklinks: number | null
  pageBacklinks: number | null
  createdAt: string
  completedAt: string | null
}

const POLL_MS = 2500

// Bar color token by 0–100 score, matching the dashboard's pos/warn/neg palette.
function barColor(v: number): string {
  if (v >= 80) return "var(--pos)"
  if (v >= 60) return "var(--warn)"
  return "var(--neg)"
}

// Soft/tint counterpart of barColor — used for gradient washes & chip backgrounds.
function bandSoft(v: number): string {
  if (v >= 80) return "var(--pos-soft)"
  if (v >= 60) return "var(--warn-soft)"
  return "var(--neg-soft)"
}

function bandChipClass(v: number): string {
  if (v >= 80) return "chip pos"
  if (v >= 60) return "chip warn"
  return "chip neg"
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
        <div style={{ height: "100%", width: `${v}%`, background: barColor(v), borderRadius: 999, transition: "width .3s" }} />
      </div>
    </div>
  )
}

// Circular gauge for the overall score — reads at a glance far better than a
// bare number, and the ring color/fill communicate the grade band instantly.
function ScoreRing({ value, size = 128 }: { value: number; size?: number }) {
  const stroke = 10
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value))
  const offset = c - (pct / 100) * c
  const color = barColor(value)
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-inset)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset .6s ease" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div className="tabular" style={{ fontSize: 34, fontWeight: 700, lineHeight: 1, color }}>{value}</div>
        <div className="tiny muted" style={{ marginTop: 2 }}>/ 100</div>
      </div>
    </div>
  )
}

function ScoreCard({ crawlData, keyword, url }: { crawlData: CrawlData; keyword: string; url: string }) {
  const score = computeSeoScore(crawlData, keyword, url)
  const color = barColor(score.total)
  return (
    <>
      <div className="card" style={{ marginBottom: 16, borderTop: `3px solid ${color}`, position: "relative", overflow: "hidden" }}>
        <div
          aria-hidden
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: `radial-gradient(500px circle at -5% -25%, ${bandSoft(score.total)}, transparent 60%)`,
          }}
        />
        <div className="grid g-21" style={{ gap: 24, alignItems: "center", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
            <ScoreRing value={score.total} />
            <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 12 }}>
              <span className={bandChipClass(score.total)} style={{ width: "fit-content" }}>{score.grade} · {score.label}</span>
              <ScoreBar label="On-Page SEO" value={score.onPageScore} />
              <ScoreBar label="Off-Page SEO" value={score.offPageScore} />
            </div>
          </div>
          <div className="tiny muted" style={{ lineHeight: 1.5 }}>
            Overall score blends 12 on-page factors with off-page authority (Domain/Page Authority &amp; backlinks). Expand the sections below for the full breakdown.
          </div>
        </div>
      </div>

      <div className="grid g-4" style={{ marginBottom: 16 }}>
        <StatTile icon={<Icon.chart />} lbl="Domain Authority" val={score.da ?? "—"} tip="0–100 (Moz)" />
        <StatTile icon={<Icon.chart />} lbl="Page Authority" val={score.pa ?? "—"} tip="0–100 (Moz)" />
        <StatTile icon={<Icon.external />} lbl="Domain Backlinks" val={score.domainBacklinks?.toLocaleString() ?? "—"} tip="Site-wide" />
        <StatTile icon={<Icon.external />} lbl="Page Backlinks" val={score.pageBacklinks?.toLocaleString() ?? "—"} tip="This URL" />
      </div>
    </>
  )
}

function ResultsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = searchParams.get("id") || ""

  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!id) {
      setError("Missing analysis id.")
      return
    }
    let cancelled = false

    const poll = async () => {
      try {
        const data = await api.get<{ analysis: Analysis }>(`/api/keyword-analysis/${id}`)
        if (cancelled) return
        setAnalysis(data.analysis)
        if (data.analysis.status === "PENDING" || data.analysis.status === "PROCESSING") {
          timer.current = setTimeout(poll, POLL_MS)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load analysis.")
      }
    }
    poll()

    return () => {
      cancelled = true
      if (timer.current) clearTimeout(timer.current)
    }
  }, [id])

  const status = analysis?.status
  const inProgress = !analysis || status === "PENDING" || status === "PROCESSING"

  return (
    <div className="page">
      <div className="page-h">
        <div style={{ minWidth: 0 }}>
          <button
            className="btn sm"
            onClick={() => router.push("/dashboard/keyword-analysis")}
            style={{ marginBottom: 12 }}
          >
            <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><Icon.chevR /></span> Back
          </button>
          <div className="eyebrow"><span className="spark"><Icon.search /></span> Keyword Analysis</div>
          <h1>Page report</h1>
          {analysis && (
            <div className="sub" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span>
                <a className="url" href={analysis.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand)" }}>
                  {analysis.url.replace(/^https?:\/\//, "")}
                </a>
              </span>
              <span>Keyword: <span className="b" style={{ color: "var(--text)" }}>&quot;{analysis.keyword}&quot;</span></span>
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {(error || status === "FAILED") && (
        <div className="card" style={{ display: "flex", gap: 10, alignItems: "flex-start", borderColor: "var(--neg)", background: "var(--neg-soft)" }}>
          <span style={{ color: "var(--neg)", flexShrink: 0, marginTop: 1 }}><Icon.close /></span>
          <div className="tiny" style={{ color: "var(--neg)" }}>
            {error || analysis?.error || "Analysis failed. Please try again."}
          </div>
        </div>
      )}

      {/* Loading */}
      {!error && inProgress && status !== "FAILED" && (
        <div className="card" style={{ padding: 60, textAlign: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <span className="spin" style={{ display: "inline-flex", color: "var(--brand)" }}><Icon.refresh /></span>
            <div>
              <div className="b" style={{ fontSize: 14, marginBottom: 4 }}>Analyzing your page…</div>
              <div className="tiny muted">Crawling content, checking technical SEO, fetching authority signals</div>
              <div className="tiny muted" style={{ marginTop: 6, opacity: 0.7 }}>This usually takes 10–40 seconds</div>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {!error && status === "COMPLETED" && analysis?.crawlData && (
        <>
          <ScoreCard crawlData={analysis.crawlData} keyword={analysis.keyword} url={analysis.url} />
          <KeywordAnalysisReport crawlData={analysis.crawlData} keyword={analysis.keyword} />
        </>
      )}
    </div>
  )
}

export default function KeywordAnalysisResultsPage() {
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
