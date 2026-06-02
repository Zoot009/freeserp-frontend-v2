"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"
import {
  FeatChip,
  serpFeaturesToChips,
  trendToSparkline,
  type KeywordRow,
  type SerpFeatures,
  type MonthlySearch,
} from "@/components/dashboard/primitives"

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
  status: string | null
  checkedAt: string | null
  serpFeatures: SerpFeatures | null
  searchVolumeTrend: MonthlySearch[] | null
}

type ProjectDetail = {
  id: string
  name: string
  domain: string
  keywords: Keyword[]
}

type EnrichedRow = KeywordRow & {
  projectId: string
  projectDomain: string
  location: string | null
  traffic: number | null
}

export default function KeywordsListPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [rows, setRows] = useState<EnrichedRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [filter, setFilter] = useState("")
  const [projectFilter, setProjectFilter] = useState<string>("all")
  const [deviceFilter, setDeviceFilter] = useState<"all" | "desktop" | "mobile">("all")
  const [sort, setSort] = useState<{ key: "kw" | "pos" | "vol" | "traffic" | "delta"; dir: "asc" | "desc" }>({
    key: "vol",
    dir: "desc",
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await api.get<ProjectSummary[]>("/api/projects")
        if (cancelled) return
        setProjects(list)

        const details = await Promise.all(
          list.map((p) => api.get<ProjectDetail>(`/api/projects/${p.id}`).catch(() => null))
        )

        const acc: EnrichedRow[] = []
        for (const detail of details) {
          if (!detail) continue
          for (const k of detail.keywords) {
            const pos = k.position
            const prev = pos != null && k.d1 != null ? pos + k.d1 : pos
            acc.push({
              id: k.id,
              kw: k.keyword,
              pos,
              prev,
              vol: k.searchVolume ?? 0,
              url: k.url,
              feat: serpFeaturesToChips(k.serpFeatures),
              trend: trendToSparkline(k.searchVolumeTrend),
              projectId: detail.id,
              projectDomain: detail.domain,
              location: k.location,
              traffic: k.monthlyTraffic,
            })
          }
        }
        if (cancelled) return
        setRows(acc)
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load keywords"
        if (!cancelled) setError(msg)
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    let out = rows
    if (projectFilter !== "all") out = out.filter((r) => r.projectId === projectFilter)
    if (filter.trim()) {
      const needle = filter.toLowerCase()
      out = out.filter((r) => r.kw.toLowerCase().includes(needle))
    }
    out = [...out].sort((a, b) => {
      let av: number
      let bv: number
      if (sort.key === "kw") {
        return sort.dir === "asc" ? a.kw.localeCompare(b.kw) : b.kw.localeCompare(a.kw)
      }
      if (sort.key === "pos") {
        av = a.pos ?? 999
        bv = b.pos ?? 999
      } else if (sort.key === "delta") {
        av = (a.prev ?? a.pos ?? 0) - (a.pos ?? 0)
        bv = (b.prev ?? b.pos ?? 0) - (b.pos ?? 0)
      } else if (sort.key === "traffic") {
        av = a.traffic ?? 0
        bv = b.traffic ?? 0
      } else {
        av = a.vol
        bv = b.vol
      }
      return sort.dir === "asc" ? av - bv : bv - av
    })
    return out
  }, [rows, filter, projectFilter, sort])

  const positions = filtered.map((r) => r.pos).filter((p): p is number => p != null && Number.isFinite(p))
  const avgPos = positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : 0
  const top3 = positions.filter((p) => p <= 3).length
  const top10 = positions.filter((p) => p <= 10).length
  const estTraffic = filtered.reduce((sum, r) => {
    if (r.traffic != null) return sum + r.traffic
    const t = r.pos != null && r.pos <= 30 && r.vol > 0 ? Math.max(0, Math.round(r.vol * (0.32 / r.pos))) : 0
    return sum + t
  }, 0)

  const project = projectFilter === "all" ? null : projects.find((p) => p.id === projectFilter)

  const click = (k: typeof sort.key) =>
    setSort((s) => ({ key: k, dir: s.key === k && s.dir === "desc" ? "asc" : "desc" }))

  return (
    <div className="page">
      <div className="page-h">
        <div style={{ minWidth: 0 }}>
          <div className="crumbs" style={{ marginBottom: 6, fontSize: 12 }}>
            <span>{project ? project.domain : "All projects"}</span>
            <span className="sep">/</span>
            <span className="here">Keywords</span>
          </div>
          <h1>
            {loaded
              ? `${filtered.length} keyword${filtered.length === 1 ? "" : "s"} tracked`
              : "Loading keywords…"}
          </h1>
          <div className="sub">
            {error
              ? <span style={{ color: "var(--neg)" }}>{error}</span>
              : project
                ? `Daily-updated rankings for ${project.domain}`
                : "Daily-updated rankings across all your projects"}
          </div>
        </div>
        <div className="row">
          <button className="btn"><Icon.download /> Export CSV</button>
          <button className="btn primary" onClick={() => router.push("/dashboard/projects")}>
            <Icon.plus /> Add keywords
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-row">
        <div style={{ position: "relative", width: 260 }}>
          <span style={{ position: "absolute", left: 10, top: 9, color: "var(--text-mute)" }}><Icon.search /></span>
          <input
            className="input"
            style={{ paddingLeft: 32 }}
            placeholder="Search keywords…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <select
          className="input"
          style={{ width: "auto", paddingRight: 28 }}
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
        >
          <option value="all">All projects ({projects.length})</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.domain}</option>
          ))}
        </select>
        <div className="pill-toggle">
          {(["all", "desktop", "mobile"] as const).map((d) => (
            <button key={d} className={deviceFilter === d ? "active" : ""} onClick={() => setDeviceFilter(d)}>
              {d === "all" ? "All devices" : d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
        <button className="btn sm" disabled title="More filters coming soon"><Icon.filter /> More filters</button>
      </div>

      {/* Summary chips */}
      <div className="row" style={{ marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
        <SummaryChip lbl="Showing" val={filtered.length.toString()} total={rows.length} />
        <SummaryChip lbl="Avg position" val={avgPos ? `#${avgPos.toFixed(1)}` : "—"} />
        <SummaryChip lbl="Top 3" val={top3.toString()} pct={positions.length ? Math.round((top3 / positions.length) * 100) : 0} />
        <SummaryChip lbl="Top 10" val={top10.toString()} pct={positions.length ? Math.round((top10 / positions.length) * 100) : 0} />
        <SummaryChip lbl="Est. traffic" val={estTraffic.toLocaleString()} />
      </div>

      {!loaded ? (
        <div className="card" style={{ padding: 60, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
          Loading keywords…
        </div>
      ) : filtered.length === 0 ? (
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
            <span className="spark"><Icon.spark /></span>
            {rows.length === 0 ? "NO KEYWORDS YET" : "NO MATCHES"}
          </div>
          <div className="b" style={{ fontSize: 18, marginTop: 4 }}>
            {rows.length === 0 ? "Add your first keyword" : "Try a different filter"}
          </div>
          <div className="tiny muted" style={{ marginTop: 6, maxWidth: 360, marginLeft: "auto", marginRight: "auto" }}>
            {rows.length === 0
              ? "Create a project and add keywords to start tracking daily rankings."
              : `${rows.length} total keyword${rows.length === 1 ? "" : "s"} — adjust the search or project filter to see them.`}
          </div>
          <button className="btn primary" style={{ marginTop: 16 }} onClick={() => router.push("/dashboard/projects")}>
            <Icon.plus /> {rows.length === 0 ? "Create project" : "Manage projects"}
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="tbl">
            <thead>
              <tr>
                <SortHeader label="Keyword" k="kw" sort={sort} onClick={click} />
                <SortHeader label="Position" k="pos" sort={sort} onClick={click} />
                <SortHeader label="Δ" k="delta" sort={sort} onClick={click} />
                <th>Ranking URL</th>
                <SortHeader label="Volume" k="vol" sort={sort} onClick={click} />
                <SortHeader label="Traffic" k="traffic" sort={sort} onClick={click} />
                <th>Project</th>
                <th>SERP</th>
                <th>Trend</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/dashboard/project/${r.projectId}/keywords/${r.id}`)}
                  style={{ cursor: "pointer" }}
                >
                  <td>
                    <div className="kw">{r.kw}</div>
                    {r.location && (
                      <div className="tiny muted mono" style={{ marginTop: 2, textTransform: "uppercase" }}>{r.location}</div>
                    )}
                  </td>
                  <td>
                    {r.pos != null ? (
                      <span className={"pos-badge " + (r.pos <= 3 ? "top3" : r.pos <= 10 ? "top10" : "")}>{r.pos}</span>
                    ) : (
                      <span className="chip" title="Not found in the top 100">100+</span>
                    )}
                  </td>
                  <td>
                    {r.prev != null && r.pos != null && r.prev !== r.pos ? (
                      r.prev > r.pos ? (
                        <span className="delta-cell up"><Icon.arrowUp />{r.prev - r.pos}</span>
                      ) : (
                        <span className="delta-cell down"><Icon.arrowDown />{r.pos - r.prev}</span>
                      )
                    ) : (
                      <span className="delta-cell flat">—</span>
                    )}
                  </td>
                  <td>
                    {r.url ? (
                      <span
                        className="url"
                        style={{ display: "block", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        {r.url.replace(/^https?:\/\//, "")}
                      </span>
                    ) : (
                      <span className="tiny muted">—</span>
                    )}
                  </td>
                  <td className="tabular">{r.vol ? r.vol.toLocaleString() : "—"}</td>
                  <td className="tabular">{r.traffic != null ? r.traffic.toLocaleString() : "—"}</td>
                  <td>
                    <span className="chip">{r.projectDomain}</span>
                  </td>
                  <td>
                    {r.feat && r.feat.length > 0 ? (
                      <div className="row" style={{ gap: 3, flexWrap: "wrap" }}>
                        {r.feat.map((f) => <FeatChip key={f} f={f} />)}
                      </div>
                    ) : (
                      <span className="tiny muted">—</span>
                    )}
                  </td>
                  <td>
                    {r.trend && r.trend.length > 0 ? (
                      <MiniSpark data={r.trend} />
                    ) : (
                      <span className="tiny muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
  k: "kw" | "pos" | "vol" | "traffic" | "delta"
  sort: { key: string; dir: "asc" | "desc" }
  onClick: (k: "kw" | "pos" | "vol" | "traffic" | "delta") => void
}) {
  return (
    <th onClick={() => onClick(k)} style={{ cursor: "pointer", userSelect: "none" }}>
      {label}
      {sort.key === k && (
        <span style={{ color: "var(--brand)", marginLeft: 4 }}>{sort.dir === "asc" ? "↑" : "↓"}</span>
      )}
    </th>
  )
}

function SummaryChip({ lbl, val, total, pct }: { lbl: string; val: string; total?: number; pct?: number }) {
  return (
    <div className="card tight" style={{ padding: "8px 14px", flex: "0 0 auto" }}>
      <div className="tiny muted">{lbl}</div>
      <div className="row" style={{ gap: 6, alignItems: "baseline" }}>
        <span className="b tabular" style={{ fontSize: 16 }}>{val}</span>
        {total != null && <span className="tiny muted">of {total}</span>}
        {pct != null && pct > 0 && <span className="tiny muted">({pct}%)</span>}
      </div>
    </div>
  )
}

// Lightweight inline sparkline so the row doesn't have to round-trip through
// the heavier shared <Sparkline> (and to dodge an extra import).
function MiniSpark({ data }: { data: number[] }) {
  if (!data.length) return null
  const w = 80
  const h = 28
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    // Search-volume history: higher volume renders higher on the chart.
    const y = (1 - (v - min) / range) * (h - 4) + 2
    return [x, y]
  })
  const path = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ")
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <path d={path} fill="none" stroke="var(--brand)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
