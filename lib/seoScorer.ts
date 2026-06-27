import type { CrawlData } from "@/types/competitor-analysis"

// NOTE: this scorer powers the competitor-analysis comparison table's "Overall
// Score" for the user's site and each competitor. It is intentionally DECOUPLED
// from the backend's freeserp-backend/src/modules/competitor-analysis/lib/
// pageScore.ts (a different, density-focused, on-page-only 5-factor "Page Score"
// for the keywords dashboard) — do NOT sync them.
//
// Score = ON-PAGE 30% blended with OFF-PAGE 70%. Off-page is a weighted blend of
// four signals whose weights are their share of the OVERALL score (sum 70%):
// Domain Authority 30, domain backlinks 20, page backlinks 10, Page Authority 10
// (see *_WEIGHT below). Backlink counts are unbounded, so they're log-normalized
// against a reference ceiling. Off-page is a FIXED 70% whenever ANY off-page
// signal is present (weights renormalize over the present ones); with NONE, the
// score falls back to on-page-only. This off-page layer lives ONLY here.

const STOP_WORDS = new Set(['a','an','the','and','or','but','in','on','at','to','for','of','with','by','from','is','are','was','were','be','been','being','as','it','its','this','that','these','those','i','my','your','our','we','they','he','she','not','no','so','do','does','did','has','have','had','can','will','would','should','could','may','might','into','about','up','out'])

export interface SeoScoreBreakdown {
  url: number        // max 5
  title: number      // max 10
  meta: number       // max 8
  content: number    // max 12
  headings: number   // max 10
  images: number     // max 5
  schema: number     // max 5
  structure: number  // max 6
  lighthouse: number // max 15
  cwv: number        // max 10
  links: number      // max 12
  anchors: number    // max 5
  da: number | null             // raw Domain Authority 0–100 (null when unavailable)
  pa: number | null             // raw Page Authority 0–100 (null when unavailable)
  domainBacklinks: number | null // raw domain backlink count (null when unavailable)
  pageBacklinks: number | null   // raw page backlink count (null when unavailable)
  onPageScore: number           // 0–100, on-page only
  offPageScore: number | null   // 0–100, off-page blend (null when no off-page data)
  total: number                 // 0–100 (on-page 30% blended with off-page 70%)
  grade: string      // A+, A, B, C, D, F
  label: string      // Excellent, Very Good, Good, Fair, Needs Work, Poor
}

const RAW_MAX = 103 // actual sum of all on-page category maxes (pre-off-page)

// ── Off-page layer — lives only in this file. Weights are each signal's share of
// the OVERALL score (sum = 70, the off-page half). When all four are present each
// contributes exactly its weight%; missing signals renormalize over the rest.
const DA_WEIGHT = 30        // Domain Authority
const DOMAIN_BL_WEIGHT = 20 // domain backlinks
const PAGE_BL_WEIGHT = 10   // page backlinks
const PA_WEIGHT = 10        // Page Authority
// Backlink reference ceilings: a target at/above the ref earns full backlink
// credit. Log scale handles the heavy skew of backlink counts. Tunable.
const DOMAIN_REF = 1_000_000
const PAGE_REF = 10_000

function coerceAuthority(raw: number | null | undefined): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : null
}

function coerceCount(raw: number | null | undefined): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null
}

// Log-normalize an unbounded count to 0–1 against a reference ceiling.
function logNorm(count: number, ref: number): number {
  return Math.max(0, Math.min(1, Math.log10(count + 1) / Math.log10(ref + 1)))
}

// Weighted off-page points earned + the max available across PRESENT signals
// (0 when none present). Each value is normalized to 0–1.
function offPageScore(
  da: number | null,
  pa: number | null,
  domBL: number | null,
  pageBL: number | null,
): { raw: number; max: number } {
  let raw = 0
  let max = 0
  if (da !== null)    { raw += (da / 100) * DA_WEIGHT;            max += DA_WEIGHT }
  if (domBL !== null) { raw += logNorm(domBL, DOMAIN_REF) * DOMAIN_BL_WEIGHT; max += DOMAIN_BL_WEIGHT }
  if (pa !== null)    { raw += (pa / 100) * PA_WEIGHT;            max += PA_WEIGHT }
  if (pageBL !== null){ raw += logNorm(pageBL, PAGE_REF) * PAGE_BL_WEIGHT;    max += PAGE_BL_WEIGHT }
  return { raw, max }
}

// Blend on-page (0–1) with off-page (0–1): on-page 30% / off-page 70% whenever
// ANY off-page signal is present; with none (offMax=0) the score is on-page only
// — so the blend is inert until DA/PA or backlinks data exists.
function blendTotal(onPageNorm: number, offPageNorm: number, offMax: number): number {
  if (offMax <= 0) return Math.round(onPageNorm * 100)
  return Math.round((onPageNorm * 30 + offPageNorm * 70))
}

