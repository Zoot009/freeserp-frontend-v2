// Demo scan for the Google Maps Rank Tracker: generated, read-only sample data.
// Spec: .claude/skills/demo-report/SKILL.md; reference: ./rank-tracker.ts.
//
// lib/demo/index.ts routes every GET /api/maps-tracker/scans/demo… here, so the
// real report page (/reports/maps-tracker/demo/<keywordId>) renders a finished
// geo-grid scan with no backend row, no DataForSEO task and no credits spent.
//
// Shapes mirror the backend — scans.service.ts (get, getPoint, listForUser),
// competitors.service.ts (getLeaderboard, ported below) and the Prisma rows
// they return. The metrics come from components/maps-tracker/grid.ts, the
// frontend's own port of the backend's grid math, so every ARP/ATRP/SoLV and
// difficulty here is computed exactly the way a real scan's is.
//
// Every point's top 20 is generated once from one model — each business's pull
// for the keyword, minus its distance from the search point, plus seeded noise —
// and the target's rank, the leaderboard and the point drawer all read that one
// list, so they always agree.

import {
  computeAreaDifficulty,
  computeMetrics,
  computeVisibility,
  deriveSpacingMeters,
  generateGrid,
  SCAN_DEPTH,
  SOLV_THRESHOLD,
  toMeters,
} from "@/components/maps-tracker/grid"
import type { CompetitorLeaderboard, CompetitorRow, ScanHistoryItem } from "@/components/maps-tracker/types"
import { DEMO_BRAND, DEMO_ID, perAnchor, prng, type DemoTool } from "./shared"

/** Where the demo's CTAs lead: the scan builder. */
export const MAPS_TRACKER_CREATE_HREF = "/dashboard/google-maps-tracker/new"

const STORE = DEMO_BRAND.store
const GRID_SIZE = 7
const RADIUS_METERS = toMeters(1, "IMPERIAL")
const LOCATION_ID = "demo-location"
const TARGET_PLACE_ID = "demo-place-target"

const KEYWORDS = ["nike store", "running shoes", "sneaker store near me"] as const
type Kw = 0 | 1 | 2

interface Business {
  name: string
  area: string
  /** Metres east and north of the store. */
  east: number
  north: number
  category: string
  rating: number
  reviews: number
  domain: string | null
  /** How strongly Google ties it to each keyword, in KEYWORDS order. */
  pull: [number, number, number]
}

const TARGET: Business = {
  name: STORE.name,
  area: STORE.city,
  east: 0,
  north: 0,
  category: "Sporting goods store",
  rating: 4.4,
  reviews: 2_180,
  domain: DEMO_BRAND.domain,
  pull: [6.0, 5.6, 1.5],
}

