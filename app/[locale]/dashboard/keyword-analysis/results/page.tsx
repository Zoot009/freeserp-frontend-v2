"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useRouter } from "@/i18n/navigation"
import { api, ApiError } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"
import { CreditCost } from "@/components/dashboard/credit-cost"
import { Elapsed } from "@/components/dashboard/primitives"
import { InfoHint } from "@/components/dashboard/widget"
import { CREDIT_ACTION_KEYS } from "@/lib/credits"
import { KeywordAnalysisReport } from "@/components/keyword-analysis-report"
import { computeSeoScore, onPageFactors, type OnPageFactorKey, type SeoScoreBreakdown } from "@/lib/seoScorer"
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

// What each on-page factor checks, in the scorer's own terms (lib/seoScorer.ts),
// so a low bar says what to change rather than just that something is wrong.
const FACTOR: Record<OnPageFactorKey, { label: string; checks: string }> = {
  url: { label: "URL", checks: "The keyword in the domain and the page's path" },
  title: { label: "Title tag", checks: "30–60 characters, with the keyword in it" },
  meta: { label: "Meta description", checks: "120–160 characters, with the keyword in it" },
  content: { label: "Content", checks: "1,500+ words, with the keyword in the first 100" },
  headings: { label: "Headings", checks: "One H1 with the keyword, 3+ H2s, the keyword in an H2 and an H3" },
  images: { label: "Images", checks: "Alt text on every image, and the keyword in one" },
  schema: { label: "Structured data", checks: "Schema markup on the page" },
  structure: { label: "Rich content", checks: "A table of contents, an FAQ section and a video" },
  lighthouse: { label: "Lighthouse", checks: "Google's performance, SEO, accessibility and best-practice scores" },
  cwv: { label: "Page speed", checks: "Fast TTFB, FCP, LCP and TBT, and a low CLS" },
  links: { label: "Links", checks: "10+ internal and 3+ external links, the keyword in internal anchors" },
  anchors: { label: "Link placement", checks: "Links in the main content, header and footer, the keyword in one" },
}

// Layout that has to change with width. The report follows its own width
// (a container query on .ka-body), not the viewport's: the sidebar decides how
// much room it gets. The header action follows .page-h, which stacks at 640px.
const LAYOUT_CSS = `
  .ka-rerun { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0; }
  .ka-rerun-err { max-width: 260px; text-align: right; }
  @media (max-width: 640px) {
    .ka-rerun { flex-direction: row; flex-wrap: wrap; align-items: center; column-gap: 12px; }
    .ka-rerun-err { max-width: none; flex-basis: 100%; text-align: left; }
  }

  .ka-eyebrow { margin-bottom: 6px; font-size: 11.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--brand); }
  .ka-facts { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 14px; margin-top: 6px; }
  .ka-fact { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }

  .ka-body { container-type: inline-size; }

  .ka-hero { display: flex; align-items: center; gap: 28px; margin-bottom: 16px; }
  .ka-hero-main { flex: 1; min-width: 0; }
  .ka-hero-h { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; }
  .ka-grade { font-size: 11.5px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; padding: 4px 10px; border-radius: 999px; }
  .ka-verdict { margin: 8px 0 18px; font-size: 14px; line-height: 1.5; color: var(--text-soft); max-width: 720px; }
  .ka-parts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 32px; max-width: 760px; }
  .ka-part-h { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 7px; }
  .ka-part-lbl { font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--text-mute); }
  .ka-part-w { font-weight: 500; letter-spacing: 0; text-transform: none; margin-left: 6px; opacity: .8; }
  .ka-part-val { font-size: 20px; font-weight: 600; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
  .ka-meter { height: 6px; border-radius: 999px; background: var(--bg-inset); overflow: hidden; }
  .ka-meter > span { display: block; height: 100%; border-radius: inherit; transition: width .8s cubic-bezier(.16,1,.3,1); }

  .ka-factor { display: grid; grid-template-columns: minmax(0, 1fr) minmax(120px, 240px) 56px; gap: 6px 20px; align-items: center; padding: 11px 0; border-top: 1px solid var(--border); }
  .ka-factor:first-child { border-top: 0; padding-top: 0; }
  .ka-factor-name b { display: block; font-size: 13px; font-weight: 600; }
  .ka-factor-name span { display: block; margin-top: 1px; font-size: 12px; color: var(--text-mute); }
  .ka-factor-val { text-align: right; font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .ka-factor-val small { font-size: 11.5px; font-weight: 500; color: var(--text-mute); }
  .ka-factor.off .ka-factor-name b { color: var(--text-mute); }

  .ka-auth-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
  .ka-auth-val { font-size: 22px; font-weight: 600; letter-spacing: -.02em; line-height: 1.15; font-variant-numeric: tabular-nums; }
  .ka-auth-val small { font-size: 12px; font-weight: 500; color: var(--text-mute); margin-left: 2px; }
  .ka-auth-cap { font-size: 11.5px; color: var(--text-mute); margin-top: 2px; }

  @container (max-width: 720px) {
    .ka-auth-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @container (max-width: 560px) {
    .ka-hero { flex-direction: column; align-items: stretch; gap: 16px; }
    .ka-hero > :first-child { align-self: center; }
    .ka-parts { grid-template-columns: minmax(0, 1fr); }
    .ka-factor { grid-template-columns: minmax(0, 1fr) 56px; }
    .ka-factor .ka-meter { grid-column: 1 / -1; grid-row: 2; }
  }
`

