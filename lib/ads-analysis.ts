// Google Ads Analysis: the shapes GET /api/ads-analysis/:id returns (backend
// src/modules/ads-analysis/types.ts and adsAnalysis.service.ts), and the few
// helpers the report needs.

export type AnalysisStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED"
export type ModuleKey = "crawl" | "match" | "speed" | "browser" | "technical" | "keywords"
export type ModuleStatus = "ok" | "partial" | "failed" | "skipped"
export type TagStatus = "detected" | "not_found" | "cannot_confirm"
export type ScoreKey = "landing" | "tracking" | "speed" | "keywords" | "budget" | "technical"
export type Priority = "critical" | "high" | "medium" | "low"
export type Band = "ready" | "needs_work" | "not_ready"

export interface ServiceMatch {
  name: string
  url: string | null
  confidence: number
  status: "found" | "weak" | "missing"
  reason: string
  source: "user" | "ai" | "keywords"
  suggestion?: { slug: string; title: string; h1: string }
}

export interface Fold {
  phone: boolean
  form: boolean
  whatsapp: boolean
  cta: "strong" | "weak" | "none"
}

export interface PageCheck {
  url: string
  role: "home" | "service"
  services: string[]
  status: number | null
  psi?: { score: number; lcpMs: number; cls: number; tbtMs: number; field?: { lcpMs?: number; inpMs?: number; cls?: number } }
  fold?: { mobile: Fold; desktop: Fold }
  layout?: { horizontalScroll: boolean; smallText: number; smallTapTargets: number }
  forms?: { count: number; withHandler: number; requiredFields: number; captcha: boolean }
}

export interface Tracking {
  ga4: TagStatus
  gtm: TagStatus
  adsTag: TagStatus
  adsConversion: TagStatus
  metaPixel: TagStatus
  callTracking: TagStatus
  utmLinks: TagStatus
  clickEvents: "cannot_confirm"
  ids: { ga4: string[]; gtm: string[]; ads: string[]; callTracking: string[] }
}

export interface Technical {
  ssl: { valid: boolean; expiresAt: string | null; daysLeft: number | null; error?: string } | null
  httpsRedirect: boolean | null
  mixedContent: number | null
  brokenLinks: { url: string; status: number | null; on: string }[]
  linksChecked: number
}

export interface KeywordRow {
  term: string
  volume: number | null
  cpc: number | null
  competition: number | null
}

export interface AdGroup {
  service: string
  landingUrl: string | null
  keywords: KeywordRow[]
}

export interface AdsResult {
  scannedAt: string
  site: { finalOrigin: string; pagesFound: number }
  modules: Partial<Record<ModuleKey, { status: ModuleStatus; detail?: string }>>
  services: ServiceMatch[]
  pages: PageCheck[]
  tracking: Tracking | null
  technical: Technical | null
  keywords: { groups: AdGroup[]; negatives: string[]; campaignTypes: string[] } | null
  quickWins: {
    ranking: { keyword: string; position: number; url: string | null }[]
    gbp: { name: string; rating: number | null; reviews: number | null; claimed: boolean | null } | null
    extensions: string[]
  }
}

export interface Range {
  low: number
  expected: number
  high: number
}

export interface Forecast {
  avgCpc: number
  budget: number
  suggested: boolean
  convRate: number
  clicks: Range
  leads: Range
  costPerLead: Range
  breakevenJobs: number | null
}

export interface Issue {
  priority: Priority
  module: ScoreKey
  title: string
  where: string
  impact: string
  fix: string
}

export interface Assumptions {
  budgetUsd: number | null
  jobValueUsd: number | null
  convRate: number
}

export interface AdsAnalysisResponse {
  analysis: {
    id: string
    origin: string
    locationLabel: string
    services: string[]
    status: AnalysisStatus
    error: string | null
    progress: { step: ModuleKey | "score"; modules: Partial<Record<ModuleKey, ModuleStatus>> } | null
    score: number | null
    createdAt: string
    finishedAt: string | null
    shareToken?: string | null
    /** Owner only: the location picker value and chosen pages, for Run again. */
    location?: string
    servicePages?: Record<string, string> | null
  }
  assumptions: Assumptions
  convRateRange: { default: number; min: number; max: number }
  result: AdsResult | null
  forecast: Forecast | null
  scorecard: { overall: number | null; band: Band | null; modules: Record<ScoreKey, number | null>; issues: Issue[] } | null
}

export interface AnalysisListItem {
  id: string
  origin: string
  locationLabel: string
  services: string[]
  status: AnalysisStatus
  error: string | null
  score: number | null
  createdAt: string
}

export const isRunning = (s: AnalysisStatus) => s === "QUEUED" || s === "RUNNING"

export const BAND_LABEL: Record<Band, string> = { ready: "Ready for ads", needs_work: "Needs work", not_ready: "Not ready yet" }

export const SCORE_LABEL: Record<ScoreKey, string> = {
  landing: "Landing pages",
  tracking: "Tracking",
  speed: "Speed & mobile",
  keywords: "Keywords",
  budget: "Budget",
  technical: "Technical",
}

export const WEIGHTS: Record<ScoreKey, number> = { landing: 25, tracking: 25, speed: 20, keywords: 15, budget: 10, technical: 5 }

export const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

export const pathOf = (url: string) => {
  try {
    const u = new URL(url)
    return u.pathname === "/" ? "Homepage" : u.pathname
  } catch {
    return url
  }
}

export const money = (n: number, digits = 0) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits })

export const range = (r: Range, fmt: (n: number) => string = String) => (r.low === r.high ? fmt(r.expected) : `${fmt(r.low)}–${fmt(r.high)}`)
