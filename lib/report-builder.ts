// The in-house client report builder: every FreeSERP tool as a section of one
// combined client report. Each section reads one "run" of a tool; several
// sections can share a run (the Maps audit feeds four), and some runs need
// another first (the Maps Tracker needs the audit's location, Competitor
// Analysis needs a SERP check's competitors).

export type Deliverable =
  | "rankTracker"
  | "quickSerp"
  | "youtube"
  | "mapsTracker"
  | "citations"
  | "gbpPlan"
  | "aiPost"
  | "directions"
  | "aiPrompts"
  | "siteAudit"
  | "pageAudit"
  | "ads"
  | "competitor"
  | "links"
  | "aeo"
  | "keywordMagic"
  | "keywordScore"

/** A tool run behind one or more sections. */
export type RunKey = "gbp" | "site" | "page" | "aeo" | "serp" | "rank" | "maps" | "llm" | "ads" | "comp" | "links" | "magic" | "score" | "yt"

/** What the form asks for. */
export type Field = "maps" | "website" | "keyword" | "location" | "services" | "name" | "youtube"

export type Inputs = {
  maps?: string
  web?: string
  kw?: string
  loc?: string
  svc: string[]
  name?: string
  yt?: string
}

type Def = { key: Deliverable; group: string; title: string; text: string; run: RunKey; needs: Field[]; promise: string }

export const DELIVERABLES: Def[] = [
  // Search engine
  { key: "rankTracker", group: "Search engine", title: "Google Rank Tracker & keywords", text: "Starts tracking the main keywords in Google and shows where the site ranks today, with search volume.", run: "rank", needs: ["website", "keyword", "location"], promise: "Where you rank on Google today for your main searches. We'll track these daily." },
  { key: "quickSerp", group: "Search engine", title: "Quick SERP check", text: "The live Google results for the main keyword: the top 10, where the site is, and AI Overview citations.", run: "serp", needs: ["website", "keyword", "location"], promise: "Who shows up on Google for your main keyword right now, and where you are." },
  { key: "youtube", group: "Search engine", title: "YouTube Rank Tracker", text: "Where the business's YouTube channel ranks for the main keyword.", run: "yt", needs: ["youtube", "keyword"], promise: "Where your YouTube channel ranks for your main keyword." },
  // Maps
  { key: "mapsTracker", group: "Maps", title: "Google Maps Tracker (7×7 grid)", text: "A 49-point rank scan around the business on Google Maps for the main keyword.", run: "maps", needs: ["maps"], promise: "How visible you are on Google Maps across your area, point by point." },
  { key: "citations", group: "Maps", title: "Create 3 citations", text: "Three ready-to-submit local listings on directories the business is missing from, with its exact name, address and phone.", run: "gbp", needs: ["maps"], promise: "Three local listings we'll create first, ready to submit with your exact business details." },
  { key: "gbpPlan", group: "Maps", title: "Google Maps Audit action plan", text: "The Google Business Profile audit's overall recommendation, 30-day plan and every fix.", run: "gbp", needs: ["maps"], promise: "Your Google Business Profile audit: the overall recommendation, the 30-day plan and every fix." },
  { key: "aiPost", group: "Maps", title: "AI Google Post", text: "A Google Business Profile post written by AI for the business, a sample of the daily posts we'll publish.", run: "gbp", needs: ["maps"], promise: "A sample of the Google Posts we'll write and publish for you, every day." },
  { key: "directions", group: "Maps", title: "Driving directions map", text: "A map of driving routes from the top competitors' locations to the business, and how we'll add them.", run: "gbp", needs: ["maps"], promise: "Driving routes from your top competitors to you, which we'll build and add for you." },
  // AI
  { key: "aiPrompts", group: "AI Prompt Tracker", title: "AI assistants: ChatGPT, Gemini, Claude, Perplexity", text: "Asks all four AI assistants three buying questions and shows whether they name the business.", run: "llm", needs: ["name", "keyword"], promise: "Whether ChatGPT, Gemini, Claude and Perplexity recommend you when customers ask." },
  // Audit & analysis
  { key: "siteAudit", group: "Audit & Analysis", title: "Full website audit", text: "A FreeSERP crawl of up to 100 pages: the score and every issue, which we'll fix.", run: "site", needs: ["website"], promise: "Everything our crawler found on your website, which we'll fix for you." },
  { key: "pageAudit", group: "Audit & Analysis", title: "Page audit (homepage)", text: "A deep audit of the homepage: scores by area and every issue.", run: "page", needs: ["website"], promise: "A close look at your homepage, the page most visitors see first." },
  { key: "ads", group: "Audit & Analysis", title: "Google Ads analysis", text: "Whether the site is ready for Google Ads: landing pages, tracking, speed, keyword costs and a budget forecast.", run: "ads", needs: ["website", "location", "services"], promise: "Whether your site is ready to spend money on Google Ads, and what a budget would buy." },
  { key: "competitor", group: "Audit & Analysis", title: "Competitor analysis", text: "The site against the pages ranking above it for the main keyword: content, links and authority.", run: "comp", needs: ["website", "keyword", "location"], promise: "How your page compares with the pages ranking above you, and what they do better." },
  { key: "links", group: "Audit & Analysis", title: "Internal links analysis", text: "How the site's pages link to each other: orphan pages and the pages that carry the most weight.", run: "links", needs: ["website"], promise: "How your pages link to each other, and the pages Google can hardly find." },
  { key: "aeo", group: "Audit & Analysis", title: "AEO & GEO audit", text: "How AI assistants see the business, with the 'Fix first' list.", run: "aeo", needs: ["website"], promise: "How AI assistants see your business, and what to fix first so they recommend you." },
  // Tools
  { key: "keywordMagic", group: "Tools", title: "Keyword Magic research", text: "Hundreds of keyword ideas around the main keyword, with volume, cost per click and difficulty.", run: "magic", needs: ["keyword", "location"], promise: "The searches your customers make, with how often and how competitive they are." },
  { key: "keywordScore", group: "Tools", title: "Keyword Score Checker", text: "How well the homepage is optimised for the main keyword, with authority and backlinks.", run: "score", needs: ["website", "keyword"], promise: "How well your homepage is set up to rank for your main keyword." },
]

