"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useTranslations } from "next-intl"
import { Link, useRouter } from "@/emails/i18n/navigation"
import { useAuth } from "@/lib/auth"
import { api } from "@/lib/api"
import { useTutorial } from "@/lib/tutorial"
import { Icon } from "@/components/dashboard/icons"
import { FavoriteButton } from "@/components/dashboard/favorite-button"
import { Sparkline } from "@/components/dashboard/primitives"
import { Favicon } from "@/components/favicon"
import { displayDomain } from "@/lib/utils"
import { trackEvent } from "@/lib/track"

// Feature flag — automated/scheduled rank checks. When true, paid users see
// the check-frequency picker in the New Project modal. Free users still get
// manual checks only and never hit the scheduler (gated server-side in
// scheduler.runProjectChecks). Keep in sync with the matching flag in
// freeserp-backend/src/routes/projects.js.
const SCHEDULED_CHECKS_ENABLED = true

// Max projects a free user can own. Paid users are uncapped. Must stay in
// sync with FREE_PROJECTS_LIMIT in freeserp-backend/src/routes/projects.js.
const FREE_PROJECTS_LIMIT = 1

// ───── Types ───────────────────────────────────────────────────────────────

interface ProjectSummary {
  id: string
  name: string
  domain: string
  isActive: boolean
  // Manual pause toggle (PATCH /api/projects/:id). When true the project is
  // excluded from scheduled rank checks — this is what the status chip reflects.
  isPaused: boolean
  createdAt: string
  _count: { keywords: number }
  // Real average-position trend (oldest→newest), 1 point per day over the last
  // 30 days. Empty when the project has no completed rank checks yet.
  trend?: number[]
}

type UsageInfo = { plan: string; dailyUsed: number; dailyLimit: number; dailyRemaining: number; isAdmin?: boolean }

// ───── Helpers ─────────────────────────────────────────────────────────────

