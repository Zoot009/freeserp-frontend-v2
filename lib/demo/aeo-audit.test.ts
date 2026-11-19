// AEO-audit specifics only; routing, read-only and 404s are the contract test (index.test.ts).
import { describe, expect, it } from "vitest"
import type { AeoReport } from "@/lib/aeo"
import { aeoAuditDemo, aeoAuditDemoRow } from "./aeo-audit"

const report = (aeoAuditDemo.get([], new URLSearchParams()) as { report: AeoReport }).report
const { audit, breakdown, findings, fixes, previous, pages } = report

describe("demo AEO audit", () => {
  it("is finished, with nothing waiting on the user, so nothing polls", () => {
    expect(audit).toMatchObject({ id: "demo", status: "COMPLETED", error: null })
    expect(audit.progress?.choosing).toBeUndefined()
    expect(audit.aeoScore).toBe(breakdown!.aeo)
    expect(audit.geoScore).toBe(breakdown!.geo)
    expect(report.history.aeo.at(-1)).toBe(breakdown!.aeo)
  })

  it("builds every fix from that rule's own failing findings", () => {
    for (const f of fixes) {
      expect(f.failing.length).toBeGreaterThan(0)
      for (const x of f.failing) expect(x).toMatchObject({ checkId: f.checkId, passed: false })
    }
    const failingRules = new Set(findings.filter((x) => !x.passed).map((x) => x.checkId))
    expect(new Set(fixes.map((f) => f.checkId))).toEqual(failingRules)
  })

  it("summarises each engine's answers as visibility.ts does", () => {
    for (const m of breakdown!.measured!) {
      const answered = m.questions!.filter((q) => q.outcome)
      const cited = answered.filter((q) => q.outcome === "cited").length
      expect(m.cited).toBe(cited)
      expect(m.answered).toBe(answered.length)
      expect(m.score).toBe(Math.round((100 * cited) / answered.length))
    }
  })

  it("compares with the previous run consistently", () => {
    const failsNow = (id: string) => findings.some((x) => x.checkId === id && !x.passed)
    for (const r of previous!.fixed) expect(failsNow(r.checkId)).toBe(false)
    for (const r of previous!.regressed) expect(failsNow(r.checkId)).toBe(true)
    expect(report.others).toEqual([]) // nothing the demo would link to and couldn't open
  })

  it("only reports on the crawled site", () => {
    const urls = new Set(pages.map((p) => p.url))
    for (const x of findings) expect(x.url.startsWith(report.origin)).toBe(true)
    expect(urls.size).toBe(pages.length)
  })

  it("pins a history row with the report's scores, and is stable", () => {
    expect(aeoAuditDemoRow().subtitle).toBe(`AEO ${breakdown!.aeo} · GEO ${breakdown!.geo}`)
    expect(aeoAuditDemo.get([], new URLSearchParams())).toEqual({ report })
  })
})
