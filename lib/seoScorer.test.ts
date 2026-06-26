import { describe, it, expect } from 'vitest'
import { computeSeoScore } from './seoScorer'
import type { CrawlData } from '@/types/competitor-analysis'

// computeSeoScore reads every field with optional chaining, so a partial fixture
// cast to CrawlData is enough. This page has some on-page signal but no PSI and
// no link data, so the on-page denominator adapts the same way for every case —
// what we assert is the AUTHORITY blend layered on top, relative to the
// no-authority baseline (`base`).
const KEYWORD = 'blue widgets'
const URL = 'https://blue-widgets.com/blue-widgets-guide'

function crawl(authority?: { da: number | null; pa: number | null }): CrawlData {
  return {
    metaTags: { title: 'Blue Widgets Guide', titleLength: 42, description: 'A guide to blue widgets and more.', descriptionLength: 130 },
    content: { wordCount: 1600, firstWords: 'Blue widgets are great for everyone.' },
    headings: { h1: ['Blue Widgets Guide'], h2: ['Why blue widgets', 'More widgets', 'Even more'], h3: [] },
    ...(authority !== undefined ? { authority: { ...authority, source: 'test' } } : {}),
  } as unknown as CrawlData
}

const base = computeSeoScore(crawl(), KEYWORD, URL).total
const r = (n: number) => Math.round(n)

describe('computeSeoScore — DA/PA authority blend (DA 40% / PA 10%)', () => {
  it('has a meaningful on-page baseline to blend against', () => {
    expect(base).toBeGreaterThan(0)
    expect(base).toBeLessThan(100)
  })

  it('is inert (unchanged) when no authority data is present', () => {
    expect(computeSeoScore(crawl(), KEYWORD, URL).total).toBe(base)
    expect(computeSeoScore(crawl({ da: null, pa: null }), KEYWORD, URL).total).toBe(base)
    const s = computeSeoScore(crawl(), KEYWORD, URL)
    expect(s.da).toBeNull()
    expect(s.pa).toBeNull()
    expect(s.authority).toBe(0)
  })

  it('blends 50/50 when both DA & PA are present — perfect authority lifts the score', () => {
    // authMax 50, authNorm 1 → total = round(base/2 + 50), and > base
    const s = computeSeoScore(crawl({ da: 100, pa: 100 }), KEYWORD, URL)
    expect(s.total).toBe(r(base / 2 + 50))
    expect(s.total).toBeGreaterThan(base)
    expect(s.da).toBe(100)
    expect(s.pa).toBe(100)
    expect(s.authority).toBe(50)
  })

  it('drags the score toward half when authority is present but zero', () => {
    // authMax 50, authNorm 0 → total = round(base/2), and < base
    const s = computeSeoScore(crawl({ da: 0, pa: 0 }), KEYWORD, URL)
    expect(s.total).toBe(r(base / 2))
    expect(s.total).toBeLessThan(base)
    expect(s.authority).toBe(0)
  })

  it('weights DA 4× PA', () => {
    const daHeavy = computeSeoScore(crawl({ da: 100, pa: 0 }), KEYWORD, URL).total
    const paHeavy = computeSeoScore(crawl({ da: 0, pa: 100 }), KEYWORD, URL).total
    // Same on-page; DA=100/PA=0 must beat DA=0/PA=100 because DA carries 4× the weight.
    expect(daHeavy).toBeGreaterThan(paHeavy)
  })

  it('adapts the denominator when only DA is available (weight 40)', () => {
    // onPageNorm = base/100; total = round((base/100*50 + 1*40) / 90 * 100)
    const s = computeSeoScore(crawl({ da: 100, pa: null }), KEYWORD, URL)
    expect(s.total).toBe(r(((base / 100) * 50 + 40) / 90 * 100))
    expect(s.da).toBe(100)
    expect(s.pa).toBeNull()
    expect(s.authority).toBe(40)
  })

  it('adapts the denominator when only PA is available (weight 10)', () => {
    // total = round((base/100*50 + 1*10) / 60 * 100)
    const s = computeSeoScore(crawl({ da: null, pa: 100 }), KEYWORD, URL)
    expect(s.total).toBe(r(((base / 100) * 50 + 10) / 60 * 100))
    expect(s.pa).toBe(100)
    expect(s.da).toBeNull()
    expect(s.authority).toBe(10)
  })

  it('clamps out-of-range authority values to 0–100', () => {
    const s = computeSeoScore(crawl({ da: 150, pa: -5 }), KEYWORD, URL)
    expect(s.da).toBe(100)
    expect(s.pa).toBe(0)
    // authRaw = (0/100)*10 + (100/100)*40 = 40, authMax 50, authNorm 0.8
    expect(s.total).toBe(r(((base / 100) * 50 + 0.8 * 50) / 100 * 100))
  })
})
