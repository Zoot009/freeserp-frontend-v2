"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth"
import { api, ApiError } from "@/lib/api"
import { useTutorial } from "@/lib/tutorial"
import { LocationPicker } from "@/components/location-picker"
import { Icon } from "@/components/dashboard/icons"
import { AlertSettingsModal } from "@/components/dashboard/alert-settings-modal"
import { ReportModal } from "@/components/dashboard/report-modal"
import {
  PosBadge,
  Sparkline,
  FeatChip,
  serpFeaturesToChips,
  trendToSparkline,
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
  addedAt: string
  position: number | null
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
  keywords: Keyword[]
}

type UsageInfo = { plan: string; dailyUsed: number; dailyLimit: number; dailyRemaining: number; isAdmin?: boolean }

type SortKey = "kw" | "pos" | "d1" | "d7" | "vol" | "traffic" | "checkedAt"

// ───── Helpers ─────────────────────────────────────────────────────────────

function projectColor(id: string): string {
  const palette = ["#2D5BFF", "#F59E0B", "#10B981", "#EC4899", "#8B5CF6", "#06B6D4", "#F97316"]
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

function ChangeChip({ change }: { change: number | null }) {
  // `== null` catches both null and undefined; reject non-finite values
  // (NaN/Infinity) so a malformed payload renders the dash, never "NaN".
  if (change == null || !Number.isFinite(change) || change === 0) {
    return <span className="delta-cell flat" title="No previous check to compare against">—</span>
  }
  // Backend stores `change = previousPos - position`, so > 0 means the
  // position NUMBER went DOWN → ranking IMPROVED → green ↓.
  const improved = change > 0
  const delta = Math.abs(change)
  return (
    <span
      className={"delta-cell " + (improved ? "up" : "down")}
      title={improved
        ? `Ranking improved — moved up ${delta} position${delta === 1 ? "" : "s"}`
        : `Ranking dropped — moved down ${delta} position${delta === 1 ? "" : "s"}`}
    >
      {improved ? <Icon.arrowUp /> : <Icon.arrowDown />}{delta}
    </span>
  )
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
  return (
    <span className="row" style={{ gap: 6 }}>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
          animation: pulse ? "shim 1.4s ease-in-out infinite" : undefined,
        }}
      />
      <span className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {status ?? "NONE"}
      </span>
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
  onAdded: () => void
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
  const pendingLines = raw.split("\n").map((l) => l.trim()).filter(Boolean)
  const wouldOverflow = isFree && pendingLines.length > remaining

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean)
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
      onAdded()
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
                    Keywords <span className="muted" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(one per line)</span>
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
                  placeholder={"seo tools\nbest keyword research\nfree serp checker"}
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
  const [pausing, setPausing] = useState(false)
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set())
  const [historyKeywordId, setHistoryKeywordId] = useState<string | null>(null)
  const [historyItems, setHistoryItems] = useState<{ id: string; status: string; createdAt: string; completedAt: string | null }[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Filter + sort state
  const [filter, setFilter] = useState("")
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "pos", dir: "asc" })

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
      setError(err instanceof Error ? err.message : "Failed to load project")
      return null
    } finally {
      if (!silent) setLoading(false)
    }
  }, [projectId, router])

  useEffect(() => { void load() }, [load])

  // Load usage info — drives the daily-checks counter shown in the header.
  useEffect(() => {
    if (!token || !user?.emailVerified) return
    api.get<UsageInfo>("/api/usage")
      .then((data) => { if (data && typeof data.dailyLimit === "number") setUsage(data) })
      .catch(() => undefined)
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
    setChecking(true); setError("")
    try {
      const keywordIds = selectedKeywords.size > 0 ? Array.from(selectedKeywords) : undefined
      await api.post(`/api/projects/${project.id}/check`, { keywordIds })
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
    if (!project) return
    if (selectedKeywords.size === project.keywords.length) setSelectedKeywords(new Set())
    else setSelectedKeywords(new Set(project.keywords.map((kw) => kw.id)))
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

  // Project stats — drives the stat tiles in the header.
  const stats = useMemo(() => {
    if (!project) return { total: 0, avgPos: 0, top3: 0, top10: 0, traffic: 0 }
    const positions = project.keywords
      .map((k) => k.position)
      .filter((p): p is number => p != null && Number.isFinite(p))
    const traffic = project.keywords.reduce((sum, k) => sum + (k.monthlyTraffic ?? 0), 0)
    return {
      total: project.keywords.length,
      avgPos: positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : 0,
      top3: positions.filter((p) => p <= 3).length,
      top10: positions.filter((p) => p <= 10).length,
      traffic,
    }
  }, [project])

  // Filter + sort the keyword list.
  const filtered = useMemo(() => {
    if (!project) return []
    let rows = project.keywords
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
        traffic: (k) => k.monthlyTraffic ?? 0,
      }
      const fn = map[sort.key as Exclude<SortKey, "kw" | "checkedAt">]
      return (fn(a) - fn(b)) * dir
    })
    return rows
  }, [project, filter, sort])

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
      <div className="page-h" style={{ alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <Link href="/dashboard/projects" className="kd-back" style={{ display: "inline-flex" }}>
            ← All projects
          </Link>
          <div className="row" style={{ marginBottom: 8 }}>
            <span
              className="fav"
              style={{ background: color, color: "white", width: 36, height: 36, fontSize: 15, borderRadius: 10 }}
            >
              {project.domain[0]?.toUpperCase() ?? "?"}
            </span>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0 }}>{project.name}</h1>
              <div className="tiny muted mono">{project.domain}</div>
            </div>
          </div>
          <div className="sub">
            {project.keywords.length} keyword{project.keywords.length !== 1 ? "s" : ""} tracked
            {usage && (
              <>
                {" · "}
                <span title={`${usage.plan === "paid" ? "Paid" : "Free"} plan — ${usage.dailyUsed}/${usage.dailyLimit} rank checks used today`}>
                  {usage.dailyUsed}/{usage.dailyLimit} checks today
                </span>
              </>
            )}
          </div>
        </div>
        <div className="col" style={{ alignItems: "flex-end", gap: 10 }}>
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
          <div className="row" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button data-tutorial="add-keywords-btn" type="button" className="btn" onClick={() => setShowAddKw(true)}>
              <Icon.plus /> Keywords
            </button>
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
            {plan === "paid" && (
              <button
                type="button"
                className="btn"
                onClick={() => setShowReport(true)}
                title="Generate a shareable rank report (link + PDF)"
              >
                Report
              </button>
            )}
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
              disabled={checking || project.keywords.length === 0}
              className="btn primary"
            >
              {checking ? "Checking…" : selectedKeywords.size > 0 ? `Check ${selectedKeywords.size} selected` : "Run check"}
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
      <div className="grid g-4" style={{ marginBottom: 14 }}>
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
        <div className="stat">
          <div className="lbl">Est. monthly traffic</div>
          <div className="val tabular">{stats.traffic ? stats.traffic.toLocaleString() : "—"}</div>
          <span className="tiny muted">from latest checks</span>
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
            Showing {filtered.length} of {project.keywords.length}
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
          No keywords match “{filter}”.
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
                      checked={project.keywords.length > 0 && selectedKeywords.size === project.keywords.length}
                      onChange={handleSelectAll}
                      title="Select all keywords"
                    />
                  </th>
                  <SortHeader label="Keyword" k="kw" sort={sort} onClick={clickSort} />
                  <SortHeader label="Position" k="pos" sort={sort} onClick={clickSort} />
                  <SortHeader label="1D" k="d1" sort={sort} onClick={clickSort} />
                  <SortHeader label="7D" k="d7" sort={sort} onClick={clickSort} />
                  <SortHeader label="Volume" k="vol" sort={sort} onClick={clickSort} />
                  <SortHeader label="Traffic" k="traffic" sort={sort} onClick={clickSort} />
                  <th>SERP</th>
                  <th>Trend</th>
                  <th>URL</th>
                  <th>Location</th>
                  <SortHeader label="Last checked" k="checkedAt" sort={sort} onClick={clickSort} />
                  <th>Status</th>
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
                    <tr key={kw.id} style={rowStyle}>
                      <td>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleKeyword(kw.id)}
                          title={`Select ${kw.keyword}`}
                        />
                      </td>
                      <td>
                        <span className="kw">{kw.keyword}</span>
                      </td>
                      <td>
                        {kw.position !== null ? (
                          <PosBadge pos={kw.position} />
                        ) : (
                          <span className="chip" title="Not found in the top 100 results — ranking deeper than our scan reaches">
                            100+
                          </span>
                        )}
                      </td>
                      <td><ChangeChip change={kw.d1} /></td>
                      <td><ChangeChip change={kw.d7} /></td>
                      <td className="tabular">{kw.searchVolume != null ? kw.searchVolume.toLocaleString() : "—"}</td>
                      <td className="tabular">{kw.monthlyTraffic != null ? kw.monthlyTraffic.toLocaleString() : "—"}</td>
                      <td>
                        {(() => {
                          const feats = serpFeaturesToChips(kw.serpFeatures)
                          return feats.length > 0 ? (
                            <div className="row" style={{ gap: 3, flexWrap: "wrap" }}>
                              {feats.map((f) => <FeatChip key={f} f={f} />)}
                            </div>
                          ) : (
                            <span className="tiny muted">—</span>
                          )
                        })()}
                      </td>
                      <td>
                        {(() => {
                          const spark = trendToSparkline(kw.searchVolumeTrend)
                          // Search-volume history — higher is up, so no invert.
                          return spark.length > 0 ? (
                            <Sparkline data={spark} />
                          ) : (
                            <span className="tiny muted">—</span>
                          )
                        })()}
                      </td>
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
                        <span className="chip">{kw.location}</span>
                      </td>
                      <td className="tiny muted" style={{ whiteSpace: "nowrap" }}>
                        {kw.checkedAt
                          ? new Date(kw.checkedAt).toLocaleString("en-IN", {
                              day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                            })
                          : "Never"}
                      </td>
                      <td><StatusDot status={kw.status} /></td>
                      <td>
                        <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                          {(kw.position === null || kw.position > 1) && (
                            <button
                              {...(i === 0 ? { "data-tutorial": "improve-ranking-btn" } : {})}
                              onClick={() => {
                                advanceFromStep(4)
                                router.push(
                                  `/dashboard/project/${project.id}/competitor-analysis?keyword=${encodeURIComponent(kw.keyword)}&keywordId=${kw.id}`
                                )
                              }}
                              className="btn primary sm"
                              style={{ whiteSpace: "nowrap" }}
                            >
                              Improve ranking?
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
          onAdded={() => { setShowAddKw(false); void load(); advanceFromStep(2) }}
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
