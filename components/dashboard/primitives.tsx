"use client"

import { Icon } from "./icons"

// ---------------------------------------------------------------------------
// Stat tile
// ---------------------------------------------------------------------------

export function StatTile({
  lbl,
  val,
  delta,
  up,
  down,
  tip,
}: {
  lbl: string
  val: React.ReactNode
  delta?: React.ReactNode
  up?: boolean
  down?: boolean
  tip?: React.ReactNode
}) {
  const cls = up ? "up" : down ? "down" : "flat"
  return (
    <div className="stat">
      <div className="lbl">{lbl}</div>
      <div className="val tabular">{val}</div>
      {(delta || tip) && (
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          {delta != null && (
            <span className={"delta " + cls}>
              {up && <Icon.arrowUp />}
              {down && <Icon.arrowDown />}
              {delta}
            </span>
          )}
          {tip && <span className="tiny muted">{tip}</span>}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Position badge / delta cell / chips
// ---------------------------------------------------------------------------

export function PosBadge({ pos }: { pos: number | null | undefined }) {
  if (pos == null || !Number.isFinite(pos)) {
    return <span className="pos-badge" style={{ color: "var(--text-mute)" }}>—</span>
  }
  const cls = pos <= 3 ? "top3" : pos <= 10 ? "top10" : ""
  return <span className={"pos-badge " + cls}>{pos}</span>
}

export function DeltaCell({ from, to }: { from: number | null | undefined; to: number | null | undefined }) {
  if (from == null || to == null) return <span className="delta-cell flat">—</span>
  const diff = from - to
  if (diff === 0) return <span className="delta-cell flat">—</span>
  if (diff > 0) return <span className="delta-cell up"><Icon.arrowUp />{diff}</span>
  return <span className="delta-cell down"><Icon.arrowDown />{-diff}</span>
}

// ---------------------------------------------------------------------------
// Sparkline
// ---------------------------------------------------------------------------

export function Sparkline({
  data,
  w = 80,
  h = 28,
  color = "var(--brand)",
  invert = false,
}: {
  data: number[]
  w?: number
  h?: number
  color?: string
  invert?: boolean
}) {
  if (!data || data.length === 0) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const norm = invert ? (v - min) / range : 1 - (v - min) / range
    const y = norm * (h - 4) + 2
    return [x, y] as const
  })
  const path = pts
    .map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1))
    .join(" ")
  const area = path + ` L ${w} ${h} L 0 ${h} Z`
  const gid = "sg" + Math.random().toString(36).slice(2, 8)
  return (
    <svg className="spark-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Line chart
// ---------------------------------------------------------------------------

type ChartPoint = { day?: number | string; pos?: number; imp?: number; value?: number }

export function LineChart({
  data,
  height = 240,
  color = "var(--brand)",
  yFormat = (v: number) => `${v}`,
  invert = false,
  showAxis = true,
}: {
  data: ChartPoint[]
  height?: number
  color?: string
  yFormat?: (v: number) => string
  invert?: boolean
  showAxis?: boolean
}) {
  const w = 760
  const h = height
  const pad = { l: 44, r: 16, t: 14, b: 28 }
  const values = data.map((d) => d.pos ?? d.imp ?? d.value ?? 0)
  if (values.length === 0) return null
  const dataMin = Math.min(...values)
  const dataMax = Math.max(...values)
  const yMin = invert ? Math.max(1, Math.floor(dataMin - 2)) : 0
  const yMax = invert ? Math.ceil(dataMax + 2) : Math.ceil(dataMax * 1.1)
  const range = yMax - yMin || 1
  const cw = w - pad.l - pad.r
  const ch = h - pad.t - pad.b

  const xy = (i: number, v: number): [number, number] => {
    const x = pad.l + (i / (data.length - 1 || 1)) * cw
    const norm = invert ? (v - yMin) / range : 1 - (v - yMin) / range
    const y = pad.t + norm * ch
    return [x, y]
  }

  const pts = data.map((d, i) => xy(i, d.pos ?? d.imp ?? d.value ?? 0))
  const path = pts
    .map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1))
    .join(" ")
  const area = path + ` L ${pts[pts.length - 1][0]} ${pad.t + ch} L ${pts[0][0]} ${pad.t + ch} Z`
  const ySteps = 4
  const yTicks = Array.from({ length: ySteps + 1 }, (_, i) => yMin + (range * i) / ySteps)
  const gid = "lg" + Math.random().toString(36).slice(2, 8)

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {showAxis &&
        yTicks.map((_, i) => {
          const y = pad.t + (i / ySteps) * ch
          return (
            <g key={i}>
              <line x1={pad.l} y1={y} x2={w - pad.r} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray={i === ySteps ? "0" : "3,3"} />
              <text x={pad.l - 8} y={y + 4} fontSize="10" textAnchor="end" fill="var(--text-mute)" fontFamily="var(--font-mono)">
                {invert ? yFormat(yMin + (range * i) / ySteps) : yFormat(yMax - (range * i) / ySteps)}
              </text>
            </g>
          )
        })}
      <path d={area} fill={`url(#${gid})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.length < 32 &&
        pts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="var(--bg)" stroke={color} strokeWidth="1.5" />
        ))}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Donut + Legend
// ---------------------------------------------------------------------------

export function Donut({ value, label }: { value: number; label: string }) {
  const r = 56
  const c = 2 * Math.PI * r
  const offset = c - (value / 100) * c
  return (
    <div className="donut-wrap" style={{ justifyContent: "center", flexDirection: "column", padding: "12px 0" }}>
      <div className="donut">
        <svg width="140" height="140" viewBox="0 0 140 140">
          <circle cx="70" cy="70" r={r} fill="none" stroke="var(--bg-inset)" strokeWidth="14" />
          <circle
            cx="70" cy="70" r={r}
            fill="none" stroke="var(--brand)" strokeWidth="14"
            strokeDasharray={c} strokeDashoffset={offset}
            transform="rotate(-90 70 70)" strokeLinecap="round"
          />
        </svg>
        <div className="ctr">
          <div>
            <div className="pct">{value}%</div>
            <div className="lbl">{label}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Legend({ items }: { items: { color: string; label: string; count: number | string; dark?: boolean }[] }) {
  return (
    <div className="legend" style={{ marginTop: 14 }}>
      {items.map((it, i) => (
        <div key={i} className="row">
          <span className="sw" style={{ background: it.color, border: it.dark ? "1px solid var(--border-strong)" : "none" }} />
          <span className="soft">{it.label}</span>
          <span className="ct">{it.count}</span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Activity feed
// ---------------------------------------------------------------------------

export type ActivityItem = {
  type: "rank-up" | "rank-down" | "feature" | "competitor" | "alert" | string
  kw: string
  text: string
  time: string
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const iconFor = (t: string) => {
    if (t === "rank-up") return <span style={{ color: "var(--pos)" }}><Icon.arrowUp /></span>
    if (t === "rank-down") return <span style={{ color: "var(--neg)" }}><Icon.arrowDown /></span>
    if (t === "feature") return <span style={{ color: "var(--brand)" }}><Icon.ai /></span>
    if (t === "competitor") return <span style={{ color: "var(--warn)" }}><Icon.users /></span>
    if (t === "alert") return <span style={{ color: "var(--neg)" }}><Icon.bell /></span>
    return <Icon.spark />
  }
  return (
    <div className="col" style={{ gap: 0 }}>
      {items.map((a, i) => (
        <div key={i} className="row" style={{ padding: "10px 0", borderBottom: i < items.length - 1 ? "1px solid var(--border)" : "none", alignItems: "flex-start" }}>
          <span style={{ width: 24, height: 24, borderRadius: 6, background: "var(--bg-inset)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            {iconFor(a.type)}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sm"><span className="b">{a.kw}</span> <span className="muted">{a.text}</span></div>
            <div className="tiny muted" style={{ marginTop: 2 }}>{a.time}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Keyword table
// ---------------------------------------------------------------------------

export type KeywordRow = {
  id?: string
  kw: string
  pos: number | null
  prev: number | null
  vol: number
  url?: string | null
  feat?: string[]
  trend?: number[]
}

// Backend SERP-feature flags (ProjectRankCheck.serpFeatures), as surfaced by the
// projects API. All optional — only the features Google showed are present.
export type SerpFeatures = {
  featuredSnippet?: unknown
  peopleAlsoAsk?: unknown[]
  knowledgeGraph?: unknown
  relatedSearches?: unknown[]
  localPack?: boolean
  imagePack?: boolean
  videoPack?: boolean
  aiOverview?: boolean
}

// One point of the 12-month search-volume history (ProjectKeyword.searchVolumeTrend).
export type MonthlySearch = { year: number; month: number; searchVolume: number }

// Map the backend serpFeatures object onto the chip codes FeatChip renders.
// Ordered most-to-least prominent so the row reads consistently.
export function serpFeaturesToChips(sf: SerpFeatures | null | undefined): string[] {
  if (!sf || typeof sf !== "object") return []
  const out: string[] = []
  if (sf.aiOverview) out.push("AI")
  if (sf.featuredSnippet) out.push("FS")
  if (Array.isArray(sf.peopleAlsoAsk) && sf.peopleAlsoAsk.length) out.push("PAA")
  if (sf.videoPack) out.push("VID")
  if (sf.imagePack) out.push("IMG")
  if (sf.localPack) out.push("LOCAL")
  if (sf.knowledgeGraph) out.push("KG")
  return out
}

// Flatten searchVolumeTrend rows to the plain number[] a Sparkline consumes.
// Returns [] for missing/empty/malformed input so callers render the dash.
export function trendToSparkline(trend: MonthlySearch[] | null | undefined): number[] {
  if (!Array.isArray(trend)) return []
  return trend
    .filter((p) => p && typeof p.searchVolume === "number")
    .map((p) => p.searchVolume)
}

export function FeatChip({ f }: { f: string }) {
  const map: Record<string, { label: string; title: string }> = {
    AI: { label: "AI", title: "AI Overview" },
    FS: { label: "FS", title: "Featured snippet" },
    PAA: { label: "PAA", title: "People also ask" },
    VID: { label: "Vid", title: "Video carousel" },
    IMG: { label: "Img", title: "Image pack" },
    LOCAL: { label: "Local", title: "Local pack" },
    KG: { label: "KG", title: "Knowledge graph" },
    SHOP: { label: "Shop", title: "Shopping" },
    NEWS: { label: "News", title: "News" },
  }
  const m = map[f] || { label: f, title: f }
  return <span className="chip outline" title={m.title}>{m.label}</span>
}

export function KeywordTable({
  rows,
  onRow,
}: {
  rows: KeywordRow[]
  onRow?: (k: KeywordRow) => void
}) {
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Keyword</th>
          <th>Position</th>
          <th>Δ</th>
          <th>Volume</th>
          <th>SERP</th>
          <th>Trend</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((k, i) => (
          <tr key={k.id ?? i} onClick={() => onRow?.(k)} style={{ cursor: onRow ? "pointer" : "default" }}>
            <td>
              <div className="kw">{k.kw}</div>
              {k.url && <div className="tiny muted mono" style={{ marginTop: 2 }}>{k.url}</div>}
            </td>
            <td><PosBadge pos={k.pos ?? undefined} /></td>
            <td><DeltaCell from={k.prev} to={k.pos} /></td>
            <td className="tabular">{k.vol?.toLocaleString?.() ?? "—"}</td>
            <td>
              <div className="row" style={{ gap: 3 }}>
                {(k.feat || []).map((f) => <FeatChip key={f} f={f} />)}
              </div>
            </td>
            <td>
              {k.trend && k.trend.length > 0 ? (
                // Search-volume history — higher is up, so no invert (unlike a
                // position trend, where a lower number is better).
                <Sparkline data={k.trend} />
              ) : <span className="tiny muted">—</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
