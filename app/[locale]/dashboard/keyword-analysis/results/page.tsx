"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useRouter } from "@/i18n/navigation"
import { api } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"
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

// Score band → tone, matching the Page Score Checker's pos/brand/neg palette.
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
        <div style={{ height: "100%", width: `${width}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${scoreToneVar(target).color} 75%, transparent), ${scoreToneVar(target).color})`, borderRadius: 999, transition: "width .8s cubic-bezier(.16,1,.3,1)" }} />
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
          <linearGradient id="ka-ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.65" />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-inset)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="url(#ka-ring-grad)" strokeWidth={stroke}
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

// Ring gauge for the Domain/Page Authority overview stats — a smaller, static
// sibling of the hero ScoreRing, paired with a label underneath instead of a
// number inline, since these read as secondary stats rather than a headline.
function AuthorityRing({ value, label, caption }: { value: number | null; label: string; caption: string }) {
  const display = useCountUp(value ?? 0)
  const tone = scoreToneVar(value ?? 0)
  const size = 96
  const stroke = 7
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, display))
  const offset = c - (pct / 100) * c
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 9 }}>
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-inset)" strokeWidth={stroke} />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={tone.color} strokeWidth={stroke}
            strokeDasharray={c} strokeDashoffset={offset}
            strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dashoffset .8s cubic-bezier(.16,1,.3,1)" }}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 27, fontWeight: 800, lineHeight: 1 }}>{value ?? "—"}</span>
          <span style={{ fontSize: 9.5, color: "var(--text-mute)", fontWeight: 600, marginTop: 3 }}>/ 100</span>
        </div>
      </div>
      <div style={{ textAlign: "center" }}>
        <div className="tiny b">{label}</div>
        <div style={{ fontSize: 10.5, color: "var(--text-mute)" }}>{caption}</div>
      </div>
    </div>
  )
}

// Backlink counts are unbounded, so the bar fill is log-scaled against the
// same reference ceilings the scorer itself uses for off-page credit (see
// DOMAIN_REF/PAGE_REF in lib/seoScorer.ts) — kept local since this is purely
// a visual fill %, not a score input.
const BACKLINK_REF = { domain: 1_000_000, page: 10_000 }
function backlinkPct(value: number | null, ceiling: number): number {
  const v = value ?? 0
  if (v <= 0) return 0
  return Math.max(3, Math.min(100, (Math.log10(v + 1) / Math.log10(ceiling)) * 100))
}

