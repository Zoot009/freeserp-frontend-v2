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

export function deriveRunState(run: RunSummary | undefined | null): RunState {
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
