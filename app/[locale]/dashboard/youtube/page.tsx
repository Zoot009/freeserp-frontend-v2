"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Link, useRouter } from "@/i18n/navigation"
import { useAuth } from "@/lib/auth"
import { api, ApiError } from "@/lib/api"
import { ChevronRight, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Favicon } from "@/components/favicon"
import { Icon } from "@/components/dashboard/icons"
import { ToolContext } from "@/components/dashboard/tool-context"

// ───── Types (mirror /api/youtube/projects) ────────────────────────────────

interface YtProjectSummary {
  id: string
  name: string
  targetType: "CHANNEL" | "VIDEO"
  targetRaw: string
  targetLabel: string | null
  targetChannelId: string | null
  targetVideoId: string | null
  /** Channel avatar, resolved once at creation. Null on older projects. */
  targetAvatarUrl?: string | null
  targetMatchStrategy: string | null
  defaultDepth: number
  autoCheckEnabled: boolean
  isPaused: boolean
  checkFrequency: number
  nextScheduledCheck: string | null
  createdAt: string
  keywordCount: number
}

/**
 * The picture for a project: the video's thumbnail, the channel's avatar, or
 * the platform mark.
 *
 * A video thumbnail is derived from the id — nothing is stored for it, because
 * the URL is rebuildable. A channel avatar has to be stored, because it is an
 * opaque hash with no relationship to the channel id.
 *
 * Both fall back to the YouTube mark on error, not just when absent. A stored
 * avatar URL rotates whenever the owner changes their picture, so an old row
 * will eventually 404 — and a broken image icon on the card would be worse than
 * the mark it replaced.
 */
