// Builds lib/demo/maps-audit.fixture.json — the Google Maps Audit demo's facts
// and the report the REAL backend derives from them.
//
//   npx tsx scripts/demo-maps-audit.ts
//
// Needs freeserp-backend-v2 checked out beside this repo: the report is
// produced by its own buildReport (src/modules/gbp-audit/report.ts, pure, type
// imports only), not by a frontend copy that could drift from it. Re-run this
// whenever report.ts or facts.ts changes, and commit the JSON.
//
// Dates are written relative to FIXTURE_ANCHOR; lib/demo/maps-audit.ts shifts
// every one of them to the current demo anchor when it serves the fixture, so
// the demo never looks stale. The report itself measures recency from
// facts.fetchedAt, never from the clock, so shifting both keeps it exact.

import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { buildReport } from "../../freeserp-backend-v2/src/modules/gbp-audit/report"
import type { GbpFacts } from "../../freeserp-backend-v2/src/modules/gbp-audit/facts"
import { computeMetrics, computeVisibility, generateGrid, SOLV_THRESHOLD } from "../components/maps-tracker/grid"
import { DAY_MS, DEMO_BRAND, prng } from "../lib/demo/shared"

const FIXTURE_ANCHOR = Date.UTC(2026, 0, 1, 6)
const iso = (daysAgo: number, minutes = 0) => new Date(FIXTURE_ANCHOR - daysAgo * DAY_MS - minutes * 60_000).toISOString()
const rand = prng(4242)
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]

const STORE = DEMO_BRAND.store
const KEYWORD = "nike store"
const CITY = STORE.city.split(",")[0]
const REGION = STORE.city.split(",")[1]?.trim() ?? null
// A reserved fictional number (555-01xx), never a real one.
const PHONE = "+1 503-555-0142"
const TARGET_PLACE_ID = "demo-place-target"
const fetchedAt = iso(0, 4)

// The rivals around the store — the same chains as the Maps Tracker demo.
const RIVALS = [
  { title: "Foot Locker", category: "Shoe store", rating: 4.1, reviews: 612, domain: "footlocker.com", east: 250, north: -150 },
  { title: "JD Sports", category: "Sportswear store", rating: 4.2, reviews: 377, domain: "jdsports.com", east: 300, north: -200 },
  { title: "adidas Store", category: "Sportswear store", rating: 4.3, reviews: 958, domain: "adidas.com", east: 380, north: 240 },
  { title: "Nordstrom", category: "Department store", rating: 4.5, reviews: 3_210, domain: "nordstrom.com", east: 120, north: 60 },
  { title: "Columbia Sportswear Flagship", category: "Outdoor clothing store", rating: 4.6, reviews: 1_640, domain: "columbia.com", east: 200, north: 330 },
  { title: "Under Armour", category: "Sportswear store", rating: 4.2, reviews: 334, domain: "underarmour.com", east: 150, north: -300 },
  { title: "Skechers", category: "Shoe store", rating: 4.4, reviews: 286, domain: "skechers.com", east: 420, north: -90 },
  { title: "REI", category: "Outdoor sports store", rating: 4.6, reviews: 2_870, domain: "rei.com", east: -300, north: 700 },
  { title: "New Balance", category: "Shoe store", rating: 4.5, reviews: 410, domain: "newbalance.com", east: -250, north: 820 },
  { title: "lululemon", category: "Sportswear store", rating: 4.4, reviews: 512, domain: "lululemon.com", east: -120, north: 640 },
  { title: "HOKA", category: "Shoe store", rating: 4.7, reviews: 205, domain: "hoka.com", east: -180, north: 760 },
  { title: "Fleet Feet", category: "Running store", rating: 4.8, reviews: 842, domain: "fleetfeet.com", east: -1_400, north: 900 },
  { title: "DICK'S Sporting Goods", category: "Sporting goods store", rating: 4.3, reviews: 1_940, domain: "dickssportinggoods.com", east: 2_500, north: 1_100 },
  { title: "Finish Line", category: "Shoe store", rating: 4.1, reviews: 356, domain: "finishline.com", east: 2_250, north: 950 },
  { title: "Champs Sports", category: "Sportswear store", rating: 4.0, reviews: 291, domain: "champssports.com", east: 2_350, north: 1_000 },
  { title: "Macy's", category: "Department store", rating: 4.0, reviews: 1_530, domain: "macys.com", east: 2_200, north: 1_150 },
  { title: "Zumiez", category: "Clothing store", rating: 4.3, reviews: 241, domain: "zumiez.com", east: 2_280, north: 1_060 },
  { title: "Shoe Palace", category: "Shoe store", rating: 4.1, reviews: 198, domain: "shoepalace.com", east: 2_420, north: 870 },
  { title: "Famous Footwear", category: "Shoe store", rating: 4.2, reviews: 702, domain: "famousfootwear.com", east: 3_400, north: 1_400 },
]
const M_PER_DEG_LAT = 111_320
const latOf = (north: number) => STORE.lat + north / M_PER_DEG_LAT
const lngOf = (east: number) => STORE.lng + east / (M_PER_DEG_LAT * Math.cos((STORE.lat * Math.PI) / 180))
const area = (east: number) => (east > 2_000 ? "Lloyd District" : east < -200 ? "Pearl District" : "Downtown")

