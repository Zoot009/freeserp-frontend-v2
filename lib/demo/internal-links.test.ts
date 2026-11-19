// Internal-links specifics only; routing, read-only and 404s are the contract test (index.test.ts).
import { describe, expect, it } from "vitest"
import { internalLinksDemo, internalLinksDemoRow } from "./internal-links"

type Node = { id: string; url: string; inboundCount: number; outboundCount: number; depth: number; isOrphan: boolean; isHub: boolean; isAuthority: boolean }
type Graph = {
  nodes: Node[]
  edges: { source: string; target: string }[]
  metadata: { totalPages: number; totalLinks: number; orphanPages: number; hubPages: number; authorityPages: number; maxDepth: number }
  orphanData: { graphOrphans: string[] }
}
const { analysis } = internalLinksDemo.get([], new URLSearchParams()) as { analysis: { id: string; status: string; internalLinkGraph: Graph } }
const g = analysis.internalLinkGraph

describe("demo internal links", () => {
  it("is finished, so nothing polls", () => {
    expect(analysis).toMatchObject({ id: "demo", status: "COMPLETED" })
  })

  it("counts every node's links from the edges, and only links pages it has", () => {
    const ids = new Set(g.nodes.map((n) => n.id))
    for (const e of g.edges) expect(ids.has(e.source) && ids.has(e.target)).toBe(true)
    for (const n of g.nodes) {
      expect(n.inboundCount).toBe(g.edges.filter((e) => e.target === n.id).length)
      expect(n.outboundCount).toBe(g.edges.filter((e) => e.source === n.id).length)
    }
    expect(g.metadata).toMatchObject({ totalPages: g.nodes.length, totalLinks: g.edges.length })
  })

  it("flags hubs and authorities by siteCrawler.ts's rule (1.5x average)", () => {
    const avg = g.edges.length / g.nodes.length
    for (const n of g.nodes) {
      expect(n.isHub).toBe(n.outboundCount > 0 && n.outboundCount >= avg * 1.5)
      expect(n.isAuthority).toBe(n.inboundCount > 0 && n.inboundCount >= avg * 1.5)
    }
    expect(g.metadata.hubPages).toBeGreaterThan(0)
    expect(g.metadata.authorityPages).toBeGreaterThan(0)
  })

  it("orphans exactly the pages nothing links to, and reaches the rest from home", () => {
    const orphans = g.nodes.filter((n) => n.isOrphan).map((n) => new URL(n.url).pathname).sort()
    expect(orphans).toEqual(["/a/strength-training-for-runners", "/size-fit/womens-footwear", "/t/air-max-plus-og"])
    expect(g.orphanData.graphOrphans).toHaveLength(orphans.length)
    for (const n of g.nodes.filter((x) => !x.isOrphan && new URL(x.url).pathname !== "/")) expect(n.depth).toBeGreaterThan(0)
    expect(g.metadata.maxDepth).toBeGreaterThanOrEqual(2)
  })

  it("pins a history row that opens this analysis", () => {
    expect(internalLinksDemoRow().href).toContain("analysisId=demo")
  })
})
