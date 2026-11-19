import { describe, expect, it } from "vitest"
// Rank-tracker specifics only; read-only/404/matching is the contract test (index.test.ts).
import { demoResponse } from "./index"
import { demoProjectSummary } from "./rank-tracker"

type Kw = { id: string; keyword: string; position: number | null; d7: number | null }
type Detail = { history: { position: number | null; checkedAt: string }[]; latestCheck: { competitors: { domain: string }[] } }

const get = <T,>(path: string) => {
  const r = demoResponse(path, "GET")
  if (!r || r.error) throw new Error(`expected data for ${path}`)
  return r.data as T
}

describe("demo rank tracker", () => {
  const project = get<{ keywords: Kw[] }>("/api/projects/demo")

  it("project rows agree with each keyword's own history", () => {
    for (const k of project.keywords) {
      const d = get<Detail>(`/api/projects/demo/keywords/${k.id}/detail`)
      expect(d.history).toHaveLength(90)
      expect(d.history[0].position).toBe(k.position)
      // d7: position 7 checks ago minus today, a missing position counting as 101.
      const p = (x: number | null) => x ?? 101
      expect(k.d7).toBe(p(d.history[7].position) - p(k.position))
    }
  })

  it("competitor counts are derived from the same SERPs", () => {
    const ov = get<{ competitors: { id: string; domain: string; sharedCount: number; gapCount: number }[] }>(
      "/api/projects/demo/competitors",
    )
    for (const c of ov.competitors) {
      let shared = 0
      let gaps = 0
      for (const k of project.keywords) {
        const d = get<Detail>(`/api/projects/demo/keywords/${k.id}/detail`)
        if (!d.latestCheck.competitors.some((r) => r.domain === c.domain)) continue
        if (k.position != null) shared++
        else gaps++
      }
      expect(c.sharedCount).toBe(shared)
      expect(c.gapCount).toBe(gaps)
      const detail = get<{ sharedKeywords: unknown[] }>(`/api/projects/demo/competitors/${c.id}`)
      expect(detail.sharedKeywords).toHaveLength(shared)
    }
  })

  it("is stable across calls and summarises for the list", () => {
    expect(get("/api/projects/demo")).toEqual(project)
    const s = demoProjectSummary()
    expect(s._count.keywords).toBe(project.keywords.length)
    expect(s.trend).toHaveLength(30)
  })

  it("404s a keyword or competitor that isn't in the demo", () => {
    expect(demoResponse("/api/projects/demo/keywords/missing/detail", "GET")).toMatchObject({ error: { status: 404 } })
    expect(demoResponse("/api/projects/demo/competitors/missing", "GET")).toMatchObject({ error: { status: 404 } })
  })
})
