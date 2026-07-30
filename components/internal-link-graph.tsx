"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import * as d3 from "d3"
import { Icon } from "@/components/dashboard/icons"

// ─── Types (mirror the persisted `internalLinkGraph` JSON column) ──────────

interface LinkNode {
  url: string
  text?: string
  anchorText?: string
  section?: string
  wordCount?: number
}

interface PageData {
  url: string
  wordCount: number
  outboundCount: number
  linksToRanking: boolean
}

export interface GraphNode {
  id: string
  url: string
  label: string
  title: string | null
  inboundCount: number
  outboundCount: number
  depth: number
  isOrphan: boolean
  isHub: boolean
  isAuthority: boolean
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  anchorText?: string
  strength: number
}

export interface GraphMetadata {
  totalPages: number
  totalLinks: number
  orphanPages: number
  hubPages?: number
  authorityPages?: number
  averageLinksPerPage?: number
  topLinkedPages: Array<{ url: string; title: string | null; inboundLinks: number }>
}

export interface GraphOrphanData {
  graphOrphans?: string[]
  crawlComplete?: boolean
  confidence?: string
}

export interface LinkGraphDomain {
  domain: string
  isOwnSite: boolean
  position: number | null
  rankingUrl: string
  outboundLinks: LinkNode[]
  inboundLinks: LinkNode[]
  totalCrawledPages: number
  allPages: PageData[]
  hasLinkData: boolean
  internalCrawlStatus?: "pending" | "crawling" | "done" | "failed" | "locked"
  // Full-site graph (added on top of the legacy ranking-page-only fields above).
  nodes?: GraphNode[]
  edges?: GraphEdge[]
  metadata?: GraphMetadata | null
  orphanData?: GraphOrphanData | null
}

interface Props {
  data: LinkGraphDomain[]
}

// ─── Node classification / styling ──────────────────────────────────────────

const NODE_COLORS = {
  orphan: "#e2593f", // red-orange — problem pages
  hub: "#2d5bff", // page that links out to many others
  authority: "#2f9e6a", // page many others link into
  normal: "#8c9cc8",
} as const

type NodeClass = keyof typeof NODE_COLORS

function classifyGraphNode(n: GraphNode): NodeClass {
  if (n.isOrphan) return "orphan"
  if (n.isHub) return "hub"
  if (n.isAuthority) return "authority"
  return "normal"
}

function graphNodeRadius(n: GraphNode): number {
  return 6 + Math.min(14, Math.sqrt(n.inboundCount || 0) * 3.2)
}

// ─── Directed link graph (D3 force layout) ──────────────────────────────────

