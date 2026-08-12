"use client"

import type { CompetitorLeaderboard, DistanceUnit } from "./types"

function formatDistance(meters: number | null, unit: DistanceUnit): string {
  if (meters == null) return "—"
  const value = unit === "IMPERIAL" ? meters / 1609.344 : meters / 1000
  return `${value.toFixed(2)} ${unit === "IMPERIAL" ? "mi" : "km"}`
}

function InsightCard({
  accent,
  title,
  subtitle,
  children,
}: {
  accent: string
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div
      className="card"
      style={{
        borderLeft: `4px solid ${accent}`,
        flex: "1 1 280px",
        minWidth: 260,
        padding: 20,
      }}
    >
      <div className="b" style={{ fontSize: 15 }}>{title}</div>
      <div className="tiny muted" style={{ marginTop: 3, marginBottom: 18, lineHeight: 1.4 }}>{subtitle}</div>
      {children}
    </div>
  )
}

// Grid, not flex-space-between — each stat keeps its own column so a long
// label/value never collides with its sibling, at any card width.
function StatPair({
  leftLabel,
  leftValue,
  leftColor,
  rightLabel,
  rightValue,
}: {
  leftLabel: string
  leftValue: string
  leftColor: string
  rightLabel: string
  rightValue: string
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
      <div>
        <div className="tiny muted" style={{ marginBottom: 5 }}>{leftLabel}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: leftColor, lineHeight: 1.2 }}>{leftValue}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div className="tiny muted" style={{ marginBottom: 5 }}>{rightLabel}</div>
        <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>{rightValue}</div>
      </div>
    </div>
  )
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div style={{ height: 8, borderRadius: 999, background: "var(--bg-inset)", overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 999, transition: "width 0.3s ease" }} />
    </div>
  )
}

export function MetricInsights({ leaderboard, unit }: { leaderboard: CompetitorLeaderboard; unit: DistanceUnit }) {
  const { insights } = leaderboard
  const yourSolv = insights.yourSolv ?? 0
  const topSolv = insights.topSolv ?? 0

  const distanceDeltaMeters =
    insights.yourTop3DistanceMeters != null && insights.marketAverageTop3DistanceMeters != null
      ? insights.yourTop3DistanceMeters - insights.marketAverageTop3DistanceMeters
      : null
  const activePercent = insights.totalCompetitors > 0 ? (insights.activeCompetitors / insights.totalCompetitors) * 100 : 0
  const notMeasurablePercent = insights.totalCompetitors > 0 ? 100 - activePercent : 0

  return (
    <section style={{ marginTop: 44, marginBottom: 36 }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div className="b" style={{ fontSize: 18 }}>Metric Insights</div>
        <div className="tiny muted" style={{ marginTop: 2 }}>Based on competitive analysis</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        <InsightCard accent="#16A34A" title="OSoLV" subtitle="Potential for SoLV improvement">
          <StatPair
            leftLabel="Your SoLV"
            leftValue={yourSolv.toFixed(2)}
            leftColor="#16A34A"
            rightLabel="Top SoLV"
            rightValue={topSolv.toFixed(2)}
          />
          <ProgressBar value={yourSolv} max={100} color="#16A34A" />
          <div className="tiny" style={{ marginTop: 10, color: "#16A34A", lineHeight: 1.4 }}>
            {insights.isMarketLeader
              ? "You are the market leader"
              : `${(topSolv - yourSolv).toFixed(2)} points behind the leader`}
          </div>
        </InsightCard>

        <InsightCard accent="#3B82F6" title="SoLV Distance" subtitle="Your distance visibility vs market">
          <StatPair
            leftLabel="Your Distance"
            leftValue={formatDistance(insights.yourTop3DistanceMeters, unit)}
            leftColor="#3B82F6"
            rightLabel="Average Distance"
            rightValue={formatDistance(insights.marketAverageTop3DistanceMeters, unit)}
          />
          <ProgressBar
            value={insights.yourTop3DistanceMeters ?? 0}
            max={Math.max(insights.yourTop3DistanceMeters ?? 0, insights.marketAverageTop3DistanceMeters ?? 0, 1)}
            color="#3B82F6"
          />
          <div className="tiny muted" style={{ marginTop: 10, lineHeight: 1.4 }}>
            {distanceDeltaMeters == null ? (
              "Not enough top-3 data to compare"
            ) : (
              <>
                You are <strong style={{ color: "#3B82F6" }}>{formatDistance(Math.abs(distanceDeltaMeters), unit)}</strong>{" "}
                {distanceDeltaMeters <= 0 ? "below" : "above"} the market average
              </>
            )}
          </div>
        </InsightCard>

        <InsightCard accent="#DC2626" title="Competitors" subtitle="Active competitors in market">
          <StatPair
            leftLabel="Total Competitors"
            leftValue={String(insights.totalCompetitors)}
            leftColor="var(--text)"
            rightLabel="with SoLV > 0"
            rightValue={String(insights.activeCompetitors)}
          />
          <ProgressBar value={insights.activeCompetitors} max={Math.max(insights.totalCompetitors, 1)} color="#DC2626" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", marginTop: 8 }}>
            <span className="tiny" style={{ color: "#DC2626" }}>Active</span>
            <span className="tiny muted" style={{ textAlign: "right" }}>Total Competitors</span>
          </div>
          <div className="tiny" style={{ color: "#DC2626", marginTop: 6, lineHeight: 1.4 }}>
            {notMeasurablePercent.toFixed(2)}% have no measurable SoLV
          </div>
        </InsightCard>
      </div>
    </section>
  )
}
