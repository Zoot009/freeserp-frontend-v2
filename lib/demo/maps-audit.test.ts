import { describe, expect, it } from "vitest"
// Maps-audit specifics only; read-only/404/matching is the contract test (index.test.ts).
import type { GbpAuditResponse } from "@/lib/gbp-audit"
import { routeDemo } from "./index"
import { mapsAuditDemo, demoMapsAuditRow } from "./maps-audit"
import fixture from "./maps-audit.fixture.json"

// The registry loads tools lazily (async); routed synchronously against the module here.
const demoResponse = (url: string, method: string) => routeDemo("/api/gbp-audit", mapsAuditDemo, url, method)

const get = () => {
  const r = demoResponse("/api/gbp-audit/demo", "GET")
  if (!r || r.error) throw new Error("expected data")
  return r.data as GbpAuditResponse
}

describe("demo maps audit", () => {
  const data = get()

  it("is a finished audit with a report, so nothing polls", () => {
    expect(data.audit.status).toBe("COMPLETED")
    expect(data.report).not.toBeNull()
    expect(data.audit.score).toBe(data.report!.score)
    expect(data.others).toEqual([])
  })

  it("moves every date by the same amount, and only dates", () => {
    const shift = Date.parse(data.facts!.fetchedAt) - Date.parse(fixture.facts.fetchedAt)
    expect(shift % 86_400_000).toBe(0)
    expect(Date.parse(data.facts!.reviews!.items[0].publishedAt!) - Date.parse(fixture.facts.reviews.items[0].publishedAt)).toBe(shift)
    expect(data.report!.checks).toEqual(fixture.report.checks)
    // Never in the future: the latest fetch is at or before the demo anchor.
    expect(Date.parse(data.facts!.fetchedAt)).toBeLessThanOrEqual(Date.now())
  })

  it("has no rival-grid scan to point at, and is stable across calls", () => {
    expect(data.facts!.grid!.scanId).toBeNull()
    expect(get()).toEqual(data)
    expect(demoMapsAuditRow().subtitle).toContain(`${data.report!.score}/100`)
    expect(demoResponse("/api/gbp-audit/demo/share", "GET")).toMatchObject({ error: { status: 404 } })
  })
})
