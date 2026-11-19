// Demo report for the Google Ads Analysis tool: nike.com's readiness for Google
// Ads, generated in the browser. Spec: .claude/skills/demo-report/SKILL.md.
//
// lib/demo/index.ts routes GET /api/ads-analysis/demo here. The shape is the
// backend's `view()` in ads-analysis/adsAnalysis.service.ts, with `result` as
// ads-analysis/types.ts AdsResult. The scan is fixed data; only its dates move.
//
// SCORECARD and FORECAST are the backend's own output for this scan, not
// re-implemented here: they were produced by running ads-analysis/score.ts
// `scorecard()` and forecast.ts `forecast()` on RESULT with ASSUMPTIONS. If you
// change RESULT or ASSUMPTIONS, regenerate them the same way.

import { DEMO_BRAND, DEMO_ID, perAnchor, type DemoTool } from "./shared"

/** Where the demo's CTAs lead: the analysis setup form. */
export const ADS_ANALYSIS_CREATE_HREF = "/dashboard/ads-analysis"

const url = (path: string) => `${DEMO_BRAND.url}${path}`

const SERVICES = ["Running shoes", "Basketball shoes", "Kids' shoes", "Custom shoes", "Store pickup"]
const ASSUMPTIONS = { budgetUsd: 5000, jobValueUsd: 120, convRate: 0.04 }
const CONV_RATE = { default: 0.08, min: 0.03, max: 0.15 } // forecast.ts CONV_RATE

const kw = (term: string, volume: number, cpc: number, competition: number) => ({ term, volume, cpc, competition })
// An online store: the search box is the above-the-fold form, "Shop" the call to action.
const storeFold = { phone: false, form: true, whatsapp: false, cta: "strong" as const }
const page = (path: string, role: "home" | "service", services: string[], psi: { score: number; lcpMs: number; cls: number; tbtMs: number; fieldLcp?: number }) => ({
  url: url(path),
  role,
  services,
  status: 200,
  psi: { score: psi.score, lcpMs: psi.lcpMs, cls: psi.cls, tbtMs: psi.tbtMs, ...(psi.fieldLcp ? { field: { lcpMs: psi.fieldLcp, inpMs: 180, cls: 0.04 } } : {}) },
  fold: { mobile: storeFold, desktop: storeFold },
  layout: { horizontalScroll: false, smallText: 3, smallTapTargets: 2 },
  forms: { count: 1, withHandler: 1, requiredFields: 0, captcha: false },
})