function BacklinkBar({ label, value, caption, ceiling }: { label: string; value: number | null; caption: string; ceiling: number }) {
  const pct = backlinkPct(value, ceiling)
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 7 }}>
        <span className="tiny" style={{ color: "var(--text-mute)", fontWeight: 600 }}>{label}</span>
        <span style={{ fontWeight: 800 }}>{value?.toLocaleString() ?? "—"}</span>
      </div>
      <div style={{ height: 10, borderRadius: 999, background: "var(--bg-inset)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "var(--brand)", borderRadius: 999, transition: "width .8s cubic-bezier(.16,1,.3,1)" }} />
      </div>
      <div style={{ fontSize: 10.5, color: "var(--text-mute)", marginTop: 5 }}>{caption}</div>
    </div>
  )
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 4.5V8L10.5 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function OverviewIconStat({
  icon, label, value, tone, sub,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  tone: { color: string; bg: string }
  sub?: React.ReactNode
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
      <span
        style={{
          width: 36, height: 36, borderRadius: "var(--r-sm)", background: tone.bg, color: tone.color,
          display: "grid", placeItems: "center", flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <div>
        <div className="tiny muted">{label}</div>
        <div style={{ fontSize: 18, fontWeight: 800 }}>{value}{sub}</div>
      </div>
    </div>
  )
}

function ScoreCard({ crawlData, keyword, url }: { crawlData: CrawlData; keyword: string; url: string }) {
  const score = computeSeoScore(crawlData, keyword, url)
  const tone = scoreToneVar(score.total)

  const httpStatus = crawlData.httpStatus
  const statusTone: "pos" | "warn" | "neg" = httpStatus >= 200 && httpStatus < 300 ? "pos" : httpStatus >= 400 ? "neg" : "warn"
  const statusColors = statusTone === "pos" ? { color: "var(--pos)", bg: "var(--pos-soft)" }
    : statusTone === "neg" ? { color: "var(--neg)", bg: "var(--neg-soft)" }
    : { color: "var(--warn)", bg: "var(--warn-soft)" }

  return (
    <>
      <div
        className="card oa-fade-up"
        style={{
          marginBottom: 14,
          background: "var(--bg-elev)",
          border: `1px solid ${tone.color}`,
          boxShadow: `0 6px 24px color-mix(in srgb, ${tone.color} 7%, transparent)`,
        }}
      >
        <div className="grid g-21" style={{ gap: 28, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
            <ScoreRing value={score.total} color={tone.color} />
            <div style={{ minWidth: 0 }}>
              <span
                className="tiny b"
                style={{
                  display: "inline-block", marginBottom: 10, padding: "5px 11px", borderRadius: 999,
                  textTransform: "uppercase", letterSpacing: "0.03em",
                  background: tone.bg, border: "1px solid var(--border)", color: tone.color,
                }}
              >
                Grade {score.grade} · {score.label}
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 220 }}>
                <ScoreBar label="On-Page SEO" value={score.onPageScore} />
                <ScoreBar label="Off-Page SEO" value={score.offPageScore} />
              </div>
            </div>
          </div>
          <div className="tiny muted" style={{ lineHeight: 1.5, maxWidth: 260 }}>
            Overall score blends 12 on-page factors with off-page authority (Domain/Page Authority &amp; backlinks). Expand the sections below for the full breakdown.
          </div>
        </div>
      </div>

      <div className="card oa-fade-up d1" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 34, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 24 }}>
            <AuthorityRing value={score.da} label="Domain Authority" caption="Moz · site-wide" />
            <AuthorityRing value={score.pa} label="Page Authority" caption="Moz · this URL" />
          </div>
          <div style={{ width: 1, alignSelf: "stretch", background: "var(--border)" }} />
          <div style={{ flex: 1, minWidth: 240, display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Backlinks</div>
            <BacklinkBar label="Domain Backlinks" value={score.domainBacklinks} caption="Site-wide" ceiling={BACKLINK_REF.domain} />
            <BacklinkBar label="Page Backlinks" value={score.pageBacklinks} caption="This URL" ceiling={BACKLINK_REF.page} />
          </div>
        </div>

        <div style={{ height: 1, background: "var(--border)", margin: "22px 0 18px" }} />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          <OverviewIconStat
            icon={<Icon.check />}
            label="HTTP Status"
            value={httpStatus || "N/A"}
            tone={statusColors}
            sub={statusTone === "pos" ? <span style={{ fontSize: 11, color: "var(--pos)", fontWeight: 700, marginLeft: 6 }}>OK</span> : null}
          />
          <OverviewIconStat
            icon={<Icon.menu />}
            label="Word Count"
            value={(crawlData.content?.wordCount ?? 0).toLocaleString()}
            tone={{ color: "var(--brand)", bg: "var(--brand-soft)" }}
          />
          <OverviewIconStat
            icon={<ClockIcon />}
            label="Crawl Time"
            value={`${((crawlData.crawlTime || 0) / 1000).toFixed(1)}s`}
            tone={{ color: "var(--brand)", bg: "var(--brand-soft)" }}
          />
        </div>
      </div>
    </>
  )
}

function ResultsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = searchParams.get("id") || ""
  // Context when launched from a project keyword's "Score" CTA — save the
  // computed score back onto that keyword once the analysis completes.
  const projectId = searchParams.get("projectId") || ""
  const keywordId = searchParams.get("keywordId") || ""
  const fromProject = !!(projectId && keywordId)

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

  // Mirror THIS report's score onto the originating keyword. The number sent is
  // exactly the one rendered below (same computeSeoScore over the same stored
  // crawlData), and pageScoreUrl points the keyword at the page that was scored —
  // so the keywords table shows this exact number and later report write-backs
  // match the same page. Idempotent: the server-side write-back normally already
  // stored this value, so this is a no-op re-write rather than a change. Fires once.
  const syncedRef = useRef(false)
  useEffect(() => {
    if (!fromProject || syncedRef.current) return
    if (status !== "COMPLETED" || !analysis?.crawlData) return
    syncedRef.current = true
    const total = computeSeoScore(analysis.crawlData as CrawlData, analysis.keyword, analysis.url).total
    api
      .post(`/api/projects/${projectId}/keywords/${keywordId}/sync-score`, {
        pageScore: total,
        pageScoreUrl: analysis.url,
      })
      .catch(() => { /* best-effort — the report itself is still valid */ })
  }, [status, analysis?.crawlData, analysis?.keyword, analysis?.url, fromProject, projectId, keywordId])

  return (
    <div className="page">
      <div className="page-h">
        <div style={{ minWidth: 0 }}>
          <button
            className="btn sm kd-back-btn"
            onClick={() => router.push(fromProject ? `/dashboard/project/${projectId}/keywords` : "/dashboard/keyword-analysis")}
            style={{ marginBottom: 14 }}
          >
            <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><Icon.chevR /></span>
            {fromProject ? "Back to project" : "Back"}
          </button>
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

      {/* Back-to-project affordance — only when launched from a project keyword.
          The keyword's score is computed & stored automatically on the server, so
          this is just navigation, not a save step. */}
      {fromProject && status === "COMPLETED" && (
        <div
          className="card tight"
          style={{
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 13,
            borderColor: "var(--brand)",
            background: "var(--brand-soft)",
            color: "var(--brand)",
          }}
        >
          <Icon.spark />
          <span style={{ flex: 1 }}>This is the detailed score for your tracked keyword.</span>
          <button
            className="btn sm"
            onClick={() => router.push(`/dashboard/project/${projectId}/keywords`)}
          >
            Back to project <Icon.chevR />
          </button>
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
