"use client"

/**
 * Your tools — every tool in the product, promoted from the project overview.
 *
 * This was "Next steps": five numbered items with an Open button each. Two
 * problems with that framing. A numbered checklist says there is a finite list
 * to get through and then be done with, so the tools it named read as setup
 * chores rather than as the product — and once the first two were ticked the
 * card was mostly spent. And five slots is not what we ship: the Maps tracker,
 * the AI Prompt Tracker, the YouTube tracker, Quick SERP and the keyword
 * research tools were all absent from the one page every user lands on, which
 * left the sidebar as the only place they existed.
 *
 * Twelve tools now, as real cards at three across — the shape the rest of this
 * dashboard uses. Two earlier passes at this were flat: a grid of small tiles
 * with grey chips, which promoted everything and made none of it look worth
 * opening. A card here carries its own hue through the icon chip, a tint
 * pooling in the top-right corner over a vertical wash (the surface the stat
 * strips already use), a coloured shadow it lifts into on hover, and a CTA
 * filled in the same hue.
 *
 * All twelve show. There was an expander here holding six of them back, for a
 * good reason at the time: the card sat directly under the stat strip, and
 * four rows of card between the headline figures and the panels that explain
 * them meant the project's own numbers started below the fold. The card lives
 * at the FOOT of the overview now, under the data, where hiding half the
 * product behind a click buys nothing and costs the promotion this card exists
 * to do. It is also where a reader arrives having already seen their numbers,
 * which is the moment "what else is there" is a real question.
 *
 * The whole card is the link. There is no separate button, because a button
 * inside an anchor is a second target for the same destination.
 *
 * The two cards we can verify keep saying what they know, as a pill by the
 * icon rather than a tick against a step:
 *
 *   • The rank tracker reports what is tracked and how much of it places, and
 *     with nothing tracked it opens the add panel directly (?add=1) rather than
 *     landing on an empty table carrying the same button to press again.
 *   • Search Console is verified in TWO parts, because the connection and the
 *     data are different things:
 *       /api/gsc/connection      — is a Google account linked? Account-wide.
 *       /api/gsc/projects/:id/site — which property feeds THIS project?
 *     Only the first was being checked once, so one connection made every
 *     project on the account claim to be set up — including projects pointed at
 *     somebody else's domain. The backend doesn't validate the pairing on link
 *     either, so the domain check happens here.
 *
 * The rank tracker stays first among the twelve: every panel above this card
 * is computed from tracked keywords, and with none added the rest of the page
 * is decoration.
 */

import type { ComponentType } from "react"
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Check,
  Globe,
  KeyRound,
  LineChart,
  Link2,
  Loader2,
  MapPin,
  ScanSearch,
  Search,
  Sparkles,
  Users,
  Youtube,
  Zap,
} from "lucide-react"
import { Link } from "@/i18n/navigation"
import { Widget } from "@/components/dashboard/widget"
import { cn } from "@/lib/utils"

export type GscState = {
  /** Account-level grant. null while the check is in flight. */
  connected: boolean | null
  /** Property linked to THIS project, e.g. "sc-domain:example.com". */
  siteUrl: string | null
  projectDomain: string | null
}

/**
 * Search Console property → the bare host it covers.
 * Domain properties arrive as "sc-domain:example.com"; URL-prefix properties as
 * "https://www.example.com/".
 */
function propertyHost(siteUrl: string): string | null {
  const s = siteUrl.trim()
  if (s.startsWith("sc-domain:")) return s.slice("sc-domain:".length).toLowerCase() || null
  try {
    return new URL(s).hostname.toLowerCase().replace(/^www\./, "") || null
  } catch {
    return null
  }
}

/**
 * Does this property actually cover the project's domain?
 *
 * Deliberately lenient about subdomains in both directions — a domain property
 * on example.com legitimately covers blog.example.com, and a project tracking
 * blog.example.com is correctly served by either. Anything else is a mismatch
 * worth surfacing, because it silently reports another site's numbers.
 */
export function propertyCoversDomain(siteUrl: string, projectDomain: string): boolean {
  const host = propertyHost(siteUrl)
  const domain = projectDomain.trim().toLowerCase().replace(/^www\./, "")
  if (!host || !domain) return false
  return host === domain || host.endsWith(`.${domain}`) || domain.endsWith(`.${host}`)
}

