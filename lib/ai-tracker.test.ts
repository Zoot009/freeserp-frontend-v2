import { describe, it, expect } from "vitest"
import {
  deriveRunState,
  isWithinRunWindow,
  nextRunAllowedAt,
  pct,
  runFor,
  isPromptActive,
  SLUG_TO_PLATFORM,
  PLATFORM_SLUG,
  PLATFORMS,
  type PromptRow,
  type RunSummary,
  type Platform,
} from "./ai-tracker"

/**
 * The status vocabulary is the thing this feature got wrong.
 *
 * The old table collapsed four run statuses into three renderings — PENDING and
 * PROCESSING were byte-identical, and a FAILED run showed one red word with no
 * reason. These tests pin each state as distinct, which is the cheapest possible
 * cover for the redesign: no database, no credits, no LLM calls.
 */

const run = (over: Partial<RunSummary> = {}): RunSummary => ({
  id: "r1",
  platform: "chat_gpt",
  status: "COMPLETED",
  mentionRate: 0.66,
  citationRate: 0,
  avgProminence: null,
  change: null,
  samplesRequested: 3,
  samplesCompleted: 3,
  samplesSucceeded: 3,
  errorMessage: null,
  runAt: "2026-08-25T15:48:00.000Z",
  ...over,
})

describe("deriveRunState", () => {
  it("treats a prompt with no run as its own state, not as a zero", () => {
    expect(deriveRunState(undefined)).toEqual({ kind: "none" })
    expect(deriveRunState(null)).toEqual({ kind: "none" })
  })

  it("keeps PENDING and PROCESSING distinct", () => {
    const queued = deriveRunState(run({ status: "PENDING", samplesCompleted: 0 }))
    const running = deriveRunState(run({ status: "PROCESSING", samplesCompleted: 1 }))
    expect(queued.kind).toBe("queued")
    expect(running.kind).toBe("running")
    // The old UI rendered both as "{done}/{of}…" and they were indistinguishable.
    expect(queued.kind).not.toBe(running.kind)
  })

  it("carries sample progress so a running row can show a real bar", () => {
    expect(deriveRunState(run({ status: "PROCESSING", samplesCompleted: 2, samplesRequested: 3 })))
      .toEqual({ kind: "running", done: 2, of: 3 })
  })

  it("surfaces the failure reason instead of a bare red word", () => {
    const s = deriveRunState(run({ status: "FAILED", errorMessage: "Provider timed out" }))
    expect(s).toMatchObject({ kind: "failed", reason: "Provider timed out" })
  })

  it("tolerates a FAILED run with no message", () => {
    expect(deriveRunState(run({ status: "FAILED", errorMessage: null })))
      .toMatchObject({ kind: "failed", reason: null })
  })

  it("reports a partial success on a COMPLETED run", () => {
    // Rates divide by SUCCESSFUL samples, so "3 requested, 1 answered" is a real
    // and materially weaker result than "3 of 3" at the same percentage.
    expect(deriveRunState(run({ status: "COMPLETED", samplesRequested: 3, samplesSucceeded: 1 })))
      .toEqual({ kind: "completed", at: run().runAt, succeeded: 1, of: 3, failed: 2 })
  })

  it("falls back to samplesCompleted when the backend omits samplesSucceeded", () => {
    const legacy = run({ status: "COMPLETED", samplesCompleted: 2 })
    delete (legacy as { samplesSucceeded?: number }).samplesSucceeded
    expect(deriveRunState(legacy)).toMatchObject({ kind: "completed", succeeded: 2 })
  })
})

describe("the hour-bucket window", () => {
  // The server buckets on the calendar hour, so the answer is the top of the
  // next hour -- never "one hour after the run".
  it("opens at the top of the next hour, not 60 minutes later", () => {
    expect(nextRunAllowedAt("2026-08-25T15:48:00.000Z").toISOString())
      .toBe("2026-08-25T16:00:00.000Z")
    expect(nextRunAllowedAt("2026-08-25T15:01:00.000Z").toISOString())
      .toBe("2026-08-25T16:00:00.000Z")
  })

  it("rolls over midnight", () => {
    expect(nextRunAllowedAt("2026-08-25T23:30:00.000Z").toISOString())
      .toBe("2026-08-26T00:00:00.000Z")
  })

  it("blocks a re-run inside the same hour and allows it after", () => {
    const r = run({ runAt: "2026-08-25T15:48:00.000Z" })
    expect(isWithinRunWindow(r, new Date("2026-08-25T15:59:59.000Z"))).toBe(true)
    expect(isWithinRunWindow(r, new Date("2026-08-25T16:00:01.000Z"))).toBe(false)
  })

  it("never blocks when there is no run", () => {
    expect(isWithinRunWindow(undefined)).toBe(false)
  })
})

describe("helpers", () => {
  it("renders a missing rate as a dash and a zero rate as 0%", () => {
    // A COMPLETED run with mentionRate 0 is a real finding ("never named"),
    // which must not look the same as "we have not looked yet".
    expect(pct(null)).toBe("—")
    expect(pct(undefined)).toBe("—")
    expect(pct(0)).toBe("0%")
    expect(pct(0.666)).toBe("67%")
  })

  it("picks the newest run for one platform only", () => {
    const p: PromptRow = {
      id: "p1",
      prompt: "best rank tracker",
      platforms: ["chat_gpt", "claude"],
      samplesPerRun: 3,
      runs: [run({ id: "a", platform: "claude" }), run({ id: "b", platform: "chat_gpt" })],
    }
    expect(runFor(p, "chat_gpt")?.id).toBe("b")
    expect(runFor(p, "claude")?.id).toBe("a")
    expect(runFor(p, "gemini")).toBeUndefined()
  })

  it("knows a prompt is active when any one of its platforms is", () => {
    const base = { id: "p1", prompt: "q", platforms: ["chat_gpt", "claude"] as Platform[], samplesPerRun: 3 }
    expect(isPromptActive({ ...base, runs: [run(), run({ platform: "claude" })] })).toBe(false)
    expect(isPromptActive({ ...base, runs: [run(), run({ platform: "claude", status: "PROCESSING" })] })).toBe(true)
  })

  it("round-trips every platform through its URL slug", () => {
    for (const id of PLATFORMS) expect(SLUG_TO_PLATFORM[PLATFORM_SLUG[id]]).toBe(id)
    // The underscore never reaches a URL.
    expect(PLATFORM_SLUG.chat_gpt).toBe("chatgpt")
  })
})
