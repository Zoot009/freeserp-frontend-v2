import { describe, expect, it } from "vitest"
import { freeAddedNote } from "./billing-config"

describe("freeAddedNote", () => {
  it("says how many are checked now and what the rest wait for", () => {
    expect(freeAddedNote(15, 10)).toBe(
      "Added 15 keywords — 10 are being checked now. Check the rest tomorrow when your checks reset, or upgrade to check them all.",
    )
  })

  it("says when none of them can be checked today", () => {
    expect(freeAddedNote(3, 0)).toMatch(/^Added 3 keywords\. Today's free checks are used/)
  })

  it("stays out of the way when everything fits, or the plan has no daily ceiling", () => {
    expect(freeAddedNote(4, 10)).toBeNull()
    expect(freeAddedNote(10, 10)).toBeNull()
    expect(freeAddedNote(50, null)).toBeNull()
  })
})
