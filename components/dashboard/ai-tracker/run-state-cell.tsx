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
            <span
              className="tiny muted"
              title={state.reason}
              style={{ maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {state.reason}
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

/** Mention rate with its run-over-run delta, which was fetched but never shown. */
export function RateCell({ rate, change }: { rate: number | null; change: number | null }) {
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
  if (state.kind === "queued" || state.kind === "running") {
    return (
      <span className="aio pending">
        <i className="dot" />…
      </span>
    )
  }
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
