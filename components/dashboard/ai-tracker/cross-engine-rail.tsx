"use client"

/**
 * The four assistants, side by side, from inside any one of them.
 *
 * This is the direct answer to "ChatGPT, Claude, Gemini and Perplexity all lead
 * to the same page": you can see at a glance that you are named in 92% of
 * Perplexity's answers and 31% of Gemini's, and click straight across. It also
 * turns the four sidebar entries from a promise into a demonstration — four
 * different numbers in four different colours.
 *
 * Every tile carries its OWN `data-engine`, so it borrows that assistant's
 * accent from the block at the top of the AI ENGINE PAGES section rather than
 * painting them all in the current page's colour.
 *
 * Rates only, never cost: Claude answers are three credits and the other three
 * are one, so a cost figure here would compare numbers that are not comparable.
 */

import Link from "next/link"
import { PlatformMark } from "@/components/dashboard/platform-marks"
import { SectionHead } from "@/components/dashboard/ai-tracker/engine-hero"
import { pct, type Platform, type PlatformStats } from "@/lib/ai-tracker"
import { ENGINES, ENGINE_ORDER } from "@/lib/ai-engines"

export function CrossEngineRail({
  current,
  stats,
}: {
  current: Platform
  /** Absent on a backend that predates the index route's aggregates. */
  stats?: Partial<Record<Platform, PlatformStats>>
}) {
  return (
    <>
      <SectionHead
        title="The same prompts, elsewhere"
        why="Every assistant answers differently — that difference is the product"
      />
      <nav className="llm-cross" aria-label="Other assistants">
        {ENGINE_ORDER.map((id) => {
          const e = ENGINES[id]
          const s = stats?.[id]
          const here = id === current
          const body = (
            <>
              <span className="top">
                <PlatformMark id={id} size={17} />
                <b>{e.label}</b>
                {here && <span className="here">You are here</span>}
              </span>
              {/* An em dash, not 0% — "we have not measured this assistant" and
                  "it never names you" are different findings. */}
              <span className="v">{s?.avgMentionRate == null ? "—" : pct(s.avgMentionRate)}</span>
              <span className="k">
                average mention rate
                {s ? ` · ${s.tracked} prompt${s.tracked === 1 ? "" : "s"}` : ""}
              </span>
            </>
          )
          return here ? (
            <div className="llm-cross-item on llm-eng" data-engine={id} aria-current="page" key={id}>
              {body}
            </div>
          ) : (
            <Link className="llm-cross-item llm-eng" data-engine={id} href={`/dashboard/ai-platforms/${e.slug}`} key={id}>
              {body}
            </Link>
          )
        })}
      </nav>
    </>
  )
}
