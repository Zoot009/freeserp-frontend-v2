// Generates lib/demo/competitor-analysis-data.ts, the Competitor Analysis demo's data:
// nike.com against the top results for "running shoes". Every page below is run
// through the backend's own pipeline, the same calls runAnalysis.worker.ts makes:
// parseHtml() -> finalizeCrawlData() -> mergeAuthority(), stored as page rows, then
// served by ca.view.ts toAnalysisView(). Only the pages' HTML, their PageSpeed and
// authority numbers, and the internal-page summaries are written here.
//
// Run from freeserp-frontend-v2/ (needs freeserp-backend-v2 checked out next to it):
//   node scripts/demo/run.mjs scripts/demo/competitor-analysis.gen.ts

import { writeFileSync } from "node:fs"
import { minimalCrawlData } from "../../../freeserp-backend-v2/src/modules/competitor-analysis/crawl/normalizeCrawlData"
import { challengeFailure } from "../../../freeserp-backend-v2/src/modules/competitor-analysis/crawl/crawlFailure"
import { toAnalysisView } from "../../../freeserp-backend-v2/src/modules/competitor-analysis/ca.view"
import { crawlPage, crumbs, faqSchema, type PageSpec } from "./pages"

type Spec = PageSpec & {
  position: number
  own?: boolean
  internal: { path: string; words: number; h1: string; h2: string[] }[]
}

const KEYWORD = "running shoes"
/** Fixed generation time; lib/demo/competitor-analysis.ts moves every date to "now". */
const AT = "2026-11-18T06:00:00.000Z"

const NIKE_PRODUCTS = ["Nike Pegasus 41", "Nike Vomero 18", "Nike Invincible 3", "Nike Vaporfly 3", "Nike Alphafly 3", "Nike Structure 25", "Nike Winflo 11", "Nike Pegasus Trail 5", "Nike Zegama 2", "Nike Revolution 7", "Nike Downshifter 13", "Nike Interact Run", "Nike Journey Run", "Nike Pegasus Plus", "Nike Streakfly", "Nike Zoom Fly 6"]
const internal = (host: string, base: string[], words: number) =>
  base.map((p, i) => ({ path: `${host}${p}`, words: words + i * 140, h1: p.split("/").filter(Boolean).pop()!.replace(/-/g, " "), h2: ["Featured", "Best sellers", "Buying guide"].slice(0, 2 + (i % 2)) }))

