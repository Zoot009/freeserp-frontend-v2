// Synthetic pages for the demo generators: HTML built from a short spec, then run
// through the backend's own crawl pipeline exactly as the workers do
// (runAnalysis.worker.ts, runKeywordAnalysis.worker.ts): parseHtml() ->
// finalizeCrawlData() -> PageSpeed payload -> mergeAuthority().

import { parseHtml } from "../../../freeserp-backend-v2/src/modules/competitor-analysis/crawl/parseHtml"
import { finalizeCrawlData } from "../../../freeserp-backend-v2/src/modules/competitor-analysis/crawl/normalizeCrawlData"
import { mergeAuthority } from "../../../freeserp-backend-v2/src/modules/competitor-analysis/crawl/authorityMerge"

// ── Page text: a bank of sentences, some carrying the keyword ────────────────
export const BANK = [
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
export const para = (seed: number, n = 4) => `<p>${Array.from({ length: n }, (_, i) => BANK[(seed * 3 + i) % BANK.length]).join(" ")}</p>`

export type PageSpec = {
  url: string
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
}

export function html(s: PageSpec): string {
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

export const crumbs = (url: string, name: string) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: new URL(url).origin }, { "@type": "ListItem", position: 2, name, item: url }] })
export const faqSchema = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "How often should I replace running shoes?", acceptedAnswer: { "@type": "Answer", text: "Every 300 to 500 miles." } }] }

/** One page through the crawl pipeline: the stored crawl blob plus the row's authority columns. */
export function crawlPage(s: PageSpec, keyword: string, at: string) {
  const raw = parseHtml({ html: html(s), url: s.url, targetKeyword: keyword, responseHeaders: { "content-type": "text/html; charset=utf-8", server: "cloudflare" } })
  raw.httpStatus = 200
  const page = finalizeCrawlData({ raw, crawlMethod: "playwright", crawlTime: 4200 })
  const [perf, seo, a11y, bp, ttfb, fcp, lcp, tbt, cls] = s.psi
  const psiData = { strategy: "mobile", scores: { performance: perf, seo, accessibility: a11y, bestPractices: bp }, vitals: { ttfb, fcp, lcp, tbt, cls, si: fcp + 900, tti: lcp + 1200 } }
  // finalizeCrawlData stamps the wall clock; pinned to `at` so reruns are byte-identical.
  const fullCrawlData: Record<string, unknown> = { ...page, crawledAt: at, psiData }
  const [da, pa, domainBacklinks, pageBacklinks] = s.auth
  const merged = mergeAuthority(fullCrawlData, { status: "ok", da, pa, domainBacklinks, pageBacklinks, source: "moz" } as never, at)
  fullCrawlData.authority = merged.authority
  fullCrawlData.backlinks = merged.backlinks
  // Page text (up to 10 KB a page) that no report surface reads; dropped to keep the demos small.
  delete (fullCrawlData.content as Record<string, unknown>).contentText
  return { page, fullCrawlData, columns: merged.columns }
}
