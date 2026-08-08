"use client"

import { useCallback, useEffect, useState } from "react"
import { Link, useRouter } from "@/i18n/navigation"
import { useAuth } from "@/lib/auth"
import { api, ApiError } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"

// ───── Types (mirror /api/youtube/projects) ────────────────────────────────

interface YtProjectSummary {
  id: string
  name: string
  targetType: "CHANNEL" | "VIDEO"
  targetRaw: string
  targetLabel: string | null
  targetChannelId: string | null
  targetVideoId: string | null
  targetMatchStrategy: string | null
  defaultDepth: number
  autoCheckEnabled: boolean
  isPaused: boolean
  checkFrequency: number
  nextScheduledCheck: string | null
  createdAt: string
  keywordCount: number
}

const DEPTHS = [20, 40, 60] as const

/** Client-side mirror of parseYoutubeTargetInput, used ONLY to show a live hint
 *  while typing. The backend re-parses and is the authority — this exists so the
 *  user finds out they pasted the wrong thing before submitting, not after. */
function previewTarget(raw: string, kind: "channel" | "video"): string | null {
  const s = raw.trim()
  if (!s) return null
  if (kind === "video") {
    const m =
      s.match(/[?&]v=([A-Za-z0-9_-]{11})/) ??
      s.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ??
      s.match(/\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/)
    if (m) return `Video: ${m[1]}`
    return /^[A-Za-z0-9_-]{11}$/.test(s) ? `Video: ${s}` : null
  }
  const chan = s.match(/\/channel\/(UC[A-Za-z0-9_-]{22})/)
  if (chan) return `Channel: ${chan[1]}`
  if (/^UC[A-Za-z0-9_-]{22}$/.test(s)) return `Channel: ${s}`
  const handle = s.match(/(?:youtube\.com\/)?@([A-Za-z0-9._-]{3,30})/)
  if (handle) return `Channel: @${handle[1]!.toLowerCase()}`
  const slug = s.match(/youtube\.com\/(?:c|user)\/([^/?#]+)/)
  if (slug) return `Channel: ${slug[1]!.toLowerCase()}`
  // A bare name is accepted but matches fuzzily until the first check resolves
  // the real channel id — worth saying so up front.
  return `Channel name: "${s}" (matched by name until the first check resolves it)`
}

// ───── Create modal ────────────────────────────────────────────────────────

function AddYoutubeProjectModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (p: YtProjectSummary) => void
}) {
  const [name, setName] = useState("")
  const [targetType, setTargetType] = useState<"channel" | "video">("channel")
  const [target, setTarget] = useState("")
  const [defaultDepth, setDefaultDepth] = useState<number>(20)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const hint = previewTarget(target, targetType)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const data = await api.post<YtProjectSummary>("/api/youtube/projects", {
        name: name.trim(),
        targetType,
        target: target.trim(),
        defaultDepth,
      })
      onCreated(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create project")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <div className="t">New YouTube project</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon.close />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-b">
            <div className="field">
              <label htmlFor="yt-name">Project name</label>
              <input
                id="yt-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My channel"
                required
                maxLength={120}
              />
            </div>

            <div className="field">
              <label>What are you tracking?</label>
              <div className="pill-toggle" style={{ width: "fit-content" }}>
                {(["channel", "video"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={targetType === k ? "active" : ""}
                    onClick={() => setTargetType(k)}
                  >
                    {k === "channel" ? "Channel" : "Single video"}
                  </button>
                ))}
              </div>
              <div className="tiny muted" style={{ marginTop: 6 }}>
                {targetType === "channel"
                  ? "Any video from this channel counts as a ranking result."
                  : "Only this exact video counts as a ranking result."}
              </div>
            </div>

            <div className="field">
              <label htmlFor="yt-target">{targetType === "channel" ? "Channel URL, @handle or ID" : "Video URL or ID"}</label>
              <input
                id="yt-target"
                className="input"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={
                  targetType === "channel" ? "https://youtube.com/@yourchannel" : "https://youtube.com/watch?v=…"
                }
                required
                maxLength={512}
              />
              <div className="tiny" style={{ marginTop: 6, color: hint ? "var(--text-mute)" : "var(--warn)" }}>
                {hint ?? "Couldn't recognise that yet — paste the full URL from YouTube."}
              </div>
            </div>

            <div className="field">
              <label htmlFor="yt-depth">Results to check per keyword</label>
              <select
                id="yt-depth"
                className="input"
                value={defaultDepth}
                onChange={(e) => setDefaultDepth(Number(e.target.value))}
              >
                {DEPTHS.map((d) => (
                  <option key={d} value={d}>
                    Top {d}
                    {d === 20 ? " (default)" : ""}
                  </option>
                ))}
              </select>
              <div className="tiny muted" style={{ marginTop: 6 }}>
                YouTube is billed per 20 results, so Top 40 costs twice a Top 20 check and Top 60 three times. You can
                change this later.
              </div>
            </div>

            {error && (
              <div className="tiny" style={{ color: "var(--neg)" }}>
                {error}
              </div>
            )}
          </div>
          <div className="modal-f">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={loading || !name.trim() || !target.trim()}>
              {loading ? "Creating…" : "Create project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ───── Page ────────────────────────────────────────────────────────────────

export default function YoutubeProjectsPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [projects, setProjects] = useState<YtProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) router.push("/login")
  }, [user, authLoading, router])

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ projects: YtProjectSummary[] }>("/api/youtube/projects")
      setProjects(data.projects)
    } catch (err: unknown) {
      // 404 = the feature flag is off on this backend. Say so plainly rather
      // than showing a generic failure.
      if (err instanceof ApiError && err.status === 404) setError("YouTube tracking isn't enabled on this account yet.")
      else setError(err instanceof Error ? err.message : "Failed to load projects")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (authLoading || loading) {
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
          <div className="t">YouTube</div>
          <div className="tiny muted">Track where your videos rank in YouTube search.</div>
        </div>
        <button className="btn primary" onClick={() => setShowAdd(true)}>
          <Icon.plus /> New project
        </button>
      </div>

      {error && (
        <div className="card tight" style={{ color: "var(--neg)", fontSize: 13 }}>
          {error}
        </div>
      )}

      {!error && projects.length === 0 && (
        <div
          className="card"
          style={{ border: "1px dashed var(--border-strong)", background: "transparent", textAlign: "center", padding: 40 }}
        >
          <div className="eyebrow">
            <span className="spark">
              <Icon.spark />
            </span>{" "}
            Nothing tracked yet
          </div>
          <div className="b" style={{ margin: "8px 0 14px" }}>
            Track a channel or a single video against your keywords.
          </div>
          <button className="btn primary" onClick={() => setShowAdd(true)}>
            <Icon.plus /> New YouTube project
          </button>
        </div>
      )}

      {projects.length > 0 && (
        <div className="grid g-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/dashboard/youtube/${p.id}/keywords`} className="card" style={{ display: "block" }}>
              <div className="card-h">
                <div>
                  <div className="t">{p.name}</div>
                  <div className="tiny muted">
                    {p.targetType === "CHANNEL" ? "Channel" : "Video"} · {p.targetLabel ?? p.targetRaw}
                  </div>
                </div>
                <span className="chip outline">Top {p.defaultDepth}</span>
              </div>
              <div className="row" style={{ gap: 10, marginTop: 10, alignItems: "center" }}>
                <span className="tiny muted">
                  {p.keywordCount} keyword{p.keywordCount === 1 ? "" : "s"}
                </span>
                <span className={`chip ${p.autoCheckEnabled && !p.isPaused ? "pos" : ""}`.trim()}>
                  {p.isPaused ? "Paused" : p.autoCheckEnabled ? `Every ${p.checkFrequency}h` : "Manual"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showAdd && (
        <AddYoutubeProjectModal
          onClose={() => setShowAdd(false)}
          onCreated={(p) => {
            setShowAdd(false)
            // ?new=1 opens the add-keywords modal straight away — a project with
            // no keywords does nothing, so don't make them find the button.
            router.push(`/dashboard/youtube/${p.id}/keywords?new=1`)
          }}
        />
      )}
    </div>
  )
}
