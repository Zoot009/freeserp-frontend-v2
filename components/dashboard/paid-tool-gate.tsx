"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { Lock, Sparkles } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { usePaidAccess } from "@/hooks/use-paid-access"
import { BUY_CREDITS_HREF } from "@/lib/credits"
import { StatCard } from "@/components/dashboard/stat-card"

// The paid tools. A free account opening one gets a sample of what the tool
// produces and a way to upgrade, never the tool itself; the server refuses
// free accounts on the same tools (requirePaidPlan), so this is the friendly
// face of a real lock, not the lock.

export type PaidTool =
  | "mapsAudit"
  | "adsAnalysis"
  | "competitorAnalysis"
  | "internalLinks"
  | "aeoAudit"
  | "keywords"
  | "keywordMagic"
  | "keywordScore"

type Sample = {
  name: string
  pitch: string
  /** What the user gets, in a line each. */
  gets: string[]
  stats: { label: string; value: string; caption: string; tone?: string }[]
  table: { title: string; columns: string[]; rows: string[][] }
}

const RED = "text-red-500"
const AMBER = "text-amber-600 dark:text-amber-400"
const GREEN = "text-green-600 dark:text-green-400"

const SAMPLES: Record<PaidTool, Sample> = {
  mapsAudit: {
    name: "Google Maps Audit",
    pitch: "A full check-up of a Google Business Profile: what's holding it back on Maps, how it compares with the top 3 competitors, and a 30-day plan to fix it.",
    gets: ["51 checks across profile, reviews, keywords, photos, website and posts", "Rank grid and buying-intent searches like “near me”", "Competitors' live directory listings and where you're missing", "A shareable report and PDF"],
    stats: [
      { label: "Profile health", value: "64/100", caption: "Room to grow", tone: AMBER },
      { label: "Rank for “dentist”", value: "#4", caption: "Top 3 at 3 of 9 points" },
      { label: "Reviews", value: "4.6★", caption: "212 · competitors gain 2× faster" },
      { label: "Directories", value: "6/25", caption: "Competitors are on 14", tone: RED },
    ],
    table: {
      title: "Top findings",
      columns: ["Priority", "Finding", "Fix"],
      rows: [
        ["High", "No Google Posts in the last 90 days", "Publish one post a week: an offer, a recent job or news"],
        ["High", "Missing from 8 directories your competitors use", "Get listed with the same name, address and phone"],
        ["Medium", "Description doesn't mention “emergency dentist”", "Name the main service and the town in the first sentence"],
        ["Medium", "Website loads in 4.1s on mobile", "Compress the hero image and defer scripts"],
      ],
    },
  },
  adsAnalysis: {
    name: "Google Ads Analysis",
    pitch: "Is a website ready to spend money on Google Ads? Landing pages, conversion tracking, speed, real keyword costs where you advertise, and a budget forecast.",
    gets: ["A landing-page match for every service you advertise", "Conversion tracking, GA4 and Tag Manager checks", "Ad groups with search volume and cost per click", "Clicks, leads and cost per lead as ranges"],
    stats: [
      { label: "Ads readiness", value: "64/100", caption: "Needs work", tone: AMBER },
      { label: "Landing pages", value: "2/3", caption: "One service has no page", tone: RED },
      { label: "Avg. cost per click", value: "$16.71", caption: "Austin, TX" },
      { label: "Leads a month", value: "4–12", caption: "at $1,500 budget" },
    ],
    table: {
      title: "Top priorities",
      columns: ["Priority", "Finding", "Fix"],
      rows: [
        ["Critical", "Google Ads tag found, but no conversion tracking", "Add a conversion for form submits and calls"],
        ["Critical", "No dedicated page for “Emergency plumber”", "Create /emergency-plumber with a call button above the fold"],
        ["Medium", "Mobile LCP 3.8s (good is 2.5s or less)", "Optimise the largest image"],
        ["Low", "No sitelinks or callouts set up", "Add ad assets for services and offers"],
      ],
    },
  },
  competitorAnalysis: {
    name: "Competitor Analysis",
    pitch: "See exactly why the pages above you rank: their content, links, speed and on-page SEO side by side with yours, and a plan to close the gap.",
    gets: ["Your page against the top-ranking competitors", "Content, backlink and technical gaps", "An AI plan, ordered by impact", "Chat with the analysis about any gap"],
    stats: [
      { label: "Your page score", value: "58", caption: "Top competitor: 81", tone: AMBER },
      { label: "Content gap", value: "1,230", caption: "words behind the average" },
      { label: "Authority", value: "22 vs 41", caption: "your DA vs the leader", tone: RED },
      { label: "Keyword gaps", value: "34", caption: "terms competitors cover" },
    ],
    table: {
      title: "Biggest gaps",
      columns: ["Priority", "Gap", "What to do"],
      rows: [
        ["High", "Competitors average 1,850 words; your page has 620", "Add sections on pricing, process and FAQs"],
        ["High", "3 of 4 competitors have 20+ referring domains", "Earn local links: suppliers, associations, press"],
        ["Medium", "Your H1 doesn't contain the keyword", "Rewrite the H1 to name the service and town"],
        ["Low", "No FAQ schema; 2 competitors use it", "Add FAQPage markup to the FAQ section"],
      ],
    },
  },
  internalLinks: {
    name: "Internal Links Analysis",
    pitch: "Crawl a site and find the pages Google struggles to reach, then get AI-written internal link suggestions, with anchor text, to fix them.",
    gets: ["A full internal link map of the site", "Orphan and weakly linked pages", "AI link suggestions with anchor text", "Which pages pass the most authority"],
    stats: [
      { label: "Pages crawled", value: "148", caption: "in 2 minutes" },
      { label: "Orphan pages", value: "12", caption: "no internal links in", tone: RED },
      { label: "Links per page", value: "6.4", caption: "average" },
      { label: "Suggestions", value: "37", caption: "ready to add", tone: GREEN },
    ],
    table: {
      title: "Link suggestions",
      columns: ["From page", "Link to", "Anchor text"],
      rows: [
        ["/blog/water-heater-signs", "/water-heater-repair", "water heater repair in Austin"],
        ["/services", "/emergency-plumbing", "24/7 emergency plumber"],
        ["/about", "/reviews", "what our customers say"],
        ["/blog/drain-tips", "/drain-cleaning", "professional drain cleaning"],
      ],
    },
  },
  aeoAudit: {
    name: "AEO & GEO Audit",
    pitch: "Find out whether ChatGPT, Gemini, Perplexity, Claude and Google's AI Overviews mention your business, and what to change so they do.",
    gets: ["Your visibility in 5 AI answer engines", "Which competitors the AI recommends instead", "Technical checks: schema, llms.txt, crawler access", "A prioritised fix list"],
    stats: [
      { label: "AI visibility", value: "32/100", caption: "Low", tone: RED },
      { label: "ChatGPT", value: "3/10", caption: "questions mention you" },
      { label: "AI Overviews", value: "1/10", caption: "questions cite you" },
      { label: "Top rival", value: "7/10", caption: "questions cite Rapid Rooter Co." },
    ],
    table: {
      title: "Top findings",
      columns: ["Priority", "Finding", "Fix"],
      rows: [
        ["High", "Not mentioned for “best plumber in Austin”", "Publish a comparison-style service page with reviews"],
        ["High", "No FAQ or LocalBusiness schema", "Add structured data the AI engines read"],
        ["Medium", "llms.txt missing", "Add a short llms.txt describing your services"],
        ["Low", "GPTBot blocked in robots.txt", "Allow the AI crawlers you want to be found by"],
      ],
    },
  },
  keywords: {
    name: "Keywords",
    pitch: "Every keyword you track, across all your projects, in one place: positions, movement and opportunities at a glance.",
    gets: ["All tracked keywords across projects", "Daily position changes and trends", "Search volume and difficulty", "Favourites and quick filters"],
    stats: [
      { label: "Tracked keywords", value: "48", caption: "across 3 projects" },
      { label: "In the top 3", value: "9", caption: "+2 this week", tone: GREEN },
      { label: "In the top 10", value: "21", caption: "+4 this week" },
      { label: "Avg. position", value: "14.2", caption: "was 16.8" },
    ],
    table: {
      title: "Tracked keywords",
      columns: ["Keyword", "Position", "Change"],
      rows: [
        ["emergency plumber austin", "#3", "▲ 2"],
        ["water heater repair austin", "#5", "▲ 1"],
        ["drain cleaning near me", "#11", "▼ 3"],
        ["plumber round rock", "#7", "▲ 4"],
      ],
    },
  },
  keywordMagic: {
    name: "Keyword Magic Tool",
    pitch: "Turn one seed keyword into hundreds of ideas with real search volume, difficulty and cost per click, then add the best ones to tracking.",
    gets: ["Up to 1,000 keyword ideas per search", "Volume, difficulty, CPC and intent", "Filters and keyword groups", "Add to rank tracking in one click"],
    stats: [
      { label: "Keyword ideas", value: "1,000", caption: "for “plumber”" },
      { label: "Total volume", value: "184,300", caption: "searches a month" },
      { label: "Avg. CPC", value: "$8.40", caption: "Google Ads" },
      { label: "Easy wins", value: "126", caption: "difficulty under 30", tone: GREEN },
    ],
    table: {
      title: "Keyword ideas",
      columns: ["Keyword", "Volume", "Difficulty · CPC"],
      rows: [
        ["plumber near me", "90,500", "48 · $14.20"],
        ["emergency plumber", "22,200", "41 · $19.75"],
        ["24 hour plumber", "12,100", "36 · $17.10"],
        ["cheap plumber near me", "2,900", "22 · $9.80"],
      ],
    },
  },
  keywordScore: {
    name: "Keyword Score Checker",
    pitch: "Check how well one page is optimised for one keyword: title, headings, content, links and more, with a score and the exact fixes.",
    gets: ["A 0–100 score for any page and keyword", "Title, H1, content and URL checks", "Comparison with the top-ranking page", "Fixes in priority order"],
    stats: [
      { label: "Keyword score", value: "72/100", caption: "“water heater repair”", tone: AMBER },
      { label: "In the title", value: "Yes", caption: "near the start", tone: GREEN },
      { label: "In the H1", value: "No", caption: "add it", tone: RED },
      { label: "Word count", value: "860", caption: "top result: 1,640" },
    ],
    table: {
      title: "Fixes",
      columns: ["Priority", "Check", "Fix"],
      rows: [
        ["High", "Keyword missing from the H1", "Rewrite the H1: “Water Heater Repair in Austin”"],
        ["Medium", "Content shorter than top results", "Add sections on costs, signs of failure and FAQs"],
        ["Medium", "No internal links to this page", "Link to it from the homepage and services page"],
        ["Low", "Images have no alt text", "Describe each image, using the keyword once"],
      ],
    },
  },
}

