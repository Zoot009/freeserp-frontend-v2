"use client"

import { useId, useState } from "react"
import { useTranslations } from "next-intl"
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
  icon,
}: {
  lbl: string
  val: React.ReactNode
  delta?: React.ReactNode
  up?: boolean
  down?: boolean
  tip?: React.ReactNode
  icon?: React.ReactNode
}) {
  const cls = up ? "up" : down ? "down" : "flat"
  return (
    <div className="stat">
      <div className="lbl">{icon}{lbl}</div>
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

// Renders a tracked keyword's position with the three states it can be in:
//   processing  → spinner (takes priority; a stale null must not read as "100+")
//   ranked      → the numeric PosBadge
//   not found   → "{depth}+" — the keyword ranks deeper than the check looked.
//
// The depth is NOT always 100. Free plans crawl to the `trialCheckDepth` admin
// setting, so this used to promise "not found in the top 100" over a 20-result
// scan. `depthSearched` comes from the check itself; when it's absent (rows
// written before the column existed) we fall back to the old wording.
export function PosCell({
  position,
  processing = false,
  checked = true,
  depthSearched = null,
}: {
  position: number | null | undefined
  processing?: boolean
  /** Whether a rank check has actually completed for this keyword. When false
      and there's no position, render "—" (not checked yet) instead of "100+"
      (checked, not in the top 100) — they mean very different things. */
  checked?: boolean
  /** How deep the check that produced this position actually looked. */
  depthSearched?: number | null
}) {
  const t = useTranslations("dashPrimitives")
  if (processing) {
    // A check is in flight (newly added or re-checked keyword). Show a spinner
    // instead of a bare "—" so users can tell the ranking is still loading.
    return (
      <span className="pos-badge" role="status" title={t("processingTitle")} aria-label={t("processingTitle")}>
        <span
          className="spin"
          aria-hidden
          style={{
            display: "block",
            width: 14,
            height: 14,
            borderRadius: "50%",
            border: "2px solid var(--border-strong)",
            borderTopColor: "var(--brand)",
            boxSizing: "border-box",
          }}
        />
      </span>
    )
  }
  if (position != null && Number.isFinite(position)) {
    return <PosBadge pos={position} />
  }
  if (!checked) {
    return (
      <span className="tiny muted" title="Not checked yet">
        —
      </span>
    )
  }
  const depth = depthSearched && depthSearched > 0 ? depthSearched : 100
  return (
    <span
      className="chip"
      title={t("notFoundTitle", { depth })}
    >
      {depth}+
    </span>
  )
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
  fullWidth = false,
}: {
  data: number[]
  w?: number
  h?: number
  color?: string
  invert?: boolean
  // Stretch the line to fill the container width (the `w` becomes only the
  // internal coordinate resolution). Uses preserveAspectRatio="none" so the
  // path spans the full width, with a non-scaling stroke so the line stays
  // crisp at 1.5px regardless of the horizontal stretch.
  fullWidth?: boolean
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
    <svg
      className="spark-svg"
      width={fullWidth ? "100%" : w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio={fullWidth ? "none" : undefined}
      style={fullWidth ? { display: "block" } : undefined}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect={fullWidth ? "non-scaling-stroke" : undefined}
      />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Line chart
// ---------------------------------------------------------------------------

type ChartPoint = { day?: number | string; pos?: number; imp?: number; value?: number }

/**
 * Axis ticks that never repeat a label.
 *
 * A rank axis is integers — there is no position #2.5 — but the old code always
 * cut the domain into four equal parts and rounded each for display. On a
 * keyword sitting at #1 the domain was 1–3, so the ticks came out 1, 1.5, 2,
 * 2.5, 3 and the axis read "#1 #2 #2 #3 #3". Stepping in whole numbers is what
 * fixes that; deduping by the FORMATTED label catches whatever the caller's
 * formatter collapses too.
 */
function axisTicks(min: number, max: number, integerOnly: boolean, target = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return []
  if (min === max) {
    // A flat series still needs a scale to sit in, or the line glues to an edge.
    return integerOnly ? [Math.max(0, min - 1), min, min + 1] : [min - 1, min, min + 1]
  }
  const rawStep = (max - min) / target
  const step = integerOnly ? Math.max(1, Math.round(rawStep)) : rawStep
  const out: number[] = []
  for (let v = min; v <= max + step / 2; v += step) out.push(v)
  return out
}

export function LineChart({
  data,
  height = 240,
  color = "var(--brand)",
  yFormat = (v: number) => `${v}`,
  xFormat,
  invert = false,
  showAxis = true,
  label = "Value",
}: {
  data: ChartPoint[]
  height?: number
  color?: string
  yFormat?: (v: number) => string
  /** Point label for the tooltip; falls back to the point's index. */
  xFormat?: (d: ChartPoint, i: number) => string
  invert?: boolean
  showAxis?: boolean
  /** What the series measures. Named in the tooltip, since one series needs no legend. */
  label?: string
}) {
  // Which point the pointer is nearest. null when it has left the plot.
  const [hover, setHover] = useState<number | null>(null)
  // useId, not Math.random: the gradient id has to match between the server
  // render and the client one, or React discards the markup as a mismatch.
  const gid = "lg" + useId().replace(/:/g, "")

  const w = 760
  const h = height
  const pad = { l: 44, r: 16, t: 14, b: 28 }
  const values = data.map((d) => d.pos ?? d.imp ?? d.value ?? 0)
  if (values.length === 0) return null

  const dataMin = Math.min(...values)
  const dataMax = Math.max(...values)
  const yMin = invert ? Math.max(1, Math.floor(dataMin - 1)) : 0
  const yMax = invert ? Math.ceil(dataMax + 1) : Math.ceil(dataMax * 1.1)
  const range = yMax - yMin || 1
  const cw = w - pad.l - pad.r
  const ch = h - pad.t - pad.b

  const xy = (i: number, v: number): [number, number] => {
    const x = pad.l + (i / (data.length - 1 || 1)) * cw
    const norm = invert ? (v - yMin) / range : 1 - (v - yMin) / range
    return [x, pad.t + norm * ch]
  }

  const pts = data.map((d, i) => xy(i, d.pos ?? d.imp ?? d.value ?? 0))
  const path = pts
    .map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1))
    .join(" ")
  const area = path + ` L ${pts[pts.length - 1]![0]} ${pad.t + ch} L ${pts[0]![0]} ${pad.t + ch} Z`

  // Deduped by rendered label, so no axis can show the same value twice.
  const seen = new Set<string>()
  const ticks = axisTicks(yMin, yMax, invert)
    .map((v) => ({ v, text: yFormat(v) }))
    .filter((t) => (seen.has(t.text) ? false : (seen.add(t.text), true)))

  const yOf = (v: number) => pad.t + (invert ? (v - yMin) / range : 1 - (v - yMin) / range) * ch

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    // Pointer position in viewBox units, since the svg is scaled to its container.
    const x = ((e.clientX - box.left) / box.width) * w
    const step = cw / (data.length - 1 || 1)
    const i = Math.round((x - pad.l) / step)
    setHover(i >= 0 && i < data.length ? i : null)
  }

  const active = hover != null ? pts[hover] : null

  return (
    <div style={{ position: "relative" }}>
      <svg
        width="100%"
        viewBox={`0 0 ${w} ${h}`}
        style={{ display: "block", overflow: "visible" }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={`${label} over ${data.length} checks`}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            {/* Lighter than before: the fill is there to give the line a base,
                not to be the loudest thing on the card. */}
            <stop offset="0%" stopColor={color} stopOpacity="0.14" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {showAxis &&
          ticks.map((t) => {
            const y = yOf(t.v)
            return (
              <g key={t.text}>
                <line
                  x1={pad.l}
                  y1={y}
                  x2={w - pad.r}
                  y2={y}
                  stroke="var(--border)"
                  strokeWidth="1"
                  strokeDasharray="3,3"
                />
                <text
                  x={pad.l - 8}
                  y={y + 4}
                  fontSize="10"
                  textAnchor="end"
                  fill="var(--text-mute)"
                  fontFamily="var(--font-mono)"
                >
                  {t.text}
                </text>
              </g>
            )
          })}

        <path d={area} fill={`url(#${gid})`} />
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Markers only when they can be told apart; past that they merge into
            a thick line and the hover dot does the job instead. */}
        {pts.length < 32 &&
          pts.map((p, i) => (
            <circle
              key={i}
              cx={p[0]}
              cy={p[1]}
              r="4"
              fill="var(--bg)"
              stroke={color}
              strokeWidth="2"
            />
          ))}

        {active && (
          <g pointerEvents="none">
            <line
              x1={active[0]}
              y1={pad.t}
              x2={active[0]}
              y2={pad.t + ch}
              stroke="var(--border-strong)"
              strokeWidth="1"
            />
            <circle cx={active[0]} cy={active[1]} r="5.5" fill={color} stroke="var(--bg)" strokeWidth="2" />
          </g>
        )}
      </svg>

      {/* HTML, not SVG text: it inherits the app's type and tooltip styling
          instead of needing its own box drawn by hand. */}
      {hover != null && active && (
        <div
          style={{
            position: "absolute",
            left: `${(active[0] / w) * 100}%`,
            top: `${(active[1] / h) * 100}%`,
            transform: "translate(-50%, calc(-100% - 12px))",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            background: "var(--text)",
            color: "var(--bg)",
            borderRadius: 6,
            padding: "5px 8px",
            fontSize: 11.5,
            lineHeight: 1.35,
            boxShadow: "var(--shadow-md)",
            zIndex: 2,
          }}
        >
          <div style={{ opacity: 0.7 }}>
            {xFormat ? xFormat(data[hover]!, hover) : `Check ${hover + 1}`}
          </div>
          <div style={{ fontWeight: 700 }}>
            {yFormat(data[hover]!.pos ?? data[hover]!.imp ?? data[hover]!.value ?? 0)}
          </div>
        </div>
      )}
    </div>
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

// One source cited inside an AI Overview.
export type AiOverviewReference = {
  domain: string
  url: string
  title?: string
  /** Publisher label DataForSEO reports, e.g. "RunRepeat". */
  source?: string
}

// Tenant-neutral AI Overview detail (serpFeatures.aiOverviewData).
// NOTE: `references` is always [] on list payloads — the backend trims it for
// wire size and serves the full list from the per-keyword ai-overview endpoint.
// Use refCount/domainCount for counts here, not references.length.
export type AiOverviewData = {
  present: boolean
  /** Google returned an async placeholder: citations are UNKNOWN, not absent. */
  pending?: boolean
  references: AiOverviewReference[]
  refCount: number
  domainCount: number
  expansionDomains?: string[]
  expansionBlocks?: number
}

// Per-project citation verdict. ABSENT means unknown — never render it as
// "not cited"; that's what the four-state aiCitationState() below is for.
export type AiOverviewCitation = {
  cited: boolean
  /** 1-based index into the AI Overview's citation list. */
  citedPosition?: number
  citedUrl?: string
  /** Cited in a nested AI block (product considerations / PAA), not the overview. */
  citedInExpansion?: boolean
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
  aiOverviewData?: AiOverviewData
  aiOverviewCitation?: AiOverviewCitation
}

/**
 * Four states, mirroring the backend's aiCitationState (serp/aiOverview.ts).
 *
 * `unknown` is distinct from `not-cited` on purpose: a check predating this
 * feature, an unresolved async placeholder, or an HTML-fallback check genuinely
 * tells us nothing, and showing "not cited" there would be a lie. `no-overview`
 * is separate too — no AI Overview on the page is not the same as being left
 * out of one.
 */
export type AiCitationState = "cited" | "not-cited" | "no-overview" | "unknown"

export function aiCitationState(sf: SerpFeatures | null | undefined): AiCitationState {
  const data = sf?.aiOverviewData
  if (!data || data.pending) return "unknown"
  if (!data.present) return "no-overview"
  const citation = sf?.aiOverviewCitation
  if (!citation) return "unknown"
  return citation.cited ? "cited" : "not-cited"
}

// One point of the 12-month search-volume history (ProjectKeyword.searchVolumeTrend).
export type MonthlySearch = { year: number; month: number; searchVolume: number }

// Map the backend serpFeatures object onto the chip codes FeatChip renders.
// Ordered most-to-least prominent so the row reads consistently.
export function serpFeaturesToChips(sf: SerpFeatures | null | undefined): string[] {
  if (!sf || typeof sf !== "object") return []
  const out: string[] = []
  // Being cited in the AI Overview is the headline signal, so it gets its own
  // chip. Legacy rows (boolean only, no aiOverviewData) fall through to plain
  // "AI" — unknown citation state, same as before this feature existed.
  if (sf.aiOverview) out.push(aiCitationState(sf) === "cited" ? "AICITED" : "AI")
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
  const t = useTranslations("dashPrimitives")
  const map: Record<string, { label: string; title: string }> = {
    AI: { label: "AI", title: t("feat.AI") },
    AICITED: { label: "AI ✓", title: t("feat.AICITED") },
    FS: { label: "FS", title: t("feat.FS") },
    PAA: { label: "PAA", title: t("feat.PAA") },
    VID: { label: "Vid", title: t("feat.VID") },
    IMG: { label: "Img", title: t("feat.IMG") },
    LOCAL: { label: "Local", title: t("feat.LOCAL") },
    KG: { label: "KG", title: t("feat.KG") },
    SHOP: { label: "Shop", title: t("feat.SHOP") },
    NEWS: { label: "News", title: t("feat.NEWS") },
  }
  const m = map[f] || { label: f, title: f }
  // Cited in the AI Overview is a win, so it reads as a positive chip rather than
  // another neutral outline among six.
  return <span className={f === "AICITED" ? "chip brand" : "chip outline"} title={m.title}>{m.label}</span>
}

/**
 * Clickable sortable table header. Generic over the sort key so every list page
 * can share one implementation — pass your own union as `K` and it stays typed
 * at the call site.
 */
export function SortHeader<K extends string>({
  label,
  k,
  sort,
  onClick,
  width,
}: {
  label: string
  k: K
  sort: { key: string; dir: "asc" | "desc" }
  onClick: (k: K) => void
  width?: number
}) {
  return (
    <th onClick={() => onClick(k)} style={{ cursor: "pointer", userSelect: "none", width }}>
      {label}
      {sort.key === k && (
        <span style={{ color: "var(--brand)", marginLeft: 4 }}>{sort.dir === "asc" ? "↑" : "↓"}</span>
      )}
    </th>
  )
}

/** One "label value" pill in a list page's summary strip. */
export function SummaryChip({
  lbl,
  val,
  total,
  pct,
  ofLabel,
}: {
  lbl: string
  val: string
  total?: number
  pct?: number
  ofLabel?: string
}) {
  return (
    <div className="card tight row" style={{ padding: "8px 14px", flex: "0 0 auto", gap: 8, alignItems: "baseline", whiteSpace: "nowrap" }}>
      <span className="tiny muted">{lbl}</span>
      <span className="b tabular" style={{ fontSize: 15 }}>{val}</span>
      {total != null && <span className="tiny muted">{ofLabel}</span>}
      {pct != null && pct > 0 && <span className="tiny muted">({pct}%)</span>}
    </div>
  )
}

export function KeywordTable({
  rows,
  onRow,
}: {
  rows: KeywordRow[]
  onRow?: (k: KeywordRow) => void
}) {
  const t = useTranslations("dashPrimitives")
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>{t("table.keyword")}</th>
          <th>{t("table.position")}</th>
          <th>Δ</th>
          <th>{t("table.volume")}</th>
          <th>SERP</th>
          <th>{t("table.trend")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((k, i) => (
          <tr key={k.id ?? i} onClick={() => onRow?.(k)} style={{ cursor: onRow ? "pointer" : "default" }}>
            <td>
              <div className="kw" title={k.kw}>{k.kw}</div>
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