const SPECS: Spec[] = [
  { url: "https://www.brooksrunning.com/en_us/running-shoes/", position: 1,
    title: "Running Shoes for Men & Women | Brooks Running", desc: "Shop running shoes from Brooks. Find the right cushion, support and fit for road and trail, with free shipping and a 90-day trial.",
    h1: "Running Shoes", sections: [{ h2: "How to choose running shoes", paras: 3, h3: ["Cushion", "Support", "Fit"] }, { h2: "Road vs. trail running shoes", paras: 2 }, { h2: "Running shoes by experience level", paras: 2 }],
    products: ["Ghost 16", "Glycerin 21", "Adrenaline GTS 24", "Hyperion Max 2", "Cascadia 18", "Launch 10"], images: 18, altRatio: 0.95,
    external: ["https://www.runnersworld.com/gear/"], schema: [crumbs("https://www.brooksrunning.com/en_us/running-shoes/", "Running Shoes"), faqSchema], faq: true, breadcrumb: true,
    psi: [64, 100, 96, 93, 380, 1500, 2900, 210, 0.03], auth: [72, 58, 1_840_000, 9_400],
    internal: internal("https://www.brooksrunning.com", ["/en_us/womens-running-shoes/", "/en_us/mens-running-shoes/", "/en_us/trail-running-shoes/", "/en_us/shoe-finder/"], 820) },
  { url: "https://www.runnersworld.com/gear/a20865766/best-running-shoes/", position: 2,
    title: "The 18 Best Running Shoes of 2026, Tested and Reviewed", desc: "Our test team ran thousands of miles to find the best running shoes for every runner, from daily trainers to carbon-plated racers.",
    h1: "The Best Running Shoes of 2026", sections: [{ h2: "How we test running shoes", paras: 3 }, { h2: "Best overall: Nike Pegasus 41", paras: 2 }, { h2: "Best cushioned: Brooks Glycerin 21", paras: 2 }, { h2: "Best for racing: Nike Alphafly 3", paras: 2 }, { h2: "Best for beginners: Hoka Clifton 9", paras: 2 }, { h2: "Best stability: Brooks Adrenaline GTS 24", paras: 2 }, { h2: "Best trail: Hoka Speedgoat 6", paras: 2 }, { h2: "How to choose running shoes", paras: 3, h3: ["Cushioning", "Drop", "Fit"] }],
    images: 22, altRatio: 0.86, external: ["https://www.nike.com/w/running-shoes", "https://www.brooksrunning.com/en_us/running-shoes/", "https://www.hoka.com/en/us/mens-road/"],
    schema: [{ "@context": "https://schema.org", "@type": "Article", headline: "The Best Running Shoes of 2026", author: { "@type": "Person", name: "Runner's World Test Team" }, datePublished: "2026-03-02", dateModified: "2026-10-28" }],
    toc: true, video: true, breadcrumb: true,
    psi: [41, 92, 88, 74, 610, 2400, 4800, 980, 0.11], auth: [86, 67, 12_600_000, 3_120],
    internal: internal("https://www.runnersworld.com", ["/gear/a19663621/best-trail-running-shoes/", "/gear/a22114410/best-running-shoes-for-beginners/", "/training/a20781615/marathon-training-plan/"], 2600) },
  { url: "https://www.nike.com/w/running-shoes", position: 3, own: true,
    title: "Running Shoes. Nike.com", desc: "Find running shoes at Nike.com. Free delivery and returns.",
    h1: "Running Shoes", sections: [{ h2: "Shop Running Shoes by Type", paras: 1 }],
    products: NIKE_PRODUCTS, images: 24, altRatio: 0.62, external: [], schema: [{ "@context": "https://schema.org", "@type": "Organization", name: "Nike", url: "https://www.nike.com" }],
    psi: [38, 92, 89, 78, 520, 2100, 4300, 640, 0.06], auth: [91, 64, 48_600_000, 21_300],
    internal: internal("https://www.nike.com", ["/w/mens-running-shoes", "/w/womens-running-shoes", "/w/trail-running-shoes", "/a/best-running-shoes"], 380) },
  { url: "https://www.hoka.com/en/us/mens-road/", position: 4,
    title: "Men's Road Running Shoes | HOKA", desc: "Discover HOKA men's road running shoes, from max-cushion Bondi to the fast Mach. Free shipping and returns.",
    h1: "Men's Road Running Shoes", sections: [{ h2: "Find your road shoe", paras: 2 }, { h2: "Max cushion vs. responsive", paras: 1 }],
    products: ["Clifton 9", "Bondi 8", "Mach 6", "Arahi 7", "Rincon 4", "Skyward X"], images: 16, altRatio: 0.9, external: [],
    schema: [crumbs("https://www.hoka.com/en/us/mens-road/", "Men's Road")], breadcrumb: true,
    psi: [52, 100, 94, 96, 410, 1700, 3400, 330, 0.02], auth: [68, 55, 2_260_000, 4_800],
    internal: internal("https://www.hoka.com", ["/en/us/womens-road/", "/en/us/mens-trail/", "/en/us/shoe-finder/"], 640) },
  { url: "https://www.adidas.com/us/running-shoes", position: 5,
    title: "Running Shoes | adidas US", desc: "Shop adidas running shoes with Boost and Lightstrike cushioning for every run.",
    h1: "Running Shoes", sections: [{ h2: "Running shoes for every run", paras: 1 }],
    products: ["Adizero Adios Pro 4", "Ultraboost 5", "Adizero SL2", "Supernova Rise", "Adizero Boston 12", "Duramo SL"], images: 20, altRatio: 0.75, external: [],
    schema: [crumbs("https://www.adidas.com/us/running-shoes", "Running Shoes")], breadcrumb: true,
    psi: [33, 92, 85, 70, 690, 2600, 5100, 1150, 0.18], auth: [93, 61, 39_700_000, 8_900],
    internal: internal("https://www.adidas.com", ["/us/women-running-shoes", "/us/men-running-shoes", "/us/adizero"], 410) },
  { url: "https://runrepeat.com/catalog/running-shoes", position: 6,
    title: "Running Shoes: 600+ Lab-Tested Models Compared (2026) | RunRepeat", desc: "We cut running shoes in half and test them in our lab. Compare 600+ running shoes by cushioning, weight, drop and price.",
    h1: "Best Running Shoes in 2026", sections: [{ h2: "Our lab test results", paras: 3 }, { h2: "Running shoes by category", paras: 2, h3: ["Daily trainers", "Racing", "Trail"] }, { h2: "How we test", paras: 2 }, { h2: "Running shoe terms explained", paras: 2 }],
    images: 30, altRatio: 0.97, external: ["https://www.nike.com/w/running-shoes", "https://www.brooksrunning.com/en_us/running-shoes/"],
    schema: [crumbs("https://runrepeat.com/catalog/running-shoes", "Running Shoes"), faqSchema], faq: true, toc: true, breadcrumb: true,
    psi: [71, 100, 97, 100, 290, 1200, 2300, 150, 0.01], auth: [58, 52, 410_000, 6_700],
    internal: internal("https://runrepeat.com", ["/catalog/trail-running-shoes", "/catalog/racing-shoes", "/guides/how-to-choose-running-shoes"], 1900) },
  { url: "https://www.rei.com/c/running-shoes", position: 7,
    title: "Running Shoes | REI Co-op", desc: "Shop running shoes at REI. Find road and trail running shoes from top brands, plus expert advice.",
    h1: "Running Shoes", sections: [{ h2: "Expert advice: how to choose running shoes", paras: 2 }, { h2: "Road or trail?", paras: 1 }],
    products: ["Brooks Ghost 16", "Hoka Clifton 9", "Nike Pegasus 41", "On Cloudmonster 2", "Saucony Ride 18"], images: 15, altRatio: 0.93, external: [],
    schema: [crumbs("https://www.rei.com/c/running-shoes", "Running Shoes")], breadcrumb: true,
    psi: [58, 100, 95, 92, 350, 1600, 3100, 280, 0.04], auth: [84, 59, 9_800_000, 2_400],
    internal: internal("https://www.rei.com", ["/c/trail-running-shoes", "/learn/expert-advice/running-shoes.html", "/c/running-clothing"], 700) },
]

