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
// computed as summarize() and wordGroups() compute them. The seed is the brand
// itself, which the rank tracker demo also tracks, so the demos read as one story:
// a keyword the rank tracker tracks carries the rank tracker's volume here.

import { keywordWords } from "@/lib/keyword-magic"
import { rankTrackerDemo } from "./rank-tracker"
import { DEMO_BRAND, DEMO_ID, perAnchor, prng, type DemoTool } from "./shared"

/** Where the demo's CTAs lead: the search form, out of demo view. */
export const KEYWORD_MAGIC_CREATE_HREF = "/dashboard/keyword-magic"
/** The demo view — what PaidToolGate's sample screen links free users to. */
export const KEYWORD_MAGIC_DEMO_HREF = `${KEYWORD_MAGIC_CREATE_HREF}?view=${DEMO_ID}`

/** The brand itself: what someone researching Nike's market types first. */
const SEED = DEMO_BRAND.name.toLowerCase()
/** What the keyword database holds for the seed (the "of N" under the tiles). */
const TOTAL_COUNT = 38_906

// ── Keywords ─────────────────────────────────────────────────────────────────

type Intent = "informational" | "navigational" | "commercial" | "transactional"

/** "<seed> …": the products people search the brand for. */
const PRODUCTS = [
  "shoes", "air max", "air force 1", "dunks", "jordan", "running shoes", "basketball shoes", "hoodie", "shorts", "socks",
  "sneakers", "pegasus", "vomero", "air max 90", "tech fleece", "slides", "backpack", "golf shoes", "soccer cleats",
  "sports bra", "leggings", "joggers", "jacket", "hat", "sweatpants",
]
/** "… <seed>". */
const PREFIXES = ["women's", "men's", "kids", "cheap", "white", "black", "pink", "custom", "vintage"]
/** "<seed> …": the store, its deals and its help pages. */
const SUFFIXES = [
  "outlet", "store", "store near me", "sale", "outlet near me", "promo code", "student discount", "gift card", "return policy",
  "size chart", "factory store", "clearance", "black friday", "membership", "app", "careers", "customer service",
]
/** Searches for the brand's own site and services rather than its products. */
const NAVIGATIONAL = new Set(
  ["store", "app", "membership", "careers", "customer service", "return policy", "size chart", "factory store"].map((x) => `${SEED} ${x}`),
)
const QUESTIONS = [
  `how to clean ${SEED} shoes`, `are ${SEED} shoes true to size`, `how to return ${SEED} online order`, `who owns ${SEED}`,
  `what does ${SEED} mean`, `is ${SEED} or adidas better`, `how to use ${SEED} gift card`, `how long does ${SEED} shipping take`,
]
const RIVALS = ["adidas", "hoka", "new balance", "under armour"]
/** The head of the list, at the volumes a brand this size has; the rest follow a power law. */
const HEADS: Record<string, number> = {
  shoes: 450_000, "air force 1": 450_000, "air max": 368_000, outlet: 368_000, dunks: 301_000, store: 246_000, jordan: 246_000,
  sale: 201_000, "tech fleece": 201_000, "running shoes": 165_000, hoodie: 135_000, shorts: 110_000, socks: 90_500, slides: 90_500,
  "outlet near me": 90_500, pegasus: 74_000, sneakers: 60_500, app: 49_500, "student discount": 40_500, "gift card": 33_100,
}

// Google's search-volume buckets, so the figures look like the database's.
const BUCKETS = [
  110, 140, 170, 210, 260, 320, 390, 480, 590, 720, 880, 1_000, 1_300, 1_600, 1_900, 2_400, 2_900, 3_600, 4_400,
  5_400, 6_600, 8_100, 9_900, 12_100, 14_800, 18_100, 22_200, 27_100, 33_100, 40_500, 49_500, 60_500, 74_000,
  90_500, 110_000, 135_000, 165_000, 201_000, 246_000, 301_000, 368_000, 450_000,
]
const bucket = (v: number) => BUCKETS.reduce((best, b) => (Math.abs(b - v) < Math.abs(best - v) ? b : best), BUCKETS[0])

function intentOf(kw: string): Intent {
  if (/^(how|what|are|is|who)\b/.test(kw)) return "informational"
  if (/\b(near me|sale|clearance|cheap|outlet|promo code|discount|black friday|gift card)\b/.test(kw)) return "transactional"
  if (kw === SEED || NAVIGATIONAL.has(kw)) return "navigational"
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
  const out = [
    SEED,
    ...PRODUCTS.map((p) => `${SEED} ${p}`),
    ...SUFFIXES.map((x) => `${SEED} ${x}`),
    ...PREFIXES.map((p) => `${p} ${SEED}`),
    ...RIVALS.map((r) => `${SEED} vs ${r}`),
    ...QUESTIONS,
  ]
  // A few longer phrases, the long tail a broad match is full of.
  for (const p of ["shoes", "running shoes", "air max", "dunks", "hoodie"]) {
    for (const q of ["for women", "for men", "sale", "white"]) out.push(`${SEED} ${p} ${q}`)
  }
  return out
}

function buildRows(anchor: number) {
  const rand = prng(9001)
  const tracked = new Map(
    (rankTrackerDemo.get([], new URLSearchParams()) as { keywords: { keyword: string; searchVolume: number }[] })
      .keywords.map((k) => [k.keyword, k.searchVolume]),
  )
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(anchor)
    d.setUTCDate(1)
    d.setUTCMonth(d.getUTCMonth() - 12 + i)
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
  })
  const list = keywordList()
  const rows = list.map((keyword, i) => {
    const intent = intentOf(keyword)
    // The head at its known volume; the rest fall away roughly as a power law, with noise.
    const head = keyword.startsWith(`${SEED} `) ? HEADS[keyword.slice(SEED.length + 1)] : undefined
    const tail = bucket(60_000 * (1 + rand() * 12 + i * 0.25) ** -1.25 * (0.6 + rand() * 0.8))
    const volume = tracked.get(keyword) ?? head ?? tail
    // The long tail is easy, the head terms hard, so all three KD bands show.
    const kd = Math.max(4, Math.min(98, Math.round(20 * Math.log10(volume) - 22 + (rand() - 0.5) * 24)))
    const paidIntent = intent === "transactional" || intent === "commercial"
    // Branded clicks are cheap: the brand owns its own name.
    const cpc = Math.round((paidIntent ? 0.4 + rand() * 1.4 : 0.1 + rand() * 0.5) * 100) / 100
    const competition = Math.round((paidIntent ? 0.5 + rand() * 0.5 : rand() * 0.4) * 100) / 100
    // The database has gaps: no KD yet for the newest long-tail phrases, no ads
    // (so no CPC) on some questions. The table shows "—" for them.
    const noKd = i >= list.length - 3
    const noAds = keyword === QUESTIONS[1] || keyword === QUESTIONS[5]
    return {
      keyword,
      volume,
      cpc: noAds ? null : cpc,
      competition: noAds ? null : competition,
      difficulty: noKd ? null : kd,
      intent,
      serpFeatures: featuresFor(intent, keyword, rand),
      // Sportswear peaks in November and December: Black Friday, then gifts.
      trend: months.map((m) => ({
        ...m,
        searchVolume: bucket(volume * (1 + 0.24 * Math.cos(((m.month - 11.5) / 12) * 2 * Math.PI))),
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
    avgDifficulty: Math.round(withKd.reduce((s, r) => s + (r.difficulty ?? 0), 0) / withKd.length),
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
