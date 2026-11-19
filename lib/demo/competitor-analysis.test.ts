// Competitor-analysis specifics only; routing, read-only and 404s are the contract test (index.test.ts).
import { describe, expect, it } from "vitest"
import type { AnalysisData } from "@/types/competitor-analysis"
import { competitorAnalysisDemo, competitorAnalysisDemoRow } from "./competitor-analysis"

const { analysis } = competitorAnalysisDemo.get([], new URLSearchParams()) as { analysis: AnalysisData & { error: unknown } }

describe("demo competitor analysis", () => {
  it("is a finished, unrestricted analysis, so nothing polls or locks", () => {
    expect(analysis).toMatchObject({ id: "demo", status: "COMPLETED", error: null })
    expect(analysis.stages?.main.ready).toBe(true)
    expect(analysis.access).toMatchObject({ partial: false, aiPlanRestricted: false, lockedCategoryIds: [] })
    for (const c of analysis.competitors) expect(c.internalCrawlStatus).not.toBe("locked")
  })

  it("dates the analysis today, not when it was generated", () => {
    const age = Date.now() - Date.parse(analysis.createdAt)
    expect(age).toBeGreaterThan(0)
    expect(age).toBeLessThan(2 * 86_400_000)
  })

  it("ranks Nike among competitors in SERP order, with one failed crawl shown as failed", () => {
    expect(analysis.yourPosition).toBe(3)
    const positions = analysis.competitors.map((c) => c.position)
    expect(positions).toEqual([...positions].sort((a, b) => a! - b!))
    const failed = analysis.competitors.filter((c) => c.crawlError)
    expect(failed.map((c) => c.domain)).toEqual(["amazon.com"])
    for (const c of analysis.competitors.filter((x) => !x.crawlError)) {
      expect(c.wordCount).toBe(c.fullCrawlData!.content.wordCount)
      expect(c.h2Count).toBe(c.fullCrawlData!.headings.h2.length)
    }
  })

  it("pins a history row that opens this analysis", () => {
    expect(competitorAnalysisDemoRow().href).toContain("analysisId=demo")
    expect(competitorAnalysisDemo.get(["link-graph"], new URLSearchParams())).toBeUndefined()
  })
})
