"use client"

/**
 * The engine page's header and its capability strip.
 *
 * Both render in EVERY state, empty included. Most accounts run one assistant,
 * so for most people three of the four pages have no data — and if the redesign
 * only improved the populated page, most users would see no change at all. An
 * empty Gemini page still has to say what Gemini tracking is and how it differs
 * from ChatGPT's; that is what makes them two different pages rather than two
 * copies of the same dashed box.
 */

import Link from "next/link"
import { Coins, ExternalLink, Globe, Link2, MapPin, Search } from "lucide-react"
import { PlatformMark } from "@/components/dashboard/platform-marks"
import type { Capability, EngineProfile } from "@/lib/ai-engines"

const CAP_ICON = {
  globe: Globe,
  "map-pin": MapPin,
  "external-link": ExternalLink,
  coins: Coins,
  search: Search,
  link: Link2,
} as const satisfies Record<Capability["icon"], unknown>

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
 * What the assistant can and cannot do, in sentences.
 *
 * A capability that does not exist gets a sentence, never a dash in a data cell:
 * a dash reads as broken, a sentence reads as a product that knows its own
 * limits. State is never carried by colour alone — the icon and the wording each
 * say it independently.
 */
export function EngineCaps({ engine }: { engine: EngineProfile }) {
  return (
    <>
      <SectionHead
        title={`What ${engine.label} can and can't do`}
        why="Measured against this assistant's own API — not a feature list"
      />
      <section className="llm-caps" aria-label={`${engine.label} capabilities`}>
        {engine.caps.map((c) => {
          const Ico = CAP_ICON[c.icon]
          return (
            <div className={`llm-cap ${c.state}`} key={c.label}>
              <Ico aria-hidden />
              <div>
                <b>{c.label}</b>
                <span>{c.detail}</span>
              </div>
            </div>
          )
        })}
      </section>
    </>
  )
}
