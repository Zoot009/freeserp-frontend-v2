"use client"

// One brand's prompts, their latest mention rate per platform, and "Run now".
//
// The rate is the product. Identical prompts measurably return different brand
// lists between runs, so every number here is "named in N of M answers" — never
// a tick or a cross, which would flip between runs and destroy trust.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { api, ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { Icon } from "@/components/dashboard/icons"
import { StatTile } from "@/components/dashboard/primitives"
import { CREDIT_ACTION_KEYS, useCreditQuote, formatCredits } from "@/lib/credits"
import { toast } from "sonner"
import { PlatformMark } from "@/components/dashboard/platform-marks"
import { Dropdown } from "@/components/dashboard/dropdown"
import {
  RunStateCell,
  RateCell,
  CitedCell,
  ProminenceCell,
} from "@/components/dashboard/ai-tracker/run-state-cell"
import {
  ACTIVE_STATUSES,
  deriveRunState,
  isWithinRunWindow,
  nextRunAllowedAt,
  clockTime,
  pct,
  PLATFORM_LABEL,
  FREQUENCY_OPTIONS,
  frequencyValue,
  runsPerMonth,
  untilTime,
  type Platform,
  type PromptRow,
  type RunResult,
  type RunSummary,
} from "@/lib/ai-tracker"

// ───── Types (mirror /api/llm-tracker/projects/:id) ─────────────────────────
// Platform, RunSummary, PromptRow and the status vocabulary live in
// lib/ai-tracker so this page and the prompt-detail page cannot drift apart —
// which is how PENDING and PROCESSING ended up rendering identically here.

type Project = {
  id: string
  name: string
  brandName: string
  brandDomain: string | null
  competitorNames: string[]
}



/** How often to ask where a run has got to. Samples take 15-75s each. */
const RUN_POLL_MS = 3000

/**
 * Stop polling after this long without the wave settling.
 *
 * Generous, because a full project on a scraper platform genuinely takes many
 * minutes at worker concurrency 8 — but not unbounded, or a wedged run leaves
 * the page polling forever.
 */
const RUN_POLL_TIMEOUT_MS = 10 * 60_000

