"use client"

import type { Scan } from "./types"

const PRIO_CLASS: Record<string, string> = {
  HIGH: "mt-prio--high",
  MEDIUM: "mt-prio--medium",
  LOW: "mt-prio--low",
}

/**
 * "What this means" — the generated read of the scan.
 *
 * Deliberately rendered OUTSIDE the keyword tabs. The backend generates one
 * report per keyword, keeps only the one with the most complete data, and does
 * not record which keyword that was, so pinning this card to whichever tab is
 * open would be a lie. When a scan has several keywords the card says so
 * instead of guessing.
 */
export function AiAnalysis({ scan }: { scan: Scan }) {
  if (!scan.aiAnalysisRequested) return null
  const report = scan.aiReport

  if (!report || report.status === "PENDING" || report.status === "GENERATING") {
    return (
      <div className="mt-ai">
        <div className="row" style={{ gap: 10 }}>
          <span className="mt-spinner" aria-hidden />
          <span className="tiny muted">Writing up what this scan means…</span>
        </div>
      </div>
    )
  }
  if (report.status === "FAILED" || !report.content) {
    return (
      <div className="mt-ai">
        <div className="tiny muted">
          The analysis couldn&apos;t be generated for this scan. The measurements above are unaffected.
        </div>
      </div>
    )
  }

  const c = report.content
  const multi = scan.keywords.length > 1

  return (
    <div className="mt-ai">
      <div className="row" style={{ marginBottom: 10 }}>
        <span
          aria-hidden
          style={{
            width: 24, height: 24, borderRadius: 7,
            background: "var(--brand-soft)", color: "var(--brand)",
            display: "grid", placeItems: "center", fontSize: 12,
          }}
        >
          ✳
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>What this means</span>
        <span style={{ flex: 1 }} />
        {multi && (
          <span className="tiny muted">One analysis per scan, from the keyword with the most complete data</span>
        )}
        <span
          className="tiny muted"
          title={c.confidenceReason}
          style={{ border: "1px solid var(--border)", padding: "3px 8px", borderRadius: 999 }}
        >
          {c.confidence.charAt(0) + c.confidence.slice(1).toLowerCase()} confidence
        </span>
      </div>

      <p>{c.summary}</p>
      {/* No slot for this in the reference, but it is generated, paid for, and
          says something the summary doesn't — so it runs as a second para. */}
      {c.visibilityShape && <p style={{ marginBottom: 16 }}>{c.visibilityShape}</p>}

      {c.recommendations.length > 0 && (
        <div className="mt-recs">
          {c.recommendations.slice(0, 3).map((r, i) => (
            // `evidence` also has no slot; it belongs to the claim above it, so
            // it rides along as the card's tooltip rather than being dropped.
            <div className="mt-rec" key={i} title={r.evidence ? `Evidence: ${r.evidence}` : undefined}>
              <div className="row" style={{ gap: 6, marginBottom: 6 }}>
                <span className={`mt-prio ${PRIO_CLASS[r.priority] ?? "mt-prio--low"}`}>{r.priority}</span>
                <span className="tiny muted tabular">{r.effort.charAt(0) + r.effort.slice(1).toLowerCase()} effort</span>
              </div>
              <div className="t">{r.title}</div>
              <div className="d">{r.detail}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
