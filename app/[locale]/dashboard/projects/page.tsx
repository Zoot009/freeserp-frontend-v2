"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "@/i18n/navigation"
import { useAuth } from "@/lib/auth"
import { api } from "@/lib/api"
import { useTutorial } from "@/lib/tutorial"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/dashboard/icons"
import { FavoriteButton } from "@/components/dashboard/favorite-button"
import { Sparkline } from "@/components/dashboard/primitives"
import { Favicon } from "@/components/favicon"
import { displayDomain } from "@/lib/utils"
import { trackEvent, trackMilestone } from "@/lib/track"
import { track } from "@/lib/analytics"
import { clearPendingDomain, projectNameFor, readPendingDomain } from "@/lib/pendingDomain"
import { ToolContext } from "@/components/dashboard/tool-context"
import { CreateProjectModal } from "@/components/dashboard/create-project-modal"
import { ProjectLimitModal } from "@/components/dashboard/project-limit-modal"
// Fallback only — the real cap comes from /api/usage (`projectsLimit`), so a
// per-user override or a plan whose limit isn't 1 no longer reads wrong here.
import { FREE_PROJECTS_LIMIT } from "@/hooks/use-project-limit"

// ───── Types ───────────────────────────────────────────────────────────────

interface ProjectSummary {
  id: string
  name: string
  domain: string
  isActive: boolean
  // Opt-in auto-check schedule. Off by default — the status chip reads "Manual"
  // until the owner turns a schedule on.
  autoCheckEnabled: boolean
  // Manual pause toggle. When true an active schedule is temporarily halted —
  // reflected by the status chip.
  isPaused: boolean
  createdAt: string
  _count: { keywords: number }
  // Real average-position trend (oldest→newest), 1 point per day over the last
  // 30 days. Empty when the project has no completed rank checks yet.
  trend?: number[]
}

type UsageInfo = { plan: string; dailyUsed: number; dailyLimit: number; dailyRemaining: number; isAdmin?: boolean; projectsLimit?: number }

// ───── Helpers ─────────────────────────────────────────────────────────────

