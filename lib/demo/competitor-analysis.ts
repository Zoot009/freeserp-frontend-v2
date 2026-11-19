// Demo report for the Competitor Analysis tool: nike.com's "running shoes" page
// against the pages that outrank it. Spec: .claude/skills/demo-report/SKILL.md.
//
// lib/demo/index.ts routes GET /api/competitor-analysis/demo here; the response is
// ca.routes.ts `{ analysis: toAnalysisView(...) }`. ANALYSIS is that view, built by
// the backend's own crawl parsing and view code from synthetic pages
// (scripts/demo/competitor-analysis.gen.ts; change the pages there and regenerate).
// This file only moves its timestamps to now.

import { ANALYSIS, GENERATED_AT } from "./competitor-analysis-data"
import { DEMO_ID, perAnchor, shiftDates, type DemoTool } from "./shared"

/** Where the demo's CTAs lead: the analysis form. */
export const COMPETITOR_ANALYSIS_CREATE_HREF = "/dashboard/competitor-analysis"
export const COMPETITOR_ANALYSIS_DEMO_KEYWORD = ANALYSIS.keyword

const demoData = perAnchor((anchor) => ({ analysis: shiftDates(ANALYSIS, anchor - Date.parse(GENERATED_AT)) }))

/** The ReportHistory pin for this demo, as the history's own rows read. */
export function competitorAnalysisDemoRow() {
  return {
    title: ANALYSIS.keyword,
    subtitle: ANALYSIS.yourDomain,
    domain: ANALYSIS.yourDomain,
    href: `/dashboard/competitor-analysis/results?analysisId=${DEMO_ID}&keyword=${encodeURIComponent(ANALYSIS.keyword)}`,
  }
}

export const competitorAnalysisDemo: DemoTool = {
  get(rest) {
    return rest.length === 0 ? demoData() : undefined
  },
}
