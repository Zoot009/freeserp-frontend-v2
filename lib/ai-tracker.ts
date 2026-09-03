// Shared vocabulary for the AI Prompt Tracker.
//
// The Platform union, the run-status union, PLATFORM_LABEL and pct() were each
// declared separately in two or three of the feature's page files, which is how
// the two pages drifted into rendering the same status differently. One
// definition, imported everywhere.

/** Mirrors PLATFORMS in the backend's llmPlatform.adapter.ts. */
export const PLATFORMS = ["chat_gpt", "gemini", "perplexity", "claude"] as const
export type Platform = (typeof PLATFORMS)[number]

export const PLATFORM_LABEL: Record<Platform, string> = {
  chat_gpt: "ChatGPT",
  gemini: "Gemini",
  perplexity: "Perplexity",
  claude: "Claude",
}

/**
 * URL-safe ids for the per-platform routes.
 *
 * The API's own ids carry an underscore (`chat_gpt`), which is ugly in a path
 * and easy to typo. The slug is the public spelling; the map is the only place
 * the two vocabularies meet.
 */
export const PLATFORM_SLUG: Record<Platform, string> = {
  chat_gpt: "chatgpt",
  gemini: "gemini",
  perplexity: "perplexity",
  claude: "claude",
}

export const SLUG_TO_PLATFORM: Record<string, Platform> = Object.fromEntries(
  (Object.entries(PLATFORM_SLUG) as [Platform, string][]).map(([id, slug]) => [slug, id]),
)

export function isPlatform(v: string): v is Platform {
  return (PLATFORMS as readonly string[]).includes(v)
}

// ───── Runs ─────────────────────────────────────────────────────────────────

export const RUN_STATUSES = ["PENDING", "PROCESSING", "COMPLETED", "FAILED"] as const
export type RunStatus = (typeof RUN_STATUSES)[number]

/** Statuses that mean work is still outstanding, and so keep the poller alive. */
export const ACTIVE_STATUSES: ReadonlySet<RunStatus> = new Set<RunStatus>(["PENDING", "PROCESSING"])

export type RunSummary = {
  id: string
  platform: Platform
  status: RunStatus
  mentionRate: number | null
  citationRate: number | null
  avgProminence: number | null
  change: number | null
  samplesRequested: number
  samplesCompleted: number
  /** Added alongside errorMessage so a partial success is distinguishable. */
  samplesSucceeded?: number
  errorMessage?: string | null
  runAt: string
}

export type PromptRow = {
  id: string
  prompt: string
  platforms: Platform[]
  samplesPerRun: number
  runs: RunSummary[]
  /** Cadence fields are optional so a frontend deployed ahead of the backend
   *  still typechecks against the older payload, which simply omits them. */
  autoRunEnabled?: boolean
  checkFrequency?: number
  nextScheduledRun?: string | null
}

// ───── Cadence ──────────────────────────────────────────────────────────────

/** Mirrors frequencySchema in the backend's llmPrompt.routes.ts. Hours. */
export const FREQUENCIES = [24, 72, 168, 720] as const
export type Frequency = (typeof FREQUENCIES)[number]

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  24: "Daily",
  72: "Every 3 days",
  168: "Weekly",
  720: "Monthly",
}

/**
 * Options for the cadence Dropdown, with "off" as the explicit manual choice.
 *
 * "off" rather than an empty string: a falsy value in a <select>-alike is the
 * one that gets confused with "nothing chosen yet", and manual-only is a real
 * choice a user makes, not the absence of one.
 */
export const FREQUENCY_OPTIONS = [
  { value: "off", label: "Manual only" },
  ...FREQUENCIES.map((h) => ({ value: String(h), label: FREQUENCY_LABEL[h] })),
]

export function isFrequency(v: number): v is Frequency {
  return (FREQUENCIES as readonly number[]).includes(v)
}

/** Runs a 30-day month gets at this cadence — what multiplies the per-run cost. */
export const runsPerMonth = (hours: number): number => Math.round((30 * 24) / hours)

/** What the dropdown should show for a prompt, including the manual case. */
export function frequencyValue(p: Pick<PromptRow, "autoRunEnabled" | "checkFrequency">): string {
  return p.autoRunEnabled && p.checkFrequency ? String(p.checkFrequency) : "off"
}