// The neighbourhood: chains only — no individuals, no invented independents.
// Pulls are tuned so the three keywords read strong, mixed and weak.
const B = (
  name: string, area: string, east: number, north: number, category: string,
  rating: number, reviews: number, domain: string | null, pull: [number, number, number],
): Business => ({ name, area, east, north, category, rating, reviews, domain, pull })
const RIVALS: Business[] = [
  B("Foot Locker", "Pioneer Place", 250, -150, "Shoe store", 4.1, 612, "footlocker.com", [5.6, 3.8, 6.4]),
  B("Foot Locker", "Lloyd Center", 2_300, 900, "Shoe store", 4.0, 488, "footlocker.com", [5.2, 3.6, 6.1]),
  B("JD Sports", "Pioneer Place", 300, -200, "Sportswear store", 4.2, 377, "jdsports.com", [4.9, 3.4, 6.2]),
  B("DICK'S Sporting Goods", "Lloyd Center", 2_500, 1_100, "Sporting goods store", 4.3, 1_940, "dickssportinggoods.com", [5.4, 5.1, 3.9]),
  B("Finish Line", "Lloyd Center", 2_250, 950, "Shoe store", 4.1, 356, "finishline.com", [4.6, 3.9, 5.6]),
  B("Champs Sports", "Lloyd Center", 2_350, 1_000, "Sportswear store", 4.0, 291, "champssports.com", [4.4, 3.1, 5.4]),
  B("Nordstrom", "Downtown", 120, 60, "Department store", 4.5, 3_210, "nordstrom.com", [4.1, 3.7, 3.2]),
  B("Fleet Feet", "Northwest", -1_400, 900, "Running store", 4.8, 842, "fleetfeet.com", [2.0, 7.4, 3.0]),
  B("Road Runner Sports", "Tigard", -1_900, -2_600, "Running store", 4.6, 1_120, "roadrunnersports.com", [1.8, 6.9, 2.8]),
  B("REI", "Pearl District", -300, 700, "Outdoor sports store", 4.6, 2_870, "rei.com", [2.3, 6.1, 2.1]),
  B("New Balance", "Pearl District", -250, 820, "Shoe store", 4.5, 410, "newbalance.com", [2.6, 6.3, 4.1]),
  B("HOKA", "Pearl District", -180, 760, "Shoe store", 4.7, 205, "hoka.com", [1.9, 6.0, 3.2]),
  B("adidas Store", "Downtown", 380, 240, "Sportswear store", 4.3, 958, "adidas.com", [4.3, 4.6, 4.9]),
  B("Columbia Sportswear Flagship", "Downtown", 200, 330, "Outdoor clothing store", 4.6, 1_640, "columbia.com", [2.9, 2.6, 1.6]),
  B("Under Armour", "Downtown", 150, -300, "Sportswear store", 4.2, 334, "underarmour.com", [3.0, 3.6, 2.9]),
  B("lululemon", "Pearl District", -120, 640, "Sportswear store", 4.4, 512, "lululemon.com", [2.4, 3.9, 1.8]),
  B("Famous Footwear", "Hollywood", 3_400, 1_400, "Shoe store", 4.2, 702, "famousfootwear.com", [3.9, 3.7, 4.6]),
  B("DSW Designer Shoe Warehouse", "Gateway", 4_900, 900, "Shoe store", 4.3, 1_210, "dsw.com", [3.6, 3.6, 4.3]),
  B("Skechers", "Downtown", 420, -90, "Shoe store", 4.4, 286, "skechers.com", [2.9, 3.4, 4.0]),
  B("Shoe Palace", "Lloyd Center", 2_420, 870, "Shoe store", 4.1, 198, "shoepalace.com", [3.5, 2.7, 5.5]),
  B("Zumiez", "Lloyd Center", 2_280, 1_060, "Clothing store", 4.3, 241, "zumiez.com", [2.2, 1.8, 4.4]),
  B("Macy's", "Lloyd Center", 2_200, 1_150, "Department store", 4.0, 1_530, "macys.com", [3.4, 2.5, 2.6]),
  B("Ross Dress for Less", "Hollywood", 3_300, 1_500, "Discount store", 4.0, 1_050, "rossstores.com", [2.5, 2.4, 2.9]),
  B("Marshalls", "Beaverton", -5_600, -900, "Discount store", 4.1, 880, "marshalls.com", [2.6, 2.7, 2.9]),
]

/** Haversine, as the backend's grid.ts computes it. */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** The backend's bearingFromCenter: "center" or a compass point. */
function bearingFromCenter(lat: number, lng: number): string {
  const dLat = lat - STORE.lat
  const dLng = lng - STORE.lng
  if (Math.abs(dLat) < 1e-9 && Math.abs(dLng) < 1e-9) return "center"
  const angle = (Math.atan2(dLng, dLat) * 180) / Math.PI
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round((angle < 0 ? angle + 360 : angle) / 45) % 8]
}

const M_PER_DEG_LAT = 111_320
const latOf = (b: Business) => STORE.lat + b.north / M_PER_DEG_LAT
const lngOf = (b: Business) => STORE.lng + b.east / (M_PER_DEG_LAT * Math.cos((STORE.lat * Math.PI) / 180))

