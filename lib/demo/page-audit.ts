// Demo report for the Website Audit / Page Audit tool: a whole-site audit of
// nike.com, generated in the browser. Spec: .claude/skills/demo-report/SKILL.md.
//
// lib/demo/index.ts routes GET /api/page-audit/reports/demo… here. Shapes mirror
// the backend:
//   pageAudit.service.ts   getReport, getIssueGroups, getIssuePages,
//                          getReportPages, list (the history row)
//   auditReportStore.ts    the AuditReport row's fields
//   analyzer/SeoAnalyzer.ts + analyzer/scoring.ts   category, overall and
//                          section scores — computed here from the checks with
//                          the same formulas, so grades agree with findings
//   site-crawl/linkGraph.ts                         linkGraph
// The check catalogue (names, what/why/how) is the backend's own, verbatim, in
// page-audit-checks.ts; this file only adds Nike's results.

import { CHECK_DEFS, type CheckDef } from "./page-audit-checks"
import { DAY_MS, DEMO_BRAND, DEMO_ID, perAnchor, prng, type DemoTool } from "./shared"

/** Where the demo's CTAs lead: the whole-site audit form, which this report came from. */
export const PAGE_AUDIT_CREATE_HREF = "/dashboard/site-audit"

const url = (path: string) => `${DEMO_BRAND.url}${path}`

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
type Category = CheckDef["category"]
type Kind = "home" | "shop" | "article" | "section" | "help" | "other"

// ── The crawl: 48 pages, in crawl order ─────────────────────────────────────

const PAGES: [path: string, title: string, kind: Kind][] = [
  ["/", "Nike. Just Do It. Nike.com", "home"],
  ["/w/mens-shoes", "Men's Shoes, Sneakers & Trainers. Nike.com", "shop"],
  ["/w/womens-shoes", "Women's Shoes, Sneakers & Trainers. Nike.com", "shop"],
  ["/w/kids-shoes", "Kids' Shoes & Sneakers. Nike.com", "shop"],
  ["/w/new-arrivals", "New Arrivals: Shoes, Clothing & Gear. Nike.com", "shop"],
  ["/w/sale", "Sale: Shoes, Clothing & Accessories. Nike.com", "shop"],
  ["/w/running-shoes", "Running Shoes. Nike.com", "shop"],
  ["/w/basketball-shoes", "Basketball Shoes. Nike.com", "shop"],
  ["/w/jordan", "Jordan Shoes, Clothing & Gear. Nike.com", "shop"],
  ["/w/air-max-shoes", "Air Max Shoes. Nike.com", "shop"],
  ["/w/air-force-1-shoes", "Air Force 1 Shoes. Nike.com", "shop"],
  ["/w/trail-running-shoes", "Trail Running Shoes. Nike.com", "shop"],
  ["/w/training-gym-shoes", "Training & Gym Shoes. Nike.com", "shop"],
  ["/w/soccer-shoes", "Soccer Cleats & Shoes. Nike.com", "shop"],
  ["/w/tennis-shoes", "Tennis Shoes. Nike.com", "shop"],
  ["/w/sandals-slides", "Sandals & Slides. Nike.com", "shop"],
  ["/w/mens-clothing", "Men's Clothing & Apparel. Nike.com", "shop"],
  ["/w/womens-clothing", "Women's Clothing & Apparel. Nike.com", "shop"],
  ["/w/womens-training-clothing", "Women's Workout & Training Clothes. Nike.com", "shop"],
  ["/w/bags-backpacks", "Bags & Backpacks. Nike.com", "shop"],
  ["/w/socks", "Socks. Nike.com", "shop"],
  ["/running", "Nike Running. Shoes, Apparel, Plans & Stories. Nike.com", "section"],
  ["/basketball", "Nike Basketball. Nike.com", "section"],
  ["/training", "Nike Training. Nike.com", "section"],
  ["/football", "Nike Football (Soccer). Nike.com", "section"],
  ["/yoga", "Nike Yoga. Nike.com", "section"],
  ["/kids", "Kids. Nike.com", "section"],
  ["/launch", "SNKRS Launch Calendar. Nike.com", "section"],
  ["/a/best-running-shoes", "The Best Nike Running Shoes. Nike.com", "article"],
  ["/a/how-to-clean-white-shoes", "How to Clean White Shoes. Nike.com", "article"],
  ["/a/running-shoes-for-flat-feet", "The Best Running Shoes for Flat Feet. Nike.com", "article"],
  ["/a/how-to-lace-running-shoes", "How to Lace Running Shoes. Nike.com", "article"],
  ["/a/marathon-training-plan", "A Marathon Training Plan for Every Level. Nike.com", "article"],
  ["/a/strength-training-for-runners", "Strength Training for Runners. Nike.com", "article"],
  ["/a/how-to-choose-basketball-shoes", "How to Choose Basketball Shoes. Nike.com", "article"],
  ["/a/shoe-size-guide", "Shoe Size Guide: How to Find Your Fit. Nike.com", "article"],
  ["/membership", "Nike Membership. Nike.com", "other"],
  ["/help", "Nike Help. Nike.com", "help"],
  ["/help/a/returns-policy", "Nike Returns Policy. Nike.com", "help"],
  ["/help/a/shipping-delivery", "Shipping & Delivery. Nike.com", "help"],
  ["/help/a/promo-code-terms", "Promo Code Terms. Nike.com", "help"],
  ["/retail", "Find a Nike Store. Nike.com", "other"],
  ["/sustainability", "Sustainability. Nike.com", "other"],
  ["/gift-cards", "Gift Cards. Nike.com", "other"],
  ["/nike-by-you", "Nike By You: Custom Shoes. Nike.com", "other"],
  ["/size-fit/womens-footwear", "Women's Shoe Sizing Chart. Nike.com", "other"],
  ["/stories", "Nike Stories. Nike.com", "other"],
  ["/w/golf-shoes-classic", "Page Not Found. Nike.com", "other"],
]
const NOT_FOUND_PATH = "/w/golf-shoes-classic"
/** Pages nothing on the crawled site links to. */
const ORPHANS = ["/size-fit/womens-footwear", "/a/strength-training-for-runners"]

