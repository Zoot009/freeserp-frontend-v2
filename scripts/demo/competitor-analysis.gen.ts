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
import { parseHtml } from "../../../freeserp-backend-v2/src/modules/competitor-analysis/crawl/parseHtml"
import { finalizeCrawlData, minimalCrawlData } from "../../../freeserp-backend-v2/src/modules/competitor-analysis/crawl/normalizeCrawlData"
import { challengeFailure } from "../../../freeserp-backend-v2/src/modules/competitor-analysis/crawl/crawlFailure"
import { mergeAuthority } from "../../../freeserp-backend-v2/src/modules/competitor-analysis/crawl/authorityMerge"
import { toAnalysisView } from "../../../freeserp-backend-v2/src/modules/competitor-analysis/ca.view"

const KEYWORD = "running shoes"
/** Fixed generation time; lib/demo/competitor-analysis.ts moves every date to "now". */
const AT = "2026-11-18T06:00:00.000Z"

// ── Page text: a bank of sentences, some carrying the keyword ────────────────
const BANK = [
  "The right running shoes depend on how far you run, how fast, and what feels good underfoot.",
  "Cushioning protects your legs on long runs, while a firmer midsole gives more feedback at speed.",
  "Stability shoes guide the foot if it rolls inward, and neutral shoes let it move naturally.",
  "Most runners replace their running shoes every 300 to 500 miles, sooner if the foam feels flat.",
  "A carbon plate stiffens the forefoot and returns energy, which is why race-day shoes feel so fast.",
  "Trail running shoes add lugged outsoles and rock plates for grip and protection off road.",
  "Heel-to-toe drop changes how your foot lands; lower drops shift load toward the calves.",
  "Try running shoes on in the afternoon, when your feet are at their largest, with your usual socks.",
  "Leave about a thumb's width of space in front of your longest toe so you have room on downhills.",
  "Lightweight trainers suit tempo days, and max-cushion models make easy recovery miles kinder.",
  "Breathable engineered mesh keeps feet cool, and a padded collar locks the heel in place.",
  "If you are new to running, start with a neutral daily trainer that feels comfortable from the first step.",
  "Rotating two pairs of running shoes lets the foam recover between runs and spreads the wear.",
  "Wide-fit options matter: a shoe that pinches at mile one will hurt far more at mile ten.",
  "Waterproof uppers help in winter, but they trap heat on warm days, so most runners skip them.",
]
const para = (seed: number, n = 4) => `<p>${Array.from({ length: n }, (_, i) => BANK[(seed * 3 + i) % BANK.length]).join(" ")}</p>`

type Spec = {
  url: string
  position: number
  own?: boolean
  title: string
  desc: string
  h1: string
  sections: { h2: string; paras: number; h3?: string[] }[]
  products?: string[]
  images: number
  altRatio: number
  external: string[]
  schema: Record<string, unknown>[]
  faq?: boolean
  toc?: boolean
  video?: boolean
  breadcrumb?: boolean
  psi: [perf: number, seo: number, a11y: number, bp: number, ttfb: number, fcp: number, lcp: number, tbt: number, cls: number]
  auth: [da: number, pa: number, domainBacklinks: number, pageBacklinks: number]
  internal: { path: string; words: number; h1: string; h2: string[] }[]
}

