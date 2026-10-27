// AEO & GEO audit: the report as GET /api/aeo-audit/:id returns it, and the words, bands and helpers the web report
// and the PDF share. The audit engine lives in the backend (src/modules/aeo-audit); what's here is copied from it
// (labels.ts, scoring/config.ts, visibility/visibility.ts) and must change with it.

export type AuditStatus = "QUEUED" | "CRAWLING" | "CHECKING" | "ANALYZING" | "SCORING" | "COMPLETED" | "FAILED"
export type Category =
  | "CRAWL_ACCESS"
  | "RENDERING"
  | "STRUCTURED_DATA"
  | "CONTENT_STRUCTURE"
  | "ENTITY_TRUST"
  | "FRESHNESS"
  | "TECHNICAL"
  | "CONTENT_QUALITY"
export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
export type Effort = "LOW" | "MEDIUM" | "HIGH"
export type QuestionMix = "UNBRANDED" | "MIXED" | "BRANDED"

export type Finding = {
  checkId: string
  category: Category
  severity: Severity
  passed: boolean
  url: string
  title: string
  evidence: string
  why: string
  fix?: string | null
  snippet?: string | null
  effort?: Effort | null
}
export type Fix = {
  checkId: string
  category: Category
  severity: Severity
  effort: Effort
  gain: { aeo: number; geo: number }
  failing: Finding[] // worst first; the first supplies the title, why and fix
  total: number
}
export type Strength = { checkId: string; category: Category; title: string; count: number }

export type Outcome = "cited" | "consulted" | "named" | "absent" | "none"
export type QuestionResult = { question: string; branded?: true; outcome?: Outcome; position?: number; cited: string[]; error?: string }
export type VisibilitySummary = {
  engine: string
  model?: string
  market?: { country: string; language: string }
  status: "done" | "partial" | "failed" | "skipped"
  detail?: string
  score?: number
  cited?: number
  answered?: number
  questions?: QuestionResult[]
  checkedAt?: string
}
export type EngineScore = {
  id: string
  name: string
  maker: string
  score: number
  access: number
  capped: boolean
  bots: { token: string; main: boolean; allowed: number }[]
}
export type Breakdown = {
  aeo: number
  geo: number
  categories: { category: Category; score: number; rules: { checkId: string; passed: number; total: number }[] }[]
  weights: Record<"aeo" | "geo", Partial<Record<Category, number>>>
  caps: string[]
  uncapped?: { aeo: number; geo: number }
  engines?: EngineScore[]
  measured?: VisibilitySummary[]
}
export type AuditProgress = {
  pages?: [number, number]
  answers?: [number, number]
  choosing?: string
}
export type PageFacts = { reason: string; error?: string; ms?: number }
export type SiteFacts = {
  finalOrigin: string
  robots: { url: string; status: number | null; state: "ok" | "missing" | "unreachable" }
  llmsTxt: { url: string; status: number | null; contentType?: string }
  sitemaps: { url: string; status: number | null; error?: string; kind?: string; count: number }[]
  skipped: { url: string; reason: string }[]
}
export type PastAudit = { id: string; status: AuditStatus; aeoScore: number | null; geoScore: number | null; createdAt: string }

export type AeoReport = {
  audit: PastAudit & { origin: string; error: string | null; attempts: number; maxPages: number; progress: AuditProgress | null }
  site: SiteFacts | null
  breakdown: Breakdown | null
  origin: string
  host: string
  pages: { id: string; url: string; statusCode: number | null; facts: PageFacts }[]
  findings: Finding[]
  fixes: Fix[]
  strengths: Strength[]
  previous:
    | (Pick<PastAudit, "id" | "aeoScore" | "geoScore" | "createdAt"> & {
        fixed: { checkId: string; title: string }[]
        regressed: { checkId: string; title: string }[]
      })
    | null
  others: PastAudit[]
  history: { aeo: number[]; geo: number[] }
  seconds: number | null
  maxAttempts: number
}

export const isRunning = (status: AuditStatus) => status !== "COMPLETED" && status !== "FAILED"

export const CATEGORY_NAMES: Record<Category, string> = {
  CRAWL_ACCESS: "Crawl access",
  RENDERING: "Rendering",
  STRUCTURED_DATA: "Structured data",
  CONTENT_STRUCTURE: "Content structure",
  ENTITY_TRUST: "Entity & trust",
  FRESHNESS: "Freshness",
  TECHNICAL: "Technical basics",
  CONTENT_QUALITY: "Content quality", // no longer scored: the AI content review was removed upstream (2026-10-26)
}

/** Report order. */
export const CATEGORIES: Category[] = ["CRAWL_ACCESS", "RENDERING", "STRUCTURED_DATA", "CONTENT_STRUCTURE", "ENTITY_TRUST", "FRESHNESS", "TECHNICAL"]

export const EFFORT_LABELS: Record<Effort, string> = { LOW: "Low effort", MEDIUM: "Medium effort", HIGH: "High effort" }

export const ENGINE_NAMES: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  perplexity: "Perplexity",
  gemini: "Gemini",
  "ai-overviews": "AI Overviews",
  copilot: "Copilot",
}

export type Tone = "good" | "warn" | "bad"
/** Score bands, highest first: 70 and up is on track, 50–69 needs work, under 50 is weak. */
export const BANDS: { min: number; label: string; tone: Tone }[] = [
  { min: 85, label: "Strong", tone: "good" },
  { min: 70, label: "Good", tone: "good" },
  { min: 50, label: "Needs work", tone: "warn" },
  { min: 0, label: "Weak", tone: "bad" },
]
export const bandOf = (score: number) => BANDS.find((b) => score >= b.min) ?? BANDS[BANDS.length - 1]!

/** Pages an audit may read besides the homepage. */
export const PAGE_CHOICES = [5, 10, 20] as const

export const serious = (severity: Severity) => severity === "CRITICAL" || severity === "HIGH"

export const points = (n: number) => (n >= 0.5 ? `+${Math.round(n)}` : "<1")

// Same host: show the path. Elsewhere (a localhost sitemap, the bare domain): show the whole URL.
export const where = (url: string, origin: string) => {
  const u = new URL(url)
  return u.origin === origin ? `${u.pathname}${u.search}` : url
}

/** How the questions were asked, for a sentence. */
export function askedHow(questions: { branded?: true }[]) {
  const branded = questions.filter((q) => q.branded).length
  if (!branded) return "without naming the brand"
  if (branded === questions.length) return "each naming the brand"
  return `${questions.length - branded} without naming the brand and ${branded} naming it`
}

/** Across the engines: the share of all their answers that link to the site. */
export function overall(measured: VisibilitySummary[]) {
  const scored = measured.filter((m) => m.score !== undefined)
  const answered = scored.reduce((n, m) => n + (m.answered ?? 0), 0)
  const cited = scored.reduce((n, m) => n + (m.cited ?? 0), 0)
  return answered ? { score: Math.round((100 * cited) / answered), cited, answered, engines: scored.length } : undefined
}

const REGION = new Intl.DisplayNames(["en"], { type: "region" })
/** A market's country as a sentence names it: "the United Kingdom", "India". */
export function countryName(code: string) {
  const name = REGION.of(code) ?? code
  return /^(United|Netherlands|Philippines|Dominican|Bahamas|Maldives|Gambia|Central African)|Islands$/.test(name) ? `the ${name}` : name
}

export const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en", { dateStyle: "medium", timeZone: "UTC" })