// Stable color per project id — same hash function used in the keywords page
// so a project's swatch matches across cards, headers, and charts.
function projectColor(id: string): string {
  const palette = ["#2D5BFF", "#F59E0B", "#10B981", "#EC4899", "#8B5CF6", "#06B6D4", "#F97316"]
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

// ───── Add project modal ───────────────────────────────────────────────────

function AddProjectModal({
  plan,
  onClose,
  onCreated,
}: {
  plan?: string
  onClose: () => void
  onCreated: (p: ProjectSummary) => void
}) {
  const t = useTranslations("dashProjects")
  const [name, setName] = useState("")
  const [domain, setDomain] = useState("")
  const [checkFrequency, setCheckFrequency] = useState(24)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const firstRef = useRef<HTMLInputElement>(null)
  useEffect(() => { firstRef.current?.focus() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setLoading(true)
    try {
      // Only paid users send a checkFrequency — free users get manual checks
      // only. Gating on `plan === "paid"` (not `!isFree`) keeps the unknown /
      // still-loading window safely on the manual-only side.
      const body: Record<string, unknown> = { name, domain }
      if (SCHEDULED_CHECKS_ENABLED && plan === "paid") body.checkFrequency = checkFrequency
      const data = await api.post<ProjectSummary>("/api/projects", body)
      onCreated({ ...data, _count: { keywords: 0 } })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("createError"))
    } finally { setLoading(false) }
  }

  return (
    <div className="fs-app">
      <div className="modal-bg" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
          <div className="modal-h">
            <div>
              <div className="eyebrow" style={{ margin: 0, fontSize: 11 }}><span className="spark"><Icon.spark /></span> {t("addModalEyebrow")}</div>
              <div className="b" style={{ fontSize: 18, marginTop: 4 }}>{t("addModalTitle")}</div>
            </div>
            <button type="button" onClick={onClose} className="icon-btn" aria-label={t("close")}><Icon.close /></button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="modal-b" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="field">
                <label>{t("projectNameLabel")}</label>
                <input ref={firstRef} className="input" type="text" required placeholder={t("projectNamePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field">
                <label>{t("domainLabel")}</label>
                <input className="input" type="text" required placeholder={t("domainPlaceholder")} value={domain} onChange={(e) => setDomain(e.target.value)} />
                <span className="tiny muted">{t("domainHint")}</span>
              </div>
              {SCHEDULED_CHECKS_ENABLED && plan === "paid" && (
                <div className="field">
                  <label>{t("checkFrequencyLabel")}</label>
                  <select className="input" value={checkFrequency} onChange={(e) => setCheckFrequency(Number(e.target.value))}>
                    <option value={1}>{t("freqEvery1Hour")}</option>
                    <option value={6}>{t("freqEvery6Hours")}</option>
                    <option value={12}>{t("freqEvery12Hours")}</option>
                    <option value={24}>{t("freqEvery24Hours")}</option>
                  </select>
                  <span className="tiny muted">{t("checkFrequencyHint")}</span>
                </div>
              )}
              {error && (
                <div className="card tight" style={{ borderColor: "var(--neg)", background: "var(--neg-soft)", color: "var(--neg)", fontSize: 12 }}>
                  {error}
                </div>
              )}
            </div>
            <div className="modal-f">
              <button type="button" className="btn" onClick={onClose}>{t("cancel")}</button>
              <button type="submit" className="btn primary" disabled={loading}>
                {loading ? t("creating") : t("createProject")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// ───── Upgrade plan modal ──────────────────────────────────────────────────

function UpgradeModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("dashProjects")
  return (
    <div className="fs-app">
      <div className="modal-bg" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
          <div className="modal-h">
            <div>
              <div className="eyebrow" style={{ margin: 0, fontSize: 11 }}><span className="spark"><Icon.spark /></span> {t("upgradeEyebrow")}</div>
              <div className="b" style={{ fontSize: 18, marginTop: 4 }}>{t("upgradeTitle")}</div>
            </div>
            <button type="button" onClick={onClose} className="icon-btn" aria-label={t("close")}><Icon.close /></button>
          </div>
          <div className="modal-b" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="tiny muted" style={{ lineHeight: 1.6 }}>
              {t("upgradeBody", { limit: FREE_PROJECTS_LIMIT })}
            </div>
            <div
              className="card tight"
              style={{ borderColor: "var(--brand)", background: "var(--brand-soft)", display: "flex", flexDirection: "column", gap: 8 }}
            >
              {(t.raw("upgradeFeatures") as string[]).map((f) => (
                <div key={f} className="row" style={{ gap: 8, color: "var(--brand)", fontSize: 13 }}>
                  <Icon.check /> <span style={{ color: "var(--text)" }}>{f}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="modal-f">
            <button type="button" className="btn" onClick={onClose}>{t("notNow")}</button>
            <Link href="/pricing?clicked-buy-button"><button type="button" className="btn primary">{t("upgradePlan")}</button></Link>
          </div>
        </div>
      </div>
    </div>
  )
}

// ───── Projects list ───────────────────────────────────────────────────────

function ProjectsList({
  projects,
  loading,
  plan,
  usage,
  onAdd,
  onUpgrade,
  onOpen,
  onStartTour,
  favoriteIds,
  favReady,
}: {
  projects: ProjectSummary[]
  loading: boolean
  plan?: string
  usage: UsageInfo | null
  onAdd: () => void
  onUpgrade: () => void
  onOpen: (id: string) => void
  onStartTour: () => void
  favoriteIds: Set<string>
  favReady: boolean
}) {
  const t = useTranslations("dashProjects")
  const [view, setView] = useState<"grid" | "list">("grid")
  // `plan` arrives asynchronously from /api/usage. Until it does we don't
  // know the tier — don't assume "free" in that window, otherwise paid users
  // see the project-cap notice flash before usage resolves.
  const isFree = plan === "free"
  const isAtProjectLimit = isFree && projects.length >= FREE_PROJECTS_LIMIT
  // The New-project button stays enabled even at the free limit — clicking it
  // opens the upgrade popup instead of the create-project modal.
  const handleAdd = isAtProjectLimit ? onUpgrade : onAdd
  const addTitle = isAtProjectLimit
    ? t("addTitleAtLimit", { limit: FREE_PROJECTS_LIMIT })
    : t("addTitleDefault")

  // Real average-position trend sparkline (lower position is better, hence
  // `invert`). Projects with fewer than two data points have no meaningful line
  // to draw yet, so we show a muted placeholder instead of a misleading graph.
  const renderSpark = (trend: number[] | undefined, color: string, w?: number, h?: number) =>
    trend && trend.length >= 2 ? (
      <Sparkline data={trend} color={color} w={w} h={h} invert />
    ) : (
      <div
        className="tiny muted"
        style={{ display: "grid", placeItems: "center", width: w, height: h ?? 28 }}
      >
        {(w ?? 0) >= 160 ? t("noRankDataYet") : t("noData")}
      </div>
    )

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <div className="eyebrow"><span className="spark"><Icon.spark /></span> {t("headerEyebrow")}</div>
          <h1>{t("headerTitle")}</h1>
          <div className="sub">
            {isFree
              ? t("subFree", { used: projects.length, limit: FREE_PROJECTS_LIMIT })
              : t("subTracked", { count: projects.length })}
          </div>
        </div>
        <div className="row">
          {/* Daily-checks chip moved to the navbar (UsageMeter). */}
          {usage?.isAdmin && (
            <Link href="/admin"><button className="btn sm">{t("admin")}</button></Link>
          )}
          <button className="btn sm" onClick={onStartTour} title={t("tourTitle")}>{t("tour")}</button>
          <div className="pill-toggle">
            <button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")}>{t("viewGrid")}</button>
            <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}>{t("viewList")}</button>
          </div>
          <button
            data-tutorial="new-project-btn"
            onClick={handleAdd}
            title={addTitle}
            className="btn primary"
          >
            <Icon.plus /> {t("newProject")}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ padding: 60, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
          {t("loadingProjects")}
        </div>
      ) : projects.length === 0 ? (
        <div
          data-tutorial="projects-area"
          className="card"
          style={{
            padding: "60px 32px",
            textAlign: "center",
            border: "1px dashed var(--border-strong)",
            background: "transparent",
          }}
        >
          <div className="eyebrow" style={{ justifyContent: "center" }}>
            <span className="spark"><Icon.spark /></span> {t("emptyEyebrow")}
          </div>
          <div className="b" style={{ fontSize: 18, marginTop: 4 }}>{t("emptyTitle")}</div>
          <div className="tiny muted" style={{ marginTop: 6, maxWidth: 360, marginLeft: "auto", marginRight: "auto" }}>
            {t("emptyDescription")}
          </div>
          <button className="btn primary" style={{ marginTop: 16 }} onClick={onAdd}>
            <Icon.plus /> {t("createFirstProject")}
          </button>
        </div>
      ) : view === "grid" ? (
        <div data-tutorial="projects-area" className="grid g-3">
          {projects.map((p) => {
            const color = projectColor(p.id)
            return (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpen(p.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(p.id) } }}
                className="card"
                style={{
                  cursor: "pointer",
                  border: "1px solid var(--border)",
                  textAlign: "left",
                  background: "var(--bg-elev)",
                  transition: "box-shadow 0.15s, transform 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = "var(--shadow-md)"
                  e.currentTarget.style.transform = "translateY(-1px)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = ""
                  e.currentTarget.style.transform = ""
                }}
              >
                <div className="row" style={{ marginBottom: 14 }}>
                  {/* Real site favicon, falling back to the project's colour-keyed
                      initial when the favicon can't be fetched. */}
                  <Favicon domain={displayDomain(p.domain)} size={32} fallbackColor={color} bare />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="b" style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.name}
                    </div>
                    <div className="tiny muted mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {displayDomain(p.domain)}
                    </div>
                  </div>
                  <span className={"chip " + (p.isPaused ? "warn" : "pos")}>{p.isPaused ? t("statusPaused") : t("statusActive")}</span>
                  <div onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0 }}>
                    <FavoriteButton key={`pf-${p.id}-${favReady}`} entityType="project" entityId={p.id} initial={favoriteIds.has(p.id)} />
                  </div>
                </div>
                <div className="grid g-2" style={{ marginBottom: 14, gap: 10 }}>
                  <div>
                    <div className="tiny muted">{t("keywords")}</div>
                    <div className="b tabular" style={{ fontSize: 18 }}>{p._count.keywords}</div>
                  </div>
                  <div>
                    <div className="tiny muted">{t("added")}</div>
                    <div className="b tabular" style={{ fontSize: 13 }}>
                      {new Date(p.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                    </div>
                  </div>
                </div>
                {renderSpark(p.trend, color, 260, 32)}
              </div>
            )
          })}
          <button
            onClick={handleAdd}
            className="card"
            style={{
              display: "grid",
              placeItems: "center",
              padding: 40,
              border: "1px dashed var(--border-strong)",
              background: "transparent",
              color: "var(--text-mute)",
              cursor: "pointer",
            }}
          >
            <Icon.plus />
            <span className="b" style={{ marginTop: 8, color: "var(--text)" }}>{t("newProject")}</span>
            <span className="tiny muted" style={{ marginTop: 4 }}>
              {isAtProjectLimit ? t("upgradeToTrackMore") : t("trackNewDomain")}
            </span>
          </button>
        </div>
      ) : (
        <div data-tutorial="projects-area" className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t("colProject")}</th>
                <th>{t("colKeywords")}</th>
                <th>{t("colStatus")}</th>
                <th>{t("colCreated")}</th>
                <th>{t("colTrend")}</th>
                <th aria-hidden style={{ width: 36 }}></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const color = projectColor(p.id)
                return (
                  <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => onOpen(p.id)}>
                    <td>
                      <div className="row">
                        <Favicon domain={p.domain} size={22} fallbackColor={color} bare />
                        <div>
                          <div className="b">{p.name}</div>
                          <div className="tiny muted mono">{p.domain}</div>
                        </div>
                      </div>
                    </td>
                    <td className="tabular">{p._count.keywords}</td>
                    <td>
                      <span className={"chip " + (p.isPaused ? "warn" : "pos")}>{p.isPaused ? t("statusPaused") : t("statusActive")}</span>
                    </td>
                    <td className="tabular tiny muted">
                      {new Date(p.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                    </td>
                    <td>{renderSpark(p.trend, color)}</td>
                    <td onClick={(e) => e.stopPropagation()} style={{ width: 36 }}>
                      <FavoriteButton key={`pf-${p.id}-${favReady}`} entityType="project" entityId={p.id} initial={favoriteIds.has(p.id)} />
                    </td>
                    <td className="right"><Icon.chevR /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ───── Page wrapper ────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const t = useTranslations("dashProjects")
  const { user, loading, refreshUser } = useAuth()
  const router = useRouter()
  const { startTutorial, advanceFromStep } = useTutorial()

  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [showAddProject, setShowAddProject] = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [usage, setUsage] = useState<UsageInfo | null>(null)
  // Project favorites, cross-referenced once so each card's star starts correct.
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const [favReady, setFavReady] = useState(false)

  // Auto-refresh user data every 30 seconds so plan/usage stays fresh.
  useEffect(() => {
    if (!user || !refreshUser) return
    const interval = setInterval(() => { void refreshUser() }, 30000)
    return () => clearInterval(interval)
  }, [user, refreshUser])

  useEffect(() => {
    if (!loading && !user) router.push("/login")
    if (!loading && user && !user.emailVerified) router.push("/verify-email")
  }, [user, loading, router])

  // Google signup lands here with a sessionStorage marker (the email signup
  // path arrives with ?first-sign-up already in the URL). Fire the GTM signup
  // conversion once, then clear the marker.
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      if (sessionStorage.getItem("fs_just_signed_up")) {
        sessionStorage.removeItem("fs_just_signed_up")
        trackEvent("first-sign-up")
      }
    } catch {}
  }, [])

  // Don't gate these on the React `token` state — it can lag behind the
  // actual session (the api client owns the token via getAccessToken() and
  // refreshes on 401). The `user?.emailVerified` gate on the callers already
  // guarantees an authenticated session. Gating on the lagging token state
  // previously let loadProjects early-return *before* its finally, leaving
  // the page stuck on "Loading projects…" forever.
  const loadProjects = useCallback(async () => {
    setProjectsLoading(true)
    try {
      const data = await api.get<ProjectSummary[]>("/api/projects")
      if (Array.isArray(data)) setProjects(data)
    } catch (err) {
      // Network failure (backend down / CORS). Swallow so the 10s poll
      // interval doesn't surface an unhandledRejection.
      console.error("Failed to load projects:", err)
    } finally { setProjectsLoading(false) }
  }, [])

  const loadUsage = useCallback(async () => {
    try {
      const data = await api.get<UsageInfo>("/api/usage")
      if (data && typeof data.dailyLimit === "number") setUsage(data)
    } catch {}
  }, [])

  useEffect(() => {
    if (user?.emailVerified) { void loadProjects(); void loadUsage() }
  }, [user, loadProjects, loadUsage])

  // Load the user's project favorites once the session is verified.
  useEffect(() => {
    if (!user?.emailVerified) return
    let cancelled = false
    api
      .get<{ favorites: { entity: { id: string } }[] }>("/api/favorites?entityType=project")
      .then((r) => {
        if (cancelled) return
        setFavoriteIds(new Set((r.favorites ?? []).map((f) => f.entity.id)))
        setFavReady(true)
      })
      .catch(() => { if (!cancelled) setFavReady(true) })
    return () => { cancelled = true }
  }, [user])

  // Auto-refresh projects list every 10 seconds to keep statuses fresh.
  useEffect(() => {
    if (!user?.emailVerified) return
    const interval = setInterval(() => {
      void loadProjects()
      void loadUsage()
    }, 10000)
    return () => clearInterval(interval)
  }, [user, loadProjects, loadUsage])

  if (loading || !user) {
    return (
      <div style={{ display: "grid", placeItems: "center", padding: 80, color: "var(--text-mute)", fontSize: 13 }}>
        {t("loading")}
      </div>
    )
  }

  return (
    <>
      <ProjectsList
        projects={projects}
        loading={projectsLoading}
        plan={usage?.plan}
        usage={usage}
        onAdd={() => setShowAddProject(true)}
        onUpgrade={() => setShowUpgrade(true)}
        onOpen={(id) => router.push(`/dashboard/project/${id}/keywords`)}
        onStartTour={startTutorial}
        favoriteIds={favoriteIds}
        favReady={favReady}
      />

      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}

      {showAddProject && (
        <AddProjectModal
          plan={usage?.plan}
          onClose={() => setShowAddProject(false)}
          onCreated={(p) => {
            // First-ever project for this user → mark the GTM conversion. The
            // current `projects` list is empty only on the very first create
            // (existing users always have ≥1), so this never mis-fires.
            const isFirstProject = projects.length === 0
            setProjects((prev) => [p, ...prev])
            setShowAddProject(false)
            // Tutorial step 1 → 2 — survives the navigation since tutorial
            // state lives in TutorialProvider at the root layout level.
            advanceFromStep(1)
            // Newly-created project → jump straight into its keywords page.
            router.push(`/dashboard/project/${p.id}/keywords${isFirstProject ? "?first-project-created" : ""}`)
          }}
        />
      )}
    </>
  )
}
