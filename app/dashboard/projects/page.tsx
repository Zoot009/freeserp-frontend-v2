"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth"
import { api } from "@/lib/api"
import { useTutorial, isTutorialDone } from "@/lib/tutorial"
import { Icon } from "@/components/dashboard/icons"
import { Sparkline } from "@/components/dashboard/primitives"

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
  createdAt: string
  _count: { keywords: number }
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
      setError(err instanceof Error ? err.message : "Failed to create project")
    } finally { setLoading(false) }
  }

  return (
    <div className="fs-app">
      <div className="modal-bg" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
          <div className="modal-h">
            <div>
              <div className="eyebrow" style={{ margin: 0, fontSize: 11 }}><span className="spark"><Icon.spark /></span> NEW PROJECT</div>
              <div className="b" style={{ fontSize: 18, marginTop: 4 }}>Add a project</div>
            </div>
            <button type="button" onClick={onClose} className="icon-btn" aria-label="Close"><Icon.close /></button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="modal-b" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="field">
                <label>Project name</label>
                <input ref={firstRef} className="input" type="text" required placeholder="My website" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field">
                <label>Domain</label>
                <input className="input" type="text" required placeholder="example.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
                <span className="tiny muted">Without https:// — e.g. example.com</span>
              </div>
              {SCHEDULED_CHECKS_ENABLED && plan === "paid" && (
                <div className="field">
                  <label>Check frequency</label>
                  <select className="input" value={checkFrequency} onChange={(e) => setCheckFrequency(Number(e.target.value))}>
                    <option value={1}>Every 1 hour</option>
                    <option value={6}>Every 6 hours</option>
                    <option value={12}>Every 12 hours</option>
                    <option value={24}>Every 24 hours (daily)</option>
                  </select>
                  <span className="tiny muted">How often automated rank checks run</span>
                </div>
              )}
              {error && (
                <div className="card tight" style={{ borderColor: "var(--neg)", background: "var(--neg-soft)", color: "var(--neg)", fontSize: 12 }}>
                  {error}
                </div>
              )}
            </div>
            <div className="modal-f">
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn primary" disabled={loading}>
                {loading ? "Creating…" : "Create project"}
              </button>
            </div>
          </form>
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
  onOpen,
  onStartTour,
}: {
  projects: ProjectSummary[]
  loading: boolean
  plan?: string
  usage: UsageInfo | null
  onAdd: () => void
  onOpen: (id: string) => void
  onStartTour: () => void
}) {
  const [view, setView] = useState<"grid" | "list">("grid")
  // `plan` arrives asynchronously from /api/usage. Until it does we don't
  // know the tier — don't assume "free" in that window, otherwise paid users
  // see the project-cap notice flash before usage resolves.
  const isFree = plan === "free"
  const isAtProjectLimit = isFree && projects.length >= FREE_PROJECTS_LIMIT
  const addDisabled = isAtProjectLimit
  const addTitle = isAtProjectLimit
    ? `Free plan: ${FREE_PROJECTS_LIMIT} project limit reached. Upgrade for unlimited projects.`
    : "Create a new project"

  // Stable deterministic sparkline so a re-render doesn't reshuffle every card.
  const sparkFor = (seed: string, base: number) => {
    let s = 0
    for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0
    return Array.from({ length: 14 }, (_, i) => {
      s = (s * 1103515245 + 12345) >>> 0
      const r = (s % 1000) / 1000
      return Math.max(1, base + (r - 0.5) * 6 + Math.sin(i * 0.6) * 1.2)
    })
  }

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <div className="eyebrow"><span className="spark"><Icon.spark /></span> RANK TRACKING</div>
          <h1>Projects</h1>
          <div className="sub">
            {isFree
              ? `${projects.length} of ${FREE_PROJECTS_LIMIT} used on Free plan · upgrade for unlimited`
              : `${projects.length} project${projects.length === 1 ? "" : "s"} tracked`}
          </div>
        </div>
        <div className="row">
          {/* Daily-checks chip moved to the navbar (UsageMeter). */}
          {usage?.isAdmin && (
            <Link href="/admin"><button className="btn sm">Admin</button></Link>
          )}
          <button className="btn sm" onClick={onStartTour} title="Replay product tour">Tour</button>
          <div className="pill-toggle">
            <button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")}>Grid</button>
            <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}>List</button>
          </div>
          <button
            data-tutorial="new-project-btn"
            onClick={onAdd}
            disabled={addDisabled}
            title={addTitle}
            className={"btn " + (addDisabled ? "" : "primary")}
            style={addDisabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
          >
            <Icon.plus /> New project
          </button>
        </div>
      </div>

      {/* Free-plan project-cap notice */}
      {isAtProjectLimit && (
        <div
          className="card tight"
          style={{
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            borderColor: "var(--brand)",
            background: "var(--brand-soft)",
          }}
        >
          <div>
            <div className="b" style={{ color: "var(--brand)", fontSize: 13 }}>
              Free plan · {FREE_PROJECTS_LIMIT} project limit reached
            </div>
            <div className="tiny muted" style={{ marginTop: 2 }}>
              Delete your existing project to make a new one, or upgrade for unlimited projects.
            </div>
          </div>
          <Link href="/pricing"><button className="btn primary sm">Upgrade</button></Link>
        </div>
      )}

      {loading ? (
        <div className="card" style={{ padding: 60, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
          Loading projects…
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
            <span className="spark"><Icon.spark /></span> NO PROJECTS YET
          </div>
          <div className="b" style={{ fontSize: 18, marginTop: 4 }}>Track your first domain</div>
          <div className="tiny muted" style={{ marginTop: 6, maxWidth: 360, marginLeft: "auto", marginRight: "auto" }}>
            Create a project and add keywords to start tracking daily rankings across Google.
          </div>
          <button className="btn primary" style={{ marginTop: 16 }} onClick={onAdd}>
            <Icon.plus /> Create first project
          </button>
        </div>
      ) : view === "grid" ? (
        <div data-tutorial="projects-area" className="grid g-3">
          {projects.map((p) => {
            const color = projectColor(p.id)
            return (
              <button
                key={p.id}
                onClick={() => onOpen(p.id)}
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
                  <span
                    className="fav"
                    style={{ background: color, color: "white", width: 32, height: 32, fontSize: 14, borderRadius: 8 }}
                  >
                    {p.domain[0]?.toUpperCase() ?? "?"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="b" style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.name}
                    </div>
                    <div className="tiny muted mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.domain}
                    </div>
                  </div>
                  <span className={"chip " + (p.isActive ? "pos" : "warn")}>{p.isActive ? "Active" : "Paused"}</span>
                </div>
                <div className="grid g-2" style={{ marginBottom: 14, gap: 10 }}>
                  <div>
                    <div className="tiny muted">Keywords</div>
                    <div className="b tabular" style={{ fontSize: 18 }}>{p._count.keywords}</div>
                  </div>
                  <div>
                    <div className="tiny muted">Added</div>
                    <div className="b tabular" style={{ fontSize: 13 }}>
                      {new Date(p.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                    </div>
                  </div>
                </div>
                <Sparkline data={sparkFor(p.id, 12)} color={color} w={260} h={32} invert />
              </button>
            )
          })}
          {!isAtProjectLimit && (
            <button
              onClick={onAdd}
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
              <span className="b" style={{ marginTop: 8, color: "var(--text)" }}>New project</span>
              <span className="tiny muted" style={{ marginTop: 4 }}>Track a new domain</span>
            </button>
          )}
        </div>
      ) : (
        <div data-tutorial="projects-area" className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Project</th>
                <th>Keywords</th>
                <th>Status</th>
                <th>Created</th>
                <th>Trend</th>
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
                        <span className="fav" style={{ background: color, color: "white", width: 22, height: 22, fontSize: 11 }}>
                          {p.domain[0]?.toUpperCase() ?? "?"}
                        </span>
                        <div>
                          <div className="b">{p.name}</div>
                          <div className="tiny muted mono">{p.domain}</div>
                        </div>
                      </div>
                    </td>
                    <td className="tabular">{p._count.keywords}</td>
                    <td>
                      <span className={"chip " + (p.isActive ? "pos" : "warn")}>{p.isActive ? "Active" : "Paused"}</span>
                    </td>
                    <td className="tabular tiny muted">
                      {new Date(p.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                    </td>
                    <td><Sparkline data={sparkFor(p.id, 12)} color={color} invert /></td>
                    <td className="right"><Icon.chevR /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ───── Page wrapper ────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const { user, loading, refreshUser } = useAuth()
  const router = useRouter()
  const { startTutorial, isActive: tutorialActive, advanceFromStep } = useTutorial()

  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [showAddProject, setShowAddProject] = useState(false)
  const [usage, setUsage] = useState<UsageInfo | null>(null)

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

  // Auto-start the tutorial for new users.
  // Guard with tutorialActive so a user-object reference change (e.g. from the
  // 30-second auto-refresh) can't restart it while it's in progress.
  useEffect(() => {
    if (!user || loading) return
    if (!tutorialActive && !isTutorialDone()) startTutorial()
  }, [user, loading, tutorialActive, startTutorial])

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
        Loading…
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
        onOpen={(id) => router.push(`/dashboard/project/${id}/keywords`)}
        onStartTour={startTutorial}
      />

      {showAddProject && (
        <AddProjectModal
          plan={usage?.plan}
          onClose={() => setShowAddProject(false)}
          onCreated={(p) => {
            setProjects((prev) => [p, ...prev])
            setShowAddProject(false)
            // Tutorial step 1 → 2 — survives the navigation since tutorial
            // state lives in TutorialProvider at the root layout level.
            advanceFromStep(1)
            // Newly-created project → jump straight into its keywords page.
            router.push(`/dashboard/project/${p.id}/keywords`)
          }}
        />
      )}
    </>
  )
}
