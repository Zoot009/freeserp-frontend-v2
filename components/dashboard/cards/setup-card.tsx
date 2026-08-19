"use client"

/**
 * Next steps — the things worth doing on a project, and the way into the tools
 * that do them.
 *
 * Not a progress meter. It carried a "1 of 2 steps done · 50%" bar, but only two
 * of the five items can be verified at all, so the percentage measured the
 * coverage of our own checks rather than anything the user had achieved — and a
 * permanent 50% on a healthy project reads as a reproach. What is confirmed is
 * shown per item, with a tick.
 *
 * Step one is the rank tracker itself. The card used to open on Search Console
 * and never mention keywords at all, so a brand-new project's checklist skipped
 * the thing the product is FOR and led with a third-party integration. Every
 * panel below this card is computed from tracked keywords; with none added, the
 * other steps are decoration.
 *
 * The rest promote the tools that do the work around the tracker.
 *
 * Search Console is verified in TWO parts, because the connection and the data
 * are different things:
 *   • /api/gsc/connection      — is a Google account linked? Account-wide.
 *   • /api/gsc/projects/:id/site — which property feeds THIS project? Per project.
 * Only the first was being checked, so one connection made every project on the
 * account claim to be set up — including projects with no property linked, and
 * projects pointed at somebody else's domain. The backend doesn't validate the
 * pairing on link either, so the domain check happens here.
 */

import { AlertTriangle, Check, Loader2 } from "lucide-react"
import { Link } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
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
  const href = `/dashboard/project/${projectId}/keywords`
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
      description: "Add the searches you want this site to rank for. Everything else on this page is measured against them.",
      cta: "Add keywords",
      done: null,
    }
  }

  if (keywords.total === 0) {
    return {
      ...base,
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
  // Our own tools first, the third-party integration last. Search Console is
  // the one step that depends on someone else's account and OAuth consent, so
  // leading with it put the slowest, least certain thing in front of the tools
  // that work immediately.
  const steps: Step[] = [
    trackKeywordsStep(projectId, keywords, keywordsAnalysing),
    {
      title: "Website Audit",
      description: auditRunning
        ? "We're crawling the site now — status codes, titles, headings and internal links. The report lands on this page when it finishes."
        : "Crawl the site with a real browser and get the technical faults that cap every page — with the exact fixes, in priority order.",
      href: "/dashboard/page-audit",
      cta: auditRunning ? "Crawling…" : "Open",
      done: null,
      busy: auditRunning,
    },
    {
      title: "Keyword Magic",
      description: "Turn one seed keyword into hundreds of real ideas with volume, difficulty and intent — then track the good ones here.",
      href: "/dashboard/keyword-magic",
      cta: "Open",
      done: null,
    },
    {
      title: "Competitor Spy",
      description: "See the domains sitting above you on your own keywords, and which searches they own that you don't.",
      href: `/dashboard/project/${projectId}/competitor-spy`,
      cta: "Open",
      done: null,
    },
    searchConsoleStep(projectId, gsc),
  ]

  return (
    <Widget
      id="setup"
      title="Next steps"
      hint="Start with keywords — every panel below this card is measured against them. The rest are the tools that act on what they show."
      bodyClassName="p-5"
    >
      {/* Five now, not four. Below xl they stack two-up, which is why the
          divider rule is tied to the breakpoint the single row appears at. */}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-5">
        {steps.map((s, i) => (
          <div
            key={s.title}
            // Divider on the left of every column but the first — on a narrow
            // grid the columns stack, so the rule is tied to the breakpoint the
            // four-across layout appears at.
            className={cn("flex min-w-0 flex-col", i > 0 && "xl:border-l xl:pl-5")}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "grid size-[22px] shrink-0 place-items-center rounded-full text-[11px] font-bold",
                  s.done ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : s.warning ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    : s.busy ? "bg-primary/10 text-primary"
                    : s.primary ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {s.done ? <Check className="size-3.5" strokeWidth={3} />
                  : s.warning ? <AlertTriangle className="size-3" strokeWidth={2.5} />
                  : s.busy ? <Loader2 className="size-3 animate-spin" />
                  : i + 1}
              </span>
              <span className="truncate text-[15px] font-semibold">{s.title}</span>
            </div>

            <p className="mt-2 flex-1 text-[13px] leading-relaxed text-muted-foreground">
              {s.description}
              {s.warning && (
                <span className="mt-1.5 block break-words font-medium text-amber-600 dark:text-amber-400">{s.warning}</span>
              )}
            </p>

            <div className="mt-3.5">
              {s.busy && s.primary ? (
                // The primary step's busy CTA is a report, not an invitation:
                // rendering it as the page's main button would put the loudest
                // control on screen next to work already in progress.
                <span className="inline-flex h-8 items-center gap-1.5 text-[13px] font-semibold text-primary">
                  <Loader2 className="size-3.5 animate-spin" /> {s.cta}
                </span>
              ) : s.done ? (
                // A link, not a label: "Connected" with nowhere to go is a dead
                // end — the report you just connected is the point of connecting.
                // hover:bg-emerald-500/10 is not decoration: the ghost variant
                // hovers to bg-accent, and this theme maps --accent to the BRAND
                // blue (see globals.css), so the confirmed step turned into a
                // solid blue pill with white text the moment you pointed at it —
                // reading as the primary action rather than a done marker.
                <Button
                  asChild
                  size="sm"
                  variant="ghost"
                  className="-ml-2 h-8 gap-1.5 text-[13px] font-semibold text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-500/15 dark:hover:text-emerald-300"
                >
                  <Link href={s.href}><Check className="size-3.5" strokeWidth={3} /> {s.cta}</Link>
                </Button>
              ) : (
                <Button
                  asChild
                  size="sm"
                  variant={s.primary ? "default" : "outline"}
                  // hover:bg-muted on the outline variant: its default is
                  // hover:bg-accent, and this theme maps --accent to the brand
                  // blue (globals.css), so "Open" turned into a washed blue pill
                  // with near-unreadable text on hover.
                  className={cn(
                    "h-8 text-[13px] font-semibold",
                    !s.primary && "hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Link href={s.href}>
                    {s.busy && <Loader2 className="size-3.5 animate-spin" />}
                    {s.cta}
                  </Link>
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </Widget>
  )
}