// ── Problems found, as SeoIssue rows: `type` is the rule code, titles are the rules' own ──

interface Problem {
  type: string
  title: string
  severity: Severity
  impact: number
  description: string
  selector?: string
  /** Which pages it lands on: kinds to draw from, and how many. Empty = site-wide. */
  from: Kind[]
  count: number
}

const PROBLEMS: Problem[] = [
  { type: "PAGESPEED_MOBILE", title: "Slow LCP on Mobile", severity: "HIGH", impact: 25, from: ["home"], count: 1,
    description: "Largest Contentful Paint on mobile is 4.9 s (good: under 2.5 s). The hero video and its poster image load before anything else is shown." },
  { type: "PAGESPEED_DESKTOP", title: "High Total Blocking Time", severity: "LOW", impact: 6, from: ["home"], count: 1,
    description: "Total Blocking Time on desktop is 410 ms (good: under 200 ms). Long JavaScript tasks delay the page responding to clicks." },
  { type: "CORE_WEB_VITALS", title: "Poor Core Web Vitals", severity: "MEDIUM", impact: 15, from: ["home"], count: 1,
    description: "Field data: LCP 3.1 s needs improvement; CLS 0.04 and INP 180 ms are good." },
  { type: "IMAGE_ALT_TEXT", title: "Images Missing Alt Text", severity: "MEDIUM", impact: 18, selector: "img:not([alt])", from: ["shop", "section", "article"], count: 14,
    description: "Product and banner images on this page are missing alt text. Alt text improves accessibility and helps search engines understand image content." },
  { type: "H1_TAG", title: "Multiple H1 Tags", severity: "MEDIUM", impact: 8, selector: "h1", from: ["shop"], count: 5,
    description: "This page has 2 H1 tags — the category name and a promotional banner. Use exactly one H1 per page." },
  { type: "LLM_READABILITY", title: "High JavaScript Rendering", severity: "MEDIUM", impact: 10, from: ["shop", "section"], count: 8,
    description: "Most of this page's text only appears after JavaScript runs, so AI crawlers that don't execute scripts see a nearly empty page." },
  { type: "IMAGE_OPTIMIZATION", title: "Images Not Using Modern Formats", severity: "MEDIUM", impact: 9, from: ["section", "article", "other"], count: 7,
    description: "Images on this page are served as JPEG/PNG. WebP or AVIF would cut their size by 25–35%." },
  { type: "PAGE_SIZE_TOO_LARGE", title: "Page Size Too Large", severity: "MEDIUM", impact: 8, from: ["home", "section"], count: 4,
    description: "The page weighs over 6 MB. Aim for under 3 MB, especially for mobile visitors." },
  { type: "JAVASCRIPT_ERRORS", title: "2 JavaScript Errors", severity: "MEDIUM", impact: 7, from: ["shop", "other"], count: 3,
    description: "2 uncaught JavaScript errors were logged while the page loaded. Errors can break features and stop content from rendering." },
  { type: "TOO_MANY_RESOURCES", title: "Too Many HTTP Requests", severity: "LOW", impact: 5, from: ["home", "shop", "section"], count: 12,
    description: "The page makes 140+ HTTP requests (aim for under 100). Bundle scripts and lazy-load below-the-fold images." },
  { type: "META_DESCRIPTION", title: "Meta Description Too Long", severity: "LOW", impact: 4, selector: "meta[name=\"description\"]", from: ["shop"], count: 11,
    description: "The meta description is longer than 160 characters, so Google cuts it off in search results." },
  { type: "HEADING_HIERARCHY", title: "Heading Hierarchy Issues", severity: "LOW", impact: 4, from: ["article", "help", "other"], count: 9,
    description: "Heading levels skip (H2 straight to H4), which makes the page's outline harder for search engines and screen readers to follow." },
  { type: "TITLE_TAG", title: "Title Tag Too Long", severity: "LOW", impact: 4, selector: "title", from: ["article", "section"], count: 6,
    description: "The title tag is longer than 60 characters, so Google truncates it in search results." },
  { type: "TWITTER_CARD_TAGS", title: "Missing Twitter Card Tags", severity: "LOW", impact: 3, from: ["article"], count: 6,
    description: "No twitter:card tags were found. Shared links will fall back to a plain preview on X." },
  { type: "INLINE_STYLES", title: "Excessive Inline Styles", severity: "LOW", impact: 3, from: ["home", "other"], count: 5,
    description: "The page uses over 100 inline style attributes. Moving them into stylesheets makes pages lighter and easier to cache." },
  { type: "LOCAL_BUSINESS_SCHEMA", title: "Missing LocalBusiness Schema", severity: "LOW", impact: 4, from: [], count: 0,
    description: "No LocalBusiness schema was found for Nike's stores. Adding it helps store pages appear in local results." },
  { type: "GOOGLE_BUSINESS_PROFILE", title: "No Google Business Profile Link Detected", severity: "LOW", impact: 3, from: [], count: 0,
    description: "No link to a Google Business Profile was found in the site's schema or footer." },
]

