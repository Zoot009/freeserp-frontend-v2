// Page-audit specifics only; read-only/404/matching is the contract test (index.test.ts).
import { describe, expect, it } from "vitest"
import { routeDemo } from "./index"
import { pageAuditDemo, pageAuditDemoListItem } from "./page-audit"
import { CHECK_DEFS } from "./page-audit-checks"

// The registry loads tools lazily (async); routed synchronously against the module here.
const demoResponse = (url: string, method: string) => routeDemo("/api/page-audit/reports", pageAuditDemo, url, method)

const BASE = "/api/page-audit/reports/demo"
const get = <T,>(path: string) => {
  const r = demoResponse(path, "GET")
  if (!r || r.error) throw new Error(`expected data for ${path}`)
  return r.data as T
}

type Report = {
  id: string; mode: string; status: string; pageSpeedStatus: string; pagesAnalyzed: number
  overallScore: number; overallGrade: string
  totals: { pages: number; issues: number }
  issues: { type: string; pageUrl: string | null }[]
  checks: { id: string; passed: boolean | null; informational: boolean }[]
}
type Paged<T> = { items: T[]; total: number }

describe("demo page audit", () => {
  const report = get<Report>(BASE)

  it("is a finished whole-site report, so nothing polls", () => {
    expect(report).toMatchObject({ id: "demo", mode: "SITE", status: "COMPLETED", pageSpeedStatus: "completed" })
  })

  it("carries every check in the backend catalogue exactly once", () => {
    expect(report.checks.map((c) => c.id).sort()).toEqual(CHECK_DEFS.map((d) => d.id).sort())
  })

  it("flags exactly the checks that have issues", () => {
    const failed = report.checks.filter((c) => c.passed === false && !c.informational).map((c) => c.id).sort()
    expect([...new Set(report.issues.map((i) => i.type))].sort()).toEqual(failed)
  })

  it("agrees across the report, issue groups, issue pages and pages list", () => {
    expect(report.totals.issues).toBe(report.issues.length)
    const { groups } = get<{ groups: { type: string; occurrences: number }[] }>(`${BASE}/issue-groups`)
    expect(groups.reduce((a, g) => a + g.occurrences, 0)).toBe(report.issues.length)
    for (const g of groups) {
      expect(get<Paged<unknown>>(`${BASE}/issues/${g.type}/pages?limit=200`).total).toBe(g.occurrences)
    }

    const pages = get<Paged<{ url: string; issueCount: number }>>(`${BASE}/pages?limit=100`)
    expect(pages.total).toBe(report.pagesAnalyzed)
    const onPages = report.issues.filter((i) => i.pageUrl).length
    expect(pages.items.reduce((a, p) => a + p.issueCount, 0)).toBe(onPages)
    expect(get<Paged<unknown>>(`${BASE}/pages?limit=5&offset=5`).items).toHaveLength(5)
    expect(get<Paged<{ url: string }>>(`${BASE}/pages?q=/a/`).items.every((p) => p.url.includes("/a/"))).toBe(true)
  })

  it("pins a history row that matches the report, and is stable", () => {
    expect(pageAuditDemoListItem()).toMatchObject({
      id: "demo", overallScore: report.overallScore, overallGrade: report.overallGrade, issueCount: report.issues.length,
    })
    expect(get(BASE)).toEqual(report)
  })

  it("404s an issue type the report doesn't have", () => {
    expect(demoResponse(`${BASE}/issues/NOPE/pages`, "GET")).toMatchObject({ error: { status: 404 } })
  })
})

describe("demo page audit, single page (?view=single)", () => {
  const site = get<Report>(BASE)
  const single = get<Report & { url: string; crawlNote: string | null }>(`${BASE}?view=single`)

  it("audits the homepage alone, finished", () => {
    expect(single).toMatchObject({ id: "demo", mode: "SINGLE", status: "COMPLETED", pageSpeedStatus: "completed", pagesAnalyzed: 1, crawlNote: null })
    expect(single.totals).toEqual({ pages: 1, issues: single.issues.length })
    for (const i of single.issues) expect([single.url, null]).toContain(i.pageUrl)
  })

  it("flags exactly the checks that have issues, including its short title", () => {
    const failed = single.checks.filter((c) => c.passed === false && !c.informational).map((c) => c.id).sort()
    expect([...new Set(single.issues.map((i) => i.type))].sort()).toEqual(failed)
    expect(single.issues.find((i) => i.type === "TITLE_TAG")).toMatchObject({ title: "Title Tag Too Short" })
  })

  it("scores the cleaner homepage above the whole site", () => {
    expect(single.overallScore).toBeGreaterThan(site.overallScore)
    expect(single.issues.length).toBeLessThan(site.issues.length)
  })

  it("is what the Page Audit history pins; the site report is the Website Audit's", () => {
    expect(pageAuditDemoListItem("single")).toMatchObject({ mode: "SINGLE", href: "/dashboard/page-audit/demo?view=single", overallScore: single.overallScore })
    expect(pageAuditDemoListItem("site")).toMatchObject({ mode: "SITE", href: "/dashboard/page-audit/demo", overallScore: site.overallScore })
  })
})
