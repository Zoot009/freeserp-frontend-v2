// Demo search for the Keyword Magic Tool: generated, read-only sample data.
// Spec: .claude/skills/demo-report/SKILL.md; reference: ./rank-tracker.ts.
//
// Keyword Magic is stateless — a search is a POST and nothing is saved — so the
// demo is a VIEW of the page (/dashboard/keyword-magic?view=demo) that reads
// GET /api/keyword-magic/demo instead of searching. lib/demo/index.ts answers
// that here: no DataForSEO call, no credits, no daily search used.
//
// The response mirrors keywordMagic.service.ts KeywordMagicResponse: rows in the
// database's own order (volume, highest first), totals and the word groups
// computed as summarize() and wordGroups() compute them. The seed is the one the
// rank tracker and SERP checker demos track, so the demos read as one story.

import { keywordWords } from "@/lib/keyword-magic"
import { DEMO_BRAND, DEMO_ID, perAnchor, prng, type DemoTool } from "./shared"

/** Where the demo's CTAs lead: the search form, out of demo view. */
export const KEYWORD_MAGIC_CREATE_HREF = "/dashboard/keyword-magic"
/** The demo view — what PaidToolGate's sample screen links free users to. */
export const KEYWORD_MAGIC_DEMO_HREF = `${KEYWORD_MAGIC_CREATE_HREF}?view=${DEMO_ID}`

const SEED = "running shoes"
/** What the keyword database holds for the seed (the "of N" under the tiles). */
const TOTAL_COUNT = 2_316

// ── Keywords ─────────────────────────────────────────────────────────────────

type Intent = "informational" | "navigational" | "commercial" | "transactional"

const PREFIXES = [
  "best", "women's", "men's", "kids", "cheap", "wide", "trail", "waterproof", "cushioned", "lightweight",
  "neutral", "stability", "carbon plate", "zero drop", "minimalist", "white", "black", "pink",
  DEMO_BRAND.name.toLowerCase(), "adidas", "hoka", "brooks", "asics", "new balance",
]
const SUFFIXES = [
  "for women", "for men", "for flat feet", "for beginners", "for plantar fasciitis", "for wide feet",
  "for overpronation", "for high arches", "for knee pain", "for shin splints", "sale", "near me",
  "on sale", "clearance", "review", "vs walking shoes",
]
const QUESTIONS = [
  "how to choose running shoes", "how often to replace running shoes", "how long do running shoes last",
  "what are the best running shoes", "are running shoes good for walking", "how to clean running shoes",
  "how should running shoes fit", "how to lace running shoes",
]
const BRANDS = new Set([DEMO_BRAND.name.toLowerCase(), "adidas", "hoka", "brooks", "asics", "new balance"])

// Google's search-volume buckets, so the figures look like the database's.
const BUCKETS = [
  110, 140, 170, 210, 260, 320, 390, 480, 590, 720, 880, 1_000, 1_300, 1_600, 1_900, 2_400, 2_900, 3_600, 4_400,
  5_400, 6_600, 8_100, 9_900, 12_100, 14_800, 18_100, 22_200, 27_100, 33_100, 40_500, 49_500, 60_500, 74_000,
  90_500, 110_000, 135_000, 165_000, 201_000, 246_000, 301_000,
]
const bucket = (v: number) => BUCKETS.reduce((best, b) => (Math.abs(b - v) < Math.abs(best - v) ? b : best), BUCKETS[0])

function intentOf(kw: string): Intent {
  if (/^(how|what|are)\b/.test(kw)) return "informational"
  if (/\b(near me|sale|clearance|cheap)\b/.test(kw)) return "transactional"
  if ([...BRANDS].some((b) => kw.startsWith(`${b} `))) return "navigational"
  return "commercial"
}

/** Which SERP features a results page for this kind of query tends to carry (DataForSEO item types). */
function featuresFor(intent: Intent, kw: string, rand: () => number): string[] {
  const pool: Record<Intent, string[]> = {
    informational: ["ai_overview", "featured_snippet", "people_also_ask", "video", "images"],
    commercial: ["ai_overview", "people_also_ask", "images", "shopping", "video", "top_stories"],
    transactional: ["shopping", "images", "paid", "popular_products"],
    navigational: ["knowledge_graph", "images", "shopping", "paid"],
  }
  const picked = pool[intent].filter(() => rand() < 0.55)
  if (kw.includes("near me")) picked.unshift("local_pack")
  return ["organic", ...picked, "related_searches"]
}

