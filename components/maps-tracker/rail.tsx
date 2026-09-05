"use client"

import type { ReactNode } from "react"
import { useCreditQuote, CREDIT_ACTION_KEYS } from "@/lib/credits"
import { estimateScanSeconds, formatDuration } from "./grid"

export type StepState = "active" | "done" | "locked"

/**
 * One numbered step in the setup rail.
 *
 * Only the active step shows its controls. A done step collapses to a one-line
 * summary with an Edit link; a locked step stays visible but dimmed, so the
 * shape of what's left is legible without being reachable.
 */
export function RailStep({
  n,
  title,
  state,
  hint,
  summaryKey,
  summaryValue,
  summarySub,
  onEdit,
  children,
}: {
  n: number
  title: string
  state: StepState
  hint?: string
  summaryKey?: string
  summaryValue?: ReactNode
  summarySub?: string
  onEdit?: () => void
  children?: ReactNode
}) {
  const done = state === "done"
  return (
    <div className="mt-step" data-state={state} aria-disabled={state === "locked" || undefined}>
      <div className={"mt-step-h" + (done ? " top" : "")}>
        <span className="mt-step-n" aria-hidden>{done ? "✓" : n}</span>
        {done && summaryKey ? (
          <>
            <span className="mt-summary">
              <span className="mt-summary-k">{summaryKey}</span>
              <span className="mt-summary-v" style={{ display: "block" }}>{summaryValue}</span>
              {summarySub && <span className="tiny muted" style={{ display: "block" }}>{summarySub}</span>}
            </span>
            {onEdit && (
              <button type="button" className="mt-link" onClick={onEdit}>
                Edit<span className="sr-only"> {title}</span>
              </button>
            )}
          </>
        ) : (
          <span className="mt-step-t">{title}</span>
        )}
      </div>

      {state === "active" && children && <div className="mt-step-body">{children}</div>}
      {hint && state !== "done" && (
        <div className={"mt-step-hint" + (state === "locked" ? " indent" : "")}>{hint}</div>
      )}
    </div>
  )
}

/**
 * The rail and its foot. The foot is the only place the scan can be started
 * from, on every screen, and it always states the price before the click.
 */
export function SetupRail({
  steps,
  aiRequested,
  onAiChange,
  showAi,
  searches,
  disabledReason,
  submitting,
  onRun,
}: {
  steps: ReactNode
  aiRequested: boolean
  onAiChange: (v: boolean) => void
  /** Hidden until there is something to analyse — an empty account has no use for it. */
  showAi: boolean
  searches: number
  /** Null when the scan can run; otherwise why it can't, shown under the button. */
  disabledReason: string | null
  submitting: boolean
  onRun: () => void
}) {
  const { cost } = useCreditQuote(CREDIT_ACTION_KEYS.mapsScanPoint, searches)
  const runnable = disabledReason == null && !submitting

  return (
    <div className="mt-rail">
      {steps}
      <div className="mt-rail-foot">
        {showAi && (
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <span className="row" style={{ gap: 8 }}>
              <span
                aria-hidden
                style={{
                  width: 26, height: 26, borderRadius: 8,
                  background: "var(--brand-soft)", color: "var(--brand)",
                  display: "grid", placeItems: "center", fontSize: 13,
                }}
              >
                ✳
              </span>
              <span style={{ fontSize: 13, fontWeight: 500 }}>AI analysis</span>
            </span>
            <button
              type="button"
              className="mt-toggle"
              id="mt-ai-toggle"
              aria-pressed={aiRequested}
              aria-label="AI analysis"
              onClick={() => onAiChange(!aiRequested)}
            >
              <i />
            </button>
          </div>
        )}

        <button type="button" className="btn primary mt-run" disabled={!runnable} onClick={onRun}>
          {submitting ? "Starting…" : cost != null ? `Run scan · ${cost} credits` : "Run scan"}
        </button>

        <div className="mt-rail-note">
          {disabledReason ?? `${searches} ${searches === 1 ? "search" : "searches"} · ${formatDuration(estimateScanSeconds(searches))}`}
        </div>
      </div>
    </div>
  )
}
