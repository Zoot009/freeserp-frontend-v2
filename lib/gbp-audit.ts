// Google Business Profile audit: the report as GET /api/gbp-audit/:id returns it.
// The audit engine lives in the backend (src/modules/gbp-audit: facts.ts and
// report.ts); these types are copied from it and must change with it.

export type AuditStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED"
export type AuditStep = "profile" | "reviews" | "rankings"
export type CheckStatus = "pass" | "warn" | "fail" | "unknown"
export type Priority = "high" | "medium" | "low"
export type CategoryKey = "profile" | "reviews" | "content" | "website" | "visibility"
export type Weekday = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday"

export type Business = {
  name: string
  description: string | null
  category: string | null
  additionalCategories: string[]
  address: string | null
  city: string | null
  region: string | null
  zip: string | null
  countryCode: string | null
  phone: string | null
  website: string | null
  domain: string | null
  latitude: number | null
  longitude: number | null
  cid: string | null
  placeId: string | null
  featureId: string | null
  mapsUrl: string | null
  isClaimed: boolean | null
  rating: number | null
  reviewCount: number | null
  ratingDistribution: Record<"1" | "2" | "3" | "4" | "5", number> | null
  totalPhotos: number | null
  logo: string | null
  mainImage: string | null
  hours: { day: Weekday; open: string[] }[] | null
  currentStatus: string | null
  attributes: { group: string; items: string[] }[]
  placeTopics: { topic: string; count: number }[]
  priceLevel: string | null
  links: { type: string; title: string | null; url: string }[]
  peopleAlsoSearch: { title: string; cid: string | null; rating: number | null; reviewCount: number | null }[]
  lastUpdated: string | null
}

export type Review = {
  author: string | null
  rating: number | null
  text: string | null
  publishedAt: string | null
  timeAgo: string | null
  ownerAnswer: string | null
  ownerAnsweredAt: string | null
  localGuide: boolean
  photos: number
}

export type CompetitorRow = {
  rank: number
  title: string
  cid: string | null
  placeId: string | null
  rating: number | null
  reviewCount: number | null
  category: string | null
  domain: string | null
  website: string | null
  address: string | null
  imageUrl: string | null
  isTarget: boolean
}

export type GridPoint = {
  row: number
  col: number
  lat: number
  lng: number
  isCenter: boolean
  status: "SUCCEEDED" | "FAILED"
  rank: number | null
  top: { rank: number; title: string; rating: number | null; reviewCount: number | null; isTarget: boolean }[]
}

export type Grid = {
  keyword: string
  gridSize: number
  radiusMeters: number
  spacingMeters: number
  zoom: number
  depth: number
  centerLat: number
  centerLng: number
  points: GridPoint[]
  metrics: {
    arp: number | null
    atrp: number | null
    solv: number | null
    visibility: number | null
    foundPoints: number
    scoredPoints: number
    top3Points: number
  }
}

export type SourceInfo = { fetchedAt: string; cached: boolean }

export type Facts = {
  target: { cid: string | null; placeId: string | null; name: string | null; lat: number | null; lng: number | null; input: string }
  business: Business
  reviews: { requested: number; items: Review[] } | null
  visibility: { keyword: string; lat: number; lng: number; depth: number; rank: number | null; results: CompetitorRow[] } | null
  /** Absent on audits from before the grid existed. */
  grid?: Grid | null
  keyword?: string | null
  /** Absent on audits from before the cache existed. */
  sources?: { profile: SourceInfo; reviews: SourceInfo | null; grid: SourceInfo | null }
  notes: string[]
  costUsd: number
  fetchedAt: string
}

export type Check = {
  id: string
  category: CategoryKey
  label: string
  status: CheckStatus
  value: string
  detail: string
  fix: string | null
  priority: Priority
  weight: number
}

export type CategoryScore = { key: CategoryKey; label: string; score: number | null; passed: number; warned: number; failed: number }
export type PlanPhase = { window: string; title: string; items: string[] }

export type Report = {
  score: number | null
  categories: CategoryScore[]
  checks: Check[]
  findings: Check[]
  strengths: Check[]
  plan: PlanPhase[]
  competitors: {
    rows: CompetitorRow[]
    medianReviews: number | null
    avgRating: number | null
    topCategory: { name: string; count: number } | null
  }
  reviewStats: {
    sampled: number
    replied: number
    responseRate: number | null
    newestAt: string | null
    daysSinceNewest: number | null
    negative: number
    negativeUnanswered: number
    sampleAverage: number | null
  }
}

export type PastAudit = { id: string; score: number | null; createdAt: string }

export type GbpAuditResponse = {
  audit: {
    id: string
    input: string
    name: string | null
    keyword: string | null
    fromCache: boolean
    status: AuditStatus
    error: string | null
    progress: { step: AuditStep } | null
    score: number | null
    createdAt: string
    seconds: number | null
  }
  facts: Facts | null
  report: Report | null
  previous: PastAudit | null
  others: PastAudit[]
}

/** GET /api/gbp-audit list rows. */
export type AuditListItem = {
  id: string
  input: string
  name: string | null
  keyword: string | null
  fromCache: boolean
  status: AuditStatus
  error: string | null
  score: number | null
  createdAt: string
}

export const isRunning = (s: AuditStatus) => s === "QUEUED" || s === "RUNNING"

export const STEPS: { key: AuditStep; label: string; hint: string }[] = [
  { key: "profile", label: "Reading the profile", hint: "Categories, contact details, hours, photos and attributes" },
  { key: "reviews", label: "Reading the newest reviews", hint: "Ratings, recency and owner replies" },
  { key: "rankings", label: "Running the 3×3 rank grid", hint: "The keyword searched from nine points around the business, and who outranks it" },
]

export const STATUS_LABEL: Record<CheckStatus, string> = {
  pass: "Passed",
  warn: "Needs attention",
  fail: "Failed",
  unknown: "Not verified",
}

export const PRIORITY_LABEL: Record<Priority, string> = { high: "High", medium: "Medium", low: "Low" }

export const DAY_LABEL: Record<Weekday, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
}

export const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })

/** Up to two initials for a monogram tile. */
export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean)
  return ((words[0]?.[0] ?? "?") + (words[1]?.[0] ?? "")).toUpperCase()
}

/** The host of a URL without www., for display. */
export function hostOf(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

/** Days a fetched profile is reused before Google is asked again (backend GBP_AUDIT_CACHE_DAYS). */
export const CACHE_DAYS = 10

/** The score's verdict, by grade band. */
export function verdict(score: number): string {
  if (score >= 90) return "Excellent"
  if (score >= 80) return "Strong"
  if (score >= 70) return "Good, with gaps"
  if (score >= 60) return "Needs work"
  return "Needs urgent work"
}

/** Where a grid point sits relative to the business, in words. */
export function pointPlace(row: number, col: number, size: number): string {
  const mid = (size - 1) / 2
  if (row === mid && col === mid) return "At the business"
  const ns = row < mid ? "North" : row > mid ? "South" : ""
  const ew = col < mid ? "west" : col > mid ? "east" : ""
  if (!ns) return ew.charAt(0).toUpperCase() + ew.slice(1)
  return ew ? `${ns}-${ew}` : ns
}

/** "2 days ago" style age of a fetch. */
export function age(iso: string, now = Date.now()): string {
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000)
  if (days <= 0) return "today"
  if (days === 1) return "yesterday"
  return `${days} days ago`
}