type Step = {
  title: string
  description: string
  href: string
  cta: string
  /** true / false when we can check, null when there is no signal for it. */
  done: boolean | null
  /** Shown under the description when something needs attention. */
  warning?: string
  primary?: boolean
  /** Work is already running for this step — the CTA reports it instead of
   *  inviting a second start. */
  busy?: boolean
}

function searchConsoleStep(projectId: string, gsc: GscState): Step {
  const href = `/dashboard/project/${projectId}/search-console`
  const base = {
    title: "Search Console",
    href,
  }

  // Unknown — the check hasn't come back. Neither claim is safe yet.
  if (gsc.connected === null) {
    return { ...base, description: "Connect Google Search Console to sit real clicks and impressions beside the modelled figures.", cta: "Connect", done: null }
  }

  if (!gsc.connected) {
    return { ...base, description: "Connect Google Search Console to sit real clicks and impressions beside the modelled figures.", cta: "Connect", done: false }
  }

  // Account linked, but nothing feeds this project yet.
  if (!gsc.siteUrl) {
    return {
      ...base,
      description: "Google is connected. Pick the Search Console property that covers this project to pull in real clicks and impressions.",
      cta: "Choose property",
      done: false,
    }
  }

  // Linked to a property that doesn't cover this domain — worse than unlinked,
  // because it reports another site's numbers as if they were yours.
  if (gsc.projectDomain && !propertyCoversDomain(gsc.siteUrl, gsc.projectDomain)) {
    return {
      ...base,
      description: "Real clicks and impressions from Google Search Console.",
      warning: `Linked to ${gsc.siteUrl} — that property doesn't cover ${gsc.projectDomain}.`,
      cta: "Fix property",
      done: false,
    }
  }

  return {
    ...base,
    description: `Real clicks and impressions from ${gsc.siteUrl}.`,
    cta: "Connected",
    done: true,
  }
}

/** Keyword counts for THIS project. null while the overview is still loading —
 *  the step then shows no verdict rather than claiming an empty project. */
export type KeywordState = { total: number; ranked: number } | null

function trackKeywordsStep(projectId: string, keywords: KeywordState, analysing: boolean): Step {
  // Two destinations, because the step means two different things. With nothing
  // tracked the CTA is a promise to add keywords, so it opens the add panel
  // itself (?add=1) rather than landing on an empty table carrying the same
  // button to press a second time — the click that promised the work should do
  // the work. Once keywords exist, "N tracked" reports them, and the table it
  // links to IS what it is reporting.
  const href = `/dashboard/project/${projectId}/keywords`
  const addHref = `${href}?add=1`
  const base = { title: "Track keywords", href, primary: true }

  // Adding a project starts a keyword analysis by itself, server-side. While it
  // runs, "Add keywords" is the wrong thing to say — the work is already being
  // done, and inviting the same work again is how people end up doing it twice.
  if (analysing && (keywords?.total ?? 0) === 0) {
    return {
      ...base,
      description: "We're reading the site and working out which keywords it should rank for. They'll appear here on their own.",
      cta: "Finding keywords…",
      done: null,
      busy: true,
    }
  }

  if (keywords === null) {
    return {
      ...base,
      href: addHref,
      description: "Add the searches you want this site to rank for. Everything else on this page is measured against them.",
      cta: "Add keywords",
      done: null,
    }
  }

  if (keywords.total === 0) {
    return {
      ...base,
      href: addHref,
      description: "Add the searches you want this site to rank for. Everything else on this page is measured against them.",
      cta: "Add keywords",
      done: false,
    }
  }

  // Tracked but nothing has placed yet. Not a failure — a new project has no
  // history — so it stays "done" and the copy says what to expect instead.
  if (keywords.ranked === 0) {
    return {
      ...base,
      description: `Tracking ${keywords.total} keyword${keywords.total === 1 ? "" : "s"}. None are placing in the top 100 yet — positions appear as checks run.`,
      cta: `${keywords.total} tracked`,
      done: true,
    }
  }

  return {
    ...base,
    description: `Tracking ${keywords.total} keyword${keywords.total === 1 ? "" : "s"}, ${keywords.ranked} of them ranking.`,
    cta: `${keywords.total} tracked`,
    done: true,
  }
}

/**
/**
 * A tool card. Same shape whether or not we can say anything about its state —
 * a tool we cannot verify still gets promoted, it just has no status line.
 */