const ALL: { biz: Business; placeId: string }[] = [
  { biz: TARGET, placeId: TARGET_PLACE_ID },
  ...RIVALS.map((biz, i) => ({ biz, placeId: `demo-place-${i + 1}` })),
]

function resultItem(b: Business, placeId: string, rankAbsolute: number) {
  return {
    rankAbsolute,
    title: b.name,
    placeId,
    cid: null,
    address: `${b.area}, Portland, OR`,
    domain: b.domain,
    rating: b.rating,
    ratingCount: b.reviews,
    category: b.category,
    isAd: false,
    imageUrl: null,
    website: b.domain ? `https://www.${b.domain}` : null,
  }
}
type ResultItem = ReturnType<typeof resultItem>

interface DemoPoint {
  id: string
  row: number
  col: number
  latitude: number
  longitude: number
  rank: number | null
  topResults: ResultItem[]
}

/** Google's top 20 at one coordinate: pull minus distance, plus a little seeded noise. */
function topAt(kw: Kw, lat: number, lng: number, rand: () => number): ResultItem[] {
  return ALL.map(({ biz, placeId }) => ({
    biz,
    placeId,
    score: biz.pull[kw] - haversineMeters(lat, lng, latOf(biz), lngOf(biz)) / 420 + (rand() - 0.5) * 1.4,
  }))
    .sort((a, b) => b.score - a.score)
    .slice(0, SCAN_DEPTH)
    .map((x, i) => resultItem(x.biz, x.placeId, i + 1))
}

function buildKeyword(kw: Kw, anchor: number) {
  const id = `demo-kw-${kw + 1}`
  const rand = prng(500 + kw)
  const points: DemoPoint[] = generateGrid(STORE.lat, STORE.lng, GRID_SIZE, RADIUS_METERS).map((g) => {
    const topResults = topAt(kw, g.lat, g.lng, rand)
    const own = topResults.find((r) => r.placeId === TARGET_PLACE_ID)
    return { id: `${id}-p${g.row}-${g.col}`, row: g.row, col: g.col, latitude: g.lat, longitude: g.lng, rank: own?.rankAbsolute ?? null, topResults }
  })
  const metrics = computeMetrics(points)
  const keyword = KEYWORDS[kw]
  return {
    id,
    scanId: DEMO_ID,
    keyword,
    normalizedKeyword: keyword.trim().toLowerCase(),
    status: "COMPLETED" as const,
    arp: metrics.arp,
    atrp: metrics.atrp,
    solv: metrics.solv,
    visibility: computeVisibility(metrics.atrp),
    areaDifficulty: computeAreaDifficulty(
      points.map((p) => ({ results: p.topResults.map((r) => ({ key: r.placeId, rankAbsolute: r.rankAbsolute, reviewCount: r.ratingCount })) })),
    ),
    foundPoints: metrics.foundPoints,
    scoredPoints: metrics.scoredPoints,
    failedPoints: 0,
    bestRank: metrics.bestRank,
    worstRank: metrics.worstRank,
    /** Internal: the full per-point results, served only by the point and leaderboard routes. */
    detail: points,
    fetchedAt: new Date(anchor - 60_000).toISOString(),
  }
}
type DemoKeyword = ReturnType<typeof buildKeyword>

// ── Competitor leaderboard (competitors.service.ts getLeaderboard, ported) ───

