"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useRouter } from "@/i18n/navigation"
import { api, ApiError } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"
import { CreditCost } from "@/components/dashboard/credit-cost"
import { CREDIT_ACTION_KEYS } from "@/lib/credits"
import { KeywordAnalysisReport } from "@/components/keyword-analysis-report"
import { computeSeoScore } from "@/lib/seoScorer"
import { crawlErrorCopy } from "@/lib/crawl-error"
import type { CrawlData, CrawlError } from "@/types/competitor-analysis"

type Analysis = {
  id: string
  keyword: string
  url: string
  domain: string | null
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"
  error: string | null
  crawlData: CrawlData | null
  crawlMethod: string | null
  domainAuthority: number | null
  pageAuthority: number | null
  domainBacklinks: number | null
  pageBacklinks: number | null
  createdAt: string
  completedAt: string | null
}

const POLL_MS = 2500
// Polls that fail back off to this, rather than giving up.
const MAX_BACKOFF_MS = 30_000
// Past this, a pending check says it's slow instead of promising "10–40 seconds".
const SLOW_AFTER_MS = 60_000

// Same words the worker stores on a failed check; older reports of an unreadable
// page were saved as COMPLETED with no error to show.
const UNREADABLE_TEXT =
  "We couldn't read this page, so it wasn't scored. It may be blocking automated visits, down, or too slow to respond — check it opens in a browser, then run it again."

// Every crawl method failed ("minimal" is the placeholder the crawler returns
// then). The worker now fails these checks; reports from before that were saved
// as COMPLETED with a score for a page nobody saw, so both are shown as unread.
const isUnreadable = (a: Analysis) => a.crawlMethod === "minimal"

// The worker records the DA/PA provider's status with the crawl; "unavailable"
// means the call failed (an outage), so the score is on-page only.
const offPageUnavailable = (c: CrawlData) =>
  (c.authority as { status?: string } | null | undefined)?.status === "unavailable"

// The DA/PA provider is configurable, and the crawl records which one produced
// the numbers. One we can't name ("none", or an old row without it) is left
// out rather than guessed.
const AUTHORITY_PROVIDER: Record<string, string> = { moz: "Moz", dataforseo: "DataForSEO" }

// Layout that has to change with width. The two score cards follow their own
// width (container queries), not the viewport's — the sidebar decides how much
// room they get. The header action follows .page-h, which stacks at 640px.
const LAYOUT_CSS = `
  .ka-rerun { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0; }
  .ka-rerun-err { max-width: 260px; text-align: right; }
  @media (max-width: 640px) {
    .ka-rerun { flex-direction: row; flex-wrap: wrap; align-items: center; column-gap: 12px; }
    .ka-rerun-err { max-width: none; flex-basis: 100%; text-align: left; }
  }

  .ka-hero-card, .ka-auth-card { container-type: inline-size; }
  .ka-hero { display: grid; grid-template-columns: auto minmax(0, 1fr) 300px; gap: 20px 28px; align-items: center; }
  .ka-hero-note { align-self: stretch; display: flex; align-items: center; padding-left: 28px; border-left: 1px solid var(--border); }
  @container (max-width: 720px) {
    .ka-hero { grid-template-columns: auto minmax(0, 1fr); }
    .ka-hero-note { grid-column: 1 / -1; padding: 16px 0 0; border-left: 0; border-top: 1px solid var(--border); }
  }
  @container (max-width: 440px) {
    .ka-hero { grid-template-columns: minmax(0, 1fr); justify-items: center; }
    .ka-hero-bars, .ka-hero-note { justify-self: stretch; }
    .ka-hero-bars { text-align: center; }
  }

  .ka-auth { display: flex; gap: 34px; align-items: center; }
  .ka-auth-sep { width: 1px; align-self: stretch; background: var(--border); }
  .ka-ov-stat { display: flex; align-items: center; gap: 11px; }
  @container (max-width: 560px) {
    .ka-auth { flex-direction: column; align-items: stretch; gap: 20px; }
    .ka-auth-rings { justify-content: space-evenly; }
    .ka-auth-sep { width: auto; height: 1px; }
  }
  @container (max-width: 480px) {
    .ka-ov-stat { flex-direction: column; gap: 8px; text-align: center; }
  }
`

// Score band → tone, using the shared pos/brand/neg palette.
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

// Both backlink bars share one linear scale — the larger count fills the track
// — so their lengths compare the way the numbers do: 1,200 domain vs 45 page
// backlinks is a long bar and a sliver. Each used to be log-scaled against its
// own ceiling, which drew those two at nearly the same length. A non-zero count
// keeps a 2% sliver so it can't pass for none.
function backlinkPct(value: number | null, max: number): number {
  if (!value || value <= 0 || max <= 0) return 0
  return Math.max(2, (value / max) * 100)
}

