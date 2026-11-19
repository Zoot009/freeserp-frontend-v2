import { describe, expect, it } from "vitest"
// Quick-SERP specifics only; read-only/404/matching is the contract test (index.test.ts).
import { demoResponse } from "./index"
import { demoSerpHistoryItem } from "./serp-checker"

type Result = {
  position: number | null; found: boolean; url: string | null; domain: string; totalResults: number
  topCompetitor: { domain: string; position: number } | null
  results: { position: number; domain: string; url: string }[]
}
const get = <T,>(path: string) => {
  const r = demoResponse(path, "GET")
  if (!r || r.error) throw new Error(`expected data for ${path}`)
  return r.data as T
}

describe("demo serp checker", () => {
  const { check } = get<{ check: { status: string; position: number | null; result: Result } }>("/api/serp-check/demo")

  it("is finished, so the page's 2s poll never starts", () => {
    expect(check.status).toBe("COMPLETED")
    expect(demoSerpHistoryItem().status).toBe("COMPLETED")
  })

  it("reads like a depth-10 live check: own row, position and top competitor agree", () => {
    const r = check.result
    expect(r.results.length).toBeLessThanOrEqual(10)
    expect(r.totalResults).toBe(r.results.length)
    const own = r.results.find((x) => x.domain === r.domain)
    expect(r.found).toBe(own != null)
    expect([r.position, r.url]).toEqual([own?.position ?? null, own?.url ?? null])
    expect(check.position).toBe(r.position)
    expect(r.topCompetitor?.domain).toBe(r.results.find((x) => x.domain !== r.domain)?.domain)
  })

  it("matches the rank tracker demo's SERP for the same query", () => {
    const project = get<{ keywords: { id: string; keyword: string; position: number | null }[] }>("/api/projects/demo")
    const kw = project.keywords.find((k) => k.keyword === "running shoes")!
    expect(check.position).toBe(kw.position)
    expect(get("/api/serp-check/demo")).toEqual({ check })
  })
})