// ── Business ──────────────────────────────────────────────────────────────────

const RATING_DIST = { "1": 109, "2": 44, "3": 131, "4": 414, "5": 1_482 }
const reviewCount = Object.values(RATING_DIST).reduce((a, b) => a + b, 0)

const business: GbpFacts["business"] = {
  name: STORE.name,
  description:
    "Nike's downtown store carries the latest running shoes, basketball shoes, Jordan releases and training gear for men, women and kids. Members get free shipping, easy returns and access to in-store events and run clubs.",
  category: "Sporting goods store",
  additionalCategories: ["Clothing store"],
  address: STORE.city,
  city: CITY,
  region: REGION,
  zip: null,
  countryCode: DEMO_BRAND.country,
  phone: PHONE,
  website: DEMO_BRAND.url,
  domain: DEMO_BRAND.domain,
  latitude: STORE.lat,
  longitude: STORE.lng,
  cid: null,
  placeId: TARGET_PLACE_ID,
  featureId: null,
  mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${STORE.name}, ${STORE.city}`)}`,
  isClaimed: true,
  rating: 4.4,
  reviewCount,
  ratingDistribution: RATING_DIST,
  totalPhotos: 1_240,
  logo: null,
  mainImage: null,
  hours: (["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const).map((day) => ({
    day,
    open: [day === "sunday" ? "11:00–18:00" : "10:00–20:00"],
  })),
  currentStatus: "open",
  attributes: [
    { group: "Accessibility", items: ["Wheelchair-accessible entrance", "Wheelchair-accessible restroom"] },
    { group: "Service options", items: ["In-store pickup", "In-store shopping", "Delivery"] },
    { group: "Payments", items: ["Credit cards", "Debit cards", "NFC mobile payments"] },
  ],
  placeTopics: [
    { topic: "running shoes", count: 142 },
    { topic: "staff", count: 118 },
    { topic: "sizes", count: 64 },
    { topic: "jordans", count: 51 },
    { topic: "returns", count: 27 },
  ],
  priceLevel: "$$",
  links: [{ type: "order", title: "Shop online", url: DEMO_BRAND.url }],
  peopleAlsoSearch: RIVALS.slice(0, 5).map((r) => ({ title: r.title, cid: null, rating: r.rating, reviewCount: r.reviews })),
  lastUpdated: iso(9),
  bookOnlineUrl: null,
  contactUrl: `${DEMO_BRAND.url}/help`,
}

// ── Reviews: the newest 50, denser lately, a third answered ──────────────────

