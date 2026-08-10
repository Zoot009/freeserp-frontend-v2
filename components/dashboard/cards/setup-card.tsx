"use client"

/**
 * Finish setup — the four integrations that each fill a panel further down the
 * dashboard with real data.
 *
 * The reference this follows carries a "two of six steps done · 33%" progress
 * bar. Only one of these four steps can actually be verified from here, so the
 * bar counts what it can prove and says so, rather than asserting progress
 * through steps we have no signal for.
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

import { AlertTriangle, Check } from "lucide-react"
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
}

function searchConsoleStep(projectId: string, gsc: GscState): Step {
  const href = `/dashboard/project/${projectId}/search-console`
  const base = {
    title: "Search Console",
    href,
    primary: true,
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

export function SetupCard({ projectId, gsc }: { projectId: string; gsc: GscState }) {
  const steps: Step[] = [
    searchConsoleStep(projectId, gsc),
    {
      title: "On Page SEO Checker",
      description: "Score a single page and collect concrete fixes for content, meta and structure.",
      href: "/dashboard/onpage-audit",
      cta: "Set up",
      done: null,
    },
    {
      title: "Keyword Magic",
      description: "Find new keywords with volume, difficulty and intent — then track the good ones.",
      href: "/dashboard/keyword-magic",
      cta: "Set up",
      done: null,
    },
    {
      title: "Competitor Spy",
      description: "Watch the domains that outrank you and see which keywords they own.",
      href: `/dashboard/project/${projectId}/competitor-spy`,
      cta: "Set up",
      done: null,
    },
  ]

  const checkable = steps.filter((s) => s.done !== null)
  const confirmed = checkable.filter((s) => s.done).length
  const pct = checkable.length ? Math.round((confirmed / checkable.length) * 100) : 0

  return (
    <Widget
      id="setup"
      title="Finish setup"
      hint="Each of these fills a panel below with data we can't model on our own."
      meta={
        checkable.length > 0 ? (
          <span className="flex items-center gap-2.5">
            <span className="hidden sm:inline">
              {confirmed} of {checkable.length} connection{checkable.length === 1 ? "" : "s"} confirmed
            </span>
            <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
            </span>
            <span className="font-semibold text-primary">{pct}%</span>
          </span>
        ) : null
      }
      bodyClassName="p-5"
    >
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
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
                    : s.primary ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {s.done ? <Check className="size-3.5" strokeWidth={3} />
                  : s.warning ? <AlertTriangle className="size-3" strokeWidth={2.5} />
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
              {s.done ? (
                // A link, not a label: "Connected" with nowhere to go is a dead
                // end — the report you just connected is the point of connecting.
                <Button asChild size="sm" variant="ghost" className="-ml-2 h-8 gap-1.5 text-[13px] font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400">
                  <Link href={s.href}><Check className="size-3.5" strokeWidth={3} /> {s.cta}</Link>
                </Button>
              ) : (
                <Button asChild size="sm" variant={s.primary ? "default" : "outline"} className="h-8 text-[13px] font-semibold">
                  <Link href={s.href}>{s.cta}</Link>
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </Widget>
  )
}