function leaderboard(k: DemoKeyword): CompetitorLeaderboard {
  const businesses = new Map<string, { b: Business; placeId: string; ranks: Record<number, number>; top3: number[] }>()
  for (const { biz, placeId } of ALL) businesses.set(placeId, { b: biz, placeId, ranks: {}, top3: [] })
  k.detail.forEach((point, idx) => {
    for (const item of point.topResults) {
      const entry = businesses.get(item.placeId)!
      // The target's rank is the point's own matched rank, as in the backend.
      const rank = item.placeId === TARGET_PLACE_ID ? point.rank : item.rankAbsolute
      if (rank == null) continue
      entry.ranks[idx] = rank
      if (rank <= SOLV_THRESHOLD) entry.top3.push(haversineMeters(STORE.lat, STORE.lng, point.latitude, point.longitude))
    }
  })
  const scored = k.detail.length
  const seen = [...businesses.values()].filter((e) => e.placeId === TARGET_PLACE_ID || Object.keys(e.ranks).length > 0)
  const rows: CompetitorRow[] = seen.map((e) => {
    const m = computeMetrics(Array.from({ length: scored }, (_, i) => ({ rank: e.ranks[i] ?? null })))
    return {
      key: e.placeId,
      placeId: e.placeId,
      cid: null,
      name: e.b.name,
      address: `${e.b.area}, Portland, OR`,
      imageUrl: null,
      website: e.b.domain ? `https://www.${e.b.domain}` : null,
      rating: e.b.rating,
      reviewCount: e.b.reviews,
      category: e.b.category,
      isTarget: e.placeId === TARGET_PLACE_ID,
      foundPoints: m.foundPoints,
      scoredPoints: scored,
      percentOfResults: scored ? Math.round((m.foundPoints / scored) * 10000) / 100 : 0,
      arp: m.arp,
      atrp: m.atrp,
      solv: m.solv,
      visibility: computeVisibility(m.atrp),
      ranks: e.ranks,
    }
  })
  rows.sort((a, b) => (b.solv ?? -1) - (a.solv ?? -1) || (a.arp ?? Infinity) - (b.arp ?? Infinity))
  const target = rows.find((r) => r.isTarget) ?? null
  const competitors = rows.filter((r) => !r.isTarget)
  const topSolv = rows.reduce((max, r) => (r.solv != null && r.solv > max ? r.solv : max), 0)
  const mean = (xs: number[]) => xs.reduce((s, d) => s + d, 0) / xs.length
  const targetTop3 = businesses.get(TARGET_PLACE_ID)!.top3
  const allTop3 = [...businesses.values()].flatMap((e) => (e.top3.length ? [mean(e.top3)] : []))
  return {
    points: k.detail.map((p) => ({ id: p.id, row: p.row, col: p.col })),
    rows,
    areaDifficulty: k.areaDifficulty,
    visibility: k.visibility,
    insights: {
      yourSolv: target?.solv ?? null,
      topSolv: rows.length ? topSolv : null,
      isMarketLeader: target != null && target.solv != null && target.solv >= topSolv,
      yourTop3DistanceMeters: targetTop3.length ? Math.round(mean(targetTop3)) : null,
      marketAverageTop3DistanceMeters: allTop3.length ? Math.round(mean(allTop3)) : null,
      totalCompetitors: competitors.length,
      activeCompetitors: competitors.filter((c) => (c.solv ?? 0) > 0).length,
    },
  }
}

// ── The scan ─────────────────────────────────────────────────────────────────

/**
 * The "What this means" read — one per scan, written from the keyword with the
 * most complete data, as the backend's AI job does. Every figure in it comes
 * from that keyword's computed numbers.
 */