export const GROUPS = [...new Set(DELIVERABLES.map((d) => d.group))]
export const def = (k: Deliverable) => DELIVERABLES.find((d) => d.key === k)!
export const fieldsFor = (sel: Deliverable[]) => new Set(sel.flatMap((d) => def(d).needs))

/** Runs a selection needs, dependencies included. */
export function runsFor(sel: Deliverable[]): RunKey[] {
  const runs = new Set(sel.map((d) => def(d).run))
  if (runs.has("maps")) runs.add("gbp")
  if (runs.has("comp")) runs.add("serp")
  return [...runs]
}

// ── The report's address: what was chosen, the inputs, and the runs started ──

const RUN_KEYS: RunKey[] = ["gbp", "site", "page", "aeo", "serp", "rank", "maps", "llm", "ads", "comp", "links", "magic", "score", "yt"]

export function reportHref(sel: Deliverable[], inputs: Inputs, ids: Partial<Record<RunKey, string>> = {}): string {
  const q = new URLSearchParams({ sel: sel.join(",") })
  const set = (k: string, v?: string) => v && q.set(k, v)
  set("maps", inputs.maps)
  set("web", inputs.web)
  set("kw", inputs.kw)
  set("loc", inputs.loc)
  set("name", inputs.name)
  set("yt", inputs.yt)
  if (inputs.svc.length) q.set("svc", inputs.svc.join("|"))
  for (const k of RUN_KEYS) set(`r_${k}`, ids[k])
  return `/dashboard/report-builder/report?${q.toString()}`
}

export function readReport(search: string): { sel: Deliverable[]; inputs: Inputs; ids: Partial<Record<RunKey, string>> } {
  const q = new URLSearchParams(search)
  const keys = new Set(DELIVERABLES.map((d) => d.key))
  const get = (k: string) => q.get(k) ?? undefined
  const ids: Partial<Record<RunKey, string>> = {}
  for (const k of RUN_KEYS) if (q.get(`r_${k}`)) ids[k] = q.get(`r_${k}`)!
  return {
    sel: (q.get("sel") ?? "").split(",").filter((k): k is Deliverable => keys.has(k as Deliverable)),
    inputs: { maps: get("maps"), web: get("web"), kw: get("kw"), loc: get("loc"), name: get("name"), yt: get("yt"), svc: (q.get("svc") ?? "").split("|").filter(Boolean) },
    ids,
  }
}

export type GbpPost = { headline: string; body: string; cta: string; source: "ai" | "template" }
