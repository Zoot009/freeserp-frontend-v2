import { describe, expect, it } from "vitest"
// Keyword-Magic specifics only; read-only/404/matching is the contract test (index.test.ts).
import { kdBand, keywordWords, rowStats } from "@/lib/keyword-magic"
import { routeDemo } from "./index"
import { keywordMagicDemo } from "./keyword-magic"
import { rankTrackerDemo } from "./rank-tracker"

// The registry loads tools lazily (async); routed synchronously against the module here.
const demoResponse = (url: string, method: string) => routeDemo("/api/keyword-magic", keywordMagicDemo, url, method)

type Row = { keyword: string; volume: number; difficulty: number | null; cpc: number | null; intent: string; serpFeatures: string[]; trend: unknown[] }
type Search = {
  seed: string; totalCount: number; fetchedCount: number; totalVolume: number; avgDifficulty: number
  groups: { word: string; count: number }[]; keywords: Row[]
}

describe("demo keyword magic", () => {
  const r = demoResponse("/api/keyword-magic/demo", "GET")
  const s = r?.data as Search

  it("is a GET, so demo view never runs the charged POST", () => {
    expect(r?.error).toBeUndefined()
    expect(demoResponse("/api/keyword-magic", "POST")).toBeNull() // the real search is not the demo's
  })

  it("totals and groups are computed from its own rows, as the backend computes them", () => {
    expect(s.fetchedCount).toBe(s.keywords.length)
    expect(s.totalCount).toBeGreaterThanOrEqual(s.fetchedCount)
    expect(s.totalVolume).toBe(s.keywords.reduce((n, k) => n + k.volume, 0))
    expect(s.avgDifficulty).toBe(rowStats(s.keywords).avgDifficulty)
    const seedWords = new Set(keywordWords(s.seed))
    for (const g of s.groups) {
      expect(seedWords.has(g.word)).toBe(false)
      expect(g.count).toBe(s.keywords.filter((k) => keywordWords(k.keyword).includes(g.word)).length)
    }
  })

  it("lists rows volume-first, with a 12-month trend each, and is stable", () => {
    const vols = s.keywords.map((k) => k.volume)
    expect(vols).toEqual([...vols].sort((a, b) => b - a))
    expect(s.keywords.every((k) => k.trend.length === 12)).toBe(true)
    expect(new Set(s.keywords.map((k) => k.keyword)).size).toBe(s.keywords.length)
    expect(demoResponse("/api/keyword-magic/demo", "GET")?.data).toEqual(s)
  })

  it("gives a keyword the rank tracker tracks the rank tracker's volume", () => {
    const tracked = (rankTrackerDemo.get([], new URLSearchParams()) as { keywords: { keyword: string; searchVolume: number }[] }).keywords
    const shared = tracked.filter((t) => s.keywords.some((k) => k.keyword === t.keyword))
    expect(shared.map((t) => t.keyword)).toEqual(expect.arrayContaining([s.seed, `${s.seed} store near me`, `${s.seed} promo code`]))
    for (const t of shared) expect(s.keywords.find((k) => k.keyword === t.keyword)?.volume).toBe(t.searchVolume)
  })

  it("shows every KD band, and the database's gaps as empty cells", () => {
    const bands = new Set(s.keywords.flatMap((k) => (k.difficulty == null ? [] : [kdBand(k.difficulty)])))
    expect([...bands].sort()).toEqual(["easy", "hard", "medium"])
    expect(s.keywords.some((k) => k.difficulty == null)).toBe(true)
    expect(s.keywords.some((k) => k.cpc == null)).toBe(true)
  })
})