function getKwWords(keyword: string): string[] {
  return keyword.toLowerCase().split(/\s+/).filter(w => w.length > 0 && !STOP_WORDS.has(w))
}

function countKwWordsFound(text: string, kwWords: string[]): number {
  if (!text || kwWords.length === 0) return 0
  const t = text.toLowerCase()
  return kwWords.filter(w =>
    new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t)
  ).length
}

// Award up to maxPts scaled by fraction of keyword words found.
// Single-word phrases get full points if the word appears (no penalty for short keywords).
function kwScore(wordsFound: number, maxPts: number, kwCount: number): number {
  if (kwCount === 0 || maxPts === 0) return 0
  const multiplier = maxPts / kwCount
  return Math.min(maxPts, multiplier * wordsFound)
}

function gradeFromTotal(total: number): { grade: string; label: string } {
  if (total >= 90) return { grade: 'A+', label: 'Excellent' }
  if (total >= 80) return { grade: 'A',  label: 'Very Good' }
  if (total >= 70) return { grade: 'B',  label: 'Good' }
  if (total >= 60) return { grade: 'C',  label: 'Fair' }
  if (total >= 50) return { grade: 'D',  label: 'Needs Work' }
  return { grade: 'F', label: 'Poor' }
}

export function computeSeoScore(
  crawlData: CrawlData | null,
  keyword: string,
  url: string | null
): SeoScoreBreakdown {
  const kwWords = getKwWords(keyword)
  const kwCount = kwWords.length

  // ── 1. URL (5 pts) ────────────────────────────────────────────────────────
  let urlScore = 0
  if (url) {
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`)
      const hostname = parsed.hostname.replace(/^www\./, '')
      const pathname = parsed.pathname

      // Keyword in domain (max 2)
      const domainFound = countKwWordsFound(hostname, kwWords)
      urlScore += kwScore(domainFound, 2, Math.max(kwCount, 1))

      // Keyword in page URL slug (max 3)
      const pathFound = countKwWordsFound(pathname, kwWords)
      urlScore += kwScore(pathFound, 3, Math.max(kwCount, 1))
    } catch { /* invalid url — skip */ }
  }

  // ── 2. Title (10 pts) ─────────────────────────────────────────────────────
  let titleScore = 0
  const title = crawlData?.metaTags?.title ?? null
  const titleLen = crawlData?.metaTags?.titleLength ?? title?.length ?? null

  if (titleLen !== null) {
    if (titleLen >= 30 && titleLen <= 60) titleScore += 4
    else if ((titleLen >= 25 && titleLen < 30) || (titleLen > 60 && titleLen <= 70)) titleScore += 2
  }
  if (title) {
    const found = countKwWordsFound(title, kwWords)
    titleScore += kwScore(found, 6, Math.max(kwCount, 1))
  }

  // ── 3. Meta Description (8 pts) ───────────────────────────────────────────
  let metaScore = 0
  const desc = crawlData?.metaTags?.description ?? null
  const descLen = crawlData?.metaTags?.descriptionLength ?? desc?.length ?? null

  if (descLen !== null) {
    if (descLen >= 120 && descLen <= 160) metaScore += 3
    else if (descLen >= 100 && descLen <= 180) metaScore += 1.5
  }
  if (desc) {
    const found = countKwWordsFound(desc, kwWords)
    metaScore += kwScore(found, 5, Math.max(kwCount, 1))
  }

  // ── 4. Word Count & Content (12 pts) ──────────────────────────────────────
  let contentScore = 0
  const wordCount = crawlData?.content?.wordCount ?? 0

  if (wordCount >= 1500) contentScore += 6
  else if (wordCount >= 1000) contentScore += 4
  else if (wordCount >= 500) contentScore += 2

  const firstWords = crawlData?.content?.firstWords ?? ''
  if (firstWords) {
    const words100 = firstWords.split(/\s+/).slice(0, 100).join(' ')
    const found = countKwWordsFound(words100, kwWords)
    contentScore += kwScore(found, 6, Math.max(kwCount, 1))
  }

  // ── 5. Headings (10 pts) ──────────────────────────────────────────────────
  let headingScore = 0
  const h1Tags = crawlData?.headings?.h1 ?? []
  const h2Tags = crawlData?.headings?.h2 ?? []
  const h3Tags = crawlData?.headings?.h3 ?? []

  if (h1Tags.length === 1) headingScore += 3

  if (h1Tags.length > 0) {
    const found = countKwWordsFound(h1Tags.join(' '), kwWords)
    headingScore += kwScore(found, 3, Math.max(kwCount, 1))
  }

  if (h2Tags.length >= 3) headingScore += 2
  else if (h2Tags.length >= 1) headingScore += 1

  if (kwWords.length > 0) {
    const re = (w: string) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
    const h2Text = h2Tags.join(' ').toLowerCase()
    const h3Text = h3Tags.join(' ').toLowerCase()
    if (kwWords.some(w => re(w).test(h2Text))) headingScore += 1
    if (kwWords.some(w => re(w).test(h3Text))) headingScore += 1
  }

  // ── 6. Images (5 pts) ─────────────────────────────────────────────────────
  let imageScore = 0
  const totalImages = crawlData?.imageAnalysis?.total ?? 0
  const imagesWithAlt = crawlData?.imageAnalysis?.withAlt ?? 0

  if (totalImages >= 1) imageScore += 1
  if (totalImages > 0) imageScore += (imagesWithAlt / totalImages) * 2

  if (crawlData?.imageAnalysis?.images && kwWords.length > 0) {
    const hasKwAlt = crawlData.imageAnalysis.images.some(
      (img: { alt?: string }) => kwWords.some(w => img.alt?.toLowerCase().includes(w))
    )
    if (hasKwAlt) imageScore += 2
  }

  // ── 7. Schema Markup (5 pts) ──────────────────────────────────────────────
  const schemaScore = (crawlData?.structuredData?.totalSchemas ?? 0) > 0 ? 5 : 0

  // ── 8. Content Structure (6 pts) ──────────────────────────────────────────
  let structureScore = 0
  if (crawlData?.contentStructure?.hasTableOfContents) structureScore += 2
  if (crawlData?.contentStructure?.hasFaqSection) structureScore += 2
  if (crawlData?.contentStructure?.hasVideo) structureScore += 2

  // ── 9. Lighthouse Scores (15 pts) ─────────────────────────────────────────
  let lighthouseScore = 0
  const psi = crawlData?.psiData
  if (psi?.scores) {
    const { performance, seo, accessibility, bestPractices } = psi.scores
    if (performance != null) lighthouseScore += (performance / 100) * 5
    if (seo != null)         lighthouseScore += (seo / 100) * 4
    if (accessibility != null) lighthouseScore += (accessibility / 100) * 3
    if (bestPractices != null) lighthouseScore += (bestPractices / 100) * 3
  }

  // ── 10. Core Web Vitals (10 pts) ──────────────────────────────────────────
  let cwvScore = 0
  const ttfb = psi?.vitals?.ttfb ?? crawlData?.performance?.ttfb ?? null
  const fcp  = psi?.vitals?.fcp  ?? crawlData?.performance?.webVitals?.fcp ?? null
  const lcp  = psi?.vitals?.lcp  ?? crawlData?.performance?.webVitals?.lcp ?? null
  const tbt  = psi?.vitals?.tbt  ?? null
  const cls  = psi?.vitals?.cls  ?? crawlData?.performance?.webVitals?.cls ?? null

  if (ttfb != null) cwvScore += ttfb < 200 ? 2 : ttfb <= 500 ? 1 : 0
  if (fcp  != null) cwvScore += fcp  < 1800 ? 2 : fcp  <= 3000 ? 1 : 0
  if (lcp  != null) cwvScore += lcp  < 2500 ? 2 : lcp  <= 4000 ? 1 : 0
  if (tbt  != null) cwvScore += tbt  < 200  ? 2 : tbt  <= 600  ? 1 : 0
  if (cls  != null) cwvScore += cls  < 0.1  ? 2 : cls  <= 0.25 ? 1 : 0

  // ── 11. Internal & External Links (12 pts) ────────────────────────────────
  let linkScore = 0
  const internalLinksArr: Array<{ url?: string; text?: string; section?: string }> =
    crawlData?.linkAnalysis?.internalLinks ?? []
  const dedupedInternal =
    internalLinksArr.length
      ? new Set(internalLinksArr.map(l => l.url).filter(Boolean)).size
      : (crawlData?.linkAnalysis?.internal ?? 0)

  if (dedupedInternal >= 10) linkScore += 4
  else if (dedupedInternal >= 5) linkScore += 2
  else if (dedupedInternal >= 1) linkScore += 1

  const externalLinksArr: Array<{ url?: string; text?: string; isNofollow?: boolean }> =
    crawlData?.linkAnalysis?.externalLinks ?? []
  const uniqueExt = [
    ...new Map(externalLinksArr.map(l => [l.url, l])).values()
  ].filter(l => l.url)
  const totalExternal = uniqueExt.length || (crawlData?.linkAnalysis?.external ?? 0)
  const nofollowCount = uniqueExt.filter(l => l.isNofollow).length
  const dofollowCount = totalExternal - nofollowCount

  if (totalExternal >= 3) linkScore += 3
  else if (totalExternal >= 1) linkScore += 1.5

  if (totalExternal > 0) linkScore += (dofollowCount / totalExternal) * 2

  if (internalLinksArr.length > 0 && kwWords.length > 0) {
    const anchorText = internalLinksArr.map(l => l.text ?? '').join(' ')
    const found = countKwWordsFound(anchorText, kwWords)
    linkScore += kwScore(found, 3, Math.max(kwCount, 1))
  }

  // ── 12. Anchor Text Distribution (5 pts) ──────────────────────────────────
  let anchorScore = 0
  const mainLinks   = internalLinksArr.filter(l => l.section === 'main').length
  const headerLinks = internalLinksArr.filter(l => l.section === 'header').length
  const footerLinks = internalLinksArr.filter(l => l.section === 'footer').length

  if (mainLinks >= 5) anchorScore += 2
  else if (mainLinks >= 1) anchorScore += 1
  if (headerLinks >= 1) anchorScore += 1
  if (footerLinks >= 1) anchorScore += 1

  if (kwWords.length > 0) {
    const allAnchorText = internalLinksArr.map(l => l.text ?? '').join(' ')
    const hasKw = kwWords.some(w =>
      new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(allAnchorText.toLowerCase())
    )
    if (hasKw) anchorScore += 1
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  const rawScore =
    urlScore + titleScore + metaScore + contentScore + headingScore +
    imageScore + schemaScore + structureScore + lighthouseScore + cwvScore +
    linkScore + anchorScore

  // When PSI hasn't loaded yet, exclude its buckets from the denominator so
  // a PSI-pending site isn't unfairly compared against a PSI-loaded one.
  // - Lighthouse bucket (15 pts) is gone entirely without PSI.
  // - TBT (2 of CWV's 10 pts) only ships in PSI; other vitals come from the
  //   page-level Playwright crawl so the rest of CWV stays comparable.
  const psiMissing = !psi?.scores
  const tbtMissing = (psi?.vitals?.tbt ?? null) === null
  // When linkAnalysis is withheld (free-tier locked competitor) or never
  // captured, exclude the Links (12) + Anchors (5) buckets so the page isn't
  // unfairly penalized for data it doesn't have — mirrors the PSI handling.
  // A present-but-empty linkAnalysis is a real zero-links signal and stays in.
  const linkDataMissing = !crawlData?.linkAnalysis
  let denom = RAW_MAX
  if (psiMissing) denom -= 15
  if (tbtMissing) denom -= 2
  if (linkDataMissing) denom -= 17

  // On-page normalized to 0–1, then blended 50/50 with off-page (DA/PA +
  // backlinks). Off-page is a fixed 50% when any off-page signal is present.
  const onPageNorm = Math.min(1, rawScore / denom)
  const da = coerceAuthority(crawlData?.authority?.da)
  const pa = coerceAuthority(crawlData?.authority?.pa)
  const domainBacklinks = coerceCount(crawlData?.backlinks?.domain)
  const pageBacklinks = coerceCount(crawlData?.backlinks?.page)
  const { raw: offRaw, max: offMax } = offPageScore(da, pa, domainBacklinks, pageBacklinks)
  const offPageNorm = offMax > 0 ? offRaw / offMax : 0
  const total = Math.min(100, blendTotal(onPageNorm, offPageNorm, offMax))
  const { grade, label } = gradeFromTotal(total)

  const r1 = (v: number) => Math.round(v * 10) / 10

  return {
    url:        r1(urlScore),
    title:      r1(titleScore),
    meta:       r1(metaScore),
    content:    r1(contentScore),
    headings:   r1(headingScore),
    images:     r1(imageScore),
    schema:     schemaScore,
    structure:  structureScore,
    lighthouse: r1(lighthouseScore),
    cwv:        r1(cwvScore),
    links:      r1(linkScore),
    anchors:    anchorScore,
    da,
    pa,
    domainBacklinks,
    pageBacklinks,
    onPageScore:  Math.round(onPageNorm * 100),
    offPageScore: offMax > 0 ? Math.round(offPageNorm * 100) : null,
    total,
    grade,
    label,
  }
}

// Dashboard tokens (defined in app/dashboard.css) — keeps the comparison
// table and any future score widgets visually consistent with the rest of
// the SaaS dashboard.
export function scoreColor(total: number): string {
  if (total >= 80) return 'text-[color:var(--pos)]'
  if (total >= 60) return 'text-[color:var(--warn)]'
  return 'text-[color:var(--neg)]'
}

export function scoreBarBg(total: number): string {
  if (total >= 80) return 'bg-[color:var(--pos)]'
  if (total >= 60) return 'bg-[color:var(--warn)]'
  return 'bg-[color:var(--neg)]'
}
