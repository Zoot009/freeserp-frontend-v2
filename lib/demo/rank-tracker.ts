// Demo project for the Google Rank Tracker: generated, read-only sample data.
// The reference implementation for every tool's demo — spec in
// .claude/skills/demo-report/SKILL.md.
//
// lib/demo/index.ts routes every GET /api/projects/demo… here instead of the
// network, so the real rank-tracker pages render a fully populated project with
// no backend row, no DataForSEO task and nothing counted against a quota. Writes
// are refused there with 403 demo_read_only (the pages prompt before getting
// that far — this is the safety net).
//
// Shapes mirror the backend serializers — projects.routes.ts (flattenKeyword,
// GET /:id/keywords/:kwId/detail), rankings.service getAiOverview, and
// competitorSpy.service + competitorSpy.compute. Keep them in step when those
// change.
//
// Dates are generated relative to now, so the demo never looks stale, and the
// PRNG is seeded per keyword, so the pages' polls get identical data back.

import type { AiOverviewReference, MonthlySearch, SerpFeatures } from "@/components/dashboard/primitives"
import { DAY_MS, DEMO_BRAND, DEMO_ID, perAnchor, prng, type DemoTool } from "./shared"

const DOMAIN = DEMO_BRAND.domain
/** Where the demo's CTAs lead: the projects page, create modal open. */
export const RANK_TRACKER_CREATE_HREF = "/dashboard/projects?create=1"
const NAME = `${DEMO_BRAND.name} (Demo)`
const DAYS = 90
const UNRANKED = 101 // backend deltas.ts: a missing position counts as 101
const SERP_DEPTH = 20

type Intent = "shop" | "info"
type Feature = "aiCited" | "ai" | "fs" | "paa" | "video" | "image" | "local" | "kg"

interface Seed {
  keyword: string
  /** Position 90 days ago → today. null = outside the top 100. */
  from: number | null
  to: number | null
  volume: number
  path: string
  intent: Intent
  features: Feature[]
  device?: "mobile"
  /** Keyword score (0–100) of the ranking page. */
  score?: number
}

// Picked to exercise every state the table can show: steady #1s, a big winner,
// a loser, page-two keywords, a newcomer, keywords outside the top 100, mobile
// rows, and AI Overviews both citing and ignoring the site.
const SEEDS: Seed[] = [
  { keyword: "nike", from: 1, to: 1, volume: 6_120_000, path: "/", intent: "shop", features: ["kg", "image", "paa"], score: 94 },
  { keyword: "air force 1", from: 1, to: 1, volume: 1_220_000, path: "/w/air-force-1-shoes", intent: "shop", features: ["image", "paa"], score: 88 },
  { keyword: "air max 90", from: 2, to: 1, volume: 450_000, path: "/w/air-max-90-shoes", intent: "shop", features: ["image"], score: 86 },
  { keyword: "running shoes", from: 4, to: 3, volume: 301_000, path: "/w/running-shoes", intent: "shop", features: ["ai", "paa", "image"], score: 74 },
  { keyword: "basketball shoes", from: 2, to: 2, volume: 165_000, path: "/w/basketball-shoes", intent: "shop", features: ["image", "video"], score: 81 },
  { keyword: "jordan 1 retro high", from: 3, to: 3, volume: 201_000, path: "/w/jordan-1-retro-high-shoes", intent: "shop", features: ["image"], score: 79 },
  { keyword: "sneakers", from: 6, to: 4, volume: 550_000, path: "/w/sneakers", intent: "shop", features: ["image", "local"], score: 70 },
  { keyword: "best running shoes", from: 18, to: 9, volume: 90_500, path: "/a/best-running-shoes", intent: "info", features: ["aiCited", "paa", "video"], score: 83 },
  { keyword: "workout clothes for women", from: 6, to: 12, volume: 22_200, path: "/w/womens-training-clothing", intent: "shop", features: ["image", "paa"], score: 58 },
  { keyword: "trail running shoes", from: 8, to: 7, volume: 74_000, path: "/w/trail-running-shoes", intent: "shop", features: ["video", "paa"], score: 77 },
  { keyword: "running shoes for flat feet", from: 27, to: 24, volume: 33_100, path: "/a/running-shoes-for-flat-feet", intent: "info", features: ["ai", "paa", "fs"], score: 61 },
  { keyword: "gym bag", from: 45, to: 38, volume: 40_500, path: "/w/bags-backpacks", intent: "shop", features: ["image"], score: 49 },
  { keyword: "nike store near me", from: 3, to: 2, volume: 110_000, path: "/retail", intent: "shop", features: ["local", "kg"], device: "mobile", score: 66 },
  { keyword: "nike promo code", from: 5, to: 5, volume: 60_500, path: "/help/a/promo-code-terms", intent: "shop", features: ["paa"], device: "mobile", score: 71 },
  { keyword: "how to clean white sneakers", from: null, to: 15, volume: 49_500, path: "/a/how-to-clean-white-shoes", intent: "info", features: ["fs", "video", "paa", "ai"], score: 64 },
  { keyword: "waterproof running jacket", from: null, to: null, volume: 9_900, path: "/w/running-jackets", intent: "shop", features: ["image", "paa"] },
  { keyword: "marathon training plan", from: null, to: null, volume: 74_000, path: "/running/marathon-training-plan", intent: "info", features: ["aiCited", "fs", "paa", "video"] },
]

