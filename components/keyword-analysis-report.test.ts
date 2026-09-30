import { describe, expect, it } from "vitest"
import type { CrawlData } from "@/types/competitor-analysis"
import { sectionIssues } from "./keyword-analysis-report"

/**
 * The report's section badges. Each counts the checks its own section marks as
 * failing, so "2 issues" on Meta Tags means two amber or crossed rows inside.
 */
const page = (over: Record<string, unknown> = {}) =>
  ({
    metaTags: { titleLength: 45, descriptionLength: 140, canonical: "https://a.example/" },
    keywordAnalysis: { inTitle: true, inH1: true, inMetaDescription: true, inFirst100Words: true, inUrl: true },
    content: { wordCount: 900 },
    headings: { h1: ["One"] },
    imageAnalysis: { withoutAlt: 0 },
    technical: { hasFavicon: true, hasViewport: true },
    structuredData: { totalSchemas: 1 },
    urlInfo: { isHttps: true },
    ...over,
  }) as unknown as CrawlData

describe("sectionIssues", () => {
  it("passes a page that does everything its sections check", () => {
    expect(sectionIssues(page())).toEqual({ meta: 0, keyword: 0, content: 0, headings: 0, images: 0, technical: 0 })
  })

  it("counts each failed check in its own section", () => {
    const issues = sectionIssues(page({
      metaTags: { titleLength: 72, descriptionLength: 140, canonical: "" },
      keywordAnalysis: { inTitle: true, inH1: false, inMetaDescription: false, inFirst100Words: true, inUrl: false },
      headings: { h1: ["One", "Two"] },
      imageAnalysis: { withoutAlt: 4 },
      urlInfo: { isHttps: false },
    }))
    expect(issues).toMatchObject({ meta: 2, keyword: 3, headings: 1, images: 1, technical: 1 })
  })

  it("leaves out a section the crawl has no data for", () => {
    const issues = sectionIssues(page({ keywordAnalysis: undefined, imageAnalysis: undefined }))
    expect("keyword" in issues).toBe(false)
    expect("images" in issues).toBe(false)
  })
})