function LinkGraphViz({
  nodes,
  edges,
  orphanData,
}: {
  nodes: GraphNode[]
  edges: GraphEdge[]
  orphanData: GraphOrphanData | null
}) {
  const [activeTab, setActiveTabState] = useState<"graph" | "nodes" | "orphans">("graph")
  const [searchQuery, setSearchQuery] = useState("")
  const [visibleCls, setVisibleCls] = useState<Set<NodeClass>>(
    () => new Set<NodeClass>(["orphan", "hub", "authority", "normal"]),
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [zoomPct, setZoomPct] = useState(100)

  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const simRef = useRef<d3.Simulation<any, any> | null>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const gRootRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const graphOrphans = orphanData?.graphOrphans ?? []

  // ── Build / rebuild D3 graph ───────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== "graph") return
    const svgEl = svgRef.current
    const wrapEl = wrapRef.current
    if (!svgEl || !wrapEl) return

    const { width, height } = wrapEl.getBoundingClientRect()
    const W = width || 800
    const H = height || 440

    const svg = d3.select(svgEl)
    svg.selectAll("*").remove()
    svg.attr("viewBox", `0 0 ${W} ${H}`)

    const defs = svg.append("defs")
    defs
      .append("marker")
      .attr("id", "lg-arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 18)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-4L8,0L0,4")
      .attr("fill", "currentColor")
      .attr("opacity", 0.5)

    const gRoot = svg.append("g")
    const gLinks = gRoot.append("g").attr("class", "lg-links").style("color", "rgba(140,156,200,0.22)")
    const gNodes = gRoot.append("g").attr("class", "lg-nodes")
    gRootRef.current = gRoot

    type SimNode = GraphNode & { cls: NodeClass; r: number; x?: number; y?: number; fx?: number | null; fy?: number | null }
    const simNodes: SimNode[] = nodes.map((n) => ({ ...n, cls: classifyGraphNode(n), r: graphNodeRadius(n) }))
    const idMap = new Map(simNodes.map((n) => [n.id, n]))
    const simLinks = edges.filter((e) => idMap.has(e.source) && idMap.has(e.target)).map((e) => ({ ...e }))

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 4])
      .on("zoom", (event) => {
        gRoot.attr("transform", event.transform)
        setZoomPct(Math.round(event.transform.k * 100))
      })
    svg.call(zoom)
    svg.on("click.clear", (event: MouseEvent) => {
      if ((event.target as Element)?.tagName === "svg" || event.target === svgEl) setSelectedId(null)
    })
    zoomRef.current = zoom

    const sim = d3
      .forceSimulation<SimNode>(simNodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, any>(simLinks)
          .id((d) => d.id)
          .distance(110)
          .strength(0.3),
      )
      .force("charge", d3.forceManyBody().strength(-480))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force(
        "collide",
        d3
          .forceCollide<SimNode>()
          .radius((d) => d.r + 20)
          .strength(0.98),
      )
      .force("x", d3.forceX(W / 2).strength(0.04))
      .force("y", d3.forceY(H / 2).strength(0.04))
    simRef.current = sim

    const link = gLinks
      .selectAll<SVGPathElement, any>("path")
      .data(simLinks)
      .join("path")
      .attr("fill", "none")
      .attr("stroke", "var(--border)")
      .attr("stroke-width", 1)
      .attr("marker-end", "url(#lg-arrow)")

    const node = gNodes
      .selectAll<SVGGElement, SimNode>("g.lg-node")
      .data(simNodes)
      .join((enter) => {
        const grp = enter
          .append("g")
          .attr("class", (d) => `lg-node lg-cls-${d.cls}`)
          .style("color", (d) => NODE_COLORS[d.cls])
          .style("cursor", "pointer")
          .call(
            d3
              .drag<SVGGElement, SimNode>()
              .on("start", (event, d) => {
                if (!event.active) sim.alphaTarget(0.3).restart()
                d.fx = d.x
                d.fy = d.y
              })
              .on("drag", (event, d) => {
                d.fx = event.x
                d.fy = event.y
              })
              .on("end", (event, d) => {
                if (!event.active) sim.alphaTarget(0)
                d.fx = null
                d.fy = null
              }),
          )
          .on("click", (event, d) => {
            event.stopPropagation()
            setSelectedId((prev) => (prev === d.id ? null : d.id))
          })

        grp.append("circle").attr("r", (d) => d.r + 8).attr("fill", "currentColor").attr("fill-opacity", 0.08).attr("stroke", "none")
        grp
          .append("circle")
          .attr("r", (d) => d.r)
          .attr("fill", "currentColor")
          .attr("fill-opacity", 0.88)
          .attr("stroke", "var(--background)")
          .attr("stroke-width", 2.5)
        grp
          .append("text")
          .attr("text-anchor", "middle")
          .attr("dy", (d) => d.r + 13)
          .attr("font-size", 9.5)
          .attr("fill", "var(--muted-foreground)")
          .style("pointer-events", "none")
          .style("paint-order", "stroke")
          .attr("stroke", "var(--background)")
          .attr("stroke-width", 3)
          .attr("stroke-linejoin", "round")
          .text((d) => {
            const lbl = (d.label || d.id).replace(/^\//, "")
            return lbl.length > 15 ? lbl.slice(0, 13) + "…" : lbl || "/"
          })
        return grp
      })

    sim.on("tick", () => {
      link.attr("d", (d: any) => {
        const dx = d.target.x - d.source.x
        const dy = d.target.y - d.source.y
        const dr = Math.sqrt(dx * dx + dy * dy) * 2.5
        return `M${d.source.x},${d.source.y} A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`
      })
      node.attr("transform", (d: any) => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    const doFit = () => {
      try {
        const b = gRoot.node()?.getBBox()
        if (!b?.width || !b?.height) return
        const scale = 0.85 / Math.max(b.width / W, b.height / H)
        const tx = W / 2 - scale * (b.x + b.width / 2)
        const ty = H / 2 - scale * (b.y + b.height / 2)
        svg
          .transition()
          .duration(500)
          .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(Math.min(scale, 2.5)))
      } catch {
        /* graph empty / not yet laid out */
      }
    }
    const fitTimer = setTimeout(doFit, 700)

    return () => {
      clearTimeout(fitTimer)
      sim.stop()
    }
  }, [activeTab, nodes, edges])

  // ── Filter / selection dim ─────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== "graph" || !svgRef.current) return
    const svg = d3.select(svgRef.current)
    const q = searchQuery.trim().toLowerCase()

    svg.selectAll<SVGGElement, any>("g.lg-node").each(function (d) {
      const passClass = visibleCls.has(d.cls)
      const passSearch =
        !q ||
        (d.label || "").toLowerCase().includes(q) ||
        (d.url || "").toLowerCase().includes(q) ||
        (d.title || "").toLowerCase().includes(q)
      d3.select(this).style("opacity", passClass && passSearch ? 1 : 0.1)
    })

    if (selectedId) {
      const neighbours = new Set([selectedId])
      edges.forEach((e) => {
        const s = typeof e.source === "object" ? (e.source as any).id : e.source
        const t = typeof e.target === "object" ? (e.target as any).id : e.target
        if (s === selectedId) neighbours.add(t)
        if (t === selectedId) neighbours.add(s)
      })
      svg.selectAll<SVGGElement, any>("g.lg-node").each(function (d) {
        const passClass = visibleCls.has(d.cls)
        d3.select(this).style("opacity", neighbours.has(d.id) && passClass ? 1 : 0.08)
      })
      svg.selectAll<SVGPathElement, any>(".lg-links path").each(function (d: any) {
        if (!d) return
        const sid = d.source?.id ?? d.source
        const tid = d.target?.id ?? d.target
        const el = d3.select(this)
        if (tid === selectedId) el.attr("stroke", NODE_COLORS.authority).attr("stroke-width", 1.5).attr("stroke-opacity", 0.85)
        else if (sid === selectedId) el.attr("stroke", NODE_COLORS.hub).attr("stroke-width", 1.5).attr("stroke-opacity", 0.85)
        else el.attr("stroke", "rgba(140,156,200,0.06)").attr("stroke-width", 1).attr("stroke-opacity", 1)
      })
    } else {
      svg.selectAll<SVGPathElement, any>(".lg-links path").attr("stroke", "var(--border)").attr("stroke-width", 1).attr("stroke-opacity", 1)
    }
  }, [activeTab, selectedId, searchQuery, visibleCls, edges])

  // ── Zoom controls ───────────────────────────────────────────────────────
  const zoomBy = useCallback((factor: number) => {
    if (!svgRef.current || !zoomRef.current) return
    d3.select(svgRef.current).transition().duration(180).call(zoomRef.current.scaleBy, factor)
  }, [])

  const fitGraph = useCallback(() => {
    if (!svgRef.current || !zoomRef.current || !gRootRef.current || !wrapRef.current) return
    const { width: W, height: H } = wrapRef.current.getBoundingClientRect()
    try {
      const b = gRootRef.current.node()?.getBBox()
      if (!b?.width || !b?.height) return
      const scale = 0.85 / Math.max(b.width / W, b.height / H)
      const tx = W / 2 - scale * (b.x + b.width / 2)
      const ty = H / 2 - scale * (b.y + b.height / 2)
      d3
        .select(svgRef.current)
        .transition()
        .duration(500)
        .call(zoomRef.current.transform, d3.zoomIdentity.translate(tx, ty).scale(Math.min(scale, 2.5)))
    } catch {
      /* graph empty / not yet laid out */
    }
  }, [])

  const reshuffle = useCallback(() => {
    if (simRef.current) simRef.current.alpha(1).restart()
    setTimeout(fitGraph, 700)
  }, [fitGraph])

  // ── Derived data ─────────────────────────────────────────────────────────
  const selectedNode = selectedId ? nodeById.get(selectedId) ?? null : null
  const inboundEdges = useMemo(
    () => edges.filter((e) => (typeof e.target === "object" ? (e.target as any).id : e.target) === selectedId),
    [edges, selectedId],
  )
  const outboundEdges = useMemo(
    () => edges.filter((e) => (typeof e.source === "object" ? (e.source as any).id : e.source) === selectedId),
    [edges, selectedId],
  )
  const filteredNodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    let list = activeTab === "orphans" ? nodes.filter((n) => n.isOrphan) : nodes
    if (q) {
      list = list.filter(
        (n) =>
          (n.label || "").toLowerCase().includes(q) ||
          (n.url || "").toLowerCase().includes(q) ||
          (n.title || "").toLowerCase().includes(q),
      )
    }
    return [...list].sort((a, b) => b.inboundCount - a.inboundCount)
  }, [nodes, activeTab, searchQuery])

  const LEGEND_ITEMS: { cls: NodeClass; label: string }[] = [
    { cls: "orphan", label: "Orphan" },
    { cls: "hub", label: "Hub" },
    { cls: "authority", label: "Authority" },
    { cls: "normal", label: "Normal" },
  ]

  return (
    <div className="flex flex-col rounded-xl border border-border/40 bg-background overflow-hidden" style={{ height: 480 }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-card/60 flex-shrink-0 flex-wrap">
        <div className="flex bg-muted/50 border border-border/40 rounded-lg p-0.5 gap-0.5">
          {(["graph", "nodes", "orphans"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTabState(tab)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                activeTab === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "graph" ? "Graph" : tab === "nodes" ? `Nodes (${nodes.length})` : `Orphans (${graphOrphans.length})`}
            </button>
          ))}
        </div>

        <div className="relative min-w-[140px] max-w-[240px] flex-1">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50 pointer-events-none">
            <Icon.search size={12} />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search pages…"
            className="w-full h-7 pl-7 pr-3 rounded-md text-xs bg-muted/50 border border-border/40 text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-accent/60 transition-colors"
          />
        </div>

        {activeTab === "graph" && (
          <div className="flex gap-0.5 bg-muted/50 border border-border/40 rounded-lg p-0.5">
            {LEGEND_ITEMS.map(({ cls, label }) => (
              <button
                key={cls}
                onClick={() =>
                  setVisibleCls((prev) => {
                    const next = new Set(prev)
                    if (next.has(cls)) next.delete(cls)
                    else next.add(cls)
                    return next
                  })
                }
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors ${
                  visibleCls.has(cls) ? "bg-card text-foreground" : "text-muted-foreground/40"
                }`}
              >
                <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: NODE_COLORS[cls] }} />
                {label}
              </button>
            ))}
          </div>
        )}

        {activeTab === "graph" && (
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={fitGraph}
              title="Fit to view"
              className="h-7 px-2.5 flex items-center gap-1.5 rounded-md text-xs border border-border/40 bg-card hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
            >
              Fit
            </button>
            <button
              onClick={reshuffle}
              title="Re-run layout"
              className="h-7 px-2.5 flex items-center gap-1.5 rounded-md text-xs border border-border/40 bg-card hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Icon.refresh />
              Reshuffle
            </button>
            {selectedId && (
              <button
                onClick={() => setSelectedId(null)}
                className="h-7 px-2.5 flex items-center gap-1.5 rounded-md text-xs border border-accent/30 bg-accent/10 hover:bg-accent/20 text-accent transition-colors"
              >
                <Icon.close />
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        <div className="relative flex-1 min-w-0 bg-muted/30" ref={wrapRef}>
          {activeTab === "graph" && (
            <>
              <svg ref={svgRef} className="w-full h-full block" style={{ cursor: "grab" }} />
              <div className="absolute bottom-3 left-3 flex items-center gap-0.5 rounded-lg border border-border/40 bg-card/80 backdrop-blur-sm p-1">
                <button
                  onClick={() => zoomBy(1.3)}
                  className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                >
                  +
                </button>
                <button
                  onClick={() => zoomBy(1 / 1.3)}
                  className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                >
                  −
                </button>
                <div className="w-px h-4 bg-border/60 mx-0.5" />
                <button
                  onClick={fitGraph}
                  className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                  title="Fit to view"
                >
                  ⤢
                </button>
              </div>
              <div className="absolute bottom-3 right-3 font-mono text-[11px] text-muted-foreground/50 bg-card/80 border border-border/40 backdrop-blur-sm px-2 py-1 rounded-md">
                {zoomPct}%
              </div>
            </>
          )}

          {(activeTab === "nodes" || activeTab === "orphans") && (
            <div className="h-full overflow-auto">
              {filteredNodes.length === 0 ? (
                <div className="flex items-center justify-center h-full text-xs text-muted-foreground/50">
                  {activeTab === "orphans"
                    ? "No orphan pages — every crawled page has at least one inbound link."
                    : "No pages match your search."}
                </div>
              ) : (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-border/40">
                      {["Page", "Type", "In", "Out", "Depth"].map((h, i) => (
                        <th
                          key={h}
                          className={`text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider px-4 py-2.5 sticky top-0 bg-card/90 backdrop-blur-sm ${
                            i > 1 ? "text-right" : "text-left"
                          }`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredNodes.map((n) => {
                      const cls = classifyGraphNode(n)
                      return (
                        <tr
                          key={n.id}
                          onClick={() => setSelectedId(n.id)}
                          className={`border-b border-border/30 cursor-pointer transition-colors hover:bg-muted/30 ${
                            selectedId === n.id ? "bg-accent/10" : ""
                          }`}
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: NODE_COLORS[cls] }} />
                              <div className="min-w-0">
                                <div className="font-medium text-foreground/90 truncate">{n.title || n.label || n.id}</div>
                                <div className="font-mono text-[11px] text-muted-foreground truncate">{n.url}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className="inline-flex items-center text-[11px] font-medium capitalize px-2 py-0.5 rounded-full"
                              style={{ background: `${NODE_COLORS[cls]}26`, color: NODE_COLORS[cls] }}
                            >
                              {cls}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground text-xs">{n.inboundCount}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground text-xs">{n.outboundCount}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground text-xs">{n.depth}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {selectedNode ? (
          <div className="w-64 flex-shrink-0 border-l border-border/40 bg-card/50 flex flex-col overflow-y-auto">
            <div className="px-4 py-3.5 border-b border-border/40">
              <div className="flex flex-wrap gap-1 mb-2">
                {(["orphan", "hub", "authority"] as const).map((cls) =>
                  selectedNode[cls === "orphan" ? "isOrphan" : cls === "hub" ? "isHub" : "isAuthority"] ? (
                    <span
                      key={cls}
                      className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full"
                      style={{ background: `${NODE_COLORS[cls]}26`, color: NODE_COLORS[cls] }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: NODE_COLORS[cls] }} />
                      {cls}
                    </span>
                  ) : null,
                )}
                {!selectedNode.isOrphan && !selectedNode.isHub && !selectedNode.isAuthority && (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{ background: `${NODE_COLORS.normal}26`, color: NODE_COLORS.normal }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: NODE_COLORS.normal }} />
                    normal
                  </span>
                )}
                <span className="inline-flex items-center text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground">
                  Depth {selectedNode.depth}
                </span>
              </div>
              <h4 className="font-semibold text-sm text-foreground leading-snug mb-1">{selectedNode.title || selectedNode.label || selectedNode.id}</h4>
              <a
                href={selectedNode.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[11px] text-muted-foreground hover:text-accent break-all leading-snug transition-colors"
              >
                {selectedNode.url}
              </a>
            </div>
            <div className="grid grid-cols-2 divide-x divide-border/40 border-b border-border/40">
              <div className="px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">Inbound</p>
                <p className="text-lg font-bold mt-0.5">{selectedNode.inboundCount}</p>
                <p className="text-[11px] text-muted-foreground">pages link in</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">Outbound</p>
                <p className="text-lg font-bold mt-0.5">{selectedNode.outboundCount}</p>
                <p className="text-[11px] text-muted-foreground">links out</p>
              </div>
            </div>
            <div className="px-4 py-3 flex flex-col gap-4">
              {[
                { label: "Linked from", count: inboundEdges.length, color: NODE_COLORS.authority, items: inboundEdges, idKey: "source" as const },
                { label: "Links to", count: outboundEdges.length, color: NODE_COLORS.hub, items: outboundEdges, idKey: "target" as const },
              ].map(({ label, count, color, items, idKey }) => (
                <div key={label}>
                  <h5 className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold mb-1.5 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                    {label} ({count})
                  </h5>
                  {items.length === 0 ? (
                    <p className="text-xs text-muted-foreground/40 italic">None</p>
                  ) : (
                    <ul className="flex flex-col gap-0.5">
                      {items.slice(0, 20).map((e, i) => {
                        const nid = typeof e[idKey] === "object" ? (e[idKey] as any).id : e[idKey]
                        const nb = nodeById.get(nid)
                        return (
                          <li key={i}>
                            <button
                              onClick={() => setSelectedId(nid)}
                              className="w-full text-left font-mono text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/30 rounded px-2 py-1 transition-colors truncate"
                            >
                              {nb?.label || nid}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="w-56 flex-shrink-0 border-l border-border/40 bg-card/30 hidden sm:flex flex-col items-center justify-center gap-2 text-center p-6">
            <p className="text-xs text-muted-foreground/50 max-w-[160px] leading-relaxed">Click any node to inspect its inbound and outbound links.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Per-domain stat tiles ───────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="font-mono text-lg font-bold text-foreground">{value}</div>
    </div>
  )
}

function hasUsableData(rows: LinkGraphDomain[]): boolean {
  return rows.some(
    (d) =>
      d.totalCrawledPages > 0 ||
      d.inboundLinks.length > 0 ||
      d.outboundLinks.length > 0 ||
      (d.nodes && d.nodes.length > 0),
  )
}

function DomainCard({ d, defaultExpanded = false }: { d: LinkGraphDomain; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const nodes = d.nodes ?? []
  const edges = d.edges ?? []
  const hasGraph = nodes.length > 0

  if (d.internalCrawlStatus === "locked") {
    return (
      <div className="border border-border/40 bg-card/10 p-4">
        <div className="font-mono text-[11px] uppercase tracking-widest text-accent mb-2">{d.domain}</div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon.lock size={12} />
          <span className="text-xs">Upgrade to Pro to view this competitor&apos;s internal link graph.</span>
        </div>
      </div>
    )
  }

  const totalPages = d.metadata?.totalPages ?? (hasGraph ? nodes.length : d.totalCrawledPages)
  const totalLinks = d.metadata?.totalLinks ?? edges.length
  const orphanCount = d.metadata?.orphanPages ?? nodes.filter((n) => n.isOrphan).length
  const hubCount = d.metadata?.hubPages ?? nodes.filter((n) => n.isHub).length
  const authorityCount = d.metadata?.authorityPages ?? nodes.filter((n) => n.isAuthority).length
  const avgLinks = d.metadata?.averageLinksPerPage ?? (nodes.length ? totalLinks / nodes.length : 0)
  const topLinkedPages = d.metadata?.topLinkedPages ?? []
  const orphanUrls = d.orphanData?.graphOrphans ?? []

  const statusHint =
    !hasGraph && d.internalCrawlStatus && d.internalCrawlStatus !== "done"
      ? d.internalCrawlStatus === "crawling"
        ? "Crawling internal links…"
        : d.internalCrawlStatus === "failed"
          ? "Internal link crawl failed for this domain."
          : "Internal link crawl not started yet."
      : null

  return (
    <div className="border border-border/40 bg-card/10 p-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="font-mono text-[11px] uppercase tracking-widest text-accent">
          {d.isOwnSite ? "★ " : ""}
          {d.domain}
          {d.position ? ` #${d.position}` : ""}
        </div>
        {hasGraph && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="h-7 px-2.5 flex items-center gap-1.5 rounded-md text-xs border border-border/40 bg-card hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? "Hide link graph" : "View link graph"}
          </button>
        )}
      </div>

      {hasGraph ? (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-center">
          <Stat label="Pages" value={totalPages} />
          <Stat label="Links" value={totalLinks} />
          <Stat label="Orphans" value={orphanCount} />
          <Stat label="Hubs" value={hubCount} />
          <Stat label="Authorities" value={authorityCount} />
          <Stat label="Avg/Page" value={avgLinks.toFixed(1)} />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <Stat label="Inbound" value={d.inboundLinks.length} />
          <Stat label="Outbound" value={d.outboundLinks.length} />
          <Stat label="Crawled" value={d.totalCrawledPages} />
          <Stat label="Position" value={d.position ?? "—"} />
        </div>
      )}

      {statusHint && <p className="mt-2 font-mono text-[11px] text-muted-foreground/70">{statusHint}</p>}

      {hasGraph && expanded && (
        <div className="mt-4 space-y-4">
          <LinkGraphViz nodes={nodes} edges={edges} orphanData={d.orphanData ?? null} />

          {topLinkedPages.length > 0 && (
            <div>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Top Linked Pages</h4>
              <div className="space-y-2">
                {topLinkedPages.slice(0, 5).map((page, i) => {
                  let displayPath = page.url
                  try {
                    displayPath = new URL(page.url).pathname || "/"
                  } catch {
                    /* not an absolute URL */
                  }
                  return (
                    <div key={i} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-4 shrink-0 text-right text-xs font-mono text-muted-foreground/50">{i + 1}</span>
                        <a
                          href={page.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 min-w-0 text-sm text-foreground/80 hover:text-accent transition-colors"
                        >
                          <span className="truncate">{page.title || displayPath}</span>
                          <Icon.external size={11} />
                        </a>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{page.inboundLinks} inbound</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {orphanUrls.length > 0 && (
            <div className="flex items-start gap-2.5">
              <Icon.info size={14} />
              <div>
                <p className="text-sm font-medium">
                  {orphanUrls.length} orphan {orphanUrls.length === 1 ? "page" : "pages"} found
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  These pages have no inbound internal links and may be missed by search engine crawlers.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Top-level export ────────────────────────────────────────────────────────

export function InternalLinkGraph({ data }: Props) {
  if (!data || data.length === 0 || !hasUsableData(data)) {
    return (
      <div className="border border-border/40 bg-muted/5 p-6 text-center">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Internal Link Analysis</p>
        <p className="font-mono text-[11px] text-muted-foreground/70 mt-2 max-w-md mx-auto">
          Not available for this analysis yet — internal-link crawling may still be running or was not enabled.
        </p>
      </div>
    )
  }

  // Open the first domain that actually has a crawled graph by default, so the
  // user sees a graph immediately instead of having to click into one.
  const firstGraphIndex = data.findIndex((d) => (d.nodes?.length ?? 0) > 0)

  return (
    <div className="space-y-4">
      {data.map((d, i) => (
        <DomainCard key={d.domain} d={d} defaultExpanded={i === firstGraphIndex} />
      ))}
    </div>
  )
}
