"use client"

/**
 * The one place a run's status is rendered.
 *
 * Previously status had no column of its own — it was smuggled into the Mention
 * rate cell, where PENDING and PROCESSING produced byte-identical output and a
 * FAILED run showed one red word with no reason and no way to retry. Every state
 * now has its own shape, and the two active ones are told apart by what they can
 * actually show: queued has nothing to report yet, running has real progress.
 */

import { Icon } from "@/components/dashboard/icons"
import { relTime, type RunState } from "@/lib/ai-tracker"

/**
 * What a value cell shows while its run is still in flight.
 *
 * Not a spinner. A spinner is a different SIZE from the value that replaces it,
 * so under a 3s poll the column re-measures and every row beside it jumps. This
 * sits inside the width the column already reserves (.llm-c-* in dashboard.css),
 * right-aligned, so the number arrives exactly where the dot was.
 *
 * `.aio.pending` is the SERP side's existing pending treatment — already a quiet
 * pulse, already silenced under prefers-reduced-motion — so this adds no new
 * animation and needs no new reduced-motion rule.
 */
function PendingValue({ label }: { label: string }) {
  return (
    <span className="llm-pending-val">
      <span className="aio pending" aria-label={label}>
        <i className="dot" />
      </span>
    </span>
  )
}

/**
 * The readable half of a stored failure reason.
 *
 * Reasons arrive as `${path}: ${status_code} ${status_message}` (see
 * llmPlatform.adapter.ts), and the path is ~48 characters of routing detail
 * that is identical across every failure of that platform. The cell can show
 * about 26, so every distinct error rendered as the same
 * "/v3/ai_optimization/chat_g…" — which reads as information while carrying
 * none. The diagnosis lives at the END of the string.
 *
 * This is presentation only: the stored reason is untouched, so logs keep the
 * path and the cell's `title` still carries the whole thing.
 *
 * Guarded rather than a blind split on the first ": " — that would turn
 * "Timed out: after 30s" into "after 30s" and throw away the useful half. The
 * prefix is dropped only when it actually looks like an API path.
 */
export function readableReason(reason: string): string {
  const at = reason.indexOf(": ")
  if (at === -1) return reason
  const prefix = reason.slice(0, at)
  if (!prefix.startsWith("/")) return reason
  const rest = reason.slice(at + 2).trim()
  return rest.length > 0 ? rest : reason
}

/** Is this run still going? The three value cells all answer it the same way. */
function inFlight(state: RunState): boolean {
  return state.kind === "queued" || state.kind === "running"
}

export function RunStateCell({ state, onRetry }: { state: RunState; onRetry?: () => void }) {
  switch (state.kind) {
    case "none":
      return <span className="chip outline">Not run</span>

    case "queued":
      return (
        <span className="col" style={{ gap: 3, alignItems: "flex-start" }}>
          <span className="aio pending">
            <i className="dot" />
            Queued
          </span>
          <span className="tiny muted">waiting for a slot</span>
        </span>
      )

    case "running": {
      const width = Math.round((state.done / Math.max(1, state.of)) * 100)
      return (
        <span className="col" style={{ gap: 5, alignItems: "flex-start" }}>
          <span className="aio pending">
            <i className="dot" />
            Running
          </span>
          <span
            className="bar llm-prog"
            role="progressbar"
            aria-label="Answers collected"
            aria-valuenow={state.done}
            aria-valuemin={0}
            aria-valuemax={state.of}
          >
            {/* The sweep lives INSIDE the fill: `.bar > span` is the fill, so a
                sibling would paint the whole track brand blue. */}
            <span style={{ width: `${width}%` }}>
              <i className="fs-crawl-sweep" />
            </span>
          </span>
          <span className="tiny muted tabular">
            {state.done} of {state.of} answers
          </span>
        </span>
      )
    }

    case "completed":
      // Deliberately quiet: the rate beside it is the finding. "Done" is not an
      // achievement worth a green badge on every row.
      return (
        <span className="tiny muted" title={new Date(state.at).toLocaleString()}>
          {relTime(state.at)}
          {state.failed > 0 && (
            <>
              {" · "}
              <span style={{ color: "var(--warn)" }}>
                {state.failed} answer{state.failed === 1 ? "" : "s"} failed
              </span>
            </>
          )}
        </span>
      )

    case "failed":
      return (
        <span className="col" style={{ gap: 4, alignItems: "flex-start" }}>
          <span className="chip neg">Failed</span>
          {state.reason && (
            <span className="tiny muted llm-fail-reason" title={state.reason}>
              {readableReason(state.reason)}
            </span>
          )}
          {onRetry && (
            <button type="button" className="btn sm" onClick={onRetry}>
              <Icon.refresh /> Retry
            </button>
          )}
        </span>
      )
  }
}

/**
 * Mention rate with its run-over-run delta, which was fetched but never shown.
 *
 * Takes the run state as well as the rate because a null rate meant two
 * different things and rendered one dash for both: a run that has never
 * happened, and a run that is happening right now. The second is the case the
 * poll is about, and it is the one that was reflowing the column.
 */
export function RateCell({
  state,
  rate,
  change,
}: {
  state: RunState
  rate: number | null
  change: number | null
}) {
  if (inFlight(state)) return <PendingValue label="Collecting answers" />
  if (rate == null) return <span className="tiny muted">—</span>
  const pts = change == null ? null : Math.round(change * 100)
  const dir = pts == null || pts === 0 ? "flat" : pts > 0 ? "up" : "down"
  return (
    <span className="llm-rate">
      <b className="tabular">{Math.round(rate * 100)}%</b>
      {pts != null && pts !== 0 && (
        <span className={`llm-trend ${dir}`} title="Change since the previous run">
          {pts > 0 ? "+" : ""}
          {pts}
        </span>
      )}
    </span>
  )
}

/**
 * Cited / not cited / still running.
 *
 * Reuses `.aio`, which exists in dashboard.css for precisely this verdict on the
 * SERP side — three states, with a pulse on pending — rather than inventing a
 * fifth badge style for the same idea.
 */
export function CitedCell({ state, rate }: { state: RunState; rate: number | null }) {
  // Was a dot plus an ellipsis, which is narrower than "Not cited" and so moved
  // the column when the run settled. Same dot, in the reserved box.
  if (inFlight(state)) return <PendingValue label="Checking citations" />
  if (state.kind !== "completed") return <span className="tiny muted">—</span>
  return rate != null && rate > 0 ? (
    <span className="aio cited">
      <i className="dot" />
      {Math.round(rate * 100)}%
    </span>
  ) : (
    <span className="aio not-cited">
      <i className="dot" />
      Not cited
    </span>
  )
}

/**
 * Prominence, which used to render "—" for three different situations: never
 * run, run but never mentioned, and genuinely null. Only the first is a dash.
 */
export function ProminenceCell({ state, value }: { state: RunState; value: number | null }) {
  if (inFlight(state)) return <PendingValue label="Measuring position" />
  if (state.kind !== "completed") return <span className="tiny muted">—</span>
  if (value == null) {
    return (
      <span className="tiny muted" title="No answer named this brand, so there is no position to report">
        n/a
      </span>
    )
  }
  return <span className="tabular">{Math.round(value * 100)}%</span>
}