function keywordList(): string[] {
  const out = [SEED, ...PREFIXES.map((p) => `${p} ${SEED}`), ...SUFFIXES.map((s) => `${SEED} ${s}`), ...QUESTIONS]
  // A few two-sided phrases, the long tail a broad match is full of.
  for (const p of ["best", "women's", "men's", "trail", "cushioned"]) {
    for (const s of ["for flat feet", "for beginners", "for wide feet", "sale"]) out.push(`${p} ${SEED} ${s}`)
  }
  return out
}

function buildRows(anchor: number) {
  const rand = prng(9001)
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(anchor)
    d.setUTCDate(1)
    d.setUTCMonth(d.getUTCMonth() - 12 + i)
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
  })
  const rows = keywordList().map((keyword, i) => {
    const intent = intentOf(keyword)
    // The seed itself leads; the rest fall away roughly as a power law, with noise.
    const volume = i === 0 ? 301_000 : bucket(301_000 * (1 + rand() * 40 + i * 0.6) ** -1.35 * (0.6 + rand() * 0.8))
    const difficulty = Math.max(4, Math.min(98, Math.round(10 + 12 * Math.log10(volume) + (rand() - 0.5) * 30)))
    const paidIntent = intent === "transactional" || intent === "commercial"
    return {
      keyword,
      volume,
      cpc: Math.round((paidIntent ? 0.6 + rand() * 1.9 : 0.15 + rand() * 0.6) * 100) / 100,
      competition: Math.round((paidIntent ? 0.5 + rand() * 0.5 : rand() * 0.4) * 100) / 100,
      difficulty,
      intent,
      serpFeatures: featuresFor(intent, keyword, rand),
      // Running peaks in spring and around January resolutions.
      trend: months.map((m) => ({
        ...m,
        searchVolume: bucket(volume * (1 + 0.22 * Math.cos(((m.month - 3) / 12) * 2 * Math.PI))),
      })),
    }
  })
  // The database's own order: volume, highest first.
  return rows.sort((a, b) => b.volume - a.volume || a.keyword.localeCompare(b.keyword))
}

// ── Response ─────────────────────────────────────────────────────────────────

const GROUP_STOP = new Set(["the", "a", "an", "of", "for", "to", "in", "on", "and", "or", "with", "your", "you", "is", "are", "vs", "my", "me", "it", "at", "by"])

/** wordGroups(): each keyword's distinct words, minus the seed's and noise words, top 20. */
function wordGroups(rows: { keyword: string }[]) {
  const seedWords = new Set(keywordWords(SEED))
  const counts = new Map<string, number>()
  for (const r of rows) {
    for (const w of new Set(keywordWords(r.keyword))) {
      if (w.length < 2 || seedWords.has(w) || GROUP_STOP.has(w)) continue
      counts.set(w, (counts.get(w) ?? 0) + 1)
    }
  }
  return [...counts.entries()].map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count).slice(0, 20)
}

/** The demo search, memoised per daily anchor (the trend's months move with it). */
const demoSearch = perAnchor((anchor) => {
  const keywords = buildRows(anchor)
  const withKd = keywords.filter((r) => r.difficulty != null)
  return {
    seed: SEED,
    matchType: "broad" as const,
    location: DEMO_BRAND.country.toLowerCase(),
    totalCount: TOTAL_COUNT,
    fetchedCount: keywords.length,
    totalVolume: keywords.reduce((s, r) => s + r.volume, 0),
    avgDifficulty: Math.round(withKd.reduce((s, r) => s + r.difficulty, 0) / withKd.length),
    groups: wordGroups(keywords),
    keywords,
    // A paid account's allowance, metered in credits: the page keeps the
    // viewer's own usage and never reads this one in demo view.
    usage: { plan: "paid" as const, limit: 50, used: 0, remaining: 50, keywordLimit: 1_000, relatedAvailable: true, metered: "credits" },
  }
})

/** The seed, for the banner's "Sample data for …". */
export const KEYWORD_MAGIC_DEMO_SEED = SEED

// ── Routes (GET only; lib/demo/index.ts refuses writes) ─────────────────────

export const keywordMagicDemo: DemoTool = {
  get(rest) {
    return rest.length === 0 ? demoSearch() : undefined
  },
}
