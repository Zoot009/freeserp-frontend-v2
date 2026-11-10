"use client"

import { useEffect } from "react"
import Image from "next/image"
import { CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react"
import { def, type Deliverable, type GbpPost, type Inputs, type RunKey } from "@/lib/report-builder"
import { domainOf } from "@/components/report-builder/runs"
import { AeoSection, AiPostSection, CitationsSection, DirectionsSection, GbpPlanSection, Pending, Section, SiteAuditSection } from "@/components/report-builder/sections"
import {
  AdsSection,
  AiPromptsSection,
  CompetitorSection,
  KeywordMagicSection,
  KeywordScoreSection,
  LinksSection,
  MapsTrackerSection,
  RankSection,
  SerpSection,
  YoutubeSection,
} from "@/components/report-builder/tool-sections"

// The client report itself: the cover and every section, as the team sees it
// while it builds (with tick boxes) and as a client opens it from a shared link.

export type RunState = { id?: string; state: "waiting" | "running" | "done" | "failed"; data?: any; error?: string }

const PENDING_TEXT: Record<RunKey, string> = {
  gbp: "Auditing the Google Business Profile",
  site: "Crawling the website",
  page: "Auditing the homepage",
  aeo: "Asking the AI assistants about the site",
  serp: "Searching Google",
  rank: "Checking Google rankings",
  maps: "Scanning the grid on Google Maps",
  llm: "Asking ChatGPT, Gemini, Claude and Perplexity",
  ads: "Analysing the site for Google Ads",
  comp: "Comparing with the pages ranking above",
  links: "Mapping the site's internal links",
  magic: "Researching keywords",
  score: "Scoring the homepage for the keyword",
  yt: "Checking YouTube",
}

export const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })

/** The section's place on the page, for the cover's links. */
const anchor = (d: Deliverable) => `section-${d}`

