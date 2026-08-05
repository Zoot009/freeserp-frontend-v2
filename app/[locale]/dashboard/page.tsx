"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Link, useRouter } from "@/i18n/navigation"
import { api } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"
import { ProjectSwitcher } from "@/components/dashboard/project-switcher"
import {
  StatTile,
  LineChart,
  Donut,
  Legend,
  KeywordTable,
  ActivityFeed,
  serpFeaturesToChips,
  trendToSparkline,
  type KeywordRow,
  type ActivityItem,
  type SerpFeatures,
  type MonthlySearch,
} from "@/components/dashboard/primitives"

// Rows on the dashboard need a projectId alongside the keyword id so that
// clicking a row can route to the project-scoped detail URL.
type EnrichedRow = KeywordRow & { projectId: string }

type ProjectSummary = {
  id: string
  name: string
  domain: string
  isActive: boolean
  createdAt: string
  _count: { keywords: number }
}

type Keyword = {
  id: string
  keyword: string
  location: string | null
  position: number | null
  d1: number | null
  d7: number | null
  url: string | null
  monthlyTraffic: number | null
  searchVolume: number | null
  serpFeatures: SerpFeatures | null
  searchVolumeTrend: MonthlySearch[] | null
}

type ProjectDetail = {
  id: string
  name: string
  domain: string
  keywords: Keyword[]
}

type OverviewRange = "24h" | "7d" | "30d" | "90d"

type OverviewResponse = {
  range: OverviewRange
  stats: {
    totalKeywords: number
    ranked: number
    avgPosition: number | null
    inTop3: number
    inTop10: number
    inTop30: number
    outside30: number
  }
  history: { t: string; avgPos: number }[]
}

