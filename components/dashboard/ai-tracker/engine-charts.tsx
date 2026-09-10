"use client"

/**
 * Charts for the engine pages, drawn in `var(--accent)` so the same component
 * reads as four different charts.
 *
 * WHY NOT `Sparkline` FROM primitives.tsx
 * That one normalises to the data's own min and max, which is right for a rank
 * (where the interesting range is wherever the line happens to live) and wrong
 * for a rate: it stretches 40% → 42% into a dramatic climb and flattens 10% →
 * 90% if a third point sits outside. A mention rate has a real, fixed domain —
 * nought to one — and a chart of it has to use that domain or it lies.
 */

/** Six runs in 64×22. Too small for an axis, which is the point. */
export function RateSparkline({ data, w = 64, h = 22 }: { data: number[]; w?: number; h?: number }) {
  // One point is a dot, not a trend. Say nothing rather than draw a flat line
  // that implies we watched it hold steady.
  if (!data || data.length < 2) return <span className="tiny muted">—</span>

  const p = 3
  const x = (i: number) => p + (i / (data.length - 1)) * (w - p * 2)
  const y = (v: number) => p + (1 - Math.min(1, Math.max(0, v))) * (h - p * 2)
  const pts = data.map((v, i) => [x(i), y(v)] as const)
  const d = pts.map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(" ")
  const last = pts[pts.length - 1]!
  const end = Math.round(data[data.length - 1]! * 100)

  return (
    <span className="llm-spark">
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`Mention rate over the last ${data.length} runs, ending at ${end}%`}
      >
        <path
          d={`${d} L ${last[0].toFixed(1)} ${h - p} L ${pts[0]![0].toFixed(1)} ${h - p} Z`}
          fill="var(--accent)"
          opacity=".10"
        />
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r="2" fill="var(--accent)" />
      </svg>
    </span>
  )
}

/**
 * The assistant's own average over time.
 *
 * Labelled 0/50/100 rather than left bare: without them the filled area reads as
 * a solid block and a viewer cannot tell 20% from 80%.
 */
export function EngineTrend({ data }: { data: number[] }) {
  if (!data || data.length < 2) return null

  const W = 720
  const H = 96
  const pad = { l: 30, r: 8, t: 8, b: 6 }
  const cw = W - pad.l - pad.r
  const ch = H - pad.t - pad.b
  const x = (i: number) => pad.l + (i / (data.length - 1)) * cw
  const y = (v: number) => pad.t + (1 - Math.min(1, Math.max(0, v))) * ch
  const pts = data.map((v, i) => [x(i), y(v)] as const)
  const d = pts.map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(" ")
  const last = pts[pts.length - 1]!

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ display: "block", width: "100%", height: "auto" }}
      role="img"
      aria-label={`Average mention rate across the last ${data.length} runs`}
    >
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t).toFixed(1)} y2={y(t).toFixed(1)} stroke="var(--border)" />
          <text
            x={pad.l - 6}
            y={(y(t) + 3.5).toFixed(1)}
            textAnchor="end"
            fill="var(--text-mute)"
            fontSize="9"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {t * 100}%
          </text>
        </g>
      ))}
      <path
        d={`${d} L ${last[0].toFixed(1)} ${y(0)} L ${pts[0]![0].toFixed(1)} ${y(0)} Z`}
        fill="var(--accent)"
        opacity=".07"
      />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r="3.5" fill="var(--accent)" />
    </svg>
  )
}
