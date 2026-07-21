"use client"

import React, { useState } from "react"
import { CheckCircle, XCircle, ChevronDown, ChevronUp } from "lucide-react"
import type { AnalysisData } from "@/types/competitor-analysis"
import { computeSeoScore, scoreColor, type SeoScoreBreakdown } from "@/lib/seoScorer"
import { crawlErrorCopy } from "@/lib/crawl-error"

interface Props {
  analysis: AnalysisData
  onRecrawl?: (domain: string) => void
  recrawlingDomains?: Set<string>
}

// Circular score gauge (donut) for the SEO Score panel. Color-coded by the same
// thresholds as scoreColor (>=80 pos / >=60 warn / else neg). The arc animates
// in. Renders "—" when the score is null (crawl failed / no data).
function ScoreDonut({ score, grade, label }: { score: number | null; grade?: string | null; label?: string | null }) {
  if (score == null) {
    return <span className="text-[14px] text-[color:var(--text-mute)]">—</span>
  }
  const color = score >= 80 ? 'var(--pos)' : score >= 60 ? 'var(--warn)' : 'var(--neg)'
  const R = 38
  const C = 2 * Math.PI * R
  const dash = (score / 100) * C
  return (
    <div className="inline-flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: 84, height: 84 }}>
        <svg width="84" height="84" viewBox="0 0 88 88" style={{ transform: 'rotate(-90deg)' }} aria-hidden>
          <circle cx="44" cy="44" r={R} fill="none" stroke="var(--bg-inset)" strokeWidth="7" />
          <circle
            cx="44" cy="44" r={R} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
            strokeDasharray={`${dash} ${C}`}
            style={{ transition: 'stroke-dasharray .6s cubic-bezier(.16,1,.3,1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-sans font-semibold tabular-nums text-[24px] leading-none" style={{ color }}>{score}</span>
        </div>
      </div>
      {(grade || label) && (
        <div className="text-[11px] text-[color:var(--text-mute)] text-center leading-tight">
          {grade}{grade && label ? ' · ' : ''}{label}
        </div>
      )}
    </div>
  )
}

export function CompetitorComparisonTable({ analysis, onRecrawl, recrawlingDomains = new Set() }: Props) {
  const rankStripe = (pos: number | null) => {
    if (pos === null) return 'bg-[color:var(--bg-inset)]'
    if (pos <= 3) return 'bg-[color:var(--pos)]'
    if (pos <= 10) return 'bg-[color:var(--warn)]'
    return 'bg-[color:var(--neg)]'
  }
  const rankText = (pos: number | null) => {
    if (pos === null) return 'text-[color:var(--text-mute)]'
    if (pos <= 3) return 'text-[color:var(--pos)]'
    if (pos <= 10) return 'text-[color:var(--warn)]'
    return 'text-[color:var(--neg)]'
  }

  const [scoreBreakdownOpen, setScoreBreakdownOpen] = useState(false)

  const yourScore: SeoScoreBreakdown | null = React.useMemo(
    () => analysis.yourFullCrawlData
      ? computeSeoScore(analysis.yourFullCrawlData, analysis.keyword, analysis.yourUrl)
      : null,
    [analysis.yourFullCrawlData, analysis.keyword, analysis.yourUrl]
  )

  const compScores: (SeoScoreBreakdown | null)[] = React.useMemo(
    () => analysis.competitors.map(c =>
      c.fullCrawlData
        ? computeSeoScore(c.fullCrawlData, analysis.keyword, c.url)
        : null
    ),
    [analysis.competitors, analysis.keyword]
  )

  return (
              <div
                className="cmp-compare oa-fade-up w-full overflow-x-auto border border-[color:var(--border)] bg-[color:var(--bg-sub)]"
                style={{ borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-sm)', WebkitOverflowScrolling: 'touch', overscrollBehaviorX: 'contain' }}
              >
                {/* min-width keeps columns readable on small screens — the table
                    scrolls horizontally with the metric-label column pinned. */}
                <table
                  className="w-full border-separate table-fixed"
                  style={{ minWidth: `${(analysis.competitors.length + 2) * 150}px` }}
                >
                  <colgroup>
                    <col className="w-[128px] sm:w-[180px]" />
                    <col />
                    {analysis.competitors.map((_, i) => <col key={i} />)}
                  </colgroup>
                  <thead>
                    <tr className="align-top">

                      {/* Corner — pinned top + left; CSS (.cmp-corner) owns its styling */}
                      <th className="cmp-corner" />

                      {/* Your Business — brand-tinted floating card, anchored vs competitors. */}
                      <th className="cmp-you text-center align-top">
                        <div className="cmp-head-tile you">
                          <div className="h-[3px] w-full bg-[color:var(--brand)]" />
                          <div className="px-2 pt-2.5 pb-2.5 sm:px-3 sm:pt-3 sm:pb-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--brand)] mb-1">Your Business</p>
                            <p className="font-sans font-medium text-[13.5px] text-[color:var(--text)] leading-tight mb-2 truncate" title={analysis.yourDomain}>
                              {analysis.yourDomain}
                            </p>
                            <p className={`font-sans font-semibold tabular-nums text-2xl tracking-tight leading-none ${rankText(analysis.yourPosition)}`}>
                              {analysis.yourPosition ? `#${analysis.yourPosition}` : '—'}
                            </p>
                            <p className="text-[11px] text-[color:var(--text-mute)] mt-1">
                              {analysis.yourPosition ? 'SERP Position' : 'Not Ranked'}
                            </p>
                          </div>
                        </div>
                      </th>

                      {/* Competitors */}
                      {analysis.competitors.map((comp, i) => {
                        const isFailed = comp.crawlMethod === 'failed' || comp.crawlMethod === 'minimal' || comp.wordCount === 0
                        const isRecrawling = recrawlingDomains.has(comp.domain)
                        const err = isFailed ? crawlErrorCopy(comp.crawlError) : null
                        return (
                          <th key={i} className="text-center align-top">
                            <div className={`cmp-head-tile${isFailed ? ' failed' : ''}`}>
                            <div className={`h-[3px] w-full ${isFailed ? 'bg-[color:var(--neg)]' : rankStripe(comp.position)}`} />
                            <div className="px-2 pt-2.5 pb-2.5 sm:px-3 sm:pt-3 sm:pb-3">
                              {/* invisible spacer to keep header heights aligned with the "Your Business" cell */}
                              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] mb-1 opacity-0 select-none">·</p>
                              <p className="font-sans font-medium text-[13.5px] text-[color:var(--text)] leading-tight mb-2 truncate" title={comp.domain}>
                                {comp.domain}
                              </p>
                              {isFailed || isRecrawling ? (
                                <>
                                  <p className="font-sans font-semibold tabular-nums text-2xl tracking-tight leading-none text-[color:var(--neg)]">—</p>
                                  {/* A healthy domain being manually recrawled must not read as a failure. */}
                                  {isFailed ? (
                                    <p
                                      className="text-[11px] text-[color:var(--neg)] mt-1 cursor-help underline decoration-dotted underline-offset-2"
                                      title={err!.detail}
                                    >
                                      {err!.label}
                                    </p>
                                  ) : (
                                    <p className="text-[11px] text-[color:var(--text-mute)] mt-1">Fetching…</p>
                                  )}
                                  <div className="mt-2">
                                    {isRecrawling ? (
                                      <span
                                        className="inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--warn)] animate-pulse px-2 py-1 bg-[color:var(--warn-soft)]"
                                        style={{ borderRadius: 'var(--r-sm)' }}
                                      >
                                        Recrawling…
                                      </span>
                                    ) : err?.retryable ? (
                                      <button
                                        onClick={() => onRecrawl?.(comp.domain)}
                                        className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 border border-[color:var(--border)] text-[color:var(--text-soft)] bg-[color:var(--bg)] hover:bg-[color:var(--bg-inset)] hover:text-[color:var(--text)] transition-colors"
                                        style={{ borderRadius: 'var(--r-sm)' }}
                                      >
                                        ↺ Recrawl
                                      </button>
                                    ) : null}
                                  </div>
                                </>
                              ) : (
                                <>
                                  <p className={`font-sans font-semibold tabular-nums text-2xl tracking-tight leading-none ${rankText(comp.position)}`}>
                                    {comp.position ? `#${comp.position}` : '—'}
                                  </p>
                                  <p className="text-[11px] text-[color:var(--text-mute)] mt-1">
                                    {comp.position ? 'SERP Position' : 'Not Ranked'}
                                  </p>
                                </>
                              )}
                            </div>
                            </div>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const yourCrawl = analysis.yourFullCrawlData
                      const compCrawls = analysis.competitors.map(c => c.fullCrawlData)

                      const Cell = ({ children, highlight }: { children: React.ReactNode; highlight?: 'best' | 'worst' | 'neutral' }) => (
                        <td className={`border-r last:border-r-0 border-b border-[color:var(--border)] p-2.5 sm:p-4 text-center align-middle ${highlight === 'best' ? 'bg-[color:var(--pos-soft)]' : highlight === 'worst' ? 'bg-[color:var(--neg-soft)]' : ''}`}>
                          {children}
                        </td>
                      )

                      const Label = ({ label, sub }: { label: string; sub?: string }) => (
                        <td className="sticky left-0 z-[2] border-r border-b border-[color:var(--border)] bg-[color:var(--bg-sub)] px-2.5 py-2.5 sm:px-3.5 sm:py-3 align-middle shadow-[2px_0_4px_-2px_rgba(11,13,18,0.12)]">
                          <div className="text-[11.5px] sm:text-[12px] font-medium text-[color:var(--text)]">{label}</div>
                          {sub && <div className="text-[10px] sm:text-[10.5px] text-[color:var(--text-mute)] mt-0.5">{sub}</div>}
                        </td>
                      )

                      const SectionRow = ({ title, colSpan }: { title: string; colSpan: number }) => (
                        <tr className="cmp-section">
                          <td colSpan={colSpan}>
                            {/* Elevated panel header bar; title stays pinned left while scrolling. */}
                            <div className="cmp-section-head">
                              <span className="cmp-section-title">
                                <span className="cmp-section-tick" />
                                {title}
                              </span>
                            </div>
                          </td>
                        </tr>
                      )

                      const totalCols = 2 + analysis.competitors.length

                      const rankNums = (yours: number | null, comps: (number | null)[]) => {
                        const all = [yours, ...comps]
                        const valid = all.filter((v): v is number => v !== null && !isNaN(v))
                        const max = valid.length ? Math.max(...valid) : null
                        const min = valid.length ? Math.min(...valid) : null
                        const highlight = (v: number | null, higherIsBetter = true): 'best' | 'worst' | 'neutral' => {
                          if (v === null || max === null || min === null || max === min) return 'neutral'
                          if (higherIsBetter) return v === max ? 'best' : v === min ? 'worst' : 'neutral'
                          return v === min ? 'best' : v === max ? 'worst' : 'neutral'
                        }
                        return { highlight }
                      }

                      const yourTitle = yourCrawl?.metaTags?.title ?? null
                      const yourTitleLen = yourCrawl?.metaTags?.titleLength ?? null
                      const yourDesc = yourCrawl?.metaTags?.description ?? null
                      const yourDescLen = yourCrawl?.metaTags?.descriptionLength ?? null
                      const yourWordCount = yourCrawl?.content?.wordCount ?? analysis.yourWordCount
                      const yourH1 = yourCrawl?.headings?.h1?.length ?? analysis.yourH1Count
                      const yourH2 = yourCrawl?.headings?.h2?.length ?? analysis.yourH2Count
                      const yourH3 = yourCrawl?.headings?.h3?.length ?? analysis.yourH3Count
                      const yourH4 = yourCrawl?.headings?.h4?.length ?? null
                      const yourH5 = yourCrawl?.headings?.h5?.length ?? null
                      const yourImages = yourCrawl?.imageAnalysis?.total ?? analysis.yourImageCount
                      const yourImagesAlt = yourCrawl?.imageAnalysis?.withAlt ?? null
                      const yourKwOccurrences = yourCrawl?.keywordAnalysis?.occurrences ?? null

                      const compTitleLens = compCrawls.map(c => c?.metaTags?.titleLength ?? null)
                      const compDescLens = compCrawls.map(c => c?.metaTags?.descriptionLength ?? null)
                      const compWordCounts = analysis.competitors.map((c, i) => compCrawls[i]?.content?.wordCount ?? c.wordCount)
                      const compH1s = analysis.competitors.map((c, i) => compCrawls[i]?.headings?.h1?.length ?? c.h1Count)
                      const compH2s = analysis.competitors.map((c, i) => compCrawls[i]?.headings?.h2?.length ?? c.h2Count)
                      const compH3s = analysis.competitors.map((c, i) => compCrawls[i]?.headings?.h3?.length ?? c.h3Count)
                      const compH4s = compCrawls.map(c => c?.headings?.h4?.length ?? null)
                      const compH5s = compCrawls.map(c => c?.headings?.h5?.length ?? null)
                      const compImages = analysis.competitors.map((c, i) => compCrawls[i]?.imageAnalysis?.total ?? c.imageCount)
                      const compImagesAlt = compCrawls.map(c => c?.imageAnalysis?.withAlt ?? null)
                      const compKwOccurrences = compCrawls.map(c => c?.keywordAnalysis?.occurrences ?? null)

                      const fmt = (v: number | null, suffix = '') => v !== null && !isNaN(v) ? `${v.toLocaleString()}${suffix}` : '—'
                      const fmtBool = (v: boolean | null) =>
                        v === null ? <span className="text-[color:var(--text-mute)] font-mono text-xs">—</span> :
                        v ? <CheckCircle className="h-4 w-4 text-[color:var(--pos)] mx-auto" /> : <XCircle className="h-4 w-4 text-[color:var(--neg)] mx-auto" />

                      const NumCell = ({ value, highlight }: { value: number | null; highlight?: 'best' | 'worst' | 'neutral' }) => (
                        <Cell highlight={highlight}>
                          <span className="font-sans font-semibold tabular-nums text-[15px] text-[color:var(--text)]">{fmt(value)}</span>
                        </Cell>
                      )

                      const BoolCell = ({ value }: { value: boolean | null }) => (
                        <Cell>
                          <div className="flex justify-center">{fmtBool(value)}</div>
                        </Cell>
                      )

                      const STOP_WORDS = new Set(['a','an','the','and','or','but','in','on','at','to','for','of','with','by','from','is','are','was','were','be','been','being','as','it','its','this','that','these','those','i','my','your','our','we','they','he','she','not','no','so','do','does','did','has','have','had','can','will','would','should','could','may','might','into','about','up','out'])

                      const TitleLenColor = (len: number | null) => {
                        if (len === null) return 'text-[color:var(--text-mute)]'
                        if (len >= 30 && len <= 60) return 'text-[color:var(--pos)]'
                        if (len >= 20 && len <= 70) return 'text-[color:var(--warn)]'
                        return 'text-[color:var(--neg)]'
                      }

                      const DescLenColor = (len: number | null) => {
                        if (len === null) return 'text-[color:var(--text-mute)]'
                        if (len >= 120 && len <= 160) return 'text-[color:var(--pos)]'
                        if (len >= 70 && len <= 200) return 'text-[color:var(--warn)]'
                        return 'text-[color:var(--neg)]'
                      }

                      const wc = rankNums(yourWordCount, compWordCounts)
                      const h1r = rankNums(yourH1, compH1s)
                      const h2r = rankNums(yourH2, compH2s)
                      const h3r = rankNums(yourH3, compH3s)
                      const h4r = rankNums(yourH4, compH4s)
                      const h5r = rankNums(yourH5, compH5s)
                      const imgr = rankNums(yourImages, compImages)

                      // Speed metrics
                      // Prefer PSI (real Lighthouse) values over crawler measurements when available
                      const yourTtfb = yourCrawl?.psiData?.vitals?.ttfb ?? yourCrawl?.performance?.ttfb ?? null
                      const yourFcp = yourCrawl?.psiData?.vitals?.fcp ?? yourCrawl?.performance?.webVitals?.fcp ?? null
                      const yourLcp = yourCrawl?.psiData?.vitals?.lcp ?? yourCrawl?.performance?.webVitals?.lcp ?? null
                      const yourCls = yourCrawl?.psiData?.vitals?.cls ?? yourCrawl?.performance?.webVitals?.cls ?? null
                      const yourTbt = yourCrawl?.psiData?.vitals?.tbt ?? null
                      const compTtfb = compCrawls.map(c => c?.psiData?.vitals?.ttfb ?? c?.performance?.ttfb ?? null)
                      const compFcp = compCrawls.map(c => c?.psiData?.vitals?.fcp ?? c?.performance?.webVitals?.fcp ?? null)
                      const compLcp = compCrawls.map(c => c?.psiData?.vitals?.lcp ?? c?.performance?.webVitals?.lcp ?? null)
                      const compCls = compCrawls.map(c => c?.psiData?.vitals?.cls ?? c?.performance?.webVitals?.cls ?? null)
                      const compTbt = compCrawls.map(c => c?.psiData?.vitals?.tbt ?? null)
                      const hasPsi = !!(yourCrawl?.psiData || compCrawls.some(c => c?.psiData))
                      // Lighthouse scores (PSI only)
                      const yourPerfScore = yourCrawl?.psiData?.scores?.performance ?? null
                      const yourSeoScore = yourCrawl?.psiData?.scores?.seo ?? null
                      const yourA11yScore = yourCrawl?.psiData?.scores?.accessibility ?? null
                      const yourBpScore = yourCrawl?.psiData?.scores?.bestPractices ?? null
                      const compPerfScore = compCrawls.map(c => c?.psiData?.scores?.performance ?? null)
                      const compSeoScore = compCrawls.map(c => c?.psiData?.scores?.seo ?? null)
                      const compA11yScore = compCrawls.map(c => c?.psiData?.scores?.accessibility ?? null)
                      const compBpScore = compCrawls.map(c => c?.psiData?.scores?.bestPractices ?? null)
                      const ttfbR = rankNums(yourTtfb, compTtfb)
                      const fcpR = rankNums(yourFcp, compFcp)
                      const lcpR = rankNums(yourLcp, compLcp)
                      const tbtR = rankNums(yourTbt, compTbt)
                      const perfScoreR = rankNums(yourPerfScore, compPerfScore)

                      // Link metrics — external deduped by URL
                      const dedupExternal = (crawl: typeof yourCrawl) => {
                        const links: Array<{ url?: string; isNofollow?: boolean; text?: string }> = crawl?.linkAnalysis?.externalLinks ?? []
                        const unique = [...new Map(links.map(l => [l.url, l])).values()].filter(l => l.url)
                        const total = unique.length || (crawl?.linkAnalysis?.external ?? null)
                        const nofollow = unique.filter(l => l.isNofollow).length
                        const dofollow = typeof total === 'number' ? total - nofollow : null
                        return { total: unique.length ? unique.length : (crawl?.linkAnalysis?.external ?? null), nofollow, dofollow, unique }
                      }
                      const yourExtData = dedupExternal(yourCrawl)
                      const yourExtLinks = yourExtData.total
                      const yourExtNofollow = yourExtData.nofollow
                      const yourExtDofollow = yourExtData.dofollow

                      const dedupInternal = (crawl: typeof yourCrawl): number | null => {
                        const links = crawl?.linkAnalysis?.internalLinks
                        if (!Array.isArray(links)) return crawl?.linkAnalysis?.internal ?? null
                        return new Set(links.map((l: { url?: string }) => l.url).filter(Boolean)).size
                      }
                      const yourIntLinks = dedupInternal(yourCrawl)

                      const compExtData = compCrawls.map(c => dedupExternal(c))
                      const compExtLinks = compExtData.map(d => d.total)
                      const compExtNofollow = compExtData.map(d => d.nofollow)
                      const compExtDofollow = compExtData.map(d => d.dofollow)
                      const compIntLinks = compCrawls.map(c => dedupInternal(c))

                      const extR = rankNums(yourExtLinks, compExtLinks)
                      const intR = rankNums(yourIntLinks, compIntLinks)

                      // Keyword in alt text helper
                      const kwInAlt = (crawl: typeof yourCrawl) => {
                        if (!crawl?.imageAnalysis?.images) return null
                        const kw = analysis.keyword?.toLowerCase() || ''
                        if (!kw) return null
                        return crawl.imageAnalysis.images.some((img: { alt?: string }) => img.alt?.toLowerCase().includes(kw))
                      }

                      // Anchor text helpers
                      const sectionLinkCount = (crawl: typeof yourCrawl, section: string) =>
                        crawl?.linkAnalysis?.internalLinks?.filter((l: { section?: string }) => l.section === section).length ?? null

                      // Score cell with mini category breakdown
                      const SCORE_CATEGORIES = [
                        { key: 'url',        label: 'URL',        max: 5  },
                        { key: 'title',      label: 'Title',      max: 10 },
                        { key: 'meta',       label: 'Meta',       max: 8  },
                        { key: 'content',    label: 'Content',    max: 12 },
                        { key: 'headings',   label: 'Headings',   max: 10 },
                        { key: 'images',     label: 'Images',     max: 5  },
                        { key: 'schema',     label: 'Schema',     max: 5  },
                        { key: 'structure',  label: 'Structure',  max: 6  },
                        { key: 'lighthouse', label: 'Lighthouse', max: 15 },
                        { key: 'cwv',        label: 'CWV',        max: 10 },
                        { key: 'links',      label: 'Links',      max: 12 },
                        { key: 'anchors',    label: 'Anchors',    max: 5  },
                      ] as const

                      const ScoreDetailCell = ({ score }: { score: SeoScoreBreakdown | null }) => (
                        <td className="border-r last:border-r-0 border-b border-[color:var(--border)] p-1.5 sm:p-3 align-middle">
                          {score ? (
                            <div className="space-y-1">
                              {SCORE_CATEGORIES.map(({ key, label, max }) => {
                                const val = score[key] as number
                                const pct = max > 0 ? val / max : 0
                                const barColor = pct >= 0.8 ? 'bg-[color:var(--pos)]' : pct >= 0.5 ? 'bg-[color:var(--warn)]' : 'bg-[color:var(--neg)]'
                                const textColor = pct >= 0.8 ? 'text-[color:var(--pos)]' : pct >= 0.5 ? 'text-[color:var(--warn)]' : 'text-[color:var(--neg)]'
                                return (
                                  <div key={key} className="flex items-center gap-1.5 sm:gap-2">
                                    <span className="text-[10px] font-medium text-[color:var(--text-mute)] w-9 sm:w-14 shrink-0 text-right">{label}</span>
                                    <div className="flex-1 min-w-[16px] bg-[color:var(--bg-inset)] rounded-full h-1 overflow-hidden">
                                      <div className={`h-1 rounded-full ${barColor}`} style={{ width: `${pct * 100}%` }} />
                                    </div>
                                    <span className={`tabular-nums text-[10px] sm:text-[11px] font-semibold w-9 sm:w-12 text-right ${textColor}`}>{val}/{max}</span>
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <span className="text-[14px] text-[color:var(--text-mute)]">—</span>
                          )}
                        </td>
                      )

                      // On/Off-page sub-score row (value out of 100; "—" when null).
                      const SubScoreRow = ({ label, sub, pick }: { label: string; sub?: string; pick: (s: SeoScoreBreakdown) => number | null }) => {
                        const cell = (s: SeoScoreBreakdown | null) => {
                          const v = s ? pick(s) : null
                          if (v == null) return <span className="text-[13px] text-[color:var(--text-mute)]">—</span>
                          const barColor = v >= 80 ? 'var(--pos)' : v >= 60 ? 'var(--warn)' : 'var(--neg)'
                          return (
                            <div className="inline-flex flex-col items-center gap-1.5 w-full max-w-[120px] mx-auto">
                              <span className={`font-sans font-semibold tabular-nums text-lg ${scoreColor(v)}`}>{v}<span className="text-[10px] text-[color:var(--text-mute)] font-normal"> /100</span></span>
                              <div className="w-full bg-[color:var(--bg-inset)] rounded-full h-1.5 overflow-hidden">
                                <div className="h-1.5 rounded-full" style={{ width: `${v}%`, background: barColor, transition: 'width .6s cubic-bezier(.16,1,.3,1)' }} />
                              </div>
                            </div>
                          )
                        }
                        return (
                          <tr>
                            <Label label={label} sub={sub} />
                            <Cell>{cell(yourScore)}</Cell>
                            {compScores.map((s, i) => <Cell key={i}>{cell(s)}</Cell>)}
                          </tr>
                        )
                      }

                      // Off-page metric row (DA/PA as /100 scores, or raw backlink counts),
                      // with best/worst highlighting (higher is better).
                      const OffPageRow = ({ label, sub, pick, kind }: { label: string; sub?: string; pick: (s: SeoScoreBreakdown) => number | null; kind: 'score' | 'count' }) => {
                        const nums = [yourScore, ...compScores].map(s => (s ? pick(s) : null))
                        const { highlight } = rankNums(nums[0], nums.slice(1))
                        const render = (v: number | null) =>
                          v == null
                            ? <span className="text-[13px] text-[color:var(--text-mute)]">—</span>
                            : kind === 'score'
                              ? <span className={`font-sans font-semibold tabular-nums text-[15px] ${scoreColor(v)}`}>{v}<span className="text-[10px] text-[color:var(--text-mute)] font-normal"> /100</span></span>
                              : <span className="font-sans font-semibold tabular-nums text-[15px] text-[color:var(--text)]">{v.toLocaleString()}</span>
                        return (
                          <tr>
                            <Label label={label} sub={sub} />
                            <Cell highlight={highlight(nums[0])}>{render(nums[0])}</Cell>
                            {compScores.map((_, i) => <Cell key={i} highlight={highlight(nums[i + 1])}>{render(nums[i + 1])}</Cell>)}
                          </tr>
                        )
                      }

                      return (
                        <>
                          {/* ── SEO SCORE ── */}
                          <SectionRow title="SEO Score" colSpan={totalCols} />
                          {/* Overall score row — click label to toggle breakdown */}
                          <tr>
                            <td className="sticky left-0 z-[2] border-r border-b border-[color:var(--border)] bg-[color:var(--bg-sub)] p-4 align-middle shadow-[2px_0_4px_-2px_rgba(11,13,18,0.12)]">
                              <button
                                onClick={() => setScoreBreakdownOpen(o => !o)}
                                className="flex items-center gap-1.5 text-[12px] font-medium text-[color:var(--text)] hover:text-[color:var(--brand)] transition-colors"
                              >
                                Overall Score
                                {scoreBreakdownOpen
                                  ? <ChevronUp className="h-3 w-3" />
                                  : <ChevronDown className="h-3 w-3" />}
                              </button>
                              <div className="text-[11px] text-[color:var(--text-mute)] mt-0.5">out of 100</div>
                            </td>
                            {/* your score — circular gauge */}
                            <td className="border-r border-b border-[color:var(--border)] p-4 text-center align-middle">
                              <ScoreDonut score={yourScore?.total ?? null} grade={yourScore?.grade} label={yourScore?.label} />
                            </td>
                            {/* competitor scores — circular gauges */}
                            {analysis.competitors.map((_, i) => (
                              <td key={i} className="border-r last:border-r-0 border-b border-[color:var(--border)] p-4 text-center align-middle">
                                <ScoreDonut score={compScores[i]?.total ?? null} grade={compScores[i]?.grade} label={compScores[i]?.label} />
                              </td>
                            ))}
                          </tr>
                          {/* On-page vs off-page sub-scores (the two halves of the blended Overall) */}
                          <SubScoreRow label="On-Page" sub="content & technical" pick={s => s.onPageScore} />
                          <SubScoreRow label="Off-Page" sub="authority & backlinks" pick={s => s.offPageScore} />
                          {/* Breakdown row — only rendered when open */}
                          {scoreBreakdownOpen && (
                            <tr>
                              <td className="sticky left-0 z-[2] border-r border-b border-[color:var(--border)] bg-[color:var(--bg-sub)] p-4 align-middle shadow-[2px_0_4px_-2px_rgba(11,13,18,0.12)]">
                                <div className="text-[12px] font-medium text-[color:var(--text)]">Score Breakdown</div>
                                <div className="text-[11px] text-[color:var(--text-mute)] mt-0.5">by category</div>
                              </td>
                              <ScoreDetailCell score={yourScore} />
                              {analysis.competitors.map((_, i) => (
                                <ScoreDetailCell key={i} score={compScores[i]} />
                              ))}
                            </tr>
                          )}

                          {/* ── OFF-PAGE SEO (authority + backlinks) ── */}
                          <SectionRow title="Off-Page SEO" colSpan={totalCols} />
                          <OffPageRow label="Domain Authority" sub="DA · 0–100" pick={s => s.da} kind="score" />
                          <OffPageRow label="Page Authority" sub="PA · 0–100" pick={s => s.pa} kind="score" />
                          <OffPageRow label="Backlinks — Domain" sub="total to domain" pick={s => s.domainBacklinks} kind="count" />
                          <OffPageRow label="Backlinks — Page" sub="total to ranking page" pick={s => s.pageBacklinks} kind="count" />

                          {/* ── ON-PAGE SEO (everything below) ── */}
                          <SectionRow title="On-Page SEO" colSpan={totalCols} />

                          {/* ── URL ── */}
                          {(() => {
                            const kwWords = (analysis.keyword || '')
                              .toLowerCase()
                              .split(/\s+/)
                              .filter((w: string) => w.length > 0 && !STOP_WORDS.has(w))
                            const urlFreq = (url: string | null | undefined) => {
                              if (!url || kwWords.length === 0) return null
                              const u = url.toLowerCase()
                              const freqs = kwWords.map((w: string) => ({
                                word: w,
                                count: (u.match(new RegExp(`${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g')) || []).length
                              }))
                              return (
                                <div className="flex flex-col gap-0.5 mt-1">
                                  {freqs.map(({ word, count }) => (
                                    <div key={word} className="flex items-center justify-between gap-3">
                                      <span className="text-[10.5px] font-medium text-[color:var(--text-mute)]">{word}</span>
                                      <span className={`tabular-nums text-[11px] font-semibold ${count > 0 ? 'text-[color:var(--brand)]' : 'text-[color:var(--text-mute)]'}`}>[{count}]</span>
                                    </div>
                                  ))}
                                </div>
                              )
                            }
                            const getHostname = (url: string | null | undefined) => {
                              if (!url) return null
                              try { return new URL(url).hostname.replace(/^www\./, '') } catch { return null }
                            }
                            const getPath = (url: string | null | undefined) => {
                              if (!url) return null
                              try {
                                const u = new URL(url)
                                const p = u.pathname + u.search
                                return (p === '/' || p === '') ? null : p
                              } catch { return null }
                            }
                            // keyword freq on just the path slug (not hostname)
                            const pathFreq = (url: string | null | undefined) => {
                              const path = getPath(url)
                              return path ? urlFreq(path) : <span className="text-[12px] italic text-[color:var(--text-mute)]">homepage</span>
                            }
                            return (
                              <>
                                <SectionRow title="URL" colSpan={totalCols} />
                                {/* Main Domain */}
                                <tr>
                                  <Label label="Main Domain" />
                                  <Cell>
                                    {getHostname(analysis.yourUrl)
                                      ? <span className="font-mono text-xs text-[color:var(--text-soft)]">{getHostname(analysis.yourUrl)}</span>
                                      : <span className="text-[14px] text-[color:var(--text-mute)]">—</span>}
                                  </Cell>
                                  {analysis.competitors.map((comp, i) => (
                                    <Cell key={i}>
                                      {getHostname(comp.url)
                                        ? <span className="font-mono text-xs text-[color:var(--text-soft)]">{getHostname(comp.url)}</span>
                                        : <span className="text-[14px] text-[color:var(--text-mute)]">—</span>}
                                    </Cell>
                                  ))}
                                </tr>
                                <tr>
                                  <Label label="Keyword in Domain" />
                                  <Cell>{urlFreq(getHostname(analysis.yourUrl))}</Cell>
                                  {analysis.competitors.map((comp, i) => (
                                    <Cell key={i}>{urlFreq(getHostname(comp.url))}</Cell>
                                  ))}
                                </tr>
                                {/* Ranking Page URL */}
                                <tr>
                                  <Label label="Ranking Page URL" />
                                  <Cell>
                                    {analysis.yourUrl
                                      ? <a href={analysis.yourUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-[color:var(--brand)] hover:underline break-all line-clamp-2">
                                          {analysis.yourUrl}
                                        </a>
                                      : <span className="text-[14px] text-[color:var(--text-mute)]">—</span>}
                                  </Cell>
                                  {analysis.competitors.map((comp, i) => (
                                    <Cell key={i}>
                                      {comp.url
                                        ? <a href={comp.url} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-[color:var(--brand)] hover:underline break-all line-clamp-2">
                                            {comp.url}
                                          </a>
                                        : <span className="text-[14px] text-[color:var(--text-mute)]">—</span>}
                                    </Cell>
                                  ))}
                                </tr>
                                <tr>
                                  <Label label="Keyword in Page URL" />
                                  <Cell>{pathFreq(analysis.yourUrl)}</Cell>
                                  {analysis.competitors.map((comp, i) => (
                                    <Cell key={i}>{pathFreq(comp.url)}</Cell>
                                  ))}
                                </tr>
                              </>
                            )
                          })()}

                          {/* ── TITLE ── */}
                          <SectionRow title="Title" colSpan={totalCols} />
                          {(() => {
                            const kwWords = (analysis.keyword || '')
                              .toLowerCase()
                              .split(/\s+/)
                              .filter((w: string) => w.length > 0 && !STOP_WORDS.has(w))
                            const countInTitle = (title: string | null) => {
                              if (!title || kwWords.length === 0) return []
                              const t = title.toLowerCase()
                              return kwWords.map((w: string) => ({
                                word: w,
                                count: (t.match(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')) || []).length
                              }))
                            }
                            const titleFreqRow = (title: string | null) => {
                              const freqs = countInTitle(title)
                              if (freqs.length === 0) return <span className="text-[11px] text-[color:var(--text-mute)]">—</span>
                              return (
                                <div className="flex flex-col gap-0.5 mt-1">
                                  {freqs.map(({ word, count }) => (
                                    <div key={word} className="flex items-center justify-between gap-3">
                                      <span className="text-[10.5px] font-medium text-[color:var(--text-mute)]">{word}</span>
                                      <span className={`tabular-nums text-[11px] font-semibold ${count > 0 ? 'text-[color:var(--brand)]' : 'text-[color:var(--text-mute)]'}`}>[{count}]</span>
                                    </div>
                                  ))}
                                </div>
                              )
                            }
                            return (
                              <>
                                <tr>
                                  <Label label="Title Tag" sub={`30–60 chars ideal`} />
                                  <Cell>
                                    <div className="font-sans text-[13px] text-[color:var(--text)] text-left mb-1.5 leading-snug">{yourTitle ?? '—'}</div>
                                    {yourTitleLen !== null && <span className={`tabular-nums text-[11px] font-medium ${TitleLenColor(yourTitleLen)}`}>{yourTitleLen} ch</span>}
                                  </Cell>
                                  {analysis.competitors.map((comp, i) => (
                                    <Cell key={i}>
                                      <div className="font-sans text-[13px] text-[color:var(--text)] text-left mb-1.5 leading-snug">{compCrawls[i]?.metaTags?.title ?? comp.title ?? '—'}</div>
                                      {compTitleLens[i] !== null && <span className={`tabular-nums text-[11px] font-medium ${TitleLenColor(compTitleLens[i])}`}>{compTitleLens[i]} ch</span>}
                                    </Cell>
                                  ))}
                                </tr>
                                <tr>
                                  <Label label="Keyword in Title" />
                                  <Cell>{titleFreqRow(yourTitle)}</Cell>
                                  {analysis.competitors.map((comp, i) => (
                                    <Cell key={i}>{titleFreqRow(compCrawls[i]?.metaTags?.title ?? comp.title ?? null)}</Cell>
                                  ))}
                                </tr>
                              </>
                            )
                          })()}

                          {/* ── META DESCRIPTION ── */}
                          <SectionRow title="Meta Description" colSpan={totalCols} />
                          {(() => {
                            const kwWords = (analysis.keyword || '')
                              .toLowerCase()
                              .split(/\s+/)
                              .filter((w: string) => w.length > 0 && !STOP_WORDS.has(w))
                            const countInText = (text: string | null) => {
                              if (!text || kwWords.length === 0) return []
                              const t = text.toLowerCase()
                              return kwWords.map((w: string) => ({
                                word: w,
                                count: (t.match(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')) || []).length
                              }))
                            }
                            const freqBadges = (text: string | null) => {
                              const freqs = countInText(text)
                              if (freqs.length === 0) return null
                              return (
                                <div className="flex flex-col gap-0.5">
                                  {freqs.map(({ word, count }) => (
                                    <div key={word} className="flex items-center justify-between gap-3">
                                      <span className="text-[10.5px] font-medium text-[color:var(--text-mute)]">{word}</span>
                                      <span className={`tabular-nums text-[11px] font-semibold ${count > 0 ? 'text-[color:var(--brand)]' : 'text-[color:var(--text-mute)]'}`}>[{count}]</span>
                                    </div>
                                  ))}
                                </div>
                              )
                            }
                            return (
                              <>
                                <tr>
                                  <Label label="Meta Description" sub="120–160 chars ideal" />
                                  <Cell>
                                    <div className="font-sans text-[12.5px] text-[color:var(--text-soft)] text-left mb-1.5 leading-snug">{yourDesc ?? '—'}</div>
                                    {yourDescLen !== null && <span className={`tabular-nums text-[11px] font-medium ${DescLenColor(yourDescLen)}`}>{yourDescLen} ch</span>}
                                  </Cell>
                                  {analysis.competitors.map((comp, i) => (
                                    <Cell key={i}>
                                      <div className="font-sans text-[12.5px] text-[color:var(--text-soft)] text-left mb-1.5 leading-snug">{compCrawls[i]?.metaTags?.description ?? '—'}</div>
                                      {compDescLens[i] !== null && <span className={`tabular-nums text-[11px] font-medium ${DescLenColor(compDescLens[i])}`}>{compDescLens[i]} ch</span>}
                                    </Cell>
                                  ))}
                                </tr>
                                <tr>
                                  <Label label="Keyword in Meta Desc" />
                                  <Cell>{freqBadges(yourDesc)}</Cell>
                                  {analysis.competitors.map((comp, i) => (
                                    <Cell key={i}>{freqBadges(compCrawls[i]?.metaTags?.description ?? null)}</Cell>
                                  ))}
                                </tr>
                              </>
                            )
                          })()}

                          {/* ── WORD COUNT ── */}
                          <SectionRow title="Word Count" colSpan={totalCols} />
                          <tr>
                            <Label label="Word Count" />
                            <NumCell value={yourWordCount} highlight={wc.highlight(yourWordCount, true)} />
                            {analysis.competitors.map((comp, i) => (
                              <NumCell key={i} value={compWordCounts[i]} highlight={wc.highlight(compWordCounts[i], true)} />
                            ))}
                          </tr>
                          {(() => {
                            const kwWords100 = (analysis.keyword || '')
                              .toLowerCase()
                              .split(/\s+/)
                              .filter((w: string) => w.length > 0 && !STOP_WORDS.has(w))
                            const first100Freq = (crawl: typeof yourCrawl) => {
                              const text = crawl?.content?.firstWords || ''
                              if (!text || kwWords100.length === 0) return null
                              const words100 = text.split(/\s+/).slice(0, 100).join(' ').toLowerCase()
                              const freqs = kwWords100.map((w: string) => ({
                                word: w,
                                count: (words100.match(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')) || []).length
                              }))
                              return (
                                <div className="flex flex-col gap-0.5">
                                  {freqs.map(({ word, count }) => (
                                    <div key={word} className="flex items-center justify-between gap-3">
                                      <span className="text-[10.5px] font-medium text-[color:var(--text-mute)]">{word}</span>
                                      <span className={`tabular-nums text-[11px] font-semibold ${count > 0 ? 'text-[color:var(--brand)]' : 'text-[color:var(--text-mute)]'}`}>[{count}]</span>
                                    </div>
                                  ))}
                                </div>
                              )
                            }
                            return (
                              <tr>
                                <Label label="Keyword in Content" sub="first 100 words" />
                                <Cell>{first100Freq(yourCrawl)}</Cell>
                                {analysis.competitors.map((comp, i) => (
                                  <Cell key={i}>{first100Freq(compCrawls[i])}</Cell>
                                ))}
                              </tr>
                            )
                          })()}

                          {/* ── H1 ── */}
                          <SectionRow title="H1" colSpan={totalCols} />
                          {(() => {
                            const kwWords = (analysis.keyword || '')
                              .toLowerCase()
                              .split(/\s+/)
                              .filter((w: string) => w.length > 0 && !STOP_WORDS.has(w))
                            const freqBadges = (headings: string[] | undefined) => {
                              const joined = (headings || []).join(' ').toLowerCase()
                              if (!joined || kwWords.length === 0) return null
                              const freqs = kwWords.map((w: string) => ({
                                word: w,
                                count: (joined.match(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')) || []).length
                              }))
                              return (
                                <div className="flex flex-col gap-0.5">
                                  {freqs.map(({ word, count }) => (
                                    <div key={word} className="flex items-center justify-between gap-3">
                                      <span className="text-[10.5px] font-medium text-[color:var(--text-mute)]">{word}</span>
                                      <span className={`tabular-nums text-[11px] font-semibold ${count > 0 ? 'text-[color:var(--brand)]' : 'text-[color:var(--text-mute)]'}`}>[{count}]</span>
                                    </div>
                                  ))}
                                </div>
                              )
                            }
                            return (
                              <>
                                <tr>
                                  <Label label="H1 Tags" sub="Ideally exactly 1" />
                                  <Cell highlight={h1r.highlight(yourH1, true)}>
                                    <span className={`font-sans font-semibold tabular-nums text-[15px] ${yourH1 === 1 ? 'text-[color:var(--pos)]' : yourH1 === 0 ? 'text-[color:var(--neg)]' : 'text-[color:var(--warn)]'}`}>{fmt(yourH1)}</span>
                                    {yourCrawl?.headings?.h1?.[0] && <div className="text-[11.5px] text-[color:var(--text-mute)] mt-1 break-words italic">{yourCrawl.headings.h1[0]}</div>}
                                  </Cell>
                                  {analysis.competitors.map((comp, i) => {
                                    const val = compH1s[i]
                                    return (
                                      <Cell key={i} highlight={h1r.highlight(val, true)}>
                                        <span className={`font-sans font-semibold tabular-nums text-[15px] ${val === 1 ? 'text-[color:var(--pos)]' : val === 0 ? 'text-[color:var(--neg)]' : 'text-[color:var(--warn)]'}`}>{fmt(val)}</span>
                                        {compCrawls[i]?.headings?.h1?.[0] && <div className="text-[11.5px] text-[color:var(--text-mute)] mt-1 break-words italic">{compCrawls[i]!.headings.h1[0]}</div>}
                                      </Cell>
                                    )
                                  })}
                                </tr>
                                <tr>
                                  <Label label="Keyword in H1" />
                                  <Cell>{freqBadges(yourCrawl?.headings?.h1)}</Cell>
                                  {analysis.competitors.map((comp, i) => (
                                    <Cell key={i}>{freqBadges(compCrawls[i]?.headings?.h1)}</Cell>
                                  ))}
                                </tr>
                              </>
                            )
                          })()}

                          {/* ── H2 ── */}
                          <SectionRow title="H2" colSpan={totalCols} />
                          {(() => {
                            const kwWords = (analysis.keyword || '')
                              .toLowerCase()
                              .split(/\s+/)
                              .filter((w: string) => w.length > 0 && !STOP_WORDS.has(w))
                            const freqBadges = (headings: string[] | undefined) => {
                              const joined = (headings || []).join(' ').toLowerCase()
                              if (!joined || kwWords.length === 0) return null
                              const freqs = kwWords.map((w: string) => ({
                                word: w,
                                count: (joined.match(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')) || []).length
                              }))
                              return (
                                <div className="flex flex-col gap-0.5">
                                  {freqs.map(({ word, count }) => (
                                    <div key={word} className="flex items-center justify-between gap-3">
                                      <span className="text-[10.5px] font-medium text-[color:var(--text-mute)]">{word}</span>
                                      <span className={`tabular-nums text-[11px] font-semibold ${count > 0 ? 'text-[color:var(--brand)]' : 'text-[color:var(--text-mute)]'}`}>[{count}]</span>
                                    </div>
                                  ))}
                                </div>
                              )
                            }
                            return (
                              <>
                                <tr>
                                  <Label label="H2 Tags" />
                                  <Cell highlight={h2r.highlight(yourH2, true)}>
                                    <span className="font-sans font-semibold tabular-nums text-[15px] text-[color:var(--text)]">{fmt(yourH2)}</span>
                                  </Cell>
                                  {analysis.competitors.map((comp, i) => (
                                    <Cell key={i} highlight={h2r.highlight(compH2s[i], true)}>
                                      <span className="font-sans font-semibold tabular-nums text-[15px] text-[color:var(--text)]">{fmt(compH2s[i])}</span>
                                    </Cell>
                                  ))}
                                </tr>
                                <tr>
                                  <Label label="Keyword in H2" />
                                  <Cell>{freqBadges(yourCrawl?.headings?.h2)}</Cell>
                                  {analysis.competitors.map((comp, i) => (
                                    <Cell key={i}>{freqBadges(compCrawls[i]?.headings?.h2)}</Cell>
                                  ))}
                                </tr>
                              </>
                            )
                          })()}

                          {/* ── H3 ── */}
                          <SectionRow title="H3" colSpan={totalCols} />
                          {(() => {
                            const kwWords = (analysis.keyword || '')
                              .toLowerCase()
                              .split(/\s+/)
                              .filter((w: string) => w.length > 0)
                            const freqBadges = (headings: string[] | undefined) => {
                              const joined = (headings || []).join(' ').toLowerCase()
                              if (!joined || kwWords.length === 0) return null
                              const freqs = kwWords.map((w: string) => ({
                                word: w,
                                count: (joined.match(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')) || []).length
                              }))
                              return (
                                <div className="flex flex-col gap-0.5">
                                  {freqs.map(({ word, count }) => (
                                    <div key={word} className="flex items-center justify-between gap-3">
                                      <span className="text-[10.5px] font-medium text-[color:var(--text-mute)]">{word}</span>
                                      <span className={`tabular-nums text-[11px] font-semibold ${count > 0 ? 'text-[color:var(--brand)]' : 'text-[color:var(--text-mute)]'}`}>[{count}]</span>
                                    </div>
                                  ))}
                                </div>
                              )
                            }
                            return (
                              <>
                                <tr>
                                  <Label label="H3 Tags" />
                                  <Cell highlight={h3r.highlight(yourH3, true)}>
                                    <span className="font-sans font-semibold tabular-nums text-[15px] text-[color:var(--text)]">{fmt(yourH3)}</span>
                                  </Cell>
                                  {analysis.competitors.map((comp, i) => (
                                    <Cell key={i} highlight={h3r.highlight(compH3s[i], true)}>
                                      <span className="font-sans font-semibold tabular-nums text-[15px] text-[color:var(--text)]">{fmt(compH3s[i])}</span>
                                    </Cell>
                                  ))}
                                </tr>
                                <tr>
                                  <Label label="Keyword in H3" />
                                  <Cell>{freqBadges(yourCrawl?.headings?.h3)}</Cell>
                                  {analysis.competitors.map((comp, i) => (
                                    <Cell key={i}>{freqBadges(compCrawls[i]?.headings?.h3)}</Cell>
                                  ))}
                                </tr>
                              </>
                            )
                          })()}

                          {/* ── H4 ── */}
                          {(yourH4 !== null || compH4s.some(v => v !== null)) && (
                            <>
                              <SectionRow title="H4" colSpan={totalCols} />
                              {(() => {
                                const kwWords = (analysis.keyword || '')
                                  .toLowerCase()
                                  .split(/\s+/)
                                  .filter((w: string) => w.length > 0)
                                const freqBadges = (headings: string[] | undefined) => {
                                  const joined = (headings || []).join(' ').toLowerCase()
                                  if (!joined || kwWords.length === 0) return null
                                  const freqs = kwWords.map((w: string) => ({
                                    word: w,
                                    count: (joined.match(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')) || []).length
                                  }))
                                  return (
                                    <div className="flex flex-col gap-0.5">
                                      {freqs.map(({ word, count }) => (
                                        <div key={word} className="flex items-center justify-between gap-3">
                                          <span className="text-[10.5px] font-medium text-[color:var(--text-mute)]">{word}</span>
                                          <span className={`tabular-nums text-[11px] font-semibold ${count > 0 ? 'text-[color:var(--brand)]' : 'text-[color:var(--text-mute)]'}`}>[{count}]</span>
                                        </div>
                                      ))}
                                    </div>
                                  )
                                }
                                return (
                                  <>
                                    <tr>
                                      <Label label="H4 Tags" />
                                      <Cell highlight={h4r.highlight(yourH4, true)}>
                                        <span className="font-sans font-semibold tabular-nums text-[15px] text-[color:var(--text)]">{fmt(yourH4)}</span>
                                      </Cell>
                                      {analysis.competitors.map((comp, i) => (
                                        <Cell key={i} highlight={h4r.highlight(compH4s[i], true)}>
                                          <span className="font-sans font-semibold tabular-nums text-[15px] text-[color:var(--text)]">{fmt(compH4s[i])}</span>
                                        </Cell>
                                      ))}
                                    </tr>
                                    <tr>
                                      <Label label="Keyword in H4" />
                                      <Cell>{freqBadges(yourCrawl?.headings?.h4)}</Cell>
                                      {analysis.competitors.map((comp, i) => (
                                        <Cell key={i}>{freqBadges(compCrawls[i]?.headings?.h4)}</Cell>
                                      ))}
                                    </tr>
                                  </>
                                )
                              })()}
            
                            </>
                          )}

                          {/* ── H5 ── */}
                          {(yourH5 !== null || compH5s.some(v => v !== null)) && (
                            <>
                              <SectionRow title="H5" colSpan={totalCols} />
                              {(() => {
                                const kwWords = (analysis.keyword || '')
                                  .toLowerCase()
                                  .split(/\s+/)
                                  .filter((w: string) => w.length > 0)
                                const freqBadges = (headings: string[] | undefined) => {
                                  const joined = (headings || []).join(' ').toLowerCase()
                                  if (!joined || kwWords.length === 0) return null
                                  const freqs = kwWords.map((w: string) => ({
                                    word: w,
                                    count: (joined.match(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')) || []).length
                                  }))
                                  return (
                                    <div className="flex flex-col gap-0.5">
                                      {freqs.map(({ word, count }) => (
                                        <div key={word} className="flex items-center justify-between gap-3">
                                          <span className="text-[10.5px] font-medium text-[color:var(--text-mute)]">{word}</span>
                                          <span className={`tabular-nums text-[11px] font-semibold ${count > 0 ? 'text-[color:var(--brand)]' : 'text-[color:var(--text-mute)]'}`}>[{count}]</span>
                                        </div>
                                      ))}
                                    </div>
                                  )
                                }
                                return (
                                  <>
                                    <tr>
                                      <Label label="H5 Tags" />
                                      <Cell highlight={h5r.highlight(yourH5, true)}>
                                        <span className="font-sans font-semibold tabular-nums text-[15px] text-[color:var(--text)]">{fmt(yourH5)}</span>
                                      </Cell>
                                      {analysis.competitors.map((comp, i) => (
                                        <Cell key={i} highlight={h5r.highlight(compH5s[i], true)}>
                                          <span className="font-sans font-semibold tabular-nums text-[15px] text-[color:var(--text)]">{fmt(compH5s[i])}</span>
                                        </Cell>
                                      ))}
                                    </tr>
                                    <tr>
                                      <Label label="Keyword in H5" />
                                      <Cell>{freqBadges(yourCrawl?.headings?.h5)}</Cell>
                                      {analysis.competitors.map((comp, i) => (
                                        <Cell key={i}>{freqBadges(compCrawls[i]?.headings?.h5)}</Cell>
                                      ))}
                                    </tr>
                                  </>
                                )
                              })()}
                            </>
                          )}

                          {/* ── IMAGES ── */}
                          <SectionRow title="Images" colSpan={totalCols} />
                          <tr>
                            <Label label="Total Images" />
                            <NumCell value={yourImages} highlight={imgr.highlight(yourImages, true)} />
                            {analysis.competitors.map((comp, i) => (
                              <NumCell key={i} value={compImages[i]} highlight={imgr.highlight(compImages[i], true)} />
                            ))}
                          </tr>
                          <tr>
                            <Label label="Images with Alt Text" />
                            <NumCell value={yourImagesAlt} highlight="neutral" />
                            {analysis.competitors.map((comp, i) => (
                              <NumCell key={i} value={compImagesAlt[i]} highlight="neutral" />
                            ))}
                          </tr>
                          <tr>
                            <Label label="Keyword in Alt Text" />
                            <BoolCell value={kwInAlt(yourCrawl)} />
                            {analysis.competitors.map((comp, i) => (
                              <BoolCell key={i} value={kwInAlt(compCrawls[i])} />
                            ))}
                          </tr>

                          {/* ── SCHEMA ── */}
                          <SectionRow title="Schema Markup" colSpan={totalCols} />
                          <tr>
                            <Label label="Has Schema Markup" />
                            <BoolCell value={yourCrawl ? (yourCrawl.structuredData?.totalSchemas ?? 0) > 0 : null} />
                            {analysis.competitors.map((comp, i) => (
                              <BoolCell key={i} value={compCrawls[i] ? (compCrawls[i]!.structuredData?.totalSchemas ?? 0) > 0 : null} />
                            ))}
                          </tr>

                          {/* ── CONTENT STRUCTURE ── */}
                          <SectionRow title="Content Structure" colSpan={totalCols} />
                          <tr>
                            <Label label="Table of Contents" />
                            <BoolCell value={yourCrawl?.contentStructure?.hasTableOfContents ?? null} />
                            {analysis.competitors.map((comp, i) => (
                              <BoolCell key={i} value={compCrawls[i]?.contentStructure?.hasTableOfContents ?? null} />
                            ))}
                          </tr>
                          <tr>
                            <Label label="FAQ Section" />
                            <BoolCell value={yourCrawl?.contentStructure?.hasFaqSection ?? null} />
                            {analysis.competitors.map((comp, i) => (
                              <BoolCell key={i} value={compCrawls[i]?.contentStructure?.hasFaqSection ?? null} />
                            ))}
                          </tr>
                          <tr>
                            <Label label="Video Content" />
                            <BoolCell value={yourCrawl?.contentStructure?.hasVideo ?? null} />
                            {analysis.competitors.map((comp, i) => (
                              <BoolCell key={i} value={compCrawls[i]?.contentStructure?.hasVideo ?? null} />
                            ))}
                          </tr>

                          {/* ── PAGE SPEED ── */}
                          <SectionRow title={hasPsi ? "Page Speed (Google PSI — Mobile)" : "Page Speed (Crawler)"} colSpan={totalCols} />
                          {/* Lighthouse Scores — only shown when PSI data is available */}
                          {hasPsi && (() => {
                            const lhScore = (v: number | null) => v === null ? '—' : `${v}`
                            const lhColor = (v: number | null) => v === null ? 'text-[color:var(--text-mute)]' : v >= 90 ? 'text-[color:var(--pos)]' : v >= 50 ? 'text-[color:var(--warn)]' : 'text-[color:var(--neg)]'
                            return (
                              <>
                                <tr>
                                  <Label label="Performance Score" sub="0–100, higher is better" />
                                  <Cell highlight={perfScoreR.highlight(yourPerfScore, true)}>
                                    <span className={`font-sans font-semibold tabular-nums text-[15px] ${lhColor(yourPerfScore)}`}>{lhScore(yourPerfScore)}</span>
                                  </Cell>
                                  {analysis.competitors.map((_, i) => (
                                    <Cell key={i} highlight={perfScoreR.highlight(compPerfScore[i], true)}>
                                      <span className={`font-sans font-semibold tabular-nums text-[15px] ${lhColor(compPerfScore[i])}`}>{lhScore(compPerfScore[i])}</span>
                                    </Cell>
                                  ))}
                                </tr>
                                <tr>
                                  <Label label="SEO Score" sub="Lighthouse SEO audit" />
                                  <Cell><span className={`font-sans font-semibold tabular-nums text-[15px] ${lhColor(yourSeoScore)}`}>{lhScore(yourSeoScore)}</span></Cell>
                                  {analysis.competitors.map((_, i) => (
                                    <Cell key={i}><span className={`font-sans font-semibold tabular-nums text-[15px] ${lhColor(compSeoScore[i])}`}>{lhScore(compSeoScore[i])}</span></Cell>
                                  ))}
                                </tr>
                                <tr>
                                  <Label label="Accessibility Score" sub="Lighthouse a11y audit" />
                                  <Cell><span className={`font-sans font-semibold tabular-nums text-[15px] ${lhColor(yourA11yScore)}`}>{lhScore(yourA11yScore)}</span></Cell>
                                  {analysis.competitors.map((_, i) => (
                                    <Cell key={i}><span className={`font-sans font-semibold tabular-nums text-[15px] ${lhColor(compA11yScore[i])}`}>{lhScore(compA11yScore[i])}</span></Cell>
                                  ))}
                                </tr>
                                <tr>
                                  <Label label="Best Practices Score" sub="Lighthouse best practices" />
                                  <Cell><span className={`font-sans font-semibold tabular-nums text-[15px] ${lhColor(yourBpScore)}`}>{lhScore(yourBpScore)}</span></Cell>
                                  {analysis.competitors.map((_, i) => (
                                    <Cell key={i}><span className={`font-sans font-semibold tabular-nums text-[15px] ${lhColor(compBpScore[i])}`}>{lhScore(compBpScore[i])}</span></Cell>
                                  ))}
                                </tr>
                              </>
                            )
                          })()}
                          <tr>
                            <Label label="TTFB" sub="lower is better" />
                            <Cell highlight={ttfbR.highlight(yourTtfb, false)}>
                              <span className={`font-sans font-semibold tabular-nums text-[15px] ${yourTtfb === null ? 'text-[color:var(--text-mute)]' : yourTtfb <= 200 ? 'text-[color:var(--pos)]' : yourTtfb <= 600 ? 'text-[color:var(--warn)]' : 'text-[color:var(--neg)]'}`}>{yourTtfb !== null ? `${yourTtfb}ms` : '—'}</span>
                            </Cell>
                            {analysis.competitors.map((comp, i) => (
                              <Cell key={i} highlight={ttfbR.highlight(compTtfb[i], false)}>
                                <span className={`font-sans font-semibold tabular-nums text-[15px] ${compTtfb[i] === null ? 'text-[color:var(--text-mute)]' : compTtfb[i]! <= 200 ? 'text-[color:var(--pos)]' : compTtfb[i]! <= 600 ? 'text-[color:var(--warn)]' : 'text-[color:var(--neg)]'}`}>{compTtfb[i] !== null ? `${compTtfb[i]}ms` : '—'}</span>
                              </Cell>
                            ))}
                          </tr>
                          <tr>
                            <Label label="FCP" sub="First Contentful Paint" />
                            <Cell highlight={fcpR.highlight(yourFcp, false)}>
                              <span className={`font-sans font-semibold tabular-nums text-[15px] ${yourFcp === null ? 'text-[color:var(--text-mute)]' : yourFcp <= 1800 ? 'text-[color:var(--pos)]' : yourFcp <= 3000 ? 'text-[color:var(--warn)]' : 'text-[color:var(--neg)]'}`}>{yourFcp !== null ? `${yourFcp}ms` : '—'}</span>
                            </Cell>
                            {analysis.competitors.map((comp, i) => (
                              <Cell key={i} highlight={fcpR.highlight(compFcp[i], false)}>
                                <span className={`font-sans font-semibold tabular-nums text-[15px] ${compFcp[i] === null ? 'text-[color:var(--text-mute)]' : compFcp[i]! <= 1800 ? 'text-[color:var(--pos)]' : compFcp[i]! <= 3000 ? 'text-[color:var(--warn)]' : 'text-[color:var(--neg)]'}`}>{compFcp[i] !== null ? `${compFcp[i]}ms` : '—'}</span>
                              </Cell>
                            ))}
                          </tr>
                          <tr>
                            <Label label="LCP" sub="Largest Contentful Paint" />
                            <Cell highlight={lcpR.highlight(yourLcp, false)}>
                              <span className={`font-sans font-semibold tabular-nums text-[15px] ${yourLcp === null ? 'text-[color:var(--text-mute)]' : yourLcp <= 2500 ? 'text-[color:var(--pos)]' : yourLcp <= 4000 ? 'text-[color:var(--warn)]' : 'text-[color:var(--neg)]'}`}>{yourLcp !== null ? `${yourLcp}ms` : '—'}</span>
                            </Cell>
                            {analysis.competitors.map((comp, i) => (
                              <Cell key={i} highlight={lcpR.highlight(compLcp[i], false)}>
                                <span className={`font-sans font-semibold tabular-nums text-[15px] ${compLcp[i] === null ? 'text-[color:var(--text-mute)]' : compLcp[i]! <= 2500 ? 'text-[color:var(--pos)]' : compLcp[i]! <= 4000 ? 'text-[color:var(--warn)]' : 'text-[color:var(--neg)]'}`}>{compLcp[i] !== null ? `${compLcp[i]}ms` : '—'}</span>
                              </Cell>
                            ))}
                          </tr>
                          {hasPsi && (
                            <tr>
                              <Label label="TBT" sub="Total Blocking Time" />
                              <Cell highlight={tbtR.highlight(yourTbt, false)}>
                                <span className={`font-sans font-semibold tabular-nums text-[15px] ${yourTbt === null ? 'text-[color:var(--text-mute)]' : yourTbt <= 200 ? 'text-[color:var(--pos)]' : yourTbt <= 600 ? 'text-[color:var(--warn)]' : 'text-[color:var(--neg)]'}`}>{yourTbt !== null ? `${yourTbt}ms` : '—'}</span>
                              </Cell>
                              {analysis.competitors.map((comp, i) => (
                                <Cell key={i} highlight={tbtR.highlight(compTbt[i], false)}>
                                  <span className={`font-sans font-semibold tabular-nums text-[15px] ${compTbt[i] === null ? 'text-[color:var(--text-mute)]' : compTbt[i]! <= 200 ? 'text-[color:var(--pos)]' : compTbt[i]! <= 600 ? 'text-[color:var(--warn)]' : 'text-[color:var(--neg)]'}`}>{compTbt[i] !== null ? `${compTbt[i]}ms` : '—'}</span>
                                </Cell>
                              ))}
                            </tr>
                          )}
                          <tr>
                            <Label label="CLS" sub="Cumulative Layout Shift" />
                            <Cell>
                              <span className={`font-sans font-semibold tabular-nums text-[15px] ${yourCls === null ? 'text-[color:var(--text-mute)]' : yourCls <= 0.1 ? 'text-[color:var(--pos)]' : yourCls <= 0.25 ? 'text-[color:var(--warn)]' : 'text-[color:var(--neg)]'}`}>{yourCls !== null ? yourCls.toFixed(3) : '—'}</span>
                            </Cell>
                            {analysis.competitors.map((comp, i) => (
                              <Cell key={i}>
                                <span className={`font-sans font-semibold tabular-nums text-[15px] ${compCls[i] === null ? 'text-[color:var(--text-mute)]' : compCls[i]! <= 0.1 ? 'text-[color:var(--pos)]' : compCls[i]! <= 0.25 ? 'text-[color:var(--warn)]' : 'text-[color:var(--neg)]'}`}>{compCls[i] !== null ? compCls[i]!.toFixed(3) : '—'}</span>
                              </Cell>
                            ))}
                          </tr>

                          {/* ── EXTERNAL LINKS ── */}
                          <SectionRow title="External / Outbound Links" colSpan={totalCols} />
                          <tr>
                            <Label label="Total External Links" />
                            <NumCell value={yourExtLinks} highlight={extR.highlight(yourExtLinks, true)} />
                            {analysis.competitors.map((comp, i) => (
                              <NumCell key={i} value={compExtLinks[i]} highlight={extR.highlight(compExtLinks[i], true)} />
                            ))}
                          </tr>
                          <tr>
                            <Label label="Dofollow External" />
                            <NumCell value={yourExtDofollow} highlight="neutral" />
                            {analysis.competitors.map((comp, i) => (
                              <NumCell key={i} value={compExtDofollow[i]} highlight="neutral" />
                            ))}
                          </tr>
                          <tr>
                            <Label label="Nofollow External" />
                            <NumCell value={yourExtNofollow} highlight="neutral" />
                            {analysis.competitors.map((comp, i) => (
                              <NumCell key={i} value={compExtNofollow[i]} highlight="neutral" />
                            ))}
                          </tr>
                          {/* ── INTERNAL LINKS ── */}
                          <SectionRow title="Internal Links (on-page)" colSpan={totalCols} />
                          <tr>
                            <Label label="Total Internal Links" />
                            <NumCell value={yourIntLinks} highlight={intR.highlight(yourIntLinks, true)} />
                            {analysis.competitors.map((comp, i) => (
                              <NumCell key={i} value={compIntLinks[i]} highlight={intR.highlight(compIntLinks[i], true)} />
                            ))}
                          </tr>
                          {/* ── ANCHOR TEXT ── */}
                          {(() => {
                            const kwWords = (analysis.keyword || '').toLowerCase().split(/\s+/).filter(w => w.length > 0)
                            const freqBadges = (links: Array<{ text?: string }> | undefined) => {
                              if (!links?.length || !kwWords.length) return null
                              const joined = links.map(l => l.text || '').join(' ').toLowerCase()
                              const freqs = kwWords.map(w => ({
                                word: w,
                                count: (joined.match(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')) || []).length
                              }))
                              return (
                                <div className="flex flex-col gap-0.5">
                                  {freqs.map(({ word, count }) => (
                                    <div key={word} className="flex items-center justify-between gap-3">
                                      <span className="text-[10.5px] font-medium text-[color:var(--text-mute)]">{word}</span>
                                      <span className={`tabular-nums text-[11px] font-semibold ${count > 0 ? 'text-[color:var(--brand)]' : 'text-[color:var(--text-mute)]'}`}>[{count}]</span>
                                    </div>
                                  ))}
                                </div>
                              )
                            }
                            return (
                              <>
                                <SectionRow title="Anchor Text" colSpan={totalCols} />
                                <tr>
                                  <Label label="Anchors — Main" sub="internal links in <main>" />
                                  <NumCell value={sectionLinkCount(yourCrawl, 'main')} highlight="neutral" />
                                  {analysis.competitors.map((comp, i) => (
                                    <NumCell key={i} value={sectionLinkCount(compCrawls[i], 'main')} highlight="neutral" />
                                  ))}
                                </tr>
                                <tr>
                                  <Label label="Anchors — Header" sub="internal links in <header>" />
                                  <NumCell value={sectionLinkCount(yourCrawl, 'header')} highlight="neutral" />
                                  {analysis.competitors.map((comp, i) => (
                                    <NumCell key={i} value={sectionLinkCount(compCrawls[i], 'header')} highlight="neutral" />
                                  ))}
                                </tr>
                                <tr>
                                  <Label label="Anchors — Footer" sub="internal links in <footer>" />
                                  <NumCell value={sectionLinkCount(yourCrawl, 'footer')} highlight="neutral" />
                                  {analysis.competitors.map((comp, i) => (
                                    <NumCell key={i} value={sectionLinkCount(compCrawls[i], 'footer')} highlight="neutral" />
                                  ))}
                                </tr>
                                <tr>
                                  <Label label="Keyword in Internal Anchors" sub="keyword words across all internal link text" />
                                  <Cell>{freqBadges(yourCrawl?.linkAnalysis?.internalLinks)}</Cell>
                                  {analysis.competitors.map((comp, i) => (
                                    <Cell key={i}>{freqBadges(compCrawls[i]?.linkAnalysis?.internalLinks)}</Cell>
                                  ))}
                                </tr>
                                <tr>
                                  <Label label="Keyword in External Anchors" sub="keyword words across all outbound link text" />
                                  <Cell>{freqBadges(yourExtData.unique)}</Cell>
                                  {analysis.competitors.map((comp, i) => (
                                    <Cell key={i}>{freqBadges(compExtData[i]?.unique)}</Cell>
                                  ))}
                                </tr>
                              </>
                            )
                          })()}
                        </>
                      )
                    })()}
                  </tbody>
                </table>
              </div>
  )
}
