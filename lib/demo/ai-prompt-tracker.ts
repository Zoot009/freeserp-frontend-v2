// Demo brand for the AI Prompt Tracker: generated, read-only sample data.
// Spec: .claude/skills/demo-report/SKILL.md; reference: ./rank-tracker.ts.
//
// lib/demo/index.ts routes every GET /api/llm-tracker/projects/demo… here, so the
// real brand and prompt pages render a tracked brand — prompts on all four
// assistants, weekly history and the answers themselves — with no backend row,
// no LLM call and no credits spent.
//
// Shapes mirror backend llmPrompt.routes.ts (GET /, GET /:id, GET
// /:id/prompts/:promptId) and the Prisma rows they spread. Scoring follows
// llmMetrics.ts: a sample is "mentioned" when one of brandTerms().matched occurs
// as a whole word, prominence is that first offset over the answer's length,
// and a run's rates are averaged over its successful samples (aggregateRun).
// The answers below are built so those rules give exactly the numbers shown.

import type { Platform } from "@/lib/ai-tracker"
import { DAY_MS, DEMO_BRAND, DEMO_ID, perAnchor, prng, type DemoTool } from "./shared"

/** Where the demo's CTAs lead: the tracker's setup wizard. */
export const AI_TRACKER_CREATE_HREF = "/dashboard/ai-prompt-tracker"

const NAME = `${DEMO_BRAND.name} (Demo)`
const BRAND = DEMO_BRAND.name
const DOMAIN = DEMO_BRAND.domain
const WEEKS = 8
const SAMPLES = 3

/** llmPlatform.adapter.ts: the model each platform answers with. */
const MODEL: Record<Platform, string> = {
  chat_gpt: "gpt-5-6",
  gemini: "gemini-2.5-flash",
  perplexity: "sonar",
  claude: "claude-haiku-4-5",
}
/** Assistants that search the web and so cite sources. */
const CITES: Record<Platform, boolean> = { chat_gpt: true, gemini: false, perplexity: true, claude: true }

const COMPETITORS = [
  ["adidas", "adidas.com"], ["New Balance", "newbalance.com"], ["HOKA", "hoka.com"],
  ["Brooks", "brooksrunning.com"], ["ASICS", "asics.com"], ["Saucony", "saucony.com"],
] as const

/** brandTerms(): the domain, its label, then the name (deduplicated, none generic). */
const MATCHED = [DOMAIN, DOMAIN.split(".")[0]]

interface Pick {
  brand: string
  product: string
  why: string
}
const P = (brand: string, product: string, why: string): Pick => ({ brand, product, why })

interface Seed {
  prompt: string
  platforms: Platform[]
  /** Answers naming the brand, of 3, on the latest run — "fail" for a run where every sample failed. */
  latest: Partial<Record<Platform, number | "fail">>
  /** Answers that also link to the brand's site, of those naming it. */
  cited?: number
  /** The brand's own entry when an answer names it. */
  own: Pick
  /** Everyone else an answer may recommend. */
  rivals: Pick[]
  /** Weekly schedule, or manual-only. */
  weekly: boolean
  /** Added after the brand was created: a shorter history. */
  weeksOld?: number
}

const RUNNING_RIVALS = [
  P("Brooks", "Brooks Ghost", "soft, stable cushioning that suits most new runners"),
  P("ASICS", "ASICS Gel-Nimbus", "plush cushioning for longer easy runs"),
  P("HOKA", "HOKA Clifton", "light, highly cushioned and forgiving on the joints"),
  P("New Balance", "New Balance Fresh Foam 1080", "roomy fit and smooth ride"),
  P("Saucony", "Saucony Ride", "balanced, versatile daily trainer"),
  P("adidas", "adidas Ultraboost", "comfortable all-day cushioning"),
]

