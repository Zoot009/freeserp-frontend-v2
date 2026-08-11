// Client-side port of the backend's geo-grid math
// (freeserp-backend-v2/src/modules/maps-tracker/grid.ts) — duplicated
// deliberately, matching this app's existing convention of not sharing types
// between frontend/backend. This is what lets the grid preview render
// instantly, before the scan ever hits the API (the pins the user sees while
// choosing a radius/grid size).

export const SCAN_DEPTH = 20
export const ATRP_PENALTY = 21
export const SOLV_THRESHOLD = 3

export const MILES_TO_METERS = 1609.344
export const KM_TO_METERS = 1000
const EARTH_METERS_PER_DEG_LAT = 111_320

export type DistanceUnit = "IMPERIAL" | "METRIC"

export function toMeters(value: number, unit: DistanceUnit): number {
  return Math.round(value * (unit === "IMPERIAL" ? MILES_TO_METERS : KM_TO_METERS))
}

function round(v: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.round(v * f) / f
}

export interface GridPoint {
  row: number
  col: number
  lat: number
  lng: number
  index: number
  isCenter: boolean
  distanceFromCenterMeters: number
}

export function clampLat(lat: number): number {
  return Math.max(-85, Math.min(85, lat))
}

export function wrapLng(lng: number): number {
  return ((lng + 540) % 360) - 180
}

export function deriveSpacingMeters(gridSize: number, radiusMeters: number): number {
  const halfSteps = (gridSize - 1) / 2
  return Math.round(radiusMeters / (halfSteps || 1))
}

export function generateGrid(centerLat: number, centerLng: number, gridSize: number, radiusMeters: number): GridPoint[] {
  if (gridSize % 2 === 0) throw new Error("gridSize must be odd")
  if (radiusMeters <= 0) return []

  const halfSteps = (gridSize - 1) / 2
  const spacing = radiusMeters / (halfSteps || 1)
  const points: GridPoint[] = []

  for (let row = 0; row < gridSize; row++) {
    const northOffset = (halfSteps - row) * spacing
    let lat = centerLat + northOffset / EARTH_METERS_PER_DEG_LAT
    lat = clampLat(lat)
    const metersPerDegLng = EARTH_METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180)

    for (let col = 0; col < gridSize; col++) {
      const eastOffset = (col - halfSteps) * spacing
      const lng = wrapLng(centerLng + eastOffset / metersPerDegLng)
      points.push({
        row,
        col,
        lat: round(lat, 7),
        lng: round(lng, 7),
        index: row * gridSize + col,
        isCenter: row === halfSteps && col === halfSteps,
        distanceFromCenterMeters: Math.round(Math.hypot(northOffset, eastOffset)),
      })
    }
  }
  return points
}

export const GRID_SIZES = [3, 5, 7, 9, 11, 13, 15, 17, 21] as const
export const RECOMMENDED_GRID_SIZE = 11

export function totalPoints(gridSize: number, keywordCount: number): number {
  return gridSize * gridSize * Math.max(1, keywordCount)
}

// Graduated radius scale (spec §10.7) — fine steps where precision matters,
// coarse where it doesn't. Values are in the CURRENT unit; the caller renders
// "{v} mi"/"{v} km" and re-picks the nearest step when the unit toggles.
export const RADIUS_STEPS: Record<DistanceUnit, number[]> = {
  IMPERIAL: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.5, 2, 3, 4, 5, 7.5, 10, 15, 20, 25, 50, 100],
  METRIC: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.5, 2, 3, 5, 7.5, 10, 15, 25, 50, 100, 150],
}

export function nearestRadiusStep(value: number, unit: DistanceUnit): number {
  const steps = RADIUS_STEPS[unit]
  return steps.reduce((best, s) => (Math.abs(s - value) < Math.abs(best - value) ? s : best), steps[0]!)
}

// ── Metrics (mirrors backend computeMetrics exactly) ──

export interface ScoredPoint {
  rank: number | null
}

export interface ScanMetrics {
  arp: number | null
  atrp: number | null
  solv: number | null
  foundPoints: number
  scoredPoints: number
  bestRank: number | null
  worstRank: number | null
}

export function computeMetrics(points: ScoredPoint[]): ScanMetrics {
  const found = points.filter((p) => p.rank !== null)
  const arp = found.length ? found.reduce((s, p) => s + (p.rank as number), 0) / found.length : null
  const atrp = points.length ? points.reduce((s, p) => s + (p.rank ?? ATRP_PENALTY), 0) / points.length : null
  const solv = points.length
    ? (points.filter((p) => p.rank !== null && (p.rank as number) <= SOLV_THRESHOLD).length / points.length) * 100
    : null
  return {
    arp: arp === null ? null : round(arp, 2),
    atrp: atrp === null ? null : round(atrp, 2),
    solv: solv === null ? null : round(solv, 2),
    foundPoints: found.length,
    scoredPoints: points.length,
    bestRank: found.length ? Math.min(...found.map((p) => p.rank as number)) : null,
    worstRank: found.length ? Math.max(...found.map((p) => p.rank as number)) : null,
  }
}

// ── Rank color scale — shared by the map, the distribution bar, and the point drawer ──

export type PointStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED"

export interface RankColor {
  bg: string
  fg: string
  label: string
}

export function rankColor(rank: number | null, status: PointStatus): RankColor {
  if (status === "FAILED") return { bg: "#6B7280", fg: "#FFFFFF", label: "!" }
  if (status === "PENDING" || status === "RUNNING") return { bg: "#9CA3AF", fg: "#FFFFFF", label: "" }
  if (rank === null) return { bg: "#7F1D1D", fg: "#FFFFFF", label: "20+" }
  if (rank <= 3) return { bg: "#16A34A", fg: "#FFFFFF", label: `${rank}` }
  if (rank <= 7) return { bg: "#84CC16", fg: "#1A2E05", label: `${rank}` }
  if (rank <= 10) return { bg: "#EAB308", fg: "#422006", label: `${rank}` }
  if (rank <= 15) return { bg: "#F97316", fg: "#FFFFFF", label: `${rank}` }
  return { bg: "#DC2626", fg: "#FFFFFF", label: `${rank}` }
}
