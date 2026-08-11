"use client"

import { useEffect, useState } from "react"
import { api, ApiError } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"
import { rankColor } from "./grid"
import type { Scan, ScanKeyword, PointDetail } from "./types"

function MetricTile({ label, value, caption, tooltip }: { label: string; value: string; caption: string; tooltip: string }) {
  return (
    <div className="stat" title={tooltip}>
      <div className="lbl">{label}</div>
      <div className="val tabular">{value}</div>
      <div className="tiny muted" style={{ marginTop: 4 }}>{caption}</div>
    </div>
  )
}

function DistributionBar({ points }: { points: { status: string; rank: number | null }[] }) {
  const bands = [
    { key: "top3", label: "Top 3", test: (r: number | null) => r != null && r <= 3, color: "#16A34A" },
    { key: "top7", label: "4-7", test: (r: number | null) => r != null && r > 3 && r <= 7, color: "#84CC16" },
    { key: "top10", label: "8-10", test: (r: number | null) => r != null && r > 7 && r <= 10, color: "#EAB308" },
    { key: "top15", label: "11-15", test: (r: number | null) => r != null && r > 10 && r <= 15, color: "#F97316" },
    { key: "top20", label: "16-20", test: (r: number | null) => r != null && r > 15, color: "#DC2626" },
    { key: "none", label: "Not found", test: (r: number | null) => r == null, color: "#7F1D1D" },
  ]
  const succeeded = points.filter((p) => p.status === "SUCCEEDED")
  const total = succeeded.length || 1
  const counts = bands.map((b) => ({ ...b, count: succeeded.filter((p) => b.test(p.rank)).length }))

  return (
    <div>
      <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden" }}>
        {counts.map((b) => (
          <div key={b.key} style={{ width: `${(b.count / total) * 100}%`, background: b.color }} title={`${b.label}: ${b.count}`} />
        ))}
      </div>
      <div className="row" style={{ gap: 12, flexWrap: "wrap", marginTop: 8 }}>
        {counts.map((b) => (
          <span key={b.key} className="tiny muted row" style={{ gap: 4, alignItems: "center" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: b.color, display: "inline-block" }} />
            {b.label} ({b.count})
          </span>
        ))}
      </div>
    </div>
  )
}