// Chosen to show every state the pages have: a prompt on all four assistants
// with different rates on each, a branded comparison the brand always appears
// in, a category where it never does, a run whose samples all failed, a weekly
// schedule beside manual-only prompts, and a prompt added recently.
const SEEDS: Seed[] = [
  {
    prompt: "What are the best running shoes for beginners?",
    platforms: ["chat_gpt", "gemini", "perplexity", "claude"],
    latest: { chat_gpt: 2, gemini: 3, perplexity: 1, claude: 2 },
    cited: 1,
    own: P(BRAND, "Nike Pegasus", "a dependable daily trainer with responsive cushioning"),
    rivals: RUNNING_RIVALS,
    weekly: true,
  },
  {
    prompt: "Which brand makes the most comfortable everyday sneakers?",
    platforms: ["chat_gpt", "gemini"],
    latest: { chat_gpt: 3, gemini: 2 },
    own: P(BRAND, "Nike Air Max 90", "a cushioned classic that works with almost anything"),
    rivals: [
      P("New Balance", "New Balance 990", "supportive and built to last"),
      P("adidas", "adidas Samba", "slim, versatile and easy to wear"),
      P("HOKA", "HOKA Bondi", "maximum cushioning for long days on your feet"),
      P("ASICS", "ASICS Gel-Kayano", "stable and comfortable for walking"),
    ],
    weekly: true,
  },
  {
    prompt: "Is Nike or Adidas better for gym training shoes?",
    platforms: ["chat_gpt", "gemini", "perplexity", "claude"],
    latest: { chat_gpt: 3, gemini: 3, perplexity: 3, claude: 3 },
    cited: 2,
    own: P(BRAND, "Nike Metcon", "a flat, stable heel for lifting and a durable upper for circuits"),
    rivals: [
      P("adidas", "adidas Dropset", "stable platform and good grip for mixed training"),
      P("adidas", "adidas Powerlift", "raised heel built specifically for squats"),
      P("Under Armour", "Under Armour TriBase Reign", "low-to-the-ground feel for lifting"),
    ],
    weekly: true,
  },
  {
    prompt: "Best basketball shoes for wide feet",
    platforms: ["chat_gpt", "perplexity"],
    latest: { chat_gpt: 1, perplexity: "fail" },
    own: P(BRAND, "Nike LeBron", "a roomy forefoot and plenty of cushioning"),
    rivals: [
      P("New Balance", "New Balance TWO WXY", "available in wide sizes"),
      P("adidas", "adidas Dame", "accommodating fit and good traction"),
      P("Under Armour", "Under Armour Curry", "secure lockdown with a forgiving toe box"),
      P("PUMA", "PUMA MB.03", "generous fit through the midfoot"),
    ],
    weekly: false,
  },
  {
    prompt: "Best trail running shoes for muddy terrain",
    platforms: ["chat_gpt", "claude"],
    latest: { chat_gpt: 0, claude: 0 },
    own: P(BRAND, "Nike Pegasus Trail", "road-to-trail comfort"),
    rivals: [
      P("Salomon", "Salomon Speedcross", "deep lugs that bite into mud"),
      P("HOKA", "HOKA Speedgoat", "cushioned with an aggressive outsole"),
      P("Brooks", "Brooks Cascadia", "stable and protective on rough ground"),
      P("Saucony", "Saucony Peregrine", "grippy and nimble on technical trails"),
    ],
    weekly: false,
  },
  {
    prompt: "Which running shoe brand is best for marathon training?",
    platforms: ["chat_gpt", "perplexity"],
    latest: { chat_gpt: 2, perplexity: 2 },
    cited: 1,
    own: P(BRAND, "Nike Vaporfly", "a carbon-plated racer for race day"),
    rivals: RUNNING_RIVALS,
    weekly: true,
    weeksOld: 3,
  },
]

// ── Answers ──────────────────────────────────────────────────────────────────

const INTROS = [
  "Here are a few options worth considering:",
  "It depends on your needs, but these are consistently well reviewed:",
  "Good picks most reviewers agree on:",
]
const OUTROS = [
  "Try a few on in person if you can — fit matters more than any list.",
  "Whichever you choose, replace them roughly every 300–500 miles.",
  "Comfort is personal, so check the return policy before you buy.",
]
const SOURCES = [
  ["runnersworld.com", "Best Running Shoes, Tested"], ["rei.com", "How to Choose Running Shoes"],
  ["runrepeat.com", "Lab-Tested Shoe Reviews"], ["reddit.com", "r/running: shoe recommendations"],
  ["nytimes.com", "Wirecutter: The Best Shoes"], ["verywellfit.com", "Shoes Experts Recommend"],
] as const