// ── Each check's result for nike.com (the worst page's, as a site audit keeps) ──

interface Result {
  passed: boolean | null
  /** Share of maxScore earned. Default: 1 when passed, 0 when not. */
  frac?: number
  short: string
  answer?: string
  rec?: string
  data?: Record<string, unknown>
}

const PRODUCTS = [
  "Nike Air Max 90", "Nike Air Force 1 '07", "Nike Pegasus 41", "Nike Vomero 18", "Nike Dunk Low",
  "Air Jordan 1 Retro High OG", "Nike Invincible 3", "Nike Metcon 9", "Nike Pegasus Trail 5", "Nike Victori One",
  "Nike Dri-FIT Tee", "Nike Sportswear Club Fleece Hoodie", "Nike Brasilia Backpack", "Nike Everyday Plus Socks",
]

function imageSamples(rand: () => number) {
  return Array.from({ length: 60 }, (_, i) => {
    const product = PRODUCTS[Math.floor(rand() * PRODUCTS.length)]
    const hasAlt = rand() > 0.3
    const slug = product.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    return {
      src: `https://static.nike.com/a/images/t_PDP_936_v1/f_auto,q_auto:eco/${(i * 7919).toString(16).padStart(6, "0")}/${slug}.png`,
      alt: hasAlt ? `${product} ${i % 3 === 0 ? "Men's" : "Women's"} Shoes` : null,
      hasAlt,
    }
  })
}