export default function LlmPromptListPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const projectId = params.id
  const { user, loading: authLoading } = useAuth()

  const [project, setProject] = useState<Project | null>(null)
  const [prompts, setPrompts] = useState<PromptRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  /**
   * A persistent line for the "nothing happened" outcome, which a toast cannot
   * carry: it scrolls away, and this is precisely the case the user reads as a
   * broken button.
   */
  const [notice, setNotice] = useState("")
  /** Prompt ids with a run POST in flight — the visible half of duplicate prevention. */
  const inflight = useRef<Set<string>>(new Set())
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!authLoading && !user) router.push("/login")
  }, [authLoading, user, router])

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      try {
        const data = await api.get<{ project: Project; prompts: PromptRow[] }>(
          `/api/llm-tracker/projects/${projectId}`,
        )
        setProject(data.project)
        setPrompts(data.prompts)
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 404) {
          router.replace("/dashboard/ai-prompt-tracker")
          return
        }
        // Background polls must never surface an error banner over good data.
        if (!silent) setError(err instanceof Error ? err.message : "Failed to load")
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [projectId, router],
  )

  useEffect(() => {
    if (user) void load()
  }, [user, load])

  // Poll while any run is in flight. A sample can take up to ~2 minutes, so this
  // runs for a while — hence `silent`, which never raises a banner.
  //
  // Two independent starters, deliberately. This one catches a run that was
  // already in flight when the page loaded (started in another tab, or before a
  // refresh). `runNow` starts the other one from the run ids the POST returns,
  // because waiting to OBSERVE a PENDING row is exactly the race that used to
  // leave the table frozen: the old code refetched once after 1200ms and, if the
  // row had not committed yet, `hasActive` stayed false and no interval was ever
  // installed.
  const hasActive = useMemo(
    () => prompts.some((p) => p.runs.some((r) => ACTIVE_STATUSES.has(r.status))),
    [prompts],
  )
  useEffect(() => {
    if (!hasActive) return
    const id = setInterval(() => void load(true), RUN_POLL_MS)
    return () => clearInterval(id)
  }, [hasActive, load])

  // The explicit poller, owned by runNow. Stops itself once nothing is active
  // and the deadline guards a wave that dies without ever reporting.
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollDeadline = useRef(0)
  const stopPolling = useCallback(() => {
    if (pollTimer.current) clearInterval(pollTimer.current)
    pollTimer.current = null
  }, [])
  useEffect(() => stopPolling, [stopPolling])

  const startPolling = useCallback(() => {
    pollDeadline.current = Date.now() + RUN_POLL_TIMEOUT_MS
    stopPolling()
    pollTimer.current = setInterval(() => {
      if (Date.now() > pollDeadline.current) {
        stopPolling()
        return
      }
      void load(true)
    }, RUN_POLL_MS)
    // Fire once immediately rather than waiting a full interval to show anything.
    void load(true)
  }, [load, stopPolling])

  // Hand back to the state-derived poller once every run has settled.
  useEffect(() => {
    if (pollTimer.current && !hasActive) stopPolling()
  }, [hasActive, stopPolling])

  const openedNew = useRef(false)
  useEffect(() => {
    if (searchParams.get("new") === "1" && !openedNew.current && project) {
      openedNew.current = true
      if (prompts.length === 0) setShowAdd(true)
    }
  }, [searchParams, project, prompts.length])

  // What "Run all" will cost, as two rates summed. A Claude answer is 3 credits
  // where the others are 1, so a project spanning both cannot be quoted with one
  // rate — and quoting them as two separate labels would leave the addition to
  // the reader, right at the moment they are deciding whether to click.
  const runAnswers = useMemo(() => {
    const chosen = selected.size > 0 ? prompts.filter((p) => selected.has(p.id)) : prompts
    let base = 0
    let claude = 0
    for (const p of chosen) {
      const platforms = p.platforms.length ? p.platforms : (["chat_gpt"] as Platform[])
      for (const platform of platforms) {
        if (platform === "claude") claude += p.samplesPerRun
        else base += p.samplesPerRun
      }
    }
    return { base, claude }
  }, [prompts, selected])

  /**
   * Report what the 202 actually said.
   *
   * The response body was previously discarded entirely, which is why "already
   * run this hour" reached the user as a button that flashed and did nothing.
   * The server dedupes on (prompt, platform, calendar hour), so a re-run inside
   * the hour returns `{runIds: [], skipped: n}` — a success, with no work done.
   */
  const reportRunOutcome = useCallback((res: RunResult) => {
    const started = res.runIds?.length ?? 0
    if (started > 0) {
      toast.success(`Started ${started} run${started === 1 ? "" : "s"}.`, {
        description: "Answers arrive in about a minute.",
      })
    }
    if (res.refused > 0) {
      toast.error(`${res.refused} run${res.refused === 1 ? "" : "s"} skipped — not enough credits.`)
    }
    if (res.skipped > 0) {
      const at = res.outcomes?.find((o) => o.status === "skipped")?.existingRunAt
      const when = at ? ` You can run them again after ${clockTime(nextRunAllowedAt(at))}.` : ""
      if (started === 0 && res.refused === 0) {
        // Nothing happened at all. This is the case that read as a broken button,
        // so it gets a persistent notice rather than a toast that scrolls away.
        setNotice(
          `Already run in the last hour — nothing was charged, and the numbers below are the same ones.${when}`,
        )
      } else {
        toast.info(
          `${res.skipped} already ran in the last hour — nothing was charged for those.${when}`,
        )
      }
    }
  }, [])

  const runNow = async (promptIds?: string[]) => {
    const ids = promptIds ?? prompts.map((p) => p.id)
    // Client-side duplicate guard. The server's hour bucket makes a double-click
    // free, but it also makes it INVISIBLE — the second click would just report
    // "skipped". Refusing here means the guard is something the user can see.
    if (ids.some((id) => inflight.current.has(id))) return
    ids.forEach((id) => inflight.current.add(id))

    setBusy(true)
    setNotice("")
    try {
      const res = await api.post<RunResult>(
        `/api/llm-tracker/projects/${projectId}/run`,
        promptIds ? { promptIds } : {},
      )
      setSelected(new Set())
      reportRunOutcome(res)
      // Poll from the ids we were handed, not from a hopeful refetch.
      if ((res.runIds?.length ?? 0) > 0) startPolling()
      else void load(true)
    } catch (err: unknown) {
      // 402 is handled globally by the quota upsell modal via the api client.
      if (!(err instanceof ApiError && err.status === 402)) {
        setError(err instanceof Error ? err.message : "Failed to start run")
      }
    } finally {
      ids.forEach((id) => inflight.current.delete(id))
      setBusy(false)
    }
  }

  /**
   * Change one prompt's cadence.
   *
   * Optimistic, because the dropdown must not sit on the old value while the
   * request flies — that reads as the click not registering. On failure the row
   * is resynced from the server rather than left showing a lie.
   */
  const updateSchedule = async (promptId: string, checkFrequency: number | null) => {
    setPrompts((prev) =>
      prev.map((p) =>
        p.id === promptId
          ? {
              ...p,
              autoRunEnabled: checkFrequency != null,
              checkFrequency: checkFrequency ?? p.checkFrequency,
              // Cleared rather than guessed: the server decides the next run, and
              // showing a countdown we invented would be wrong by whatever the
              // round-trip took.
              nextScheduledRun: null,
            }
          : p,
      ),
    )
    try {
      const updated = await api.patch<PromptRow>(
        `/api/llm-tracker/projects/${projectId}/prompts/${promptId}`,
        { checkFrequency },
      )
      setPrompts((prev) => prev.map((p) => (p.id === promptId ? { ...p, ...updated } : p)))
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't change the schedule.")
      void load(true)
    }
  }

  const deletePrompt = async (promptId: string) => {
    setPrompts((prev) => prev.filter((p) => p.id !== promptId))
    try {
      await api.delete(`/api/llm-tracker/projects/${projectId}/prompts/${promptId}`)
    } finally {
      void load(true)
    }
  }

  const summary = useMemo(() => {
    const latest = prompts
      .map((p) => p.runs.find((r) => r.status === "COMPLETED"))
      .filter((r): r is RunSummary => !!r)
    if (latest.length === 0) return null
    const mentioned = latest.filter((r) => (r.mentionRate ?? 0) > 0).length
    const avg = latest.reduce((s, r) => s + (r.mentionRate ?? 0), 0) / latest.length
    return { tracked: prompts.length, mentioned, of: latest.length, avg }
  }, [prompts])

  if (authLoading || loading || !project) {
    return (
      <div className="page" style={{ color: "var(--text-mute)", fontSize: 13, padding: 60, textAlign: "center" }}>
        Loading…
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <div className="tiny muted">
            <Link href="/dashboard/ai-prompt-tracker">AI Prompt Tracker</Link> · {project.brandName}
          </div>
          <h1>{project.name}</h1>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={() => setShowAdd(true)}>
            <Icon.plus /> Add prompts
          </button>
          <button
            className="btn primary"
            disabled={busy || prompts.length === 0}
            onClick={() => void runNow(selected.size > 0 ? [...selected] : undefined)}
          >
            <Icon.refresh /> {selected.size > 0 ? `Run ${selected.size}` : "Run all"}
          </button>
        </div>
      </div>

      <RunCost base={runAnswers.base} claude={runAnswers.claude} />

      {summary && (
        <div className="grid g-3" style={{ marginBottom: 16 }}>
          <StatTile lbl="Prompts tracked" val={summary.tracked} />
          <StatTile
            lbl="Prompts you appear in"
            val={`${summary.mentioned} of ${summary.of}`}
            tip="at least one answer named you"
          />
          <StatTile lbl="Average mention rate" val={pct(summary.avg)} tip="across completed runs" />
        </div>
      )}

      <div className="card tight" style={{ marginBottom: 12 }}>
        <div className="tiny muted" style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <Icon.info size={13} />
          <span>
            AI answers vary between runs, so each prompt is asked {prompts[0]?.samplesPerRun ?? 3} times
            per platform and scored as a rate. A single tick would flip run to run.
          </span>
        </div>
      </div>

      {notice && (
        <div className="card tight" style={{ marginBottom: 12 }}>
          <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
            <Icon.info size={13} />
            <div className="tiny" style={{ flex: 1 }}>
              <span className="b">Already run — nothing was charged. </span>
              <span className="muted">{notice}</span>
            </div>
            <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setNotice("")}>
              <Icon.close />
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className="card" style={{ padding: 16, marginBottom: 16, color: "var(--neg)", fontSize: 13 }}>
          {error}
          <div style={{ marginTop: 10 }}>
            <button type="button" className="btn sm" onClick={() => void load()}>
              Try again
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {prompts.length === 0 ? (
          <div style={{ padding: "40px 32px", textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
            No prompts yet — add the questions your buyers ask AI.
          </div>
        ) : (
          <div className="tbl-scroll">
            <table className="tbl" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      checked={selected.size > 0 && selected.size === prompts.length}
                      onChange={(e) => setSelected(e.target.checked ? new Set(prompts.map((p) => p.id)) : new Set())}
                      aria-label="Select all"
                    />
                  </th>
                  <th>Prompt</th>
                  <th>Platform</th>
                  {/* Status was never a column: it was smuggled into Mention
                      rate, where PENDING and PROCESSING rendered identically. */}
                  <th style={{ width: 200 }}>Status</th>
                  <th style={{ textAlign: "right" }}>Mention rate</th>
                  <th style={{ textAlign: "right" }}>Cited</th>
                  <th style={{ textAlign: "right" }}>Prominence</th>
                  <th style={{ width: 150 }}>Schedule</th>
                  <th style={{ width: 80 }} />
                </tr>
              </thead>
              <tbody>
                {prompts.flatMap((p) =>
                  (p.platforms.length ? p.platforms : (["chat_gpt"] as Platform[])).map((platform, idx) => {
                    const run = p.runs.find((r) => r.platform === platform)
                    const active = run && ACTIVE_STATUSES.has(run.status)
                    const state = deriveRunState(run)
                    // A completed run inside the current calendar hour cannot be
                    // re-run: the server dedupes it and reports "skipped". Saying
                    // so on the button beats letting the click look like it failed.
                    const blocked = isWithinRunWindow(run)
                    return (
                      <tr key={`${p.id}-${platform}`} className={idx === 0 ? "llm-grp" : undefined}>
                        {idx === 0 ? (
                          <td rowSpan={p.platforms.length || 1}>
                            <input
                              type="checkbox"
                              checked={selected.has(p.id)}
                              onChange={(e) =>
                                setSelected((prev) => {
                                  const next = new Set(prev)
                                  if (e.target.checked) next.add(p.id)
                                  else next.delete(p.id)
                                  return next
                                })
                              }
                              aria-label="Select prompt"
                            />
                          </td>
                        ) : null}
                        {idx === 0 ? (
                          <td rowSpan={p.platforms.length || 1} className="kw">
                            <Link href={`/dashboard/ai-prompt-tracker/${projectId}/${p.id}`}>{p.prompt}</Link>
                          </td>
                        ) : null}
                        <td>
                          <span className="llm-plat">
                            <PlatformMark id={platform} size={15} />
                            {PLATFORM_LABEL[platform]}
                          </span>
                        </td>
                        <td>
                          <RunStateCell
                            state={state}
                            onRetry={state.kind === "failed" ? () => void runNow([p.id]) : undefined}
                          />
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <RateCell rate={run?.mentionRate ?? null} change={run?.change ?? null} />
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <CitedCell state={state} rate={run?.citationRate ?? null} />
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <ProminenceCell state={state} value={run?.avgProminence ?? null} />
                        </td>
                        {/* Cadence is a per-prompt property, so it belongs with the
                            other per-prompt cells in the rowSpan'd group — not
                            repeated once per platform row. */}
                        {idx === 0 ? (
                          <td rowSpan={p.platforms.length || 1}>
                            <Dropdown
                              ariaLabel={`Run frequency for "${p.prompt}"`}
                              value={frequencyValue(p)}
                              options={FREQUENCY_OPTIONS}
                              onChange={(v) => void updateSchedule(p.id, v === "off" ? null : Number(v))}
                              /* The table lives in .tbl-scroll, which clips an
                                 absolutely positioned menu. */
                              portal
                            />
                            {p.autoRunEnabled && p.nextScheduledRun ? (
                              <div className="tiny muted" style={{ marginTop: 4 }}>
                                Next {untilTime(p.nextScheduledRun)}
                              </div>
                            ) : null}
                          </td>
                        ) : null}
                        {idx === 0 ? (
                          <td rowSpan={p.platforms.length || 1}>
                            <div className="row" style={{ gap: 4 }}>
                              <button
                                className="icon-btn"
                                title={
                                  active
                                    ? "Already running"
                                    : blocked && run
                                      ? `Already run at ${clockTime(new Date(run.runAt))} — re-runs open at ${clockTime(nextRunAllowedAt(run.runAt))}`
                                      : "Run now"
                                }
                                disabled={busy || !!active || blocked}
                                onClick={() => void runNow([p.id])}
                              >
                                <Icon.refresh />
                              </button>
                              <button className="icon-btn" title="Remove" onClick={() => void deletePrompt(p.id)}>
                                <Icon.trash size={13} />
                              </button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    )
                  }),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <AddPromptsModal
          projectId={projectId}
          onClose={() => setShowAdd(false)}
          onAdded={({ runIds }) => {
            setShowAdd(false)
            setNotice("")
            // Runs already started, so poll from their ids rather than hoping a
            // refetch happens to observe a PENDING row.
            if (runIds && runIds.length > 0) startPolling()
            else void load(true)
          }}
        />
      )}
    </div>
  )
}

const ALL_PLATFORMS: { key: Platform; label: string; note: string }[] = [
  { key: "chat_gpt", label: "ChatGPT", note: "Real product output, with sources" },
  { key: "gemini", label: "Gemini", note: "Real product output; no geo targeting" },
  { key: "perplexity", label: "Perplexity", note: "API answer; no prominence" },
  { key: "claude", label: "Claude", note: "API answer; no prominence" },
]

function AddPromptsModal({
  projectId,
  onClose,
  onAdded,
}: {
  projectId: string
  onClose: () => void
  /** `runIds` is non-empty when the user chose "Add & run" and runs started. */
  onAdded: (result: { runIds?: string[] }) => void
}) {
  const [text, setText] = useState("")
  const [platforms, setPlatforms] = useState<Platform[]>(["chat_gpt"])
  const [samples, setSamples] = useState(3)
  // "off" by default: adding prompts and committing to recurring spend are two
  // different decisions, and the second should be opted into.
  const [freq, setFreq] = useState("off")
  const [busyMode, setBusyMode] = useState<"add" | "run" | null>(null)
  const loading = busyMode !== null
  const [error, setError] = useState("")

  const prompts = useMemo(
    () => Array.from(new Set(text.split("\n").map((l) => l.trim()).filter(Boolean))),
    [text],
  )
  const tooLong = prompts.filter((p) => p.length > 500)
  const disabled =
    loading || prompts.length === 0 || platforms.length === 0 || tooLong.length > 0

  // Claude is 3 credits an answer where the others are 1, so the two rates have
  // to be summed rather than quoted separately.
  const addBase = prompts.length * platforms.filter((x) => x !== "claude").length * samples
  const addClaude = platforms.includes("claude") ? prompts.length * samples : 0

  const toggle = (p: Platform) =>
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))

  /**
   * Add, and optionally run what was just added.
   *
   * Two calls rather than a server-side `autoRun` flag: the prompts ARE created
   * even if the run is refused for credits, so a 402 status on the combined
   * request would misreport what happened — and would bypass the global upsell
   * modal that the api client fires on a 402 from the run endpoint.
   */
  const submit = async (mode: "add" | "run") => {
    setError("")
    setBusyMode(mode)
    try {
      const res = await api.post<{ added: number; requested: number; prompts?: { id: string }[] }>(
        `/api/llm-tracker/projects/${projectId}/prompts`,
        { prompts, platforms, samplesPerRun: samples, checkFrequency: freq === "off" ? null : Number(freq) },
      )
      const dupes = res.requested - res.added
      if (dupes > 0) {
        toast.info(`${dupes} ${dupes === 1 ? "prompt was" : "prompts were"} already tracked.`)
      }

      const ids = (res.prompts ?? []).map((x) => x.id)
      if (mode === "add" || ids.length === 0) {
        toast.success(`Added ${res.added} prompt${res.added === 1 ? "" : "s"}.`)
        onAdded({})
        return
      }

      // Close first: the prompts are saved either way, so a run failure must
      // never make it look as though the add failed.
      onAdded({})
      try {
        const run = await api.post<RunResult>(`/api/llm-tracker/projects/${projectId}/run`, {
          promptIds: ids,
        })
        onAdded({ runIds: run.runIds })
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 402)) {
          toast.error(
            err instanceof ApiError ? err.message : "Prompts were added, but the run didn't start.",
          )
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add prompts")
    } finally {
      setBusyMode(null)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Enter fires the primary action, which is Add & run.
    void submit("run")
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <div className="t">Add prompts</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon.close />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-b" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="field">
              <label htmlFor="llm-prompts">Prompts (one per line, up to 100)</label>
              <textarea
                id="llm-prompts"
                className="input"
                rows={7}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={"what are the best free rank tracker tools?\nbest ahrefs alternative for a small team"}
                required
              />
              <div className="tiny muted" style={{ marginTop: 6 }}>
                Write them the way a buyer would ask. Max 500 characters each.
              </div>
            </div>

            <div className="field">
              <label>Platforms</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {ALL_PLATFORMS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    className={`chip ${platforms.includes(p.key) ? "brand" : "outline"}`}
                    onClick={() => toggle(p.key)}
                    title={p.note}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label htmlFor="llm-samples">Samples per platform</label>
              <select
                id="llm-samples"
                className="input"
                value={samples}
                onChange={(e) => setSamples(Number(e.target.value))}
              >
                {[1, 3, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                    {n === 3 ? " (recommended)" : ""}
                  </option>
                ))}
              </select>
              <div className="tiny muted" style={{ marginTop: 6 }}>
                AI answers differ run to run. Asking {samples} time{samples === 1 ? "" : "s"} turns a
                coin-flip into a rate — 1 is fast but the result will look unstable.
              </div>
            </div>

            <div className="field">
              <label htmlFor="llm-freq">Run automatically</label>
              <Dropdown
                ariaLabel="Run frequency"
                value={freq}
                options={FREQUENCY_OPTIONS}
                onChange={setFreq}
                block
                /* The menu is inside .modal-b, which scrolls — an absolutely
                   positioned one would be clipped by it. */
                portal
              />
              <div className="tiny muted" style={{ marginTop: 6 }}>
                {freq === "off"
                  ? "You'll run these yourself. You can turn on a schedule later."
                  : `${runsPerMonth(Number(freq))} runs a month. AI answers drift slowly — weekly is enough to see a trend without paying for noise.`}
              </div>
            </div>

            {prompts.length > 0 && (
              <div className="tiny muted">
                {prompts.length} prompt{prompts.length === 1 ? "" : "s"} × {platforms.length} platform
                {platforms.length === 1 ? "" : "s"} × {samples} = {prompts.length * platforms.length * samples}{" "}
                answers per run.
              </div>
            )}
            {tooLong.length > 0 && (
              <div className="tiny" style={{ color: "var(--warn)" }}>
                {tooLong.length} prompt{tooLong.length === 1 ? " is" : "s are"} over 500 characters and
                will be rejected.
              </div>
            )}
            {error && <div className="tiny" style={{ color: "var(--neg)" }}>{error}</div>}
          </div>
          <div className="modal-f split">
            {/* The price of the run this button would start. The modal decided
                the spend and showed no cost at all until now. */}
            <RunCost base={addBase} claude={addClaude} everyHours={freq === "off" ? null : Number(freq)} />
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn" onClick={onClose} disabled={loading}>
                Cancel
              </button>
              <button type="button" className="btn" disabled={disabled} onClick={() => void submit("add")}>
                {busyMode === "add" ? "Adding…" : "Add only"}
              </button>
              <button type="submit" className="btn primary" disabled={disabled}>
                {busyMode === "run" ? "Starting…" : "Add & run"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

/**
 * The price of the run the button next to it would start.
 *
 * Renders nothing for a grandfathered worker subscriber, who spends daily checks
 * rather than credits, and nothing while the rate card is loading — the same
 * rules <CreditCost> follows. It exists instead of <CreditCost> only because a
 * run can span two rates at once.
 */
function RunCost({
  base,
  claude,
  everyHours,
}: {
  base: number
  claude: number
  /** Set when a cadence is chosen, to also price the recurring commitment. */
  everyHours?: number | null
}) {
  const flat = useCreditQuote(CREDIT_ACTION_KEYS.llmPromptSample, Math.max(base, 1))
  const pricey = useCreditQuote(CREDIT_ACTION_KEYS.llmPromptSample, Math.max(claude, 1), "claude")
  if (!flat.applies || flat.cost == null || pricey.cost == null) return null

  const total = (base > 0 ? flat.cost : 0) + (claude > 0 ? pricey.cost : 0)
  if (total === 0) return null
  const short = flat.balance != null && total > flat.balance

  return (
    <div className="tiny" style={{ marginBottom: 12, color: short ? "var(--warn)" : "var(--muted)" }}>
      Uses {formatCredits(total)} credit{total === 1 ? "" : "s"}
      {flat.balance != null && (short ? ` \u00b7 only ${formatCredits(flat.balance)} left` : ` \u00b7 ${formatCredits(flat.balance)} left`)}
      {/* The number above prices ONE run, which is the right one next to a button
          that starts one run. A schedule is a standing commitment, so it gets its
          own line rather than quietly changing what the first number means. */}
      {everyHours ? (
        <div style={{ marginTop: 2 }}>
          Then about {formatCredits(total * runsPerMonth(everyHours))} a month while scheduled.
        </div>
      ) : null}
    </div>
  )
}
