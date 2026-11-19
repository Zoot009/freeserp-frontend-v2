import { describe, expect, it } from "vitest"
// YouTube-tracker specifics only; read-only/404/matching is the contract test (index.test.ts).
import { routeDemo } from "./index"
import { youtubeTrackerDemo, demoYoutubeProjectSummary, youtubeSnapshotPath } from "./youtube-tracker"

// The registry loads tools lazily (async); routed synchronously against the module here.
const demoResponse = (url: string, method: string) => routeDemo("/api/youtube/projects", youtubeTrackerDemo, url, method)

type Row = {
  id: string
  latestCheckId: string
  checkedDepth: number
  notInTop: boolean
  bestVideoPosition: number | null
  bestRankAbsolute: number | null
  ownedCount: number
  d1: number | null
  status: string
}
type Check = { id: string; depth: number; bestVideoPosition: number | null; ownedCount: number; notInTop: boolean; status: string }
type Detail = {
  latestCheck: Check & { results: { rankAbsolute: number; videoPosition: number | null }[] }
  history: Check[]
}
type Snapshot = { checkId: string; ownedRanks: number[]; items: { rankAbsolute: number; videoPosition: number | null }[] }

const get = <T,>(path: string) => {
  const r = demoResponse(path, "GET")
  if (!r || r.error) throw new Error(`expected data for ${path}`)
  return r.data as T
}

describe("demo youtube tracker", () => {
  const project = get<{ keywords: Row[] }>("/api/youtube/projects/demo")

  it("rows, detail and snapshot agree for every keyword", () => {
    for (const k of project.keywords) {
      const d = get<Detail>(`/api/youtube/projects/demo/keywords/${k.id}/detail`)
      expect(d.latestCheck.id).toBe(k.latestCheckId)
      expect(d.history[0].bestVideoPosition).toBe(k.bestVideoPosition)
      expect(d.latestCheck.results).toHaveLength(k.ownedCount)
      expect(k.notInTop).toBe(k.ownedCount === 0)
      // d1: yesterday's position minus today's, a miss counting as depth + 1.
      if (d.history[1]) {
        const p = (x: number | null) => x ?? k.checkedDepth + 1
        expect(k.d1).toBe(p(d.history[1].bestVideoPosition) - p(k.bestVideoPosition))
      }

      const s = get<Snapshot>(youtubeSnapshotPath("demo", k.latestCheckId))
      expect(s.checkId).toBe(k.latestCheckId)
      expect(new Set(s.ownedRanks).size).toBe(k.ownedCount)
      expect(s.ownedRanks.map((r) => s.items[r - 1].rankAbsolute)).toEqual(s.ownedRanks)
      if (k.bestRankAbsolute != null) expect(Math.min(...s.ownedRanks)).toBe(k.bestRankAbsolute)
      // The headline is the best organic position among the owned results.
      const organic = d.latestCheck.results.map((r) => r.videoPosition).filter((p): p is number => p != null)
      expect(k.bestVideoPosition).toBe(organic.length ? Math.min(...organic) : null)
      // Organic positions run 1..depth with no gaps; ads, shelves and playlists carry none.
      expect(s.items.filter((i) => i.videoPosition != null).map((i) => i.videoPosition)).toEqual(
        Array.from({ length: k.checkedDepth }, (_, i) => i + 1),
      )
    }
  })

  it("every check is finished, so no page keeps polling", () => {
    for (const k of project.keywords) {
      expect(k.status).toBe("COMPLETED")
      const d = get<Detail>(`/api/youtube/projects/demo/keywords/${k.id}/detail`)
      expect(d.history.every((h) => h.status === "COMPLETED")).toBe(true)
    }
  })

  it("is stable across calls and summarises for the list", () => {
    expect(get("/api/youtube/projects/demo")).toEqual(project)
    expect(demoYoutubeProjectSummary().keywordCount).toBe(project.keywords.length)
  })

  it("only serves the latest check's snapshot, and leaves real ones on the real route", () => {
    expect(youtubeSnapshotPath("abc", "c1")).toBe("/api/youtube/checks/c1/snapshot")
    expect(demoResponse("/api/youtube/projects/demo/checks/missing/snapshot", "GET")).toMatchObject({ error: { status: 404 } })
    expect(demoResponse("/api/youtube/projects/demo/keywords/missing/detail", "GET")).toMatchObject({ error: { status: 404 } })
    expect(demoResponse("/api/youtube/checks/c1/snapshot", "GET")).toBeNull()
  })
})
