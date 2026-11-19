// Generates lib/demo/aeo-audit-data.ts, the AEO & GEO Audit demo's data, by running
// the backend's own AEO engine on a synthetic nike.com crawl: runChecks(), score(),
// engineScores(), buildReport(), compareAudits() — the same calls aeo.run.ts and
// aeo.service.ts make. The AI engines' answers can't be replayed, so they are
// written below and summarised the way visibility.ts summarises real ones.
//
// Needs freeserp-backend-v2 checked out next to this repo (with node_modules).
// From freeserp-frontend-v2/:
//   node_modules/.bin/esbuild scripts/demo/aeo-audit.gen.ts --bundle --platform=node --outfile=/tmp/aeo-gen.js && node /tmp/aeo-gen.js
// Excluded from tsconfig: its imports resolve against the backend, not this app.
import { runChecks } from "../../../freeserp-backend-v2/src/modules/aeo-audit/engine/checks"
import { score } from "../../../freeserp-backend-v2/src/modules/aeo-audit/engine/scoring/score"
import { engineScores } from "../../../freeserp-backend-v2/src/modules/aeo-audit/engine/scoring/engines"
import { buildReport, compareAudits } from "../../../freeserp-backend-v2/src/modules/aeo-audit/engine/report"
import { parseRobots } from "../../../freeserp-backend-v2/src/modules/aeo-audit/engine/crawl/robots"
import { parseSitemap } from "../../../freeserp-backend-v2/src/modules/aeo-audit/engine/crawl/sitemap"

const O = "https://www.nike.com"
const CRAWLED_AT = "2026-11-18T06:00:00.000Z"
const ok = (url: string, body: string, extra: Record<string, unknown> = {}) => ({
  url, finalUrl: url, redirects: [] as string[], neededCookies: false, status: 200,
  headers: { "content-type": "text/html; charset=utf-8", "content-encoding": "br", "cache-control": "max-age=300" },
  body, truncated: false, ms: 640, ...extra,
})
const ld = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`
const head = (title: string, desc: string, path: string, more = "") =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><meta name="description" content="${desc}"><link rel="canonical" href="${O}${path}"><meta name="viewport" content="width=device-width, initial-scale=1"><meta property="og:title" content="${title}"><meta property="og:image" content="${O}/og.jpg">${more}</head>`
const nav = `<header><nav><a href="/">Nike</a><a href="/w/new-arrivals">New &amp; Featured</a><a href="/w/mens-shoes">Men</a><a href="/w/womens-shoes">Women</a><a href="/w/kids-shoes">Kids</a><a href="/w/sale">Sale</a><span class="nav-link" onclick="location.href='/membership'">Join Us</span><span class="nav-link" onclick="location.href='/retail'">Find a Store</span></nav></header>`
const foot = `<footer><a href="/about">About Nike</a><a href="/help">Help</a><a href="/help/a/contact-us">Contact Us</a><a href="/sustainability">Sustainability</a><a href="https://www.instagram.com/nike">Instagram</a><a href="https://www.youtube.com/@nike">YouTube</a><p>© 2026 Nike, Inc. All rights reserved.</p></footer>`

const org = { "@context": "https://schema.org", "@type": "Organization", name: "Nike", url: O, logo: `${O}/logo.png`,
  sameAs: ["https://www.facebook.com/nike", "https://www.instagram.com/nike", "https://x.com/Nike", "https://www.youtube.com/@nike", "https://en.wikipedia.org/wiki/Nike,_Inc."] }

const home = head("Nike. Just Do It. Nike.com", "Inspiring the world's athletes, Nike delivers innovative products, experiences and services. Free delivery and returns for Nike Members.", "/", ld(org)) +
  `<body>${nav}<main><h1>Just Do It</h1><section><h2>Featured</h2><img src="/img/pegasus-41.jpg" alt="Nike Pegasus 41 road running shoe"><img src="/img/air-max-dn.jpg" alt=""><img src="/img/hero-video-poster.jpg"><p>Meet the Pegasus 41: responsive ReactX foam and Air Zoom units in the forefoot and heel for a smooth, springy ride on everyday runs.</p></section>` +
  `<section><h2>Shop by Sport</h2><ul><li><a href="/running">Running</a></li><li><a href="/basketball">Basketball</a></li><li><a href="/training">Training</a></li><li><a href="/football">Football</a></li><li><a href="/yoga">Yoga</a></li></ul></section>` +
  `<section><h2>Nike Membership</h2><p>Members get free delivery on every order, early access to new releases, and exclusive products. Join for free and start earning rewards today.</p></section></main>${foot}<script src="/_next/static/chunks/main.js"></script></body></html>`