function html(s: Spec): string {
  const host = new URL(s.url).origin
  const imgs = Array.from({ length: s.images }, (_, i) =>
    `<img src="${host}/img/${i + 1}.jpg" ${i < Math.round(s.images * s.altRatio) ? `alt="${s.h1} ${i + 1}"` : ""} loading="${i > 2 ? "lazy" : "eager"}" width="400" height="400">`).join("")
  const body = s.sections.map((sec, i) =>
    `<h2 id="s${i}">${sec.h2}</h2>${Array.from({ length: sec.paras }, (_, k) => para(i * 7 + k)).join("")}${(sec.h3 ?? []).map((h, k) => `<h3>${h}</h3>${para(i * 11 + k, 3)}`).join("")}`).join("")
  const products = (s.products ?? []).map((p, i) => `<li><a href="${host}/p/${i + 1}">${p}</a> <span>$${110 + (i % 6) * 15}</span></li>`).join("")
  const faq = s.faq
    ? `<section class="faq"><h2>Running shoe FAQs</h2><h3>How often should I replace running shoes?</h3>${para(3, 2)}<h3>Are running shoes good for walking?</h3>${para(5, 2)}<h3>How should running shoes fit?</h3>${para(8, 2)}</section>`
    : ""
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${s.title}</title><meta name="description" content="${s.desc}"><link rel="canonical" href="${s.url}"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="/favicon.ico"><meta property="og:title" content="${s.title}"><meta property="og:description" content="${s.desc}"><meta name="twitter:card" content="summary_large_image">${s.schema.map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join("")}</head>` +
    `<body><header><nav><a href="${host}/">Home</a><a href="${host}/men">Men</a><a href="${host}/women">Women</a><a href="${host}/sale">Sale</a></nav></header>` +
    `${s.breadcrumb ? `<nav class="breadcrumb"><a href="${host}/">Home</a> / <span>${s.h1}</span></nav>` : ""}` +
    `<main><h1>${s.h1}</h1>${s.toc ? `<nav class="table-of-contents"><ol>${s.sections.map((x, i) => `<li><a href="#s${i}">${x.h2}</a></li>`).join("")}</ol></nav>` : ""}` +
    `${s.video ? `<iframe src="https://www.youtube.com/embed/demo" title="Video"></iframe>` : ""}${body}${products ? `<ul class="products">${products}</ul>` : ""}${imgs}${faq}` +
    `${s.external.map((u) => `<a href="${u}" rel="noopener">${new URL(u).hostname}</a>`).join(" ")}</main>` +
    `<footer><a href="${host}/privacy">Privacy Policy</a><a href="${host}/terms">Terms of Use</a><a href="${host}/contact">Contact Us</a><a href="https://www.instagram.com/x">Instagram</a></footer></body></html>`
}

const NIKE_PRODUCTS = ["Nike Pegasus 41", "Nike Vomero 18", "Nike Invincible 3", "Nike Vaporfly 3", "Nike Alphafly 3", "Nike Structure 25", "Nike Winflo 11", "Nike Pegasus Trail 5", "Nike Zegama 2", "Nike Revolution 7", "Nike Downshifter 13", "Nike Interact Run", "Nike Journey Run", "Nike Pegasus Plus", "Nike Streakfly", "Nike Zoom Fly 6"]
const crumbs = (url: string, name: string) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: new URL(url).origin }, { "@type": "ListItem", position: 2, name, item: url }] })
const faqSchema = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "How often should I replace running shoes?", acceptedAnswer: { "@type": "Answer", text: "Every 300 to 500 miles." } }] }
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
  const raw = parseHtml({ html: html(s), url: s.url, targetKeyword: KEYWORD, responseHeaders: { "content-type": "text/html; charset=utf-8", server: "cloudflare" } })
  raw.httpStatus = 200
  const page = finalizeCrawlData({ raw, crawlMethod: "playwright", crawlTime: 4200 })
  const [perf, seo, a11y, bp, ttfb, fcp, lcp, tbt, cls] = s.psi
  const psiData = { strategy: "mobile", scores: { performance: perf, seo, accessibility: a11y, bestPractices: bp }, vitals: { ttfb, fcp, lcp, tbt, cls, si: fcp + 900, tti: lcp + 1200 } }
  const fullCrawlData: Record<string, unknown> = { ...page, psiData }
  const [da, pa, domainBacklinks, pageBacklinks] = s.auth
  const merged = mergeAuthority(fullCrawlData, { status: "ok", da, pa, domainBacklinks, pageBacklinks, source: "moz" } as never, AT)
  fullCrawlData.authority = merged.authority
  fullCrawlData.backlinks = merged.backlinks
  // Page text (up to 10 KB a page) that no report surface reads; dropped to keep the demo small.
  delete (fullCrawlData.content as Record<string, unknown>).contentText
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
    fullCrawlData, ...merged.columns, crawlMethod: page.crawlMethod, crawledAt: new Date(AT),
    internalCrawlStatus: "done", internalPagesCrawled: pages.length, totalInternalWordCount: total,
    avgWordsPerPage: Math.round(total / pages.length), totalH1Tags: pages.length, totalH2Tags: pages.reduce((n, p) => n + p.h2Count, 0),
    internalPagesData: pages, internalLinkGraph: null,
  }
})

// Amazon's results page sits behind a bot wall: the crawl fails, as real ones do.
const amazon = "https://www.amazon.com/running-shoes/s?k=running+shoes"
const blocked = { ...minimalCrawlData(amazon, 9800, challengeFailure("Amazon.com", 503)), crawlError: { code: "BOT_PROTECTION", httpStatus: 503 } }
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
