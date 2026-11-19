// Demo report for the Internal Links Analysis tool: nike.com's internal link
// graph, generated in the browser. Spec: .claude/skills/demo-report/SKILL.md.
//
// lib/demo/index.ts routes GET /api/internal-link-analysis/demo here; the response
// is ila.routes.ts `{ analysis }`. The graph has the shape the worker stores from
// the link-graph API (runInternalLinkAnalysis.worker.ts), the same one
// site-crawl/linkGraph.ts builds: hub and authority use siteCrawler.ts's rule
// (1.5x the average outbound / inbound links), depth is clicks from the homepage,
// orphans are pages the sitemap lists that nothing links to.

import { DEMO_BRAND, DEMO_ID, perAnchor, prng, type DemoTool } from "./shared"

/** Where the demo's CTAs lead: the analysis form. */
export const INTERNAL_LINKS_CREATE_HREF = "/dashboard/ai-internal-linking"

const url = (path: string) => `${DEMO_BRAND.url}${path}`

type Kind = "home" | "category" | "product" | "article" | "help" | "other" | "orphan"
const P = (path: string, name: string, kind: Kind, category?: string) => ({ path, name, kind, category })

const CATEGORIES = [
  P("/w/mens-shoes", "Men's Shoes", "category"), P("/w/womens-shoes", "Women's Shoes", "category"),
  P("/w/kids-shoes", "Kids' Shoes", "category"), P("/w/new-arrivals", "New Arrivals", "category"),
  P("/w/sale", "Sale", "category"), P("/w/running-shoes", "Running Shoes", "category"),
  P("/w/basketball-shoes", "Basketball Shoes", "category"), P("/w/jordan", "Jordan", "category"),
]
const NAV = CATEGORIES.slice(0, 5) // the header menu, on every page
const PRODUCT_NAMES = [
  "Pegasus 41", "Vomero 18", "Invincible 3", "Vaporfly 3", "Alphafly 3", "Structure 25", "Winflo 11", "Pegasus Trail 5",
  "Air Max 90", "Air Max Dn", "Air Force 1 '07", "Dunk Low", "Blazer Mid '77", "Cortez", "Killshot 2",
  "LeBron 22", "Giannis Freak 6", "Sabrina 2", "G.T. Cut 3", "Ja 2", "Air Jordan 1 Retro High OG",
  "Air Jordan 4 Retro", "Jordan Luka 3", "Flex Runner 3", "Revolution 7", "Court Borough Low", "Metcon 9",
  "Free Metcon 6", "Zegama 2", "Downshifter 13",
]
const PRODUCTS = PRODUCT_NAMES.map((n, i) =>
  P(`/t/${n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "")}`, `Nike ${n}`, "product", CATEGORIES[5 + (i % 3)].path))
const ARTICLES = [
  P("/a/best-running-shoes", "The Best Nike Running Shoes", "article"), P("/a/how-to-clean-white-shoes", "How to Clean White Shoes", "article"),
  P("/a/running-shoes-for-flat-feet", "Running Shoes for Flat Feet", "article"), P("/a/how-to-lace-running-shoes", "How to Lace Running Shoes", "article"),
  P("/a/marathon-training-plan", "A Marathon Training Plan", "article"), P("/a/how-to-choose-basketball-shoes", "How to Choose Basketball Shoes", "article"),
  P("/a/shoe-size-guide", "Shoe Size Guide", "article"), P("/a/what-is-zoomx", "What Is ZoomX Foam?", "article"),
  P("/a/trail-running-tips", "Trail Running Tips for Beginners", "article"), P("/a/sneaker-care-guide", "The Sneaker Care Guide", "article"),
]
const HELP = [
  P("/help", "Help", "help"), P("/help/a/returns-policy", "Returns Policy", "help"), P("/help/a/shipping-delivery", "Shipping & Delivery", "help"),
  P("/help/a/size-charts", "Size Charts", "help"), P("/help/a/promo-code-terms", "Promo Code Terms", "help"),
]
const OTHER = [
  P("/membership", "Nike Membership", "other"), P("/retail", "Find a Store", "other"), P("/about", "About Nike", "other"),
  P("/sustainability", "Sustainability", "other"), P("/gift-cards", "Gift Cards", "other"),
]
// In the sitemap, linked from nowhere: what the orphan view exists to catch.
const ORPHANS = [
  P("/a/strength-training-for-runners", "Strength Training for Runners", "orphan"),
  P("/size-fit/womens-footwear", "Women's Shoe Sizing", "orphan"),
  P("/t/air-max-plus-og", "Nike Air Max Plus OG", "orphan"),
]
const HOME = P("/", "Nike. Just Do It", "home")
const PAGES = [HOME, ...CATEGORIES, ...PRODUCTS, ...ARTICLES, ...HELP, ...OTHER, ...ORPHANS]

