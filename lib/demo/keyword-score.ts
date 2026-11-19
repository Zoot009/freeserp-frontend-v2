// Demo report for the Keyword Score Checker: nike.com's "best running shoes" guide,
// scored for that keyword. Spec: .claude/skills/demo-report/SKILL.md.
//
// lib/demo/index.ts routes GET /api/keyword-analysis/demo here; the response is
// ka.routes.ts `{ analysis }`. ANALYSIS is that row, built by the backend's own
// crawl parsing and scoring (scripts/demo/keyword-score.gen.ts; change the page
// there and regenerate). The report page scores it again in the browser with
// lib/seoScorer.ts, which agrees with the backend's 84. This file only moves its
// timestamps to now.

import { ANALYSIS, GENERATED_AT } from "./keyword-score-data"
import { DEMO_ID, perAnchor, shiftDates, type DemoTool } from "./shared"

/** Where the demo's CTAs lead: the checker's form. */
export const KEYWORD_SCORE_CREATE_HREF = "/dashboard/keyword-analysis"

const demoData = perAnchor((anchor) => ({ analysis: shiftDates(ANALYSIS, anchor - Date.parse(GENERATED_AT)) }))

/** The history row (GET /api/keyword-analysis list item) the history pins first. */
export function keywordScoreDemoListItem() {
  const a = demoData().analysis
  return {
    id: DEMO_ID,
    keyword: a.keyword,
    url: a.url,
    domain: a.domain,
    status: "COMPLETED" as const,
    error: null,
    overallScore: a.overallScore,
    domainAuthority: a.domainAuthority,
    pageAuthority: a.pageAuthority,
    createdAt: a.createdAt,
    completedAt: a.completedAt,
  }
}

export const keywordScoreDemo: DemoTool = {
  get(rest) {
    return rest.length === 0 ? demoData() : undefined
  },
}