export default function DashboardOverviewPage() {
  const t = useTranslations("dashOverview")
  // The page title now reuses the nav's "Overview" label, so the heading and the
  // sidebar entry can't drift apart.
  const tNav = useTranslations("dashboardNav")
  const router = useRouter()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [keywords, setKeywords] = useState<EnrichedRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<OverviewRange>("7d")
  const [overview, setOverview] = useState<OverviewResponse | null>(null)
  // The project this page is scoped to — tiles, coverage, chart and keyword
  // rows all narrow to it. Null only until the project list arrives; the effect
  // below then settles on the first one, because the switcher offers no "all
  // projects" entry to get back to an unscoped view.
  const [projectId, setProjectId] = useState<string | null>(null)

  // Settle on the first project as soon as the list lands, so the page is never
  // stuck on an unscoped view the switcher can't return to.
  useEffect(() => {
    if (projectId === null && projects.length > 0) setProjectId(projects[0]!.id)
  }, [projects, projectId])

  // Stats + average-position history for the selected project.
  //
  // Guarded on projectId: without it the first render fired an UNSCOPED request,
  // so the page painted every project's totals for a beat before the scoped
  // numbers replaced them. Waiting costs nothing — the project list is already
  // in flight — and the page shows one set of figures instead of two.
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    ;(async () => {
      try {
        const scope = `&projectId=${encodeURIComponent(projectId)}`
        const data = await api.get<OverviewResponse>(`/api/overview?range=${range}${scope}`)
        if (!cancelled) setOverview(data)
      } catch {
        if (!cancelled) setOverview(null)
      }
    })()
    return () => { cancelled = true }
  }, [range, projectId])

  // The project list. Fetched ONCE on mount — it doesn't depend on the
  // selection, and refetching it per selection was what let the keyword rows lag
  // a step behind the tiles.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await api.get<ProjectSummary[]>("/api/projects")
        if (!cancelled) setProjects(list)
      } catch (e) {
        const msg = e instanceof Error ? e.message : t("loadError")
        if (!cancelled) setError(msg)
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [t])

  // Keyword rows for the selected project only.
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    ;(async () => {
      try {
        const detail = await api.get<ProjectDetail>(`/api/projects/${projectId}`)
        if (cancelled) return
        setKeywords(
          detail.keywords.map((k) => {
            const pos = k.position
            return {
              id: k.id,
              kw: k.keyword,
              pos,
              prev: pos != null && k.d1 != null ? pos + k.d1 : pos,
              vol: k.searchVolume ?? 0,
              url: k.url,
              feat: serpFeaturesToChips(k.serpFeatures),
              trend: trendToSparkline(k.searchVolumeTrend),
              // Carry the parent project's id so a row click can build the
              // project-scoped detail URL (the keyword id alone wouldn't be
              // enough now that the route is /project/[id]/keywords/[kwId]).
              projectId: detail.id,
            }
          }),
        )
      } catch {
        // Non-fatal: the tiles still render from /api/overview. Clear the rows
        // rather than stranding the previous project's keywords on screen.
        if (!cancelled) setKeywords([])
      }
    })()
    return () => { cancelled = true }
  }, [projectId])

  // Headline stats come from the real aggregate endpoint (all projects, not the
  // first 3, and no synthetic data). estTraffic stays modelled from the loaded
  // keyword volumes — it's clearly labelled "modelled".
  const stats = overview?.stats
  const totalKeywords = stats?.totalKeywords ?? 0
  const ranked = stats?.ranked ?? 0
  const avgPos = stats?.avgPosition ?? 0
  const inTop10 = stats?.inTop10 ?? 0
  const inTop3 = stats?.inTop3 ?? 0
  const inTop30 = stats?.inTop30 ?? 0
  const outside30 = stats?.outside30 ?? 0
  const estTraffic = keywords.reduce((sum, k) => {
    const t = k.pos != null && k.pos <= 30 ? Math.max(0, Math.round(k.vol * (0.32 / k.pos))) : 0
    return sum + t
  }, 0)

  // Real average-position trend for the selected range (one point per bucket).
  const rankHistory = (overview?.history ?? []).map((h) => ({ pos: h.avgPos }))

  // Latest movements: keywords sorted by absolute delta desc
  const latestMovements = [...keywords]
    .filter((k) => k.prev != null && k.pos != null && k.prev !== k.pos)
    .sort((a, b) => Math.abs((b.prev! - b.pos!)) - Math.abs((a.prev! - a.pos!)))
    .slice(0, 6)

  const activity: ActivityItem[] = latestMovements.slice(0, 5).map((k) => {
    const diff = (k.prev ?? 0) - (k.pos ?? 0)
    return {
      type: diff > 0 ? "rank-up" : "rank-down",
      kw: k.kw,
      text: diff > 0
        ? t("activityMovedUp", { count: diff, pos: k.pos ?? 0 })
        : t("activityDropped", { count: -diff, pos: k.pos ?? 0 }),
      time: t("activityRecent"),
    }
  })

  const donutValue = totalKeywords ? Math.round((inTop10 / totalKeywords) * 100) : 0
  const selectedProject = projectId ? projects.find((p) => p.id === projectId) ?? null : null

  return (
    <div className="page">
      <div className="page-h">
        <div>
          {/* "Overview" + the project switcher, replacing the old "Welcome back"
              eyebrow/title pair — the page is identified by what it IS, with the
              tracked projects reachable right beside it. */}
          {/* One heading — "Overview: freeserp.com ⌄" — with the switcher inside
              the h1 so it inherits its size and weight and reads as the variable
              half of the title rather than a control sitting next to it.
              Controlled: picking a project FILTERS this page rather than
              navigating away. null = every project. */}
          <h1 style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {/* The colon only earns its place once there's a project after it —
                otherwise the heading reads "Overview:" with nothing following
                while the list loads. */}
            <span>{tNav("overview")}{selectedProject ? ":" : ""}</span>
            <ProjectSwitcher value={projectId} onSelect={setProjectId} />
          </h1>
          {/* No subtitle once a project is selected — the heading already names
              it, and the old "tracking across N projects" line was counting
              projects this page no longer aggregates. Kept only for the error
              and no-projects-yet cases, which still need to say something. */}
          {(error || (loaded && projects.length === 0)) && (
            <div className="sub">
              {error ? <span style={{ color: "var(--neg)" }}>{error}</span> : t("subEmpty")}
            </div>
          )}
        </div>
        <div className="row">
          <div className="pill-toggle">
            {(["24h", "7d", "30d", "90d"] as const).map((r) => (
              <button key={r} className={r === range ? "active" : ""} onClick={() => setRange(r)}>{r}</button>
            ))}
          </div>
          <Link href="/dashboard/projects"><button className="btn primary"><Icon.plus /> {t("newProject")}</button></Link>
        </div>
      </div>

      {/* STAT TILES */}
      <div className="grid g-4" style={{ marginBottom: 14 }}>
        <StatTile
          lbl={t("statKeywordsTracked")}
          val={totalKeywords.toLocaleString()}
          delta={loaded ? t("projectCount", { count: projectId ? 1 : projects.length }) : "—"}
          tip={loaded ? t("acrossProjects", { count: projects.length }) : ""}
        />
        <StatTile
          lbl={t("statAvgPosition")}
          val={avgPos ? avgPos.toFixed(1) : "—"}
          tip={ranked ? t("rankedCount", { count: ranked }) : t("noData")}
        />
        <StatTile
          lbl={t("statEstTraffic")}
          val={estTraffic ? estTraffic.toLocaleString() : "—"}
          delta={estTraffic ? t("modelled") : t("noData")}
          tip={t("trafficTip")}
        />
        <StatTile
          lbl={t("statInTop10")}
          val={inTop10.toString()}
          tip={totalKeywords ? t("inTop10Tip", { percent: Math.round((inTop10 / totalKeywords) * 100), top3: inTop3 }) : t("inTop3Only", { top3: inTop3 })}
        />
      </div>

      <div className="grid g-21" style={{ marginBottom: 14 }}>
        {/* ANALYTICS CHART */}
        <div className="card">
          <div className="card-h">
            <div>
              <div className="t">{t("analytics")}</div>
              <div className="tiny muted" style={{ marginTop: 2 }}>{t("analyticsSub", { range })}</div>
            </div>
            <div className="row tiny muted">
              <span className="row" style={{ gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--brand)" }} />{t("avgPositionLegend")}</span>
            </div>
          </div>
          {rankHistory.length > 0 ? (
            <LineChart data={rankHistory} invert yFormat={(v) => "#" + Math.round(v)} height={240} />
          ) : (
            <div style={{ height: 240, display: "grid", placeItems: "center", color: "var(--text-mute)", fontSize: 13 }}>
              {overview === null ? t("loading") : t("noRankingData")}
            </div>
          )}
        </div>

        {/* PROJECT PROGRESS DONUT */}
        <div className="card">
          <div className="card-h">
            <div className="t">{t("coverage")}</div>
            <button className="icon-btn" style={{ width: 24, height: 24 }} aria-label={t("more")}><Icon.dots /></button>
          </div>
          <Donut value={donutValue} label={t("inTop10")} />
          <Legend
            items={[
              { color: "var(--brand)", label: t("inTop10"), count: inTop10 },
              { color: "var(--bg-inset)", label: t("inTop30"), count: inTop30, dark: true },
              { color: "var(--border-strong)", label: t("outsideTop30"), count: outside30 },
            ]}
          />
        </div>
      </div>

      {/* KEYWORDS TABLE */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="card-h" style={{ padding: "16px 18px", marginBottom: 0, borderBottom: "1px solid var(--border)" }}>
          <div>
            <div className="t">{t("latestMovements")}</div>
            <div className="tiny muted" style={{ marginTop: 2 }}>{t("latestMovementsSub")}</div>
          </div>
          <div className="row">
            <Link href="/dashboard/keywords"><button className="btn sm">{t("viewAll")} <Icon.chevR /></button></Link>
          </div>
        </div>
        {latestMovements.length > 0 ? (
          <KeywordTable
            rows={latestMovements}
            // `latestMovements` is EnrichedRow[] (carries projectId), but the
            // KeywordTable primitive types its callback as plain KeywordRow.
            // Cast back so we can build the project-scoped URL.
            onRow={(k) => {
              const r = k as EnrichedRow
              router.push(`/dashboard/project/${r.projectId}/keywords/${r.id}`)
            }}
          />
        ) : (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
            {loaded ? t("noMovements") : t("loading")}
          </div>
        )}
      </div>

      {activity.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="card">
            <div className="card-h"><div className="t">{t("activity")}</div></div>
            <ActivityFeed items={activity} />
          </div>
        </div>
      )}
    </div>
  )
}