function buildGraph() {
  const rand = prng(42)
  const pick = <T,>(xs: T[], n: number) => xs.map((x) => ({ x, k: rand() })).sort((a, b) => a.k - b.k).slice(0, n).map((e) => e.x)
  const edges = new Map<string, { source: string; target: string; anchorText: string }>()
  const link = (from: { path: string }, to: { path: string; name: string }) => {
    if (from.path === to.path) return
    edges.set(`${from.path}>${to.path}`, { source: url(from.path), target: url(to.path), anchorText: to.name })
  }

  for (const page of PAGES) {
    if (page.kind === "orphan") continue // nothing on the crawled site links to or from them
    for (const n of [HOME, ...NAV]) link(page, n)
    for (const f of [HELP[0], ...OTHER]) link(page, f) // footer
    if (page.kind === "home") {
      for (const x of [...CATEGORIES, ...ARTICLES.slice(0, 4)]) link(page, x)
    } else if (page.kind === "category") {
      // Each category features two buying guides, so every article is reachable.
      const ci = CATEGORIES.indexOf(page)
      for (const x of [ARTICLES[(ci * 2) % ARTICLES.length], ARTICLES[(ci * 2 + 1) % ARTICLES.length]]) link(page, x)
      for (const x of PRODUCTS.filter((p) => p.category === page.path)) link(page, x)
      for (const x of pick(PRODUCTS, 3)) link(page, x)
      for (const x of pick(CATEGORIES, 2)) link(page, x)
    } else if (page.kind === "product") {
      link(page, CATEGORIES.find((c) => c.path === page.category)!)
      for (const x of pick(PRODUCTS.filter((p) => p.category === page.category), 3)) link(page, x)
      link(page, HELP[3])
    } else if (page.kind === "article") {
      for (const x of pick(PRODUCTS, 3)) link(page, x)
      for (const x of pick(ARTICLES, 1)) link(page, x)
    } else if (page.kind === "help") {
      for (const x of HELP) link(page, x)
    }
  }

  const list = [...edges.values()]
  const inbound = new Map<string, number>()
  const outbound = new Map<string, number>()
  for (const e of list) {
    outbound.set(e.source, (outbound.get(e.source) ?? 0) + 1)
    inbound.set(e.target, (inbound.get(e.target) ?? 0) + 1)
  }
  const depth = new Map([[url("/"), 0]])
  for (let frontier = [url("/")]; frontier.length; ) {
    const next: string[] = []
    for (const e of list) if (frontier.includes(e.source) && !depth.has(e.target)) { depth.set(e.target, depth.get(e.source)! + 1); next.push(e.target) }
    frontier = next
  }

  const avgIn = list.length / PAGES.length
  const avgOut = list.length / PAGES.length
  const nodes = PAGES.map((p) => {
    const id = url(p.path)
    const i = inbound.get(id) ?? 0
    const o = outbound.get(id) ?? 0
    return {
      id,
      url: id,
      label: p.path === "/" ? new URL(DEMO_BRAND.url).hostname : p.path,
      title: `${p.name}. Nike.com`,
      inboundCount: i,
      outboundCount: o,
      depth: depth.get(id) ?? 0,
      isOrphan: p.path !== "/" && i === 0,
      isHub: o > 0 && o >= avgOut * 1.5,
      isAuthority: i > 0 && i >= avgIn * 1.5,
    }
  })
  const graphOrphans = nodes.filter((n) => n.isOrphan).map((n) => n.url)
  return {
    nodes,
    edges: list.map((e, i) => ({ id: `e${i}`, ...e, strength: 1 })),
    metadata: {
      totalPages: nodes.length,
      totalLinks: list.length,
      maxDepth: Math.max(...nodes.map((n) => n.depth)),
      orphanPages: graphOrphans.length,
      hubPages: nodes.filter((n) => n.isHub).length,
      authorityPages: nodes.filter((n) => n.isAuthority).length,
      averageLinksPerPage: Math.round((list.length / nodes.length) * 10) / 10,
      topLinkedPages: [...nodes]
        .sort((a, b) => b.inboundCount - a.inboundCount)
        .slice(0, 10)
        .map((n) => ({ url: n.url, title: n.title, inboundLinks: n.inboundCount })),
    },
    orphanData: {
      graphOrphans,
      sitemapUnvisited: ["/w/skateboarding-shoes", "/w/walking-shoes", "/a/best-gym-shoes"].map(url),
      sitemapAvailable: true,
      crawlComplete: true,
      confidence: "high",
    },
  }
}

const GRAPH = buildGraph()

const demoData = perAnchor((anchor) => ({
  analysis: {
    id: DEMO_ID,
    domain: DEMO_BRAND.domain,
    url: DEMO_BRAND.url,
    status: "COMPLETED",
    error: null,
    createdAt: new Date(anchor - 2 * 3_600_000 - 90_000).toISOString(),
    completedAt: new Date(anchor - 2 * 3_600_000).toISOString(),
    internalLinkGraph: GRAPH,
  },
}))

/** The ReportHistory pin for this demo, as the history's own rows read. */
export function internalLinksDemoRow() {
  return {
    title: DEMO_BRAND.domain,
    subtitle: `${GRAPH.metadata.totalPages} pages · ${GRAPH.metadata.orphanPages} orphans`,
    href: `/dashboard/ai-internal-linking/results?analysisId=${DEMO_ID}`,
  }
}

export const internalLinksDemo: DemoTool = {
  get(rest) {
    return rest.length === 0 ? demoData() : undefined
  },
}