// Stable color per project id — same hash function used in the keywords page
// so a project's swatch matches across cards, headers, and charts.
function projectColor(id: string): string {
  const palette = ["#2D5BFF", "#F59E0B", "#10B981", "#EC4899", "#8B5CF6", "#06B6D4", "#F97316"]
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

// ───── Projects list ───────────────────────────────────────────────────────

function ProjectsList({
  projects,
  loading,
  plan,
  limit,
  usage,
  onAdd,
  onUpgrade,
  onOpen,
  favoriteIds,
  favReady,
}: {
  projects: ProjectSummary[]
  loading: boolean
  plan?: string
  /** Projects this plan allows, as reported by /api/usage. */
  limit: number
  usage: UsageInfo | null
  onAdd: () => void
  onUpgrade: () => void
  onOpen: (id: string) => void
  favoriteIds: Set<string>
  favReady: boolean
}) {
  const t = useTranslations("dashProjects")
  const [view, setView] = useState<"grid" | "list">("grid")
  // `plan` arrives asynchronously from /api/usage. Until it does we don't
  // know the tier — don't assume "free" in that window, otherwise paid users
  // see the project-cap notice flash before usage resolves.
  const isFree = plan === "free"
  const isAtProjectLimit = isFree && projects.length >= limit
  // The New-project button stays enabled even at the free limit — clicking it
  // opens the upgrade popup instead of the create-project modal.
  const handleAdd = isAtProjectLimit ? onUpgrade : onAdd
  const addTitle = isAtProjectLimit
    ? t("addTitleAtLimit", { limit })
    : t("addTitleDefault")

  // Real average-position trend sparkline (lower position is better, hence
  // `invert`). Projects with fewer than two data points have no meaningful line
  // to draw yet, so we show a muted placeholder instead of a misleading graph.
  const renderSpark = (trend: number[] | undefined, color: string, w?: number, h?: number, fullWidth?: boolean) =>
    trend && trend.length >= 2 ? (
      <Sparkline data={trend} color={color} w={w} h={h} invert fullWidth={fullWidth} />
    ) : (
      <div
        className="tiny muted"
        style={{ display: "grid", placeItems: "center", width: fullWidth ? "100%" : w, height: h ?? 28 }}
      >
        {fullWidth || (w ?? 0) >= 160 ? t("noRankDataYet") : t("noData")}
      </div>
    )

  return (
    <div className="page">
      {/* Headed like the Overview and Website Audit pages, not like the older
          .page-h block this replaced: same 26px title, same muted subtitle, the
          same right-aligned action row. The eyebrow went with it — "RANK
          TRACKING" above a heading that reads "Rank Tracker" said the page's
          name twice, and no other page in the dashboard carries one. */}
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em]">
            {t("headerTitle")}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {isFree
              ? t("subFree", { used: projects.length, limit })
              : t("subTracked", { count: projects.length })}
          </p>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          {/* Same segmented control as the Overview's range switcher. */}
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
                {v === "grid" ? t("viewGrid") : t("viewList")}
              </button>
            ))}
          </div>
          <Button
            data-tutorial="new-project-btn"
            onClick={handleAdd}
            title={addTitle}
            className="h-[38px] gap-1.5 rounded-[9px] text-sm font-semibold"
          >
            <Plus className="size-4" /> {t("newProject")}
          </Button>
        </div>
      </div>

      <ToolContext id="google-tracker" />

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
                  <span className={"chip " + (!p.autoCheckEnabled ? "" : p.isPaused ? "warn" : "pos")}>{!p.autoCheckEnabled ? t("statusManual") : p.isPaused ? t("statusPaused") : t("statusActive")}</span>
                  <div onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0 }}>
                    <FavoriteButton key={`pf-${p.id}-${favReady}`} entityType="project" entityId={p.id} initial={favoriteIds.has(p.id)} />
                  </div>
                </div>
                <div className="grid g-2" style={{ marginBottom: 14, gap: 10 }}>
                  <div>
                    <div className="tiny muted">{t("keywords")}</div>
                    <div className="b tabular" style={{ fontSize: 18 }}>{p._count?.keywords ?? 0}</div>
                  </div>
                  <div>
                    <div className="tiny muted">{t("added")}</div>
                    <div className="b tabular" style={{ fontSize: 13 }}>
                      {new Date(p.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                    </div>
                  </div>
                </div>
                {renderSpark(p.trend, color, 260, 40, true)}
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
                    <td className="tabular">{p._count?.keywords ?? 0}</td>
                    <td>
                      <span className={"chip " + (!p.autoCheckEnabled ? "" : p.isPaused ? "warn" : "pos")}>{!p.autoCheckEnabled ? t("statusManual") : p.isPaused ? t("statusPaused") : t("statusActive")}</span>
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
  // advanceFromStep only: the Tour button that called startTutorial is gone, so
  // nothing on this page begins the tutorial any more. The provider still
  // RESUMES one that is already in progress, and this call keeps that flow
  // moving when a project is created — but there is currently no entry point
  // left anywhere in the app to start it in the first place.
  const { advanceFromStep } = useTutorial()

  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [showAddProject, setShowAddProject] = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [usage, setUsage] = useState<UsageInfo | null>(null)
  // The plan's real cap. Falls back to the free default only until /api/usage
  // answers — the gate below is `plan === "free"`-conditioned, so an unresolved
  // usage never blocks a paid user's button.
  const projectLimit = usage?.projectsLimit ?? FREE_PROJECTS_LIMIT
  // Project favorites, cross-referenced once so each card's star starts correct.
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const [favReady, setFavReady] = useState(false)

  // Refreshing the session hands back a NEW `user` object every time, so effects
  // must key off a stable primitive. Depending on `user` itself re-ran them (and
  // their loaders) on every refresh, which is half of why the grid kept flashing
  // back to "Loading projects…".
  const verified = !!user?.emailVerified

  // Auto-refresh user data every 30 seconds so plan/usage stays fresh.
  useEffect(() => {
    if (!verified || !refreshUser) return
    const interval = setInterval(() => { void refreshUser() }, 30000)
    return () => clearInterval(interval)
  }, [verified, refreshUser])

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
  // `silent` refreshes update the grid in place. Only the first load shows the
  // skeleton — flipping it back on for the 10s poll made the whole list visibly
  // "re-load" every few seconds.
  const loadProjects = useCallback(async (silent = false) => {
    if (!silent) setProjectsLoading(true)
    try {
      const data = await api.get<ProjectSummary[]>("/api/projects")
      if (Array.isArray(data)) setProjects(data)
    } catch (err) {
      // Network failure (backend down / CORS). Swallow so the 10s poll
      // interval doesn't surface an unhandledRejection.
      console.error("Failed to load projects:", err)
    } finally { if (!silent) setProjectsLoading(false) }
  }, [])

  const loadUsage = useCallback(async () => {
    try {
      const data = await api.get<UsageInfo>("/api/usage")
      if (data && typeof data.dailyLimit === "number") setUsage(data)
    } catch {}
  }, [])

  useEffect(() => {
    if (!verified) return
    void loadProjects()
    void loadUsage()
  }, [verified, loadProjects, loadUsage])

  // Load the user's project favorites once the session is verified.
  useEffect(() => {
    if (!verified) return
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
  }, [verified])

  // Auto-refresh projects list every 10 seconds to keep statuses fresh. Silent:
  // it swaps the data in place rather than re-showing the skeleton.
  useEffect(() => {
    if (!verified) return
    const interval = setInterval(() => {
      void loadProjects(true)
      void loadUsage()
    }, 10000)
    return () => clearInterval(interval)
  }, [verified, loadProjects, loadUsage])

  // A visitor who previewed a domain on the marketing landing page arrives here
  // with it in a cookie — create that project for them rather than dropping them
  // on an empty dashboard. See lib/pendingDomain.ts for the handoff.
  //
  // Waits for projectsLoading to settle: the dedupe check below needs the real
  // list, and acting on an empty in-flight list would create a duplicate.
  const pendingDomainRef = useRef(false)
  useEffect(() => {
    if (!verified || projectsLoading || pendingDomainRef.current) return

    const domain = readPendingDomain()
    if (!domain) return
    pendingDomainRef.current = true

    // Cleared BEFORE the request, deliberately. If creation fails (free-plan
    // project cap, offline, backend down) we do not want a cookie that retries
    // on every single page load forever; the owner can add the project by hand.
    clearPendingDomain()

    if (projects.some((p) => p.domain?.toLowerCase().replace(/^www\./, "") === domain)) return

    const wasEmpty = projects.length === 0
    api
      .post<ProjectSummary>("/api/projects", { name: projectNameFor(domain), domain })
      .then((created) => {
        if (!created?.id) return
        setProjects((prev) => [{ ...created, _count: { keywords: 0 } }, ...prev])
        // Drop them straight into their first project so the landing-page story
        // finishes where it promised. `?new=1` puts the keywords page into the
        // onboarding flow (the "Analyzing…" screen → auto-open Add Keywords with
        // AI suggestions) — same as the Add-project modal path below. Without it,
        // a user arriving from the landing page silently skipped that screen and
        // never saw the suggestions the backend already generated. With existing
        // projects we stay put — a surprise redirect away from the grid would be worse.
        if (wasEmpty) router.push(`/dashboard/project/${created.id}/keywords?new=1`)
      })
      .catch(() => {
        /* Most likely the free-plan project cap. The grid still renders. */
      })
  }, [verified, projectsLoading, projects, router])

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
        limit={projectLimit}
        usage={usage}
        onAdd={() => setShowAddProject(true)}
        onUpgrade={() => setShowUpgrade(true)}
        onOpen={(id) => router.push(`/dashboard/project/${id}/keywords`)}
        favoriteIds={favoriteIds}
        favReady={favReady}
      />

      {showUpgrade && (
        <ProjectLimitModal
          limit={projectLimit}
          used={projects.length}
          onClose={() => setShowUpgrade(false)}
        />
      )}

      {showAddProject && (
        <CreateProjectModal<ProjectSummary>
          onClose={() => setShowAddProject(false)}
          // The cap check above runs on a usage snapshot that can be stale (a
          // second tab, or a plan change). When the server refuses anyway, close
          // the form — its 402 already fired `billing:quota`, so the global
          // QuotaUpsellModal carries the upgrade path from here.
          onPlanLimit={() => setShowAddProject(false)}
          onCreated={(p) => {
            // POST /api/projects returns the bare project row — no `_count`,
            // which only the list query includes. Inserting it as-is made the
            // grid/list crash on `p._count.keywords` before the redirect below
            // could take over, tripping the dashboard error boundary. Normalise
            // it here (a brand-new project tracks nothing yet) so the cards and
            // table can read it — same fallback the pending-domain flow uses.
            setProjects((prev) => [{ ...p, _count: p._count ?? { keywords: 0 } }, ...prev])
            setShowAddProject(false)
            // First-ever project for this account → GTM conversion. Deduped
            // server-side, so it fires once per account and never again if the
            // user later deletes all their projects and creates another (the old
            // `projects.length === 0` heuristic re-fired in that case).
            void trackMilestone("first-project-created")
            track("project_created", { projectId: p.id })
            // Tutorial step 1 → 2 — survives the navigation since tutorial
            // state lives in TutorialProvider at the root layout level.
            advanceFromStep(1)
            // Newly-created project → jump straight into its keywords page.
            // `?new=1` puts that page into the onboarding flow: show the AI
            // analysis screen, then auto-open Add Keywords with the suggestions.
            // A query param rather than router state because state doesn't
            // survive the navigation, and this way a refresh mid-analysis still
            // lands the user back in the flow instead of on an empty table.
            router.push(`/dashboard/project/${p.id}/keywords?new=1`)
          }}
        />
      )}
    </>
  )
}
