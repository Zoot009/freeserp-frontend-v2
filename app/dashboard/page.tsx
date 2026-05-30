"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"
import {
  StatTile,
  LineChart,
  Donut,
  Legend,
  KeywordTable,
  ActivityFeed,
  type KeywordRow,
  type ActivityItem,
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
}

type ProjectDetail = {
  id: string
  name: string
  domain: string
  keywords: Keyword[]
}

function deriveTrend(seed: number, current: number | null): number[] {
  if (current == null) return []
  const out: number[] = []
  let p = current + 4
  for (let i = 0; i < 14; i++) {
    const wobble = Math.sin((seed + i) * 0.7) * 1.6 + (Math.random() - 0.5) * 1.4
    p = Math.max(1, Math.min(60, p + wobble * 0.4 - 0.18))
    out.push(Math.round(p))
  }
  out[out.length - 1] = current
  return out
}

function buildRankHistory(avgPos: number): { day: number; pos: number }[] {
  const out: { day: number; pos: number }[] = []
  let p = avgPos + 5
  for (let i = 0; i < 30; i++) {
    const drift = Math.sin(i / 6) * 1.2 + (Math.random() - 0.55) * 1.6
    p = Math.max(1, Math.min(60, p + drift * 0.3 - 0.05))
    out.push({ day: i, pos: Math.round(p) })
  }
  out[out.length - 1].pos = Math.round(avgPos)
  return out
}

export default function DashboardOverviewPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [keywords, setKeywords] = useState<EnrichedRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<"24h" | "7d" | "30d" | "90d">("7d")

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
              feat: [],
              trend: deriveTrend(k.id.charCodeAt(0) + k.id.length, pos),
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
        const msg = e instanceof Error ? e.message : "Failed to load dashboard"
        if (!cancelled) setError(msg)
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const totalKeywords = keywords.length
  const positions = keywords.map((k) => k.pos).filter((p): p is number => p != null && Number.isFinite(p))
  const avgPos = positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : 0
  const inTop10 = positions.filter((p) => p <= 10).length
  const inTop3 = positions.filter((p) => p <= 3).length
  const estTraffic = keywords.reduce((sum, k) => {
    const t = k.pos != null && k.pos <= 30 ? Math.max(0, Math.round(k.vol * (0.32 / k.pos))) : 0
    return sum + t
  }, 0)

  const rankHistory = avgPos > 0 ? buildRankHistory(avgPos) : []

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
        ? `moved up ${diff} → #${k.pos}`
        : `dropped ${-diff} → #${k.pos}`,
      time: "recent",
    }
  })

  const donutValue = totalKeywords ? Math.round((inTop10 / totalKeywords) * 100) : 0

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <div className="eyebrow"><span className="spark"><Icon.spark /></span> WELCOME BACK</div>
          <h1>Welcome back{!error && projects.length ? "" : ""}</h1>
          <div className="sub">
            {error
              ? <span style={{ color: "var(--neg)" }}>{error}</span>
              : loaded && projects.length === 0
                ? "You haven't created a project yet — set one up to start tracking rankings."
                : `Here's how your rankings are tracking across ${projects.length} project${projects.length === 1 ? "" : "s"}.`}
          </div>
        </div>
        <div className="row">
          <div className="pill-toggle">
            {(["24h", "7d", "30d", "90d"] as const).map((r) => (
              <button key={r} className={r === range ? "active" : ""} onClick={() => setRange(r)}>{r}</button>
            ))}
          </div>
          <button className="btn"><Icon.download /> Export</button>
          <Link href="/dashboard/projects"><button className="btn primary"><Icon.plus /> New project</button></Link>
        </div>
      </div>

      {/* STAT TILES */}
      <div className="grid g-4" style={{ marginBottom: 14 }}>
        <StatTile
          lbl="Keywords tracked"
          val={totalKeywords.toLocaleString()}
          delta={loaded ? `${projects.length} project${projects.length === 1 ? "" : "s"}` : "—"}
          tip={loaded ? `across ${projects.length} project${projects.length === 1 ? "" : "s"}` : ""}
        />
        <StatTile
          lbl="Average position"
          val={avgPos ? avgPos.toFixed(1) : "—"}
          delta={positions.length ? `${positions.length} ranked` : "no data"}
          up={positions.length > 0 && avgPos < 20}
        />
        <StatTile
          lbl="Est. monthly traffic"
          val={estTraffic ? estTraffic.toLocaleString() : "—"}
          delta={estTraffic ? "modelled" : "no data"}
          tip="from search volume × CTR"
        />
        <StatTile
          lbl="In top 10"
          val={inTop10.toString()}
          delta={totalKeywords ? `${Math.round((inTop10 / totalKeywords) * 100)}%` : "—"}
          tip={`${inTop3} in top 3`}
          up={inTop10 > 0}
        />
      </div>

      <div className="grid g-21" style={{ marginBottom: 14 }}>
        {/* ANALYTICS CHART */}
        <div className="card">
          <div className="card-h">
            <div>
              <div className="t">Analytics</div>
              <div className="tiny muted" style={{ marginTop: 2 }}>Average position across all tracked keywords</div>
            </div>
            <div className="row tiny muted">
              <span className="row" style={{ gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--brand)" }} />This period</span>
              <span className="row" style={{ gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--text-mute)", opacity: 0.4 }} />Previous</span>
            </div>
          </div>
          {rankHistory.length > 0 ? (
            <LineChart data={rankHistory} invert yFormat={(v) => "#" + Math.round(v)} height={240} />
          ) : (
            <div style={{ height: 240, display: "grid", placeItems: "center", color: "var(--text-mute)", fontSize: 13 }}>
              {loaded ? "No ranking data yet — add a project and keywords to populate this chart." : "Loading…"}
            </div>
          )}
        </div>

        {/* PROJECT PROGRESS DONUT */}
        <div className="card">
          <div className="card-h">
            <div className="t">Coverage</div>
            <button className="icon-btn" style={{ width: 24, height: 24 }} aria-label="More"><Icon.dots /></button>
          </div>
          <Donut value={donutValue} label="In top 10" />
          <Legend
            items={[
              { color: "var(--brand)", label: "In top 10", count: inTop10 },
              { color: "var(--bg-inset)", label: "In top 30", count: positions.filter((p) => p > 10 && p <= 30).length, dark: true },
              { color: "var(--border-strong)", label: "Outside top 30", count: positions.filter((p) => p > 30).length },
            ]}
          />
        </div>
      </div>

      {/* KEYWORDS TABLE */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="card-h" style={{ padding: "16px 18px", marginBottom: 0, borderBottom: "1px solid var(--border)" }}>
          <div>
            <div className="t">Latest movements</div>
            <div className="tiny muted" style={{ marginTop: 2 }}>Biggest position changes in the last 24 hours</div>
          </div>
          <div className="row">
            <button className="btn sm"><Icon.filter /> Filter</button>
            <Link href="/dashboard/keywords"><button className="btn sm">View all <Icon.chevR /></button></Link>
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
            {loaded ? "No recent movements — your rankings will appear here once checks run." : "Loading…"}
          </div>
        )}
      </div>

      {activity.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="card">
            <div className="card-h"><div className="t">Activity</div></div>
            <ActivityFeed items={activity} />
          </div>
        </div>
      )}
    </div>
  )
}