const word = (term: string) => new RegExp(`(?<![\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu")
/** matchBrand(): the earliest whole-word hit of any matched term, as an offset in the text. */
function firstMention(text: string): number | null {
  const hits = MATCHED.map((t) => text.search(word(t))).filter((i) => i >= 0)
  return hits.length ? Math.min(...hits) : null
}

interface Answer {
  text: string
  citations: { title: string; url: string; domain: string; startIndex: null }[]
}

function answer(s: Seed, platform: Platform, mention: boolean, cite: boolean, rand: () => number): Answer {
  const rivals = [...s.rivals].sort(() => rand() - 0.5).slice(0, 4)
  const picks = mention ? [...rivals.slice(0, 3)] : rivals
  if (mention) picks.splice(Math.floor(rand() * 3), 0, s.own)
  const lines = picks.map((p, i) => `${i + 1}. **${p.product}** — ${p.why}.`)
  const text = [INTROS[Math.floor(rand() * INTROS.length)], "", ...lines, "", OUTROS[Math.floor(rand() * OUTROS.length)]].join("\n")
  if (!CITES[platform]) return { text, citations: [] }
  const sources = [...SOURCES].sort(() => rand() - 0.5).slice(0, 3)
  const citations: Answer["citations"] = sources.map(([domain, title]) => ({ title, url: `https://www.${domain}/`, domain, startIndex: null }))
  if (cite) citations.unshift({ title: `${s.own.product} | ${BRAND}`, url: `${DEMO_BRAND.url}/`, domain: DOMAIN, startIndex: null })
  return { text, citations }
}

// ── Runs ─────────────────────────────────────────────────────────────────────

interface Sample {
  sampleIndex: number
  status: "COMPLETED" | "FAILED"
  responseText: string | null
  truncated: boolean
  mentioned: boolean
  mentionOffset: number | null
  prominence: number | null
  cited: boolean
  citations: Answer["citations"] | null
  competitorsMentioned: string[] | null
  competitorsCited: string[] | null
  fanOutQueries: string[] | null
  checkUrl: string | null
}

interface Run {
  id: string
  platform: Platform
  modelName: string
  status: "COMPLETED" | "FAILED"
  mentionRate: number | null
  citationRate: number | null
  avgProminence: number | null
  change: number | null
  samplesRequested: number
  samplesCompleted: number
  samplesSucceeded: number
  errorMessage: string | null
  costUsd: string
  runAt: string
  manual: boolean
  /** Only the newest run per platform carries its answers, as the detail route reads them. */
  samples?: Sample[]
}

function scoreSamples(s: Seed, platform: Platform, mentions: number, cites: number, rand: () => number): Sample[] {
  return Array.from({ length: SAMPLES }, (_, i) => {
    const mention = i < mentions
    const a = answer(s, platform, mention, mention && i < cites, rand)
    const offset = firstMention(a.text)
    return {
      sampleIndex: i,
      status: "COMPLETED" as const,
      responseText: a.text,
      truncated: false,
      mentioned: offset != null,
      mentionOffset: offset,
      prominence: offset != null ? offset / a.text.length : null,
      cited: a.citations.some((c) => c.domain === DOMAIN),
      citations: a.citations,
      competitorsMentioned: COMPETITORS.filter(([n]) => word(n).test(a.text)).map(([n]) => n),
      competitorsCited: COMPETITORS.filter(([, d]) => a.citations.some((c) => c.domain === d)).map(([n]) => n),
      fanOutQueries: platform === "chat_gpt" ? [s.prompt.toLowerCase().replace(/\?$/, ""), `${s.prompt.toLowerCase().replace(/\?$/, "")} reviews`] : null,
      checkUrl: null,
    }
  })
}

/** aggregateRun(): rates over the successful samples; prominence over those that mention. */
function aggregate(samples: Sample[]) {
  const ok = samples.filter((x) => x.status === "COMPLETED")
  if (!ok.length) return null
  const proms = ok.map((x) => x.prominence).filter((p): p is number => p != null)
  return {
    mentionRate: ok.filter((x) => x.mentioned).length / ok.length,
    citationRate: ok.filter((x) => x.cited).length / ok.length,
    avgProminence: proms.length ? proms.reduce((a, b) => a + b, 0) / proms.length : null,
  }
}

