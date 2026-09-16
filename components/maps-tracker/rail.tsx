"use client"

import type { ReactNode } from "react"
import { useCreditQuote, CREDIT_ACTION_KEYS } from "@/lib/credits"

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
  // Whether the step holds an answer, independent of whether it's expanded.
  // A summary key is only passed once there's something to summarise, so the
  // two travel together. Conflating "collapsed" with "answered" is what once
  // put a green tick on an empty step.
  const answered = summaryKey != null
  return (
    <div
      className="mt-step"
      data-state={state}
      data-answered={answered || undefined}
      aria-disabled={state === "locked" || undefined}
    >
      <div className={"mt-step-h" + (done ? " top" : "")}>
        <span className="mt-step-n" aria-hidden>{answered ? "✓" : n}</span>
        {done && answered ? (
          <span className="mt-summary">
            <span className="mt-summary-k">{summaryKey}</span>
            <span className="mt-summary-v" style={{ display: "block" }}>{summaryValue}</span>
            {summarySub && <span className="tiny muted" style={{ display: "block" }}>{summarySub}</span>}
          </span>
        ) : (
          <span className="mt-step-t" style={{ flex: 1, minWidth: 0 }}>{title}</span>
        )}
        {/* Only a collapsed step needs a way back in. An expanded one is
            already showing its controls. */}
        {done && onEdit && (
          <button type="button" className="mt-link" onClick={onEdit}>
            {answered ? "Edit" : "Add"}<span className="sr-only"> {title}</span>
          </button>
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
  searches,
  disabledReason,
  submitting,
  onRun,
}: {
  steps: ReactNode
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
      {/* The AI switch used to live here, above the button. It has moved into
          the confirmation that opens on the click: it is a question about the
          run you are about to pay for, so it belongs where the price is, and
          having it here meant the button quoted a cost for a choice made three
          controls away. */}
      <div className="mt-rail-foot">
        <button type="button" className="btn primary mt-run" disabled={!runnable} onClick={onRun}>
          {submitting ? "Starting…" : cost != null ? `Run scan · ${cost} credits` : "Run scan"}
        </button>

        {/* Only ever the reason the button is dead now. The estimate that used
            to sit here ("27 searches · about 50 seconds") described the same
            run twice — the button already carries its price, and the map its
            point count. */}
        {disabledReason && <div className="mt-rail-note">{disabledReason}</div>}
      </div>
    </div>
  )
}
