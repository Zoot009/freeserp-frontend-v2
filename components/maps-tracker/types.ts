// Response shapes mirrored 1:1 from the backend (no shared types package —
// see freeserp-backend-v2/src/modules/maps-tracker/*), same convention as
// serp-checker's CheckResponse/HistoryItem/CheckRow.

export type DistanceUnit = "IMPERIAL" | "METRIC"
export type ScanStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED" | "CANCELLED"
export type KeywordStatus = "PENDING" | "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED"
export type PointStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED"
export type MatchConfidence = "PLACE_ID" | "CID" | "FUZZY"
export type AiReportStatus = "PENDING" | "GENERATING" | "COMPLETED" | "FAILED"

export interface MapLocation {
  id: string
  name: string
  address: string
  placeId: string
  cid: string | null
  latitude: number
  longitude: number
  primaryCategory: string | null
  phone: string | null
  website: string | null
  rating: number | null
  reviewCount: number | null
  createdAt: string
}

export interface ScanPointSummary {
  id: string
  row: number
  col: number
  latitude: number
  longitude: number
  status: PointStatus
  rank: number | null
  matchConfidence: MatchConfidence | null
}

export interface ScanKeyword {
  id: string
  keyword: string
  normalizedKeyword: string
  status: KeywordStatus
  arp: number | null
  atrp: number | null
  solv: number | null
  foundPoints: number
  scoredPoints: number
  failedPoints: number
  bestRank: number | null
  worstRank: number | null
  points: ScanPointSummary[]
}

export interface AiReportContent {
  summary: string
  visibilityShape: string
  strengths: Array<{ title: string; detail: string }>
  weaknesses: Array<{ title: string; detail: string }>
  competitors: Array<{ name: string; insight: string; outrankedAtPoints: number }>
  recommendations: Array<{
    title: string
    detail: string
    priority: "HIGH" | "MEDIUM" | "LOW"
    effort: "LOW" | "MEDIUM" | "HIGH"
    evidence: string
  }>
  confidence: "HIGH" | "MEDIUM" | "LOW"
  confidenceReason: string
}

export interface AiReport {
  status: AiReportStatus
  content: AiReportContent | null
  errorMessage: string | null
}

export interface Scan {
  id: string
  status: ScanStatus
  location: { id: string; name: string; address: string; latitude: number; longitude: number }
  centerLat: number
  centerLng: number
  gridSize: number
  radiusMeters: number
  spacingMeters: number
  displayUnit: DistanceUnit
  zoom: number
  totalKeywords: number
  totalPoints: number
  pointsDone: number
  aiAnalysisRequested: boolean
  keywords: ScanKeyword[]
  aiReport: AiReport | null
  errorMessage: string | null
  createdAt: string
  completedAt: string | null
}

export interface ScanHistoryPoint {
  row: number
  col: number
  status: PointStatus
  rank: number | null
}

export interface ScanHistoryKeyword {
  id: string
  keyword: string
  status: KeywordStatus
  arp: number | null
  atrp: number | null
  solv: number | null
  scoredPoints: number
  points: ScanHistoryPoint[]
}

export interface ScanHistoryItem {
  id: string
  status: ScanStatus
  totalPoints: number
  pointsDone: number
  gridSize: number
  radiusMeters: number
  displayUnit: DistanceUnit
  createdAt: string
  location: { name: string; address: string }
  keywords: ScanHistoryKeyword[]
}

export interface PointDetail {
  id: string
  row: number
  col: number
  latitude: number
  longitude: number
  status: PointStatus
  rank: number | null
  matchConfidence: MatchConfidence | null
  duplicateMatched: boolean
  distanceFromCenterMeters: number
  bearingFromCenter: string
  fetchedAt: string | null
  errorMessage: string | null
  topResults: Array<{
    rankAbsolute: number
    title: string
    placeId: string | null
    address: string | null
    domain: string | null
    rating: number | null
    ratingCount: number | null
    category: string | null
    isAd: boolean
  }> | null
}

export interface CreateScanResponse {
  scanId: string
  status: ScanStatus
  totalPoints: number
  estimatedSeconds: number
}
