"use client"

/* eslint-disable @typescript-eslint/no-explicit-any -- each tool's payload is read loosely, a few fields each */
import { useState } from "react"
import { CheckCircle2, ExternalLink, Quote, XCircle } from "lucide-react"
import { StatCard } from "@/components/dashboard/stat-card"
import { BrandEngines } from "@/components/dashboard/ai-tracker/brand-engines"
import { RankGridView } from "@/components/gbp-audit/rank-grid"
import type { Grid } from "@/lib/gbp-audit"
import { CompetitorComparisonTable } from "@/components/competitor-comparison-table"
import { KeywordAnalysisReport } from "@/components/keyword-analysis-report"
import { AdsHero, AdsReport } from "@/components/ads-analysis/report"
import { PLATFORMS, PLATFORM_LABEL, type Platform } from "@/lib/ai-tracker"

// Sections for the tools beyond the Maps audit: each reads one finished run.

const card = "rounded-[10px] border border-border bg-card shadow-sm print:shadow-none"
const TH = "border-b border-border px-4 py-2.5 text-left text-xs font-medium text-muted-foreground"
const TD = "px-4 py-2.5 align-top"
const num = (n: unknown) => (typeof n === "number" ? n.toLocaleString() : "—")
const pos = (p: unknown) => (typeof p === "number" && p > 0 ? `#${p}` : "Not in top 100")
const posTone = (p: unknown) => (typeof p === "number" && p > 0 ? (p <= 3 ? "text-green-600 dark:text-green-400" : p <= 10 ? "text-amber-600 dark:text-amber-400" : "") : "text-red-500")

/**
 * The team's word to the client under a section, set as a quote: what the
 * numbers mean and what we'll do about them. `note` follows it in plain text.
 */
export function Pitch({ children, note }: { children?: React.ReactNode; note?: React.ReactNode }) {
  return (
    <figure className="relative rounded-[10px] border border-emerald-500/30 bg-emerald-500/[0.07] py-4 pl-14 pr-5 print:break-inside-avoid">
      <Quote className="absolute left-4 top-4 h-6 w-6 rotate-180 fill-emerald-500/20 text-emerald-600 dark:text-emerald-400" aria-hidden />
      {children && (
        <blockquote className="space-y-2 text-[14px] font-semibold leading-relaxed text-foreground [&_b]:font-bold [&_b]:text-emerald-700 dark:[&_b]:text-emerald-400 [&>p:first-child]:before:content-['“'] [&>p:last-child]:after:content-['”']">
          {children}
        </blockquote>
      )}
      {note && <div className={`space-y-2 text-[13px] leading-relaxed text-muted-foreground [&_b]:text-foreground ${children ? "mt-3 border-t border-emerald-500/20 pt-3" : ""}`}>{note}</div>}
    </figure>
  )
}

