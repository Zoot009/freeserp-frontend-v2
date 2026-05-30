"use client"

import React, { useState } from "react"
import { CheckCircle, XCircle, ChevronDown, ChevronUp } from "lucide-react"
import type { AnalysisData } from "@/types/competitor-analysis"
import { computeSeoScore, scoreColor, scoreBarBg, type SeoScoreBreakdown } from "@/lib/seoScorer"

interface Props {
  analysis: AnalysisData
  onRecrawl?: (domain: string) => void
  recrawlingDomains?: Set<string>
}

export function CompetitorComparisonTable({ analysis, onRecrawl, recrawlingDomains = new Set() }: Props) {
  const rankStripe = (pos: number | null) => {
    if (pos === null) return 'bg-border/40'
    if (pos <= 3) return 'bg-emerald-500'
    if (pos <= 10) return 'bg-yellow-500'
    return 'bg-red-500'
  }
  const rankText = (pos: number | null) => {
    if (pos === null) return 'text-muted-foreground'
    if (pos <= 3) return 'text-emerald-500'
    if (pos <= 10) return 'text-yellow-500'
    return 'text-red-500'
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
              <div className="w-full overflow-x-auto border border-border/60 bg-card/20">
                <table className="w-full border-collapse table-fixed">
                  <colgroup>
                    <col style={{ width: '180px' }} />
                    <col />
                    {analysis.competitors.map((_, i) => <col key={i} />)}
                  </colgroup>
                  <thead>
                    <tr className="align-top">

                      {/* Corner */}
                      <th className="border-r border-b border-border/40 bg-background p-5 text-left align-middle" />

                      {/* Your Business */}
                      <th className="border-r border-b border-border/40 bg-background text-center p-0 align-top">
                        <div className="h-0.5 w-full bg-accent" />
                        <div className="px-3 pt-3 pb-3">
                          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-accent mb-1">Your Business</p>
                          <p className="font-[var(--font-bebas)] text-lg tracking-tight text-foreground leading-none mb-1.5 truncate" title={analysis.yourDomain}>
                            {analysis.yourDomain}
                          </p>
                          <p className={`font-[var(--font-bebas)] text-4xl leading-none ${rankText(analysis.yourPosition)}`}>
                            {analysis.yourPosition ? `#${analysis.yourPosition}` : '—'}
                          </p>
                          <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
                            {analysis.yourPosition ? 'SERP Position' : 'Not Ranked'}
                          </p>
                        </div>
                      </th>

                      {/* Competitors */}
                      {analysis.competitors.map((comp, i) => {
                        const isFailed = comp.crawlMethod === 'failed' || comp.crawlMethod === 'minimal' || comp.wordCount === 0
                        const isRecrawling = recrawlingDomains.has(comp.domain)
                        return (
                          <th key={i} className="border-r last:border-r-0 border-b border-border/40 bg-background text-center p-0 align-top">
                            <div className={`h-0.5 w-full ${isFailed ? 'bg-red-400' : rankStripe(comp.position)}`} />
                            <div className="px-3 pt-3 pb-3">
                              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-1 opacity-0 select-none">·</p>
                              <p className="font-[var(--font-bebas)] text-lg tracking-tight text-foreground leading-none mb-1.5 truncate" title={comp.domain}>
                                {comp.domain}
                              </p>
                              {isFailed || isRecrawling ? (
                                <>
                                  <p className="font-[var(--font-bebas)] text-4xl leading-none text-red-400">—</p>
                                  <p className="font-mono text-[10px] text-red-400/70 mt-0.5">Crawl Failed</p>
                                  <div className="mt-2">
                                    {isRecrawling ? (
                                      <span className="inline-block font-mono text-[9px] uppercase tracking-widest text-yellow-600 animate-pulse px-2 py-1 border border-yellow-400/30 bg-yellow-400/5">
                                        Recrawling…
                                      </span>
                                    ) : (
                                      <button
                                        onClick={() => onRecrawl?.(comp.domain)}
                                        className="font-mono text-[9px] uppercase tracking-widest px-2 py-1 border border-accent/40 text-accent bg-accent/5 hover:bg-accent/15 transition-colors"
                                      >
                                        ↺ Recrawl
                                      </button>
                                    )}
                                  </div>
                                </>
                              ) : (
                                <>
                                  <p className={`font-[var(--font-bebas)] text-4xl leading-none ${rankText(comp.position)}`}>
                                    {comp.position ? `#${comp.position}` : '—'}
                                  </p>
                                  <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
                                    {comp.position ? 'SERP Position' : 'Not Ranked'}
                                  </p>
                                </>
                              )}
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
                        <td className={`border-r last:border-r-0 border-b border-border/40 p-4 text-center align-middle ${highlight === 'best' ? 'bg-emerald-500/5' : highlight === 'worst' ? 'bg-red-500/5' : ''}`}>
                          {children}
                        </td>
                      )

                      const Label = ({ label, sub }: { label: string; sub?: string }) => (
                        <td className="border-r border-b border-border/40 bg-background/50 p-4 align-middle">
                          <div className="font-mono text-xs uppercase tracking-wider text-foreground/80">{label}</div>
                          {sub && <div className="font-mono text-[10px] text-muted-foreground/60 mt-0.5">{sub}</div>}
                        </td>
                      )

                      const SectionRow = ({ title, colSpan }: { title: string; colSpan: number }) => (
                        <tr>
                          <td colSpan={colSpan} className="border-b border-border/40 bg-accent/5 px-5 py-2">
                            <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-accent">{title}</span>
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
                        v === null ? <span className="text-muted-foreground font-mono text-xs">—</span> :
                        v ? <CheckCircle className="h-4 w-4 text-emerald-400 mx-auto" /> : <XCircle className="h-4 w-4 text-red-400 mx-auto" />

                      const NumCell = ({ value, highlight }: { value: number | null; highlight?: 'best' | 'worst' | 'neutral' }) => (
                        <Cell highlight={highlight}>
                          <span className="font-mono text-base font-bold text-foreground">{fmt(value)}</span>
                        </Cell>
                      )

                      const BoolCell = ({ value }: { value: boolean | null }) => (
                        <Cell>
                          <div className="flex justify-center">{fmtBool(value)}</div>
                        </Cell>
                      )

                      const STOP_WORDS = new Set(['a','an','the','and','or','but','in','on','at','to','for','of','with','by','from','is','are','was','were','be','been','being','as','it','its','this','that','these','those','i','my','your','our','we','they','he','she','not','no','so','do','does','did','has','have','had','can','will','would','should','could','may','might','into','about','up','out'])

                      const TitleLenColor = (len: number | null) => {
                        if (len === null) return 'text-muted-foreground'
                        if (len >= 30 && len <= 60) return 'text-emerald-400'
                        if (len >= 20 && len <= 70) return 'text-yellow-400'
                        return 'text-red-400'
                      }

                      const DescLenColor = (len: number | null) => {
                        if (len === null) return 'text-muted-foreground'
                        if (len >= 120 && len <= 160) return 'text-emerald-400'
                        if (len >= 70 && len <= 200) return 'text-yellow-400'
                        return 'text-red-400'
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
                        <td className="border-r last:border-r-0 border-b border-border/40 p-3 align-middle">
                          {score ? (
                            <div className="space-y-1">
                              {SCORE_CATEGORIES.map(({ key, label, max }) => {
                                const val = score[key] as number
                                const pct = max > 0 ? val / max : 0
                                const barColor = pct >= 0.8 ? 'bg-emerald-400' : pct >= 0.5 ? 'bg-yellow-400' : 'bg-red-400'
                                const textColor = pct >= 0.8 ? 'text-emerald-400' : pct >= 0.5 ? 'text-yellow-400' : 'text-red-400'
                                return (
                                  <div key={key} className="flex items-center gap-2">
                                    <span className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground w-14 shrink-0 text-right">{label}</span>
                                    <div className="flex-1 bg-border/30 rounded-full h-1 overflow-hidden">
                                      <div className={`h-1 rounded-full ${barColor}`} style={{ width: `${pct * 100}%` }} />
                                    </div>
                                    <span className={`font-mono text-[9px] font-bold w-10 text-right ${textColor}`}>{val}/{max}</span>
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <span className="font-mono text-sm text-muted-foreground">—</span>
                          )}
                        </td>
                      )

                      return (
                        <>
                          {/* ── SEO SCORE ── */}
                          <SectionRow title="SEO Score" colSpan={totalCols} />
                          {/* Overall score row — click label to toggle breakdown */}
                          <tr>
                            <td className="border-r border-b border-border/40 bg-background/50 p-4 align-middle">
                              <button
                                onClick={() => setScoreBreakdownOpen(o => !o)}
                                className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-foreground/80 hover:text-accent transition-colors"
                              >
                                Overall Score
                                {scoreBreakdownOpen
                                  ? <ChevronUp className="h-3 w-3" />
                                  : <ChevronDown className="h-3 w-3" />}
                              </button>
                              <div className="font-mono text-[10px] text-muted-foreground/60 mt-0.5">out of 100</div>
                            </td>
                            {/* your score */}
                            <td className="border-r border-b border-border/40 p-4 text-center align-middle">
                              {yourScore ? (
                                <div>
                                  <span className={`font-[var(--font-bebas)] text-5xl leading-none ${scoreColor(yourScore.total)}`}>
                                    {yourScore.total}
                                  </span>
                                  <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                                    {yourScore.grade} · {yourScore.label}
                                  </div>
                                  <div className="mt-2 w-full bg-border/30 rounded-full h-1.5 overflow-hidden">
                                    <div className={`h-1.5 rounded-full ${scoreBarBg(yourScore.total)}`} style={{ width: `${yourScore.total}%` }} />
                                  </div>
                                </div>
                              ) : <span className="font-mono text-sm text-muted-foreground">—</span>}
                            </td>
                            {/* competitor scores */}
                            {analysis.competitors.map((_, i) => (
                              <td key={i} className="border-r last:border-r-0 border-b border-border/40 p-4 text-center align-middle">
                                {compScores[i] ? (
                                  <div>
                                    <span className={`font-[var(--font-bebas)] text-5xl leading-none ${scoreColor(compScores[i]!.total)}`}>
                                      {compScores[i]!.total}
                                    </span>
                                    <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                                      {compScores[i]!.grade} · {compScores[i]!.label}
                                    </div>
                                    <div className="mt-2 w-full bg-border/30 rounded-full h-1.5 overflow-hidden">
                                      <div className={`h-1.5 rounded-full ${scoreBarBg(compScores[i]!.total)}`} style={{ width: `${compScores[i]!.total}%` }} />
                                    </div>
                                  </div>
                                ) : <span className="font-mono text-sm text-muted-foreground">—</span>}
                              </td>
                            ))}
                          </tr>
                          {/* Breakdown row — only rendered when open */}
                          {scoreBreakdownOpen && (
                            <tr>
                              <td className="border-r border-b border-border/40 bg-background/50 p-4 align-middle">
                                <div className="font-mono text-xs uppercase tracking-wider text-foreground/80">Score Breakdown</div>
                                <div className="font-mono text-[10px] text-muted-foreground/60 mt-0.5">by category</div>
                              </td>
                              <ScoreDetailCell score={yourScore} />
                              {analysis.competitors.map((_, i) => (
                                <ScoreDetailCell key={i} score={compScores[i]} />
                              ))}
                            </tr>
                          )}

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
                                      <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{word}</span>
                                      <span className={`font-mono text-[11px] font-bold ${count > 0 ? 'text-accent' : 'text-muted-foreground/50'}`}>[{count}]</span>
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
                              return path ? urlFreq(path) : <span className="font-mono text-xs text-muted-foreground/40">homepage</span>
                            }
                            return (
                              <>
                                <SectionRow title="URL" colSpan={totalCols} />
                                {/* Main Domain */}
                                <tr>
                                  <Label label="Main Domain" />
                                  <Cell>
                                    {getHostname(analysis.yourUrl)
                                      ? <span className="font-mono text-xs text-foreground/80">{getHostname(analysis.yourUrl)}</span>
                                      : <span className="font-mono text-sm text-muted-foreground">—</span>}
                                  </Cell>
                                  {analysis.competitors.map((comp, i) => (
                                    <Cell key={i}>
                                      {getHostname(comp.url)
                                        ? <span className="font-mono text-xs text-foreground/80">{getHostname(comp.url)}</span>
                                        : <span className="font-mono text-sm text-muted-foreground">—</span>}
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
                                      ? <a href={analysis.yourUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-accent hover:underline break-all line-clamp-2">
                                          {analysis.yourUrl}
                                        </a>
                                      : <span className="font-mono text-sm text-muted-foreground">—</span>}
                                  </Cell>
                                  {analysis.competitors.map((comp, i) => (
                                    <Cell key={i}>
                                      {comp.url
                                        ? <a href={comp.url} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-accent hover:underline break-all line-clamp-2">
                                            {comp.url}
                                          </a>
                                        : <span className="font-mono text-sm text-muted-foreground">—</span>}
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
                              if (freqs.length === 0) return <span className="font-mono text-[9px] text-muted-foreground">—</span>
                              return (
                                <div className="flex flex-col gap-0.5 mt-1">
                                  {freqs.map(({ word, count }) => (
                                    <div key={word} className="flex items-center justify-between gap-3">
                                      <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{word}</span>
                                      <span className={`font-mono text-[11px] font-bold ${count > 0 ? 'text-accent' : 'text-muted-foreground/50'}`}>[{count}]</span>
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
                                    <div className="font-mono text-xs text-foreground/90 text-left mb-1">{yourTitle ?? '—'}</div>
                                    {yourTitleLen !== null && <span className={`font-mono text-[10px] font-bold ${TitleLenColor(yourTitleLen)}`}>{yourTitleLen} ch</span>}
                                  </Cell>
                                  {analysis.competitors.map((comp, i) => (
                                    <Cell key={i}>
                                      <div className="font-mono text-xs text-foreground/90 text-left mb-1">{compCrawls[i]?.metaTags?.title ?? comp.title ?? '—'}</div>
                                      {compTitleLens[i] !== null && <span className={`font-mono text-[10px] font-bold ${TitleLenColor(compTitleLens[i])}`}>{compTitleLens[i]} ch</span>}
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
                                      <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{word}</span>
                                      <span className={`font-mono text-[11px] font-bold ${count > 0 ? 'text-accent' : 'text-muted-foreground/50'}`}>[{count}]</span>
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
                                    <div className="font-mono text-xs text-foreground/80 text-left mb-1">{yourDesc ?? '—'}</div>
                                    {yourDescLen !== null && <span className={`font-mono text-[10px] font-bold ${DescLenColor(yourDescLen)}`}>{yourDescLen} ch</span>}
                                  </Cell>
                                  {analysis.competitors.map((comp, i) => (
                                    <Cell key={i}>
                                      <div className="font-mono text-xs text-foreground/80 text-left mb-1">{compCrawls[i]?.metaTags?.description ?? '—'}</div>
                                      {compDescLens[i] !== null && <span className={`font-mono text-[10px] font-bold ${DescLenColor(compDescLens[i])}`}>{compDescLens[i]} ch</span>}
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
                                      <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{word}</span>
                                      <span className={`font-mono text-[11px] font-bold ${count > 0 ? 'text-accent' : 'text-muted-foreground/50'}`}>[{count}]</span>
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
                                      <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{word}</span>
                                      <span className={`font-mono text-[11px] font-bold ${count > 0 ? 'text-accent' : 'text-muted-foreground/50'}`}>[{count}]</span>
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
                                    <span className={`font-mono text-base font-bold ${yourH1 === 1 ? 'text-emerald-400' : yourH1 === 0 ? 'text-red-400' : 'text-yellow-400'}`}>{fmt(yourH1)}</span>
                                    {yourCrawl?.headings?.h1?.[0] && <div className="font-mono text-[11px] text-muted-foreground mt-1 break-words">{yourCrawl.headings.h1[0]}</div>}
                                  </Cell>
                                  {analysis.competitors.map((comp, i) => {
                                    const val = compH1s[i]
                                    return (
                                      <Cell key={i} highlight={h1r.highlight(val, true)}>
                                        <span className={`font-mono text-base font-bold ${val === 1 ? 'text-emerald-400' : val === 0 ? 'text-red-400' : 'text-yellow-400'}`}>{fmt(val)}</span>
                                        {compCrawls[i]?.headings?.h1?.[0] && <div className="font-mono text-[11px] text-muted-foreground mt-1 break-words">{compCrawls[i]!.headings.h1[0]}</div>}
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
                                      <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{word}</span>
                                      <span className={`font-mono text-[11px] font-bold ${count > 0 ? 'text-accent' : 'text-muted-foreground/50'}`}>[{count}]</span>
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
                                    <span className="font-mono text-base font-bold text-foreground">{fmt(yourH2)}</span>
                                  </Cell>
                                  {analysis.competitors.map((comp, i) => (
                                    <Cell key={i} highlight={h2r.highlight(compH2s[i], true)}>
                                      <span className="font-mono text-base font-bold text-foreground">{fmt(compH2s[i])}</span>
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
                                      <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{word}</span>
                                      <span className={`font-mono text-[11px] font-bold ${count > 0 ? 'text-accent' : 'text-muted-foreground/50'}`}>[{count}]</span>
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
                                    <span className="font-mono text-base font-bold text-foreground">{fmt(yourH3)}</span>
                                  </Cell>
                                  {analysis.competitors.map((comp, i) => (
                                    <Cell key={i} highlight={h3r.highlight(compH3s[i], true)}>
                                      <span className="font-mono text-base font-bold text-foreground">{fmt(compH3s[i])}</span>
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
                                          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{word}</span>
                                          <span className={`font-mono text-[11px] font-bold ${count > 0 ? 'text-accent' : 'text-muted-foreground/50'}`}>[{count}]</span>
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
                                        <span className="font-mono text-base font-bold text-foreground">{fmt(yourH4)}</span>
                                      </Cell>
                                      {analysis.competitors.map((comp, i) => (
                                        <Cell key={i} highlight={h4r.highlight(compH4s[i], true)}>
                                          <span className="font-mono text-base font-bold text-foreground">{fmt(compH4s[i])}</span>
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
                                          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{word}</span>
                                          <span className={`font-mono text-[11px] font-bold ${count > 0 ? 'text-accent' : 'text-muted-foreground/50'}`}>[{count}]</span>
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
                                        <span className="font-mono text-base font-bold text-foreground">{fmt(yourH5)}</span>
                                      </Cell>
                                      {analysis.competitors.map((comp, i) => (
                                        <Cell key={i} highlight={h5r.highlight(compH5s[i], true)}>
                                          <span className="font-mono text-base font-bold text-foreground">{fmt(compH5s[i])}</span>
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
                            const lhColor = (v: number | null) => v === null ? 'text-muted-foreground' : v >= 90 ? 'text-emerald-400' : v >= 50 ? 'text-yellow-400' : 'text-red-400'
                            return (
                              <>
                                <tr>
                                  <Label label="Performance Score" sub="0–100, higher is better" />
                                  <Cell highlight={perfScoreR.highlight(yourPerfScore, true)}>
                                    <span className={`font-mono text-base font-bold ${lhColor(yourPerfScore)}`}>{lhScore(yourPerfScore)}</span>
                                  </Cell>
                                  {analysis.competitors.map((_, i) => (
                                    <Cell key={i} highlight={perfScoreR.highlight(compPerfScore[i], true)}>
                                      <span className={`font-mono text-base font-bold ${lhColor(compPerfScore[i])}`}>{lhScore(compPerfScore[i])}</span>
                                    </Cell>
                                  ))}
                                </tr>
                                <tr>
                                  <Label label="SEO Score" sub="Lighthouse SEO audit" />
                                  <Cell><span className={`font-mono text-base font-bold ${lhColor(yourSeoScore)}`}>{lhScore(yourSeoScore)}</span></Cell>
                                  {analysis.competitors.map((_, i) => (
                                    <Cell key={i}><span className={`font-mono text-base font-bold ${lhColor(compSeoScore[i])}`}>{lhScore(compSeoScore[i])}</span></Cell>
                                  ))}
                                </tr>
                                <tr>
                                  <Label label="Accessibility Score" sub="Lighthouse a11y audit" />
                                  <Cell><span className={`font-mono text-base font-bold ${lhColor(yourA11yScore)}`}>{lhScore(yourA11yScore)}</span></Cell>
                                  {analysis.competitors.map((_, i) => (
                                    <Cell key={i}><span className={`font-mono text-base font-bold ${lhColor(compA11yScore[i])}`}>{lhScore(compA11yScore[i])}</span></Cell>
                                  ))}
                                </tr>
                                <tr>
                                  <Label label="Best Practices Score" sub="Lighthouse best practices" />
                                  <Cell><span className={`font-mono text-base font-bold ${lhColor(yourBpScore)}`}>{lhScore(yourBpScore)}</span></Cell>
                                  {analysis.competitors.map((_, i) => (
                                    <Cell key={i}><span className={`font-mono text-base font-bold ${lhColor(compBpScore[i])}`}>{lhScore(compBpScore[i])}</span></Cell>
                                  ))}
                                </tr>
                              </>
                            )
                          })()}
                          <tr>
                            <Label label="TTFB" sub="lower is better" />
                            <Cell highlight={ttfbR.highlight(yourTtfb, false)}>
                              <span className={`font-mono text-base font-bold ${yourTtfb === null ? 'text-muted-foreground' : yourTtfb <= 200 ? 'text-emerald-400' : yourTtfb <= 600 ? 'text-yellow-400' : 'text-red-400'}`}>{yourTtfb !== null ? `${yourTtfb}ms` : '—'}</span>
                            </Cell>
                            {analysis.competitors.map((comp, i) => (
                              <Cell key={i} highlight={ttfbR.highlight(compTtfb[i], false)}>
                                <span className={`font-mono text-base font-bold ${compTtfb[i] === null ? 'text-muted-foreground' : compTtfb[i]! <= 200 ? 'text-emerald-400' : compTtfb[i]! <= 600 ? 'text-yellow-400' : 'text-red-400'}`}>{compTtfb[i] !== null ? `${compTtfb[i]}ms` : '—'}</span>
                              </Cell>
                            ))}
                          </tr>
                          <tr>
                            <Label label="FCP" sub="First Contentful Paint" />
                            <Cell highlight={fcpR.highlight(yourFcp, false)}>
                              <span className={`font-mono text-base font-bold ${yourFcp === null ? 'text-muted-foreground' : yourFcp <= 1800 ? 'text-emerald-400' : yourFcp <= 3000 ? 'text-yellow-400' : 'text-red-400'}`}>{yourFcp !== null ? `${yourFcp}ms` : '—'}</span>
                            </Cell>
                            {analysis.competitors.map((comp, i) => (
                              <Cell key={i} highlight={fcpR.highlight(compFcp[i], false)}>
                                <span className={`font-mono text-base font-bold ${compFcp[i] === null ? 'text-muted-foreground' : compFcp[i]! <= 1800 ? 'text-emerald-400' : compFcp[i]! <= 3000 ? 'text-yellow-400' : 'text-red-400'}`}>{compFcp[i] !== null ? `${compFcp[i]}ms` : '—'}</span>
                              </Cell>
                            ))}
                          </tr>
                          <tr>
                            <Label label="LCP" sub="Largest Contentful Paint" />
                            <Cell highlight={lcpR.highlight(yourLcp, false)}>
                              <span className={`font-mono text-base font-bold ${yourLcp === null ? 'text-muted-foreground' : yourLcp <= 2500 ? 'text-emerald-400' : yourLcp <= 4000 ? 'text-yellow-400' : 'text-red-400'}`}>{yourLcp !== null ? `${yourLcp}ms` : '—'}</span>
                            </Cell>
                            {analysis.competitors.map((comp, i) => (
                              <Cell key={i} highlight={lcpR.highlight(compLcp[i], false)}>
                                <span className={`font-mono text-base font-bold ${compLcp[i] === null ? 'text-muted-foreground' : compLcp[i]! <= 2500 ? 'text-emerald-400' : compLcp[i]! <= 4000 ? 'text-yellow-400' : 'text-red-400'}`}>{compLcp[i] !== null ? `${compLcp[i]}ms` : '—'}</span>
                              </Cell>
                            ))}
                          </tr>
                          {hasPsi && (
                            <tr>
                              <Label label="TBT" sub="Total Blocking Time" />
                              <Cell highlight={tbtR.highlight(yourTbt, false)}>
                                <span className={`font-mono text-base font-bold ${yourTbt === null ? 'text-muted-foreground' : yourTbt <= 200 ? 'text-emerald-400' : yourTbt <= 600 ? 'text-yellow-400' : 'text-red-400'}`}>{yourTbt !== null ? `${yourTbt}ms` : '—'}</span>
                              </Cell>
                              {analysis.competitors.map((comp, i) => (
                                <Cell key={i} highlight={tbtR.highlight(compTbt[i], false)}>
                                  <span className={`font-mono text-base font-bold ${compTbt[i] === null ? 'text-muted-foreground' : compTbt[i]! <= 200 ? 'text-emerald-400' : compTbt[i]! <= 600 ? 'text-yellow-400' : 'text-red-400'}`}>{compTbt[i] !== null ? `${compTbt[i]}ms` : '—'}</span>
                                </Cell>
                              ))}
                            </tr>
                          )}
                          <tr>
                            <Label label="CLS" sub="Cumulative Layout Shift" />
                            <Cell>
                              <span className={`font-mono text-base font-bold ${yourCls === null ? 'text-muted-foreground' : yourCls <= 0.1 ? 'text-emerald-400' : yourCls <= 0.25 ? 'text-yellow-400' : 'text-red-400'}`}>{yourCls !== null ? yourCls.toFixed(3) : '—'}</span>
                            </Cell>
                            {analysis.competitors.map((comp, i) => (
                              <Cell key={i}>
                                <span className={`font-mono text-base font-bold ${compCls[i] === null ? 'text-muted-foreground' : compCls[i]! <= 0.1 ? 'text-emerald-400' : compCls[i]! <= 0.25 ? 'text-yellow-400' : 'text-red-400'}`}>{compCls[i] !== null ? compCls[i]!.toFixed(3) : '—'}</span>
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
                                      <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{word}</span>
                                      <span className={`font-mono text-[11px] font-bold ${count > 0 ? 'text-accent' : 'text-muted-foreground/50'}`}>[{count}]</span>
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