function results(rand: () => number): Record<string, Result> {
  const images = imageSamples(rand)
  const missing = images.filter((i) => !i.hasAlt).length
  return {
    // On-page
    TITLE_TAG: { passed: false, frac: 0.6, short: "Title is 71 characters — Google shows about 60.", rec: "Shorten the title to 50–60 characters and keep the main keyword near the start." },
    META_DESCRIPTION: { passed: false, frac: 0.5, short: "Meta description is 188 characters; Google cuts it off around 160.", rec: "Trim the description to 120–160 characters with a clear call to action." },
    SERP_SNIPPET: { passed: null, short: "SERP snippet preview ready.", data: { preview: {
      url: url("/"), displayUrl: "www.nike.com/", title: "Nike. Just Do It. Nike.com", titleTruncated: false,
      description: "Inspiring the world's athletes, Nike delivers innovative products, experiences and services. Free delivery and returns for Nike Members.",
      descriptionTruncated: false, favicon: url("/favicon.ico"), siteName: "Nike" } } },
    HREFLANG: { passed: true, short: "38 hreflang alternates found, including x-default." },
    LANG_ATTRIBUTE: { passed: true, short: "The page declares lang=\"en-US\"." },
    H1_TAG: { passed: false, frac: 0.5, short: "2 H1 tags on this page — use exactly one.", rec: "Keep the category name as the only H1 and turn the promotional banner heading into an H2." },
    H2_H6_HEADERS: { passed: null, short: "14 H2, 22 H3 and 6 H4 headings.", data: {
      counts: { h2: 14, h3: 22, h4: 6, h5: 0, h6: 0 },
      samples: { h2: ["Featured", "Shop by Sport", "Trending This Week", "Nike Membership"], h3: ["Running", "Basketball", "Training", "Air Max Day"], h4: ["Free Delivery", "Easy Returns"] } } },
    HEADING_HIERARCHY: { passed: false, frac: 0.67, short: "Heading levels skip from H2 to H4.", rec: "Use headings in order — H2, then H3 — without skipping levels." },
    KEYWORD_CONSISTENCY: { passed: true, short: "Your most common keywords appear in the title, description and headings.", data: {
      keywords: [
        { word: "nike", count: 48, title: true, description: true, headers: true },
        { word: "shoes", count: 31, title: true, description: false, headers: true },
        { word: "running", count: 17, title: false, description: false, headers: true },
        { word: "air", count: 14, title: false, description: false, headers: true },
        { word: "members", count: 9, title: false, description: true, headers: false },
        { word: "sneakers", count: 8, title: false, description: false, headers: false },
      ],
      phrases: [
        { word: "running shoes", count: 9, title: false, description: false, headers: true },
        { word: "air max", count: 7, title: false, description: false, headers: true },
        { word: "free delivery", count: 5, title: false, description: true, headers: false },
        { word: "nike members", count: 4, title: false, description: true, headers: false },
      ] } },
    WORD_COUNT: { passed: true, short: "1,184 words on the page." },
    IMAGE_ALT_TEXT: { passed: false, frac: 1 - missing / images.length, short: `${missing} of ${images.length} images are missing alt text.`,
      answer: `${missing} of ${images.length} images are missing alt text. Alt text improves accessibility and helps search engines understand image content.`,
      rec: "Add descriptive alt text to all meaningful images. Use empty alt=\"\" for decorative images.",
      data: { total: images.length, missing, withAlt: images.length - missing, samples: images } },
    CANONICAL_TAG: { passed: true, short: "Canonical tag points to the page itself." },
    FRIENDLY_URL: { passed: true, short: "URLs are short, readable and use hyphens." },
    FAVICON_PRESENT: { passed: true, short: "A favicon is present." },
    // Technical
    NOINDEX_HEADER: { passed: true, short: "No X-Robots-Tag header blocks indexing." },
    NOINDEX_TAG: { passed: true, short: "The page is indexable." },
    SSL_ENABLED: { passed: true, short: "Valid SSL certificate, expires in 214 days." },
    HTTPS_CHECK: { passed: true, short: "HTTP redirects to HTTPS." },
    ROBOTS_TXT: { passed: true, short: "robots.txt found with 5 Disallow rules.", data: {
      robotsUrl: url("/robots.txt"), disallowCount: 5, truncated: false,
      content: "User-agent: *\nDisallow: /checkout/\nDisallow: /cart\nDisallow: /member/\nDisallow: /search?\nDisallow: /*?*sortBy=\nAllow: /\n\nSitemap: https://www.nike.com/sitemap.xml" } },
    ROBOTS_TXT_BLOCKING: { passed: true, short: "robots.txt allows crawling of every audited page." },
    XML_SITEMAP: { passed: true, short: "XML sitemap found with 24,812 URLs.", data: {
      sitemapUrl: url("/sitemap.xml"), urlCount: 24812, truncated: true,
      urls: PAGES.filter(([p]) => p !== NOT_FOUND_PATH).slice(0, 20).map(([p]) => url(p)) } },
    CHARSET_UTF8: { passed: true, short: "UTF-8 charset declared." },
    ANALYTICS_DETECTION: { passed: true, short: "2 analytics tools detected.", data: { tools: ["Google Tag Manager", "Adobe Analytics"] } },
    HTTP2_ENABLED: { passed: true, short: "Served over HTTP/2." },
    DMARC_RECORD: { passed: true, short: "DMARC record found with policy p=reject." },
    SPF_RECORD: { passed: true, short: "Valid SPF record found." },
    DNS_CHECK: { passed: null, short: "4 nameservers.", data: { domain: DEMO_BRAND.domain, nameservers: ["a1-64.akam.net", "a7-66.akam.net", "a12-64.akam.net", "a20-67.akam.net"] } },
    IP_ADDRESS: { passed: null, short: "Resolves to 23.48.159.21." },
    SERVER_SOFTWARE: { passed: null, short: "Server: AkamaiGHost.", data: { server: "AkamaiGHost" } },
    DEPRECATED_TAGS: { passed: true, short: "No deprecated HTML tags.", data: { tags: [] } },
    JAVASCRIPT_ERRORS: { passed: false, frac: 0.33, short: "2 JavaScript errors in the console.", rec: "Fix uncaught errors in the page's scripts so every feature loads." },
    INLINE_STYLES: { passed: false, frac: 0.5, short: "142 inline style attributes.", rec: "Move repeated inline styles into a stylesheet.", data: {
      inlineStylesCount: 142, samples: ["style=\"display:none\"", "style=\"opacity:0;transform:translateY(16px)\"", "style=\"background-color:#f5f5f5\"", "style=\"--aspect-ratio:1.25\""] } },
    // Performance
    PAGESPEED_MOBILE: { passed: false, frac: 0.4, short: "Mobile performance score 38/100 — LCP 4.9 s.", rec: "Defer the hero video, preload the LCP image and cut unused JavaScript." },
    PAGESPEED_DESKTOP: { passed: false, frac: 0.75, short: "Desktop performance score 74/100 — Total Blocking Time 410 ms.", rec: "Split long JavaScript tasks and defer third-party tags." },
    CORE_WEB_VITALS: { passed: false, frac: 0.6, short: "LCP 3.1 s needs improvement; CLS 0.04 and INP 180 ms are good.", rec: "Bring LCP under 2.5 s: serve the hero image in AVIF and preload it." },
    LOAD_TIME: { passed: true, short: "Page loaded in 1.8 s." },
    IMAGE_OPTIMIZATION: { passed: false, frac: 0.67, short: "23 of 64 images still use JPEG/PNG instead of WebP or AVIF.", rec: "Serve images as WebP or AVIF." },
    PAGE_SIZE_TOO_LARGE: { passed: false, frac: 0.67, short: "Page weighs 6.8 MB — aim for under 3 MB.", rec: "Compress images and lazy-load everything below the fold." },
    TOO_MANY_RESOURCES: { passed: false, frac: 0.5, short: "148 HTTP requests — aim for under 100.", rec: "Bundle scripts and lazy-load below-the-fold images." },
    COMPRESSION: { passed: true, short: "Brotli compression enabled." },
    LLM_READABILITY: { passed: false, frac: 0.5, short: "64% of the page's text only appears after JavaScript runs.", rec: "Server-render product names, prices and descriptions so they are in the initial HTML." },
    FLASH_USAGE: { passed: true, short: "No Flash content." },
    AMP: { passed: null, short: "No AMP version (not required)." },
    // Accessibility
    MOBILE_VIEWPORT: { passed: true, short: "Viewport tag is set for mobile." },
    FONT_SIZE_TOO_SMALL: { passed: true, short: "Text is legible on mobile." },
    TAP_TARGET_SIZE: { passed: true, short: "Tap targets are large enough." },
    IFRAME_USAGE: { passed: true, short: "1 iframe — within limits." },
    // Links & security
    LINK_STRUCTURE: { passed: true, short: "212 links: 186 internal, 26 external." },
    EMAIL_PRIVACY: { passed: true, short: "No email addresses exposed in plain text.", data: { emails: [], exposedCount: 0 } },
    // Structured data, social, local
    IDENTITY_SCHEMA: { passed: true, short: "Organization schema with logo, sameAs links and contact points." },
    OPEN_GRAPH_TAGS: { passed: true, short: "Open Graph title, description and image are set." },
    TWITTER_CARD_TAGS: { passed: false, frac: 0.5, short: "No twitter:card tags on this page.", rec: "Add twitter:card, twitter:title and twitter:image tags." },
    FACEBOOK_LINK: { passed: true, short: "Facebook page linked.", data: { url: "https://www.facebook.com/nike" } },
    INSTAGRAM_LINK: { passed: true, short: "Instagram profile linked.", data: { url: "https://www.instagram.com/nike" } },
    LINKEDIN_LINK: { passed: true, short: "LinkedIn profile linked.", data: { url: "https://www.linkedin.com/company/nike" } },
    TWITTER_LINK: { passed: true, short: "X account linked.", data: { url: "https://x.com/Nike" } },
    YOUTUBE_LINK: { passed: true, short: "YouTube channel linked.", data: { url: `https://www.youtube.com/${DEMO_BRAND.youtube.handle}` } },
    YOUTUBE_ACTIVITY: { passed: null, short: "YouTube channel linked." },
    FACEBOOK_PIXEL: { passed: null, short: "No Facebook Pixel detected." },
    LOCAL_SEO: { passed: true, short: "Store locator and address signals found." },
    LOCAL_BUSINESS_SCHEMA: { passed: false, frac: 0, short: "No LocalBusiness schema on the store pages.", rec: "Add LocalBusiness schema with address, geo and opening hours to each store page." },
    GOOGLE_BUSINESS_PROFILE: { passed: false, frac: 0, short: "No Google Business Profile link found.", rec: "Link the Google Business Profile from the footer and from schema sameAs." },
  }
}