function aiContent(k: DemoKeyword, lb: CompetitorLeaderboard) {
  const pct = (n: number | null) => `${Math.round(n ?? 0)}%`
  const rivals = lb.rows.filter((r) => !r.isTarget).slice(0, 3)
  const outranked = (r: CompetitorRow) =>
    k.detail.filter((p, i) => r.ranks[i] != null && (p.rank == null || r.ranks[i] < p.rank)).length
  const edge = k.detail.filter((p) => p.row === 0 || p.col === 0 || p.row === GRID_SIZE - 1 || p.col === GRID_SIZE - 1)
  const edgeTop3 = edge.filter((p) => p.rank != null && p.rank <= SOLV_THRESHOLD).length
  return {
    summary: `${STORE.name} holds a top-3 spot for "${k.keyword}" across ${pct(k.solv)} of the grid, averaging #${k.arp?.toFixed(1)} where it appears. It dominates the blocks around the store and fades toward the edges, where shopping-mall competitors take over.`,
    visibilityShape: `Strong core, weaker edges: ${edgeTop3} of the ${edge.length} outer points are top 3, against most of the inner ring.`,
    strengths: [
      { title: "Owns the downtown core", detail: `Ranks #1–3 at nearly every point within half a mile of the store.` },
      { title: "Review volume", detail: `${TARGET.reviews.toLocaleString("en-US")} reviews at ${TARGET.rating} stars — more than most businesses in the pack.` },
    ],
    weaknesses: [
      { title: "East side drop-off", detail: "Lloyd Center's cluster of sneaker stores outranks the store on the east edge of the grid." },
      { title: "Category breadth", detail: `Listed as "${TARGET.category}" only; rivals add shoe-store categories that match more searches.` },
    ],
    competitors: rivals.map((r) => ({
      name: r.name,
      insight: `Top 3 at ${pct(r.solv)} of points${r.address ? `, strongest around ${r.address.split(",")[0]}` : ""}.`,
      outrankedAtPoints: outranked(r),
    })),
    recommendations: [
      { title: "Add secondary categories", detail: "Add Shoe store and Sportswear store to the Business Profile.", priority: "HIGH" as const, effort: "LOW" as const, evidence: `Rivals ranking on the east edge list shoe-store categories; ${STORE.name} lists one.` },
      { title: "Post weekly product updates", detail: "Google Posts about new releases keep the profile active for product searches.", priority: "MEDIUM" as const, effort: "LOW" as const, evidence: `Visibility ${pct(k.visibility)} with room to grow at the grid's edges.` },
      { title: "Ask for reviews that mention products", detail: "Reviews naming shoes and running gear reinforce relevance for those searches.", priority: "MEDIUM" as const, effort: "MEDIUM" as const, evidence: `Average rank ${k.arp?.toFixed(1)} where found; competitors with fewer reviews still win the outer ring.` },
    ],
    confidence: "HIGH" as const,
    confidenceReason: `All ${k.scoredPoints} points returned results, so every figure is measured, not estimated.`,
  }
}

const demoData = perAnchor((anchor) => {
  const createdAt = new Date(anchor - 6 * 60_000).toISOString()
  const completedAt = new Date(anchor - 60_000).toISOString()
  const keywords = ([0, 1, 2] as Kw[]).map((kw) => buildKeyword(kw, anchor))
  const location = {
    id: LOCATION_ID,
    userId: DEMO_ID,
    name: STORE.name,
    address: STORE.city,
    placeId: TARGET_PLACE_ID,
    cid: null,
    latitude: STORE.lat,
    longitude: STORE.lng,
    primaryCategory: TARGET.category,
    phone: null,
    website: DEMO_BRAND.url,
    rating: TARGET.rating,
    reviewCount: TARGET.reviews,
    metadataRefreshedAt: createdAt,
    createdAt,
    updatedAt: createdAt,
    archivedAt: null,
  }
  const scan = {
    id: DEMO_ID,
    userId: DEMO_ID,
    locationId: LOCATION_ID,
    status: "COMPLETED" as const,
    platform: "GOOGLE_MAPS",
    centerLat: STORE.lat,
    centerLng: STORE.lng,
    gridSize: GRID_SIZE,
    radiusMeters: RADIUS_METERS,
    spacingMeters: deriveSpacingMeters(GRID_SIZE, RADIUS_METERS),
    displayUnit: "IMPERIAL" as const,
    zoom: 14,
    languageCode: "en",
    countryCode: DEMO_BRAND.country,
    depth: SCAN_DEPTH,
    totalKeywords: keywords.length,
    totalPoints: keywords.length * GRID_SIZE * GRID_SIZE,
    pointsDone: keywords.length * GRID_SIZE * GRID_SIZE,
    reservationId: null,
    creditHoldId: null,
    aiAnalysisRequested: true,
    queuedAt: createdAt,
    startedAt: createdAt,
    completedAt,
    errorMessage: null,
    createdAt,
    updatedAt: completedAt,
  }
  // The AI read is written from the keyword with the most complete data; all
  // three are complete here, so the first.
  const aiReport = {
    id: "demo-ai-report",
    scanId: DEMO_ID,
    status: "COMPLETED" as const,
    model: "demo",
    content: aiContent(keywords[0], leaderboard(keywords[0])),
    promptTokens: null,
    completionTokens: null,
    errorMessage: null,
    createdAt: completedAt,
    completedAt,
  }
  return { anchor, scan, location, keywords, aiReport }
})
type DemoData = ReturnType<typeof demoData>

