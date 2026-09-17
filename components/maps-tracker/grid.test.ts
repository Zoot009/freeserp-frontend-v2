import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  ATRP_PENALTY,
  DIFFICULTY_ENTRENCHMENT_HIGH,
  DIFFICULTY_REVIEWS_HIGH,
  RANK_BANDS,
  bandKeyFor,
  computeAreaDifficulty,
  computeMetrics,
  computeVisibility,
  estimateScanSeconds,
  formatDistance,
  pointOffsetMeters,
  rankColor,
  validateArea,
  type DifficultyPoint,
} from "./grid"

// These three definitions are the whole feature's vocabulary and the redesign
// brief says they must not drift. They had no test before.
describe("computeMetrics", () => {
  it("averages only the points where the business was found, for ARP", () => {
    // Found at 2 and 6; two points not found at all.
    const m = computeMetrics([{ rank: 2 }, { rank: 6 }, { rank: null }, { rank: null }])
    expect(m.arp).toBe(4) // (2 + 6) / 2 — the nulls are not zeros
  })

  it("counts a not-found point as 21 for ATRP", () => {
    const m = computeMetrics([{ rank: 2 }, { rank: 6 }, { rank: null }, { rank: null }])
    expect(m.atrp).toBe(12.5) // (2 + 6 + 21 + 21) / 4
  })

  it("reports SoLV as the share of points ranking 1-3", () => {
    const m = computeMetrics([{ rank: 1 }, { rank: 3 }, { rank: 4 }, { rank: null }])
    expect(m.solv).toBe(50)
  })

  it("gives ARP as null rather than 0 when nothing was found anywhere", () => {
    // A business that ranks nowhere must not read as "average rank 0", which
    // would render as the best possible result.
    const m = computeMetrics([{ rank: null }, { rank: null }])
    expect(m.arp).toBeNull()
    expect(m.atrp).toBe(21)
    expect(m.solv).toBe(0)
  })

  it("tracks best and worst across found points only", () => {
    const m = computeMetrics([{ rank: 9 }, { rank: 2 }, { rank: null }])
    expect(m.bestRank).toBe(2)
    expect(m.worstRank).toBe(9)
    expect(m.foundPoints).toBe(2)
    expect(m.scoredPoints).toBe(3)
  })
})

describe("rank bands", () => {
  it("paints every band with the colour rankColor gives that rank", () => {
    // The single-scale rule: bands, pins and the report legend must agree.
    const sample: Record<string, number | null> = {
      top3: 2, r4_7: 5, r8_10: 9, r11_15: 13, r16_20: 18, none: null,
    }
    for (const band of RANK_BANDS) {
      expect(band.color).toBe(rankColor(sample[band.key] ?? null, "SUCCEEDED").bg)
    }
  })

  it("puts each rank in exactly one band", () => {
    for (const rank of [1, 2, 3, 4, 7, 8, 10, 11, 15, 16, 20, null]) {
      expect(RANK_BANDS.filter((b) => b.test(rank))).toHaveLength(1)
    }
  })

  it("bands a successful point but not a failed or pending one", () => {
    expect(bandKeyFor(2, "SUCCEEDED")).toBe("top3")
    expect(bandKeyFor(null, "SUCCEEDED")).toBe("none")
    // A point whose search never ran is not evidence of absence.
    expect(bandKeyFor(null, "FAILED")).toBeNull()
    expect(bandKeyFor(null, "PENDING")).toBeNull()
  })
})

describe("validateArea", () => {
  it("accepts an ordinary grid", () => {
    expect(validateArea(7, 1.5, "IMPERIAL", 3)).toBeNull()
  })

  it("refuses points packed closer than the server's 50m minimum", () => {
    // 21x21 over 0.1 mi is ~16m between points.
    expect(validateArea(21, 0.1, "IMPERIAL", 1)).toMatch(/50m minimum/)
  })

  it("refuses more searches than the server's 900 limit", () => {
    // 21x21 across 3 keywords is 1323 searches.
    expect(validateArea(21, 5, "IMPERIAL", 3)).toMatch(/above the 900 limit/)
  })
})

