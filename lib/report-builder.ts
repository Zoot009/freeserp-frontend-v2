// The in-house client report builder: every FreeSERP tool as a section of one
// combined client report. Each section reads one "run" of a tool; several
// sections can share a run (the Maps audit feeds three), and some runs need
// another first (the Maps Tracker needs the audit's location, Competitor
// Analysis needs a SERP check's competitors).

export type Deliverable =
  | "rankTracker"
  | "quickSerp"
  | "youtube"
  | "mapsTracker"
  | "gbpAudit"
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
  /** Maps Tracker grid size: 3 means 3×3. */
  grid?: string
}

type Def = { key: Deliverable; group: string; title: string; text: string; run: RunKey; needs: Field[]; promise: string }

export const DELIVERABLES: Def[] = [
  // Search engine
  { key: "rankTracker", group: "Search engine", title: "Google Rank Tracker & keywords", text: "Starts tracking the main keywords in Google and shows where the site ranks today, with search volume.", run: "rank", needs: ["website", "keyword", "location"], promise: "Where you rank on Google today for your main searches. We'll track these daily." },
  { key: "quickSerp", group: "Search engine", title: "Quick SERP check", text: "The live Google results for the main keyword: the top 10, where the site is, and AI Overview citations.", run: "serp", needs: ["website", "keyword", "location"], promise: "Who shows up on Google for your main keyword right now, and where you are." },
  { key: "youtube", group: "Search engine", title: "YouTube Rank Tracker", text: "Where the business's YouTube channel ranks for the main keyword.", run: "yt", needs: ["youtube", "keyword"], promise: "Where your YouTube channel ranks for your main keyword." },
  // Maps
  { key: "mapsTracker", group: "Maps", title: "Google Maps Tracker", text: "A rank scan on a grid of points around the business on Google Maps for the main keyword. 3×3 unless you pick a bigger grid.", run: "maps", needs: ["maps"], promise: "How visible you are on Google Maps across your area, point by point." },
  { key: "gbpAudit", group: "Maps", title: "GMB audit (Google Business Profile)", text: "The full profile audit: the overall recommendation, 30-day plan and every fix, plus 3 ready-to-submit citations on directories the business is missing from.", run: "gbp", needs: ["maps"], promise: "Your Google Business Profile audit: what to fix and in what order, and the first 3 local listings we'll create for you." },
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

// ── A built report, kept 10 days on the server ──────────────────────────────

export type StoredReport = {
  /** Ten hex characters, shown on the report as its ID. */
  id: string
  createdAt: string
  /** When it leaves the history: 10 days after it was built. */
  expiresAt: string
  sel: Deliverable[]
  inputs: Inputs
  /** The tool runs behind it, by run. */
  ids: Partial<Record<RunKey, string>>
  status: Partial<Record<RunKey, "done" | "failed">>
  errors: Partial<Record<RunKey, string>>
  business: string | null
  /** Sections built but left out of what the client is sent. */
  hidden?: Deliverable[]
  /** Set while it's shared by link. */
  shareToken?: string | null
}

const RUN_KEYS: RunKey[] = ["gbp", "site", "page", "aeo", "serp", "rank", "maps", "llm", "ads", "comp", "links", "magic", "score", "yt"]

/** A report link from before reports were kept by ID: everything in the address. */
export function readReport(search: string): { sel: Deliverable[]; inputs: Inputs; ids: Partial<Record<RunKey, string>> } {
  const q = new URLSearchParams(search)
  const get = (k: string) => q.get(k) ?? undefined
  const ids: Partial<Record<RunKey, string>> = {}
  for (const k of RUN_KEYS) if (q.get(`r_${k}`)) ids[k] = q.get(`r_${k}`)!
  return {
    sel: knownSections((q.get("sel") ?? "").split(",")),
    inputs: { maps: get("maps"), web: get("web"), kw: get("kw"), loc: get("loc"), name: get("name"), yt: get("yt"), grid: get("grid"), svc: (q.get("svc") ?? "").split("|").filter(Boolean) },
    ids,
  }
}

/** Sections that still exist; the two that became "GMB audit" open as it. */
export function knownSections(sel: string[]): Deliverable[] {
  const keys = new Set<string>(DELIVERABLES.map((d) => d.key))
  return [...new Set(sel.map((k) => (k === "citations" || k === "gbpPlan" ? "gbpAudit" : k)))].filter((k): k is Deliverable => keys.has(k))
}

export type GbpPost = { headline: string; body: string; cta: string; source: "ai" | "template" }
