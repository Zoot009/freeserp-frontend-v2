import { describe, it, expect } from 'vitest'
import { computeSeoScore } from './seoScorer'
import type { CrawlData } from '@/types/competitor-analysis'

// computeSeoScore reads every field with optional chaining, so a partial fixture
// cast to CrawlData is enough. This page has on-page signal but no PSI and no
// link data, so the on-page denominator is identical across cases — what we
// assert is the OFF-PAGE blend layered on top, relative to the no-off-page
// baseline (`base`). Off-page weights (share of overall): DA 30 / domainBL 20 /
// pageBL 10 / PA 10 (sum 70); blend = on-page 30% + off-page 70%.
const KEYWORD = 'blue widgets'
const URL = 'https://blue-widgets.com/blue-widgets-guide'

interface OffInput { da?: number | null; pa?: number | null; domBL?: number | null; pageBL?: number | null }

function crawl(off?: OffInput): CrawlData {
  const base = {
    metaTags: { title: 'Blue Widgets Guide', titleLength: 42, description: 'A guide to blue widgets and more.', descriptionLength: 130 },
    content: { wordCount: 1600, firstWords: 'Blue widgets are great for everyone.' },
    headings: { h1: ['Blue Widgets Guide'], h2: ['Why blue widgets', 'More widgets', 'Even more'], h3: [] },
  }
  if (!off) return base as unknown as CrawlData
  return {
    ...base,
    authority: { da: off.da ?? null, pa: off.pa ?? null, source: 'test' },
    backlinks: { domain: off.domBL ?? null, page: off.pageBL ?? null, source: 'test' },
  } as unknown as CrawlData
}

const base = computeSeoScore(crawl(), KEYWORD, URL).total
const near = (a: number, b: number) => Math.abs(a - b) <= 1 // tolerate ±1 rounding of onPageNorm

describe('computeSeoScore — off-page blend (DA/PA + backlinks), on-page 30% / off-page 70%', () => {
  it('has a meaningful on-page baseline', () => {
    expect(base).toBeGreaterThan(0)
    expect(base).toBeLessThan(100)
  })

  it('is on-page-only when no off-page data is present', () => {
    const s = computeSeoScore(crawl(), KEYWORD, URL)
    expect(s.total).toBe(base)
    expect(s.onPageScore).toBe(base)
    expect(s.offPageScore).toBeNull()
    expect(s.da).toBeNull()
    expect(s.pa).toBeNull()
    expect(s.domainBacklinks).toBeNull()
    expect(s.pageBacklinks).toBeNull()
  })

  it('treats explicit all-null off-page the same as absent (inert)', () => {
    const s = computeSeoScore(crawl({}), KEYWORD, URL)
    expect(s.total).toBe(base)
    expect(s.offPageScore).toBeNull()
  })

  it('blends a fixed 70% off-page — perfect off-page lifts the score', () => {
    const s = computeSeoScore(crawl({ da: 100, pa: 100 }), KEYWORD, URL)
    expect(s.offPageScore).toBe(100)
    expect(s.total).toBeGreaterThan(base)
    expect(near(s.total, Math.round(base * 0.3 + 70))).toBe(true)
  })

  it('drags the score toward 30% when off-page is present but zero', () => {
    const s = computeSeoScore(crawl({ da: 0, pa: 0 }), KEYWORD, URL)
    expect(s.offPageScore).toBe(0)
    expect(s.total).toBeLessThan(base)
    expect(near(s.total, Math.round(base * 0.3))).toBe(true)
  })

  it('weights DA above PA (DA 30 : PA 10 = 3:1)', () => {
    const daOnly = computeSeoScore(crawl({ da: 100, pa: 0 }), KEYWORD, URL).offPageScore
    const paOnly = computeSeoScore(crawl({ da: 0, pa: 100 }), KEYWORD, URL).offPageScore
    expect(daOnly).toBe(75) // 30 / (30+10)
    expect(paOnly).toBe(25) // 10 / (30+10)
  })

  it('keeps off-page a fixed 70% regardless of which signals are present', () => {
    // DA alone at 100 → offPageNorm 1, same as DA+PA both 100 → identical total.
    const daOnly = computeSeoScore(crawl({ da: 100 }), KEYWORD, URL)
    const both = computeSeoScore(crawl({ da: 100, pa: 100 }), KEYWORD, URL)
    expect(daOnly.offPageScore).toBe(100)
    expect(daOnly.total).toBe(both.total)
  })

  it('folds backlink counts into the off-page score (log-normalized)', () => {
    const noBL = computeSeoScore(crawl({ da: 50, pa: 50 }), KEYWORD, URL)
    const strongBL = computeSeoScore(crawl({ da: 50, pa: 50, domBL: 1_000_000, pageBL: 10_000 }), KEYWORD, URL)
    const zeroBL = computeSeoScore(crawl({ da: 50, pa: 50, domBL: 0, pageBL: 0 }), KEYWORD, URL)
    expect(noBL.offPageScore).toBe(50)     // (0.5*30 + 0.5*10) / 40
    expect(strongBL.offPageScore).toBe(71) // (15 + 20 + 5 + 10) / 70
    expect(strongBL.offPageScore!).toBeGreaterThan(noBL.offPageScore!)
    expect(zeroBL.offPageScore!).toBeLessThan(noBL.offPageScore!) // 0-count backlinks drag it down
    expect(strongBL.domainBacklinks).toBe(1_000_000)
    expect(strongBL.pageBacklinks).toBe(10_000)
  })

  it('clamps DA/PA to 0–100 and ignores negative counts', () => {
    const s = computeSeoScore(crawl({ da: 150, pa: -5, domBL: -10 }), KEYWORD, URL)
    expect(s.da).toBe(100)
    expect(s.pa).toBe(0)
    expect(s.domainBacklinks).toBeNull() // negative count rejected
    expect(s.offPageScore).toBe(75)      // da 30 of (30+10) present
  })
})

