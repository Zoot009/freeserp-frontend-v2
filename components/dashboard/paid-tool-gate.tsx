"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { Lock, PlayCircle, Sparkles } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { usePaidAccess } from "@/hooks/use-paid-access"
import { BUY_CREDITS_HREF } from "@/lib/credits"
import { useIsDemoView } from "@/components/dashboard/demo-banner"

// The paid tools. A free account opening one gets a sample of what the tool
// produces and a way to upgrade, never the tool itself; the server refuses
// free accounts on the same tools (requirePaidPlan), so this is the friendly
// face of a real lock, not the lock.
//
// A tool with a demo passes its URL as `demoHref` (from its own layout), and
// the sample screen leads with it: the real tool, read-only, on example data,
// is a better reason to upgrade than a static mock-up.

export type PaidTool =
  | "mapsAudit"
  | "adsAnalysis"
  | "competitorAnalysis"
  | "internalLinks"
  | "aeoAudit"
  | "keywords"
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

type Sample = {
  name: string
  pitch: string
  /** What the user gets, in a line each. */
  gets: string[]
}

const SAMPLES: Record<PaidTool, Sample> = {
  mapsAudit: {
    name: "Google Maps Audit",
    pitch: "A full check-up of a Google Business Profile: what's holding it back on Maps, how it compares with the top 3 competitors, and a 30-day plan to fix it.",
    gets: ["51 checks across profile, reviews, keywords, photos, website and posts", "Rank grid and buying-intent searches like “near me”", "Competitors' live directory listings and where you're missing", "A shareable report and PDF"],
  },
  adsAnalysis: {
    name: "Google Ads Analysis",
    pitch: "Is a website ready to spend money on Google Ads? Landing pages, conversion tracking, speed, real keyword costs where you advertise, and a budget forecast.",
    gets: ["A landing-page match for every service you advertise", "Conversion tracking, GA4 and Tag Manager checks", "Ad groups with search volume and cost per click", "Clicks, leads and cost per lead as ranges"],
  },
  competitorAnalysis: {
    name: "Competitor Analysis",
    pitch: "See exactly why the pages above you rank: their content, links, speed and on-page SEO side by side with yours, and a plan to close the gap.",
    gets: ["Your page against the top-ranking competitors", "Content, backlink and technical gaps", "An AI plan, ordered by impact", "Chat with the analysis about any gap"],
  },
  internalLinks: {
    name: "Internal Links Analysis",
    pitch: "Crawl a site and find the pages Google struggles to reach, then get AI-written internal link suggestions, with anchor text, to fix them.",
    gets: ["A full internal link map of the site", "Orphan and weakly linked pages", "AI link suggestions with anchor text", "Which pages pass the most authority"],
  },
  aeoAudit: {
    name: "AEO & GEO Audit",
    pitch: "Find out whether ChatGPT, Gemini, Perplexity, Claude and Google's AI Overviews mention your business, and what to change so they do.",
    gets: ["Your visibility in 5 AI answer engines", "Which competitors the AI recommends instead", "Technical checks: schema, llms.txt, crawler access", "A prioritised fix list"],
  },
  keywords: {
    name: "Keywords",
    pitch: "Every keyword you track, across all your projects, in one place: positions, movement and opportunities at a glance.",
    gets: ["All tracked keywords across projects", "Daily position changes and trends", "Search volume and difficulty", "Favourites and quick filters"],
  },
  keywordMagic: {
    name: "Keyword Magic Tool",
    pitch: "Turn one seed keyword into hundreds of ideas with real search volume, difficulty and cost per click, then add the best ones to tracking.",
    gets: ["Up to 1,000 keyword ideas per search", "Volume, difficulty, CPC and intent", "Filters and keyword groups", "Add to rank tracking in one click"],
  },
  keywordScore: {
    name: "Keyword Score Checker",
    pitch: "Check how well one page is optimised for one keyword: title, headings, content, links and more, with a score and the exact fixes.",
    gets: ["A 0–100 score for any page and keyword", "Title, H1, content and URL checks", "Comparison with the top-ranking page", "Fixes in priority order"],
  },
  youtubeTracker: {
    name: "YouTube Rank Tracker",
    pitch: "Track where your videos and channel rank in YouTube search for the keywords that matter, by country and language.",
    gets: ["Daily YouTube positions per keyword", "Which of your videos ranks, and who beats you", "Rank history and movement", "Any country and language"],
  },
  mapsTracker: {
    name: "Google Maps Rank Tracker",
    pitch: "See where your business ranks on Google Maps across a grid of points around it, not just from one spot.",
    gets: ["Rank at every point of a map grid", "Competitors that beat you, point by point", "Average and best rank per keyword", "A shareable map report"],
  },
  aiPromptTracker: {
    name: "AI Prompt Tracker",
    pitch: "Find out whether ChatGPT, Gemini, Claude and Perplexity mention your brand when people ask about your market.",
    gets: ["Mention rate per AI assistant", "Which competitors get named instead", "The sources the answers cite", "Mention rate over time"],
  },
  siteAudit: {
    name: "Site Audit",
    pitch: "Crawl your whole website and get every technical SEO issue, grouped and prioritised, with the pages each one affects.",
    gets: ["Your whole site crawled, page by page", "Broken links, redirects and missing tags", "Speed, indexability and structured data checks", "Fixes in priority order"],
  },
  pageAudit: {
    name: "Page Audit",
    pitch: "Audit one page in depth: content, tags, speed, links and structured data, with a score and the exact fixes.",
    gets: ["A 0–100 score for any page", "Title, headings, content and link checks", "Speed and structured data checks", "Ask AI how to fix each issue"],
  },
  serpChecker: {
    name: "Quick SERP Checker",
    pitch: "Look up a live Google results page for any keyword, country and device, and see exactly where your site ranks.",
    gets: ["The live top 100 for any keyword", "Your position, highlighted", "SERP features: AI Overview, maps, videos and more", "Any country and device"],
  },
  competitorSpy: {
    name: "Competitor Tracking",
    pitch: "Track your competitors' rankings on the same keywords as you, and see who is gaining on you.",
    gets: ["Competitors ranked on your keywords", "Who gained and lost positions", "Suggested competitors from your SERPs", "Share of the top 10"],
  },
  searchConsole: {
    name: "Search Console",
    pitch: "Connect Google Search Console to see the clicks, impressions and click-through rate behind your rankings.",
    gets: ["Clicks and impressions per keyword", "Click-through rate next to your position", "Queries you rank for but don't track yet", "Trends over time"],
  },
}