type Kind = "shop" | "editorial" | "forum" | "video" | "wiki"
interface Rival { domain: string; brand: string; kind: Kind }

const R = (domain: string, brand: string, kind: Kind): Rival => ({ domain, brand, kind })
const SHOP_POOL: Rival[] = [
  R("adidas.com", "adidas", "shop"), R("footlocker.com", "Foot Locker", "shop"), R("amazon.com", "Amazon.com", "shop"),
  R("zappos.com", "Zappos", "shop"), R("dickssportinggoods.com", "DICK'S Sporting Goods", "shop"),
  R("newbalance.com", "New Balance", "shop"), R("jdsports.com", "JD Sports", "shop"), R("finishline.com", "Finish Line", "shop"),
  R("runningwarehouse.com", "Running Warehouse", "shop"), R("hoka.com", "HOKA", "shop"), R("brooksrunning.com", "Brooks Running", "shop"),
  R("underarmour.com", "Under Armour", "shop"), R("lululemon.com", "lululemon", "shop"), R("stockx.com", "StockX", "shop"),
  R("puma.com", "PUMA", "shop"), R("rei.com", "REI", "shop"), R("reddit.com", "Reddit", "forum"), R("youtube.com", "YouTube", "video"),
  R("wikipedia.org", "Wikipedia", "wiki"), R("runrepeat.com", "RunRepeat", "editorial"),
]
const INFO_POOL: Rival[] = [
  R("runnersworld.com", "Runner's World", "editorial"), R("runrepeat.com", "RunRepeat", "editorial"),
  R("nytimes.com", "Wirecutter", "editorial"), R("menshealth.com", "Men's Health", "editorial"),
  R("verywellfit.com", "Verywell Fit", "editorial"), R("outsideonline.com", "Outside", "editorial"),
  R("healthline.com", "Healthline", "editorial"), R("womenshealthmag.com", "Women's Health", "editorial"),
  R("reddit.com", "Reddit", "forum"), R("youtube.com", "YouTube", "video"), R("quora.com", "Quora", "forum"),
  R("adidas.com", "adidas", "shop"), R("footlocker.com", "Foot Locker", "shop"), R("amazon.com", "Amazon.com", "shop"),
  R("rei.com", "REI", "shop"), R("brooksrunning.com", "Brooks Running", "shop"), R("hoka.com", "HOKA", "shop"),
  R("zappos.com", "Zappos", "shop"), R("dickssportinggoods.com", "DICK'S Sporting Goods", "shop"), R("asics.com", "ASICS", "shop"),
]

// Tracked in Competitor Spy. Added at fixed offsets so "added this week" reads 1.
const TRACKED = DEMO_BRAND.competitors.map((domain, i) => ({
  id: `demo-c-${i + 1}`,
  domain,
  addedDaysAgo: [60, 41, 3][i],
}))