interface DemoPrompt {
  seed: Seed
  id: string
  createdAt: string
  /** Newest first, every platform interleaved — as the routes order them. */
  runs: Run[]
}

const PLATFORM_ORDER: Platform[] = ["chat_gpt", "gemini", "perplexity", "claude"]

function buildPrompt(s: Seed, i: number, anchor: number): DemoPrompt {
  const id = `demo-prompt-${i + 1}`
  const weeks = s.weeksOld ?? WEEKS
  const rand = prng(700 + i)
  const runs: Run[] = []
  for (const platform of s.platforms) {
    const latest = s.latest[platform] ?? 0
    // Weekly history, oldest first: a walk in thirds that ends on the latest result.
    let level = typeof latest === "number" ? Math.max(0, Math.min(SAMPLES, latest + (rand() < 0.5 ? -1 : 1))) : 2
    const history: Run[] = []
    for (let w = weeks - 1; w >= 0; w--) {
      const runAt = new Date(anchor - w * 7 * DAY_MS - PLATFORM_ORDER.indexOf(platform) * 4 * 60_000).toISOString()
      const runId = `${id}-${platform}-w${w}`
      if (w === 0) {
        const failed = latest === "fail"
        const samples: Sample[] = failed
          ? Array.from({ length: SAMPLES }, (_, k) => ({
              sampleIndex: k, status: "FAILED" as const, responseText: null, truncated: false, mentioned: false,
              mentionOffset: null, prominence: null, cited: false, citations: null, competitorsMentioned: null,
              competitorsCited: null, fanOutQueries: null, checkUrl: null,
            }))
          : scoreSamples(s, platform, latest as number, Math.min(s.cited ?? 0, latest as number), rand)
        const agg = aggregate(samples)
        history.push({
          id: runId, platform, modelName: MODEL[platform], status: failed ? "FAILED" : "COMPLETED",
          mentionRate: agg?.mentionRate ?? null, citationRate: agg?.citationRate ?? null, avgProminence: agg?.avgProminence ?? null,
          change: null, samplesRequested: SAMPLES, samplesCompleted: SAMPLES, samplesSucceeded: failed ? 0 : SAMPLES,
          errorMessage: failed ? "All samples failed" : null, costUsd: failed ? "0.000000" : "0.018000", runAt,
          manual: !s.weekly, samples,
        })
      } else {
        level = Math.max(0, Math.min(SAMPLES, level + (rand() < 0.35 ? -1 : rand() < 0.7 ? 0 : 1)))
        const rate = level / SAMPLES
        history.push({
          id: runId, platform, modelName: MODEL[platform], status: "COMPLETED", mentionRate: rate,
          citationRate: rate > 0 && (s.cited ?? 0) > 0 ? 1 / SAMPLES : 0, avgProminence: rate > 0 ? 0.2 + rand() * 0.4 : null,
          change: null, samplesRequested: SAMPLES, samplesCompleted: SAMPLES, samplesSucceeded: SAMPLES,
          errorMessage: null, costUsd: "0.018000", runAt, manual: !s.weekly,
        })
      }
    }
    // change = this run's mention rate minus the previous completed run's (llmRun.service finalizeRun).
    history.forEach((r, k) => {
      const prev = history.slice(0, k).reverse().find((x) => x.status === "COMPLETED")
      r.change = r.mentionRate != null && prev?.mentionRate != null ? r.mentionRate - prev.mentionRate : null
    })
    runs.push(...history)
  }
  runs.sort((a, b) => b.runAt.localeCompare(a.runAt))
  return { seed: s, id, createdAt: new Date(anchor - weeks * 7 * DAY_MS - 3_600_000).toISOString(), runs }
}

const demoData = perAnchor((anchor) => ({
  anchor,
  createdAt: new Date(anchor - WEEKS * 7 * DAY_MS - 2 * 3_600_000).toISOString(),
  prompts: SEEDS.map((s, i) => buildPrompt(s, i, anchor)),
}))
type DemoData = ReturnType<typeof demoData>