type Tool = {
  title: string
  description: string
  href: string
  icon: ComponentType<{ className?: string }>
  /**
   * The card's colour, as bare RGB channels so one value drives the icon chip,
   * the corner glow and the hover ring. Tailwind cannot express "this card's
   * hue" without a class per colour per use, and a class list that long is
   * where a card ends up half-tinted.
   *
   * Kept off emerald and amber: those mean "confirmed" and "needs attention"
   * everywhere else here, and a tool tinted emerald for being a tool would
   * claim a state it has not got.
   */
  hue: string
  /** Confirmed state, when there is any: "10 tracked", "Connected". */
  status?: string
  /** Needs attention. Overrides the hue and pulls the card into view. */
  warning?: string
  /** Work is already running — reported, not invited. */
  busy?: boolean
  /** The tracker. Everything else on the page is measured against it. */
  primary?: boolean
}

/** A step's verified state, mapped onto the card that now carries it. */
function toolState(s: Step): Pick<Tool, "status" | "warning" | "busy"> {
  return {
    // Busy carries its CTA too ("Finding keywords…"): a spinner with no words
    // beside it says something is happening but not what.
    ...(s.done || s.busy ? { status: s.cta } : {}),
    ...(s.warning ? { warning: s.warning } : {}),
    ...(s.busy ? { busy: true } : {}),
  }
}