const RESULT = {
  site: { finalOrigin: DEMO_BRAND.url, pagesFound: 64 },
  modules: {
    crawl: { status: "ok", detail: "64 pages found, 5 read" },
    match: { status: "ok" },
    speed: { status: "ok" },
    browser: { status: "ok" },
    technical: { status: "ok" },
    keywords: { status: "ok" },
  },
  services: [
    { name: "Running shoes", url: url("/w/running-shoes"), confidence: 0.94, status: "found", source: "ai",
      reason: "A category page titled \"Running Shoes\", with a product grid and filters for road, trail and race." },
    { name: "Basketball shoes", url: url("/w/basketball-shoes"), confidence: 0.91, status: "found", source: "ai",
      reason: "A category page titled \"Basketball Shoes\" listing signature and team models." },
    { name: "Kids' shoes", url: url("/w/kids-shoes"), confidence: 0.88, status: "found", source: "ai",
      reason: "A category page for kids' shoes, split by age and size." },
    { name: "Custom shoes", url: url("/nike-by-you"), confidence: 0.62, status: "weak", source: "ai",
      reason: "Nike By You covers customisation, but the page opens on a campaign video rather than shoes to customise." },
    { name: "Store pickup", url: null, confidence: 0.2, status: "missing", source: "ai",
      reason: "Pickup is only explained in a help article; no page sells it.",
      suggestion: { slug: "/store-pickup", title: "Free Store Pickup: Order Online, Collect Today | Nike", h1: "Order online, pick up in store" } },
  ],
  pages: [
    page("/", "home", [], { score: 38, lcpMs: 4900, cls: 0.04, tbtMs: 640, fieldLcp: 3100 }),
    page("/w/running-shoes", "service", ["Running shoes"], { score: 42, lcpMs: 4300, cls: 0.06, tbtMs: 520 }),
    page("/w/basketball-shoes", "service", ["Basketball shoes"], { score: 45, lcpMs: 3800, cls: 0.05, tbtMs: 480 }),
    page("/w/kids-shoes", "service", ["Kids' shoes"], { score: 51, lcpMs: 3300, cls: 0.03, tbtMs: 410 }),
    page("/nike-by-you", "service", ["Custom shoes"], { score: 33, lcpMs: 5600, cls: 0.12, tbtMs: 890 }),
  ],
  tracking: {
    ga4: "detected", gtm: "detected", adsTag: "detected", adsConversion: "not_found", metaPixel: "detected",
    callTracking: "not_found", utmLinks: "detected", clickEvents: "cannot_confirm",
    ids: { ga4: ["G-8RT2QW4K1M"], gtm: ["GTM-K7X3PZ2"], ads: ["AW-1067420213"], callTracking: [] },
  },
  technical: {
    ssl: { valid: true, expiresAt: null as string | null, daysLeft: 214 },
    httpsRedirect: true,
    mixedContent: 0,
    brokenLinks: [{ url: url("/w/golf-shoes-classic"), status: 404, on: "/w/kids-shoes" }],
    linksChecked: 186,
  },
  keywords: {
    groups: [
      { service: "Running shoes", landingUrl: url("/w/running-shoes"), keywords: [
        kw("running shoes", 301000, 1.85, 1), kw("nike running shoes", 90500, 1.1, 0.98), kw("best running shoes", 90500, 1.6, 0.95),
        kw("running shoes for men", 49500, 1.7, 1), kw("running shoes for women", 49500, 1.75, 1), kw("trail running shoes", 74000, 1.4, 0.92)] },
      { service: "Basketball shoes", landingUrl: url("/w/basketball-shoes"), keywords: [
        kw("basketball shoes", 165000, 1.45, 1), kw("nike basketball shoes", 33100, 0.95, 0.97), kw("basketball shoes for men", 22200, 1.3, 1)] },
      { service: "Kids' shoes", landingUrl: url("/w/kids-shoes"), keywords: [
        kw("kids shoes", 40500, 1.2, 1), kw("nike kids shoes", 22200, 0.85, 0.96), kw("boys sneakers", 18100, 1.05, 1)] },
      { service: "Custom shoes", landingUrl: url("/nike-by-you"), keywords: [
        kw("custom shoes", 27100, 2.1, 0.86), kw("nike by you", 74000, 0.55, 0.62), kw("custom air force 1", 33100, 1.3, 0.9)] },
      { service: "Store pickup", landingUrl: null, keywords: [
        kw("nike store near me", 110000, 0.6, 0.41), kw("nike store pickup", 2900, 0.4, 0.33), kw("buy online pick up in store shoes", 880, 1.15, 0.72)] },
    ],
    negatives: ["jobs", "diy", "free", "salary", "replica", "used"],
    campaignTypes: ["Search", "Performance Max (later)"],
  },
  quickWins: {
    ranking: [
      { keyword: "basketball shoes", position: 2, url: url("/w/basketball-shoes") },
      { keyword: "running shoes", position: 3, url: url("/w/running-shoes") },
      { keyword: "nike by you", position: 1, url: url("/nike-by-you") },
    ],
    gbp: { name: DEMO_BRAND.store.name, rating: 4.4, reviews: 2140, claimed: true },
    extensions: ["Sitelinks", "Seller ratings / reviews", "Location", "Callouts"],
  },
}