// ── Run each page through the backend pipeline, store it as a page row ───────
const rows = SPECS.map((s) => {
  const { page, fullCrawlData, columns } = crawlPage(s, KEYWORD, AT)
  const m = page.metaTags as unknown as { title?: string; description?: string }
  const ia = page.imageAnalysis as unknown as { total?: number }
  const la = page.linkAnalysis as unknown as { total?: number; internal?: number; external?: number }
  const c = page.content as unknown as { wordCount?: number }
  const pages = s.internal.map((p) => ({ url: p.path, wordCount: p.words, h1Count: 1, h2Count: p.h2.length, h1Tags: [p.h1], h2Tags: p.h2 }))
  const total = pages.reduce((n, p) => n + p.wordCount, 0)
  return {
    domain: new URL(s.url).hostname.replace(/^www\./, ""), url: s.url, position: s.position, isOwnSite: !!s.own,
    title: m.title ?? null, metaDescription: m.description ?? null,
    h1Tags: page.headings?.h1 ?? [], h2Tags: page.headings?.h2 ?? [], h3Tags: page.headings?.h3 ?? [],
    wordCount: c.wordCount ?? null, imageCount: ia.total ?? null, linkCount: la.total ?? null,
    internalLinks: la.internal ?? null, externalLinks: la.external ?? null,
    fullCrawlData, ...columns, crawlMethod: page.crawlMethod, crawledAt: new Date(AT),
    internalCrawlStatus: "done", internalPagesCrawled: pages.length, totalInternalWordCount: total,
    avgWordsPerPage: Math.round(total / pages.length), totalH1Tags: pages.length, totalH2Tags: pages.reduce((n, p) => n + p.h2Count, 0),
    internalPagesData: pages, internalLinkGraph: null,
  }
})

// Amazon's results page sits behind a bot wall: the crawl fails, as real ones do.
const amazon = "https://www.amazon.com/running-shoes/s?k=running+shoes"
const blocked = { ...minimalCrawlData(amazon, 9800, challengeFailure("Amazon.com", 503)), crawledAt: AT, crawlError: { code: "BOT_PROTECTION", httpStatus: 503 } }
rows.push({
  domain: "amazon.com", url: amazon, position: 8, isOwnSite: false, title: null, metaDescription: null, h1Tags: [], h2Tags: [], h3Tags: [],
  wordCount: null, imageCount: null, linkCount: null, internalLinks: null, externalLinks: null,
  fullCrawlData: blocked as never, domainAuthority: 96, pageAuthority: 48, domainBacklinks: 61_200_000, pageBacklinks: 1_100,
  crawlMethod: "minimal", crawledAt: new Date(AT), internalCrawlStatus: "failed", internalPagesCrawled: 0, totalInternalWordCount: 0,
  avgWordsPerPage: 0, totalH1Tags: 0, totalH2Tags: 0, internalPagesData: [], internalLinkGraph: null,
} as never)

const view = toAnalysisView({
  id: "demo", status: "COMPLETED", keyword: KEYWORD, yourDomain: "nike.com", error: null, isPartial: false, aiPlan: null,
  createdAt: new Date(Date.parse(AT) - 6 * 60_000), mainCrawlCompletedAt: new Date(Date.parse(AT) - 3 * 60_000), completedAt: new Date(AT),
  pages: rows,
} as never, "paid")

const out = `// GENERATED by scripts/demo/competitor-analysis.gen.ts from the backend's own crawl
// parsing and analysis view. Do not edit by hand; change the generator and rerun it.
/* eslint-disable */
export const GENERATED_AT = ${JSON.stringify(AT)}
export const ANALYSIS = ${JSON.stringify(view)}
`
writeFileSync("lib/demo/competitor-analysis-data.ts", out)
console.log(`lib/demo/competitor-analysis-data.ts: ${rows.length} pages, ${(out.length / 1024).toFixed(0)} KB`)