const category = head("Running Shoes. Nike.com", "Find the best running shoes at Nike.com. Free delivery and returns.", "/w/running-shoes") +
  `<body>${nav}<div id="__next"><h1>Running Shoes</h1><div class="product-grid" data-state="loading"></div></div><script src="/_next/static/chunks/plp.js"></script>${foot}</body></html>`

const words = (n: number, seed: string) => Array.from({ length: n }, (_, i) => seed.split(" ")[i % seed.split(" ").length]).join(" ")
const article = head("The Best Nike Running Shoes. Nike.com", "From daily trainers to race-day super shoes, here are the best Nike running shoes for every kind of runner.", "/a/best-running-shoes",
  ld({ "@context": "https://schema.org", "@type": "Article", headline: "The Best Nike Running Shoes", datePublished: "2025-02-10", image: `${O}/img/best-running.jpg`, publisher: { "@type": "Organization", name: "Nike" } })) +
  `<body>${nav}<main><article><h1>The Best Nike Running Shoes</h1>` +
  `<p>${words(210, "Choosing a running shoe comes down to how far you run, how fast, and what feels good underfoot. Cushioning, stability and weight all trade off against each other, and the right mix depends on your stride and your goals.")}</p>` +
  `<h2>Best everyday shoe: Pegasus 41</h2><p>The Pegasus 41 is the workhorse of the line. ReactX foam returns more energy than the previous version, and it handles easy miles and tempo days alike.</p>` +
  `<h2>Best for long runs: Vomero 18</h2><p>Maximum cushioning for recovery days and long runs. The Vomero 18 stacks ZoomX over ReactX for a soft, stable ride.</p>` +
  `<h4>Who should skip it</h4><p>Runners who want a lighter, firmer shoe for speed work.</p>` +
  `<h2>Best for racing: Vaporfly 3</h2><p>A carbon plate and ZoomX foam make the Vaporfly 3 one of the fastest shoes available for 10K to marathon racing.</p>` +
  `<table><tr><th>Shoe</th><th>Best for</th><th>Drop</th></tr><tr><td>Pegasus 41</td><td>Everyday</td><td>10 mm</td></tr><tr><td>Vomero 18</td><td>Long runs</td><td>10 mm</td></tr><tr><td>Vaporfly 3</td><td>Racing</td><td>8 mm</td></tr></table>` +
  `</article></main>${foot}</body></html>`

const help = head("Nike Help. Nike.com", "Get help with orders, returns, shipping and your Nike Member account.", "/help") +
  `<body>${nav}<main><h1>Get Help</h1><h2>Frequently asked questions</h2>` +
  `<h3>What is Nike's return policy?</h3><p>Nike Members get 60 days to wear and test their gear. Return items for free by mail or in a Nike store.</p>` +
  `<h3>How long does delivery take?</h3><p>Standard delivery takes 3 to 5 business days. Express delivery arrives in 2 to 4 business days.</p>` +
  `<h3>Can I change or cancel my order?</h3><p>You can cancel an order within 30 minutes of placing it from the Orders section of your account.</p>` +
  `<h3>Do you offer free shipping?</h3><p>Nike Members get free standard shipping on every order.</p></main>${foot}</body></html>`

const about = head("About Nike. Nike.com", "Nike's mission is to bring inspiration and innovation to every athlete in the world.", "/about") +
  `<body>${nav}<main><h1>About Nike</h1><p>Nike, Inc. was founded in 1964 as Blue Ribbon Sports by Bill Bowerman and Phil Knight, and became Nike in 1971. Our mission is to bring inspiration and innovation to every athlete in the world. If you have a body, you are an athlete.</p><h2>Headquarters</h2><p>One Bowerman Drive, Beaverton, Oregon 97005, USA.</p><h2>Leadership</h2><p>Nike is led by a team of executives responsible for product, marketing and operations across 190 countries.</p></main>${foot}</body></html>`

const contact = head("Contact Us. Nike.com", "Contact Nike customer service by phone or chat.", "/help/a/contact-us") +
  `<body>${nav}<main><h1>Contact Us</h1><p>Call us at <a href="tel:+18008066453">1-800-806-6453</a>, 4 AM to 11 PM PT, seven days a week.</p><p>Chat with us from the Help page, or visit a Nike store near you.</p><address>One Bowerman Drive, Beaverton, OR 97005</address></main>${foot}</body></html>`