// ── Scoring: same formulas as analyzer/SeoAnalyzer.ts + scoring.ts ──────────

const PRIORITY_WEIGHT = { 1: 1.0, 2: 0.7, 3: 0.4 } as const
const SEVERITY_LEVEL: Record<Severity, number> = { CRITICAL: 1, HIGH: 1, MEDIUM: 2, LOW: 3 }
const CATEGORY_WEIGHTS: Record<Category, number> = {
  ON_PAGE: 0.3, TECHNICAL: 0.2, PERFORMANCE: 0.2, SECURITY: 0.1, LINKS: 0.1, ACCESSIBILITY: 0.05, STRUCTURED_DATA: 0.05,
}
const round1 = (n: number) => Math.round(n * 10) / 10

function grade(score: number) {
  return score >= 95 ? "A+" : score >= 90 ? "A" : score >= 85 ? "B+" : score >= 75 ? "B" : score >= 65 ? "C+" : score >= 55 ? "C" : score >= 40 ? "D" : "F"
}
function tier(score: number) {
  return score >= 90 ? "Excellent" : score >= 70 ? "Good" : score >= 50 ? "Fair" : "Poor"
}

type Check = CheckDef & {
  passed: boolean | null
  score: number
  shortAnswer: string
  answer: string
  recommendation: string | null
  severity?: Severity
  pageUrl: string
  data?: Record<string, unknown>
}

const weightedPct = (checks: Check[]) => {
  let sum = 0
  let total = 0
  for (const c of checks) {
    sum += Math.max(0, Math.min(1, c.score / c.maxScore)) * PRIORITY_WEIGHT[c.priority]
    total += PRIORITY_WEIGHT[c.priority]
  }
  return (sum / total) * 100
}

function categoryScore(checks: Check[], category: Category): number | null {
  const scorable = checks.filter((c) => c.category === category && c.maxScore > 0)
  const inCategory = checks.filter((c) => c.category === category).length
  if (scorable.length === 0 || scorable.length < Math.min(2, inCategory)) return null
  const failed = checks.filter((c) => c.category === category && c.passed === false && !c.informational)
  const level = (c: Check) => Math.max(c.priority, c.severity ? SEVERITY_LEVEL[c.severity] : 1)
  const cap = failed.some((c) => level(c) === 1) ? 64 : failed.some((c) => level(c) === 2) ? 84 : failed.length ? 92 : 100
  return round1(Math.min(weightedPct(scorable), cap))
}

