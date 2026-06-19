"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Link, useRouter } from "@/emails/i18n/navigation"
import { api } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"
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
  const router = useRouter()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [keywords, setKeywords] = useState<EnrichedRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<OverviewRange>("7d")
  const [overview, setOverview] = useState<OverviewResponse | null>(null)

  // Real aggregate stats + average-position history across ALL projects, served
  // by GET /api/overview. Refetches whenever the range toggle changes.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await api.get<OverviewResponse>(`/api/overview?range=${range}`)
        if (!cancelled) setOverview(data)
      } catch {
        if (!cancelled) setOverview(null)
      }
    })()
    return () => { cancelled = true }
  }, [range])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await api.get<ProjectSummary[]>("/api/projects")
        if (cancelled) return
        setProjects(list)

        const allKw: EnrichedRow[] = []
        const details = await Promise.all(
          list.slice(0, 3).map((p) => api.get<ProjectDetail>(`/api/projects/${p.id}`).catch(() => null))
        )
        for (const detail of details) {
          if (!detail) continue
          for (const k of detail.keywords) {
            const pos = k.position
            const prev = pos != null && k.d1 != null ? pos + k.d1 : pos
            allKw.push({
              id: k.id,
              kw: k.keyword,
              pos,
              prev,
              vol: k.searchVolume ?? 0,
              url: k.url,
              feat: serpFeaturesToChips(k.serpFeatures),
              trend: trendToSparkline(k.searchVolumeTrend),
              // Carry the parent project's id so a row click can build the
              // project-scoped detail URL (the keyword id alone wouldn't be
              // enough now that the route is /project/[id]/keywords/[kwId]).
              projectId: detail.id,
            })
          }
        }
        if (cancelled) return
        setKeywords(allKw)
      } catch (e) {
        const msg = e instanceof Error ? e.message : t("loadError")
        if (!cancelled) setError(msg)
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [t])

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

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <div className="eyebrow"><span className="spark"><Icon.spark /></span> {t("eyebrow")}</div>
          <h1>{t("title")}</h1>
          <div className="sub">
            {error
              ? <span style={{ color: "var(--neg)" }}>{error}</span>
              : loaded && projects.length === 0
                ? t("subEmpty")
                : t("subTracking", { count: projects.length })}
          </div>
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
          delta={loaded ? t("projectCount", { count: projects.length }) : "—"}
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