const PLANS_HREF = "/dashboard/billing"

export function PaidToolGate({ tool, children }: { tool: PaidTool; children: ReactNode }) {
  const { user, loading } = useAuth()
  const { paid, checking } = usePaidAccess(user?.id)
  // Signed out: the page itself sends the visitor to log in.
  if (!loading && !user) return <>{children}</>
  if (loading || checking) {
    return (
      <div className="page" style={{ color: "var(--text-mute)", fontSize: 13, padding: 60, textAlign: "center" }}>
        Loading…
      </div>
    )
  }
  // Unknown (the usage check failed) opens the tool: the server still enforces the plan.
  if (paid !== false) return <>{children}</>
  return <ToolSample sample={SAMPLES[tool]} />
}

const TH = "whitespace-nowrap border-b border-border px-3 py-2.5 text-left text-xs font-medium text-muted-foreground first:pl-4 last:pr-4"
const TD = "px-3 py-2.5 align-top first:pl-4 last:pr-4"
const PRIORITY_TONE: Record<string, string> = { Critical: RED, High: RED, Medium: AMBER, Low: "text-muted-foreground" }

function ToolSample({ sample: s }: { sample: Sample }) {
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
              {s.name} is available on paid plans. Choose a plan or buy a credit pack to run it on your own website or business. Below is a sample of what you get.
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

      <div className="relative mt-6">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-[15px] font-semibold tracking-tight">Sample report</h2>
          <span className="rounded-[5px] bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">Example data</span>
        </div>
        <div className="pointer-events-none select-none space-y-4" aria-label="Sample report with example data">
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            {s.stats.map((x) => (
              <StatCard key={x.label} label={x.label} hint="Example data" value={x.value} caption={x.caption} tone={x.tone ?? "text-foreground"} />
            ))}
          </div>
          <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3 text-[14px] font-semibold">{s.table.title}</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-[13px]">
                <thead>
                  <tr>
                    {s.table.columns.map((c) => (
                      <th key={c} className={TH}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {s.table.rows.map((r, i) => (
                    <tr key={i}>
                      {r.map((cell, j) => (
                        <td key={j} className={`${TD} ${j === 0 && PRIORITY_TONE[cell] ? `font-medium ${PRIORITY_TONE[cell]}` : j === 0 ? "font-medium" : "text-muted-foreground"}`}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        {/* The sample fades out under a last call to upgrade. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent" aria-hidden />
      </div>
      <div className="mt-2 flex flex-col items-center gap-2 pb-6 text-center">
        <p className="text-[13px] text-muted-foreground">Want this report for your own business?</p>
        <Link href={PLANS_HREF} className="inline-flex h-10 items-center rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-deep">
          Upgrade to use {s.name}
        </Link>
      </div>
    </div>
  )
}