// ── The generated report ────────────────────────────────────────────────────

interface IssueRow {
  id: string
  category: Category
  type: string
  title: string
  description: string
  severity: Severity
  impactScore: number
  pageUrl: string | null
  elementSelector: string | null
}

const SEVERITY_ORDER: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }

const demoData = perAnchor((anchor) => {
  const completedAt = new Date(anchor - 2 * 3_600_000)
  const createdAt = new Date(completedAt.getTime() - 11 * 60_000)
  const categoryOf = new Map(CHECK_DEFS.map((d) => [d.id, d.category]))

  // Where each problem lands, then one issue row per page.
  const issues: IssueRow[] = []
  const firstPage = new Map<string, string>()
  PROBLEMS.forEach((p, i) => {
    const rand = prng(100 + i)
    const pool = PAGES.filter(([path, , kind]) => p.from.includes(kind) && path !== NOT_FOUND_PATH).map(([path]) => path)
    const picked = pool
      .map((path) => ({ path, k: rand() }))
      .sort((a, b) => a.k - b.k)
      .slice(0, p.count)
      .map((x) => x.path)
    const targets: (string | null)[] = picked.length ? picked : [null] // none = site-wide
    if (picked[0]) firstPage.set(p.type, url(picked[0]))
    for (const path of targets) {
      issues.push({
        id: `demo-issue-${issues.length + 1}`,
        category: categoryOf.get(p.type) ?? "TECHNICAL",
        type: p.type,
        title: p.title,
        description: p.description,
        severity: p.severity,
        impactScore: p.impact,
        pageUrl: path ? url(path) : null,
        elementSelector: p.selector ?? null,
      })
    }
  })
  issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.impactScore - a.impactScore)

  const severityOf = new Map(PROBLEMS.map((p) => [p.type, p.severity]))
  const res = results(prng(7))
  const checks: Check[] = CHECK_DEFS.map((def) => {
    const r = res[def.id] ?? { passed: true, short: "No issues found." }
    const frac = r.frac ?? (r.passed === false ? 0 : 1)
    return {
      ...def,
      passed: r.passed,
      score: def.maxScore > 0 ? Math.round(def.maxScore * frac) : 0,
      shortAnswer: r.short,
      answer: r.answer ?? r.short,
      recommendation: r.passed === false ? r.rec ?? null : null,
      ...(r.passed === false ? { severity: severityOf.get(def.id) ?? "LOW" } : {}),
      pageUrl: firstPage.get(def.id) ?? url("/"),
      ...(r.data ? { data: r.data } : {}),
    }
  })

  const cats = (Object.keys(CATEGORY_WEIGHTS) as Category[])
    .map((category) => ({ category, score: categoryScore(checks, category) }))
    .filter((c): c is { category: Category; score: number } => c.score != null)
  const weightTotal = cats.reduce((a, c) => a + CATEGORY_WEIGHTS[c.category], 0)
  const overall = round1(cats.reduce((a, c) => a + c.score * CATEGORY_WEIGHTS[c.category], 0) / weightTotal)
  const cat = (category: Category) => cats.find((c) => c.category === category)?.score ?? null
  const fields = (prefix: string, category: Category) => {
    const s = cat(category)
    return { [`${prefix}Score`]: s, [`${prefix}Grade`]: s == null ? null : grade(s), [`${prefix}Tier`]: s == null ? null : tier(s) }
  }

  const sectionScores = (["seo", "performance", "ui", "links", "technology", "social", "geo"] as const).map((section) => {
    const s = checks.filter((c) => c.section === section && c.maxScore > 0)
    return { section, score: s.length ? round1(weightedPct(s)) : 0, checks: s.length }
  })

  const issuesByUrl = new Map<string, number>()
  for (const i of issues) if (i.pageUrl) issuesByUrl.set(i.pageUrl, (issuesByUrl.get(i.pageUrl) ?? 0) + 1)
  const pages = PAGES.map(([path, title, kind], i) => {
    const rand = prng(500 + i)
    const words = { home: 1184, shop: 420, article: 1650, section: 880, help: 560, other: 640 }[kind]
    return {
      id: `demo-page-${i + 1}`,
      url: url(path),
      title,
      statusCode: path === NOT_FOUND_PATH ? 404 : 200,
      loadTime: Math.round(900 + rand() * 2900),
      wordCount: path === NOT_FOUND_PATH ? 120 : Math.round(words * (0.75 + rand() * 0.5)),
      issueCount: issuesByUrl.get(url(path)) ?? 0,
    }
  })

  const passingChecks = checks
    .filter((c) => c.passed === true && !c.informational)
    .map((c) => ({ category: c.category, code: c.id, title: c.name, description: c.shortAnswer, pageUrl: c.pageUrl, goodPractice: c.why }))

  const report = {
    id: DEMO_ID,
    jobId: "demo-job",
    url: url("/"),
    mode: "SITE",
    status: "COMPLETED",
    errorMessage: null,
    pagesAnalyzed: pages.length,
    pagesFailed: 1,
    crawlNote: "1 page couldn't be read — first: Navigation timeout of 30000 ms exceeded",
    sharedHiddenSections: [],
    shareToken: null,
    overallScore: overall,
    overallGrade: grade(overall),
    overallTier: tier(overall),
    ...fields("technical", "TECHNICAL"),
    ...fields("onPage", "ON_PAGE"),
    ...fields("performance", "PERFORMANCE"),
    ...fields("accessibility", "ACCESSIBILITY"),
    ...fields("link", "LINKS"),
    ...fields("structuredData", "STRUCTURED_DATA"),
    ...fields("security", "SECURITY"),
    checks,
    sectionScores,
    passingChecks,
    issues,
    recommendations: [],
    pages: [],
    totals: { pages: pages.length, issues: issues.length },
    screenshots: null,
    linkGraph: linkGraph(pages),
    backlinks: backlinks(anchor),
    pageSpeedStatus: "completed",
    createdAt: createdAt.toISOString(),
    completedAt: completedAt.toISOString(),
  }
  return { report, issues, pages }
})

