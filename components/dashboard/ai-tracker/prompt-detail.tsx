"use client"

/**
 * The pieces of the prompt detail page — one question, one assistant's answers.
 *
 * The page it serves used to be assistant-agnostic: generic brand blue, a chip
 * row for the platform switcher, and every answer a flat card. Clicking a teal
 * Perplexity row landed you somewhere with no visible connection to Perplexity,
 * and the page could not tell you the one thing this screen is uniquely placed
 * to say — that the SAME question gets a different answer from each assistant.
 *
 * So the page carries `data-engine` like the assistant pages, and the switcher
 * became a comparison: four tiles, four rates, one question.
 */

import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { PlatformMark } from "@/components/dashboard/platform-marks"
import { Favicon } from "@/components/favicon"
import { SectionHead } from "@/components/dashboard/ai-tracker/engine-hero"
import { pct, PLATFORM_LABEL, type Platform } from "@/lib/ai-tracker"
import { ENGINES } from "@/lib/ai-engines"

export function PromptHero({
  projectId,
  projectName,
  prompt,
  platform,
  modelName,
  succeeded,
  requested,
}: {
  projectId: string
  projectName: string
  prompt: string
  /** Null before any run exists, in which case there is no assistant to name. */
  platform: Platform | null
  modelName?: string | null
  succeeded?: number
  requested?: number
}) {
  return (
    <header className="llm-qhero">
      {platform && (
        <div className="llm-qhero-mark" aria-hidden>
          <PlatformMark id={platform} size={170} />
        </div>
      )}
      <div className="llm-qhero-in">
        <div style={{ minWidth: 0 }}>
          <div className="tiny muted">
            <Link href="/dashboard/ai-prompt-tracker">AI Prompt Tracker</Link> ·{" "}
            <Link href={`/dashboard/ai-prompt-tracker/${projectId}`}>{projectName}</Link>
          </div>
          {/* The question IS the page, so it is the heading — not a 20px line
              above a stat row. It wraps and is capped, because a 500-character
              prompt would otherwise be the entire first screen. */}
          <h1>{prompt}</h1>
        </div>
        {platform && (
          <div className="llm-qhero-who">
            <PlatformMark id={platform} size={24} />
            <div>
              <div className="lbl">Answers from</div>
              <div className="n">{PLATFORM_LABEL[platform]}</div>
              {/* The model is recorded per run because on the scraped products it
                  moves under us. This is where it belongs — it used to occupy a
                  quarter of the metric row. */}
              <div className="m">
                {modelName ?? "—"}
                {requested != null ? ` · ${succeeded ?? 0} of ${requested} answers` : ""}
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}

/**
 * The platform switcher, as a comparison rather than a chip row.
 *
 * A chip row asked you to choose blind: you could not see that this question
 * scores 100% on Perplexity and 40% on Gemini until you had clicked each one in
 * turn. Here the answer to "who names me for this question" IS the control.
 * Each tile takes its own accent via `data-engine`.
 */
export function PromptPlatformSwitch({
  platforms,
  rates,
  current,
  onSelect,
}: {
  platforms: Platform[]
  /** platform → latest completed mention rate, or null when never measured. */
  rates: Partial<Record<Platform, number | null>>
  current: Platform | null
  onSelect: (p: Platform) => void
}) {
  if (platforms.length < 2) return null
  return (
    <>
      <SectionHead
        title="This question, on every assistant"
        why="One question answered four ways — that difference is the whole point"
      />
      <div className="llm-qswitch">
        {platforms.map((p) => {
          const v = rates[p]
          const on = p === current
          return (
            <button
              key={p}
              type="button"
              className={`llm-eng ${on ? "on" : ""} ${v == null ? "none" : ""}`.trim()}
              data-engine={p}
              aria-pressed={on}
              disabled={on}
              onClick={() => onSelect(p)}
            >
              <span className="top">
                <PlatformMark id={p} size={15} />
                <b>{ENGINES[p].label}</b>
              </span>
              {/* A dash, not 0%: "tracked but never run" and "never names you"
                  are different findings and only one is bad news. */}
              <span className="v">{v == null ? "—" : pct(v)}</span>
              <span className="k">{v == null ? "not run yet" : "mention rate"}</span>
            </button>
          )
        })}
      </div>
    </>
  )
}

/**
 * Who the assistant named instead, summed across this run's answers.
 *
 * The per-answer chips have always been there, but nothing added them up — so
 * "who is being recommended in my place, for this question" could only be
 * answered by reading every answer and counting by hand.
 */
export function RivalsSummary({ samples }: { samples: { competitorsMentioned: string[] | null }[] }) {
  const counts = new Map<string, number>()
  for (const s of samples) for (const c of s.competitorsMentioned ?? []) counts.set(c, (counts.get(c) ?? 0) + 1)
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1])
  if (rows.length === 0) return null
  return (
    <div className="card" style={{ padding: 0, marginBottom: 12 }}>
      <div className="llm-rivals">
        <span className="tiny muted">Also named across these answers:</span>
        {rows.map(([name, n]) => (
          <span className="chip outline" key={name}>
            {name}
            <b>{n}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * The sources this run's answers cited.
 *
 * The same leaderboard the assistant pages use, rather than the two-column
 * table this page had: the question is "which source dominates", and a bar
 * answers that where a column of numbers asks you to compare them yourself.
 */
export function PromptSources({
  samples,
  brandDomain,
}: {
  samples: { citations: { title: string; url: string; domain: string }[] | null }[]
  brandDomain: string | null
}) {
  const byDomain = new Map<string, { domain: string; title: string; url: string; count: number }>()
  for (const s of samples) {
    for (const c of s.citations ?? []) {
      const prev = byDomain.get(c.domain)
      if (prev) prev.count += 1
      else byDomain.set(c.domain, { domain: c.domain, title: c.title, url: c.url, count: 1 })
    }
  }
  const rows = [...byDomain.values()].sort((a, b) => b.count - a.count)

  if (rows.length === 0) {
    return (
      <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
        No sources cited in these answers.
      </div>
    )
  }

  const max = Math.max(...rows.map((r) => r.count), 1)
  const own = (brandDomain ?? "").toLowerCase().replace(/^www\./, "")

  return (
    <div className="card" style={{ padding: 0 }}>
      <ol className="llm-srcs-list">
        {rows.map((r) => {
          const isOwn = !!own && (r.domain === own || r.domain.endsWith(`.${own}`))
          return (
            <li className={`llm-src ${isOwn ? "is-own" : ""}`.trim()} key={r.domain}>
              <Favicon domain={r.domain} size={18} />
              <span className="n">
                <b>{r.domain}</b>
                <span>
                  <a href={r.url} target="_blank" rel="noopener noreferrer nofollow">
                    {r.title || r.domain}
                  </a>
                </span>
              </span>
              {isOwn && <span className="chip">You</span>}
              <span className="bar" role="img" aria-label={`${r.count} answers cited this`}>
                <i style={{ ["--v" as string]: `${Math.round((r.count / max) * 100)}%` }} />
              </span>
              <b className="ct tabular">{r.count}</b>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/**
 * One answer: the evidence behind the percentage.
 *
 * Every answer used to be a flat `.card`, indistinguishable from the chrome
 * around it. Now the verdict sits on its own strip, the answer body is its own
 * reading surface, and what the assistant also named and searched moves to a
 * footer instead of trailing loose off the bottom of the text.
 */
export function AnswerCard({
  index,
  mentioned,
  cited,
  failed,
  checkUrl,
  competitors,
  fanOut,
  children,
}: {
  index: number
  mentioned: boolean
  cited: boolean
  failed: boolean
  checkUrl: string | null
  competitors: string[] | null
  fanOut: string[] | null
  children: React.ReactNode
}) {
  const hasFooter = !!competitors?.length || !!fanOut?.length
  return (
    <article className={`llm-answer ${mentioned ? "hit" : ""}`.trim()}>
      <header className="llm-answer-h">
        <span className="llm-answer-n" aria-hidden>
          {index + 1}
        </span>
        {failed ? (
          <span className="chip neg">Failed</span>
        ) : mentioned ? (
          <span className="chip brand">Mentioned</span>
        ) : (
          // A real, reportable finding — not an empty state.
          <span className="chip">Not mentioned</span>
        )}
        {cited && <span className="chip pos">Cited</span>}
        <span className="sp" />
        {/* ChatGPT is the only assistant that returns a link back to the live
            answer, so this appears there and nowhere else. */}
        {checkUrl && (
          <a href={checkUrl} target="_blank" rel="noopener noreferrer" className="llm-verify">
            <ExternalLink aria-hidden /> Reproduce
          </a>
        )}
      </header>
      <div className="llm-answer-b">{children}</div>
      {hasFooter && (
        <footer className="llm-answer-f">
          {!!competitors?.length && (
            <div className="r">
              <span className="tiny muted">Also named</span>
              {competitors.map((c) => (
                <span className="chip outline" key={c}>
                  {c}
                </span>
              ))}
            </div>
          )}
          {!!fanOut?.length && (
            <div className="r">
              <span className="tiny muted">Searched</span>
              {fanOut.map((q, i) => (
                <span className="chip" key={`${q}-${i}`}>
                  {q}
                </span>
              ))}
            </div>
          )}
        </footer>
      )}
    </article>
  )
}
