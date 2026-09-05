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

// ── Rank bands ────────────────────────────────────────────────────────────
// The distribution card, the map's band highlight and the report legend all
// read from this one list, and every colour in it comes back out of
// rankColor() rather than being retyped — so a band can never be painted a
// different green from the pins it claims to describe.

export type RankBandKey = "top3" | "r4_7" | "r8_10" | "r11_15" | "r16_20" | "none"

export interface RankBand {
  key: RankBandKey
  label: string
  color: string
  /** Representative rank, only used to pull the band's colour out of rankColor. */
  test: (rank: number | null) => boolean
}

export const RANK_BANDS: RankBand[] = [
  { key: "top3", label: "Top 3", color: rankColor(1, "SUCCEEDED").bg, test: (r) => r != null && r <= 3 },
  { key: "r4_7", label: "4–7", color: rankColor(5, "SUCCEEDED").bg, test: (r) => r != null && r > 3 && r <= 7 },
  { key: "r8_10", label: "8–10", color: rankColor(9, "SUCCEEDED").bg, test: (r) => r != null && r > 7 && r <= 10 },
  { key: "r11_15", label: "11–15", color: rankColor(13, "SUCCEEDED").bg, test: (r) => r != null && r > 10 && r <= 15 },
  { key: "r16_20", label: "16–20", color: rankColor(18, "SUCCEEDED").bg, test: (r) => r != null && r > 15 },
  { key: "none", label: "Not found", color: rankColor(null, "SUCCEEDED").bg, test: (r) => r == null },
]

/**
 * Which band a point belongs to, or null if it isn't in any of them.
 *
 * Only SUCCEEDED points are banded. A FAILED point has no rank because the
 * search never ran, which is a different thing from "searched, and you weren't
 * there" — counting it as Not found would overstate how invisible a business
 * is, using the tool's own error as evidence against the user.
 */
export function bandKeyFor(rank: number | null, status: PointStatus): RankBandKey | null {
  if (status !== "SUCCEEDED") return null
  return RANK_BANDS.find((b) => b.test(rank))?.key ?? null
}

// ── Pre-flight validation ─────────────────────────────────────────────────
// Mirrors the two 400s in the backend's scans.service.ts, so an impossible
// scan is refused by a disabled button with a reason rather than by a failed
// request after the click. Both limits are env-tunable server-side
// (MAPS_SCAN_MIN_SPACING_METERS / MAPS_SCAN_MAX_POINTS); these are the
// defaults, and the server stays the authority either way.

export const MIN_SPACING_METERS = 50
export const MAX_SCAN_POINTS = 900

/** Null when the area is scannable, otherwise the reason it isn't. */
export function validateArea(
  gridSize: number,
  radius: number,
  unit: DistanceUnit,
  keywordCount: number,
): string | null {
  const spacing = deriveSpacingMeters(gridSize, toMeters(radius, unit))
  if (spacing < MIN_SPACING_METERS) {
    return `Points would be ${spacing}m apart, closer than the ${MIN_SPACING_METERS}m minimum. Widen the radius or use a smaller grid.`
  }
  const points = totalPoints(gridSize, keywordCount)
  if (points > MAX_SCAN_POINTS) {
    return `That's ${points} searches, above the ${MAX_SCAN_POINTS} limit. Use a smaller grid or fewer keywords.`
  }
  return null
}

// ── Timing ────────────────────────────────────────────────────────────────

/** Points fetched in parallel — MAPS_SCAN_POINT_CONCURRENCY on the server. */
const POINT_CONCURRENCY = 8

/**
 * Mirrors the estimate in the backend's scans.service.ts. Only used before a
 * scan starts: once it does, the real `estimatedSeconds` comes back on the 202
 * and is authoritative.
 */
export function estimateScanSeconds(points: number): number {
  const waves = Math.ceil(Math.max(0, points) / POINT_CONCURRENCY)
  return waves * (points <= 25 ? 8 : 12)
}

/** "about 4 minutes" / "about 30 seconds" — deliberately vague, it's an estimate. */
export function formatDuration(seconds: number): string {
  if (seconds < 90) return `about ${Math.max(10, Math.round(seconds / 10) * 10)} seconds`
  const minutes = Math.round(seconds / 60)
  return `about ${minutes} minute${minutes === 1 ? "" : "s"}`
}

// ── Point geometry ────────────────────────────────────────────────────────

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const

/**
 * How far a grid point sits from the centre, and in which direction.
 *
 * Derived from row/col and the spacing the grid was built with rather than
 * from a haversine over the stored coordinates — that's exactly how the
 * backend laid the grid out in the first place, so it agrees by construction
 * and works for preview points that have no coordinates yet.
 */
export function pointOffsetMeters(
  row: number,
  col: number,
  gridSize: number,
  spacingMeters: number,
): { distanceMeters: number; bearing: string } {
  const half = (gridSize - 1) / 2
  const east = (col - half) * spacingMeters
  const north = (half - row) * spacingMeters
  if (east === 0 && north === 0) return { distanceMeters: 0, bearing: "centre" }
  const deg = (Math.atan2(east, north) * 180) / Math.PI
  return {
    distanceMeters: Math.round(Math.hypot(east, north)),
    bearing: COMPASS[Math.round(((deg + 360) % 360) / 45) % 8]!,
  }
}

/** "0.42 mi" / "680 m" — short form, for pin titles and drawer facts. */
export function formatDistance(meters: number | null, unit: DistanceUnit): string {
  if (meters == null) return "—"
  if (unit === "METRIC") {
    return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / KM_TO_METERS).toFixed(2)} km`
  }
  const miles = meters / MILES_TO_METERS
  return miles < 0.1 ? `${Math.round(meters * 3.28084)} ft` : `${miles.toFixed(2)} mi`
}
