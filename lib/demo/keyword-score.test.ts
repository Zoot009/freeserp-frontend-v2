// Keyword-score specifics only; routing, read-only and 404s are the contract test (index.test.ts).
import { describe, expect, it } from "vitest"
import { computeSeoScore } from "@/lib/seoScorer"
import type { CrawlData } from "@/types/competitor-analysis"
import { keywordScoreDemo, keywordScoreDemoListItem } from "./keyword-score"
import { rankTrackerDemo } from "./rank-tracker"

type Analysis = { id: string; status: string; keyword: string; url: string; overallScore: number; crawlData: CrawlData; createdAt: string; completedAt: string }
const { analysis } = keywordScoreDemo.get([], new URLSearchParams()) as { analysis: Analysis }

describe("demo keyword score", () => {
  it("is finished and dated today, so nothing polls", () => {
    expect(analysis).toMatchObject({ id: "demo", status: "COMPLETED" })
    const age = Date.now() - Date.parse(analysis.completedAt)
    expect(age).toBeGreaterThan(0)
    expect(age).toBeLessThan(2 * 86_400_000)
    expect(Date.parse(analysis.crawlData.crawledAt)).toBeLessThanOrEqual(Date.parse(analysis.completedAt))
  })

  it("scores the same in the browser as the backend stored", () => {
    expect(computeSeoScore(analysis.crawlData, analysis.keyword, analysis.url).total).toBe(analysis.overallScore)
  })

  it("agrees with its history row and the rank tracker demo's score badge", () => {
    expect(keywordScoreDemoListItem()).toMatchObject({ id: "demo", keyword: analysis.keyword, overallScore: analysis.overallScore })
    const project = rankTrackerDemo.get([], new URLSearchParams()) as { keywords: { keyword: string; pageScore: number | null }[] }
    expect(project.keywords.find((k) => k.keyword === analysis.keyword)?.pageScore).toBe(analysis.overallScore)
  })
})