// Score band → tone, using the shared pos/brand/neg palette.
function scoreToneVar(v: number): { color: string; bg: string } {
  if (v >= 80) return { color: "var(--pos)", bg: "var(--pos-soft)" }
  if (v >= 60) return { color: "var(--brand)", bg: "var(--brand-soft)" }
  return { color: "var(--neg)", bg: "var(--neg-soft)" }
}

// A part of a whole: green when most of it is earned, amber past half, red below.
function shareColor(ratio: number): string {
  return ratio >= 0.8 ? "var(--pos)" : ratio >= 0.5 ? "var(--warn)" : "var(--neg)"
}

/**
 * One sentence on where the score comes from. Off-page is 70% of it, so a
 * well-built page on a young site scores low; saying so points the reader at
 * the right lever instead of leaving "43, Poor" to speak for itself.
 */
function verdict(on: number, off: number | null): string {
  if (off == null) return "Off-page couldn't be measured, so this is an on-page score only."
  if (on >= 70 && off >= 70) return "Strong on both fronts: the page is well built, and the site has the authority to back it."
  if (on >= 70) return "The page itself is in good shape. Its authority and backlinks are what hold the score down."
  if (off >= 70) return "The site has the authority; the page itself needs work. Start with the biggest gaps below."
  return "Both the page and its authority have room to grow. Start with the biggest gaps below."
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

// A bar that grows from nothing on mount, so a report's bars fill as it opens.
function Meter({ pct, color }: { pct: number; color: string }) {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setWidth(Math.max(0, Math.min(100, pct))))
    return () => cancelAnimationFrame(raf)
  }, [pct])
  return <div className="ka-meter"><span style={{ width: `${width}%`, background: color }} /></div>
}

// The headline score, coloured by band. Fills and counts up together on mount
// so the score is revealed rather than printed.
function ScoreRing({ value, color, size = 120, stroke = 10 }: { value: number; color: string; size?: number; stroke?: number }) {
  const display = useCountUp(value)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, display))
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-inset)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c}
          strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
        <div>
          <div style={{ fontSize: 34, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums", color }}>{Math.round(display)}</div>
          <div style={{ fontSize: 11, color: "var(--text-mute)", fontWeight: 500, marginTop: 3 }}>/ 100</div>
        </div>
      </div>
    </div>
  )
}

function ScoreHero({ score, offPageMissing }: { score: SeoScoreBreakdown; offPageMissing: boolean }) {
  const tone = scoreToneVar(score.total)
  return (
    <div className="card ka-hero oa-fade-up">
      <ScoreRing value={score.total} color={tone.color} />
      <div className="ka-hero-main">
        <div className="ka-hero-h">
          <span className="b" style={{ fontSize: 16 }}>Overall score</span>
          <span className="ka-grade" style={{ background: tone.bg, color: tone.color }}>Grade {score.grade} · {score.label}</span>
          <InfoHint>
            On-page SEO counts for 30% of this score and off-page authority (Domain and Page Authority, backlinks)
            for 70%. When authority can&apos;t be measured, the score is on-page only.
          </InfoHint>
        </div>
        {/* Without off-page data the scorer falls back to on-page only — a
            different scale (on-page 70 + off-page 35 is 46 normally, 70 here) —
            so say so rather than let the number pass for a full score. */}
        <p className="ka-verdict" style={offPageMissing ? { color: "var(--warn)" } : undefined}>
          {offPageMissing
            ? "Off-page couldn't be measured: our authority data provider didn't respond, so this score covers on-page SEO only and isn't comparable with a full score. It won't update your tracked keywords. Run it again later for the full score."
            : verdict(score.onPageScore, score.offPageScore)}
        </p>
        <div className="ka-parts">
          <Part label="On-page SEO" weight={offPageMissing ? "the whole score" : "30% of score"} value={score.onPageScore} />
          <Part label="Off-page SEO" weight="70% of score" value={offPageMissing ? null : score.offPageScore} />
        </div>
      </div>
    </div>
  )
}

