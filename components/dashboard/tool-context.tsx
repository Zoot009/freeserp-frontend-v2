"use client"

import { useEffect, useState } from "react"
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
 */

export type ToolContextContent = {
  /** One sentence: what the tool does. Plain, no pitch. */
  lede: string
  /** Two or three angles on it. Headings are short and uppercase in the UI. */
  points: { head: string; body: string }[]
}

// Copy lives here rather than in each page so the twelve tools read as one
// product — same voice, same length, same three questions answered.
//
// NOTE: English only for now. The dashboard's translated pages pull their
// strings from messages/*.json; this needs the same treatment before it ships
// to the es/fr/de audiences.
export const TOOL_CONTEXT: Record<string, ToolContextContent> = {
  "google-tracker": {
    lede: "Tracks where your domain ranks on Google for the keywords you choose, in the country you choose, and keeps that position as history.",
    points: [
      {
        head: "Why it matters",
        body: "One position is trivia; the line it draws is the signal. The trend tells you whether a page is gaining ground, being overtaken, or slipping after a change you made — which a one-off search never can.",
      },
      {
        head: "How to read it",
        body: "One project per domain, keywords underneath it. Every check stores one real position per keyword, so a card's trend is recorded history rather than an estimate. Projects with no checks yet show no trend, not a flat line.",
      },
    ],
  },
  "youtube-tracker": {
    lede: "Tracks where a channel's or a video's results appear in YouTube search for the keywords you add.",
    points: [
      {
        head: "Why it matters",
        body: "YouTube is the second-largest search engine, and its rankings move for reasons Google's don't — age, watch time and length matter as much as the words in the title. Views and age sit beside the position because they are what explain a move.",
      },
      {
        head: "How to read it",
        body: "Results are personalised and shift through the day, so treat a position as a trend, not an exact rank. Depth sets how far down a check looks: a video sitting 34th is simply invisible to a Top 20 check.",
      },
    ],
  },
  "maps-tracker": {
    lede: "Scans a grid of points around a location and reports where a business appears in Google Maps results at each one.",
    points: [
      {
        head: "Why it matters",
        body: "Local rank is not one number — it changes street by street. A business can sit first at its own address and vanish two miles away, and a single-point check would never show it.",
      },
      {
        head: "How to read it",
        body: "Each cell in the grid is one real search run from that coordinate. Read the shape, not the average: a strong centre with weak edges is a different problem from being weak everywhere.",
      },
    ],
  },
  "ai-prompt-tracker": {
    lede: "Tracks whether AI assistants name your brand when someone asks them the questions your customers ask.",
    points: [
      {
        head: "Why it matters",
        body: "An answer from an assistant increasingly replaces the click on a blue link. If a model recommends three companies in your category and none of them is you, that is the new page two — and it is invisible in every rank report you own.",
      },
      {
        head: "How to read it",
        body: "Track prompts a real customer would type, not keywords. Each run records which brands were named and which sources were cited, so you can see who is being recommended in your place and where the model is reading it from.",
      },
    ],
  },
  keywords: {
    lede: "Every keyword you track, across every project, in one list.",
    points: [
      {
        head: "Why it matters",
        body: "A project page answers “how is this site doing”. This answers “where am I strong or weak overall” — your best and worst positions, and the same keyword across several sites, without opening each project in turn.",
      },
      {
        head: "How to read it",
        body: "Sort by position to find what is nearly there: keywords sitting between 11 and 20 are usually one improvement away from page one, which is where nearly all the clicks are.",
      },
    ],
  },
  favorites: {
    lede: "The projects and keywords you starred, gathered in one place.",
    points: [
      {
        head: "Why it matters",
        body: "Tracking hundreds of keywords means the dozen that actually pay the bills get lost among them. This is the working set you check first.",
      },
      {
        head: "How to read it",
        body: "Star anything from its row or card and it appears here. Nothing is copied or duplicated — these are the same items, just gathered.",
      },
    ],
  },
  "quick-serp": {
    lede: "Runs one search and shows you the live result page, without adding anything to a project.",
    points: [
      {
        head: "Why it matters",
        body: "For the question you have right now — who ranks for this, what does the page look like in that country — when you do not want the keyword followed forever.",
      },
      {
        head: "How to read it",
        body: "Nothing here is stored against a project and no history is kept. If the answer matters next week too, track the keyword instead.",
      },
    ],
  },
  "keyword-magic": {
    lede: "Turns one seed keyword into hundreds of real keyword ideas, with search volume, difficulty, CPC and intent.",
    points: [
      {
        head: "Why it matters",
        body: "The keyword you would think of first is usually the hardest one in your market. The variants around it are where the winnable traffic is, and you cannot guess them — volume and difficulty have to come from data.",
      },
      {
        head: "How to read it",
        body: "Intent decides what to build: informational terms want an article, transactional ones want a product or service page. Difficulty decides whether you can realistically take it at your current authority.",
      },
    ],
  },
  "keyword-score-checker": {
    lede: "Crawls one of your own pages and scores it against a target keyword — on-page and off-page, with no competitors involved.",
    points: [
      {
        head: "Why it matters",
        body: "When a page will not rank, this tells you whether the page itself is the problem before you spend a month on links or competitor research.",
      },
      {
        head: "How to read it",
        body: "The score is a summary; the failed checks are the work. They come back in priority order, so start at the top rather than trying to clear the list.",
      },
    ],
  },
  "website-audit": {
    lede: "Crawls a page — or a whole site — with a real browser and runs 63 SEO rules over what loads.",
    points: [
      {
        head: "Why it matters",
        body: "Technical faults never show up in a rank report. They just quietly cap what every page on the site can achieve, no matter how good the content is.",
      },
      {
        head: "How to read it",
        body: "A real browser is the point: it sees what renders, including anything injected by JavaScript, rather than the raw HTML a simple fetch would return. Issues arrive in priority order with the exact fix.",
      },
    ],
  },
  "competitor-analysis": {
    lede: "Crawls your site and the competitors you name for one keyword, then compares them side by side.",
    points: [
      {
        head: "Why it matters",
        body: "Ranking is relative, not absolute. There is no score that makes a page rank — only being better than the specific pages currently above it for that specific search.",
      },
      {
        head: "How to read it",
        body: "Look for the gaps that repeat across every competitor above you. One rival doing something is a choice; all of them doing it is the bar for that keyword.",
      },
    ],
  },
  "ai-internal-linking": {
    lede: "Crawls a domain's internal links and maps how authority moves between its pages.",
    points: [
      {
        head: "Why it matters",
        body: "Internal links are the only ranking factor you fully control — no outreach, no waiting. An orphan page receives none of your site's authority no matter how good it is.",
      },
      {
        head: "How to read it",
        body: "Orphans need a link from somewhere relevant. Hubs are where you have authority to spend, so a link added there is worth more than the same link added anywhere else.",
      },
    ],
  },
}

const storageKey = (id: string) => `fs.toolctx.${id}`

export function ToolContext({ id }: { id: keyof typeof TOOL_CONTEXT | string }) {
  const content = TOOL_CONTEXT[id]
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

  if (!content || shown === null) return null

  if (!shown) {
    return (
      <button type="button" className="tool-ctx-show" onClick={() => persist(true)}>
        <Icon.info size={13} /> What is this tool for?
      </button>
    )
  }

  return (
    <section className="card tool-ctx" aria-label="About this tool">
      <div className="tool-ctx-top">
        <span className="tool-ctx-icon" aria-hidden>
          <Icon.info size={14} />
        </span>
        <p className="tool-ctx-lede">{content.lede}</p>
        <button type="button" className="tool-ctx-hide" onClick={() => persist(false)}>
          Hide
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
