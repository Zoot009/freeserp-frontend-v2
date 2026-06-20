"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth"
import { api, ApiError } from "@/lib/api"
import { useTutorial } from "@/lib/tutorial"
import { LocationPicker } from "@/components/location-picker"
import { Favicon } from "@/components/favicon"
import { Icon } from "@/components/dashboard/icons"
import { FavoriteButton } from "@/components/dashboard/favorite-button"
import { AlertSettingsModal } from "@/components/dashboard/alert-settings-modal"
import { ReportModal } from "@/components/dashboard/report-modal"
import { flagFor } from "@/lib/locations"
import { trackOnce, trackMilestone } from "@/lib/track"
import {
  PosCell,
  DeltaCell,
  type SerpFeatures,
  type MonthlySearch,
} from "@/components/dashboard/primitives"

// Feature flag — automated/scheduled rank checks. When true, paid users see
// the check-frequency picker and the schedule chip. Free users never hit the
// scheduler (gated server-side in scheduler.runProjectChecks). Keep this in
// sync with the matching flag in freeserp-backend/src/routes/projects.js.
const SCHEDULED_CHECKS_ENABLED = true

// Per-project keyword cap for free users. Paid users have no cap. Must stay
// in sync with FREE_KEYWORDS_PER_PROJECT_LIMIT in the backend.
const FREE_KEYWORDS_PER_PROJECT_LIMIT = 10

// ───── Types ───────────────────────────────────────────────────────────────

interface Keyword {
  id: string
  keyword: string
  location: string
  device: string | null
  addedAt: string
  position: number | null
  // First (oldest) rank ever recorded for this keyword — drives the "First check" column.
  firstPosition: number | null
  // Position deltas over the 1/7-day windows (positive = rank improved).
  d1: number | null
  d7: number | null
  url: string | null
  monthlyTraffic: number | null
  searchVolume: number | null
  serpFeatures: SerpFeatures | null
  searchVolumeTrend: MonthlySearch[] | null
  status: string | null
  checkedAt: string | null
  latestAnalysisId: string | null
  // Page-audit score (0–100) of the ranking page, computed when a competitor
  // analysis runs for the keyword. Null until then.
  pageScore: number | null
  pageScoreGrade: string | null
  pageScoreLabel: string | null
}

interface ProjectDetail {
  id: string
  name: string
  domain: string
  isActive: boolean
  isPaused: boolean
  checkFrequency: number
  lastScheduledCheck: string | null
  nextScheduledCheck: string | null
  createdAt: string
  // Public-share token for the keywords page. Null = sharing off; non-null means
  // the read-only /share/keywords/<token> page is live. Drives the Share modal.
  shareToken: string | null
  keywords: Keyword[]
}

type UsageInfo = { plan: string; dailyUsed: number; dailyLimit: number; dailyRemaining: number; isAdmin?: boolean }

type SortKey = "kw" | "pos" | "d1" | "d7" | "vol" | "checkedAt" | "score"

// ───── Helpers ─────────────────────────────────────────────────────────────

function projectColor(id: string): string {
  const palette = ["#2D5BFF", "#F59E0B", "#10B981", "#EC4899", "#8B5CF6", "#06B6D4", "#F97316"]
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

function StatusDot({ status }: { status: string | null }) {
  const colorMap: Record<string, string> = {
    COMPLETED: "var(--pos)",
    PENDING: "var(--warn)",
    PROCESSING: "var(--brand)",
    FAILED: "var(--neg)",
  }
  const color = colorMap[status ?? ""] ?? "var(--text-mute)"
  const pulse = status === "PENDING" || status === "PROCESSING"
  // Minimal: just the colored dot; the status label lives in the tooltip.
  return (
    <span
      title={status ?? "NONE"}
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
        animation: pulse ? "shim 1.4s ease-in-out infinite" : undefined,
      }}
    />
  )
}

// Page-audit score badge. Same color buckets as the competitor-analysis
// comparison table (≥80 good, ≥60 fair, else poor) so the two surfaces agree.
// Keyword Page Score breakdown — fetched on demand when a score badge is
// clicked. Density-focused, scored over 5 fields (URL/Title/Meta/Content/
// Headings) by the backend (pageScore.ts); the detail lives in pageScoreData.
// This is intentionally decoupled from lib/seoScorer.ts (the 12-factor
// competitor-comparison scorer) — don't re-sync them.
interface KeywordScoreBreakdown {
  url: number
  title: number
  meta: number
  content: number
  headings: number
  density: number // measured content keyword density %
  total: number
  grade: string
  label: string
}

interface ScoreInfo {
  pageScore: number | null
  pageScoreGrade: string | null
  pageScoreLabel: string | null
  pageScoreUrl: string | null
  pageScoreAt: string | null
  breakdown: KeywordScoreBreakdown | null
}

// Field labels + maxes — must match the weighting in the backend pageScore.ts.
const SCORE_CATEGORIES: { key: keyof KeywordScoreBreakdown; label: string; max: number }[] = [
  { key: "url", label: "URL", max: 15 },
  { key: "title", label: "Title", max: 15 },
  { key: "meta", label: "Meta", max: 15 },
  { key: "content", label: "Content", max: 40 },
  { key: "headings", label: "Headings", max: 15 },
]

function ScoreBadge({ score, grade, label, onClick }: { score: number | null; grade: string | null; label: string | null; onClick?: () => void }) {
  if (score == null) {
    return <span className="tiny muted" title="Run a competitor analysis to score this ranking page">—</span>
  }
  const color = score >= 80 ? "var(--pos)" : score >= 60 ? "var(--warn)" : "var(--neg)"
  const soft = score >= 80 ? "var(--pos-soft)" : score >= 60 ? "var(--warn-soft)" : "var(--neg-soft)"
  const clickable = !!onClick
  return (
    <span
      title={`Page audit score${label ? ` — ${label}` : ""}${clickable ? " — click for breakdown" : ""}`}
      className="tabular"
      onClick={clickable ? (e) => { e.stopPropagation(); onClick!() } : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onClick!() } } : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 8px",
        borderRadius: "var(--r-sm)",
        background: soft,
        color,
        fontWeight: 600,
        fontSize: 12,
        lineHeight: 1.4,
        cursor: clickable ? "pointer" : "default",
      }}
    >
      {score}
      {grade ? <span style={{ opacity: 0.75, fontWeight: 500 }}>{grade}</span> : null}
    </span>
  )
}