// Same curve as the backend's trafficEstimate.ts, so traffic numbers agree.
const CTR = [0, 0.317, 0.247, 0.187, 0.136, 0.095, 0.062, 0.042, 0.031, 0.025, 0.025]
function traffic(volume: number, position: number | null): number | null {
  if (position == null) return null
  const ctr = position <= 10 ? CTR[position] : position <= 20 ? 0.01 : position <= 30 ? 0.005 : 0.001
  return Math.round(volume * ctr)
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())

// Daily positions, oldest → newest: a smoothed random walk from `from` to `to`,
// eased (t³) so most of the movement lands in the last month, where the table's
// 7- and 30-day columns can show it. A keyword entering the top 100 does so
// two-thirds of the way through.
function walk(s: Seed, rand: () => number): (number | null)[] {
  if (s.to == null) return Array.from({ length: DAYS }, () => null)
  const to = s.to
  const enter = s.from == null ? Math.round(DAYS * 0.66) : 0
  const from = s.from ?? 45
  const amp = from === 1 && to === 1 ? 0 : Math.max(1, (from + to) / 10)
  let drift = 0
  return Array.from({ length: DAYS }, (_, i) => {
    if (i < enter) return null
    if (i === DAYS - 1) return to
    drift = 0.7 * drift + (rand() - 0.5) * amp
    const t = ((i - enter) / (DAYS - 1 - enter)) ** 3
    return Math.max(1, Math.round(from + (to - from) * t + drift))
  })
}

function serpEntry(r: Rival, keyword: string, position: number, rand: () => number) {
  const k = slug(keyword)
  const T = titleCase(keyword)
  const id = Math.floor(rand() * 36 ** 6).toString(36)
  const byKind: Record<Kind, { url: string; title: string; snippet: string }> = {
    shop: {
      url: `https://www.${r.domain}/${k}`,
      title: `${T} | ${r.brand}`,
      snippet: `Shop ${keyword} at ${r.brand}. Free shipping on qualifying orders and free returns.`,
    },
    editorial: {
      url: `https://www.${r.domain}/${r.domain === "nytimes.com" ? "wirecutter/reviews" : "gear"}/${k}`,
      title: `${T}: Tested and Reviewed | ${r.brand}`,
      snippet: `We tested dozens of options to find the ${keyword} worth your money, from budget picks to top performers.`,
    },
    forum: {
      url: `https://www.${r.domain}/r/running/comments/${id}/${k}/`,
      title: `${T}? : r/running`,
      snippet: `Looking for honest recommendations on ${keyword}. What has actually worked for you?`,
    },
    video: {
      url: `https://www.youtube.com/watch?v=${id}`,
      title: `${T} — What You Need to Know`,
      snippet: `Everything about ${keyword}, explained in under ten minutes.`,
    },
    wiki: {
      url: `https://en.wikipedia.org/wiki/${titleCase(keyword).replace(/ /g, "_")}`,
      title: `${T} - Wikipedia`,
      snippet: `${T} — overview, history and notable products.`,
    },
  }
  return { position, domain: r.domain, ...byKind[r.kind] }
}

type SerpRow = ReturnType<typeof serpEntry>

function buildSerp(s: Seed, rand: () => number): SerpRow[] {
  // Shuffle, nudging the result types this intent favours towards the top:
  // stores for shopping queries, reviews/forums/videos for informational ones.
  const favoured = (r: Rival) => (s.intent === "shop" ? r.kind === "shop" : r.kind !== "shop")
  const pool = (s.intent === "shop" ? SHOP_POOL : INFO_POOL)
    .map((r) => ({ r, k: rand() + (favoured(r) ? 0.6 : 0) }))
    .sort((a, b) => b.k - a.k)
    .map((x) => x.r)
  const own = s.to != null && s.to <= SERP_DEPTH ? s.to : null
  const out: SerpRow[] = []
  for (let p = 1; p <= SERP_DEPTH; p++) {
    if (p === own) {
      out.push({
        position: p,
        domain: DOMAIN,
        url: `https://www.${DOMAIN}${s.path}`,
        title: s.path === "/" ? "Nike. Just Do It. Nike.com" : `${titleCase(s.keyword)}. Nike.com`,
        snippet: `Find ${s.keyword} at Nike.com. Free delivery and returns for Nike Members.`,
      })
    } else {
      out.push(serpEntry(pool.shift()!, s.keyword, p, rand))
    }
  }
  return out
}

