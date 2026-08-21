"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "@/i18n/navigation"
import { api } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"
import { Flag } from "@/components/flag"
import { Dropdown } from "@/components/dashboard/dropdown"
import { FavoriteButton } from "@/components/dashboard/favorite-button"
import {
  FeatChip,
  PosCell,
  SortHeader,
  SummaryChip,
  serpFeaturesToChips,
  trendToSparkline,
  type KeywordRow,
  type SerpFeatures,
  type MonthlySearch,
} from "@/components/dashboard/primitives"
import { ToolContext } from "@/components/dashboard/tool-context"

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
  device: string | null
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
  trend5: "winning" | "losing" | "neutral"
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
  device: string | null
  traffic: number | null
  status: string | null
  checkedAt: string | null
  trend5: "winning" | "losing" | "neutral"
}

export default function KeywordsListPage() {
  const t = useTranslations("dashKeywords")
  const router = useRouter()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [rows, setRows] = useState<EnrichedRow[]>([])
  const [favKw, setFavKw] = useState<Set<string>>(new Set())
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [filter, setFilter] = useState("")
  const [projectFilter, setProjectFilter] = useState<string>("all")
  const [deviceFilter, setDeviceFilter] = useState<"all" | "desktop" | "mobile">("all")
  const [trendFilter, setTrendFilter] = useState<"all" | "winning" | "losing">("all")
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

        // Cross-reference the user's keyword favorites so each row's star renders
        // in the correct state from first mount. Lightweight and best-effort —
        // an empty set just means every star starts hollow.
        const favPromise = api
          .get<{ favorites: { entity: { id: string } }[] }>("/api/favorites?entityType=keyword")
          .then((r) => new Set((r.favorites ?? []).map((f) => f.entity.id)))
          .catch(() => new Set<string>())

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
              device: k.device,
              traffic: k.monthlyTraffic,
              status: k.status,
              checkedAt: k.checkedAt,
              trend5: k.trend5 ?? "neutral",
            })
          }
        }
        const favSet = await favPromise
        if (cancelled) return
        setFavKw(favSet)
        setRows(acc)
      } catch (e) {
        const msg = e instanceof Error ? e.message : t("errorLoad")
        if (!cancelled) setError(msg)
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [t])

  const filtered = useMemo(() => {
    let out = rows
    if (projectFilter !== "all") out = out.filter((r) => r.projectId === projectFilter)
    if (deviceFilter !== "all") out = out.filter((r) => (r.device ?? "desktop") === deviceFilter)
    if (trendFilter !== "all") out = out.filter((r) => r.trend5 === trendFilter)
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
  }, [rows, filter, projectFilter, deviceFilter, trendFilter, sort])

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
          <h1>
            {loaded ? (
              t("trackedCount", { count: filtered.length })
            ) : (
              <span
                className="skeleton"
                aria-label={t("loadingKeywords")}
                style={{ display: "inline-block", width: 280, height: 28, borderRadius: 8, verticalAlign: "middle" }}
              />
            )}
          </h1>
          <div className="sub">
            {error
              ? <span style={{ color: "var(--neg)" }}>{error}</span>
              : project
                ? t("rankingsForDomain", { domain: project.domain })
                : t("rankingsAllProjects")}
          </div>
        </div>
        <div className="row">
          <button className="btn primary" onClick={() => router.push("/dashboard/projects")}>
            <Icon.plus /> {t("addKeywords")}
          </button>
        </div>
      </div>

      <ToolContext id="keywords" />

      {/* Filter bar */}
      <div className="filter-row">
        <div style={{ position: "relative", width: 260 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", display: "inline-flex", color: "var(--text-mute)" }}><Icon.search /></span>
          <input
            className="input"
            style={{ paddingLeft: 32 }}
            placeholder={t("searchPlaceholder")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <Dropdown
          menuAlign="left"
          value={projectFilter}
          options={[
            { value: "all", label: t("allProjectsCount", { count: projects.length }) },
            ...projects.map((p) => ({ value: p.id, label: p.domain })),
          ]}
          onChange={setProjectFilter}
          ariaLabel={t("allProjectsCount", { count: projects.length })}
        />
        <div className="pill-toggle">
          {(["all", "desktop", "mobile"] as const).map((d) => (
            <button key={d} className={deviceFilter === d ? "active" : ""} onClick={() => setDeviceFilter(d)}>
              {d === "all" ? t("deviceAll") : d === "desktop" ? t("deviceDesktop") : t("deviceMobile")}
            </button>
          ))}
        </div>
        {/* Trend filter pushed to the far right of the bar. */}
        <div className="pill-toggle" style={{ marginLeft: "auto" }}>
          {(["all", "winning", "losing"] as const).map((tr) => (
            <button key={tr} className={trendFilter === tr ? "active" : ""} onClick={() => setTrendFilter(tr)}>
              {tr === "all" ? t("trendAll") : tr === "winning" ? (
                <><Icon.arrowUp /> {t("trendWinning")}</>
              ) : (
                <><Icon.arrowDown /> {t("trendLosing")}</>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Summary chips */}
      {!loaded ? (
        <div className="row" style={{ marginBottom: 14, gap: 10, flexWrap: "wrap" }} aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} className="skeleton" style={{ width: 128, height: 35, borderRadius: 10 }} />
          ))}
        </div>
      ) : (
        <div className="row" style={{ marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
          <SummaryChip lbl={t("chipShowing")} val={filtered.length.toString()} total={rows.length} ofLabel={t("ofTotal", { total: rows.length })} />
          <SummaryChip lbl={t("chipAvgPosition")} val={avgPos ? `#${avgPos.toFixed(1)}` : "—"} />
          <SummaryChip lbl={t("chipTop3")} val={top3.toString()} pct={positions.length ? Math.round((top3 / positions.length) * 100) : 0} />
          <SummaryChip lbl={t("chipTop10")} val={top10.toString()} pct={positions.length ? Math.round((top10 / positions.length) * 100) : 0} />
          <SummaryChip lbl={t("chipEstTraffic")} val={estTraffic.toLocaleString()} />
        </div>
      )}

      {!loaded ? (
        <div className="card" style={{ padding: "8px 16px" }} aria-busy="true" aria-label={t("loadingKeywords")}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="row"
              style={{
                gap: 16,
                padding: "14px 0",
                borderBottom: i < 5 ? "1px solid var(--border)" : "none",
              }}
            >
              <span className="skeleton" style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0 }} />
              <span className="skeleton" style={{ width: "16%", height: 13 }} />
              <span className="skeleton" style={{ width: 44, height: 22, borderRadius: 6, flexShrink: 0 }} />
              <span className="skeleton" style={{ width: "14%", height: 12 }} />
              <span className="skeleton" style={{ width: 56, height: 12, flexShrink: 0 }} />
              <span className="skeleton" style={{ width: "12%", height: 12 }} />
              <span className="skeleton" style={{ flex: 1, height: 12 }} />
            </div>
          ))}
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
            {rows.length === 0 ? t("emptyEyebrowNone") : t("emptyEyebrowNoMatches")}
          </div>
          <div className="b" style={{ fontSize: 18, marginTop: 4 }}>
            {rows.length === 0 ? t("emptyTitleNone") : t("emptyTitleNoMatches")}
          </div>
          <div className="tiny muted" style={{ marginTop: 6, maxWidth: 360, marginLeft: "auto", marginRight: "auto" }}>
            {rows.length === 0
              ? t("emptyBodyNone")
              : t("emptyBodyNoMatches", { count: rows.length })}
          </div>
          <button className="btn primary" style={{ marginTop: 16 }} onClick={() => router.push("/dashboard/projects")}>
            <Icon.plus /> {rows.length === 0 ? t("createProject") : t("manageProjects")}
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th aria-hidden style={{ width: 36 }}></th>
                <SortHeader label={t("colKeyword")} k="kw" sort={sort} onClick={click} />
                <SortHeader label={t("colPosition")} k="pos" sort={sort} onClick={click} />
                <SortHeader label="Δ" k="delta" sort={sort} onClick={click} />
                <th>{t("colRankingUrl")}</th>
                <SortHeader label={t("colVolume")} k="vol" sort={sort} onClick={click} />
                <SortHeader label={t("colTraffic")} k="traffic" sort={sort} onClick={click} />
                <th>{t("colProject")}</th>
                <th>{t("colSerp")}</th>
                <th>{t("colTrend")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/dashboard/project/${r.projectId}/keywords/${r.id}`)}
                  style={{ cursor: "pointer" }}
                >
                  <td onClick={(e) => e.stopPropagation()} style={{ width: 36 }}>
                    <FavoriteButton entityType="keyword" entityId={r.id!} initial={favKw.has(r.id!)} />
                  </td>
                  <td>
                    <div className="kw" title={r.kw}>{r.kw}</div>
                    {(r.location || r.device) && (
                      <div className="row tiny muted" style={{ marginTop: 2, gap: 6, alignItems: "center" }}>
                        {r.location && (
                          <Flag code={r.location} size={14} title={r.location.toUpperCase()} />
                        )}
                        {r.device && (
                          <span className="row" style={{ gap: 3, alignItems: "center" }}>
                            {(r.device === "mobile" ? <Icon.smartphone /> : <Icon.monitor />)}
                            {r.device === "mobile" ? t("deviceMobile") : t("deviceDesktop")}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td>
                    <PosCell
                      position={r.pos}
                      processing={r.status === "PENDING" || r.status === "PROCESSING"}
                      checked={!!r.checkedAt}
                    />
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
        </div>
      )}
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