// Accented and non-Latin keywords used to score zero on every keyword check:
// \b only knows ASCII word characters, so "café" had no boundary after its last
// letter and "école"/"Übersetzung" none before their first. The same cases run
// against the backend's seoScore.ts (tests/unit/seo-score-unicode.spec.ts) — the
// two scorers must agree. `titleLength: 10` takes the length points out of the
// title bucket, so the title score is exactly the keyword share (6 = all found).
const titleScore = (title: string, keyword: string) =>
  computeSeoScore({ metaTags: { title, titleLength: 10 } } as unknown as CrawlData, keyword, null).title

describe('computeSeoScore — keyword matching beyond ASCII', () => {
  it.each([
    ['café', 'Le meilleur café de Paris'],
    ['école', 'Une école à Lyon'],
    ['qualité', 'Contrôle qualité des produits'],
    ['Übersetzung', 'Professionelle Übersetzung online'],
    ['купить диван', 'Купить диван недорого в Москве'],
    ['blue widgets', 'Blue Widgets Guide'],
  ])('finds "%s" in "%s"', (keyword, title) => {
    expect(titleScore(title, keyword)).toBe(6)
  })

  it('still matches whole words only', () => {
    expect(titleScore('Cafés et thés', 'café')).toBe(0)
    expect(titleScore('Le meilleur café', 'cafe')).toBe(0)
    expect(titleScore('Диваны недорого', 'диван')).toBe(0)
  })

  it('treats decomposed and precomposed accents as the same text', () => {
    expect(titleScore('Le meilleur café de Paris', 'café')).toBe(6)
    expect(titleScore('Le meilleur café de Paris', 'café')).toBe(6)
  })

  it('matches in headings, anchors and an accented URL slug too', () => {
    const s = computeSeoScore(
      {
        headings: { h1: [], h2: ['Notre école'], h3: ['Pourquoi une école ?'] },
        linkAnalysis: { internalLinks: [{ url: '/a', text: 'Inscription école', section: 'main' }] },
      } as unknown as CrawlData,
      'école',
      'https://example.fr/%C3%A9cole-lyon',
    )
    expect(s.headings).toBe(3) // one h2 (+1), keyword in h2 (+1) and h3 (+1)
    expect(s.anchors).toBe(2)  // one main-section link (+1), keyword in anchors (+1)
    expect(s.links).toBe(4)    // one internal link (+1), keyword in anchor text (+3)
    expect(s.url).toBe(3)      // keyword in the decoded path
  })
})
