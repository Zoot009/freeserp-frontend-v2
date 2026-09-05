/**
 * Per-assistant profiles for the AI engine pages.
 *
 * WHY THIS FILE EXISTS
 * The four routes under /dashboard/ai-platforms rendered one component with a
 * swapped label and icon, so four sidebar entries promised four destinations and
 * delivered one — and when an assistant had no data, all four ended at the same
 * "Open AI Prompt Tracker" button. The fix is not four hand-written pages, which
 * drift within a quarter, but one page that reads a profile per assistant.
 *
 * A profile decides four things: the accent, the capability facts, WHICH numbers
 * lead, and — the substantive one — the ORDER OF THE SECTIONS. ChatGPT opens on
 * position, Perplexity opens on citations, Gemini opens on its own limits,
 * Claude opens on cost. That ordering is the differentiation; the colour is just
 * how you tell at a glance which page you are on.
 *
 * SOURCE OF TRUTH for every capability claim below:
 *   backend src/modules/llm-tracker/llmPlatform.adapter.ts  → CAPABILITIES
 *   backend src/modules/credits/catalog.ts                   → the rate cards
 * Stale facts are the one failure mode that makes this page worse than the bland
 * one it replaced. If you change the adapter, change this.
 *
 * A NOTE ON GEO. The capability flag says chat_gpt supports geo, but runSample's
 * `scraper` branch pins `location_code: 2840` and never forwards `countryIso` —
 * so per-country answers are real on the two `responses` assistants only. This
 * file states what the code does, not what the flag says.
 *
 * i18n: strings here are inline English, matching the convention in this
 * dashboard section (see the header of ai-platforms/[platform]/page.tsx). They
 * need the same messages/*.json treatment as TOOL_CONTEXT before the es/fr/de
 * launch. Nav labels stay in messages/*.json — those are brand names and are
 * identical across locales.
 *
 * lib/ai-tracker.ts stays the shared VOCABULARY (the Platform union, run states,
 * formatters). Editorial copy lives here so the vocabulary file stays importable
 * from anywhere without dragging page copy along.
 */

import type { Platform } from "@/lib/ai-tracker"

/**
 * A capability, as the customer experiences it — not as the API expresses it.
 *
 * These no longer get a card each. HowItWorks renders the ones that are NOT a
 * plain "yes" as the caveat line under its four steps, which is where a limit
 * belongs once the panel is about our method rather than about the assistant.
 * The `icon` field went with the cards — nothing read it afterwards.
 */
export type Capability = {
  label: string
  /**
   * `no` is a first-class state, not an error. An assistant that cannot do
   * something gets a sentence saying so — a dash in a data cell reads as broken,
   * a sentence reads as a product that knows its own limits.
   */
  state: "yes" | "no" | "note"
  detail: string
}

/** Which panel, in which order. The page maps this through a section registry. */
export type SectionKey =
  | "metrics"
  /** The "how the tracker works" panel — formerly the capability strip. The
   *  per-assistant `caps` still feed its caveat line, so that data is not
   *  orphaned by the rename. */
  | "how"
  | "board"
  | "sources"
  | "competitors"
  | "fanout"
  | "cost"
  | "coverage"
  | "cross"

/** Which headline numbers, in which order. Same four figures, different claim. */
export type MetricKey = "tracked" | "appear" | "rate" | "cited" | "position"

/** Which columns the prompt board carries for this assistant. */
export type ColumnKey =
  | "prompt"
  | "trend"
  | "status"
  | "rate"
  | "position"
  | "cited"
  | "sources"
  | "credits"
  | "verify"

export type EngineProfile = {
  id: Platform
  slug: string
  label: string
  /** One line. What this assistant is, not what the feature does. */
  tagline: string
  /** 1 for everything except Claude. Mirrors the credits catalog's rate cards. */
  creditsPerAnswer: 1 | 3
  caps: Capability[]
  metrics: MetricKey[]
  columns: ColumnKey[]
  sections: SectionKey[]
}

