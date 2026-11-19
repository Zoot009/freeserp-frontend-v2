import { describe, expect, it } from "vitest"
// Maps-tracker specifics only; read-only/404/matching is the contract test (index.test.ts).
import { computeMetrics } from "@/components/maps-tracker/grid"
import type { CompetitorLeaderboard, PointDetail, Scan } from "@/components/maps-tracker/types"
import { routeDemo } from "./index"
import { mapsTrackerDemo, demoMapsScanSummary } from "./maps-tracker"

// The registry loads tools lazily (async); routed synchronously against the module here.
const demoResponse = (url: string, method: string) => routeDemo("/api/maps-tracker/scans", mapsTrackerDemo, url, method)

const get = <T,>(path: string) => {
  const r = demoResponse(path, "GET")
  if (!r || r.error) throw new Error(`expected data for ${path}`)
  return r.data as T
}

describe("demo maps tracker", () => {
  const { scan } = get<{ scan: Scan }>("/api/maps-tracker/scans/demo")

  it("is finished, so the report page stops polling", () => {
    expect(scan.status).toBe("COMPLETED")
    expect(scan.aiReport?.status).toBe("COMPLETED")
    expect(scan.pointsDone).toBe(scan.totalPoints)
    for (const k of scan.keywords) expect(k.points.every((p) => p.status === "SUCCEEDED")).toBe(true)
  })

  it("keyword figures are computed from its points, and each point opens with the same rank", () => {
    for (const k of scan.keywords) {
      expect(k.points).toHaveLength(scan.gridSize ** 2)
      const m = computeMetrics(k.points)
      expect([k.arp, k.atrp, k.solv, k.foundPoints]).toEqual([m.arp, m.atrp, m.solv, m.foundPoints])
      for (const p of k.points) {
        const { point } = get<{ point: PointDetail }>(`/api/maps-tracker/scans/demo/points/${p.id}`)
        expect(point.rank).toBe(p.rank)
        const own = point.topResults!.find((r) => r.title === scan.location.name && r.rankAbsolute === p.rank)
        expect(own != null).toBe(p.rank != null)
      }
    }
  })

  it("the leaderboard's own row matches the keyword, over the same points", () => {
    for (const k of scan.keywords) {
      const lb = get<CompetitorLeaderboard>(`/api/maps-tracker/scans/demo/keywords/${k.id}/competitors`)
      expect(lb.points.map((p) => p.id)).toEqual(k.points.map((p) => p.id))
      const own = lb.rows.find((r) => r.isTarget)!
      expect([own.solv, own.arp, own.foundPoints]).toEqual([k.solv, k.arp, k.foundPoints])
      expect(lb.insights.totalCompetitors).toBe(lb.rows.length - 1)
    }
  })

  it("covers strong, mixed and not-found readings", () => {
    const solvs = scan.keywords.map((k) => k.solv ?? 0)
    expect(Math.max(...solvs)).toBeGreaterThanOrEqual(50)
    expect(Math.min(...solvs)).toBeLessThan(15)
    expect(scan.keywords.some((k) => k.points.some((p) => p.rank == null))).toBe(true)
  })

  it("is stable across calls and summarises for the list", () => {
    expect(get("/api/maps-tracker/scans/demo")).toEqual({ scan })
    const s = demoMapsScanSummary()
    expect(s.keywords.map((k) => k.solv)).toEqual(scan.keywords.map((k) => k.solv))
    expect(demoResponse("/api/maps-tracker/scans/demo/points/missing", "GET")).toMatchObject({ error: { status: 404 } })
    expect(demoResponse("/api/maps-tracker/scans/demo/keywords/missing/competitors", "GET")).toMatchObject({ error: { status: 404 } })
  })
})
