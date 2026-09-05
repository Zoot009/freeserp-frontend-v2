import { describe, expect, it } from "vitest"
import { quoteCredits, type CreditRateCard } from "./credits"

/**
 * The quoted price and the charged price come from the same rate row, so they
 * must agree. They did not: /api/credits/rates omitted `baseCredits`, and this
 * function ignored it, so every maps grid scan was quoted one credit less than
 * it charged. These cases are lifted from the notes on the maps.scan.point
 * rate in the backend's credits/catalog.ts.
 */
const card = (over: Partial<CreditRateCard["actions"][number]> = {}): CreditRateCard => ({
  actions: [
    { action: "maps.scan.point", variant: null, credits: 1, unitSize: 8, unitLabel: "grid point", baseCredits: 1, ...over },
  ],
  plans: [],
  packages: [],
  freeMonthly: 0,
})

describe("quoteCredits", () => {
  it.each([
    [9, 3],
    [25, 5],
    [49, 8],
    [121, 17],
    [441, 57],
  ])("quotes a %i-point grid scan at %i credits", (points, credits) => {
    expect(quoteCredits(card(), "maps.scan.point", points)).toBe(credits)
  })

  it("still works against an API build that omits baseCredits", () => {
    // Older servers don't send the field; the quote should degrade to the
    // per-unit price rather than throwing or reading NaN.
    const legacy = card()
    delete legacy.actions[0]!.baseCredits
    expect(quoteCredits(legacy, "maps.scan.point", 49)).toBe(7)
  })

  it("treats a zero per-unit rate with a base charge as still costing money", () => {
    expect(quoteCredits(card({ credits: 0 }), "maps.scan.point", 49)).toBe(1)
  })

  it("returns 0 only when there is no per-unit and no base component", () => {
    expect(quoteCredits(card({ credits: 0, baseCredits: 0 }), "maps.scan.point", 49)).toBe(0)
  })

  it("returns null for an action the rate card doesn't price", () => {
    expect(quoteCredits(card(), "not.an.action", 1)).toBeNull()
    expect(quoteCredits(null, "maps.scan.point", 1)).toBeNull()
  })
})