function BacklinkBar({ label, value, caption, max }: { label: string; value: number | null; caption: string; max: number }) {
  const pct = backlinkPct(value, max)
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
    <div className="ka-ov-stat">
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
  const offPageMissing = offPageUnavailable(crawlData)
  const provider = AUTHORITY_PROVIDER[crawlData.authority?.source?.toLowerCase() ?? ""]
  const backlinkMax = Math.max(score.domainBacklinks ?? 0, score.pageBacklinks ?? 0)

  const httpStatus = crawlData.httpStatus
  const statusTone: "pos" | "warn" | "neg" = httpStatus >= 200 && httpStatus < 300 ? "pos" : httpStatus >= 400 ? "neg" : "warn"
  const statusColors = statusTone === "pos" ? { color: "var(--pos)", bg: "var(--pos-soft)" }
    : statusTone === "neg" ? { color: "var(--neg)", bg: "var(--neg-soft)" }
    : { color: "var(--warn)", bg: "var(--warn-soft)" }

  return (
    <>
      <div
        className="card oa-fade-up ka-hero-card"
        style={{
          marginBottom: 14,
          background: "var(--bg-elev)",
          border: `1px solid ${tone.color}`,
          boxShadow: `0 6px 24px color-mix(in srgb, ${tone.color} 7%, transparent)`,
        }}
      >
        <div className="ka-hero">
          <ScoreRing value={score.total} color={tone.color} />
          <div className="ka-hero-bars">
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
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <ScoreBar label="On-Page SEO" value={score.onPageScore} />
              <ScoreBar label="Off-Page SEO" value={score.offPageScore} />
            </div>
          </div>
          {/* Without off-page data the scorer falls back to on-page only — a
              different scale (on-page 70 + off-page 35 is 46 normally, 70 here) —
              so say so rather than let the number pass for a full score. */}
          {offPageMissing ? (
            <div className="tiny ka-hero-note" style={{ lineHeight: 1.5, color: "var(--warn)" }}>
              Off-page couldn&apos;t be measured — our authority data provider didn&apos;t respond, so this score covers on-page SEO only and isn&apos;t comparable with a full score. It won&apos;t update your tracked keywords. Run it again later for the full score.
            </div>
          ) : (
            <div className="tiny muted ka-hero-note" style={{ lineHeight: 1.5 }}>
              Overall score blends 12 on-page factors with off-page authority (Domain/Page Authority &amp; backlinks). Expand the sections below for the full breakdown.
            </div>
          )}
        </div>
      </div>

      <div className="card oa-fade-up d1 ka-auth-card" style={{ marginBottom: 16 }}>
        <div className="ka-auth">
          <div className="ka-auth-rings" style={{ display: "flex", gap: 24 }}>
            <AuthorityRing value={score.da} label="Domain Authority" caption={provider ? `${provider} · site-wide` : "Site-wide"} />
            <AuthorityRing value={score.pa} label="Page Authority" caption={provider ? `${provider} · this URL` : "This URL"} />
          </div>
          <div className="ka-auth-sep" />
          <div style={{ flex: 1, minWidth: 240, display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Backlinks</div>
            <BacklinkBar label="Domain Backlinks" value={score.domainBacklinks} caption="Site-wide" max={backlinkMax} />
            <BacklinkBar label="Page Backlinks" value={score.pageBacklinks} caption="This URL" max={backlinkMax} />
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
  const id = useSearchParams().get("id") || ""
  // Keyed by id: "Run again" navigates to this same page with a new id, and a
  // fresh mount means the old run's result, errors and one-shot sync don't carry
  // over onto the new one.
  return <Results key={id} id={id} />
}

function Results({ id }: { id: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Context when launched from a project keyword's "Score" CTA — save the
  // computed score back onto that keyword once the analysis completes.
  const projectId = searchParams.get("projectId") || ""
  const keywordId = searchParams.get("keywordId") || ""
  const fromProject = !!(projectId && keywordId)

  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [error, setError] = useState<string | null>(null)
  // A poll failed and is being retried — a quiet note, not an error.
  const [reconnecting, setReconnecting] = useState(false)
  const [slow, setSlow] = useState(false)
  const [rerunning, setRerunning] = useState(false)
  const [rerunError, setRerunError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!id) {
      setError("Missing analysis id.")
      return
    }
    let cancelled = false
    let failures = 0

    const poll = async () => {
      try {
        const data = await api.get<{ analysis: Analysis }>(`/api/keyword-analysis/${id}`)
        if (cancelled) return
        failures = 0
        setReconnecting(false)
        setAnalysis(data.analysis)
        if (data.analysis.status === "PENDING" || data.analysis.status === "PROCESSING") {
          setSlow(Date.now() - new Date(data.analysis.createdAt).getTime() > SLOW_AFTER_MS)
          timer.current = setTimeout(poll, POLL_MS)
        }
      } catch (err) {
        if (cancelled) return
        // Only "this report isn't there for you" is final. Anything else — a
        // network blip, a deploy, a 5xx — used to stop polling for good and hide
        // a check that was still running; keep asking, backing off each time.
        if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
          setError("This report doesn't exist, or it belongs to another account.")
          return
        }
        failures += 1
        setReconnecting(true)
        timer.current = setTimeout(poll, Math.min(MAX_BACKOFF_MS, POLL_MS * 2 ** failures))
      }
    }
    poll()

    return () => {
      cancelled = true
      if (timer.current) clearTimeout(timer.current)
    }
  }, [id])

  // Same url + keyword as a fresh check (charged like a new one), opened in place.
  const rerun = async () => {
    setRerunning(true)
    setRerunError(null)
    try {
      const res = await api.post<{ analysis: { id: string } }>(`/api/keyword-analysis/${id}/rerun`)
      const ctx = fromProject ? `&projectId=${projectId}&keywordId=${keywordId}` : ""
      router.push(`/dashboard/keyword-analysis/results?id=${res.analysis.id}${ctx}`)
    } catch (err) {
      setRerunError(err instanceof ApiError ? err.message : "Couldn't start a new check. Please try again.")
      setRerunning(false)
    }
  }

  const status = analysis?.status
  const inProgress = !analysis || status === "PENDING" || status === "PROCESSING"
  const unreadable = !!analysis && isUnreadable(analysis)
  const failed = status === "FAILED" || unreadable
  const offPageMissing = status === "COMPLETED" && !!analysis?.crawlData && offPageUnavailable(analysis.crawlData)

  // Mirror THIS report's score onto the originating keyword. The number sent is
  // exactly the one rendered below (same computeSeoScore over the same stored
  // crawlData), and pageScoreUrl points the keyword at the page that was scored —
  // so the keywords table shows this exact number and later report write-backs
  // match the same page. Idempotent: the server-side write-back normally already
  // stored this value, so this is a no-op re-write rather than a change. Fires once.
  // Never for an unread page or an on-page-only score from a DA/PA outage — the
  // server doesn't write those back either, so the keyword keeps a real number.
  const syncedRef = useRef(false)
  useEffect(() => {
    if (!fromProject || syncedRef.current) return
    if (status !== "COMPLETED" || !analysis?.crawlData || unreadable || offPageMissing) return
    syncedRef.current = true
    const total = computeSeoScore(analysis.crawlData as CrawlData, analysis.keyword, analysis.url).total
    api
      .post(`/api/projects/${projectId}/keywords/${keywordId}/sync-score`, {
        pageScore: total,
        pageScoreUrl: analysis.url,
      })
      .catch(() => { /* best-effort — the report itself is still valid */ })
  }, [status, analysis?.crawlData, analysis?.keyword, analysis?.url, unreadable, offPageMissing, fromProject, projectId, keywordId])

  return (
    <div className="page">
      <style>{LAYOUT_CSS}</style>
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
          <h1>Keyword score report</h1>
          {analysis && (
            <div className="sub" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span>
                {/* A long URL has no spaces to wrap at — let it break anywhere
                    rather than run off a phone screen. */}
                <a className="url" href={analysis.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand)", overflowWrap: "anywhere" }}>
                  {analysis.url.replace(/^https?:\/\//, "")}
                </a>
              </span>
              <span>Keyword: <span className="b" style={{ color: "var(--text)" }}>&quot;{analysis.keyword}&quot;</span></span>
            </div>
          )}
        </div>
        {!error && !inProgress && (
          <div className="ka-rerun">
            <button className="btn sm" onClick={rerun} disabled={rerunning}>
              <span className={rerunning ? "spin" : undefined} style={{ display: "inline-flex" }}><Icon.refresh /></span>
              {rerunning ? "Starting…" : "Run again"}
            </button>
            <CreditCost action={CREDIT_ACTION_KEYS.keywordScore} showBalance={false} />
            {rerunError && <span className="tiny ka-rerun-err" style={{ color: "var(--neg)" }}>{rerunError}</span>}
          </div>
        )}
      </div>

      {/* Error — a check that failed, or a page we couldn't read (never scored). */}
      {(error || failed) && (
        <div className="card" style={{ display: "flex", gap: 10, alignItems: "flex-start", borderColor: "var(--neg)", background: "var(--neg-soft)" }}>
          <span style={{ color: "var(--neg)", flexShrink: 0, marginTop: 1 }}><Icon.close /></span>
          <div className="tiny" style={{ color: "var(--neg)" }}>
            {error ? error : unreadable ? (
              <>
                <b>{crawlErrorCopy((analysis?.crawlData as { crawlError?: CrawlError } | null)?.crawlError).label}.</b>{" "}
                {analysis?.error || UNREADABLE_TEXT}
              </>
            ) : analysis?.error || "Analysis failed. Please try again."}
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
              <div className="tiny muted" style={{ marginTop: 6, opacity: 0.7 }}>
                {slow
                  ? "This is taking longer than usual — some pages are slow to load. It keeps running if you leave this page."
                  : "This usually takes 10–40 seconds"}
              </div>
              {reconnecting && (
                <div className="tiny muted" style={{ marginTop: 6 }}>Connection lost — reconnecting…</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Back-to-project affordance — only when launched from a project keyword.
          The keyword's score is computed & stored automatically on the server, so
          this is just navigation, not a save step. */}
      {fromProject && status === "COMPLETED" && !unreadable && (
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
      {!error && status === "COMPLETED" && analysis?.crawlData && !unreadable && (
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