describe("estimateScanSeconds", () => {
  // Mirrors scans.service.ts: ceil(points / 8) * (points <= 25 ? 8 : 12).
  it.each([
    [9, 16],
    [25, 32],
    [49, 84],
    [121, 192],
    [441, 672],
  ])("estimates %i points at %i seconds", (points, seconds) => {
    expect(estimateScanSeconds(points)).toBe(seconds)
  })
})

describe("pointOffsetMeters", () => {
  it("calls the middle of the grid the centre", () => {
    expect(pointOffsetMeters(3, 3, 7, 400)).toEqual({ distanceMeters: 0, bearing: "centre" })
  })

  it("reads row 0 as north and the last column as east", () => {
    expect(pointOffsetMeters(0, 3, 7, 400)).toEqual({ distanceMeters: 1200, bearing: "N" })
    expect(pointOffsetMeters(3, 6, 7, 400)).toEqual({ distanceMeters: 1200, bearing: "E" })
    expect(pointOffsetMeters(6, 0, 7, 400).bearing).toBe("SW")
  })
})

describe("formatDistance", () => {
  it("switches to feet and metres under the point where decimals stop helping", () => {
    expect(formatDistance(1609, "IMPERIAL")).toBe("1.00 mi")
    expect(formatDistance(100, "IMPERIAL")).toBe("328 ft")
    expect(formatDistance(680, "METRIC")).toBe("680 m")
    expect(formatDistance(2400, "METRIC")).toBe("2.40 km")
    expect(formatDistance(null, "IMPERIAL")).toBe("—")
  })
})

// ── Position Map additions ────────────────────────────────────────────────

describe("computeVisibility", () => {
  it("reads 100 when the business ranks 1 at every point", () => {
    // ATRP of exactly 1 is rank 1 everywhere.
    expect(computeVisibility(1)).toBe(100)
  })

  it("reads 0 when the business was found nowhere", () => {
    // Not found at every point scores ATRP_PENALTY, by ATRP's own definition.
    expect(computeVisibility(ATRP_PENALTY)).toBe(0)
  })

  it("passes null through rather than inventing a zero", () => {
    // No scored points at all is not the same as no visibility.
    expect(computeVisibility(null)).toBeNull()
  })

  it("stays a linear rescaling of ATRP, so the midpoint is 50", () => {
    expect(computeVisibility(11)).toBe(50)
  })

  it("never disagrees with ATRP about which of two scans is better", () => {
    const worse = computeVisibility(14)!
    const better = computeVisibility(6)!
    expect(better).toBeGreaterThan(worse)
  })

  it("clamps rather than returning a number outside 0-100", () => {
    expect(computeVisibility(0)).toBe(100)
    expect(computeVisibility(99)).toBe(0)
  })
})

