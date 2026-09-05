"use client"

/** The running scan's header strip. Points land on the map as they arrive, so
 *  this only has to say how far along it is and offer a way out. */
export function ScanProgress({
  pointsDone,
  totalPoints,
  onCancel,
}: {
  pointsDone: number
  totalPoints: number
  onCancel: () => void
}) {
  const pct = totalPoints > 0 ? (pointsDone / totalPoints) * 100 : 0
  return (
    <>
      <div className="mt-progress">
        <span className="mt-spinner" aria-hidden />
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>
          Scanning · {pointsDone} of {totalPoints} points
        </span>
        <span className="tiny muted">Points appear on the map as they land. You can leave this page.</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
      <div
        className="mt-progress-track"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Scan progress"
      >
        <i style={{ width: `${pct}%` }} />
      </div>
    </>
  )
}

/** Metric cards while the numbers are still moving. */
export function MetricSkeletons() {
  return (
    <>
      {["Top-3 coverage", "Average rank where found", "Average rank across grid"].map((label) => (
        <div className="card" style={{ padding: "14px 16px" }} key={label}>
          <div className="tiny" style={{ color: "var(--text-soft)" }}>{label}</div>
          <div className="skeleton" style={{ height: 22, width: 64, borderRadius: 6, marginTop: 8 }} />
        </div>
      ))}
    </>
  )
}
