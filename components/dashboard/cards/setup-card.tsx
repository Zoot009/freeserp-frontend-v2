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
 * So it promotes all of them, as tiles. No step numbers, no per-tile button —
 * the whole tile is the link, because a grid of small "Open" buttons makes the
 * reader aim at the smallest part of each card.
 *
 * The two tiles we can verify keep saying what they know, as a status line
 * rather than a tick against a step:
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
 * The rank tracker stays first and keeps its accent: every panel below this
 * card is computed from tracked keywords, and with none added the rest of the
 * page is decoration.
 */

import type * as React from "react"
import {
  AlertTriangle,
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
 * A tool tile. Same shape whether or not we can say anything about its state —
 * a tool we cannot verify still gets promoted, it just has no status line.
 */
type Tool = {
  title: string
  description: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  /** Confirmed state, when there is any: "10 tracked", "Connected". */
  status?: string
  /** Needs attention. Replaces the status line and colours the tile amber. */
  warning?: string
  /** Work is already running — reported, not invited. */
  busy?: boolean
  /** The tracker. Everything else on the page is measured against it. */
  primary?: boolean
}

/** A step's verified state, mapped onto the tile that now carries it. */
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

  // Ordered by what a project needs first, not by category: the tracker, then
  // the audit that explains what caps it, then the surfaces beyond Google, then
  // the research tools that feed all of them. The integration goes last — it is
  // the one tile that depends on someone else's OAuth consent.
  const tools: Tool[] = [
    {
      title: "Keyword Rank Tracker",
      description: keywordStep.description,
      href: keywordStep.href,
      icon: LineChart,
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
      ...(auditRunning ? { busy: true, status: "Crawling…" } : {}),
    },
    {
      title: "Google Maps Tracker",
      description: "Track a business across a city grid and see where it drops out of the local pack.",
      href: "/dashboard/google-maps-tracker",
      icon: MapPin,
    },
    {
      title: "AI Prompt Tracker",
      description: "Watch whether ChatGPT, Claude, Gemini and Perplexity name your brand on the prompts that matter.",
      href: "/dashboard/ai-prompt-tracker",
      icon: Bot,
    },
    {
      title: "Keyword Magic Tool",
      description: "Turn one seed keyword into hundreds of real ideas with volume, difficulty and intent.",
      href: "/dashboard/keyword-magic",
      icon: Sparkles,
    },
    {
      title: "Keyword Score Checker",
      description: "Score a keyword before you commit to it — how hard it is, and whether it is worth the work.",
      href: "/dashboard/keyword-analysis",
      icon: Search,
    },
    {
      title: "Keywords",
      description: "Every keyword you track, across every project, in one table.",
      href: "/dashboard/keywords",
      icon: KeyRound,
    },
    {
      title: "Quick SERP Checker",
      description: "Read a live SERP for any query and country, without adding it to a project first.",
      href: "/dashboard/serp-checker",
      icon: Zap,
    },
    {
      title: "YouTube Rank Tracker",
      description: "Track videos on YouTube search, with the channel, views and length of everything above you.",
      href: "/dashboard/youtube",
      icon: Youtube,
    },
    {
      title: "Competitor Spy",
      description: "See the domains sitting above you on your own keywords, and which searches they own that you do not.",
      href: `/dashboard/project/${projectId}/competitor-spy`,
      icon: Users,
    },
    {
      title: "Internal Links Analysis",
      description: "Find the pages your own site links to weakly, and the links worth adding.",
      href: "/dashboard/ai-internal-linking",
      icon: Link2,
    },
    {
      title: "Search Console",
      description: gscStep.description,
      href: gscStep.href,
      icon: Globe,
      ...toolState(gscStep),
    },
  ]

  return (
    <Widget
      id="setup"
      title="Your tools"
      hint="Everything in the product, reachable from this project. Start with the rank tracker — every panel below this card is measured against the keywords it holds."
      bodyClassName="p-5"
    >
      {/* Twelve tiles, so they are compact and the whole tile is the target: a
          grid of "Open" buttons makes the reader aim at the smallest part of
          each card. Four across on a wide screen, two on a tablet, one on a
          phone. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {tools.map((tool) => (
          <Link
            key={tool.title}
            href={tool.href}
            className={cn(
              "group flex min-w-0 flex-col rounded-lg border p-3.5 transition-colors",
              // hover:bg-muted/50, not the default accent: this theme maps
              // --accent to the brand blue (globals.css), so an accent hover
              // turns the whole tile into a blue slab with unreadable body text.
              "hover:border-foreground/20 hover:bg-muted/50",
              tool.warning && "border-amber-500/40",
              tool.primary && !tool.warning && "border-primary/30 bg-primary/[0.03]",
            )}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-md",
                  tool.warning ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    : tool.status && !tool.busy ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : tool.busy || tool.primary ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {tool.busy ? <Loader2 className="size-4 animate-spin" /> : <tool.icon className="size-4" />}
              </span>
              <span className="truncate text-[13.5px] font-semibold">{tool.title}</span>
            </div>

            <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground">
              {tool.description}
            </p>

            {/* Only tiles we can actually verify carry a footer line. The rest
                end on the description rather than on an empty row that pads
                every tile to the height of the tallest. */}
            {(tool.status || tool.warning) && (
              <span
                className={cn(
                  "mt-2.5 inline-flex items-baseline gap-1.5 text-[11.5px] font-semibold",
                  tool.warning ? "text-amber-600 dark:text-amber-400"
                    : tool.busy ? "text-primary"
                    : "text-emerald-600 dark:text-emerald-400",
                )}
              >
                {tool.warning ? (
                  <>
                    <AlertTriangle className="size-3 shrink-0 self-center" strokeWidth={2.5} />
                    <span className="break-words">{tool.warning}</span>
                  </>
                ) : tool.busy ? (
                  <span>{tool.status}</span>
                ) : (
                  <>
                    <Check className="size-3 shrink-0 self-center" strokeWidth={3} /> {tool.status}
                  </>
                )}
              </span>
            )}
          </Link>
        ))}
      </div>
    </Widget>
  )
}
