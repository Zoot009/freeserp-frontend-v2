import { describe, expect, it } from "vitest"
import { readableReason } from "./run-state-cell"

describe("readableReason", () => {
  it("drops the API path so the status code leads", () => {
    expect(
      readableReason("/v3/ai_optimization/chat_gpt/llm_responses/live: 40501 Invalid Field: 'location_code'"),
    ).toBe("40501 Invalid Field: 'location_code'")
  })

  it("splits on the FIRST ': ' only, keeping the rest of the message intact", () => {
    expect(readableReason("/v3/a/b: 40501 Invalid Field: 'x'")).toBe("40501 Invalid Field: 'x'")
  })

  // The guard: without it, this loses the half that matters.
  it("leaves a reason alone when the prefix is not a path", () => {
    expect(readableReason("Timed out: after 30s")).toBe("Timed out: after 30s")
  })

  it("leaves a reason with no separator alone", () => {
    expect(readableReason("All samples failed")).toBe("All samples failed")
  })

  it("falls back to the full string rather than rendering an empty cell", () => {
    expect(readableReason("/v3/a/b: ")).toBe("/v3/a/b: ")
    expect(readableReason("/v3/a/b:   ")).toBe("/v3/a/b:   ")
  })
})