function CountdownTimer({ targetDate }: { targetDate: string | null }) {
  const [timeLeft, setTimeLeft] = useState<string>("")

  useEffect(() => {
    if (!targetDate) {
      setTimeLeft("Not scheduled")
      return
    }
    const update = () => {
      const diff = new Date(targetDate).getTime() - Date.now()
      if (diff <= 0) {
        setTimeLeft("Running soon…")
        return
      }
      const days = Math.floor(diff / 86_400_000)
      const hours = Math.floor((diff % 86_400_000) / 3_600_000)
      const minutes = Math.floor((diff % 3_600_000) / 60_000)
      const seconds = Math.floor((diff % 60_000) / 1000)
      if (days > 0) setTimeLeft(`${days}d ${hours}h ${minutes}m`)
      else if (hours > 0) setTimeLeft(`${hours}h ${minutes}m ${seconds}s`)
      else if (minutes > 0) setTimeLeft(`${minutes}m ${seconds}s`)
      else setTimeLeft(`${seconds}s`)
    }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [targetDate])

  if (!targetDate) return <span className="tiny muted">Not scheduled</span>
  return <span className="tabular">{timeLeft}</span>
}

// ───── Add keywords modal ──────────────────────────────────────────────────

function AddKeywordsModal({
  projectId,
  currentCount,
  plan,
  onClose,
  onAdded,
}: {
  projectId: string
  currentCount: number
  plan?: string
  onClose: () => void
  onAdded: (device: "desktop" | "mobile") => void
}) {
  const [raw, setRaw] = useState("")
  const [location, setLocation] = useState("in")
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const taRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { taRef.current?.focus() }, [])

  // Only treat the user as free when /api/usage has explicitly told us so;
  // undefined (still loading) shouldn't surface paywall copy.
  const isFree = plan === "free"
  const remaining = isFree ? Math.max(0, FREE_KEYWORDS_PER_PROJECT_LIMIT - currentCount) : Infinity
  const pendingLines = raw.split(/[\r\n,]+/).map((l) => l.trim()).filter(Boolean)
  const wouldOverflow = isFree && pendingLines.length > remaining

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const lines = raw.split(/[\r\n,]+/).map((l) => l.trim()).filter(Boolean)
    if (!lines.length) { setError("Enter at least one keyword"); return }
    if (isFree && lines.length > remaining) {
      setError(
        remaining === 0
          ? `Free plan: this project already has ${currentCount} keywords (limit ${FREE_KEYWORDS_PER_PROJECT_LIMIT}). Delete some, or upgrade for unlimited keywords per project.`
          : `Free plan: you can add at most ${remaining} more keyword${remaining === 1 ? "" : "s"} to this project (limit ${FREE_KEYWORDS_PER_PROJECT_LIMIT}). Upgrade for unlimited.`
      )
      return
    }
    setError(""); setLoading(true)
    try {
      await api.post(`/api/projects/${projectId}/keywords`, { keywords: lines.map((k) => ({ keyword: k, location, device })) })
      // Adding to a still-empty project might be this account's first-ever set of
      // keywords — let the backend decide (deduped per account, so it won't
      // re-fire on a later new project the way the old per-browser guard could).
      if (currentCount === 0) void trackMilestone("first-set-keywords-added")
      onAdded(device)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add keywords")
    } finally { setLoading(false) }
  }

  return (
    <div className="fs-app">
      <div className="modal-bg" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
          <div className="modal-h">
            <div>
              <div className="eyebrow" style={{ margin: 0, fontSize: 11 }}><span className="spark"><Icon.spark /></span> TRACK KEYWORDS</div>
              <div className="b" style={{ fontSize: 18, marginTop: 4 }}>Add keywords</div>
            </div>
            <button type="button" onClick={onClose} className="icon-btn" aria-label="Close"><Icon.close /></button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="modal-b" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="field">
                <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                  <label style={{ margin: 0 }}>
                    Keywords <span className="muted" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(one per line or comma-separated)</span>
                  </label>
                  <span
                    className="tiny"
                    style={{ color: wouldOverflow ? "var(--neg)" : "var(--text-mute)", fontFamily: "var(--font-mono)" }}
                  >
                    {isFree
                      ? `${pendingLines.length}/${remaining} slot${remaining === 1 ? "" : "s"} left`
                      : `${pendingLines.length} pending · unlimited`}
                  </span>
                </div>
                <textarea
                  ref={taRef}
                  required
                  rows={6}
                  placeholder={"seo tools, keyword research\nfree serp checker"}
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  className="input"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 13,
                    resize: "vertical",
                    minHeight: 140,
                    lineHeight: 1.5,
                  }}
                />
                <span className="tiny muted">
                  {!isFree
                    ? `Paid plan — unlimited keywords per project (${currentCount} used).`
                    : remaining === 0
                      ? `Free plan: project is full — ${FREE_KEYWORDS_PER_PROJECT_LIMIT} keyword limit reached. Upgrade for unlimited.`
                      : `Free plan: up to ${FREE_KEYWORDS_PER_PROJECT_LIMIT} keywords per project (${currentCount} used). Upgrade for unlimited.`}
                </span>
              </div>
              <div className="field">
                <label>Search location</label>
                <LocationPicker value={location} onChange={setLocation} variant="dashboard" showFlags />
              </div>
              <div className="field">
                <label>Device</label>
                <div className="pill-toggle" style={{ width: "fit-content" }}>
                  {(["desktop", "mobile"] as const).map((d) => (
                    <button key={d} type="button" onClick={() => setDevice(d)} className={device === d ? "active" : ""}>
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              {error && (
                <div className="card tight" style={{ borderColor: "var(--neg)", background: "var(--neg-soft)", color: "var(--neg)", fontSize: 12 }}>
                  {error}
                </div>
              )}
            </div>
            <div className="modal-f">
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn primary" disabled={loading || remaining === 0 || wouldOverflow}>
                {loading ? "Adding…" : "Add keywords"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// ───── Page ────────────────────────────────────────────────────────────────

export default function ProjectKeywordsPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const { user, loading: authLoading, token, refreshUser } = useAuth()
  const { advanceFromStep } = useTutorial()

  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [usage, setUsage] = useState<UsageInfo | null>(null)

  // Action state
  const [checking, setChecking] = useState(false)
  // Keyword IDs with a per-keyword refresh in flight (drives the ↻ spinner).
  const [refreshingKw, setRefreshingKw] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Keyword-delete confirmation: holds the ids slated for deletion. Single
  // delete = [oneId]; bulk delete = all selected ids. `null` = modal closed.
  const [confirmDeleteKwIds, setConfirmDeleteKwIds] = useState<string[] | null>(null)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [showAddKw, setShowAddKw] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null)
  const [updatingFrequency, setUpdatingFrequency] = useState(false)
  const [tempFrequency, setTempFrequency] = useState<number | null>(null)
  const [showFrequencyModal, setShowFrequencyModal] = useState(false)
  const [showAlerts, setShowAlerts] = useState(false)
  const [showReport, setShowReport] = useState(false)
  // Public-share modal state. project.shareToken is the source of truth for
  // whether sharing is on; these just track in-flight UI.
  const [showShare, setShowShare] = useState(false)
  const [shareBusy, setShareBusy] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [pausing, setPausing] = useState(false)
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set())
  const [historyKeywordId, setHistoryKeywordId] = useState<string | null>(null)
  const [historyItems, setHistoryItems] = useState<{ id: string; status: string; createdAt: string; completedAt: string | null }[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  // Page-score breakdown modal — null id = closed. Breakdown is fetched on open.
  const [scoreKeywordId, setScoreKeywordId] = useState<string | null>(null)
  const [scoreInfo, setScoreInfo] = useState<ScoreInfo | null>(null)
  const [scoreLoading, setScoreLoading] = useState(false)
  // Keyword favorites for this user, cross-referenced once so each row's star
  // starts in the right state. favReady flips when the fetch resolves so the
  // star remounts with the correct initial value.
  const [favKw, setFavKw] = useState<Set<string>>(new Set())
  const [favReady, setFavReady] = useState(false)

  // Filter + sort state
  const [filter, setFilter] = useState("")
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "pos", dir: "asc" })
  // Device view — keywords are tracked separately per device, so the table
  // shows one device at a time. Defaults to desktop; auto-flips to mobile once
  // (on first load) if the project only has mobile keywords.
  const [deviceTab, setDeviceTab] = useState<"desktop" | "mobile">("desktop")
  const deviceTabInit = useRef(false)

  // Auth gate
  useEffect(() => {
    if (!authLoading && !user) router.push("/login")
    if (!authLoading && user && !user.emailVerified) router.push("/verify-email")
  }, [user, authLoading, router])

  // Load project
  const load = useCallback(async (silent = false): Promise<ProjectDetail | null> => {
    if (!silent) setLoading(true)
    try {
      const data = await api.get<ProjectDetail>(`/api/projects/${projectId}`)
      setProject(data)
      return data
    } catch (err: unknown) {
      // 404 = project doesn't exist (deleted, or wrong id); bounce to list.
      if (err instanceof ApiError && err.status === 404) {
        router.replace("/dashboard/projects")
        return null
      }
      // Background polls (silent) must not surface an error banner: the page
      // already shows data, so a transient network blip during polling would
      // otherwise flash a scary "Network Error". Fail quietly and let the next
      // poll retry. Only the initial (non-silent) load reports a load failure.
      if (!silent) setError(err instanceof Error ? err.message : "Failed to load project")
      return null
    } finally {
      if (!silent) setLoading(false)
    }
  }, [projectId, router])

  useEffect(() => { void load() }, [load])

  // On first load, if every keyword is mobile, open on the Mobile tab so the
  // table isn't empty. Runs once — the user's manual tab choice wins after.
  useEffect(() => {
    if (deviceTabInit.current || !project) return
    deviceTabInit.current = true
    const hasDesktop = project.keywords.some((k) => k.device !== "mobile")
    const hasMobile = project.keywords.some((k) => k.device === "mobile")
    if (!hasDesktop && hasMobile) setDeviceTab("mobile")
  }, [project])

  // Open the score-breakdown modal for a keyword and fetch its detail on demand
  // (mirrors the analysis-history modal). The header falls back to the row's
  // score while the breakdown loads.
  const openScore = async (kwId: string) => {
    setScoreKeywordId(kwId)
    setScoreInfo(null)
    setScoreLoading(true)
    try {
      const data = await api.get<ScoreInfo>(`/api/projects/${projectId}/keywords/${kwId}/score`)
      setScoreInfo(data)
    } catch {
      /* leave the breakdown empty on failure — the header still shows the score */
    } finally {
      setScoreLoading(false)
    }
  }

  // Load usage info — drives the daily-checks counter shown in the header.
  useEffect(() => {
    if (!token || !user?.emailVerified) return
    api.get<UsageInfo>("/api/usage")
      .then((data) => { if (data && typeof data.dailyLimit === "number") setUsage(data) })
      .catch(() => undefined)
  }, [token, user?.emailVerified])

  // Load the user's keyword favorites once, to seed each row's star state.
  useEffect(() => {
    if (!token || !user?.emailVerified) return
    let cancelled = false
    api.get<{ favorites: { entity: { id: string } }[] }>("/api/favorites?entityType=keyword")
      .then((r) => {
        if (cancelled) return
        setFavKw(new Set((r.favorites ?? []).map((f) => f.entity.id)))
        setFavReady(true)
      })
      .catch(() => { if (!cancelled) setFavReady(true) })
    return () => { cancelled = true }
  }, [token, user?.emailVerified])

  // Poll while any keyword is PENDING or PROCESSING — drives status dot
  // transitions without a manual refresh. Stops once everything is terminal.
  useEffect(() => {
    const hasActive = project?.keywords.some((k) => k.status === "PENDING" || k.status === "PROCESSING")
    if (!hasActive) return
    const timer = setInterval(async () => {
      const updated = await load(true)
      const stillActive = updated?.keywords?.some((k) => k.status === "PENDING" || k.status === "PROCESSING")
      if (!stillActive) clearInterval(timer)
    }, 3000)
    return () => clearInterval(timer)
  }, [project, load])

  // Also poll when the scheduler is active so we detect when it picks up the
  // next batch. Skipped when the in-flight poll above is already running.
  useEffect(() => {
    if (!project || project.isPaused || !project.nextScheduledCheck) return
    const hasActive = project.keywords.some((k) => k.status === "PENDING" || k.status === "PROCESSING")
    if (hasActive) return
    const timer = setInterval(() => { void load(true) }, 5000)
    return () => clearInterval(timer)
  }, [project, load])

  const handleRunCheck = async () => {
    if (!project) return
    // First rank check ever for this project (no keyword has been checked yet)
    // = the "first rank check" milestone. Captured before the post.
    const isFirstCheck = project.keywords.length > 0 && project.keywords.every((k) => !k.checkedAt)
    setChecking(true); setError("")
    try {
      const keywordIds = selectedKeywords.size > 0 ? Array.from(selectedKeywords) : undefined
      await api.post(`/api/projects/${project.id}/check`, { keywordIds })
      if (isFirstCheck) trackOnce("first-rank-check-button-clicked")
      setSelectedKeywords(new Set())
      advanceFromStep(3)
      setTimeout(load, 2000)
      if (refreshUser) setTimeout(() => refreshUser(), 2500)
    } catch (err: unknown) {
      // 402 = daily plan quota exhausted. The backend's message is already
      // user-facing, so surface it directly.
      if (err instanceof ApiError && err.status === 402) {
        setError(err.message || "Daily check limit reached.")
      } else {
        setError(err instanceof Error ? err.message : "Failed to start check")
      }
    } finally { setChecking(false) }
  }

  // Refresh a single keyword — schedules a SERP check for just that keyword.
  const handleRefreshKeyword = async (kwId: string) => {
    if (!project) return
    setRefreshingKw((prev) => new Set(prev).add(kwId))
    setError("")
    try {
      await api.post(`/api/projects/${project.id}/check`, { keywordIds: [kwId] })
      // Let the SerpTask register, then reload so the row flips to PROCESSING;
      // the existing 3s status poll carries it to COMPLETED.
      setTimeout(() => load(true), 1500)
      if (refreshUser) setTimeout(() => refreshUser(), 2000)
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 402) {
        setError(err.message || "Daily check limit reached.")
      } else {
        setError(err instanceof Error ? err.message : "Failed to refresh keyword")
      }
    } finally {
      setRefreshingKw((prev) => {
        const next = new Set(prev)
        next.delete(kwId)
        return next
      })
    }
  }

  const handleSelectAll = () => {
    const visibleIds = filtered.map((kw) => kw.id)
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedKeywords.has(id))
    setSelectedKeywords(allSelected ? new Set() : new Set(visibleIds))
  }

  const handleToggleKeyword = (kwId: string) => {
    setSelectedKeywords((prev) => {
      const next = new Set(prev)
      if (next.has(kwId)) next.delete(kwId)
      else next.add(kwId)
      return next
    })
  }

  // Bulk delete — fires DELETE calls in parallel, then prunes local state in
  // one pass so the table only re-renders once. If a subset fails, only the
  // successfully-deleted ones are removed from view and a generic error is
  // surfaced.
  const handleBulkDeleteKeywords = async (kwIds: string[]) => {
    setBulkDeleting(true); setError("")
    try {
      const results = await Promise.allSettled(
        kwIds.map((id) => api.delete(`/api/projects/${projectId}/keywords/${id}`))
      )
      const deletedIds = new Set<string>()
      kwIds.forEach((id, i) => { if (results[i].status === "fulfilled") deletedIds.add(id) })
      setProject((prev) => prev ? { ...prev, keywords: prev.keywords.filter((k) => !deletedIds.has(k.id)) } : prev)
      setSelectedKeywords((prev) => {
        const next = new Set(prev)
        deletedIds.forEach((id) => next.delete(id))
        return next
      })
      const failedCount = kwIds.length - deletedIds.size
      if (failedCount > 0) setError(`Removed ${deletedIds.size} of ${kwIds.length} keywords — ${failedCount} failed.`)
    } finally {
      setBulkDeleting(false)
      setConfirmDeleteKwIds(null)
    }
  }

  const handleDeleteProject = async () => {
    setDeleting(true); setError("")
    try {
      await api.delete(`/api/projects/${projectId}`)
      router.replace("/dashboard/projects")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete project")
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const handleUpdateFrequency = async (newFrequency: number) => {
    setUpdatingFrequency(true); setError("")
    try {
      const data = await api.patch<Partial<ProjectDetail>>(`/api/projects/${projectId}/frequency`, { checkFrequency: newFrequency })
      setProject((prev) => prev ? { ...prev, ...data } : prev)
      setShowFrequencyModal(false)
      setTempFrequency(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update frequency")
    } finally { setUpdatingFrequency(false) }
  }

  const handleFrequencyChange = (newFrequency: number) => {
    setTempFrequency(newFrequency)
    setShowFrequencyModal(true)
  }

  const handleTogglePause = async () => {
    if (!project) return
    setPausing(true); setError("")
    try {
      // Pause/resume is a field update on the project — there is no dedicated
      // /pause route. PATCH /:id accepts isPaused and returns the project.
      const data = await api.patch<Partial<ProjectDetail>>(`/api/projects/${project.id}`, { isPaused: !project.isPaused })
      setProject((prev) => prev ? { ...prev, ...data } : prev)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to toggle pause")
    } finally { setPausing(false) }
  }

  // Public share URL for the current token (host-relative so it points at the
  // domain the user is actually on). Empty when sharing is off.
  const shareUrl =
    project?.shareToken && typeof window !== "undefined"
      ? `${window.location.origin}/share/keywords/${project.shareToken}`
      : ""

  // Enable public sharing — idempotent on the backend, so reopening the modal
  // and clicking again just returns the existing token.
  const handleCreateShare = async () => {
    if (!project) return
    setShareBusy(true); setError("")
    try {
      const data = await api.post<{ shareToken: string }>(`/api/projects/${project.id}/share`)
      setProject((prev) => (prev ? { ...prev, shareToken: data.shareToken } : prev))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create share link")
    } finally { setShareBusy(false) }
  }

  // Revoke the link — the public page 404s afterwards.
  const handleDisableShare = async () => {
    if (!project) return
    setShareBusy(true); setError("")
    try {
      await api.delete(`/api/projects/${project.id}/share`)
      setProject((prev) => (prev ? { ...prev, shareToken: null } : prev))
      setShareCopied(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to disable sharing")
    } finally { setShareBusy(false) }
  }

  const handleCopyShare = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    } catch {
      // Clipboard blocked (insecure context / permissions) — non-fatal.
    }
  }

  // ───── Derived data ─────────────────────────────────────────────────────

  const statusCounts: Record<string, number> = useMemo(() => {
    if (!project) return {}
    return project.keywords.reduce<Record<string, number>>((acc, kw) => {
      const s = kw.status || "NONE"
      acc[s] = (acc[s] || 0) + 1
      return acc
    }, {})
  }, [project])

  const pendingCount = (statusCounts["PENDING"] || 0) + (statusCounts["PROCESSING"] || 0)

  // Keyword count per device — drives the labels on the Desktop/Mobile tabs.
  // Legacy rows with a null device are treated as desktop.
  const deviceCounts = useMemo(() => {
    const c = { desktop: 0, mobile: 0 }
    project?.keywords.forEach((k) => { k.device === "mobile" ? c.mobile++ : c.desktop++ })
    return c
  }, [project])

  // Keywords for the active device tab. Stats + table both scope to this so the
  // whole view reflects the selected device.
  const scoped = useMemo(
    () => (project?.keywords ?? []).filter((k) => (k.device === "mobile" ? "mobile" : "desktop") === deviceTab),
    [project, deviceTab],
  )

  // Project stats — drives the stat tiles in the header (scoped to the device tab).
  const stats = useMemo(() => {
    const positions = scoped
      .map((k) => k.position)
      .filter((p): p is number => p != null && Number.isFinite(p))
    return {
      total: scoped.length,
      avgPos: positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : 0,
      top3: positions.filter((p) => p <= 3).length,
      top10: positions.filter((p) => p <= 10).length,
    }
  }, [scoped])

  // Filter + sort the keyword list.
  const filtered = useMemo(() => {
    if (!project) return []
    let rows = scoped
    if (filter.trim()) {
      const needle = filter.toLowerCase()
      rows = rows.filter((r) =>
        r.keyword.toLowerCase().includes(needle) ||
        (r.url ?? "").toLowerCase().includes(needle)
      )
    }
    rows = [...rows].sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1
      if (sort.key === "kw") return a.keyword.localeCompare(b.keyword) * dir
      if (sort.key === "checkedAt") {
        const av = a.checkedAt ? new Date(a.checkedAt).getTime() : 0
        const bv = b.checkedAt ? new Date(b.checkedAt).getTime() : 0
        return (av - bv) * dir
      }
      const map: Record<Exclude<SortKey, "kw" | "checkedAt">, (k: Keyword) => number> = {
        pos: (k) => k.position ?? 999,
        d1: (k) => k.d1 ?? 0,
        d7: (k) => k.d7 ?? 0,
        vol: (k) => k.searchVolume ?? 0,
        // Un-scored keywords (null) sort to the bottom.
        score: (k) => k.pageScore ?? -1,
      }
      const fn = map[sort.key as Exclude<SortKey, "kw" | "checkedAt">]
      return (fn(a) - fn(b)) * dir
    })
    return rows
  }, [project, scoped, filter, sort])

  const clickSort = (k: SortKey) =>
    setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === "asc" ? "desc" : "asc") : k === "kw" ? "asc" : "desc" }))

  // ───── Render ──────────────────────────────────────────────────────────

  if (authLoading || (loading && !project)) {
    return (
      <div className="page" style={{ color: "var(--text-mute)", fontSize: 13, padding: 60, textAlign: "center" }}>
        Loading project…
      </div>
    )
  }

  if (!project) {
    return (
      <div className="page" style={{ color: "var(--neg)", fontSize: 13, padding: 60, textAlign: "center" }}>
        {error || "Project not found"}
      </div>
    )
  }

  const plan = usage?.plan
  const color = projectColor(project.id)

  return (
    <div className="page">
      {/* Header */}
      <div className="page-h kd-proj-h">
        <div style={{ minWidth: 0 }}>
          <Link href="/dashboard/projects" className="kd-back" style={{ display: "inline-flex" }}>
            ← All projects
          </Link>
          <div className="row" style={{ marginBottom: 8 }}>
            <Favicon domain={project.domain} size={36} fallbackColor={color} />
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0 }}>{project.name}</h1>
              <div className="tiny muted mono">{project.domain}</div>
            </div>
          </div>
          <div className="sub">
            {project.keywords.length} keyword{project.keywords.length !== 1 ? "s" : ""} tracked
              {/* Daily-checks counter now lives in the navbar (UsageMeter). The
                `usage` fetch is kept — it still drives the paid-feature gating below. */}
          </div>
        </div>
        <div className="col kd-proj-actions">
          {/* Auto-check schedule chip — paid-only. Shows a live countdown +
              pause/resume once a `nextScheduledCheck` is set. */}
          {SCHEDULED_CHECKS_ENABLED && plan === "paid" && (
            <div className="card tight" style={{ padding: "10px 14px", minWidth: 300 }}>
              <div className="row" style={{ gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                    <span className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 10 }}>
                      {project.nextScheduledCheck ? "Next check in" : "Auto check"}
                    </span>
                    {project.nextScheduledCheck && (
                      <button
                        onClick={handleTogglePause}
                        disabled={pausing}
                        type="button"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--brand)",
                          padding: 0,
                          cursor: "pointer",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          fontSize: 10,
                          fontWeight: 600,
                        }}
                        title={project.isPaused ? "Resume automated checks" : "Pause automated checks"}
                      >
                        {pausing ? "…" : project.isPaused ? "▶ Resume" : "⏸ Pause"}
                      </button>
                    )}
                  </div>
                  {project.nextScheduledCheck ? (
                    project.isPaused ? (
                      <span className="b" style={{ color: "var(--warn)", fontSize: 13 }}>Paused</span>
                    ) : (
                      <span className="b" style={{ color: "var(--brand)", fontSize: 13 }}>
                        <CountdownTimer targetDate={project.nextScheduledCheck} />
                      </span>
                    )
                  ) : (
                    <span className="b" style={{ color: "var(--brand)", fontSize: 13 }}>Pending first run</span>
                  )}
                </div>
                <div style={{ width: 1, alignSelf: "stretch", background: "var(--border)" }} />
                <div>
                  <div className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 10, marginBottom: 2 }}>
                    {project.nextScheduledCheck && !project.isPaused ? "Scheduled at" : "Frequency"}
                  </div>
                  <div className="tiny mono">
                    {project.nextScheduledCheck && !project.isPaused
                      ? new Date(project.nextScheduledCheck).toLocaleString("en-IN", {
                          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                        })
                      : `Every ${project.checkFrequency}h`}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="row kd-proj-btns">
            <button data-tutorial="add-keywords-btn" type="button" className="btn" onClick={() => setShowAddKw(true)}>
              <Icon.plus /> Keywords
            </button>
            <Link
              href={`/dashboard/project/${project.id}/competitor-spy`}
              className="btn"
              title="Spy on competitor domains ranking for your keywords"
            >
              <Icon.users /> Competitor Spy
            </Link>
            {/* Search Console — temporarily hidden (feature paused). Restore by
                uncommenting; the /search-console route still exists.
            <Link
              href={`/dashboard/project/${project.id}/search-console`}
              className="btn"
              title="View Google Search Console performance for this project"
            >
              Search Console
            </Link>
            */}
            {plan === "paid" && (
              <button
                type="button"
                className="btn"
                onClick={() => setShowAlerts(true)}
                title="Configure rank-change alerts for this project"
              >
                <Icon.bell /> Alerts
              </button>
            )}
            <button
              type="button"
              className="btn"
              onClick={() => setShowShare(true)}
              title="Share a public, read-only view of this project's keyword rankings"
            >
              <Icon.globe /> Share
            </button>
            {/* {plan === "paid" && (
              <button
                type="button"
                className="btn"
                onClick={() => setShowReport(true)}
                title="Generate a shareable rank report (link + PDF)"
              >
                Report
              </button>
            )} */}
            {SCHEDULED_CHECKS_ENABLED && plan === "paid" && (
              <select
                value={project.checkFrequency}
                onChange={(e) => handleFrequencyChange(Number(e.target.value))}
                disabled={updatingFrequency}
                title="Set how often automated rank checks run for this project"
                className="input"
                style={{ width: "auto", paddingTop: 8, paddingBottom: 8, fontSize: 12 }}
              >
                <option value={1}>Every 1 hour</option>
                <option value={6}>Every 6 hours</option>
                <option value={12}>Every 12 hours</option>
                <option value={24}>Every 24 hours</option>
              </select>
            )}
            <button
              data-tutorial="run-check-btn"
              type="button"
              onClick={handleRunCheck}
              // Block while a check is already running for this project — each
              // check costs us money, so don't let the button be spammed.
              disabled={checking || project.keywords.length === 0 || pendingCount > 0}
              title={pendingCount > 0 ? "A check is already running for this project" : undefined}
              className="btn primary"
            >
              {checking
                ? "Checking…"
                : pendingCount > 0
                  ? "Check in progress…"
                  : selectedKeywords.size > 0
                    ? `Check ${selectedKeywords.size} selected`
                    : "Run check"}
            </button>
            {selectedKeywords.size > 0 && (
              <button
                type="button"
                onClick={() => setConfirmDeleteKwIds(Array.from(selectedKeywords))}
                title={`Delete the ${selectedKeywords.size} selected keyword${selectedKeywords.size === 1 ? "" : "s"}`}
                className="btn"
                style={{ borderColor: "var(--neg)", color: "var(--neg)" }}
              >
                Delete {selectedKeywords.size}
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="btn"
              style={{ borderColor: "var(--neg)", color: "var(--neg)" }}
            >
              Delete project
            </button>
          </div>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid g-3" style={{ marginBottom: 14 }}>
        <div className="stat">
          <div className="lbl">Keywords tracked</div>
          <div className="val tabular">{stats.total.toLocaleString()}</div>
          <span className="tiny muted">{stats.top3} in top 3</span>
        </div>
        <div className="stat">
          <div className="lbl">Average position</div>
          <div className="val tabular">{stats.avgPos ? stats.avgPos.toFixed(1) : "—"}</div>
          <span className="tiny muted">
            {stats.total > 0
              ? `${stats.total - (statusCounts["FAILED"] || 0) - (statusCounts["NONE"] || 0)} ranked`
              : "no data"}
          </span>
        </div>
        <div className="stat">
          <div className="lbl">In top 10</div>
          <div className="val tabular">{stats.top10.toLocaleString()}</div>
          <span className="tiny muted">
            {stats.total ? `${Math.round((stats.top10 / stats.total) * 100)}%` : "—"}
          </span>
        </div>
      </div>

      {error && (
        <div
          className="card tight"
          style={{ marginBottom: 14, borderColor: "var(--neg)", background: "var(--neg-soft)", color: "var(--neg)", fontSize: 12 }}
        >
          {error}
        </div>
      )}

      {/* Status summary */}
      {pendingCount > 0 && (
        <div
          className="card tight"
          style={{
            marginBottom: 14,
            borderColor: "var(--warn)",
            background: "var(--warn-soft)",
            color: "var(--warn)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--warn)" }} />
          <div>
            <div className="b" style={{ fontSize: 13, color: "var(--warn)" }}>
              {pendingCount} keyword{pendingCount !== 1 ? "s" : ""} {statusCounts["PROCESSING"] > 0 ? "checking" : "queued"}
            </div>
            <div className="tiny" style={{ color: "var(--warn)", opacity: 0.8 }}>
              {statusCounts["PENDING"] || 0} pending, {statusCounts["PROCESSING"] || 0} processing
            </div>
          </div>
        </div>
      )}

      {/* Filter row */}
      {project.keywords.length > 0 && (
        <div className="filter-row">
          <div style={{ position: "relative", width: 260 }}>
            <span style={{ position: "absolute", left: 10, top: 9, color: "var(--text-mute)" }}><Icon.search /></span>
            <input
              className="input"
              style={{ paddingLeft: 32 }}
              placeholder="Search keywords or URLs…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <div className="tiny muted spacer">
            Showing {filtered.length} of {scoped.length}
          </div>
          <div className="pill-toggle" style={{ width: "fit-content" }}>
            {(["desktop", "mobile"] as const).map((d) => (
              <button
                key={d}
                type="button"
                className={deviceTab === d ? "active" : ""}
                onClick={() => setDeviceTab(d)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                {d === "desktop" ? <Icon.monitor /> : <Icon.smartphone />}
                {d === "desktop" ? "Desktop" : "Mobile"} ({deviceCounts[d]})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Keywords table */}
      {project.keywords.length === 0 ? (
        <div
          className="card"
          style={{
            padding: "60px 32px",
            textAlign: "center",
            border: "1px dashed var(--border-strong)",
            background: "transparent",
          }}
        >
          <div className="eyebrow" style={{ justifyContent: "center" }}>
            <span className="spark"><Icon.spark /></span> NO KEYWORDS YET
          </div>
          <div className="b" style={{ fontSize: 16, marginTop: 4 }}>Start tracking</div>
          <div className="tiny muted" style={{ marginTop: 6, maxWidth: 320, marginLeft: "auto", marginRight: "auto" }}>
            Add keywords to this project to start tracking daily Google rankings.
          </div>
          <button className="btn primary" style={{ marginTop: 16 }} onClick={() => setShowAddKw(true)}>
            <Icon.plus /> Add keywords
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="card"
          style={{
            padding: "40px 32px",
            textAlign: "center",
            border: "1px dashed var(--border-strong)",
            background: "transparent",
            color: "var(--text-mute)",
            fontSize: 13,
          }}
        >
          {filter.trim()
            ? `No keywords match “${filter}”.`
            : `No ${deviceTab} keywords yet — add some, or switch to ${deviceTab === "desktop" ? "Mobile" : "Desktop"}.`}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto", overflowY: "visible" }}>
            <table className="tbl" style={{ minWidth: 1100 }}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every((kw) => selectedKeywords.has(kw.id))}
                      onChange={handleSelectAll}
                      title="Select all keywords"
                    />
                  </th>
                  <SortHeader label="Keyword" k="kw" sort={sort} onClick={clickSort} />
                  <SortHeader label="Position" k="pos" sort={sort} onClick={clickSort} />
                  <th style={{ whiteSpace: "nowrap" }}>First check</th>
                  <SortHeader label="Volume" k="vol" sort={sort} onClick={clickSort} />
                  <th>URL</th>
                  <SortHeader label="Keyword score" k="score" sort={sort} onClick={clickSort} />
                  <SortHeader label="Last checked" k="checkedAt" sort={sort} onClick={clickSort} />
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((kw, i) => {
                  const isActive = kw.status === "PENDING" || kw.status === "PROCESSING"
                  const isSelected = selectedKeywords.has(kw.id)
                  const rowStyle: React.CSSProperties = {}
                  if (isActive) rowStyle.background = "var(--warn-soft)"
                  else if (isSelected) rowStyle.background = "var(--brand-soft)"
                  return (
                    <tr
                      key={kw.id}
                      style={{ ...rowStyle, cursor: "pointer" }}
                      onClick={() => router.push(`/dashboard/project/${project.id}/keywords/${kw.id}`)}
                      title="View keyword details"
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleKeyword(kw.id)}
                          title={`Select ${kw.keyword}`}
                        />
                      </td>
                      <td>
                        <span className="row" style={{ gap: 8, alignItems: "center" }}>
                          <span
                            title={kw.location?.toUpperCase()}
                            style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}
                          >
                            {flagFor(kw.location)}
                          </span>
                          <span className="kw">{kw.keyword}</span>
                        </span>
                      </td>
                      <td>
                        <div className="row" style={{ gap: 8, alignItems: "center" }}>
                          <PosCell position={kw.position} processing={isActive} />
                          <DeltaCell
                            from={kw.position != null && kw.d1 != null ? kw.position + kw.d1 : null}
                            to={kw.position}
                          />
                        </div>
                      </td>
                      <td>
                        <PosCell position={kw.firstPosition} />
                      </td>
                      <td className="tabular">{kw.searchVolume != null ? kw.searchVolume.toLocaleString() : "—"}</td>
                      <td style={{ maxWidth: 180 }}>
                        {kw.url ? (
                          <a
                            href={kw.url}
                            target="_blank"
                            rel="noreferrer"
                            className="url"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              display: "block",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {kw.url.replace(/^https?:\/\//, "")}
                          </a>
                        ) : (
                          <span className="tiny muted" title="No URL — keyword is ranking deeper than the top 100">—</span>
                        )}
                      </td>
                      <td>
                        <ScoreBadge
                          score={kw.pageScore}
                          grade={kw.pageScoreGrade}
                          label={kw.pageScoreLabel}
                          onClick={() => openScore(kw.id)}
                        />
                      </td>
                      <td className="tiny muted" style={{ whiteSpace: "nowrap" }}>
                        <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                          <span>
                            {kw.checkedAt
                              ? new Date(kw.checkedAt).toLocaleDateString("en-IN", {
                                  day: "2-digit", month: "short", year: "numeric",
                                })
                              : "Never"}
                          </span>
                          <StatusDot status={kw.status} />
                        </span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="row" style={{ gap: 6, justifyContent: "flex-start" }}>
                          <FavoriteButton
                            key={`kf-${kw.id}-${favReady}`}
                            entityType="keyword"
                            entityId={kw.id}
                            initial={favKw.has(kw.id)}
                            size={15}
                            style={{ width: 28, height: 28 }}
                          />
                          {(kw.position === null || kw.position > 1) && (
                            <button
                              {...(i === 0 ? { "data-tutorial": "improve-ranking-btn" } : {})}
                              onClick={() => {
                                advanceFromStep(4)
                                router.push(
                                  `/dashboard/project/${project.id}/competitor-analysis?keyword=${encodeURIComponent(kw.keyword)}&keywordId=${kw.id}`
                                )
                              }}
                              className="btn primary sm rank-cta"
                              style={{ whiteSpace: "nowrap", gap: 6 }}
                              title={
                                kw.position != null
                                  ? `Improve this keyword from #${kw.position} to #1`
                                  : "Get this keyword ranking on page 1"
                              }
                            >
                              Rank
                              {kw.position != null ? (
                                <span className="tabular" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                  #{kw.position}
                                  <span className="rank-arrow" style={{ opacity: 0.7, fontSize: "0.9em" }}>→</span>
                                  <span style={{ fontWeight: 700 }}>#1</span>
                                </span>
                              ) : (
                                <span>on page 1</span>
                              )}
                            </button>
                          )}
                          {kw.latestAnalysisId && (
                            <button
                              onClick={() =>
                                router.push(`/dashboard/project/${project.id}/competitor-analysis/results?analysisId=${kw.latestAnalysisId}`)
                              }
                              className="btn sm"
                              style={{ whiteSpace: "nowrap" }}
                            >
                              View analysis <Icon.chevR />
                            </button>
                          )}
                          <button
                            onClick={() => handleRefreshKeyword(kw.id)}
                            disabled={refreshingKw.has(kw.id) || kw.status === "PENDING" || kw.status === "PROCESSING"}
                            className="icon-btn"
                            style={{ width: 28, height: 28 }}
                            title="Refresh this keyword"
                          >
                            <Icon.refresh />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              if (openMenuId === kw.id) {
                                setOpenMenuId(null)
                                setMenuPosition(null)
                              } else {
                                const rect = e.currentTarget.getBoundingClientRect()
                                setMenuPosition({
                                  top: rect.bottom + 4,
                                  right: window.innerWidth - rect.right,
                                })
                                setOpenMenuId(kw.id)
                              }
                            }}
                            className="icon-btn"
                            style={{ width: 28, height: 28 }}
                            title="Options"
                          >
                            <Icon.dots />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Row-action dropdown (rendered outside the table so it can escape
          overflow:hidden and float on top). */}
      {openMenuId && menuPosition && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
            onClick={() => { setOpenMenuId(null); setMenuPosition(null) }}
          />
          <div
            style={{
              position: "fixed",
              top: `${menuPosition.top}px`,
              right: `${menuPosition.right}px`,
              zIndex: 50,
              width: 160,
              background: "var(--bg-elev)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-md)",
              boxShadow: "var(--shadow-md)",
              padding: 4,
            }}
          >
            <button
              onClick={() => {
                const kw = project.keywords.find((k) => k.id === openMenuId)
                if (kw) router.push(`/dashboard/project/${project.id}/keywords/${kw.id}`)
                setOpenMenuId(null)
                setMenuPosition(null)
              }}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "8px 10px",
                background: "transparent",
                border: "none",
                borderRadius: 6,
                color: "var(--text)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              View details
            </button>
            <button
              onClick={async () => {
                const kwId = openMenuId!
                setOpenMenuId(null)
                setMenuPosition(null)
                setHistoryKeywordId(kwId)
                setHistoryItems([])
                setHistoryLoading(true)
                try {
                  // The competitor-analysis list endpoint returns every analysis
                  // for the user; filter to the keyword we're inspecting. (The
                  // older /keywords/:id/analyses path actually returns rank
                  // history, not analyses — kept hitting that was the bug.)
                  const data = await api.get<{ analyses?: typeof historyItems }>(`/api/competitor-analysis`)
                  const all = Array.isArray(data?.analyses) ? data.analyses : []
                  const mine = all.filter((a) => (a as unknown as { keywordId?: string }).keywordId === kwId)
                  setHistoryItems(mine)
                } catch {
                  /* leave history empty on failure */
                } finally {
                  setHistoryLoading(false)
                }
              }}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "8px 10px",
                background: "transparent",
                border: "none",
                borderRadius: 6,
                color: "var(--text)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Analysis history
            </button>
            <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
            <button
              onClick={() => {
                const id = openMenuId
                setOpenMenuId(null)
                setMenuPosition(null)
                if (id) setConfirmDeleteKwIds([id])
              }}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "8px 10px",
                background: "transparent",
                border: "none",
                borderRadius: 6,
                color: "var(--neg)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Delete
            </button>
          </div>
        </>
      )}

      {/* Modals */}
      {showAddKw && typeof window !== "undefined" && createPortal(
        <AddKeywordsModal
          projectId={project.id}
          currentCount={project.keywords.length}
          plan={plan}
          onClose={() => setShowAddKw(false)}
          onAdded={(device) => { setShowAddKw(false); setDeviceTab(device); void load(); advanceFromStep(2) }}
        />,
        document.body
      )}

      {historyKeywordId && (
        <div className="modal-bg" onClick={() => setHistoryKeywordId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-h">
              <div>
                <div className="eyebrow" style={{ margin: 0, fontSize: 11 }}><span className="spark"><Icon.spark /></span> COMPETITOR ANALYSIS</div>
                <div className="b" style={{ fontSize: 18, marginTop: 4 }}>Analysis history</div>
                <div className="tiny muted" style={{ marginTop: 2 }}>
                  {project.keywords.find((k) => k.id === historyKeywordId)?.keyword}
                </div>
              </div>
              <button onClick={() => setHistoryKeywordId(null)} className="icon-btn" aria-label="Close"><Icon.close /></button>
            </div>
            <div className="modal-b" style={{ maxHeight: "60vh", overflowY: "auto" }}>
              {historyLoading ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>Loading…</div>
              ) : historyItems.length === 0 ? (
                <div className="tiny muted" style={{ padding: 32, textAlign: "center" }}>No analyses found for this keyword.</div>
              ) : (
                <div className="col" style={{ gap: 8 }}>
                  {historyItems.map((item, idx) => (
                    <div key={item.id} className="card tight" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                          {idx === 0 && <span className="chip brand">Latest</span>}
                          <span
                            className={
                              "chip " +
                              (item.status === "COMPLETED" ? "pos" : item.status === "FAILED" ? "neg" : "warn")
                            }
                          >
                            {item.status}
                          </span>
                        </div>
                        <div className="tiny muted">
                          {new Date(item.createdAt).toLocaleString("en-IN", {
                            day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                          })}
                        </div>
                      </div>
                      {item.status === "COMPLETED" && (
                        <button
                          className="btn sm"
                          onClick={() => {
                            setHistoryKeywordId(null)
                            router.push(`/dashboard/project/${project.id}/competitor-analysis/results?analysisId=${item.id}`)
                          }}
                        >
                          View <Icon.chevR />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {scoreKeywordId && (() => {
        const kw = project.keywords.find((k) => k.id === scoreKeywordId)
        const total = scoreInfo?.pageScore ?? kw?.pageScore ?? null
        const grade = scoreInfo?.pageScoreGrade ?? kw?.pageScoreGrade ?? null
        const label = scoreInfo?.pageScoreLabel ?? kw?.pageScoreLabel ?? null
        const bd = scoreInfo?.breakdown ?? null
        const density = bd?.density ?? null
        const densityBand = density == null ? null
          : density < 0.5 ? { label: "Sparse", color: "var(--warn)" }
          : density <= 2.5 ? { label: "Healthy", color: "var(--pos)" }
          : density <= 3.5 ? { label: "High", color: "var(--warn)" }
          : { label: "Stuffed", color: "var(--neg)" }
        const color = total == null ? "var(--text-mute)" : total >= 80 ? "var(--pos)" : total >= 60 ? "var(--warn)" : "var(--neg)"
        const soft = total == null ? "var(--bg-inset)" : total >= 80 ? "var(--pos-soft)" : total >= 60 ? "var(--warn-soft)" : "var(--neg-soft)"
        return (
          <div className="modal-bg" onClick={() => setScoreKeywordId(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
              <div className="modal-h">
                <div>
                  <div className="eyebrow" style={{ margin: 0, fontSize: 11 }}><span className="spark"><Icon.spark /></span> PAGE SCORE</div>
                  <div className="b" style={{ fontSize: 18, marginTop: 4 }}>Keyword score</div>
                  <div className="tiny muted" style={{ marginTop: 2 }}>{kw?.keyword}</div>
                </div>
                <button onClick={() => setScoreKeywordId(null)} className="icon-btn" aria-label="Close"><Icon.close /></button>
              </div>
              <div className="modal-b" style={{ maxHeight: "60vh", overflowY: "auto" }}>
                <div className="row between" style={{ alignItems: "flex-start", gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <span className="tabular" style={{ fontSize: 34, fontWeight: 700, color, lineHeight: 1 }}>{total ?? "—"}</span>
                    <span className="tiny muted" style={{ marginLeft: 6 }}>/ 100</span>
                    {densityBand && (
                      <div className="tiny" style={{ marginTop: 8 }}>
                        <span className="muted">Keyword density </span>
                        <span className="tabular" style={{ fontWeight: 700, color: densityBand.color }}>{density}%</span>
                        <span style={{ color: densityBand.color, fontWeight: 600 }}> · {densityBand.label}</span>
                      </div>
                    )}
                    {scoreInfo?.pageScoreUrl && (
                      <a
                        href={scoreInfo.pageScoreUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="url tiny"
                        style={{ display: "block", marginTop: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        {scoreInfo.pageScoreUrl.replace(/^https?:\/\//, "")}
                      </a>
                    )}
                    {scoreInfo?.pageScoreAt && (
                      <div className="tiny muted" style={{ marginTop: 2 }}>
                        Scored {new Date(scoreInfo.pageScoreAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </div>
                    )}
                  </div>
                  {(grade || label) && (
                    <span className="tabular" style={{ flexShrink: 0, padding: "4px 10px", borderRadius: "var(--r-sm)", background: soft, color, fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>
                      {grade}{grade && label ? " · " : ""}{label}
                    </span>
                  )}
                </div>

                <div style={{ height: 1, background: "var(--border)", margin: "16px 0" }} />

                {scoreLoading ? (
                  <div style={{ padding: 32, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>Loading…</div>
                ) : bd ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {SCORE_CATEGORIES.map(({ key, label: catLabel, max }) => {
                      const val = Number(bd[key] ?? 0)
                      const pct = max > 0 ? Math.max(0, Math.min(1, val / max)) : 0
                      const c = pct >= 0.8 ? "var(--pos)" : pct >= 0.5 ? "var(--warn)" : "var(--neg)"
                      const shown = Number.isInteger(val) ? val : Math.round(val * 10) / 10
                      return (
                        <div key={key} className="row" style={{ gap: 10, alignItems: "center" }}>
                          <span className="tiny muted" style={{ width: 76, flexShrink: 0 }}>{catLabel}</span>
                          <div style={{ flex: 1, height: 6, borderRadius: 999, background: "var(--bg-inset)", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${pct * 100}%`, background: c, borderRadius: 999 }} />
                          </div>
                          <span className="tabular tiny" style={{ width: 46, flexShrink: 0, textAlign: "right", fontWeight: 600, color: c }}>{shown}/{max}</span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="tiny muted" style={{ padding: 24, textAlign: "center" }}>
                    No detailed breakdown is stored for this score. Re-run a competitor analysis for this keyword to compute one.
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {confirmDelete && (
        <div className="modal-bg" onClick={() => setConfirmDelete(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-h">
              <div>
                <div className="eyebrow" style={{ margin: 0, fontSize: 11, color: "var(--neg)" }}>DELETE PROJECT</div>
                <div className="b" style={{ fontSize: 18, marginTop: 4 }}>This can't be undone</div>
              </div>
              <button onClick={() => setConfirmDelete(false)} className="icon-btn" aria-label="Close"><Icon.close /></button>
            </div>
            <div className="modal-b">
              <div className="tiny muted">This will permanently delete</div>
              <div className="b" style={{ fontSize: 16, color: "var(--neg)", marginTop: 2 }}>{project.name}</div>
              <div className="tiny muted" style={{ marginTop: 6 }}>
                and all {project.keywords.length} keyword{project.keywords.length !== 1 ? "s" : ""} and rank history.
              </div>
            </div>
            <div className="modal-f">
              <button className="btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button
                onClick={handleDeleteProject}
                disabled={deleting}
                className="btn"
                style={{ background: "var(--neg)", color: "white", borderColor: "var(--neg)" }}
              >
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keyword delete confirmation — handles both single (from row menu)
          and bulk (from "Delete N" button) flows in one modal. */}
      {confirmDeleteKwIds && confirmDeleteKwIds.length > 0 && (() => {
        const ids = confirmDeleteKwIds
        const isBulk = ids.length > 1
        const firstKw = project.keywords.find((k) => k.id === ids[0])
        return (
          <div className="modal-bg" onClick={() => !bulkDeleting && setConfirmDeleteKwIds(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
              <div className="modal-h">
                <div>
                  <div className="eyebrow" style={{ margin: 0, fontSize: 11, color: "var(--neg)" }}>
                    {isBulk ? `DELETE ${ids.length} KEYWORDS` : "DELETE KEYWORD"}
                  </div>
                  <div className="b" style={{ fontSize: 18, marginTop: 4 }}>This can't be undone</div>
                </div>
                <button onClick={() => setConfirmDeleteKwIds(null)} className="icon-btn" aria-label="Close" disabled={bulkDeleting}><Icon.close /></button>
              </div>
              <div className="modal-b">
                <div className="tiny muted">{isBulk ? "This will permanently remove" : "This will permanently delete"}</div>
                <div className="b" style={{ fontSize: 16, color: "var(--neg)", marginTop: 2, wordBreak: "break-word" }}>
                  {isBulk ? `${ids.length} keywords` : firstKw?.keyword ?? ids[0]}
                </div>
                <div className="tiny muted" style={{ marginTop: 6 }}>and their rank history.</div>
              </div>
              <div className="modal-f">
                <button className="btn" onClick={() => setConfirmDeleteKwIds(null)} disabled={bulkDeleting}>Cancel</button>
                <button
                  onClick={() => handleBulkDeleteKeywords(ids)}
                  disabled={bulkDeleting}
                  className="btn"
                  style={{ background: "var(--neg)", color: "white", borderColor: "var(--neg)" }}
                >
                  {bulkDeleting ? "Deleting…" : isBulk ? `Yes, delete ${ids.length}` : "Yes, delete"}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {showAlerts && <AlertSettingsModal projectId={project.id} onClose={() => setShowAlerts(false)} />}

      {showReport && <ReportModal projectId={project.id} onClose={() => setShowReport(false)} />}

      {/* Public share modal — create / copy / revoke a read-only link to this
          project's live keyword rankings. */}
      {showShare && (
        <div className="modal-bg" onClick={() => setShowShare(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-h">
              <div>
                <div className="eyebrow" style={{ margin: 0, fontSize: 11 }}><span className="spark"><Icon.globe /></span> SHARE RANKINGS</div>
                <div className="b" style={{ fontSize: 18, marginTop: 4 }}>Public link</div>
              </div>
              <button onClick={() => setShowShare(false)} className="icon-btn" aria-label="Close"><Icon.close /></button>
            </div>
            <div className="modal-b">
              {project.shareToken ? (
                <>
                  <div className="tiny muted" style={{ marginBottom: 8 }}>
                    Anyone with this link can view a read-only, live snapshot of this project&apos;s keyword rankings — no login required.
                  </div>
                  <div className="row" style={{ gap: 8, alignItems: "stretch" }}>
                    <input className="input" readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, fontSize: 12 }} />
                    <button type="button" className="btn" onClick={handleCopyShare} style={{ whiteSpace: "nowrap" }}>
                      {shareCopied ? <><Icon.check /> Copied</> : "Copy"}
                    </button>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <a href={shareUrl} target="_blank" rel="noreferrer" className="tiny" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      Open link <Icon.external />
                    </a>
                  </div>
                </>
              ) : (
                <div className="tiny muted">
                  Generate a public link to share a read-only, live view of this project&apos;s keyword rankings. You can disable it any time.
                </div>
              )}
            </div>
            <div className="modal-f">
              {project.shareToken ? (
                <button
                  type="button"
                  className="btn"
                  onClick={handleDisableShare}
                  disabled={shareBusy}
                  style={{ borderColor: "var(--neg)", color: "var(--neg)" }}
                >
                  {shareBusy ? "Disabling…" : "Disable sharing"}
                </button>
              ) : (
                <button type="button" className="btn primary" onClick={handleCreateShare} disabled={shareBusy}>
                  {shareBusy ? "Creating…" : "Create public link"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showFrequencyModal && tempFrequency && (
        <div className="modal-bg" onClick={() => { setShowFrequencyModal(false); setTempFrequency(null) }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-h">
              <div>
                <div className="eyebrow" style={{ margin: 0, fontSize: 11 }}><span className="spark"><Icon.spark /></span> UPDATE FREQUENCY</div>
                <div className="b" style={{ fontSize: 18, marginTop: 4 }}>Change automated checks</div>
              </div>
              <button onClick={() => { setShowFrequencyModal(false); setTempFrequency(null) }} className="icon-btn" aria-label="Close"><Icon.close /></button>
            </div>
            <div className="modal-b">
              <div className="tiny muted">New frequency</div>
              <div
                className="card tight"
                style={{ marginTop: 6, background: "var(--brand-soft)", borderColor: "var(--brand)", color: "var(--brand)" }}
              >
                <div className="b" style={{ fontSize: 18 }}>
                  {tempFrequency === 0.5
                    ? "Every 30 seconds"
                    : tempFrequency === 1
                      ? "Every 1 hour"
                      : tempFrequency === 6
                        ? "Every 6 hours"
                        : tempFrequency === 12
                          ? "Every 12 hours"
                          : "Every 24 hours"}
                </div>
              </div>
              <div className="tiny muted" style={{ marginTop: 10 }}>
                The next scheduled check will be recalculated based on the new frequency.
              </div>
            </div>
            <div className="modal-f">
              <button className="btn" onClick={() => { setShowFrequencyModal(false); setTempFrequency(null) }}>Cancel</button>
              <button className="btn primary" onClick={() => handleUpdateFrequency(tempFrequency)} disabled={updatingFrequency}>
                {updatingFrequency ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SortHeader({
  label,
  k,
  sort,
  onClick,
}: {
  label: string
  k: SortKey
  sort: { key: SortKey; dir: "asc" | "desc" }
  onClick: (k: SortKey) => void
}) {
  const active = sort.key === k
  return (
    <th
      onClick={() => onClick(k)}
      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
    >
      {label}
      {active && <span style={{ color: "var(--brand)", marginLeft: 4 }}>{sort.dir === "asc" ? "↑" : "↓"}</span>}
    </th>
  )
}