// Internal links, built the way site-crawl/linkGraph.ts builds them.
function linkGraph(pages: { url: string; title: string; statusCode: number }[]) {
  const live = pages.filter((p) => p.statusCode < 400)
  const path = (u: string) => new URL(u).pathname
  const byKind = (kind: Kind) => PAGES.filter(([p, , k]) => k === kind && p !== NOT_FOUND_PATH && !ORPHANS.includes(p)).map(([p]) => url(p))
  const rand = prng(900)
  const pickN = (pool: string[], n: number, not: string) =>
    pool.filter((u) => u !== not).map((u) => ({ u, k: rand() })).sort((a, b) => a.k - b.k).slice(0, n).map((x) => x.u)

  const edges: [string, string][] = []
  const home = url("/")
  const linkable = live.map((p) => p.url).filter((u) => !ORPHANS.includes(path(u)))
  for (const target of linkable) if (target !== home) {
    const kind = PAGES.find(([p]) => url(p) === target)?.[2]
    if (kind === "shop" || kind === "section" || kind === "other" || target === url("/help")) edges.push([home, target])
  }
  for (const source of live.map((p) => p.url)) {
    if (source === home) continue
    const kind = PAGES.find(([p]) => url(p) === source)![2]
    edges.push([source, home])
    const targets =
      kind === "shop" ? pickN(byKind("shop"), 4, source)
      : kind === "section" ? [...pickN(byKind("shop"), 4, source), ...pickN(byKind("article"), 2, source)]
      : kind === "article" ? [...pickN(byKind("shop"), 2, source), ...pickN(byKind("article"), 2, source)]
      : kind === "help" ? pickN(byKind("help"), 2, source)
      : pickN(byKind("shop"), 2, source)
    for (const t of targets) edges.push([source, t])
  }

  const inbound = new Map<string, number>()
  const outbound = new Map<string, number>()
  for (const [s, t] of edges) {
    outbound.set(s, (outbound.get(s) ?? 0) + 1)
    inbound.set(t, (inbound.get(t) ?? 0) + 1)
  }
  const depth = new Map<string, number>([[home, 0]])
  for (let queue = [home]; queue.length; ) {
    const next: string[] = []
    for (const s of queue) for (const [from, to] of edges) if (from === s && !depth.has(to)) { depth.set(to, depth.get(s)! + 1); next.push(to) }
    queue = next
  }
  const avgIn = edges.length / live.length
  const avgOut = edges.length / live.length
  const nodes = live.map((p) => {
    const i = inbound.get(p.url) ?? 0
    const o = outbound.get(p.url) ?? 0
    return {
      id: p.url,
      label: path(p.url) === "/" ? "www.nike.com" : path(p.url),
      url: p.url,
      title: p.title,
      inboundCount: i,
      outboundCount: o,
      depth: depth.get(p.url) ?? 0,
      isOrphan: p.url !== home && i === 0,
      isHub: o > 0 && o >= avgOut * 1.5,
      isAuthority: i > 0 && i >= avgIn * 1.5,
    }
  })
  const graphOrphans = nodes.filter((n) => n.isOrphan).map((n) => n.url)
  return {
    nodes,
    edges: edges.map(([source, target], i) => ({ id: `e${i}`, source, target, strength: 1 })),
    orphanData: {
      graphOrphans,
      sitemapUnvisited: ["/w/skateboarding-shoes", "/w/walking-shoes", "/a/best-gym-shoes", "/help/a/size-charts"].map(url),
      sitemapAvailable: true,
      crawlComplete: false,
      confidence: "medium",
    },
    metadata: {
      totalPages: nodes.length,
      totalLinks: edges.length,
      maxDepth: nodes.reduce((m, n) => Math.max(m, n.depth), 0),
      orphanPages: graphOrphans.length,
      hubPages: nodes.filter((n) => n.isHub).length,
      authorityPages: nodes.filter((n) => n.isAuthority).length,
      averageLinksPerPage: round1(edges.length / nodes.length),
      topLinkedPages: [...nodes]
        .sort((a, b) => b.inboundCount - a.inboundCount)
        .slice(0, 10)
        .map((n) => ({ url: n.url, title: n.title, inboundLinks: n.inboundCount })),
    },
  }
}