export const ENGINES: Record<Platform, EngineProfile> = {
  chat_gpt: {
    id: "chat_gpt",
    slug: "chatgpt",
    label: "ChatGPT",
    tagline:
      "Scraped from the live product with web search forced on — and the only assistant that hands back a link to the answer it actually gave.",
    creditsPerAnswer: 1,
    caps: [
      {
        state: "yes",
        label: "Live web search",
        detail:
          "Forced on every answer, so you measure what the product serves today rather than what it memorised.",
      },
      {
        state: "no",
        label: "Per-country answers",
        detail: "Answers are collected from a US location. Country targeting is not applied on this assistant.",
      },
      {
        state: "yes",
        label: "Reproduce any answer",
        detail: "Every sample links back to the live page it came from. No other assistant returns one.",
      },
      { state: "note", label: "1 credit an answer", detail: "A five-answer run costs five credits." },
    ],
    // Position leads: ChatGPT is the assistant where being named early is both
    // measurable and verifiable, and position is the figure this audience
    // already reads as a rank.
    metrics: ["tracked", "appear", "rate", "position"],
    columns: ["prompt", "trend", "status", "rate", "position", "verify"],
    sections: ["metrics", "board", "fanout", "coverage", "how", "cross"],
  },

  gemini: {
    id: "gemini",
    slug: "gemini",
    label: "Gemini",
    tagline:
      "The live product reading Google's index. It answers on its own terms: no country targeting, and retrieval you cannot force.",
    creditsPerAnswer: 1,
    caps: [
      {
        state: "no",
        label: "Per-country answers",
        detail:
          "Gemini rejects the country parameter outright, so per-country visibility cannot be measured here at all.",
      },
      {
        state: "no",
        label: "Forced web search",
        detail:
          "Cannot be forced. You get whatever the product chose to retrieve — which is also what a real user sees.",
      },
      {
        state: "yes",
        label: "Reads Google's index",
        detail:
          "Scraped from the live product, so its sources are the pages Google is surfacing about you right now.",
      },
      { state: "note", label: "1 credit an answer", detail: "A five-answer run costs five credits." },
    ],
    metrics: ["tracked", "appear", "rate", "cited"],
    columns: ["prompt", "trend", "status", "rate", "cited"],
    // The method panel sits ABOVE the board here, which no other assistant does.
    // Gemini is the one that cannot be forced to retrieve and refuses country
    // targeting, so how a number gets made — and the caveats at the foot of it —
    // is the first honest thing to say about it; the sources panel is the payoff.
    sections: ["metrics", "how", "board", "sources", "coverage", "cross"],
  },

  perplexity: {
    id: "perplexity",
    slug: "perplexity",
    label: "Perplexity",
    tagline:
      "A search engine that writes. Every answer is retrieved and sourced, so on this page a citation — not a mention — is the score that counts.",
    creditsPerAnswer: 1,
    caps: [
      {
        state: "yes",
        label: "Always retrieves",
        detail:
          "A search product by construction: there is no retrieval to force because it never stops. A mention with no link is the anomaly here.",
      },
      {
        state: "yes",
        label: "Per-country answers",
        detail: "Country targeting is applied, so visibility can be measured market by market.",
      },
      {
        state: "no",
        label: "Reproduce the answer",
        detail: "An API answer has no shareable page. The full answer text is stored with the run instead.",
      },
      { state: "note", label: "1 credit an answer", detail: "A five-answer run costs five credits." },
    ],
    // The same four numbers as everyone else, reordered to make a different
    // claim about which one matters.
    metrics: ["cited", "rate", "appear", "tracked"],
    columns: ["prompt", "trend", "status", "rate", "cited", "sources"],
    sections: ["metrics", "sources", "board", "competitors", "how", "cross"],
  },

  claude: {
    id: "claude",
    slug: "claude",
    label: "Claude",
    tagline:
      "An API answer with web search forced on. The most expensive assistant to measure — priced apart rather than averaged in.",
    creditsPerAnswer: 3,
    caps: [
      {
        state: "note",
        label: "3 credits an answer",
        detail:
          "Roughly six times what a ChatGPT answer costs to collect, so it is priced on its own rather than folded into an average.",
      },
      {
        state: "yes",
        label: "Live web search",
        detail: "Forced on every answer. Without it the model answers from training memory and cites nothing.",
      },
      {
        state: "yes",
        label: "Per-country answers",
        detail: "Country targeting is applied, so visibility can be measured market by market.",
      },
      {
        state: "no",
        label: "Reproduce the answer",
        detail: "An API answer has no shareable page. The full answer text is stored with the run instead.",
      },
    ],
    metrics: ["tracked", "appear", "rate", "cited"],
    columns: ["prompt", "trend", "status", "rate", "cited", "credits"],
    sections: ["metrics", "cost", "board", "competitors", "how", "cross"],
  },
}

/**
 * Reading order for the cross-assistant rail and any list of all four.
 *
 * Alphabetical-by-nothing on purpose: this is the order the sidebar lists them
 * in, and a rail that disagrees with the nav makes the reader re-find their
 * place. Not PLATFORMS from ai-tracker.ts — that mirrors the backend's array,
 * which is iterated, not read.
 */
export const ENGINE_ORDER: Platform[] = ["chat_gpt", "gemini", "perplexity", "claude"]

/**
 * The short capability note shown beside each assistant in the add-prompts
 * modal, sourced from the profile so the modal and the engine page can never
 * disagree. The modal used to carry its own copy, which is how it ended up
 * claiming Perplexity and Claude have "no prominence" — prominence is a
 * character offset computed platform-blind in llmMetrics.ts and works on all
 * four.
 */
export const ENGINE_NOTE: Record<Platform, string> = {
  chat_gpt: "Live product output, with a link back to the answer",
  gemini: "Live product output; no country targeting",
  perplexity: "API answer; always retrieves, so almost always cited",
  claude: "API answer; 3 credits each, not 1",
}
