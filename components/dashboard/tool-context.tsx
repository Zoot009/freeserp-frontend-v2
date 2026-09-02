"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Icon } from "./icons"

/**
 * The "what is this tool for" panel that sits under a tool's title.
 *
 * Every tool page already carries a one-line subtitle saying what the screen
 * IS. What none of them said is why the tool exists, what the numbers on it
 * mean, or what to do first — the context a Semrush report puts above the data.
 * Someone landing on Rank Tracker with no rank data yet was reading an empty
 * grid with no explanation of what filling it would tell them.
 *
 * Dismissible per tool, because this is scaffolding: useful once, clutter on
 * the two-hundredth visit. Hiding it leaves a one-line link to bring it back,
 * rather than removing the explanation from the product permanently.
 *
 * The copy lives in messages/*.json under `toolContext`, not in this file. It
 * used to be a const here with a note admitting it was English-only, and the
 * note was right: a French account read a fully translated Quick SERP Checker
 * page with two paragraphs of English sitting directly under its title — the
 * only untranslated thing on the screen, and the part whose whole job is
 * explaining. Same voice, same three questions, four languages.
 */

export type ToolContextContent = {
  /** One sentence: what the tool does. Plain, no pitch. */
  lede: string
  /** Two or three angles on it. Headings are short and uppercase in the UI. */
  points: { head: string; body: string }[]
}

/**
 * Tools that have copy written for them.
 *
 * Checked before asking for the message, because `raw()` on a key that isn't
 * there does not come back as undefined — it throws in development and returns
 * the key path in production, which would print "quick-serp" into the panel.
 * Two pages (Keywords, Favorites) mount this with ids that have copy; anything
 * else renders nothing, as it always has.
 */
const TOOL_IDS = [
  "google-tracker",
  "youtube-tracker",
  "maps-tracker",
  "ai-prompt-tracker",
  "keywords",
  "favorites",
  "quick-serp",
  "keyword-magic",
  "keyword-score-checker",
  "website-audit",
  "page-audit",
  "competitor-analysis",
  "ai-internal-linking",
] as const

export type ToolContextId = (typeof TOOL_IDS)[number]

const storageKey = (id: string) => `fs.toolctx.${id}`

export function ToolContext({ id }: { id: ToolContextId | string }) {
  const t = useTranslations("toolContext")
  // null until the stored preference has been read: rendering the panel and then
  // pulling it away would be worse than a beat of nothing, and rendering the
  // collapsed link first would flash for everyone who has never dismissed it.
  const [shown, setShown] = useState<boolean | null>(null)

  useEffect(() => {
    try {
      setShown(window.localStorage.getItem(storageKey(id)) !== "0")
    } catch {
      // Private mode / storage disabled: show it. The panel is the safe default.
      setShown(true)
    }
  }, [id])

  const persist = (next: boolean) => {
    setShown(next)
    try {
      window.localStorage.setItem(storageKey(id), next ? "1" : "0")
    } catch {
      /* preference simply doesn't persist */
    }
  }

  const known = (TOOL_IDS as readonly string[]).includes(id)
  if (!known || shown === null) return null

  // raw(), not t(): `points` is an array of objects, which the formatter has no
  // way to render. The shape is ours on both sides — the messages are checked
  // into this repo, not fetched — so the cast is describing a fact rather than
  // hoping for one.
  const content = t.raw(id) as ToolContextContent

  if (!shown) {
    return (
      <button type="button" className="tool-ctx-show" onClick={() => persist(true)}>
        <Icon.info size={13} /> {t("show")}
      </button>
    )
  }

  return (
    <section className="card tool-ctx" aria-label={t("aria")}>
      <div className="tool-ctx-top">
        <span className="tool-ctx-icon" aria-hidden>
          <Icon.info size={14} />
        </span>
        <p className="tool-ctx-lede">{content.lede}</p>
        <button type="button" className="tool-ctx-hide" onClick={() => persist(false)}>
          {t("hide")}
        </button>
      </div>
      <div className="tool-ctx-grid">
        {content.points.map((p) => (
          <div key={p.head}>
            <div className="tool-ctx-h">{p.head}</div>
            <p className="tool-ctx-b">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
