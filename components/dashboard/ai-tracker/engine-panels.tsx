"use client"

/**
 * The panels that differ between assistants: sources, share of voice, fan-out,
 * cost and coverage.
 *
 * Each returns null when it has nothing to say, so the page never draws an empty
 * card. That matters more than it sounds: a "Sources" heading over a blank box
 * tells a Perplexity user their answers cite nothing, which is the opposite of
 * true — it means the detail request has not arrived yet.
 */

import { TriangleAlert } from "lucide-react"
import { Favicon } from "@/components/favicon"
import { SectionHead } from "@/components/dashboard/ai-tracker/engine-hero"
import { AddPromptsAction } from "@/components/dashboard/ai-tracker/add-prompts-action"
import { pct, type AnswersDetail, type PlatformView, type ProjectRef } from "@/lib/ai-tracker"
import type { EngineProfile } from "@/lib/ai-engines"

/** Where this assistant reads about your category. */
export function SourcesLeaderboard({
  engine,
  sources,
}: {
  engine: EngineProfile
  sources: AnswersDetail["sources"]
}) {
  if (!sources.length) return null
  const max = Math.max(...sources.map((r) => r.count), 1)
  return (
    <>
      <SectionHead
        title={`Where ${engine.label} reads about your category`}
        why="Domains cited across the newest run of every prompt"
      />
      <div className="card" style={{ padding: 0 }}>
        <ol className="llm-srcs-list">
          {sources.map((r) => (
            <li className={`llm-src ${r.own ? "is-own" : ""}`} key={r.domain}>
              <Favicon domain={r.domain} size={18} />
              <span className="n">
                <b>{r.domain}</b>
                <span>{r.title || `${r.promptCount} prompt${r.promptCount === 1 ? "" : "s"}`}</span>
              </span>
              {/* The one row worth calling out: the assistant is reading you
                  directly rather than reading about you. */}
              {r.own && <span className="chip">You</span>}
              <span className="bar" role="img" aria-label={`${r.count} answers cited this`}>
                <i style={{ ["--v" as string]: `${Math.round((r.count / max) * 100)}%` }} />
              </span>
              <b className="ct tabular">{r.count}</b>
            </li>
          ))}
        </ol>
      </div>
    </>
  )
}

/**
 * Who gets named in the answers where you hoped to be.
 *
 * Rivals step down through the neutral ramp rather than each taking a colour of
 * their own: there is one thing to look at here and it is your segment.
 */
export function ShareOfVoice({
  engine,
  competitors,
}: {
  engine: EngineProfile
  competitors: AnswersDetail["competitors"]
}) {
  if (!competitors.length) return null
  const ramp = ["var(--text-soft)", "var(--text-mute)", "var(--border-strong)", "var(--bg-inset)"]
  return (
    <>
      <SectionHead
        title="Who gets named instead of you"
        why={`Share of voice across completed ${engine.label} answers`}
      />
      <div className="card">
        <div className="llm-sov-bar">
          {competitors.map((c, i) => (
            <span
              key={c.name}
              style={{ width: `${(c.share * 100).toFixed(1)}%`, background: ramp[i % ramp.length] }}
              title={`${c.name} ${pct(c.share)}`}
            />
          ))}
        </div>
        <div className="llm-sov-key">
          {competitors.map((c, i) => (
            <div key={c.name}>
              <i style={{ background: ramp[i % ramp.length] }} />
              {c.name} <b>{pct(c.share)}</b>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

/**
 * The searches the assistant ran on its way to the answer.
 *
 * Only the two scraped products report these. The API-answer assistants send
 * `fanOut: null`, and this returns null rather than drawing a card that implies
 * they searched for nothing.
 */
export function FanOut({ engine, fanOut }: { engine: EngineProfile; fanOut: AnswersDetail["fanOut"] }) {
  if (!fanOut || !fanOut.length) return null
  return (
    <>
      <SectionHead
        title={`What ${engine.label} searched`}
        why="Only the scraped assistants report the queries behind an answer"
      />
      <div className="card" style={{ padding: 0 }}>
        <div className="llm-fan">
          {fanOut.map((f) => (
            <span key={f.q}>
              {f.q} <b>{f.count}</b>
            </span>
          ))}
        </div>
      </div>
    </>
  )
}

/**
 * Claude only.
 *
 * The 3× rate is stated in words on its own page rather than averaged into a
 * cross-assistant figure, where it would quietly overstate what the other three
 * cost and understate this one. Mirrors the reasoning in the credits catalog.
 */
export function EngineCost({ engine, view }: { engine: EngineProfile; view: PlatformView }) {
  const answers = view.prompts
    .filter((p) => p.runs[0]?.status === "COMPLETED")
    .reduce((n, p) => n + (p.runs[0]!.samplesSucceeded ?? p.runs[0]!.samplesCompleted), 0)
  const credits = answers * engine.creditsPerAnswer
  const appearances = view.summary?.mentioned ?? 0
  const rerun = view.prompts.reduce((n, p) => n + p.samplesPerRun, 0) * engine.creditsPerAnswer

  return (
    <>
      <SectionHead title={`What ${engine.label} costs you`} why="Priced on its own page because it is priced on its own" />
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <dl className="llm-cost">
          <div>
            <dt>Answers collected</dt>
            <dd>{answers}</dd>
          </div>
          <div>
            <dt>Credits spent</dt>
            <dd>{credits}</dd>
          </div>
          <div>
            <dt>Credits per appearance</dt>
            {/* Null, not zero: with nothing found there is no cost-per-result to
                report, and a 0 would read as "free". */}
            <dd>{appearances ? Math.round(credits / appearances) : "—"}</dd>
          </div>
          <div>
            <dt>One full re-run</dt>
            <dd>
              {rerun} <small>credits</small>
            </dd>
          </div>
        </dl>
        <div className="llm-cost-flag">
          <TriangleAlert aria-hidden />
          <div>
            A {engine.label} answer costs <b>{engine.creditsPerAnswer} credits</b> — roughly six times what a ChatGPT
            answer costs to collect. It is billed apart rather than averaged in, so a run here is never quietly three
            times the price you expected.
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * How much of what you track runs on this assistant.
 *
 * The gap IS the call to action, so the button lives inside the panel rather
 * than somewhere else on the page.
 */
export function Coverage({
  engine,
  here,
  total,
  projects,
}: {
  engine: EngineProfile
  here: number
  total: number
  /** Every brand the account has, for the add action's brand resolution. */
  projects: ProjectRef[]
}) {
  // Nothing to say when everything you track already runs here — and nothing to
  // say when we could not learn the total either.
  if (!total || here >= total) return null
  const missing = total - here
  return (
    <>
      <SectionHead title="Coverage" why="How much of what you track runs on this assistant" />
      <div className="card" style={{ padding: 0 }}>
        <div className="llm-cover">
          <div className="n">
            <b>
              {here} of your {total} prompts run on {engine.label}
            </b>
            <span className="bar">
              <span style={{ width: `${Math.round((here / total) * 100)}%` }} />
            </span>
            <div className="tiny muted">
              The other {missing} are tracked on other assistants only, so {engine.label} has nothing to say about them.
            </div>
          </div>
          <AddPromptsAction
            engine={engine}
            projects={projects}
            label={`Add the other ${missing}`}
            className="btn"
          />
        </div>
      </div>
    </>
  )
}

/** promptId → distinct domains cited, for the board's Sources column. */
export function sourceCountsFor(detail: AnswersDetail | null): Map<string, number> {
  return new Map(Object.entries(detail?.promptSources ?? {}))
}