function buildFeatures(s: Seed, serp: SerpRow[], full: boolean): SerpFeatures {
  const f = new Set(s.features)
  const sf: SerpFeatures = {}
  if (f.has("fs")) {
    const holder = serp.find((r) => r.domain !== DOMAIN && r.position <= 5) ?? serp[0]
    sf.featuredSnippet = { domain: holder.domain, url: holder.url, title: holder.title, snippet: holder.snippet }
  }
  if (f.has("paa")) {
    sf.peopleAlsoAsk = [
      `What are the best ${s.keyword}?`,
      `Is Nike good for ${s.keyword.replace(/^nike /, "")}?`,
      `How much do ${s.keyword} cost?`,
      `Where can I buy ${s.keyword}?`,
    ]
  }
  if (f.has("kg")) sf.knowledgeGraph = { title: "Nike, Inc.", type: "Sportswear company", description: "Nike, Inc. is an American athletic footwear and apparel corporation headquartered near Beaverton, Oregon." }
  if (f.has("local")) sf.localPack = true
  if (f.has("image")) sf.imagePack = true
  if (f.has("video")) sf.videoPack = true
  sf.relatedSearches = [`${s.keyword} for men`, `${s.keyword} for women`, `${s.keyword} sale`, `cheap ${s.keyword}`]

  const cited = f.has("aiCited")
  if (cited || f.has("ai")) {
    const refs: AiOverviewReference[] = serp
      .filter((r) => (cited || r.domain !== DOMAIN) && r.position <= 12)
      .slice(0, 6)
      .map((r) => ({ domain: r.domain, url: r.url, title: r.title, source: r.domain }))
    if (cited && !refs.some((r) => r.domain === DOMAIN)) {
      refs.splice(1, 0, { domain: DOMAIN, url: `https://www.${DOMAIN}${s.path}`, title: `${titleCase(s.keyword)}. Nike.com`, source: "Nike" })
    }
    const citedIdx = refs.findIndex((r) => r.domain === DOMAIN)
    sf.aiOverview = true
    sf.aiOverviewData = {
      present: true,
      // The list payload trims references for wire size, like the backend's
      // compactFeaturesForList; the detail and ai-overview endpoints keep them.
      references: full ? refs : [],
      refCount: refs.length,
      domainCount: new Set(refs.map((r) => r.domain)).size,
    }
    sf.aiOverviewCitation = cited
      ? { cited: true, citedPosition: citedIdx + 1, citedUrl: refs[citedIdx].url }
      : { cited: false }
  } else {
    sf.aiOverviewData = { present: false, references: [], refCount: 0, domainCount: 0 }
  }
  return sf
}

interface DemoKeyword {
  seed: Seed
  id: string
  addedAt: string
  /** Newest first, as the backend returns history. */
  checks: { id: string; position: number | null; checkedAt: string }[]
  serp: SerpRow[]
}

interface DemoData {
  /** Time of the latest daily check (shared demoAnchor). */
  anchor: number
  createdAt: string
  keywords: DemoKeyword[]
}

/** Every demo fact for "now". Memoised per daily check, so polls agree. */
const demoData = perAnchor((anchor): DemoData => {
  const createdAt = new Date(anchor - (DAYS - 1) * DAY_MS - 3_600_000).toISOString()
  const keywords = SEEDS.map((seed, i): DemoKeyword => {
    const rand = prng(i + 1)
    const positions = walk(seed, rand)
    const id = `demo-kw-${i + 1}`
    return {
      seed,
      id,
      addedAt: createdAt,
      checks: positions
        .map((position, d) => ({
          id: `${id}-c${d}`,
          position,
          checkedAt: new Date(anchor - (DAYS - 1 - d) * DAY_MS).toISOString(),
        }))
        .reverse(),
      serp: buildSerp(seed, rand),
    }
  })
  return { anchor, createdAt, keywords }
})

