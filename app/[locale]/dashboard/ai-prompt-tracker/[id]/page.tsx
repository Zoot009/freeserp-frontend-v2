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

// ───── Types (mirror /api/llm-tracker/projects/:id) ─────────────────────────
type Platform = "chat_gpt" | "gemini" | "perplexity" | "claude"

type RunSummary = {
  id: string
  platform: Platform
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"
  mentionRate: number | null
  citationRate: number | null
  avgProminence: number | null
  change: number | null
  samplesRequested: number
  samplesCompleted: number
  runAt: string
}

type PromptRow = {
  id: string
  prompt: string
  platforms: Platform[]
  samplesPerRun: number
  runs: RunSummary[]
}

type Project = {
  id: string
  name: string
  brandName: string
  brandDomain: string | null
  competitorNames: string[]
}

const PLATFORM_LABEL: Record<Platform, string> = {
  chat_gpt: "ChatGPT",
  gemini: "Gemini",
  perplexity: "Perplexity",
  claude: "Claude",
}

const ACTIVE = new Set(["PENDING", "PROCESSING"])

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`)

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
  const hasActive = useMemo(
    () => prompts.some((p) => p.runs.some((r) => ACTIVE.has(r.status))),
    [prompts],
  )
  useEffect(() => {
    if (!hasActive) return
    const id = setInterval(() => void load(true), 3000)
    return () => clearInterval(id)
  }, [hasActive, load])

  const openedNew = useRef(false)
  useEffect(() => {
    if (searchParams.get("new") === "1" && !openedNew.current && project) {
      openedNew.current = true
      if (prompts.length === 0) setShowAdd(true)
    }
  }, [searchParams, project, prompts.length])

  const runNow = async (promptIds?: string[]) => {
    setBusy(true)
    try {
      await api.post(`/api/llm-tracker/projects/${projectId}/run`, promptIds ? { promptIds } : {})
      setSelected(new Set())
      setTimeout(() => void load(true), 1200)
    } catch (err: unknown) {
      // 402 is handled globally by the quota upsell modal via the api client.
      if (!(err instanceof ApiError && err.status === 402)) {
        setError(err instanceof Error ? err.message : "Failed to start run")
      }
    } finally {
      setBusy(false)
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

      {error && (
        <div className="card" style={{ padding: 16, marginBottom: 16, color: "var(--neg)", fontSize: 13 }}>
          {error}
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
                  <th style={{ textAlign: "right" }}>Mention rate</th>
                  <th style={{ textAlign: "right" }}>Cited</th>
                  <th style={{ textAlign: "right" }}>Prominence</th>
                  <th style={{ width: 80 }} />
                </tr>
              </thead>
              <tbody>
                {prompts.flatMap((p) =>
                  (p.platforms.length ? p.platforms : (["chat_gpt"] as Platform[])).map((platform, idx) => {
                    const run = p.runs.find((r) => r.platform === platform)
                    const active = run && ACTIVE.has(run.status)
                    return (
                      <tr key={`${p.id}-${platform}`}>
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
                          <span className="chip outline">{PLATFORM_LABEL[platform]}</span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {active ? (
                            <span className="tiny muted">
                              {run!.samplesCompleted}/{run!.samplesRequested}…
                            </span>
                          ) : run?.status === "FAILED" ? (
                            <span className="chip neg">Failed</span>
                          ) : run ? (
                            <span className="b tabular">{pct(run.mentionRate)}</span>
                          ) : (
                            <span className="tiny muted">Not run</span>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }} className="tabular">
                          {run?.status === "COMPLETED" ? pct(run.citationRate) : "—"}
                        </td>
                        <td style={{ textAlign: "right" }} className="tabular">
                          {run?.avgProminence != null ? (
                            `${Math.round(run.avgProminence * 100)}%`
                          ) : (
                            "—"
                          )}
                        </td>
                        {idx === 0 ? (
                          <td rowSpan={p.platforms.length || 1}>
                            <div className="row" style={{ gap: 4 }}>
                              <button
                                className="icon-btn"
                                title="Run now"
                                disabled={busy}
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
          onAdded={() => {
            setShowAdd(false)
            void load(true)
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
  onAdded: () => void
}) {
  const [text, setText] = useState("")
  const [platforms, setPlatforms] = useState<Platform[]>(["chat_gpt"])
  const [samples, setSamples] = useState(3)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const prompts = useMemo(
    () => Array.from(new Set(text.split("\n").map((l) => l.trim()).filter(Boolean))),
    [text],
  )
  const tooLong = prompts.filter((p) => p.length > 500)

  const toggle = (p: Platform) =>
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      await api.post(`/api/llm-tracker/projects/${projectId}/prompts`, {
        prompts,
        platforms,
        samplesPerRun: samples,
      })
      onAdded()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add prompts")
    } finally {
      setLoading(false)
    }
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
          <div className="modal-f">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn primary"
              disabled={loading || prompts.length === 0 || platforms.length === 0 || tooLong.length > 0}
            >
              {loading ? "Adding…" : `Add ${prompts.length || ""}`.trim()}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