export function ReportDocument({
  id,
  createdAt,
  sel,
  inputs,
  business,
  runOf,
  post,
  off = [],
  onToggle,
  onRegenerate,
  writing,
  onRetry,
  shared = false,
}: {
  id: string
  createdAt: string
  sel: Deliverable[]
  inputs: Inputs
  business: string
  runOf: (d: Deliverable) => RunState | undefined
  post: GbpPost | null
  /** Sections ticked off: folded on screen, left out of the print. */
  off?: Deliverable[]
  /** The team's view: a tick box on every section. */
  onToggle?: (d: Deliverable) => void
  onRegenerate?: () => void
  writing?: boolean
  /** Start a failed section's check again. */
  onRetry?: (d: Deliverable) => void
  /** Opened from a shared link, by someone with no account. */
  shared?: boolean
}) {
  // The PDF's file name: the business and the report, not the app's page title.
  useEffect(() => {
    const before = document.title
    document.title = `${business} · Local growth report`
    return () => {
      document.title = before
    }
  }, [business])

  // A PDF can't be clicked: rows that fold away (the AEO fixes) print open.
  useEffect(() => {
    let opened: HTMLDetailsElement[] = []
    const open = () => {
      // Added to, not replaced: Chrome can fire beforeprint twice for one print.
      const shut = [...document.querySelectorAll<HTMLDetailsElement>("details:not([open])")].filter((d) => !d.parentElement?.closest("details"))
      shut.forEach((d) => (d.open = true))
      opened = [...opened, ...shut]
    }
    const close = () => {
      opened.forEach((d) => (d.open = false))
      opened = []
    }
    window.addEventListener("beforeprint", open)
    window.addEventListener("afterprint", close)
    return () => {
      window.removeEventListener("beforeprint", open)
      window.removeEventListener("afterprint", close)
    }
  }, [])

  const grid = Number(inputs.grid) || 3
  const titleOf = (d: Deliverable) => (d === "mapsTracker" ? `${def(d).title} (${grid}×${grid} grid)` : def(d).title)
  const allDone = sel.every((d) => runOf(d)?.state === "done" || runOf(d)?.state === "failed")
  const shown = sel.filter((d) => !off.includes(d))
  const numberOf = (d: Deliverable) => (shown.includes(d) ? shown.indexOf(d) + 1 : null)
  // Printed pages: A4, and a footer of our own with the business and the page
  // number. The cover page has no top or bottom margin, which leaves no room for
  // the browser's date-and-address header and footer, so Chrome drops them on
  // every page. Its sides match the other pages: Chrome lays every page out at
  // the first page's width.
  const footer = `${business} · Local growth report`.replace(/["\\<>]/g, "")
  const pageCss = `@media print {
  @page { size: A4; margin: 14mm 12mm 16mm;
    @bottom-left { content: "${footer}"; font: 8pt system-ui, sans-serif; color: #71717a; }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt system-ui, sans-serif; color: #71717a; }
  }
  @page cover { margin: 0 12mm; @bottom-left { content: none; } @bottom-right { content: none; } }
}`

  const content = (d: Deliverable) => {
    const r = runOf(d)
    if (r?.state === "failed") {
      return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-red-500/25 bg-red-500/5 px-4 py-3 text-[13px]">
          <span className="flex min-w-0 items-start gap-2">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden />
            <span>
              <b className="font-medium">This section couldn&apos;t be built.</b> {r.error}
            </span>
          </span>
          {onRetry && (
            <button
              type="button"
              onClick={() => onRetry(d)}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 font-medium transition-colors hover:bg-muted print:hidden"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Try again
            </button>
          )}
        </div>
      )
    }
    if (r?.state !== "done") return <Pending what={r?.state === "waiting" ? "Waiting for the check it builds on" : PENDING_TEXT[def(d).run]} detail="This section fills in by itself." />
    const data = r.data
    switch (d) {
      case "gbpAudit":
        return (
          <div className="space-y-8">
            <GbpPlanSection data={data} />
            <div>
              <h3 className="mb-3 text-[15px] font-semibold tracking-tight">Free citations we&apos;ve created for you</h3>
              <CitationsSection data={data} />
            </div>
          </div>
        )
      case "aiPost":
        return <AiPostSection data={data} post={post} onRegenerate={onRegenerate} busy={writing} />
      case "directions":
        return <DirectionsSection data={data} />
      case "mapsTracker":
        return <MapsTrackerSection scan={data} />
      case "rankTracker":
        return <RankSection data={data} />
      case "quickSerp":
        return <SerpSection data={data} />
      case "youtube":
        return <YoutubeSection data={data} />
      case "aiPrompts":
        return <AiPromptsSection data={data} brand={inputs.name ?? business} />
      case "siteAudit":
      case "pageAudit":
        return <SiteAuditSection report={data.report} groups={data.groups} capture={!shared} />
      case "ads":
        return <AdsSection data={data} />
      case "competitor":
        return <CompetitorSection analysis={data} />
      case "links":
        return <LinksSection analysis={data} />
      case "aeo":
        return <AeoSection report={data} />
      case "keywordMagic":
        return <KeywordMagicSection data={data} />
      case "keywordScore":
        return <KeywordScoreSection analysis={data} keyword={inputs.kw ?? ""} />
    }
  }

  return (
    <>
      <style>{pageCss}</style>
      <header className="rounded-2xl border border-border bg-gradient-to-br from-brand/10 via-card to-card p-6 sm:p-8 print:mb-0 print:mt-[12mm] print:flex print:h-[272mm] print:flex-col print:bg-none print:bg-brand/5 print:p-[14mm] print:[page:cover]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 print:gap-3">
            <Image src="/logo.png" alt="FreeSERP" width={44} height={44} className="size-9 rounded-lg object-contain print:size-11" priority />
            <div className="leading-tight">
              <div className="text-[15px] font-semibold tracking-tight print:text-[18px]">FreeSERP</div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-brand">Local growth report</div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Report ID <span className="font-mono font-semibold text-foreground">{id.toUpperCase()}</span>
          </div>
        </div>
        <div className="print:my-auto">
          <h1 className="mt-4 text-[28px] font-semibold leading-tight tracking-tight print:text-[40px]">{business}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground print:mt-3 print:text-[15px]">
            Prepared {day(createdAt)}
            {inputs.web ? ` · ${domainOf(inputs.web)}` : ""}
          </p>
        </div>
        <div className="mb-3 hidden text-xs font-semibold uppercase tracking-wider text-muted-foreground print:block">What&apos;s inside</div>
        <ol className="mt-5 grid gap-2 sm:grid-cols-2 print:mt-0 print:grid-cols-1 print:gap-4 print:border-t print:border-border print:pt-4">
          {sel.map((d) => {
            const s = runOf(d)?.state
            const n = numberOf(d)
            return (
              <li key={d} className={n ? "" : "text-muted-foreground line-through print:hidden"}>
                {/* Each one jumps to its section, on screen and in the PDF. */}
                <a
                  href={`#${anchor(d)}`}
                  className="group -mx-2 flex items-center gap-2 rounded-lg px-2 py-1 text-[13px] transition-colors hover:bg-brand/10 print:mx-0 print:items-start print:gap-3 print:px-0 print:py-0"
                >
                  {s === "done" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400 print:mt-0.5" aria-hidden />
                  ) : s === "failed" ? (
                    <XCircle className="h-4 w-4 shrink-0 text-red-500" aria-hidden />
                  ) : (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground print:hidden" aria-hidden />
                  )}
                  <span className="min-w-0">
                    <span className="group-hover:text-brand group-hover:underline print:text-[15px] print:font-semibold">
                      {n ? `${n}. ` : ""}
                      {titleOf(d)}
                    </span>
                    <span className="hidden text-[13px] leading-relaxed text-muted-foreground print:mt-0.5 print:block">{def(d).promise}</span>
                  </span>
                </a>
              </li>
            )
          })}
        </ol>
        {!allDone && (
          <p className="mt-4 text-xs text-muted-foreground print:hidden">
            The sections fill in as each tool finishes, usually within 2 to 8 minutes. You can leave this page: the report is saved, and reopening it from the history carries on.
          </p>
        )}
      </header>

      {sel.map((d) => (
        <Section
          key={d}
          id={anchor(d)}
          n={numberOf(d)}
          title={titleOf(d)}
          promise={def(d).promise}
          included={!off.includes(d)}
          onToggle={onToggle ? () => onToggle(d) : undefined}
        >
          {content(d)}
        </Section>
      ))}
    </>
  )
}