const pos101 = (p: number | null) => p ?? UNRANKED

/** Mirrors backend deltas.ts: positive = improved, null position counts as 101. */
function delta(k: DemoKeyword, days: number): number | null {
  const baseline = k.checks[days]
  return baseline ? pos101(baseline.position) - pos101(k.checks[0].position) : null
}

function trend5(k: DemoKeyword): "winning" | "losing" | "neutral" {
  const p = k.checks.slice(0, 5).reverse().map((c) => pos101(c.position))
  const steps = p.slice(1).map((v, i) => v - p[i])
  const net = p[p.length - 1] - p[0]
  if (!steps.some((s) => s > 0) && net < 0) return "winning"
  if (!steps.some((s) => s < 0) && net > 0) return "losing"
  return "neutral"
}

function volumeTrend(volume: number, anchor: Date): MonthlySearch[] {
  // 12 months oldest → newest, ending last month, with a mild seasonal swing.
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - 12 + i, 1))
    const swing = 1 + 0.18 * Math.sin(((d.getUTCMonth() + 2) / 12) * 2 * Math.PI)
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, searchVolume: Math.round((volume * swing) / 100) * 100 }
  })
}

function gradeFor(score: number) {
  if (score >= 90) return { grade: "A+", label: "Excellent" }
  if (score >= 80) return { grade: "A", label: "Very Good" }
  if (score >= 70) return { grade: "B", label: "Good" }
  if (score >= 60) return { grade: "C", label: "Fair" }
  if (score >= 50) return { grade: "D", label: "Needs Work" }
  return { grade: "F", label: "Poor" }
}

function flattenKeyword(k: DemoKeyword) {
  const s = k.seed
  const latest = k.checks[0]
  const g = s.score != null ? gradeFor(s.score) : null
  return {
    id: k.id,
    keyword: s.keyword,
    location: "US",
    locationLabel: null,
    locationCountry: null,
    device: s.device ?? "desktop",
    engine: "google",
    addedAt: k.addedAt,
    position: latest.position,
    firstPosition: k.checks[k.checks.length - 1].position,
    change: delta(k, 1),
    notInTop: latest.position == null,
    depthSearched: 100,
    d1: delta(k, 1),
    d7: delta(k, 7),
    d15: delta(k, 15),
    d30: delta(k, 30),
    trend5: trend5(k),
    url: latest.position != null ? `https://www.${DOMAIN}${s.path}` : null,
    monthlyTraffic: traffic(s.volume, latest.position),
    searchVolume: s.volume,
    searchVolumeTrend: volumeTrend(s.volume, new Date(latest.checkedAt)),
    serpFeatures: buildFeatures(s, k.serp, false),
    status: "COMPLETED",
    checkStartedAt: null,
    checkOverdue: false,
    checkedAt: latest.checkedAt,
    latestAnalysisId: null,
    pageScore: s.score ?? null,
    pageScoreGrade: g?.grade ?? null,
    pageScoreLabel: g?.label ?? null,
    pageScoreUrl: s.score != null ? `https://www.${DOMAIN}${s.path}` : null,
    pageScoreAt: s.score != null ? latest.checkedAt : null,
    pageAuditScore: null,
  }
}

function projectDetail(d: DemoData) {
  const latest = d.keywords[0].checks[0].checkedAt
  return {
    id: DEMO_ID,
    name: NAME,
    domain: DOMAIN,
    isActive: true,
    isPaused: false,
    autoCheckEnabled: true,
    checkFrequency: 24,
    lastScheduledCheck: latest,
    nextScheduledCheck: new Date(new Date(latest).getTime() + DAY_MS).toISOString(),
    createdAt: d.createdAt,
    shareToken: null,
    domainAuthority: 91,
    domainBacklinks: 48_600_000,
    backlinksCheckedAt: latest,
    keywords: d.keywords.map(flattenKeyword),
  }
}