// ── Response shapes ──────────────────────────────────────────────────────────

function projectRow(d: DemoData) {
  return {
    id: DEMO_ID,
    userId: DEMO_ID,
    name: NAME,
    brandName: BRAND,
    brandDomain: DOMAIN,
    brandAliases: [],
    competitorNames: COMPETITORS.map(([n]) => n),
    competitorDomains: COMPETITORS.map(([, dm]) => dm),
    isActive: true,
    createdAt: d.createdAt,
    updatedAt: d.createdAt,
    brandTerms: { matched: MATCHED, ignored: [] as string[] },
  }
}

/** The run fields GET /:id selects. */
function runSummary(r: Run) {
  return {
    id: r.id, platform: r.platform, status: r.status, mentionRate: r.mentionRate, citationRate: r.citationRate,
    avgProminence: r.avgProminence, change: r.change, samplesRequested: r.samplesRequested,
    samplesCompleted: r.samplesCompleted, samplesSucceeded: r.samplesSucceeded, errorMessage: r.errorMessage, runAt: r.runAt,
  }
}

/** The prompt row, as Prisma returns it. */
function promptRow(d: DemoData, p: DemoPrompt) {
  const latest = p.runs[0]
  return {
    id: p.id,
    projectId: DEMO_ID,
    prompt: p.seed.prompt,
    platforms: p.seed.platforms,
    samplesPerRun: SAMPLES,
    countryIso: DEMO_BRAND.country,
    isActive: true,
    autoRunEnabled: p.seed.weekly,
    checkFrequency: 168,
    lastScheduledRun: p.seed.weekly ? latest.runAt : null,
    nextScheduledRun: p.seed.weekly ? new Date(d.anchor + 7 * DAY_MS).toISOString() : null,
    createdAt: p.createdAt,
    updatedAt: latest.runAt,
  }
}

/** listProjects' platformRates: per tracked platform, the mean of each prompt's newest completed rate. */
function platformRates(d: DemoData) {
  const out: Partial<Record<Platform, number | null>> = {}
  for (const pl of PLATFORM_ORDER) {
    if (!d.prompts.some((p) => p.seed.platforms.includes(pl))) continue
    // DISTINCT ON (prompt, platform) picks the newest run, completed or not.
    const rates = d.prompts
      .map((p) => p.runs.find((r) => r.platform === pl))
      .filter((r): r is Run => r?.status === "COMPLETED" && r.mentionRate != null)
      .map((r) => r.mentionRate!)
    out[pl] = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null
  }
  return out
}

/** The row the brand list pins first. */
export function demoAiTrackerProject() {
  const d = demoData()
  return {
    id: DEMO_ID,
    name: NAME,
    brandName: BRAND,
    brandDomain: DOMAIN,
    promptCount: d.prompts.length,
    platformRates: platformRates(d),
    createdAt: d.createdAt,
  }
}

function promptDetail(d: DemoData, p: DemoPrompt, focus: string | null) {
  const latest = focus ? p.runs.find((r) => r.platform === focus) : p.runs[0]
  return {
    project: projectRow(d),
    prompt: promptRow(d, p),
    runs: p.runs.slice(0, 60).map(({ samples: _samples, ...r }) => r),
    latestRunId: latest?.id ?? null,
    samples: latest?.samples ?? [],
  }
}

// ── Routes (GET only; lib/demo/index.ts refuses writes) ─────────────────────

export const aiPromptTrackerDemo: DemoTool = {
  base: "/api/llm-tracker/projects",
  get([a, b, ...rest], query) {
    if (rest.length) return undefined
    const d = demoData()
    if (a === undefined) {
      return {
        project: projectRow(d),
        // GET /:id: prompts oldest first, each with its newest four runs across platforms.
        prompts: d.prompts.map((p) => ({ ...promptRow(d, p), runs: p.runs.slice(0, 4).map(runSummary) })),
      }
    }
    if (a === "prompts" && b) {
      const p = d.prompts.find((x) => x.id === b)
      const focus = query.get("platform")
      if (!p || (focus && !PLATFORM_ORDER.includes(focus as Platform))) return undefined
      return promptDetail(d, p, focus)
    }
    return undefined
  },
}
