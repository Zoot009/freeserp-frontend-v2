"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { Lock } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { usePaidAccess } from "@/hooks/use-paid-access"
import { useIsDemoView } from "@/components/dashboard/demo-banner"

// The paid tools. A free account sees the tool's own page, like everyone else:
// its list with the Nike demo pinned first, ready to open. A one-line strip on
// top says the tool is paid. Running anything is refused by the server
// (requirePaidPlan), and lib/api.ts turns that refusal into the upgrade dialog,
// so this is the friendly face of a real lock, not the lock.

export type PaidTool =
  | "mapsAudit"
  | "adsAnalysis"
  | "competitorAnalysis"
  | "internalLinks"
  | "aeoAudit"
  | "keywordMagic"
  | "keywordScore"
  | "youtubeTracker"
  | "mapsTracker"
  | "aiPromptTracker"
  | "siteAudit"
  | "pageAudit"
  | "serpChecker"
  | "competitorSpy"
  | "searchConsole"
  | "gmbOptimizer"
  | "gmbPostCreator"
  | "gmbReviewManager"

const TOOL_NAMES: Record<PaidTool, string> = {
  mapsAudit: "Google Maps Audit",
  adsAnalysis: "Google Ads Analysis",
  competitorAnalysis: "Competitor Analysis",
  internalLinks: "Internal Links Analysis",
  aeoAudit: "AEO & GEO Audit",
  keywordMagic: "Keyword Magic Tool",
  keywordScore: "Keyword Score Checker",
  youtubeTracker: "YouTube Rank Tracker",
  mapsTracker: "Google Maps Rank Tracker",
  aiPromptTracker: "AI Prompt Tracker",
  siteAudit: "Site Audit",
  pageAudit: "Page Audit",
  serpChecker: "Quick SERP Checker",
  competitorSpy: "Competitor Tracking",
  searchConsole: "Search Console",
  gmbOptimizer: "GMB Profile Optimizer",
  gmbPostCreator: "GMB Post Creator",
  gmbReviewManager: "GMB Review Manager",
}

const PLANS_HREF = "/dashboard/billing"

export function PaidToolGate({ tool, demoHref, children }: { tool: PaidTool; demoHref?: string; children: ReactNode }) {
  const { user } = useAuth()
  const { paid } = usePaidAccess(user?.id)
  // The demo has its own banner; null means the URL isn't read yet.
  const demo = useIsDemoView()
  return (
    <>
      {paid === false && demo === false && <UpgradeStrip name={TOOL_NAMES[tool]} demoHref={demoHref} />}
      {children}
    </>
  )
}

/**
 * The demo link is a plain <a>, not <Link>: the demo can live on this same path
 * behind a query (Keyword Magic's ?view=demo), and useIsDemoView only re-reads
 * the query when the path changes — a client-side hop would keep this strip.
 */
function UpgradeStrip({ name, demoHref }: { name: string; demoHref?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-muted/40 px-[var(--page-pad)] py-2.5 text-[13px]">
      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
        <Lock className="size-3.5" aria-hidden />
      </span>
      <p className="min-w-0 flex-1 leading-snug">
        <span className="font-semibold">{name} is a paid tool.</span>{" "}
        <span className="text-muted-foreground">
          {demoHref ? (
            <>
              <a href={demoHref} className="font-medium text-brand hover:underline">
                Open the demo report
              </a>{" "}
              to see what you get, or upgrade to run it on your own site.
            </>
          ) : (
            "Upgrade to use it on your own site."
          )}
        </span>
      </p>
      <Link
        href={PLANS_HREF}
        className="inline-flex h-8 shrink-0 items-center rounded-lg bg-brand px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-deep"
      >
        See plans
      </Link>
    </div>
  )
}