function Part({ label, weight, value }: { label: string; weight: string; value: number | null }) {
  return (
    <div>
      <div className="ka-part-h">
        <span className="ka-part-lbl">{label}<span className="ka-part-w">· {weight}</span></span>
        <span className="ka-part-val" style={value == null ? { fontSize: 13, color: "var(--text-mute)", fontWeight: 500 } : undefined}>
          {value ?? "Not measured"}
        </span>
      </div>
      <Meter pct={value ?? 0} color={scoreToneVar(value ?? 0).color} />
    </div>
  )
}

/**
 * The twelve on-page factors, the biggest shortfall first. The tool's own help
 * says the work comes back in priority order; this is that order, on the
 * scorer's real weights, before the section-by-section detail.
 */
function FactorsCard({ crawlData, score }: { crawlData: CrawlData; score: SeoScoreBreakdown }) {
  const rows = onPageFactors(crawlData, score)
  return (
    <div className="card oa-fade-up d1" style={{ marginBottom: 16 }}>
      <div className="card-h">
        <div style={{ minWidth: 0 }}>
          <div className="b">On-page factors</div>
          <div className="tiny muted" style={{ marginTop: 2 }}>Biggest gaps first: the top of this list is where points are easiest to win.</div>
        </div>
        <span className="chip outline tabular" style={{ flexShrink: 0 }}>{score.onPageScore} / 100</span>
      </div>
      <div>
        {rows.map(({ key, score: got, max }) => (
          <div key={key} className={max == null ? "ka-factor off" : "ka-factor"}>
            <div className="ka-factor-name">
              <b>{FACTOR[key].label}</b>
              <span>{FACTOR[key].checks}</span>
            </div>
            {max == null ? (
              <span className="tiny muted" style={{ gridColumn: "2 / -1", textAlign: "right" }}>Not measured</span>
            ) : (
              <>
                <Meter pct={(got / max) * 100} color={shareColor(got / max)} />
                <span className="ka-factor-val">{got}<small>/{max}</small></span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function AuthorityCard({ score, provider, missing }: { score: SeoScoreBreakdown; provider?: string; missing: boolean }) {
  return (
    <div className="card oa-fade-up d1" style={{ marginBottom: 16 }}>
      <div className="card-h">
        <div style={{ minWidth: 0 }}>
          <div className="b">Authority &amp; backlinks</div>
          <div className="tiny muted" style={{ marginTop: 2 }}>{missing ? "Not measured this time" : "Off-page: 70% of the score"}</div>
        </div>
        {provider && !missing && <span className="chip outline" style={{ flexShrink: 0 }}>{provider}</span>}
      </div>
      {missing ? (
        <div className="tiny" style={{ color: "var(--warn)", lineHeight: 1.5 }}>
          Our authority data provider didn&apos;t respond. Run the check again later for Domain and Page Authority and backlinks.
        </div>
      ) : (
        <div className="ka-auth-grid">
          <AuthStat label="Domain Authority" value={score.da} outOf={100} caption="Site-wide" />
          <AuthStat label="Page Authority" value={score.pa} outOf={100} caption="This page" />
          <AuthStat label="Domain backlinks" value={score.domainBacklinks} caption="Site-wide" />
          <AuthStat label="Page backlinks" value={score.pageBacklinks} caption="This page" />
        </div>
      )}
      <div className="tiny muted" style={{ marginTop: 14, lineHeight: 1.5 }}>
        Authority grows as relevant sites link to yours. It moves slowly, so the on-page factors are the quicker wins.
      </div>
    </div>
  )
}

function AuthStat({ label, value, outOf, caption }: { label: string; value: number | null; outOf?: number; caption: string }) {
  return (
    <div className="mini-tile">
      <div className="mini-tile-lbl">{label}</div>
      <div className="ka-auth-val">
        {value != null ? value.toLocaleString() : "—"}
        {outOf && value != null && <small>/{outOf}</small>}
      </div>
      <div className="ka-auth-cap">{caption}</div>
      {outOf && value != null && (
        <div style={{ marginTop: 8 }}><Meter pct={(value / outOf) * 100} color={scoreToneVar(value).color} /></div>
      )}
    </div>
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
  const showReport = !error && status === "COMPLETED" && !!analysis?.crawlData && !unreadable

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

  const crawl = showReport ? (analysis!.crawlData as CrawlData) : null
  const score = crawl ? computeSeoScore(crawl, analysis!.keyword, analysis!.url) : null
  const http = crawl?.httpStatus ?? 0
  const httpColor = http >= 200 && http < 300 ? "var(--pos)" : http >= 400 ? "var(--neg)" : "var(--warn)"

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
          {/* The keyword is the report's subject, so it's the title; "Keyword
              score report" was the same heading on every report. */}
          <div className="ka-eyebrow">Keyword score report</div>
          <h1 style={{ overflowWrap: "anywhere" }}>{analysis ? analysis.keyword : "Loading report…"}</h1>
          {analysis && (
            <div className="sub ka-facts">
              {/* A long URL has no spaces to wrap at — let it break anywhere
                  rather than run off a phone screen. */}
              <a className="url ka-fact" href={analysis.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand)", whiteSpace: "normal", overflowWrap: "anywhere" }}>
                {analysis.url.replace(/^https?:\/\//, "")}
                <Icon.external />
              </a>
              <span className="ka-fact">
                <Icon.clock />
                {new Date(analysis.completedAt ?? analysis.createdAt).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
              </span>
              {crawl && (
                <>
                  <span className="ka-fact" style={{ color: httpColor, fontWeight: 600 }}>HTTP {http || "N/A"}</span>
                  <span className="ka-fact">{(crawl.content?.wordCount ?? 0).toLocaleString()} words</span>
                  <span className="ka-fact">Crawled in {((crawl.crawlTime || 0) / 1000).toFixed(1)}s</span>
                </>
              )}
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

      {/* In progress: the rank tracker's "checking" strip, with a running
          clock, over the shape of the report to come. */}
      {!error && inProgress && status !== "FAILED" && (
        <div aria-busy="true">
          <div className="card tight check-banner" style={{ marginBottom: 16 }}>
            <div className="row" style={{ gap: 12, alignItems: "center" }}>
              <span
                className="spin"
                aria-hidden
                style={{
                  width: 18, height: 18, borderRadius: "50%", flexShrink: 0, boxSizing: "border-box",
                  border: "2.5px solid color-mix(in srgb, var(--brand) 25%, transparent)", borderTopColor: "var(--brand)",
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="b" role="status" style={{ fontSize: 13, color: "var(--brand)" }}>Analyzing your page…</div>
                <div className="tiny" style={{ color: "var(--brand)", opacity: 0.75, marginTop: 1 }}>
                  {slow
                    ? "Taking longer than usual: some pages are slow to load. It keeps running if you leave this page."
                    : "Crawling the content, checking technical SEO and fetching authority. Usually 10–40 seconds."}
                  {analysis && <> · <span aria-hidden><Elapsed since={new Date(analysis.createdAt).getTime()} /></span></>}
                  {reconnecting && " · Connection lost, reconnecting…"}
                </div>
              </div>
            </div>
            <div className="check-bar" aria-hidden><span /></div>
          </div>
          <div className="card ka-hero">
            {/* Inline: the shared .skeleton rule sets its own corners. */}
            <div className="skeleton" style={{ width: 120, height: 120, borderRadius: "50%", flexShrink: 0 }} />
            <div className="ka-hero-main">
              <div className="skeleton" style={{ height: 16, width: 220 }} />
              <div className="skeleton" style={{ height: 12, width: "70%", marginTop: 14 }} />
              <div className="ka-parts" style={{ marginTop: 22 }}>
                <div className="skeleton" style={{ height: 30 }} />
                <div className="skeleton" style={{ height: 30 }} />
              </div>
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

      {/* The report: the score and where it comes from, what to fix first,
          authority, then every check section by section. */}
      {crawl && score && (
        <div className="ka-body">
          {/* Overall, then its two halves in detail: off-page (one row, as
              it's four numbers) and on-page (the list of what to fix). */}
          <ScoreHero score={score} offPageMissing={offPageMissing} />
          <AuthorityCard
            score={score}
            provider={AUTHORITY_PROVIDER[crawl.authority?.source?.toLowerCase() ?? ""]}
            missing={offPageMissing}
          />
          <FactorsCard crawlData={crawl} score={score} />
          <KeywordAnalysisReport crawlData={crawl} keyword={analysis!.keyword} />
        </div>
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