export function PointDrawer({ scanId, pointId, onClose }: { scanId: string; pointId: string; onClose: () => void }) {
  const [point, setPoint] = useState<PointDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setPoint(null)
    setError(null)
    api
      .get<{ point: PointDetail }>(`/api/maps-tracker/scans/${scanId}/points/${pointId}`)
      .then(({ point }) => {
        if (!cancelled) setPoint(point)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Couldn't load this point.")
      })
    return () => {
      cancelled = true
    }
  }, [scanId, pointId])

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-h">
          <div className="b" style={{ fontSize: 16 }}>Grid point detail</div>
          <button onClick={onClose} className="icon-btn" aria-label="Close"><Icon.close /></button>
        </div>
        <div className="modal-b">
          {error && <div className="tiny" style={{ color: "var(--neg)" }}>{error}</div>}
          {!point && !error && <div className="tiny muted">Loading…</div>}
          {point && (
            <>
              <div className="row" style={{ gap: 16, marginBottom: 14 }}>
                <div>
                  <div className="tiny muted">Distance from center</div>
                  <div className="b">{point.distanceFromCenterMeters}m · {point.bearingFromCenter}</div>
                </div>
                <div>
                  <div className="tiny muted">Your rank here</div>
                  <div className="b">{point.rank != null ? `#${point.rank}` : "Not found"}</div>
                </div>
                {point.matchConfidence === "FUZZY" && (
                  <div>
                    <div className="tiny muted">Match</div>
                    <div className="tiny" style={{ color: "var(--warn)" }}>Matched by name</div>
                  </div>
                )}
              </div>
              {!point.topResults || point.topResults.length === 0 ? (
                <div className="tiny muted">No results captured at this point.</div>
              ) : (
                <ol style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 360, overflowY: "auto" }} data-lenis-prevent>
                  {point.topResults.map((r) => {
                    const isTarget = r.rankAbsolute === point.rank
                    return (
                      <li
                        key={r.rankAbsolute}
                        className="row"
                        style={{
                          gap: 10,
                          padding: "8px 0",
                          borderBottom: "1px solid var(--border)",
                          background: isTarget ? "var(--pos-soft)" : undefined,
                        }}
                      >
                        <span className={"pos-badge " + (r.rankAbsolute <= 3 ? "top3" : r.rankAbsolute <= 10 ? "top10" : "")}>
                          {r.rankAbsolute}
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="row" style={{ gap: 6, alignItems: "center" }}>
                            <span className="b" style={{ fontSize: 13 }}>{r.title}</span>
                            {isTarget && <span className="chip">You</span>}
                            {r.isAd && <span className="chip outline">Ad</span>}
                          </div>
                          <div className="tiny muted">
                            {r.category ?? "—"}
                            {r.rating != null && ` · ${r.rating}★ (${r.ratingCount ?? 0})`}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function AiReportPanel({ scan }: { scan: Scan }) {
  const report = scan.aiReport
  if (!scan.aiAnalysisRequested) return null
  if (!report || report.status === "PENDING" || report.status === "GENERATING") {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <span className="spin"><Icon.refresh /></span>
          <span className="tiny muted">Generating AI analysis…</span>
        </div>
      </div>
    )
  }
  if (report.status === "FAILED" || !report.content) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <div className="tiny muted">AI analysis couldn't be generated for this scan.</div>
      </div>
    )
  }
  const c = report.content
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="row" style={{ gap: 6, alignItems: "center" }}>
          <Icon.ai />
          <span className="b">AI analysis</span>
        </div>
        {c.confidence === "LOW" && (
          <span className="chip outline" style={{ color: "var(--warn)" }} title={c.confidenceReason}>
            Low confidence
          </span>
        )}
      </div>
      <p className="tiny" style={{ marginBottom: 14 }}>{c.summary}</p>

      <div className="tiny b" style={{ marginBottom: 4 }}>Visibility shape</div>
      <p className="tiny muted" style={{ marginBottom: 14 }}>{c.visibilityShape}</p>

      {c.recommendations.length > 0 && (
        <>
          <div className="tiny b" style={{ marginBottom: 6 }}>Recommendations</div>
          <div className="col" style={{ gap: 10 }}>
            {c.recommendations.map((r, i) => (
              <div key={i} style={{ padding: "8px 10px", borderRadius: "var(--r-md)", background: "var(--bg-inset)" }}>
                <div className="row" style={{ gap: 6, alignItems: "center" }}>
                  <span className="b tiny">{r.title}</span>
                  <span className="chip outline" style={{ fontSize: 10 }}>{r.priority}</span>
                </div>
                <div className="tiny muted" style={{ marginTop: 2 }}>{r.detail}</div>
                <div className="tiny muted" style={{ marginTop: 2, fontStyle: "italic" }}>Evidence: {r.evidence}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function ScanResults({
  scan,
  onOpenPoint,
}: {
  scan: Scan
  /** Shared with the map view above — clicking a pin on the map or in this grid opens the same drawer (rendered by the page, not here, so it works while a scan is still RUNNING and this component isn't mounted yet). */
  onOpenPoint: (pointId: string) => void
}) {
  const [activeKeywordId, setActiveKeywordId] = useState<string | null>(scan.keywords[0]?.id ?? null)

  useEffect(() => {
    if (!activeKeywordId && scan.keywords[0]) setActiveKeywordId(scan.keywords[0].id)
  }, [scan.keywords, activeKeywordId])

  const active: ScanKeyword | undefined = scan.keywords.find((k) => k.id === activeKeywordId) ?? scan.keywords[0]
  if (!active) return null

  return (
    <div style={{ marginTop: 16 }}>
      {scan.keywords.length > 1 && (
        <div className="row" style={{ gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {scan.keywords.map((k) => (
            <button
              key={k.id}
              type="button"
              className={"btn sm" + (k.id === active.id ? " primary" : "")}
              onClick={() => setActiveKeywordId(k.id)}
            >
              {k.keyword}
              {k.solv != null && <span className="tiny" style={{ opacity: 0.8 }}>&nbsp;{k.solv}%</span>}
            </button>
          ))}
        </div>
      )}

      <div className="grid g-3" style={{ marginBottom: 16 }}>
        <MetricTile
          label="SoLV"
          value={active.solv != null ? `${active.solv}%` : "—"}
          caption="Share of points where you rank in the top 3"
          tooltip="Share of Local Voice — percentage of grid points where this business ranks 1-3 (the local pack)."
        />
        <MetricTile
          label="ARP"
          value={active.arp != null ? active.arp.toFixed(2) : "—"}
          caption="Average rank, only where found"
          tooltip="Average Rank Position — mean rank across only the points where the business was found. 'Not found' anywhere renders as —, not 0."
        />
        <MetricTile
          label="ATRP"
          value={active.atrp != null ? active.atrp.toFixed(2) : "—"}
          caption="Average rank across the whole grid"
          tooltip="Average Total Rank Position — mean rank across ALL scored points, with a penalty value for not-found points. Answers 'how visible am I across the whole area?'"
        />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="tiny b" style={{ marginBottom: 10 }}>Rank distribution</div>
        <DistributionBar points={active.points} />
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <span className="tiny b">Grid points ({active.scoredPoints} scored{active.failedPoints > 0 ? `, ${active.failedPoints} failed` : ""})</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.round(Math.sqrt(active.points.length)) || 1}, 1fr)`, gap: 4, maxWidth: 480 }}>
          {active.points.map((p) => {
            const c = rankColor(p.rank, p.status)
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpenPoint(p.id)}
                disabled={p.status !== "SUCCEEDED"}
                title={p.rank != null ? `#${p.rank}` : p.status}
                style={{
                  aspectRatio: "1",
                  borderRadius: 6,
                  border: "none",
                  background: p.status === "SUCCEEDED" || p.status === "FAILED" ? c.bg : "var(--bg-inset)",
                  color: c.fg,
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: p.status === "SUCCEEDED" ? "pointer" : "default",
                }}
              >
                {p.status === "SUCCEEDED" ? c.label : ""}
              </button>
            )
          })}
        </div>
      </div>

      <AiReportPanel scan={scan} />
    </div>
  )
}