/** The card the projects list pins first. Trend = daily average position. */
export function demoProjectSummary() {
  const d = demoData()
  const ranked = d.keywords.filter((k) => k.checks[0].position != null)
  const trend = Array.from({ length: 30 }, (_, i) => {
    const day = 29 - i
    const ps = ranked.map((k) => k.checks[day].position).filter((p): p is number => p != null)
    return Math.round((ps.reduce((a, b) => a + b, 0) / ps.length) * 10) / 10
  })
  return {
    id: DEMO_ID,
    name: NAME,
    domain: DOMAIN,
    isActive: true,
    autoCheckEnabled: true,
    isPaused: false,
    createdAt: d.createdAt,
    _count: { keywords: d.keywords.length },
    trend,
  }
}

function keywordDetail(k: DemoKeyword) {
  const s = k.seed
  const latest = k.checks[0]
  const history = k.checks.map((c) => ({
    id: c.id,
    position: c.position,
    change: null as number | null,
    monthlyTraffic: traffic(s.volume, c.position),
    revenueLoss: null,
    checkedAt: c.checkedAt,
  }))
  history.forEach((h, i) => {
    const prev = history[i + 1]
    h.change = prev && h.position != null && prev.position != null ? prev.position - h.position : null
  })
  return {
    id: k.id,
    keyword: s.keyword,
    location: "US",
    locationLabel: null,
    locationCountry: null,
    device: s.device ?? "desktop",
    engine: "google",
    addedAt: k.addedAt,
    searchVolume: s.volume,
    searchVolumeTrend: volumeTrend(s.volume, new Date(latest.checkedAt)),
    project: { id: DEMO_ID, name: NAME, domain: DOMAIN },
    inFlightStatus: "COMPLETED",
    inFlightSince: null,
    inFlightOverdue: false,
    latestCheck: {
      position: latest.position,
      url: latest.position != null ? `https://www.${DOMAIN}${s.path}` : null,
      change: history[0].change,
      previousPos: k.checks[1]?.position ?? null,
      competitors: k.serp,
      serpFeatures: buildFeatures(s, k.serp, true),
      monthlyTraffic: traffic(s.volume, latest.position),
      revenueLoss: null,
      status: "COMPLETED",
      notInTop: latest.position == null,
      depthSearched: 100,
      carriedFromAt: null,
      checkedAt: latest.checkedAt,
    },
    history,
    historyByEngine: { google: history },
  }
}

function aiOverview(k: DemoKeyword) {
  const sf = buildFeatures(k.seed, k.serp, true)
  const data = sf.aiOverviewData!
  const c = sf.aiOverviewCitation
  return {
    checkedAt: k.checks[0].checkedAt,
    state: !data.present ? "no-overview" : c?.cited ? "cited" : "not-cited",
    present: data.present,
    pending: false,
    cited: c?.cited ?? null,
    citedPosition: c?.citedPosition ?? null,
    citedUrl: c?.citedUrl ?? null,
    citedInExpansion: false,
    references: data.references,
    refCount: data.refCount,
    domainCount: data.domainCount,
    expansionDomains: [],
  }
}

// ── Competitor Spy (same rules as backend competitorSpy.compute.ts) ──────────

function compareRows(d: DemoData, domain: string) {
  return d.keywords.flatMap((k) => {
    const entry = k.serp.find((r) => r.domain === domain)
    if (!entry) return []
    const yourPosition = k.checks[0].position
    return [{
      keywordId: k.id,
      keyword: k.seed.keyword,
      volume: k.seed.volume,
      theirPosition: entry.position,
      theirUrl: entry.url,
      serpFeatures: buildFeatures(k.seed, k.serp, false),
      ...(yourPosition != null ? { yourPosition } : {}),
    }]
  })
}

function competitorStats(d: DemoData, domain: string) {
  const rows = compareRows(d, domain)
  const shared = rows.filter((r) => r.yourPosition != null)
  return {
    rows,
    shared,
    gaps: rows.filter((r) => r.yourPosition == null),
    higher: shared.filter((r) => r.yourPosition! < r.theirPosition),
    estTraffic: rows.reduce((a, r) => a + (traffic(r.volume, r.theirPosition) ?? 0), 0),
    avgPosition: rows.length ? Math.round((rows.reduce((a, r) => a + r.theirPosition, 0) / rows.length) * 10) / 10 : null,
  }
}

