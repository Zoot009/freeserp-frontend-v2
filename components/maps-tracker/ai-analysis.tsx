"use client"

import { BarChart3, Info, Sparkles } from "lucide-react"
import { Hint } from "@/components/dashboard/widget"
import type { AiReportContent, Scan } from "./types"

/** Signal-strength bars, so confidence reads at a glance rather than as one more grey pill. */
const CONFIDENCE: Record<AiReportContent["confidence"], { label: string; bars: number; tone: string }> = {
  HIGH: { label: "High confidence", bars: 3, tone: "pos" },
  MEDIUM: { label: "Medium confidence", bars: 2, tone: "warn" },
  LOW: { label: "Low confidence", bars: 1, tone: "mute" },
}

const sentence = (s: string) => s.charAt(0) + s.slice(1).toLowerCase()

/**
 * "What this means" — the generated read of the scan.
 *
 * One per SCAN, not per keyword: the backend generates a report per keyword,
 * keeps only the one with the most complete data, and does not record which
 * keyword that was. So it reads the same under every keyword of the report,
 * and when a scan has several keywords the card says so instead of guessing.
 *
 * Everything the analysis carries is shown. The confidence reason and each
 * recommendation's evidence used to live in native title tooltips, and the
 * strengths and weaknesses weren't rendered at all — generated, paid for,
 * and unseen.
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
  const conf = CONFIDENCE[c.confidence] ?? CONFIDENCE.LOW
  const recs = c.recommendations.slice(0, 3)

  return (
    <div className="mt-ai">
      <div className="mt-ai-head">
        <span className="mt-ai-icon" aria-hidden>
          <Sparkles size={15} />
        </span>
        <div className="mt-ai-heading">
          <h3>What this means</h3>
          <p>
            {scan.keywords.length > 1
              ? "AI read of this scan — one analysis per scan, from the keyword with the most complete data"
              : "AI read of this scan"}
          </p>
        </div>
        <Hint text={c.confidenceReason}>
          <span className={`mt-ai-conf mt-ai-conf--${conf.tone}`} tabIndex={0}>
            <span className="mt-ai-bars" aria-hidden>
              {[1, 2, 3].map((n) => (
                <i key={n} className={n <= conf.bars ? "on" : undefined} />
              ))}
            </span>
            {conf.label}
          </span>
        </Hint>
      </div>

      {/* A low-confidence read says why up front, not only on hover. */}
      {c.confidence === "LOW" && c.confidenceReason && (
        <div className="mt-ai-caveat">
          <Info size={14} aria-hidden />
          <span>{c.confidenceReason}</span>
        </div>
      )}

      <p className="mt-ai-lead">{c.summary}</p>

      {c.visibilityShape && (
        <div className="mt-ai-shape">
          <span className="mt-ai-k">Visibility pattern</span>
          <p>{c.visibilityShape}</p>
        </div>
      )}

      {(c.strengths.length > 0 || c.weaknesses.length > 0) && (
        <div className="mt-ai-findings">
          <Findings title="Working for you" tone="pos" items={c.strengths} />
          <Findings title="Holding you back" tone="neg" items={c.weaknesses} />
        </div>
      )}

      {recs.length > 0 && (
        <>
          <h4 className="mt-ai-k mt-ai-recs-k">What to do next</h4>
          <ol className="mt-recs">
            {recs.map((r, i) => (
              <li key={i} className={`mt-rec mt-rec--${r.priority.toLowerCase()}`}>
                <div className="mt-rec-meta">
                  <span className="mt-rec-prio">{sentence(r.priority)} priority</span>
                  <span className="mt-rec-effort">{sentence(r.effort)} effort</span>
                </div>
                <div className="t">{r.title}</div>
                <div className="d">{r.detail}</div>
                {/* What the recommendation rests on — the most convincing line on
                    the card, so it's printed, pinned to the card's foot. */}
                {r.evidence && (
                  <div className="mt-rec-ev">
                    <BarChart3 size={13} aria-hidden />
                    <span>{r.evidence}</span>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}

function Findings({
  title,
  tone,
  items,
}: {
  title: string
  tone: "pos" | "neg"
  items: AiReportContent["strengths"]
}) {
  if (items.length === 0) return null
  return (
    <div className={`mt-ai-find mt-ai-find--${tone}`}>
      <span className="mt-ai-k">{title}</span>
      <ul>
        {items.map((s, i) => (
          <li key={i}>
            <b>{s.title}</b>
            {s.detail && <span> — {s.detail}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