describe("computeAreaDifficulty", () => {
  /** n points whose #1 is `leader`, each carrying one top-3 rival at `reviews`. */
  function grid(opts: {
    points: number
    leaderShare: number
    reviews: number
  }): DifficultyPoint[] {
    const { points, leaderShare, reviews } = opts
    const leaderPoints = Math.round(points * leaderShare)
    return Array.from({ length: points }, (_, i) => ({
      results: [
        { key: i < leaderPoints ? "incumbent" : `rotating-${i}`, rankAbsolute: 1, reviewCount: reviews },
        { key: `rival-${i % 3}`, rankAbsolute: 2, reviewCount: reviews },
      ],
    }))
  }

  it("calls a grid HIGH when one incumbent owns it and the top 3 are review-heavy", () => {
    expect(computeAreaDifficulty(grid({ points: 20, leaderShare: 0.9, reviews: 400 }))).toBe("HIGH")
  })

  it("calls a grid LOW when no single business owns the top spot", () => {
    // Every point has a different #1 — entrenchment well under the low band.
    expect(computeAreaDifficulty(grid({ points: 20, leaderShare: 0, reviews: 400 }))).toBe("LOW")
  })

  it("calls a grid LOW when the incumbents have barely any reviews", () => {
    // Entrenched, but nobody has authority — winnable.
    expect(computeAreaDifficulty(grid({ points: 20, leaderShare: 1, reviews: 10 }))).toBe("LOW")
  })

  it("calls a grid MEDIUM between the two bands", () => {
    // Entrenched enough to miss LOW, reviews too thin for HIGH.
    expect(computeAreaDifficulty(grid({ points: 20, leaderShare: 0.5, reviews: 100 }))).toBe("MEDIUM")
  })

  it("returns null rather than a guess when the scan carries no review counts", () => {
    // Every scan created before the mapper started storing reviewCount.
    const historical: DifficultyPoint[] = Array.from({ length: 10 }, () => ({
      results: [{ key: "incumbent", rankAbsolute: 1, reviewCount: null }],
    }))
    expect(computeAreaDifficulty(historical)).toBeNull()
  })

  it("returns null when there are no results to read at all", () => {
    expect(computeAreaDifficulty([])).toBeNull()
    expect(computeAreaDifficulty([{ results: null }, { results: [] }])).toBeNull()
  })

  it("ignores review counts from businesses outside the top 3", () => {
    // A rank-9 business with 5000 reviews says nothing about how hard the
    // local pack is to enter, so it must not drag the median up.
    const points: DifficultyPoint[] = Array.from({ length: 10 }, () => ({
      results: [
        { key: "incumbent", rankAbsolute: 1, reviewCount: 10 },
        { key: "far-down", rankAbsolute: 9, reviewCount: 5000 },
      ],
    }))
    expect(computeAreaDifficulty(points)).toBe("LOW")
  })

  it("holds its thresholds where the named constants say they are", () => {
    // Guards against a retune silently moving a band without the test noticing.
    expect(DIFFICULTY_ENTRENCHMENT_HIGH).toBe(0.6)
    expect(DIFFICULTY_REVIEWS_HIGH).toBe(200)
  })
})

// ── Shared-block drift guard ──────────────────────────────────────────────
// grid.ts is deliberately duplicated across the two packages (see the header
// of the module). The redesign brief adds two functions that MUST mean the
// same thing on both sides, so this compares the marked block in each copy.
//
// It compares normalised text, not bytes: the two packages have different
// house style (semicolons, quote characters), and forcing one file into the
// other's style to satisfy a byte comparison would be the test dictating the
// codebase rather than the other way round. Normalising those away still
// catches every change that alters what the code DOES.

describe("grid.ts shared block", () => {
  const START = "SHARED BLOCK START"
  const END = "SHARED BLOCK END"

  function sharedBlock(file: string): string {
    const src = readFileSync(file, "utf8")
    const from = src.indexOf(START)
    const to = src.indexOf(END)
    expect(from, `${file} is missing its ${START} marker`).toBeGreaterThan(-1)
    expect(to, `${file} is missing its ${END} marker`).toBeGreaterThan(from)
    // Start at the newline after the marker so the marker's own box-drawing
    // tail never lands in the compared text (it would make a failure diff
    // open with a row of dashes instead of the code that differs).
    const blockStart = src.indexOf("\n", from) + 1
    const blockEnd = src.lastIndexOf("\n", to)
    return src
      .slice(blockStart, blockEnd)
      .replace(/["']/g, '"') // quote style
      .replace(/;\s*$/gm, "") // semicolons
      .replace(/^\s*\/\/.*$/gm, "") // comments, including the box drawing
      .replace(/\s+/g, " ")
      .trim()
  }

  it("says the same thing in both packages", () => {
    const here = path.resolve(__dirname, "grid.ts")
    const backend = path.resolve(__dirname, "../../../freeserp-backend-v2/src/modules/maps-tracker/grid.ts")
    expect(sharedBlock(here)).toBe(sharedBlock(backend))
  })
})