function addedAt(d: DemoData, daysAgo: number) {
  return new Date(d.anchor - daysAgo * DAY_MS).toISOString()
}

function competitorsOverview(d: DemoData) {
  const competitors = TRACKED.map((c) => {
    const s = competitorStats(d, c.domain)
    return {
      id: c.id,
      domain: c.domain,
      addedAt: addedAt(d, c.addedDaysAgo),
      sharedCount: s.shared.length,
      gapCount: s.gaps.length,
      rankHigherCount: s.higher.length,
      avgPosition: s.avgPosition,
    }
  })
  const distinct = (pick: (s: ReturnType<typeof competitorStats>) => { keywordId: string }[]) =>
    new Set(TRACKED.flatMap((c) => pick(competitorStats(d, c.domain)).map((r) => r.keywordId))).size
  return {
    stats: {
      competitorsTracked: TRACKED.length,
      addedThisWeek: TRACKED.filter((c) => c.addedDaysAgo < 7).length,
      sharedKeywords: distinct((s) => s.shared),
      youRankHigher: distinct((s) => s.higher),
      contentGaps: distinct((s) => s.gaps),
    },
    competitors,
  }
}

function competitorDetail(d: DemoData, c: (typeof TRACKED)[number]) {
  const s = competitorStats(d, c.domain)
  const pages = new Map<string, { url: string; keywords: number; estTraffic: number }>()
  for (const r of s.rows) {
    const p = pages.get(r.theirUrl) ?? { url: r.theirUrl, keywords: 0, estTraffic: 0 }
    p.keywords += 1
    p.estTraffic += traffic(r.volume, r.theirPosition) ?? 0
    pages.set(r.theirUrl, p)
  }
  return {
    competitor: {
      id: c.id,
      domain: c.domain,
      addedAt: addedAt(d, c.addedDaysAgo),
      estMonthlyTraffic: s.estTraffic,
      avgPosition: s.avgPosition,
      sharedCount: s.shared.length,
      gapCount: s.gaps.length,
      rankHigherCount: s.higher.length,
    },
    sharedKeywords: s.shared,
    contentGaps: s.gaps,
    youRankHigher: s.higher,
    topPages: [...pages.values()].sort((a, b) => b.estTraffic - a.estTraffic),
  }
}

function competitorSuggestions(d: DemoData) {
  const tracked = new Set<string>(TRACKED.map((c) => c.domain))
  const tally = new Map<string, number>()
  for (const k of d.keywords) {
    for (const r of new Set(k.serp.map((x) => x.domain))) {
      if (r !== DOMAIN && !tracked.has(r)) tally.set(r, (tally.get(r) ?? 0) + 1)
    }
  }
  return [...tally.entries()]
    .map(([domain, sharedCount]) => ({ domain, sharedCount }))
    .sort((a, b) => b.sharedCount - a.sharedCount)
    .slice(0, 10)
}

// ── Routes (GET only; lib/demo/index.ts refuses writes) ─────────────────────

export const rankTrackerDemo: DemoTool = {
  base: "/api/projects",
  get([a, b, c]) {
    const d = demoData()
    const kw = d.keywords.find((k) => k.id === b)
    if (a === undefined) return projectDetail(d)
    if (a === "keywords" && kw && c === "detail") return keywordDetail(kw)
    if (a === "keywords" && kw && c === "ai-overview") return { aiOverview: aiOverview(kw) }
    if (a === "keyword-suggestions" && !b) return { run: null }
    if (a === "competitors" && !b) return competitorsOverview(d)
    if (a === "competitors" && b === "suggestions") return { suggestions: competitorSuggestions(d) }
    const tracked = a === "competitors" ? TRACKED.find((t) => t.id === b) : undefined
    return tracked && competitorDetail(d, tracked)
  },
}
