import { describe, expect, it } from "vitest"
import { bestOf, contenders, gaps, type Facts } from "@/lib/gbp-audit"

const row = (rank: number, title: string, reviewCount: number, rating: number, isTarget = false) => ({
  rank, title, reviewCount, rating, isTarget, cid: null, placeId: null, category: "Cafe", domain: null, website: null, address: null, imageUrl: null,
})

// You are #2 at your pin; Prairie leads everything, and is top 3 at more grid points.
const facts = {
  business: { name: "Harbor Lane", logo: null, mainImage: null, rating: 4.3, reviewCount: 41, category: "Coffee roasters", website: null },
  visibility: {
    keyword: "coffee", depth: 20, rank: 2,
    results: [row(1, "Prairie", 340, 4.8), row(2, "Harbor Lane", 41, 4.3, true), row(3, "Third Street", 212, 4.7), row(4, "Capitol", 158, 4.6), row(5, "Old Mill", 61, 4.4)],
  },
  grid: {
    metrics: { scoredPoints: 9, top3Points: 1 },
    points: [
      { status: "SUCCEEDED", top: [{ rank: 1, title: "Prairie", isTarget: false }, { rank: 2, title: "Harbor Lane", isTarget: true }] },
      { status: "SUCCEEDED", top: [{ rank: 1, title: "Prairie", isTarget: false }, { rank: 4, title: "Capitol", isTarget: false }] },
      { status: "FAILED", top: [{ rank: 1, title: "Prairie", isTarget: false }] },
    ],
  },
} as unknown as Facts

describe("you vs your top 3", () => {
  it("takes the three nearest rivals, and counts their top-3 reach on the grid", () => {
    const { you, rivals, scored } = contenders(facts)
    expect(you).toMatchObject({ name: "Harbor Lane", you: true, rank: 2, top3: 1 })
    expect(rivals.map((r) => r.name)).toEqual(["Prairie", "Third Street", "Capitol"])
    // A failed point doesn't count, and rank 4 isn't top 3.
    expect(rivals.map((r) => r.top3)).toEqual([2, 0, 0])
    expect(scored).toBe(9)
  })

  it("names where the rivals are ahead, in plain words", () => {
    const { you, rivals, scored } = contenders(facts)
    expect(gaps(you, rivals, scored)).toEqual([
      "Prairie has 8.3× your reviews (340 vs 41).",
      "Prairie is rated higher (4.8★ vs your 4.3★).",
      "Prairie is in the top 3 at 2 of 9 grid points; you are at 1.",
    ])
  })

  it("marks the best value, lowest for rank", () => {
    expect(bestOf([2, 1, 3], true)).toBe(1)
    expect(bestOf([41, 340, null])).toBe(340)
    expect(bestOf([41, null])).toBeNull()
  })
})