const PLANS_HREF = "/dashboard/billing"

export function PaidToolGate({ tool, demoHref, children }: { tool: PaidTool; demoHref?: string; children: ReactNode }) {
  const { user, loading } = useAuth()
  const { paid, checking } = usePaidAccess(user?.id)
  const demo = useIsDemoView()
  // Signed out: the page itself sends the visitor to log in.
  if (!loading && !user) return <>{children}</>
  // Demos are open to every plan: they show what the tool produces, every
  // action in them prompts, and their data never touches the server.
  if (demo) return <>{children}</>
  if (loading || checking || demo === null) {
    return (
      <div className="page" style={{ color: "var(--text-mute)", fontSize: 13, padding: 60, textAlign: "center" }}>
        Loading…
      </div>
    )
  }
  // Unknown (the usage check failed) opens the tool: the server still enforces the plan.
  if (paid !== false) return <>{children}</>
  return <ToolSample sample={SAMPLES[tool]} demoHref={demoHref} />
}

/**
 * A plain <a>, not <Link>: the demo can live on this same path behind a query
 * (Keyword Magic's ?view=demo), and useIsDemoView only re-reads the query when
 * the path changes — a client-side hop would land back on this screen.
 */
function DemoLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  return (
    <a href={href} className={className}>
      {children}
    </a>
  )
}

function ToolSample({ sample: s, demoHref }: { sample: Sample; demoHref?: string }) {
  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1 className="flex items-center gap-2">
            {s.name}
            <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">
              <Lock className="h-3 w-3" aria-hidden /> Paid plans
            </span>
          </h1>
          <div className="sub">{s.pitch}</div>
        </div>
      </div>

      <section className="rounded-2xl border border-brand/30 bg-brand/5 p-5 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold tracking-tight">Upgrade to use {s.name}</h2>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              {s.name} is available on paid plans. Choose a plan or buy a credit pack to run it on your own website or business.{" "}
              {demoHref && "Or open the live demo to try the real tool on example data first."}
            </p>
            <ul className="mt-3 grid gap-1.5 text-[13px] sm:grid-cols-2">
              {s.gets.map((g) => (
                <li key={g} className="flex items-start gap-2">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" aria-hidden />
                  <span>{g}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap gap-2 lg:flex-col">
            {demoHref && (
              <DemoLink
                href={demoHref}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-brand bg-card px-6 text-sm font-semibold text-brand transition-colors hover:bg-brand/10"
              >
                <PlayCircle className="h-4 w-4" aria-hidden /> Explore the live demo
              </DemoLink>
            )}
            <Link
              href={PLANS_HREF}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-deep"
            >
              See plans
            </Link>
            <Link
              href={BUY_CREDITS_HREF}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-card px-6 text-sm font-semibold transition-colors hover:bg-muted"
            >
              Buy credits
            </Link>
          </div>
        </div>
      </section>

    </div>
  )
}