export function SetupCard({
  projectId,
  gsc,
  keywords,
  auditRunning = false,
  keywordsAnalysing = false,
}: {
  projectId: string
  gsc: GscState
  keywords: KeywordState
  /** A site crawl is queued or running for this project. */
  auditRunning?: boolean
  /** The automatic keyword analysis is in flight for this project. */
  keywordsAnalysing?: boolean
}) {
  const keywordStep = trackKeywordsStep(projectId, keywords, keywordsAnalysing)
  const gscStep = searchConsoleStep(projectId, gsc)

  // Ordered by what a project reaches for first, because the first six are what
  // most people will ever see of this card.
  const tools: Tool[] = [
    {
      title: "Keyword Rank Tracker",
      description: keywordStep.description,
      href: keywordStep.href,
      icon: LineChart,
      hue: "45 91 255",
      primary: true,
      ...toolState(keywordStep),
    },
    {
      title: "Full Website Audit",
      description: auditRunning
        ? "Crawling now — status codes, titles, headings and internal links. The report lands on this page."
        : "Crawl the site with a real browser and get the technical faults that cap every page, in priority order.",
      href: "/dashboard/site-audit",
      icon: ScanSearch,
      hue: "139 92 246",
      ...(auditRunning ? { busy: true, status: "Crawling…" } : {}),
    },
    {
      title: "Google Maps Tracker",
      description: "Track a business across a city grid and see exactly where it drops out of the local pack.",
      href: "/dashboard/google-maps-tracker",
      icon: MapPin,
      hue: "244 63 94",
    },
    {
      title: "AI Prompt Tracker",
      description: "Watch whether ChatGPT, Claude, Gemini and Perplexity name your brand on the prompts that matter.",
      href: "/dashboard/ai-prompt-tracker",
      icon: Bot,
      hue: "168 85 247",
    },
    {
      title: "Keyword Magic Tool",
      description: "Turn one seed keyword into hundreds of real ideas, with volume, difficulty and intent.",
      href: "/dashboard/keyword-magic",
      icon: Sparkles,
      hue: "99 102 241",
    },
    {
      title: "Competitor Spy",
      description: "See the domains sitting above you on your own keywords, and the searches they own that you do not.",
      href: `/dashboard/project/${projectId}/competitor-spy`,
      icon: Users,
      hue: "6 182 212",
    },
    {
      title: "Keyword Score Checker",
      description: "Score a keyword before you commit to it — how hard it is, and whether it is worth the work.",
      href: "/dashboard/keyword-analysis",
      icon: Search,
      hue: "14 165 233",
    },
    {
      title: "Quick SERP Checker",
      description: "Read a live SERP for any query and country, without adding it to a project first.",
      href: "/dashboard/serp-checker",
      icon: Zap,
      hue: "20 184 166",
    },
    {
      title: "YouTube Rank Tracker",
      description: "Track videos on YouTube search, with the channel, views and length of everything above you.",
      href: "/dashboard/youtube",
      icon: Youtube,
      hue: "239 68 68",
    },
    {
      title: "Keywords",
      description: "Every keyword you track, across every project, in one table.",
      href: "/dashboard/keywords",
      icon: KeyRound,
      hue: "79 70 229",
    },
    {
      title: "Internal Links Analysis",
      description: "Find the pages your own site links to weakly, and the links worth adding.",
      href: "/dashboard/ai-internal-linking",
      icon: Link2,
      hue: "13 148 136",
    },
    {
      title: "Search Console",
      description: gscStep.description,
      href: gscStep.href,
      icon: Globe,
      hue: "56 132 255",
      ...toolState(gscStep),
    },
  ]

  return (
    <Widget
      id="setup"
      title="Your tools"
      hint="Everything in the product, reachable from this project. The rank tracker leads because every panel above this card is measured against the keywords it holds."
      bodyClassName="p-5"
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tools.map((tool) => {
          // Amber takes the card over when something is wrong: a tile keeping
          // its decorative hue while warning you is a tile arguing with itself.
          const hue = tool.warning ? "245 158 11" : tool.hue

          return (
            <Link
              key={tool.title}
              href={tool.href}
              style={{ ["--hue" as string]: hue }}
              className={cn(
                "group relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border bg-card p-5",
                "shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-[transform,box-shadow,border-color] duration-200",
                // Lift and a coloured shadow rather than a background swap: this
                // theme maps --accent to the brand blue (globals.css), so
                // anything hovering to bg-accent turns a card into a blue slab
                // with unreadable body text.
                "hover:-translate-y-1 hover:shadow-[0_12px_28px_-12px_rgb(var(--hue)/0.45)]",
                tool.warning ? "border-amber-500/40" : "border-border hover:border-[rgb(var(--hue)/0.45)]",
              )}
            >
              {/* The card's light: a tint pooling in the top-right corner over a
                  gentle vertical wash, which is the surface the stat strips on
                  this dashboard already use. Behind the content, never over it. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-90 transition-opacity duration-200 group-hover:opacity-100"
                style={{
                  background:
                    "radial-gradient(120% 140% at 100% 0%, rgb(var(--hue) / 0.10), transparent 58%)," +
                    "linear-gradient(180deg, rgb(var(--hue) / 0.035), transparent 60%)",
                }}
              />

              <div className="relative flex flex-1 flex-col">
                <div className="flex items-start justify-between gap-3">
                  <span
                    className="grid size-11 shrink-0 place-items-center rounded-xl transition-transform duration-200 group-hover:scale-105"
                    style={{
                      background: "rgb(var(--hue) / 0.12)",
                      color: "rgb(var(--hue))",
                      // A hairline of the same hue, so the chip reads as a
                      // pressed token rather than a flat square of colour.
                      // Inset shadow rather than ring-1, which would depend on
                      // Tailwind's internal --tw-ring-color surviving a version.
                      boxShadow: "inset 0 0 0 1px rgb(var(--hue) / 0.22)",
                    }}
                  >
                    {tool.busy ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : (
                      <tool.icon className="size-5" />
                    )}
                  </span>

                  {(tool.status || tool.warning) && !tool.warning && (
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                        tool.busy
                          ? "bg-primary/10 text-primary"
                          : "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {!tool.busy && <Check className="size-3" strokeWidth={3} />}
                      {tool.status}
                    </span>
                  )}
                </div>

                <h3 className="mt-4 text-[15px] font-semibold leading-snug tracking-[-0.01em]">
                  {tool.title}
                </h3>

                <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-muted-foreground">
                  {tool.description}
                </p>

                {tool.warning && (
                  <span className="mt-3 flex items-start gap-1.5 text-[11.5px] font-medium leading-snug text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="mt-px size-3.5 shrink-0" strokeWidth={2.5} />
                    <span className="break-words">{tool.warning}</span>
                  </span>
                )}

                {/* The CTA is styled text, not a Button: the whole card is
                    already the link, and a real button inside an anchor is a
                    second target for the same destination. It fills with the
                    card's hue on hover so the affordance is unmistakable
                    without shouting at rest. */}
                <span
                  className={cn(
                    "mt-4 inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold",
                    "transition-colors duration-200",
                  )}
                  style={{ background: "rgb(var(--hue) / 0.10)", color: "rgb(var(--hue))" }}
                >
                  {tool.primary ? "Open tracker" : "Open"}
                  <ArrowUpRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </Widget>
  )
}