// score.ts scorecard() and forecast.ts forecast() output for RESULT + ASSUMPTIONS. See header.
const SCORECARD = {
  "overall": 69,
  "band": "needs_work",
  "modules": {
    "landing": 64,
    "tracking": 70,
    "speed": 50,
    "keywords": 70,
    "budget": 100,
    "technical": 95
  },
  "issues": [
    {
      "priority": "critical",
      "module": "tracking",
      "title": "Google Ads tag found, but no conversion tracking",
      "where": "Site-wide",
      "impact": "Cannot measure leads",
      "fix": "Add a Google Ads conversion action for form submits and calls (through Google Tag Manager or gtag), then confirm it fires on the thank-you step."
    },
    {
      "priority": "critical",
      "module": "landing",
      "title": "No dedicated page for \"Store pickup\"",
      "where": "Missing page",
      "impact": "Lower Quality Score, higher cost per click",
      "fix": "Create /store-pickup titled \"Free Store Pickup: Order Online, Collect Today | Nike\"."
    },
    {
      "priority": "high",
      "module": "speed",
      "title": "Mobile LCP 4.3s",
      "where": "/w/running-shoes",
      "impact": "Higher cost per click",
      "fix": "Compress and size the main image, cut render-blocking scripts, and use faster hosting or a CDN."
    },
    {
      "priority": "high",
      "module": "speed",
      "title": "Mobile LCP 5.6s",
      "where": "/nike-by-you",
      "impact": "Higher cost per click",
      "fix": "Compress and size the main image, cut render-blocking scripts, and use faster hosting or a CDN."
    },
    {
      "priority": "medium",
      "module": "landing",
      "title": "\"Custom shoes\" lands on a general page",
      "where": "/nike-by-you",
      "impact": "Ads and page don't match closely",
      "fix": "Give Custom shoes its own page, or a clear section high on this one."
    },
    {
      "priority": "medium",
      "module": "speed",
      "title": "Mobile LCP 3.1s (good is 2.5s or less)",
      "where": "/",
      "impact": "Higher cost per click",
      "fix": "Optimise the largest image and defer non-critical scripts."
    },
    {
      "priority": "medium",
      "module": "speed",
      "title": "Mobile LCP 3.8s (good is 2.5s or less)",
      "where": "/w/basketball-shoes",
      "impact": "Higher cost per click",
      "fix": "Optimise the largest image and defer non-critical scripts."
    },
    {
      "priority": "medium",
      "module": "speed",
      "title": "Mobile LCP 3.3s (good is 2.5s or less)",
      "where": "/w/kids-shoes",
      "impact": "Higher cost per click",
      "fix": "Optimise the largest image and defer non-critical scripts."
    },
    {
      "priority": "low",
      "module": "technical",
      "title": "1 broken link",
      "where": "Home and service pages",
      "impact": "Dead ends for paid visitors",
      "fix": "Fix or remove the links listed in Technical health."
    }
  ]
}
const FORECAST = {
  "avgCpc": 1.39,
  "budget": 5000,
  "suggested": false,
  "convRate": 0.04,
  "clicks": {
    "low": 3003,
    "expected": 3604,
    "high": 4240
  },
  "leads": {
    "low": 72,
    "expected": 144,
    "high": 237
  },
  "costPerLead": {
    "low": 21,
    "expected": 35,
    "high": 69
  },
  "breakevenJobs": 42
}

const demoData = perAnchor((anchor) => {
  const finishedAt = new Date(anchor - 3 * 3_600_000)
  const createdAt = new Date(finishedAt.getTime() - 4 * 60_000)
  const expires = new Date(anchor + 214 * 86_400_000).toISOString()
  return {
    analysis: {
      id: DEMO_ID,
      origin: DEMO_BRAND.url,
      locationLabel: "United States",
      services: SERVICES,
      status: "COMPLETED",
      error: null,
      progress: { step: "score", modules: { crawl: "ok", match: "ok", speed: "ok", browser: "ok", technical: "ok", keywords: "ok" } },
      score: SCORECARD.overall,
      createdAt: createdAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      shareToken: null,
      location: "2840",
      servicePages: null,
    },
    assumptions: ASSUMPTIONS,
    convRateRange: CONV_RATE,
    result: {
      ...RESULT,
      scannedAt: finishedAt.toISOString(),
      technical: { ...RESULT.technical, ssl: { ...RESULT.technical.ssl, expiresAt: expires } },
    },
    forecast: FORECAST,
    scorecard: SCORECARD,
  }
})

/** The ReportHistory pin for this demo. */
export function adsAnalysisDemoRow() {
  const { analysis } = demoData()
  return {
    title: DEMO_BRAND.domain,
    subtitle: [`Score ${analysis.score}/100`, analysis.locationLabel, SERVICES.slice(0, 3).join(", ")].join(" · "),
    href: `/dashboard/ads-analysis/${DEMO_ID}`,
  }
}

export const adsAnalysisDemo: DemoTool = {
  base: "/api/ads-analysis",
  get(rest) {
    return rest.length === 0 ? demoData() : undefined
  },
}