/**
 * What a prompt is doing on one platform, as a closed set the UI can switch on.
 *
 * A prompt has no status of its own — the database gives status to runs, not
 * prompts — so every status in this feature is derived, and it is derived here
 * rather than in each cell. PENDING and PROCESSING are kept apart deliberately:
 * one is waiting for a worker slot and the other is mid-answer with real
 * progress to show, and the old table rendered them identically.
 */
export type RunState =
  | { kind: "none" }
  | { kind: "queued"; done: number; of: number }
  | { kind: "running"; done: number; of: number }
  | { kind: "completed"; at: string; succeeded: number; of: number; failed: number }
  | { kind: "failed"; at: string; reason: string | null }

/**
 * The fields deriveRunState actually reads.
 *
 * Typed as a subset rather than RunSummary so the platform routes — which omit
 * `platform`, the whole response already being scoped to one — can be passed
 * straight in without a cast.
 */
export type DerivableRun = Pick<
  RunSummary,
  "status" | "samplesCompleted" | "samplesRequested" | "runAt"
> &
  Partial<Pick<RunSummary, "samplesSucceeded" | "errorMessage">>

export function deriveRunState(run: DerivableRun | undefined | null): RunState {
  if (!run) return { kind: "none" }
  switch (run.status) {
    case "PENDING":
      return { kind: "queued", done: run.samplesCompleted, of: run.samplesRequested }
    case "PROCESSING":
      return { kind: "running", done: run.samplesCompleted, of: run.samplesRequested }
    case "FAILED":
      return { kind: "failed", at: run.runAt, reason: run.errorMessage ?? null }
    case "COMPLETED": {
      const succeeded = run.samplesSucceeded ?? run.samplesCompleted
      return {
        kind: "completed",
        at: run.runAt,
        succeeded,
        of: run.samplesRequested,
        failed: Math.max(0, run.samplesRequested - succeeded),
      }
    }
  }
}

/** The newest run for one platform. Runs arrive newest-first from the API. */
export function runFor(prompt: PromptRow, platform: Platform): RunSummary | undefined {
  return prompt.runs.find((r) => r.platform === platform)
}

/** True while any run on this prompt is still outstanding. */
export function isPromptActive(prompt: PromptRow): boolean {
  return prompt.runs.some((r) => ACTIVE_STATUSES.has(r.status))
}

// ───── Run requests ─────────────────────────────────────────────────────────

export type RunOutcome = {
  promptId: string
  platform: Platform
  status: "started" | "skipped" | "refused"
  runId?: string
  existingRunAt?: string
}

export type RunResult = {
  runIds: string[]
  skipped: number
  refused: number
  /** Absent on a backend that predates the per-prompt breakdown. */
  outcomes?: RunOutcome[]
}

/**
 * When a skipped prompt becomes runnable again.
 *
 * The server dedupes on a key bucketed by CALENDAR HOUR (`runWindow` is
 * `toISOString().slice(0,13)`), not on elapsed time — so the answer is always the
 * top of the next hour, and it can be stated exactly rather than as "in a while".
 */
export function nextRunAllowedAt(existingRunAt: string): Date {
  // UTC, because the server's bucket is UTC: runWindow() is
  // `toISOString().slice(0,13)`. Using local setHours/setMinutes here would land
  // on a local hour boundary, which is a different instant in any zone offset by
  // a fraction of an hour (IST, for one) — and the resulting "you can run again
  // at ..." would be wrong by that offset. The returned Date is still an
  // instant, so callers format it in local time as usual.
  const d = new Date(existingRunAt)
  d.setUTCMinutes(0, 0, 0)
  d.setUTCHours(d.getUTCHours() + 1)
  return d
}

/** True while a completed run still blocks a re-run of the same prompt+platform. */
export function isWithinRunWindow(run: RunSummary | undefined | null, now = new Date()): boolean {
  if (!run) return false
  return now < nextRunAllowedAt(run.runAt)
}

// ───── Formatting ───────────────────────────────────────────────────────────

/** A rate as a whole percent. Null is "we have not measured", never "0%". */
export const pct = (v: number | null | undefined): string =>
  v == null ? "—" : `${Math.round(v * 100)}%`