const GOOD = [
  "Staff helped me find the right running shoes after a quick gait check. Great service.",
  "Huge selection of Jordans and the team knew every release date.",
  "In and out in ten minutes with an online pickup order. Easy.",
  "Clean store, friendly staff, and they had my size in stock.",
  "Returned a pair without the receipt using the app. No hassle at all.",
  "Best place downtown for running gear. Ask about the run club.",
]
const MIXED = [
  "Good selection but checkout lines were long on a Saturday.",
  "Nice store, though the shoe I wanted was out of stock in my size.",
]
const BAD = ["Waited 25 minutes for someone to bring sizes from the back.", "Pickup order wasn't ready when the app said it was."]
const NAMES = ["Sam K.", "Alex R.", "Jordan P.", "Taylor M.", "Chris D.", "Morgan L.", "Riley S.", "Casey T.", "Jamie W.", "Drew H."]
const timeAgo = (d: number) =>
  d < 1 ? "today" : d < 7 ? `${d} day${d === 1 ? "" : "s"} ago` : d < 30 ? `${Math.floor(d / 7)} week${d < 14 ? "" : "s"} ago` : `${Math.floor(d / 30)} month${d < 60 ? "" : "s"} ago`
let day = 0
const reviews: GbpFacts["reviews"] = {
  requested: 50,
  items: Array.from({ length: 50 }, (_, i) => {
    day += i < 20 ? 1 + Math.floor(rand() * 2) : 2 + Math.floor(rand() * 5)
    const r = rand()
    const rating = r < 0.08 ? 1 : r < 0.12 ? 2 : r < 0.2 ? 3 : r < 0.38 ? 4 : 5
    const answered = rand() < 0.35
    return {
      author: pick(NAMES),
      rating,
      text: rating >= 4 ? pick(GOOD) : rating === 3 ? pick(MIXED) : pick(BAD),
      publishedAt: iso(day, Math.floor(rand() * 600)),
      timeAgo: timeAgo(day),
      ownerAnswer: answered ? (rating >= 4 ? "Thanks for visiting — see you at the next run club!" : "Sorry about this. Please ask for a manager next time so we can make it right.") : null,
      ownerAnsweredAt: answered ? iso(Math.max(0, day - 2)) : null,
      localGuide: rand() < 0.2,
      photos: rand() < 0.15 ? 1 + Math.floor(rand() * 3) : 0,
    }
  }),
}

// ── Search from the pin, the 3×3 grid, buying-intent searches ────────────────

const rivalRow = (r: (typeof RIVALS)[number], rank: number) => ({
  rank,
  title: r.title,
  cid: null,
  placeId: `demo-place-${r.domain}`,
  rating: r.rating,
  reviewCount: r.reviews,
  category: r.category,
  domain: r.domain,
  website: `https://www.${r.domain}`,
  address: `${area(r.east)}, ${STORE.city}`,
  imageUrl: null,
  isTarget: false,
})
const targetRow = (rank: number) => ({
  rank, title: STORE.name, cid: null, placeId: TARGET_PLACE_ID, rating: business.rating, reviewCount,
  category: business.category, domain: DEMO_BRAND.domain, website: DEMO_BRAND.url, address: STORE.city, imageUrl: null, isTarget: true,
})

/** Who ranks where from one coordinate: pull minus distance, plus noise (the Maps Tracker demo's model). */
function resultsAt(lat: number, lng: number, targetPull: number) {
  const dist = (north: number, east: number) => Math.hypot((latOf(north) - lat) * M_PER_DEG_LAT, (lngOf(east) - lng) * M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180))
  const scored = [
    { t: null as null | (typeof RIVALS)[number], s: targetPull - dist(0, 0) / 420 + (rand() - 0.5) * 1.4 },
    ...RIVALS.map((r) => ({ t: r, s: (r.title === "Foot Locker" ? 5.6 : r.category === "Shoe store" ? 4.2 : 3.6) - dist(r.north, r.east) / 420 + (rand() - 0.5) * 1.4 })),
  ].sort((a, b) => b.s - a.s)
  return scored.slice(0, 20).map((x, i) => (x.t ? rivalRow(x.t, i + 1) : targetRow(i + 1)))
}

const pinResults = resultsAt(STORE.lat, STORE.lng, 6.0)
const visibility: GbpFacts["visibility"] = {
  keyword: KEYWORD, lat: STORE.lat, lng: STORE.lng, depth: 20,
  rank: pinResults.find((r) => r.isTarget)?.rank ?? null,
  results: pinResults,
}