function ProjectAvatar({
  videoId,
  avatarUrl,
}: {
  videoId: string | null
  avatarUrl: string | null
}) {
  const [broken, setBroken] = useState(false)
  const src = videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : avatarUrl

  if (!src || broken) return <Favicon domain="youtube.com" size={32} bare />

  return (
    // eslint-disable-next-line @next/next/no-img-element -- a 32px picture gains
    // nothing from the optimizer, and next/image would need both i.ytimg.com and
    // yt3.googleusercontent.com allow-listed in next.config.
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
      className="size-8 shrink-0 rounded-md border border-border/60 object-cover"
    />
  )
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
  const t = useTranslations("tools")
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
          <div className="t">{t("ytNewProjectTitle")}</div>
          <button className="icon-btn" onClick={onClose} aria-label={t("close")}>
            <Icon.close />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-b">
            <div className="field">
              <label htmlFor="yt-name">{t("ytProjectName")}</label>
              <input
                id="yt-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("ytMyChannel")}
                required
                maxLength={120}
              />
            </div>

            <div className="field">
              <label>{t("ytWhatTracking")}</label>
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
              <label htmlFor="yt-depth">{t("ytResultsPerKeyword")}</label>
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
              {t("cancel")}
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
  const t = useTranslations("tools")
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [projects, setProjects] = useState<YtProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [showAdd, setShowAdd] = useState(false)
  const [view, setView] = useState<"grid" | "list">("grid")

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
        {t("loading")}
      </div>
    )
  }

  return (
    <div className="page">
      {/* Headed like Overview, Website Audit and Rank Tracker — 26px title, a
          muted subtitle, the action pushed right. This page was still using the
          old .page-h block with a 14px .t, so the page title was smaller than
          the card titles underneath it. */}
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em]">{t("ytTitle")}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Track where your videos rank in YouTube search.
            {projects.length > 0 && (
              <> · {projects.length} project{projects.length === 1 ? "" : "s"}</>
            )}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          {/* The Rank Tracker's Grid/List switch, same segmented control. Only
              shown with something to switch between — offering a list view of an
              empty page is a control that does nothing. */}
          {projects.length > 0 && (
            <div className="inline-flex gap-0.5 rounded-[9px] bg-muted p-[3px]">
              {(["grid", "list"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={
                    "rounded-[7px] px-2.5 py-[5px] text-[13px] transition-colors " +
                    (view === v
                      ? "bg-primary font-semibold text-primary-foreground"
                      : "font-medium text-muted-foreground hover:bg-border/60 hover:text-foreground")
                  }
                >
                  {v === "grid" ? "Grid" : "List"}
                </button>
              ))}
            </div>
          )}
          <Button
            onClick={() => setShowAdd(true)}
            className="h-[38px] gap-1.5 rounded-[9px] text-sm font-semibold"
          >
            <Plus className="size-4" /> {t("ytNewProject")}
          </Button>
        </div>
      </div>

      <ToolContext id="youtube-tracker" />

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {!error && projects.length === 0 && (
        <div className="rounded-xl border border-dashed px-6 py-14 text-center">
          <p className="text-[15px] font-semibold">{t("ytNothingTracked")}</p>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
            Track a channel or a single video, add the keywords you want to rank for, and
            see where you land in YouTube search.
          </p>
          <Button
            onClick={() => setShowAdd(true)}
            className="mt-5 h-[38px] gap-1.5 rounded-[9px] text-sm font-semibold"
          >
            <Plus className="size-4" /> {t("ytNewProjectTitle")}
          </Button>
        </div>
      )}

      {projects.length > 0 && view === "grid" && (
        /* A real responsive grid, so one project doesn't sit alone in a narrow
           column with the rest of the page empty beside it. */
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            /* Laid out like a Rank Tracker project card — same identity row,
               same two-stat block, same status chip — so the two trackers read
               as one product rather than two people's work. */
            <Link
              key={p.id}
              href={`/dashboard/youtube/${p.id}/keywords`}
              className="block rounded-xl border bg-card p-4 shadow-sm transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-md"
            >
              <div className="mb-3.5 flex items-center gap-3">
                {/* A video's real thumbnail, which is derivable from its id —
                    the same reason the backend deliberately doesn't store one.
                    A CHANNEL avatar is not derivable (it's an opaque
                    googleusercontent hash) and isn't stored, so those keep the
                    platform mark rather than a broken image. */}
                <ProjectAvatar
                  videoId={p.targetType === "VIDEO" ? p.targetVideoId : null}
                  avatarUrl={p.targetAvatarUrl ?? null}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{p.name}</div>
                  {/* Not monospace. That was carried over from the Rank Tracker
                      card, where the subtitle is a domain and mono is right —
                      here it is a channel name, and setting a person's channel
                      in code type made "Cassiopeia" read as an identifier.
                      The Channel/Video label stays, so the name is never left
                      floating without saying what it is the name OF. */}
                  <div className="truncate text-xs text-muted-foreground">
                    {p.targetType === "CHANNEL" ? "Channel" : "Video"}
                    {(p.targetLabel ?? p.targetRaw) && (
                      <> · {p.targetLabel ?? p.targetRaw}</>
                    )}
                  </div>
                </div>
                <span
                  className={
                    "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium " +
                    (p.isPaused
                      ? "bg-amber-500/12 text-amber-600 dark:text-amber-400"
                      : p.autoCheckEnabled
                        ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground")
                  }
                >
                  {p.isPaused ? "Paused" : p.autoCheckEnabled ? `Every ${p.checkFrequency}h` : "Manual"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <div className="text-xs text-muted-foreground">{t("ytKeywords")}</div>
                  <div className="text-[18px] font-bold tabular-nums">{p.keywordCount}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t("ytAdded")}</div>
                  <div className="text-[13px] font-bold tabular-nums">
                    {new Date(p.createdAt).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </div>
                </div>
              </div>

              {/* Where a Rank Tracker card puts its trend line. There is no
                  rank history on this list payload, so the slot states the
                  search depth instead of drawing an empty chart. */}
              <div className="mt-3.5 border-t pt-2.5 text-xs text-muted-foreground">
                {p.keywordCount === 0
                  ? "No keywords yet"
                  : `Checking the top ${p.defaultDepth} results`}
              </div>
            </Link>
          ))}

          {/* The dashed add-tile that closes the Rank Tracker grid, so the row
              never ends on a ragged gap. */}
          <button
            onClick={() => setShowAdd(true)}
            className="grid min-h-[168px] place-items-center rounded-xl border border-dashed p-4 text-center transition-colors hover:border-primary/50 hover:bg-muted/40"
          >
            <div>
              <Plus className="mx-auto size-5 text-muted-foreground" />
              <div className="mt-2 text-sm font-semibold">{t("ytNewProject")}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{t("ytTrackChannelOrVideo")}</div>
            </div>
          </button>
        </div>
      )}

      {projects.length > 0 && view === "list" && (
        /* The Rank Tracker's list view: one row per project, the same columns
           it shows — identity, keywords, status, created — minus the trend,
           which this endpoint carries no history for. */
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="grid grid-cols-[minmax(0,1fr)_80px_110px_88px_28px] items-center gap-3 border-b bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>{t("ytProject")}</span>
            <span className="text-right">{t("ytKeywords")}</span>
            <span className="text-right">{t("ytStatus")}</span>
            <span className="text-right">{t("ytAdded")}</span>
            <span />
          </div>

          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/dashboard/youtube/${p.id}/keywords`}
              className="grid grid-cols-[minmax(0,1fr)_80px_110px_88px_28px] items-center gap-3 border-b px-4 py-2.5 text-[13px] transition-colors last:border-0 hover:bg-muted"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <ProjectAvatar
                  videoId={p.targetType === "VIDEO" ? p.targetVideoId : null}
                  avatarUrl={p.targetAvatarUrl ?? null}
                />
                <div className="min-w-0">
                  <div className="truncate font-semibold">{p.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {p.targetType === "CHANNEL" ? "Channel" : "Video"}
                    {(p.targetLabel ?? p.targetRaw) && <> · {p.targetLabel ?? p.targetRaw}</>}
                  </div>
                </div>
              </div>

              <span className="text-right tabular-nums">{p.keywordCount}</span>

              <span className="flex justify-end">
                <span
                  className={
                    "rounded-full px-2 py-0.5 text-[11px] font-medium " +
                    (p.isPaused
                      ? "bg-amber-500/12 text-amber-600 dark:text-amber-400"
                      : p.autoCheckEnabled
                        ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground")
                  }
                >
                  {p.isPaused ? "Paused" : p.autoCheckEnabled ? `Every ${p.checkFrequency}h` : "Manual"}
                </span>
              </span>

              <span className="text-right text-xs tabular-nums text-muted-foreground">
                {new Date(p.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
              </span>

              <span className="flex justify-end">
                <ChevronRight className="size-4 text-muted-foreground/50" />
              </span>
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