/**
 * Forward counterpart to relTime, which is past-tense only.
 *
 * relTime on a future timestamp renders "-43m ago", which is why a scheduled
 * run needs its own formatter rather than reusing that one.
 */
export function untilTime(iso: string, now = Date.now()): string {
  const m = Math.round((new Date(iso).getTime() - now) / 60_000)
  if (m <= 0) return "due now"
  if (m < 60) return `in ${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `in ${h}h`
  const d = Math.round(h / 24)
  return d === 1 ? "tomorrow" : `in ${d}d`
}

export function relTime(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime()
  const m = Math.round(diff / 60_000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return d === 1 ? "yesterday" : `${d}d ago`
}

export function clockTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

// ───── Platform views ───────────────────────────────────────────────────────
// The shapes GET /api/llm-tracker/platforms[/:platform] returns. Vocabulary
// rather than editorial copy, so they live here rather than in ai-engines.ts —
// the engine page and every panel component reads them.

export type ProjectRef = {
  id: string
  name: string
  brandName: string
  brandDomain: string | null
}

/**
 * A run as the PLATFORM routes return it.
 *
 * Not RunSummary: that carries `platform`, which these routes deliberately omit
 * because the whole response is already scoped to one. Typing it as RunSummary
 * would promise a field that is never sent.
 */
export type PlatformRun = Omit<RunSummary, "platform">

export type PlatformPrompt = {
  id: string
  projectId: string
  prompt: string
  samplesPerRun: number
  /**
   * Newest first. `runs[0]` is the current state; the rest are history for the
   * sparkline. Older backends send exactly one — hence every reader must treat
   * anything past [0] as optional rather than assuming a window.
   */
  runs: PlatformRun[]
}

export type PlatformSummary = {
  tracked: number
  measured: number
  mentioned: number
  avgMentionRate: number
  cited: number
}

export type PlatformView = {
  platform: Platform
  label: string
  /** Brands that have at least one prompt on this assistant — what the boards
   *  render and what "brands tracked here" counts. */
  projects: ProjectRef[]
  /**
   * EVERY brand the account has, whether or not it tracks this assistant.
   *
   * A different question from `projects`: "which brand should these new prompts
   * belong to?" has to offer the brands that do NOT track this assistant yet,
   * since they are the reason someone is adding here at all. Optional so a
   * frontend deployed ahead of the backend still typechecks — it falls back to
   * `projects`, which is the pre-existing behaviour.
   */
  availableProjects?: ProjectRef[]
  prompts: PlatformPrompt[]
  /** Null until at least one run has completed — not zero. */
  summary: PlatformSummary | null
}

/** Per-platform aggregates from the index route. Optional: added after launch. */
export type PlatformStats = {
  tracked: number
  measured: number
  mentioned: number
  avgMentionRate: number | null
  cited: number
}

export type PlatformIndex = {
  platforms: { id: Platform; label: string; supportsGeo: boolean; stats?: PlatformStats }[]
  /** Every prompt the account tracks on any assistant — the coverage denominator. */
  totalPrompts?: number
}

/** GET /api/llm-tracker/platforms/:platform/answers-detail */
export type AnswersDetail = {
  platform: Platform
  answers: number
  sources: { domain: string; title: string; url: string; count: number; promptCount: number; own: boolean }[]
  competitors: { name: string; samples: number; share: number }[]
  /** Null on the assistants that have no such field, so the UI omits the panel. */
  fanOut: { q: string; count: number }[] | null
  /**
   * promptId → how many DISTINCT domains its newest run cited.
   *
   * Served alongside the leaderboard because the leaderboard's fold is by
   * domain and destroys the per-prompt breakdown the board's Sources column
   * needs. Optional so a frontend deployed ahead of the backend still
   * typechecks — the column renders a dash rather than a wrong number.
   */
  promptSources?: Record<string, number>
}

/**
 * Mention rate over time, oldest first, for a sparkline.
 *
 * Only COMPLETED runs contribute: a pending run's null rate is "we have not
 * looked yet", and dropping it to zero would draw a cliff that never happened.
 */
export function rateHistory(runs: readonly PlatformRun[]): number[] {
  return runs
    .filter((r) => r.status === "COMPLETED" && r.mentionRate != null)
    .map((r) => r.mentionRate as number)
    .reverse()
}