const GRID_RADIUS = 1_000
const gridPoints = generateGrid(STORE.lat, STORE.lng, 3, GRID_RADIUS).map((g) => {
  const res = resultsAt(g.lat, g.lng, 6.0)
  const own = res.find((r) => r.isTarget)
  const top = res.filter((r) => !r.isTarget).slice(0, 3)
  const shown = own && own.rank <= 3 ? res.slice(0, 3) : own ? [...top, own] : top
  return {
    row: g.row, col: g.col, lat: g.lat, lng: g.lng, isCenter: g.isCenter, status: "SUCCEEDED" as const,
    rank: own?.rank ?? null,
    top: shown.map((r) => ({ rank: r.rank, title: r.title, rating: r.rating, reviewCount: r.reviewCount, isTarget: r.isTarget })),
  }
})
const m = computeMetrics(gridPoints)
const grid: NonNullable<GbpFacts["grid"]> = {
  keyword: KEYWORD, gridSize: 3, radiusMeters: GRID_RADIUS, spacingMeters: GRID_RADIUS, zoom: 14, depth: 20,
  centerLat: STORE.lat, centerLng: STORE.lng, points: gridPoints,
  metrics: {
    arp: m.arp, atrp: m.atrp, solv: m.solv, visibility: computeVisibility(m.atrp),
    foundPoints: m.foundPoints, scoredPoints: m.scoredPoints,
    top3Points: gridPoints.filter((p) => p.rank != null && p.rank <= SOLV_THRESHOLD).length,
  },
  // No Maps Tracker scan behind this grid: the tracker demo is a different (7×7) grid,
  // so the rival-grid panel, which needs one, is left out rather than mismatched.
  scanId: null,
}

const commercialRanks: GbpFacts["commercialRanks"] = [
  { keyword: `${KEYWORD} near me`, rank: 1, depth: 20, top: [STORE.name, "Foot Locker", "JD Sports"] },
  { keyword: `best ${KEYWORD} in ${CITY.toLowerCase()}`, rank: 3, depth: 20, top: ["Foot Locker", "Nordstrom", STORE.name] },
  { keyword: `${KEYWORD} ${CITY.toLowerCase()}`, rank: 1, depth: 20, top: [STORE.name, "adidas Store", "Foot Locker"] },
]

// ── Posts, competitors' profiles ─────────────────────────────────────────────

const posts: GbpFacts["posts"] = {
  requested: 10,
  items: [
    { publishedAt: iso(4), text: "New running shoe drop this Saturday. Members get first access from 10am.", url: null, image: null, links: [{ title: "Learn more", url: DEMO_BRAND.url }] },
    { publishedAt: iso(19), text: "Join the Thursday run club — 5K loops along the waterfront, all paces welcome.", url: null, image: null, links: [] },
    { publishedAt: iso(47), text: "Free shoe fittings all week. Book a slot in store.", url: null, image: null, links: [] },
  ],
}

const reviewDates = (perWeek: number) => Array.from({ length: 20 }, (_, i) => iso(Math.round((i + 1) * (7 / perWeek))))
const competitorProfiles: GbpFacts["competitorProfiles"] = RIVALS.slice(0, 3).map((r, i) => ({
  rank: i + 2,
  title: r.title,
  cid: null,
  category: r.category,
  additionalCategories: i === 0 ? ["Sportswear store", "Sporting goods store"] : ["Shoe store"],
  description: `${r.title} in ${CITY}: sneakers, apparel and accessories from the brands you love.`,
  totalPhotos: [380, 210, 640][i],
  rating: r.rating,
  reviewCount: r.reviews,
  reviewDates: reviewDates([6, 3, 4][i]),
  reviewsRequested: 20,
  address: `${area(r.east)}, ${STORE.city}`,
  city: CITY,
  phone: null,
  website: `https://www.${r.domain}`,
  lat: latOf(r.north),
  lng: lngOf(r.east),
}))

// ── Website ──────────────────────────────────────────────────────────────────