const pages = [
  { ...ok(`${O}/`, home), reason: "home" },
  { ...ok(`${O}/w/running-shoes`, category, { ms: 1840 }), reason: "link" },
  { ...ok(`${O}/a/best-running-shoes`, article, { ms: 910 }), reason: "article" },
  { ...ok(`${O}/help`, help), reason: "faq" },
  { ...ok(`${O}/about`, about), reason: "about" },
  { ...ok(`${O}/help/a/contact-us`, contact), reason: "contact" },
]

const robotsTxt = "User-agent: *\nDisallow: /checkout/\nDisallow: /cart\nDisallow: /member/\nDisallow: /search?\n\nUser-agent: GPTBot\nDisallow: /\n\nUser-agent: CCBot\nDisallow: /\n\nSitemap: https://www.nike.com/sitemap.xml\n"
const lastmods = ["2026-11-12", "2026-11-02", "2026-10-21", "2025-02-10", "2024-08-30", "2026-09-14", "2023-11-05", "2026-11-15"]
const smPaths = ["/", "/w/running-shoes", "/w/basketball-shoes", "/a/best-running-shoes", "/a/how-to-clean-white-shoes", "/help", "/about", "/w/new-arrivals"]
const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${smPaths.map((p, i) => `<url><loc>${O}${p}</loc><lastmod>${lastmods[i]}</lastmod></url>`).join("")}</urlset>`
const sm = parseSitemap(sitemapXml)

const crawl: any = {
  crawledAt: CRAWLED_AT,
  origin: O,
  finalOrigin: O,
  robots: { ...ok(`${O}/robots.txt`, robotsTxt, { headers: { "content-type": "text/plain" } }), state: "ok", parsed: parseRobots(robotsTxt) },
  variants: [
    { url: "http://www.nike.com/", fetched: ok("http://www.nike.com/", home, { finalUrl: `${O}/`, redirects: [`${O}/`] }) },
    { url: "https://nike.com/", fetched: ok("https://nike.com/", home, { finalUrl: `${O}/`, redirects: [`${O}/`] }) },
  ],
  llmsTxt: { ...ok(`${O}/llms.txt`, "Not Found", { status: 404, headers: { "content-type": "text/html" } }) },
  sitemaps: [{ url: `${O}/sitemap.xml`, status: 200, kind: sm.kind, count: 24812, entries: sm.entries }],
  pages,
  skipped: [{ url: `${O}/w/sale`, reason: "Page limit reached" }],
}

const findings = runChecks(crawl)
const scored = score(findings)
const engines = engineScores(crawl, scored.categories)


// ── Measured visibility: hand-written answers, summarised exactly as visibility.ts does ──
const Q = [
  { question: "What are the best running shoes for beginners?" },
  { question: "Which running shoes are best for flat feet?" },
  { question: "What should I look for in basketball shoes?" },
  { question: "How do I clean white sneakers?" },
  { question: "Is the Nike Pegasus good for marathon training?", branded: true as const },
  { question: "Does Nike offer free returns?", branded: true as const },
]
type R = [outcome: string, cited: string[], position?: number]
const ANSWERS: Record<string, R[]> = {
  chatgpt: [["consulted", ["runnersworld.com", "runrepeat.com", "reddit.com"]], ["absent", ["runrepeat.com", "verywellfit.com"]], ["named", ["espn.com", "footlocker.com"]], ["absent", ["reddit.com", "wikihow.com"]], ["cited", ["runnersworld.com", "nike.com"], 2], ["cited", ["nike.com"], 1]],
  perplexity: [["cited", ["runnersworld.com", "runrepeat.com", "nike.com", "reddit.com"], 3], ["consulted", ["verywellfit.com", "runrepeat.com"]], ["named", ["footlocker.com", "espn.com", "reddit.com"]], ["absent", ["wikihow.com", "reddit.com"]], ["cited", ["nike.com", "runnersworld.com"], 1], ["cited", ["nike.com"], 1]],
  gemini: [["named", ["runnersworld.com", "rei.com"]], ["absent", ["verywellfit.com", "healthline.com"]], ["absent", ["footlocker.com", "dickssportinggoods.com"]], ["absent", ["wikihow.com"]], ["cited", ["runnersworld.com", "nike.com"], 2], ["cited", ["nike.com"], 1]],
  "ai-overviews": [["cited", ["runnersworld.com", "rei.com", "runrepeat.com", "nike.com"], 4], ["absent", ["verywellfit.com", "runrepeat.com"]], ["none", []], ["consulted", ["wikihow.com", "reddit.com"]], ["cited", ["nike.com", "runnersworld.com"], 1], ["cited", ["nike.com"], 1]],
  claude: [["absent", ["runnersworld.com", "runrepeat.com"]], ["absent", ["verywellfit.com"]], ["named", ["espn.com"]], ["absent", ["wikihow.com"]], ["named", ["runnersworld.com"]], ["cited", ["nike.com"], 1]],
}
const ours = (d: string) => d === "nike.com"
const measured = Object.entries(ANSWERS).map(([engine, rs]) => {
  const questions = rs.map(([outcome, cited, position], i) => ({ ...Q[i], outcome, ...(position ? { position } : {}), cited }))
  const answered = questions.filter((r) => r.outcome)
  const cited = answered.filter((r) => r.outcome === "cited").length
  const counts = new Map<string, number>()
  for (const r of answered) for (const d of r.cited) if (!ours(d)) counts.set(d, (counts.get(d) ?? 0) + 1)
  const competitors = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map(([domain, answers]) => ({ domain, answers }))
  return { engine, market: { country: "US", language: "en" }, status: "done", score: Math.round((100 * cited) / answered.length), cited, answered: answered.length, questions, competitors }
})

// ── The previous audit: Organization schema and two canonicals were broken, author bylines fine ──
const prev = findings.map((f) => ({ ...f }))
const flip = (checkId: string, n: number, passed: boolean, title?: string, severity?: string) => {
  let left = n
  for (const f of prev) if (f.checkId === checkId && left > 0) { f.passed = passed; if (title) f.title = title; if (severity) (f as any).severity = severity; left-- }
}
flip("schema.organization", 1, false, "No Organization schema", "HIGH")
flip("tech.canonical", 2, false, "No canonical tag", "LOW")
flip("trust.author", 1, true, "Author shown")
const prevScore = score(prev as any)

// ── Shapes as stored and served (aeo.run.ts siteFacts/pageFacts, aeo.service.ts report) ──
const site = {
  finalOrigin: crawl.finalOrigin,
  robots: { url: crawl.robots.url, status: crawl.robots.status, state: crawl.robots.state,
    agents: [...new Set(crawl.robots.parsed.groups.flatMap((g: any) => g.agents))], sitemaps: crawl.robots.parsed.sitemaps.map((s: any) => s.url) },
  llmsTxt: { url: crawl.llmsTxt.finalUrl, status: crawl.llmsTxt.status, contentType: String(crawl.llmsTxt.headers["content-type"] ?? ""), bytes: Buffer.byteLength(crawl.llmsTxt.body) },
  sitemaps: crawl.sitemaps.map(({ url, status, error, kind, count }: any) => ({ url, status, error, kind, count })),
  skipped: crawl.skipped,
}
const pageRows = crawl.pages.map((p: any, i: number) => ({
  id: `demo-page-${i + 1}`, url: p.url, statusCode: p.status,
  facts: { reason: p.reason, finalUrl: p.finalUrl, redirects: p.redirects, ms: p.ms, contentType: String(p.headers["content-type"] ?? ""), bytes: Buffer.byteLength(p.body), truncated: p.truncated },
}))
const { fixes, strengths } = buildReport(findings as any)
const idx = new Map(findings.map((f, i) => [f, i]))
const compact = fixes.map((f: any) => ({ ...f, failing: f.failing.map((x: any) => idx.get(x)) }))
if (compact.some((f: any) => f.failing.some((i: any) => i === undefined))) throw new Error("fix failing not found by identity")

const data = {
  breakdown: { ...scored, engines, measured },
  site,
  pages: pageRows,
  findings,
  fixes: compact,
  strengths,
  previous: { aeoScore: prevScore.aeo, geoScore: prevScore.geo, ...compareAudits(prev as any, findings as any) },
}
const out = `// GENERATED by running the backend's own AEO engine (checks, scoring, report) on a
// synthetic nike.com crawl — see the header of aeo-audit.ts. Do not edit by hand.
/* eslint-disable */
export const AEO_DEMO = ${JSON.stringify(data)} as const
`
require("fs").writeFileSync("lib/demo/aeo-audit-data.ts", out)
console.log(`lib/demo/aeo-audit-data.ts: ${findings.length} findings, AEO ${scored.aeo}, GEO ${scored.geo}, ${fixes.length} fixes`)
