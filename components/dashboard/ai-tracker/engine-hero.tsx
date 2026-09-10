"use client"

/**
 * The engine page's header and its "how this works" panel.
 *
 * Both render in EVERY state, empty included. Most accounts run one assistant,
 * so for most people three of the four pages have no data — and if the redesign
 * only improved the populated page, most users would see no change at all. An
 * empty Gemini page still has to say what Gemini tracking is and how it differs
 * from ChatGPT's; that is what makes them two different pages rather than two
 * copies of the same dashed box.
 *
 * The panel used to be a capability strip titled "What ChatGPT can and can't
 * do". See HowItWorks for why that framing was replaced and where those facts
 * went.
 */

import Link from "next/link"
import { PlatformMark } from "@/components/dashboard/platform-marks"
import type { EngineProfile } from "@/lib/ai-engines"

export function EngineHero({
  engine,
  brands,
  prompts,
  actions,
}: {
  engine: EngineProfile
  brands: number
  prompts: number
  /** Primary page actions. They live in the header because that is where every
   *  other tool page in this dashboard puts them — and because this page had
   *  none at all once it had data. */
  actions?: React.ReactNode
}) {
  return (
    <header className="llm-hero">
      {/* The mark AS PUBLISHED, oversized and faint, bleeding off the right
          edge — this is what stops the page reading as a generic dashboard at a
          glance. No filter and no fill override: third-party marks are never
          recoloured, so the fade lives on this container. */}
      <div className="llm-hero-mark" aria-hidden>
        <PlatformMark id={engine.id} size={190} />
      </div>
      <div className="llm-hero-in">
        <div className="llm-hero-id">
          <span className="llm-hero-badge">
            <PlatformMark id={engine.id} size={26} />
          </span>
          <div>
            <div className="tiny muted">
              <Link href="/dashboard/ai-prompt-tracker">AI Prompt Tracker</Link> · Assistant
            </div>
            <h1>{engine.label}</h1>
            <p className="llm-hero-tag">{engine.tagline}</p>
          </div>
        </div>
        <div className="llm-hero-side">
          <dl className="llm-hero-facts">
            <div>
              <dt>Brands tracked here</dt>
              <dd>{brands}</dd>
            </div>
            <div>
              <dt>Prompts here</dt>
              <dd>{prompts}</dd>
            </div>
            <div>
              <dt>Credits an answer</dt>
              <dd>
                {engine.creditsPerAnswer}
                {/* Claude is three, and a user who finds that out from an
                    invoice has been misled by this page. */}
                {engine.creditsPerAnswer === 3 && <small> · 3×</small>}
              </dd>
            </div>
          </dl>
          {actions && <div className="llm-hero-actions">{actions}</div>}
        </div>
      </div>
    </header>
  )
}

export function SectionHead({ title, why }: { title: string; why?: string }) {
  return (
    <div className="llm-sec">
      <h2>{title}</h2>
      {why && <span className="why">{why}</span>}
    </div>
  )
}

/**
 * How the tracker turns a question into a number, in four steps.
 *
 * This slot used to be "What ChatGPT can and can't do" — an inventory of one
 * assistant's limitations. Those facts are still here, as the caveat line at the
 * foot of the panel, but they were the wrong thing to LEAD with: they explained
 * the assistant and never explained us. Someone looking at a 0% mention rate is
 * asking how the 0% was arrived at, and nothing on the page answered that.
 *
 * Every claim below is the code's behaviour, not marketing:
 *   step 2  llmPrompt.routes.ts  samplesPerRun — 1-5, 3 by default
 *   step 3  llmMetrics.ts        scoreSample — mention / citation / prominence,
 *                                and brandTerms, which is why the generic words
 *                                in a brand name are excluded from matching
 *   step 4  llmMetrics.ts        aggregateRun — mentions / samples, as a RATE
 * Change those and change this.
 */
export function HowItWorks({
  engine,
  /** The account's real figure where the page has prompts; the default otherwise. */
  samples = 3,
}: {
  engine: EngineProfile
  samples?: number
}) {
  // The assistant's own caveats, kept from the strip this panel replaced. Only
  // the ones that are NOT a plain "yes": a capability that simply works needs no
  // warning, and four cards of which three were ticks is most of what made the
  // old panel read as filler.
  const caveats = engine.caps.filter((c) => c.state !== "yes")

  const steps: { n: number; title: string; detail: string }[] = [
    {
      n: 1,
      title: "You write the questions",
      detail:
        "Prompts the way a buyer asks them — “best free rank tracker”, not a keyword. The same question can be put to every assistant, which is what makes their answers comparable.",
    },
    {
      n: 2,
      title: `We ask ${engine.label} ${samples} times`,
      detail: `The same question, asked ${samples} times a run. Identical prompts measurably return different brand lists, so a single answer is a coin flip — ${samples} makes it something you can compare. ${engine.creditsPerAnswer} credit${engine.creditsPerAnswer === 1 ? "" : "s"} an answer here.`,
    },
    {
      n: 3,
      title: "Every answer is read for you",
      detail:
        "Named in the prose is a mention; linked as a source is a citation — tracked apart, because the fix behind each is a different job. Where your first mention lands is prominence. The generic words your name is spelled with are excluded, so you are never credited for an answer that never heard of you.",
    },
    {
      n: 4,
      title: "You get a rate, then a trend",
      detail:
        "Named in 2 of 3 answers is 67% — never a tick, which would flip run to run and be worth nothing. Re-run by hand or on a schedule, and every run carries its change against the last.",
    },
  ]

  return (
    <>
      <SectionHead
        title="How the AI Prompt Tracker works"
        why={`What happens between your question and the number — on ${engine.label}`}
      />
      {/* An ordered list, so the sequence is carried by the markup rather than by
          four painted numerals — the numeral is then honestly decorative, and a
          screen reader still gets the steps in order. */}
      <ol className="llm-how" aria-label="How the AI Prompt Tracker works">
        {steps.map((s) => (
          <li className="llm-step" key={s.n}>
            <span className="n" aria-hidden>
              {s.n}
            </span>
            <div>
              <b>{s.title}</b>
              <span>{s.detail}</span>
            </div>
          </li>
        ))}
      </ol>
      {caveats.length > 0 && (
        <p className="llm-how-note">
          <b>On {engine.label}:</b>{" "}
          {caveats.map((c, i) => (
            <span key={c.label}>
              {i > 0 && " · "}
              {/* The label leads so the line stays scannable — two caveats run
                  together as bare sentences is a wall, and the thing a reader
                  checks for ("can I target a country here?") is the label. */}
              <i>{c.label}</i> — {c.detail}
            </span>
          ))}
        </p>
      )}
    </>
  )
}
