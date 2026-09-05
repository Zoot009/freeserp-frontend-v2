import { describe, expect, it } from "vitest"
import {
  RANK_BANDS,
  bandKeyFor,
  computeMetrics,
  estimateScanSeconds,
  formatDistance,
  pointOffsetMeters,
  rankColor,
  validateArea,
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
