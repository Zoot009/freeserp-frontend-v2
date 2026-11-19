// Demo check for Quick SERP (the SERP checker): read-only sample data.
// Spec: .claude/skills/demo-report/SKILL.md; reference: ./rank-tracker.ts.
//
// lib/demo/index.ts routes every GET /api/serp-check/demo… here, so the page
// opens a finished lookup at /dashboard/serp-checker?check=demo with no
// DataForSEO task and nothing taken from the daily allowance.
//
// The search itself is the rank tracker demo's "running shoes" SERP, read
// through that demo's own route, so the two tools report the same results for
// the same query. Reshaped as serpCheck.service get() returns a LiveSerpCheck
// row, its `result` built the way liveCheck.service runLiveCheck builds one:
// depth 10, top competitor = first organic result that isn't the domain, the
// composition counted from the page's item types, AI Overview as
// summarizeAiOverview reports it.

import type { SerpFeatures } from "@/components/dashboard/primitives"
import { rankTrackerDemo } from "./rank-tracker"
import { DEMO_BRAND, DEMO_ID, type DemoTool } from "./shared"

const KEYWORD = "running shoes"
/** runLiveCheck's depth for the dashboard check (serpCheck.service). */
const DEPTH = 10

type SerpRow = { position: number; domain: string; url: string; title: string; snippet: string | null }
type TrackerKeyword = { id: string; keyword: string }
type TrackerDetail = {
  searchVolume: number | null
  latestCheck: { checkedAt: string; competitors: SerpRow[]; serpFeatures: SerpFeatures }
}

/** liveCheck.service COMPOSITION_LABELS, in its order. */
const COMPOSITION: [type: string, label: string, present: (f: SerpFeatures) => boolean][] = [
  ["organic", "Organic", () => true],
  ["ai_overview", "AI Overview", (f) => !!f.aiOverviewData?.present],
  ["featured_snippet", "Featured snippet", (f) => !!f.featuredSnippet],
  ["people_also_ask", "People also ask", (f) => !!f.peopleAlsoAsk?.length],
  ["local_pack", "Local pack", (f) => !!f.localPack],
  ["images", "Images", (f) => !!f.imagePack],
  ["video", "Video", (f) => !!f.videoPack],
  ["knowledge_graph", "Knowledge graph", (f) => !!f.knowledgeGraph],
  ["related_searches", "Related searches", (f) => !!f.relatedSearches?.length],
]

function check() {
  const project = rankTrackerDemo.get([], new URLSearchParams()) as { keywords: TrackerKeyword[] }
  const kw = project.keywords.find((k) => k.keyword === KEYWORD)!
  const d = rankTrackerDemo.get(["keywords", kw.id, "detail"], new URLSearchParams()) as TrackerDetail
  const f = d.latestCheck.serpFeatures
  const results = d.latestCheck.competitors.filter((r) => r.position <= DEPTH)
  const own = results.find((r) => r.domain === DEMO_BRAND.domain) ?? null
  const rival = results.find((r) => r.domain !== DEMO_BRAND.domain) ?? null
  const ai = f.aiOverviewData
  const checkedAt = d.latestCheck.checkedAt
  return {
    id: DEMO_ID,
    userId: DEMO_ID,
    keyword: KEYWORD,
    domain: DEMO_BRAND.domain,
    country: DEMO_BRAND.country.toLowerCase(),
    device: "desktop",
    status: "COMPLETED",
    position: own?.position ?? null,
    result: {
      keyword: KEYWORD,
      domain: DEMO_BRAND.domain,
      country: DEMO_BRAND.country.toLowerCase(),
      device: "desktop" as const,
      checkedAt,
      position: own?.position ?? null,
      url: own?.url ?? null,
      found: own != null,
      searchVolume: d.searchVolume,
      keywordDifficulty: null,
      totalResults: results.length,
      topCompetitor: rival && { domain: rival.domain, position: rival.position },
      results,
      serpFeatures: f,
      composition: COMPOSITION.filter(([, , has]) => has(f)).map(([type, label]) => ({
        type,
        label,
        count: type === "organic" ? results.length : 1,
      })),
      aiOverview: ai?.present
        ? { present: true, sources: ai.domainCount ?? 0, cited: f.aiOverviewCitation?.cited ?? false }
        : null,
    },
    error: null,
    units: 1,
    creditHoldId: null,
    costUsd: null,
    createdAt: checkedAt,
    updatedAt: checkedAt,
  }
}

/** The row the "Previous searches" list pins first (listForUser's shape). */
export function demoSerpHistoryItem() {
  const c = check()
  return {
    id: c.id,
    keyword: c.keyword,
    domain: c.domain,
    country: c.country,
    device: "desktop" as const,
    status: "COMPLETED" as const,
    position: c.position,
    createdAt: c.createdAt,
  }
}

// ── Routes (GET only; lib/demo/index.ts refuses writes) ─────────────────────

export const serpCheckerDemo: DemoTool = {
  base: "/api/serp-check",
  get(rest) {
    return rest.length === 0 ? { check: check() } : undefined
  },
}
