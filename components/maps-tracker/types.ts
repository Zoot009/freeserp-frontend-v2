// Response shapes mirrored 1:1 from the backend (no shared types package —
// see freeserp-backend-v2/src/modules/maps-tracker/*), same convention as
// serp-checker's CheckResponse/HistoryItem/CheckRow.

import type { AreaDifficulty } from "./grid"

export type { AreaDifficulty }

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
  /** Linear rescaling of `atrp` — see computeVisibility. Null on scans that settled before the column existed. */
  visibility: number | null
  /** A property of the MARKET, identical for every business in this grid. Null on pre-Position-Map scans. */
  areaDifficulty: AreaDifficulty | null
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
  location: {
    id: string
    name: string
    address: string
    latitude: number
    longitude: number
    rating: number | null
    reviewCount: number | null
    primaryCategory: string | null
  }
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
  visibility: number | null
  areaDifficulty: AreaDifficulty | null
  scoredPoints: number
  points: ScanHistoryPoint[]
}

export interface ScanHistoryItem {
  id: string
  status: ScanStatus
  /** Why a FAILED scan failed. The list endpoint includes the whole scan row,
   *  so this has always been on the wire — it just wasn't declared. */
  errorMessage: string | null
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
    // Added by the Position Map's extended provider mapper. Optional, and
    // absent on every scan that ran before it — every consumer degrades
    // rather than rendering an empty frame.
    cid?: string | null
    imageUrl?: string | null
    website?: string | null
  }> | null
}

export interface CreateScanResponse {
  scanId: string
  status: ScanStatus
  totalPoints: number
  estimatedSeconds: number
}

export interface CompetitorRow {
  key: string
  placeId: string | null
  cid: string | null
  name: string
  address: string | null
  imageUrl: string | null
  website: string | null
  rating: number | null
  reviewCount: number | null
  category: string | null
  isTarget: boolean
  foundPoints: number
  scoredPoints: number
  percentOfResults: number
  arp: number | null
  atrp: number | null
  solv: number | null
  visibility: number | null
  /**
   * Sparse index -> rank over `CompetitorLeaderboard.points`. A missing index
   * is a real not-found, not missing data. This is what "Compare on map"
   * recolours the pins from.
   */
  ranks: Record<number, number>
}

export interface CompetitorLeaderboard {
  /** The index space every row's `ranks` is keyed against — scored points only. */
  points: Array<{ id: string; row: number; col: number }>
  rows: CompetitorRow[]
  areaDifficulty: AreaDifficulty | null
  visibility: number | null
  insights: {
    yourSolv: number | null
    topSolv: number | null
    isMarketLeader: boolean
    yourTop3DistanceMeters: number | null
    marketAverageTop3DistanceMeters: number | null
    totalCompetitors: number
    activeCompetitors: number
  }
}

/** Why a prior run cannot be compared with the one on screen. */
export type IncomparableReason = "GRID_SIZE" | "RADIUS" | "CENTER"

/** One prior run of the same keyword at the same location — the date pill's list. */
export interface ScanHistoryEntry {
  scanId: string
  keywordId: string
  keyword: string
  createdAt: string
  status: ScanStatus
  arp: number | null
  atrp: number | null
  solv: number | null
  visibility: number | null
  areaDifficulty: AreaDifficulty | null
  gridSize: number
  radiusMeters: number
  displayUnit: DistanceUnit
  centerLat: number
  centerLng: number
  comparable: boolean
  incomparableReason: IncomparableReason | null
  isCurrent: boolean
}
