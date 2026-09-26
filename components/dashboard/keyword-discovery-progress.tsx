"use client"

import { useEffect, useState } from "react"
import { Icon } from "@/components/dashboard/icons"

/**
 * Live state of a keyword-discovery run, as the project page's poll sees it.
 *
 * `crawled` and `analysed` come from two fields the worker writes the moment
 * each step finishes (crawlMethod, tokensUsed — see ksRepo.markCrawled /
 * markAnalysed), so every tick below reflects something that has actually
 * happened. Nothing here advances on a timer.
 */
export type KeywordDiscovery = {
  status: "PENDING" | "PROCESSING" | "COMPLETED"
  crawled: boolean
  analysed: boolean
  /** When the run was created (server time, ms since epoch). */
  startedAt: number
}

type StepState = "done" | "active" | "todo"

// A COMPLETED run counts every server-side step as done even when its markers
// are empty: cached and skipped runs complete without ever crawling, and must
// not show step 1 still spinning beside a finished step 3.
const STEPS: { label: string; done: (d: KeywordDiscovery) => boolean }[] = [
  { label: "Reading your homepage", done: (d) => d.crawled || d.status === "COMPLETED" },
  { label: "Choosing the keywords worth tracking", done: (d) => d.analysed || d.status === "COMPLETED" },
  { label: "Looking up search volumes", done: (d) => d.status === "COMPLETED" },
  // Never "done" here: the keywords landing replaces this whole panel with the
  // keyword table, which is the completion signal.
  { label: "Adding them to your project", done: () => false },
]

// Runs normally finish in well under a minute. Past this, say so plainly
// rather than keep implying it's nearly there.
const SLOW_AFTER_MS = 90_000

function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

export function KeywordDiscoveryProgress({
  discovery,
  domain,
  onAddKeywords,
  addLabel,
}: {
  discovery: KeywordDiscovery
  domain: string
  onAddKeywords: () => void
  addLabel: string
}) {
  // Ticks the elapsed clock. The clock is the one part of this panel that
  // moves on its own, and it's the part that proves the page isn't frozen.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Steps complete strictly in order: a step counts as done only when every
  // step before it is, and the first one that isn't is the active one.
  let blocked = false
  const states: StepState[] = STEPS.map((s) => {
    if (!blocked && s.done(discovery)) return "done"
    const state: StepState = blocked ? "todo" : "active"
    blocked = true
    return state
  })
  const doneCount = states.filter((s) => s === "done").length
  // Determinate: the bar only fills as real steps finish. The sheen over it is
  // what shows activity, so the bar itself never claims progress it hasn't made.
  const pct = Math.max(6, (doneCount / STEPS.length) * 100)
  const elapsed = now - discovery.startedAt

  return (
    <div className="kd-disc">
      <div className="kd-disc-head">
        <span className="kd-disc-orb" aria-hidden="true">
          <Icon.spark />
        </span>
        <div className="kd-disc-titles">
          <div className="kd-disc-title">Finding your keywords</div>
          <div className="kd-disc-sub">
            Reading <b>{domain}</b> and picking the searches worth tracking.
          </div>
        </div>
        <span className="kd-disc-time" title="Time since this started">
          {fmtElapsed(elapsed)}
        </span>
      </div>

      <ol className="kd-disc-steps" role="status" aria-live="polite">
        {STEPS.map((s, i) => (
          <li key={s.label} data-state={states[i]}>
            <span className="kd-disc-mark" aria-hidden="true">
              {states[i] === "done" ? <Icon.check size={11} /> : states[i] === "active" ? <span className="kd-disc-ring spin" /> : null}
            </span>
            <span className="kd-disc-label">
              {s.label}
              <span className="sr-only">
                {states[i] === "done" ? " — done" : states[i] === "active" ? " — in progress" : ""}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <div className="kd-disc-bar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </div>

      {elapsed > SLOW_AFTER_MS && (
        <div className="kd-disc-slow">
          Taking longer than usual. It&apos;s still running — this page updates on its own.
        </div>
      )}

      <div className="kd-disc-foot">
        <span>Already know which keywords you want?</span>
        {/* Still offered: someone who knows their keywords should not have to
            wait for ours. */}
        <button className="btn" onClick={onAddKeywords}>
          <Icon.plus /> {addLabel}
        </button>
      </div>
    </div>
  )
}