function backlinks(anchor: number) {
  const b = (domainStrength: number, domainFrom: string, urlFrom: string, pageTitle: string, anchorText: string, dofollow = true) =>
    ({ domainStrength, domainFrom, urlFrom, pageTitle, anchor: anchorText, dofollow })
  return {
    target: DEMO_BRAND.domain,
    rank: 861,
    backlinks: 48_600_000,
    referringDomains: 412_300,
    referringMainDomains: 361_800,
    referringIps: 158_400,
    brokenBacklinks: 1_240_000,
    brokenPages: 86_200,
    dofollow: 31_900_000,
    nofollow: 16_700_000,
    referringLinkTypes: { anchor: 41_200_000, image: 5_100_000, redirect: 1_800_000, canonical: 500_000 },
    topBacklinks: [
      b(942, "en.wikipedia.org", "https://en.wikipedia.org/wiki/Nike,_Inc.", "Nike, Inc. - Wikipedia", "nike.com"),
      b(918, "www.nytimes.com", "https://www.nytimes.com/wirecutter/reviews/best-running-shoes/", "The Best Running Shoes | Wirecutter", "Nike Pegasus 41"),
      b(901, "www.espn.com", "https://www.espn.com/nba/story/_/id/sneaker-watch", "Sneaker Watch: The best kicks of the season - ESPN", "Nike Basketball"),
      b(884, "www.theverge.com", "https://www.theverge.com/tech/nike-app-redesign", "Nike's app redesign puts training first - The Verge", "Nike"),
      b(872, "www.gq.com", "https://www.gq.com/story/best-sneakers", "The Best Sneakers of the Year | GQ", "Air Force 1"),
      b(866, "www.runnersworld.com", "https://www.runnersworld.com/gear/a20865766/best-running-shoes/", "Best Running Shoes 2026 | Runner's World", "Nike Vomero 18"),
      b(853, "hypebeast.com", "https://hypebeast.com/footwear/nike-air-max-day", "Nike Air Max Day release roundup - Hypebeast", "nike.com/launch"),
      b(841, "www.forbes.com", "https://www.forbes.com/sites/retail/nike-direct", "Inside Nike's direct-to-consumer push - Forbes", "Nike", false),
    ],
    firstSeen: "2017-03-14T00:00:00.000Z",
    lastSeen: new Date(anchor - DAY_MS).toISOString(),
    fetchedAt: new Date(anchor - 2 * 3_600_000).toISOString(),
    cached: false,
  }
}

// ── Sub-endpoints (pageAudit.service.ts) ────────────────────────────────────

const page = <T,>(rows: T[], query: URLSearchParams, defaultLimit: number, max: number) => {
  const limit = Math.min(max, Math.max(1, Number(query.get("limit")) || defaultLimit))
  const offset = Math.max(0, Number(query.get("offset")) || 0)
  return { items: rows.slice(offset, offset + limit), total: rows.length, limit, offset }
}

function issueGroups(issues: IssueRow[]) {
  const groups = new Map<string, IssueRow[]>()
  for (const i of issues) groups.set(i.type, [...(groups.get(i.type) ?? []), i])
  return [...groups.values()]
    .map((rows) => ({
      type: rows[0].type,
      title: rows[0].title,
      description: rows[0].description,
      category: rows[0].category,
      severity: rows[0].severity,
      occurrences: rows.length,
      affectedPages: new Set(rows.map((r) => r.pageUrl).filter(Boolean)).size,
      impactScore: Math.max(...rows.map((r) => r.impactScore)),
    }))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.occurrences - a.occurrences)
}

/** The history row (GET /api/page-audit/reports list item) the history pins first. */
export function pageAuditDemoListItem() {
  const { report, issues } = demoData()
  return {
    id: DEMO_ID,
    url: report.url,
    mode: "SITE" as const,
    status: "COMPLETED" as const,
    overallScore: report.overallScore,
    overallGrade: report.overallGrade,
    pagesAnalyzed: report.pagesAnalyzed,
    shareToken: null,
    createdAt: report.createdAt,
    errorMessage: null,
    issueCount: issues.length,
    criticalCount: issues.filter((i) => i.severity === "CRITICAL").length,
  }
}

export const pageAuditDemo: DemoTool = {
  base: "/api/page-audit/reports",
  get([a, b, c], query) {
    const { report, issues, pages } = demoData()
    if (a === undefined) return report
    if (a === "issue-groups" && !b) return { groups: issueGroups(issues) }
    if (a === "pages" && !b) {
      const q = (query.get("q") ?? "").toLowerCase()
      return page(q ? pages.filter((p) => p.url.toLowerCase().includes(q)) : pages, query, 10, 100)
    }
    if (a === "issues" && b && c === "pages") {
      const rows = issues
        .filter((i) => i.type === b)
        .map((i) => ({ id: i.id, pageUrl: i.pageUrl, description: i.description, elementSelector: i.elementSelector }))
      return rows.length ? page(rows, query, 20, 200) : undefined
    }
    return undefined
  },
}