const pointSummary = (p: DemoPoint) => ({
  id: p.id, row: p.row, col: p.col, latitude: p.latitude, longitude: p.longitude,
  status: "SUCCEEDED" as const, rank: p.rank, matchConfidence: p.rank != null ? ("PLACE_ID" as const) : null,
})

/** A keyword row without the demo-only fields. */
function keywordRow(k: DemoKeyword) {
  const { detail: _detail, fetchedAt: _fetchedAt, ...row } = k
  return row
}

/** GET /scans/:id — the scan with its location, AI report and every keyword's points. */
function scanDetail(d: DemoData) {
  return {
    ...d.scan,
    location: d.location,
    aiReport: d.aiReport,
    keywords: d.keywords.map((k) => ({ ...keywordRow(k), points: k.detail.map(pointSummary) })),
  }
}

/** GET /scans/:id/points/:pointId — the point row, its top 20 and where it sits. */
function pointDetail(d: DemoData, k: DemoKeyword, p: DemoPoint) {
  return {
    ...pointSummary(p),
    scanKeywordId: k.id,
    enabled: true,
    providerTaskId: null,
    providerCostUsd: null,
    fromCache: false,
    duplicateMatched: false,
    topResults: p.topResults,
    attempts: 1,
    errorMessage: null,
    fetchedAt: k.fetchedAt,
    scanKeyword: { ...keywordRow(k), scan: d.scan },
    distanceFromCenterMeters: Math.round(haversineMeters(STORE.lat, STORE.lng, p.latitude, p.longitude)),
    bearingFromCenter: bearingFromCenter(p.latitude, p.longitude),
  }
}

/** The scan as the history list returns it (listForUser), pinned first in the tool's list. */
export function demoMapsScanSummary(): ScanHistoryItem {
  const d = demoData()
  return {
    ...d.scan,
    location: { name: d.location.name, address: d.location.address },
    keywords: d.keywords.map((k) => ({
      id: k.id,
      keyword: k.keyword,
      status: k.status,
      arp: k.arp,
      atrp: k.atrp,
      solv: k.solv,
      visibility: k.visibility,
      areaDifficulty: k.areaDifficulty,
      scoredPoints: k.scoredPoints,
      points: k.detail.map((p) => ({ row: p.row, col: p.col, status: "SUCCEEDED" as const, rank: p.rank })),
    })),
  }
}

// ── Routes (GET only; lib/demo/index.ts refuses writes) ─────────────────────

export const mapsTrackerDemo: DemoTool = {
  base: "/api/maps-tracker/scans",
  get([a, b, c, ...rest]) {
    if (rest.length) return undefined
    const d = demoData()
    if (a === undefined) return { scan: scanDetail(d) }
    if (a === "points" && b && c === undefined) {
      for (const k of d.keywords) {
        const p = k.detail.find((x) => x.id === b)
        if (p) return { point: pointDetail(d, k, p) }
      }
      return undefined
    }
    if (a === "keywords" && c === "competitors") {
      const k = d.keywords.find((x) => x.id === b)
      return k && leaderboard(k)
    }
    return undefined
  },
}