/** "a", "a and b", "a, b and c". */
export const listOf = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`)

// ── Google Rank Tracker & keywords ───────────────────────────────────────────

export function RankSection({ data }: { data: { rows: any[] } }) {
  const rows = data.rows
  const top10 = rows.filter((r) => typeof r.position === "number" && r.position > 0 && r.position <= 10).length
  const checked = rows.filter((r) => r.status != null && r.status !== "FAILED")
  const n = checked.length
  const ranking = checked.filter((r) => typeof r.position === "number" && r.position > 0).length
  const standing =
    ranking === 0
      ? n === 1 ? "it isn't ranking on Google" : "none of them are ranking on Google"
      : top10 === n
        ? n === 1 ? "it's on Google's first page" : `all ${n} are on Google's first page`
        : top10 > 0
          ? `${top10} of them ${top10 === 1 ? "is" : "are"} on Google's first page and ${n - top10} ${n - top10 === 1 ? "isn't" : "aren't"} yet`
          : n === 1 ? "it ranks on Google, but not on the first page yet" : `${ranking} of them rank on Google, but none is on the first page yet`
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard compact label="Keywords tracked" hint="Tracked daily from now on." value={rows.length} caption="on Google" tone="text-foreground" />
        <StatCard compact label="On page 1" hint="Keywords ranking in the top 10." value={top10} caption={`of ${rows.length}`} tone="text-foreground" />
        <StatCard compact label="Monthly searches" hint="Combined search volume." value={rows.some((r) => r.searchVolume != null) ? num(rows.reduce((n, r) => n + (r.searchVolume ?? 0), 0)) : "—"} caption="for these keywords" tone="text-foreground" />
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full min-w-[560px] border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={TH}>Keyword</th>
              <th className={`${TH} w-32`}>Google position</th>
              <th className={`${TH} w-32 text-right`}>Searches / mo</th>
              <th className={TH}>Ranking page</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id ?? r.keyword}>
                <td className={`${TD} font-medium`}>{r.keyword}</td>
                <td className={`${TD} font-semibold tabular-nums ${r.status == null || r.status === "FAILED" ? "text-muted-foreground" : posTone(r.position)}`}>
                  {r.status === "FAILED" ? "Couldn't check" : r.status == null ? "Not checked yet" : pos(r.position)}
                </td>
                <td className={`${TD} text-right tabular-nums`}>{num(r.searchVolume)}</td>
                <td className={`${TD} max-w-[280px] truncate text-muted-foreground`}>{r.url ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pitch
        note={
          <>
            <p>
              <b>Important note:</b>{" "}if you want to improve your Google Business Profile (GMB) rankings, optimizing your website is also important. Google considers various relevance and
              prominence signals, including information from your linked website, when determining local search rankings. Since there is no direct keyword field in Google Business Profile, your
              website&apos;s content and SEO play an important role in supporting your local rankings.
            </p>
            <p>We&apos;re now tracking these keywords every day and will report every move up the rankings.</p>
          </>
        }
      >
        {n > 0 && (
          <p>
            We have checked your website&apos;s rankings for <b>{n} targeted {n === 1 ? "keyword" : "keywords"}</b>, and currently {standing}.{" "}
            {top10 === n
              ? "Our team can help you hold these positions and push them into the top 3."
              : "Our team can help optimize your website, improve its SEO performance, and work towards getting it ranked for your targeted keywords."}
          </p>
        )}
      </Pitch>
    </div>
  )
}

// ── Quick SERP check ─────────────────────────────────────────────────────────

