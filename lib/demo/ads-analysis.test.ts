// Ads-analysis specifics only; read-only/404/matching is the contract test (index.test.ts).
// SCORECARD and FORECAST are embedded backend output (see ads-analysis.ts): these
// checks fail if the scan or assumptions change without regenerating them.
import { describe, expect, it } from "vitest"
import { routeDemo } from "./index"
import { adsAnalysisDemo, adsAnalysisDemoRow } from "./ads-analysis"
import type { AdsAnalysisResponse } from "@/lib/ads-analysis"

// The registry loads tools lazily (async); routed synchronously against the module here.
const demoResponse = (url: string, method: string) => routeDemo("/api/ads-analysis", adsAnalysisDemo, url, method)

const r = demoResponse("/api/ads-analysis/demo", "GET")
if (!r || r.error) throw new Error("expected demo data")
const data = r.data as AdsAnalysisResponse
const { analysis, result, forecast, scorecard, assumptions } = data

describe("demo ads analysis", () => {
  it("is finished, so nothing polls", () => {
    expect(analysis).toMatchObject({ id: "demo", status: "COMPLETED" })
    expect(result && forecast && scorecard).toBeTruthy()
  })

  it("scores consistently with its modules (score.ts WEIGHTS)", () => {
    const WEIGHTS = { landing: 25, tracking: 25, speed: 20, keywords: 15, budget: 10, technical: 5 }
    let total = 0
    let weight = 0
    for (const [k, v] of Object.entries(scorecard!.modules)) {
      if (v == null) continue
      total += v * WEIGHTS[k as keyof typeof WEIGHTS]
      weight += WEIGHTS[k as keyof typeof WEIGHTS]
    }
    expect(Math.round(total / weight)).toBe(scorecard!.overall)
    expect(analysis.score).toBe(scorecard!.overall)
  })

  it("forecasts from its own keywords and assumptions (forecast.ts)", () => {
    const rows = result!.keywords!.groups.flatMap((g) => g.keywords)
    const vol = rows.reduce((a, k) => a + (k.volume ?? 0), 0)
    const cpc = rows.reduce((a, k) => a + (k.cpc ?? 0) * (k.volume ?? 0), 0) / vol
    expect(forecast!.avgCpc).toBe(Math.round(cpc * 100) / 100)
    expect(forecast!.budget).toBe(assumptions.budgetUsd)
    expect(forecast!.breakevenJobs).toBe(Math.ceil(assumptions.budgetUsd! / assumptions.jobValueUsd!))
  })

  it("raises issues only about pages and services the scan has", () => {
    const paths = new Set(result!.pages.map((p) => new URL(p.url).pathname))
    for (const i of scorecard!.issues) {
      if (i.where.startsWith("/")) expect(paths.has(i.where)).toBe(true)
    }
    const missing = result!.services.filter((s) => s.status === "missing").map((s) => s.name)
    expect(scorecard!.issues.filter((i) => i.title.startsWith("No dedicated page")).length).toBe(missing.length)
    for (const s of result!.services) if (s.url) expect(paths.has(new URL(s.url).pathname)).toBe(true)
  })

  it("pins a history row with the report's score", () => {
    expect(adsAnalysisDemoRow().subtitle).toContain(`Score ${analysis.score}/100`)
  })
})
