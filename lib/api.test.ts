import { describe, it, expect } from "vitest"
import { apiErrorMessage } from "./api"

// The backend's error body is { error: { code, message } }; reading
// `body.error` straight into an Error showed users "[object Object]".
describe("apiErrorMessage", () => {
  it("reads the message out of the error envelope", () => {
    expect(apiErrorMessage({ error: { code: "insufficient_credits", message: "Not enough credits" } }, "x")).toBe("Not enough credits")
  })
  it("still accepts a legacy plain-string error", () => {
    expect(apiErrorMessage({ error: "Chat budget exhausted" }, "x")).toBe("Chat budget exhausted")
  })
  it("falls back when there is no usable message", () => {
    expect(apiErrorMessage({ error: { code: "ai_unavailable" } }, "Failed")).toBe("Failed")
    expect(apiErrorMessage(null, "Failed")).toBe("Failed")
  })
})