export function SerpSection({ data }: { data: any }) {
  const results: any[] = data.results ?? []
  const ai = data.aiOverview
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 print:grid-cols-4">
        <StatCard compact label={`Your position for “${data.keyword}”`} hint="Where the website ranks in Google's organic results." value={data.found ? pos(data.position) : "Not in top 10"} caption={data.url ?? "—"} tone={posTone(data.found ? data.position : null)} />
        <StatCard compact label="Monthly searches" hint="How many people search this a month." value={num(data.searchVolume)} caption="search volume" tone="text-foreground" />
        <StatCard compact label="Difficulty" hint="How hard the keyword is to rank for, 0–100." value={data.keywordDifficulty ?? "—"} caption="out of 100" tone="text-foreground" />
        <StatCard compact label="AI Overview" hint="Whether Google shows an AI Overview, and whether it cites the site." value={ai?.present ? (ai.cited ? "Cited" : "Not cited") : "None"} caption={ai?.present ? "shown for this search" : "not shown"} tone={ai?.present && !ai.cited ? "text-red-500" : "text-foreground"} />
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full min-w-[560px] border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={`${TH} w-14`}>#</th>
              <th className={TH}>Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {results.slice(0, 10).map((r) => (
              <tr key={`${r.position}-${r.url}`}>
                <td className={`${TD} font-semibold tabular-nums`}>{r.position}</td>
                <td className={TD}>
                  <div className="font-medium">{r.title ?? r.domain}</div>
                  <div className="truncate text-xs text-muted-foreground">{r.url}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── YouTube Rank Tracker ─────────────────────────────────────────────────────

export function YoutubeSection({ data }: { data: { rows: any[] } }) {
  return (
    <div className={`${card} overflow-x-auto`}>
      <table className="w-full min-w-[520px] border-collapse text-[13px]">
        <thead>
          <tr>
            <th className={TH}>Keyword</th>
            <th className={`${TH} w-32`}>Your best video</th>
            <th className={TH}>Top video now</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.rows.map((r) => (
            <tr key={r.id ?? r.keyword}>
              <td className={`${TD} font-medium`}>{r.keyword}</td>
              <td className={`${TD} font-semibold ${posTone(r.bestVideoPosition)}`}>{r.status === "FAILED" || !r.status ? "Couldn't check" : r.notInTop ? "Not in results" : pos(r.bestVideoPosition)}</td>
              <td className={`${TD} text-muted-foreground`}>
                {r.topVideoTitle ?? "—"}
                {r.topChannelName && <span className="block text-xs">{r.topChannelName}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Google Maps Tracker ──────────────────────────────────────────────────────

export function MapsTrackerSection({ scan }: { scan: any }) {
  const [selected, setSelected] = useState<string | null>(null)
  const k = scan.keywords?.[0] ?? {}
  const size: number = scan.gridSize ?? 3
  const points: any[] = k.points ?? []
  const mid = (size - 1) / 2
  // The scan in the shape the Maps audit draws on the Google map, the tracker's own way.
  const grid: Grid | null =
    scan.centerLat != null && points.length
      ? {
          keyword: k.keyword ?? "",
          gridSize: size,
          radiusMeters: scan.radiusMeters,
          spacingMeters: scan.spacingMeters,
          zoom: scan.zoom,
          depth: 20,
          centerLat: scan.centerLat,
          centerLng: scan.centerLng,
          points: points.map((p) => ({
            row: p.row,
            col: p.col,
            lat: p.latitude ?? p.lat,
            lng: p.longitude ?? p.lng,
            isCenter: p.row === mid && p.col === mid,
            status: p.status === "SUCCEEDED" ? "SUCCEEDED" : "FAILED",
            rank: p.rank,
            top: [],
          })),
          metrics: { arp: null, atrp: null, solv: null, visibility: null, foundPoints: 0, scoredPoints: 0, top3Points: 0 },
        }
      : null
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 print:grid-cols-4">
        <StatCard compact label="Visibility" hint="How visible the business is across the grid, 0–100%." value={k.visibility != null ? `${Math.round(k.visibility)}%` : "—"} caption={k.keyword ? `for “${k.keyword}”` : "—"} tone="text-foreground" />
        <StatCard compact label="Average rank" hint="Average position where the business was found." value={k.arp != null ? Number(k.arp).toFixed(1) : "—"} caption="where found" tone="text-foreground" />
        <StatCard compact label="Found at" hint="Grid points where the business appears in the top 20." value={k.foundPoints ?? "—"} caption={`of ${scan.totalPoints ?? size ** 2} points`} tone="text-foreground" />
        <StatCard compact label="Best / worst" hint="Its best and worst rank across the grid." value={k.bestRank != null ? `#${k.bestRank}` : "—"} caption={k.worstRank != null ? `worst #${k.worstRank}` : "—"} tone="text-foreground" />
      </div>
      {grid && (
        <div className={`${card} p-4`}>
          <RankGridView grid={grid} unit={scan.displayUnit === "IMPERIAL" ? "IMPERIAL" : "METRIC"} selected={selected} onSelect={setSelected} size="lg" />
        </div>
      )}
      <Pitch>
        <p>
          This is your Google Business Profile&apos;s ranking position for one of your targeted keywords{k.keyword ? <>, <b>{k.keyword}</b></> : null}, checked from {scan.totalPoints ?? size ** 2}{" "}
          points around your business.{" "}
          {k.foundPoints > 0
            ? `You appear in the top 20 at ${k.foundPoints} of them${k.bestRank != null ? `, at best #${k.bestRank}` : ""}.`
            : "Your profile doesn't appear in the top 20 at any of them yet."}
        </p>
        <p>
          Please note that local rankings depend on several factors. Our team can help you fully optimize your Google Business Profile and improve your overall local SEO performance to achieve
          better rankings on Google Maps.
        </p>
      </Pitch>
    </div>
  )
}

// ── AI assistants ────────────────────────────────────────────────────────────

export function AiPromptsSection({ data, brand }: { data: { prompts: any[] }; brand: string }) {
  const latest = (p: any, pl: Platform) => (p.runs ?? []).find((r: any) => r.platform === pl && r.status === "COMPLETED")
  const rates: Partial<Record<Platform, number | null>> = {}
  for (const pl of PLATFORMS) {
    const vals = data.prompts.map((p) => latest(p, pl)?.mentionRate).filter((v): v is number => typeof v === "number")
    rates[pl] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }
  const answers = data.prompts.flatMap((p) => PLATFORMS.map((pl) => latest(p, pl)).filter(Boolean))
  const named = answers.filter((r: any) => (r.mentionRate ?? 0) > 0).length
  return (
    <div className="space-y-4">
      <BrandEngines rates={rates} />
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={TH}>Question a customer asks</th>
              {PLATFORMS.map((pl) => (
                <th key={pl} className={`${TH} w-24 text-center`}>
                  {PLATFORM_LABEL[pl]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.prompts.map((p) => (
              <tr key={p.id}>
                <td className={TD}>{p.prompt}</td>
                {PLATFORMS.map((pl) => {
                  const r = latest(p, pl)
                  const named = r && (r.mentionRate ?? 0) > 0
                  return (
                    <td key={pl} className={`${TD} text-center`}>
                      {!r ? "—" : named ? <CheckCircle2 className="mx-auto h-4 w-4 text-green-600 dark:text-green-400" aria-label="Named" /> : <XCircle className="mx-auto h-4 w-4 text-red-500" aria-label="Not named" />}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pitch>
        <p>
          We have asked AI tools {data.prompts.length} {data.prompts.length === 1 ? "question" : "questions"} your customers ask, and here is your business&apos;s presence:{" "}
          <b>{brand}</b> was named in <b>{named}</b> of {answers.length} answers (a tick in the table). We can help improve this: our AEO and GEO service helps your business get found in AI
          answers, by working on what these assistants read about you (your website, profile, reviews and citations).
        </p>
      </Pitch>
    </div>
  )
}

// ── Google Ads analysis ──────────────────────────────────────────────────────

export function AdsSection({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      <AdsHero data={data} />
      <AdsReport data={data} />
    </div>
  )
}

// ── Competitor analysis ──────────────────────────────────────────────────────

export function CompetitorSection({ analysis }: { analysis: any }) {
  return (
    <div className="space-y-4">
      <div className="print:[&_.cmp-compare]:overflow-visible print:[&_table]:min-w-0!">
        <CompetitorComparisonTable analysis={analysis} />
      </div>
      <Pitch>
        <b>We&apos;ll close these gaps</b>: content, internal links and authority, so your page can move up past them.
      </Pitch>
    </div>
  )
}

// ── Internal links ───────────────────────────────────────────────────────────

export function LinksSection({ analysis }: { analysis: any }) {
  const g = analysis.internalLinkGraph ?? {}
  const m = g.metadata ?? {}
  const orphans: any[] = g.orphanData?.graphOrphans ?? []
  const top: any[] = m.topLinkedPages ?? []
  const label = (x: any) => (typeof x === "string" ? x : (x?.url ?? ""))
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 print:grid-cols-4">
        <StatCard compact label="Pages" hint="Pages found by following the site's links." value={num(m.totalPages)} caption="crawled" tone="text-foreground" />
        <StatCard compact label="Internal links" hint="Links between the site's own pages." value={num(m.totalLinks)} caption={m.averageLinksPerPage != null ? `${Number(m.averageLinksPerPage).toFixed(1)} per page` : "—"} tone="text-foreground" />
        <StatCard compact label="Orphan pages" hint="Pages no other page links to: Google can hardly find them." value={num(m.orphanPages ?? orphans.length)} caption="no links in" tone={(m.orphanPages ?? orphans.length) > 0 ? "text-red-500" : "text-foreground"} />
        <StatCard compact label="Hub pages" hint="Pages that link out to many others." value={num(m.hubPages)} caption="spread authority" tone="text-foreground" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <div className="border-b border-border px-4 py-3 text-[13px] font-semibold">Orphan pages</div>
          <ul className="divide-y divide-border text-[13px]">
            {orphans.slice(0, 10).map((o, i) => (
              <li key={i} className="truncate px-4 py-2 text-muted-foreground">
                {label(o)}
              </li>
            ))}
            {orphans.length === 0 && <li className="px-4 py-2 text-muted-foreground">None found.</li>}
          </ul>
        </div>
        <div className={card}>
          <div className="border-b border-border px-4 py-3 text-[13px] font-semibold">Most linked pages</div>
          <ul className="divide-y divide-border text-[13px]">
            {top.slice(0, 10).map((t, i) => (
              <li key={i} className="flex justify-between gap-3 px-4 py-2">
                <span className="truncate text-muted-foreground">{label(t)}</span>
                {typeof t === "object" && (t?.inboundLinks ?? t?.inboundCount) != null && <span className="shrink-0 tabular-nums">{t.inboundLinks ?? t.inboundCount}</span>}
              </li>
            ))}
            {top.length === 0 && <li className="px-4 py-2 text-muted-foreground">—</li>}
          </ul>
        </div>
      </div>
      <Pitch>
        <b>We&apos;ll link every orphan page</b> from the pages that carry the most weight, so Google finds and ranks them.
      </Pitch>
    </div>
  )
}

// ── Keyword Magic research ───────────────────────────────────────────────────

export function KeywordMagicSection({ data }: { data: any }) {
  const rows: any[] = [...(data.keywords ?? [])].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard compact label="Keyword ideas" hint="Related searches found." value={num(data.totalCount ?? rows.length)} caption="related searches" tone="text-foreground" />
        <StatCard compact label="Total searches" hint="Combined monthly search volume." value={num(data.totalVolume)} caption="a month" tone="text-foreground" />
        <StatCard compact label="Average difficulty" hint="How hard these are to rank for, 0–100." value={data.avgDifficulty != null ? Math.round(data.avgDifficulty) : "—"} caption="out of 100" tone="text-foreground" />
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full min-w-[560px] border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={TH}>Keyword</th>
              <th className={`${TH} w-28 text-right`}>Searches / mo</th>
              <th className={`${TH} w-24 text-right`}>CPC</th>
              <th className={`${TH} w-24 text-right`}>Difficulty</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.slice(0, 20).map((r) => (
              <tr key={r.keyword}>
                <td className={`${TD} font-medium`}>{r.keyword}</td>
                <td className={`${TD} text-right tabular-nums`}>{num(r.volume)}</td>
                <td className={`${TD} text-right tabular-nums`}>{typeof r.cpc === "number" ? `$${r.cpc.toFixed(2)}` : "—"}</td>
                <td className={`${TD} text-right tabular-nums`}>{r.difficulty ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Keyword Score Checker ────────────────────────────────────────────────────

export function KeywordScoreSection({ analysis, keyword }: { analysis: any; keyword: string }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 print:grid-cols-4">
        <StatCard compact label="Keyword score" hint="How well the page is optimised for the keyword, 0–100." value={analysis.overallScore != null ? `${Math.round(analysis.overallScore)}/100` : "—"} caption={`for “${keyword}”`} tone="text-foreground" />
        <StatCard compact label="Domain authority" hint="The whole site's link strength, 0–100." value={analysis.domainAuthority ?? "—"} caption="out of 100" tone="text-foreground" />
        <StatCard compact label="Page authority" hint="This page's link strength, 0–100." value={analysis.pageAuthority ?? "—"} caption="out of 100" tone="text-foreground" />
        <StatCard compact label="Backlinks" hint="Links from other sites to the domain." value={num(analysis.domainBacklinks)} caption="to the domain" tone="text-foreground" />
      </div>
      {analysis.crawlData && <KeywordAnalysisReport crawlData={analysis.crawlData} keyword={keyword} />}
    </div>
  )
}

export function ExtLinkNote({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline print:hidden">
      {children} <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  )
}
