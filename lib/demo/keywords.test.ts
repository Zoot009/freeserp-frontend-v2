import { describe, expect, it } from "vitest"
// The Keywords page's demo view lists the rank tracker demo's project; read-only/404 is the contract test.
import { routeDemo } from "./index"
import { KEYWORDS_CREATE_HREF, KEYWORDS_DEMO_HREF } from "./keywords"
import { RANK_TRACKER_CREATE_HREF, rankTrackerDemo } from "./rank-tracker"
import { DEMO_BRAND, DEMO_ID } from "./shared"

describe("demo keywords view", () => {
  const project = routeDemo("/api/projects", rankTrackerDemo, `/api/projects/${DEMO_ID}`, "GET")?.data as {
    id: string
    domain: string
    keywords: Record<string, unknown>[]
  }

  it("reads the rank tracker demo's project, about the demo brand", () => {
    expect(project.id).toBe(DEMO_ID)
    expect(project.domain).toBe(DEMO_BRAND.domain)
    expect(project.keywords.length).toBeGreaterThan(0)
  })

  it("has every field the page reads on each keyword", () => {
    const read = ["id", "keyword", "position", "d1", "searchVolume", "url", "serpFeatures", "searchVolumeTrend", "location", "device", "monthlyTraffic", "status", "checkedAt", "trend5"]
    for (const k of project.keywords) for (const f of read) expect(k).toHaveProperty(f)
  })

  it("links to its own view, and leads to the rank tracker's start page", () => {
    expect(KEYWORDS_DEMO_HREF).toBe("/dashboard/keywords?view=demo")
    expect(KEYWORDS_CREATE_HREF).toBe(RANK_TRACKER_CREATE_HREF)
  })
})
