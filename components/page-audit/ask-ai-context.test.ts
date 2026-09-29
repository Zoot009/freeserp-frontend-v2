import { describe, expect, it } from "vitest"
import type { AuditReport, Issue, SEOAuditCheck } from "./audit-ui"
import { ASK_CONTEXT_MAX_CHARS, buildAskContext } from "./ask-ai-context"

const grade = { score: 70, grade: "C", tier: "Fair" }

function report(over: Partial<AuditReport> = {}): AuditReport {
  return {
    id: "r1",
    url: "https://example.com/",
    status: "COMPLETED",
    pagesAnalyzed: 1,
    mode: "SINGLE",
    scoring: {
      overall: grade,
      categories: {
        technical: grade, onPage: grade, performance: grade, accessibility: grade,
        links: grade, structuredData: grade, security: grade,
      },
    },
    summary: {} as AuditReport["summary"],
    categoryDetails: [],
    issues: [],
    passingChecks: [],
    createdAt: "",
    completedAt: "",
    ...over,
  }
}

const issue = (type: string, page: string, over: Partial<Issue> = {}): Issue => ({
  id: `${type}${page}`, category: "ON_PAGE", type, title: type, description: `${type} description`,
  severity: "MEDIUM", impactScore: 1, pageUrl: page, ...over,
})

const check = (n: number, passed: boolean): SEOAuditCheck => ({
  id: `C${n}`, name: `Check ${n}`, maxScore: 10, priority: 1, section: "seo", informational: false,
  what: "", why: "", how: "", category: "TECHNICAL", passed, score: 0,
  shortAnswer: "finding ".repeat(50), answer: "", recommendation: "fix ".repeat(80),
})

describe("buildAskContext", () => {
  // The bug: issues went first, and on a big site they alone passed the
  // backend's cut, so links and backlinks never reached the model.
  it("keeps a big site audit under the backend's limit, summary first, links and backlinks intact", () => {
    const ctx = buildAskContext(
      report({
        mode: "SITE",
        pagesAnalyzed: 500,
        totals: { pages: 500, issues: 4000 },
        checks: Array.from({ length: 80 }, (_, n) => check(n, n % 2 === 1)),
        issues: Array.from({ length: 300 }, (_, n) =>
          issue(`TYPE_${n % 60}`, `https://example.com/p${n}`, { description: "long ".repeat(100) }),
        ),
        linkGraph: {
          nodes: [],
          edges: [],
          orphanData: { graphOrphans: [], sitemapUnvisited: [], sitemapAvailable: true, crawlComplete: true, confidence: "high" },
          metadata: {
            totalPages: 500, totalLinks: 9000, maxDepth: 4, orphanPages: 3, hubPages: 5, authorityPages: 7,
            averageLinksPerPage: 18, topLinkedPages: [{ url: "https://example.com/blog", title: null, inboundLinks: 40 }],
          },
        },
        backlinks: {
          target: "example.com", rank: 312, backlinks: 1200, referringDomains: 90, referringMainDomains: 80,
          referringIps: 70, brokenBacklinks: 2, brokenPages: 0, dofollow: 900, nofollow: 300,
          referringLinkTypes: {}, firstSeen: null, lastSeen: null,
        },
      }),
    )
    expect(ctx.length).toBeLessThanOrEqual(ASK_CONTEXT_MAX_CHARS)
    expect(ctx.startsWith("Whole-site audit of https://example.com/ (500 pages analysed).")).toBe(true)
    expect(ctx).toContain("FAILING CHECKS (40 of 80)")
    expect(ctx).toContain("more not shown")
    expect(ctx).toContain("Most-linked pages: /blog (40 inbound).")
    expect(ctx).toContain("example.com: domain rank 312")
    expect(ctx).toContain(
      "ISSUES BY TYPE (60 problems, 4000 issues in all; page counts cover only the 300 highest-priority issues)",
    )
  })

  it("groups issue rows by type, worst first, with the pages each one reaches", () => {
    const ctx = buildAskContext(
      report({
        mode: "SITE",
        issues: [
          issue("NO_LANG", "https://example.com/a"),
          issue("NO_ALT", "https://example.com/a"),
          issue("NO_ALT", "https://example.com/a", { severity: "HIGH" }),
          issue("NO_ALT", "https://example.com/b"),
        ],
      }),
    )
    expect(ctx).toContain("- [HIGH] NO_ALT (On-Page SEO) — 2 pages, e.g. /a, /b: NO_ALT description")
    expect(ctx).toContain("- [MEDIUM] NO_LANG (On-Page SEO) — 1 page, e.g. /a: NO_LANG description")
    expect(ctx.indexOf("NO_ALT")).toBeLessThan(ctx.indexOf("NO_LANG"))
  })

  it("prefers the server's rollup, and says what wasn't collected or is still pending", () => {
    const ctx = buildAskContext(
      report({
        mode: "SITE",
        pageSpeedStatus: "pending",
        totals: { pages: 500, issues: 4000 },
        issues: [issue("NO_ALT", "https://example.com/a")],
      }),
      [{ type: "NO_ALT", title: "Images without alt text", description: "d", category: "ACCESSIBILITY", severity: "LOW", affectedPages: 412 }],
    )
    expect(ctx).toContain("- [LOW] Images without alt text (Accessibility) — 412 pages, e.g. /a: d")
    expect(ctx).not.toContain("highest-priority")
    expect(ctx).toContain("Performance still being measured (no score yet)")
    expect(ctx).toMatch(/INTERNAL LINKS\nNot collected/)
    expect(ctx).toMatch(/BACKLINKS[^\n]*\nNot collected/)
  })
})