const website: GbpFacts["website"] = {
  url: DEMO_BRAND.url,
  finalUrl: `${DEMO_BRAND.url}/`,
  status: 200,
  error: null,
  https: true,
  httpsRedirect: true,
  ssl: { valid: true, daysLeft: 74 },
  title: "Nike. Just Do It. Nike.com",
  metaDescription: "Nike delivers innovative products, experiences and services to inspire athletes.",
  h1: null,
  viewport: true,
  noindex: false,
  robotsBlocked: false,
  schemaTypes: ["Organization", "WebSite"],
  localBusinessSchema: false,
  psi: { score: 38, lcpMs: 4_200, cls: 0.08 },
  brokenLinks: [{ url: `${DEMO_BRAND.url}/w/summer-sale`, status: 404, page: `${DEMO_BRAND.url}/` }],
  linksChecked: 120,
  servicePages: [
    { term: "running shoes", url: `${DEMO_BRAND.url}/w/running-shoes` },
    { term: "basketball shoes", url: `${DEMO_BRAND.url}/w/basketball-shoes` },
    { term: "shoe fitting", url: null },
  ],
  locationPages: [],
  pagesFound: 1_800,
}

// ── Citations: the business, then its three nearest rivals ───────────────────

const DIRECTORIES = [
  "citybusinessfinder.com", "cityservicelisting.com", "localcitationdirectory.com", "verifiedlocallistings.com",
  "localshopsdirectory.com", "localexpertsindex.com", "communityplaceshub.com", "servicehubnearby.com",
  "localbusinessatlas.com", "communitybusinesspages.com", "downtownservicedirectory.com", "bestintownfinder.com",
  "neighborhoodproslist.com", "localtrustedpages.com", "metrobusinessindex.com", "biznearmedirectory.com",
  "urbanservicelisting.com", "cityplaceshub.com", "downtownbizindex.com", "topratedlocals.com",
  "areaserviceguide.com", "neighborhoodbizguide.com", "citycornerdirectory.com", "serviceproviderdirectory.com",
  "neighbourhoodlisting.com",
] // citations.ts CITATION_DIRECTORIES, in its order

function citations(name: string, category: string, listedShare: number): NonNullable<GbpFacts["citations"]> {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  return {
    checkedAt: iso(0, 6),
    sites: DIRECTORIES.map((domain, i) => {
      const url = `https://${domain}`
      const status = i === 7 ? ("unreachable" as const) : rand() < listedShare ? ("listed" as const) : ("missing" as const)
      return {
        name: domain,
        url,
        status,
        listingUrl: status === "listed" ? `${url}/biz/${slug}-${1000 + i}` : null,
        addUrl: status === "unreachable" ? url : `${url}/add-business`,
        categoryUrl: `${url}/search?q=${encodeURIComponent(category)}&loc=${encodeURIComponent(CITY)}`,
      }
    }),
  }
}

const facts: GbpFacts = {
  target: { cid: null, placeId: TARGET_PLACE_ID, name: STORE.name, lat: STORE.lat, lng: STORE.lng, input: business.mapsUrl! },
  business,
  reviews,
  visibility,
  grid,
  keyword: KEYWORD,
  sources: {
    profile: { fetchedAt, cached: false },
    reviews: { fetchedAt, cached: false },
    grid: { fetchedAt, cached: false },
    posts: { fetchedAt, cached: false },
  },
  posts,
  competitorProfiles,
  commercialRanks,
  website,
  citations: citations(STORE.name, business.category!, 0.3),
  competitorCitations: RIVALS.slice(0, 3).map((r, i) => ({
    rank: i + 2, title: r.title, cid: null, citations: citations(r.title, r.category, [0.75, 0.6, 0.5][i]),
  })),
  notes: [],
  costUsd: 0,
  fetchedAt,
}

const report = buildReport(facts)
const out = join(__dirname, "../lib/demo/maps-audit.fixture.json")
writeFileSync(out, JSON.stringify({ anchor: new Date(FIXTURE_ANCHOR).toISOString(), facts, report }) + "\n")
console.log(`wrote ${out}: score ${report.score}, ${report.checks.length} checks`)
