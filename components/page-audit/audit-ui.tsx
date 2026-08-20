"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
// This app authenticates with its own JWT context, not NextAuth. useAuth exposes
// { user, loading }; the shim below maps that onto the "authenticated" |
// "loading" | "unauthenticated" status string the ported code expects, so the
// ~4,600 lines below read unchanged.
import { useAuth } from "@/lib/auth"
import { api, ApiError, API_BASE } from "@/lib/api"
import * as d3 from "d3"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible"
import { AskAiPanel } from "@/components/page-audit/ask-ai-panel"
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ArrowRight,
  Shield,
  Zap,
  Globe,
  BarChart2,
  Lock,
  Link2,
  Code2,
  Eye,
  RefreshCw,
  Share2,
  MapPin,
  Search,
  Download,
  Copy,
} from "lucide-react"
import { downloadAuditPdf } from "@/lib/audit-pdf"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Issue {
  id: string
  category: string
  type: string
  title: string
  description: string
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO"
  impactScore: number
  pageUrl: string
}

export interface PassingCheck {
  category: string
  code: string
  title: string
  description: string
  pageUrl: string
  goodPractice: string
}

export interface CategoryScore {
  score: number
  grade: string
  tier: string
}

export interface CategoryDetail {
  category: string
  score: number
  grade: string
  tier: string
  issueCount: number
  passingCount: number
  bonus: number
}

export interface ScoreSummary {
  overall: CategoryScore
  categories: Array<{
    category: string
    score: number
    grade: string
    tier: string
    weight: number
    contribution: number
  }>
  statistics: {
    totalIssues: number
    totalPassing: number
    penaltyPoints: number
    bonusPoints: number
    pagesAnalyzed: number
  }
  insights: {
    overall: string
    categories: Array<{
      category: string
      insight: string
    }>
    recommendations: string[]
  }
}

export type AuditSection = "seo" | "performance" | "ui" | "links" | "technology" | "social" | "geo"

export interface SectionScore {
  section: AuditSection
  score: number
  checks: number
}

export interface SEOAuditCheck {
  id: string
  name: string
  maxScore: number
  priority: 1 | 2 | 3
  section: AuditSection
  informational: boolean
  what: string
  why: string
  how: string
  time?: string
  category: string
  passed: boolean | null
  score: number
  shortAnswer: string
  answer: string
  recommendation: string | null
  value?: string | number | null
  pageUrl?: string
  /** Structured payload from the backend rule. Shape varies per check. */
  data?: Record<string, unknown> | null
}

// A single high-value backlink shown in the "Top Backlinks" table.
export interface BacklinkRow {
  domainStrength: number
  domainFrom: string
  urlFrom: string
  pageTitle: string
  anchor: string
  dofollow: boolean
}

// Backlink profile (summary + top backlinks). Informational — does not affect
// the audit score. May be null when the data is unavailable.
export interface BacklinkProfile {
  target: string
  rank: number
  backlinks: number
  referringDomains: number
  referringMainDomains: number
  referringIps: number
  brokenBacklinks: number
  brokenPages: number
  dofollow: number
  nofollow: number
  referringLinkTypes: Record<string, number>
  topBacklinks?: BacklinkRow[]
  firstSeen: string | null
  lastSeen: string | null
  fetchedAt?: string
  cached?: boolean
}

export interface AuditReport {
  id: string
  jobId?: string
  url: string
  status: "PROCESSING" | "COMPLETED" | "FAILED"
  pagesAnalyzed: number
  /** Which audit produced this: one URL, or a crawl outward from it. */
  mode?: "SINGLE" | "SITE"

  scoring: {
    overall: CategoryScore
    categories: {
      technical: CategoryScore
      onPage: CategoryScore
      performance: CategoryScore
      accessibility: CategoryScore
      links: CategoryScore
      structuredData: CategoryScore
      security: CategoryScore
    }
  }

  summary: ScoreSummary
  categoryDetails: CategoryDetail[]
  issues: Issue[]
  passingChecks: PassingCheck[]

  sectionScores?: SectionScore[]
  checks?: SEOAuditCheck[]

  // Cached desktop + mobile screenshots — backend persists these on the
  // AuditReport row on first capture, so subsequent refreshes are instant.
  screenshots?: { desktop?: string | null; mobile?: string | null } | null

  // Cached internal link-graph crawl result — same lazy-cache pattern as
  // screenshots: persisted on first crawl, instant on refresh.
  linkGraph?: InternalLinkGraphData | null

  // Backlink profile (DataForSEO summary), cached per-domain on the backend.
  // Informational only — never affects the score.
  backlinks?: BacklinkProfile | null

  // PageSpeed runs asynchronously after the main audit. While "pending",
  // the Performance category shows a loading state and the page re-polls
  // until status is "completed" / "failed" / "skipped".
  pageSpeedStatus?: "pending" | "completed" | "failed" | "skipped" | null

  createdAt: string
  completedAt: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * This app's API, not the audit package's.
 *
 * The package defaulted to its own service on :3999, so every direct call it
 * made here — screenshots, link-graph — went to a port with nothing on it and
 * failed silently. That is why the report showed "Screenshot unavailable".
 */
export const API_URL = API_BASE

export const CATEGORY_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  TECHNICAL:       { label: "Technical",        icon: Code2,    color: "text-blue-500" },
  ON_PAGE:         { label: "On-Page SEO",       icon: Globe,    color: "text-violet-500" },
  PERFORMANCE:     { label: "Performance",       icon: Zap,      color: "text-yellow-500" },
  ACCESSIBILITY:   { label: "Accessibility",     icon: Eye,      color: "text-green-500" },
  LINKS:           { label: "Links",             icon: Link2,    color: "text-cyan-500" },
  STRUCTURED_DATA: { label: "Structured Data",   icon: BarChart2,color: "text-orange-500" },
  SECURITY:        { label: "Security",          icon: Shield,   color: "text-red-500" },
}

export const SECTION_META: Record<AuditSection, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  seo:         { label: "SEO",         icon: Globe },
  performance: { label: "Performance", icon: Zap },
  ui:          { label: "Usability",   icon: Eye },
  links:       { label: "Links",       icon: Link2 },
  technology:  { label: "Technology",  icon: Code2 },
  social:      { label: "Social",      icon: Share2 },
  geo:         { label: "Local / Geo", icon: MapPin },
}

export const SEVERITY_META = {
  CRITICAL: { label: "Critical", color: "bg-red-500/10 text-red-600 dark:text-red-400",     dot: "bg-red-500",    order: 0 },
  HIGH:     { label: "High",     color: "bg-orange-500/10 text-orange-600 dark:text-orange-400", dot: "bg-orange-500", order: 1 },
  MEDIUM:   { label: "Medium",   color: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",dot: "bg-yellow-500", order: 2 },
  LOW:      { label: "Low",      color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",  dot: "bg-blue-500",   order: 3 },
  INFO:     { label: "Info",     color: "bg-gray-500/10 text-gray-600 dark:text-gray-400",   dot: "bg-gray-400",   order: 4 },
}

// Per-category check ordering. Checks whose IDs appear here render in this
// exact order at the top of the section; any check IDs not listed fall to
// the end in their backend-sorted order (priority then id).
// To reorder a category, just edit its array; to take a category off this
// override, remove the key entirely.
export const CHECK_ORDER: Partial<Record<string, readonly string[]>> = {
  ON_PAGE: [
    "TITLE_TAG",
    "META_DESCRIPTION",
    "SERP_SNIPPET",
    "HREFLANG",
    "LANG_ATTRIBUTE",
    "H1_TAG",
    "H2_H6_HEADERS",
    "KEYWORD_CONSISTENCY",
    "WORD_COUNT",
    "IMAGE_ALT_TEXT",
    "CANONICAL_TAG",
  ],
  TECHNICAL: [
    "NOINDEX_HEADER",
    "NOINDEX_TAG",
    "SSL_ENABLED",
    "ROBOTS_TXT",
    "XML_SITEMAP",
    "CHARSET_UTF8",
    "ANALYTICS_DETECTION",
  ],
}

export const CATEGORY_TO_SECTION: Record<string, AuditSection> = {
  TECHNICAL: "seo",
  ON_PAGE: "seo",
  PERFORMANCE: "performance",
  ACCESSIBILITY: "ui",
  LINKS: "links",
  STRUCTURED_DATA: "technology",
  SECURITY: "technology",
}

// Ordered by SEO weight (most actionable / highest impact first), matching
// CATEGORY_WEIGHTS in the backend scoring config: On-Page 30%, Technical/
// Performance 20%, Security/Links 10%, Accessibility/Structured Data 5%.
export const CATEGORY_SCORES_DEF = [
  { key: "ON_PAGE",         label: "On-Page SEO",     category: "onPage" },
  { key: "TECHNICAL",       label: "Technical",       category: "technical" },
  { key: "LINKS",           label: "Links",           category: "links" },
  { key: "SECURITY",        label: "Security",        category: "security" },
  { key: "PERFORMANCE",     label: "Performance",     category: "performance" },
  { key: "ACCESSIBILITY",   label: "Accessibility",   category: "accessibility" },
  { key: "STRUCTURED_DATA", label: "Structured Data", category: "structuredData" },
] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function scoreColor(score: number): string {
  if (score >= 90) return "text-green-600 dark:text-green-400"
  if (score >= 80) return "text-green-500"
  if (score >= 70) return "text-lime-500"
  if (score >= 60) return "text-yellow-500"
  if (score >= 50) return "text-orange-500"
  return "text-red-500"
}

export function scoreBg(score: number): string {
  if (score >= 90) return "stroke-green-600 dark:stroke-green-400"
  if (score >= 80) return "stroke-green-500"
  if (score >= 70) return "stroke-lime-500"
  if (score >= 60) return "stroke-yellow-500"
  if (score >= 50) return "stroke-orange-500"
  return "stroke-red-500"
}

/**
 * How much of the ring to draw. A+ (score ≥95) snaps to 100% so the ring
 * visually closes — looks broken to render an "excellent" grade with a gap.
 */
function ringFillPercent(score: number): number {
  if (score >= 95) return 100
  return Math.max(0, Math.min(100, score))
}

export function gradeColor(grade: string): string {
  if (grade.startsWith("A")) return "text-green-600 dark:text-green-400"
  if (grade.startsWith("B")) return "text-lime-500"
  if (grade.startsWith("C")) return "text-yellow-500"
  if (grade.startsWith("D")) return "text-orange-500"
  return "text-red-500"
}

export function gradeBgColor(grade: string): string {
  if (grade.startsWith("A")) return "bg-green-500/10 border-green-500/30"
  if (grade.startsWith("B")) return "bg-lime-500/10 border-lime-500/30"
  if (grade.startsWith("C")) return "bg-yellow-500/10 border-yellow-500/30"
  if (grade.startsWith("D")) return "bg-orange-500/10 border-orange-500/30"
  return "bg-red-500/10 border-red-500/30"
}

export function gradeCardStyle(grade: string): { bg: string; text: string } {
  if (!grade || grade === "N/A") return { bg: "bg-gray-500", text: "text-white" }
  if (grade.startsWith("A")) return { bg: "bg-green-500", text: "text-white" }
  if (grade.startsWith("B")) return { bg: "bg-blue-500", text: "text-white" }
  if (grade.startsWith("C")) return { bg: "bg-yellow-400", text: "text-gray-900" }
  if (grade.startsWith("D")) return { bg: "bg-orange-500", text: "text-white" }
  return { bg: "bg-red-600", text: "text-white" }
}

export function sectionScoreToGrade(score: number): string {
  if (score >= 90) return "A"
  if (score >= 80) return "B"
  if (score >= 70) return "C"
  if (score >= 60) return "D"
  return "F"
}

export function gradeTagline(grade: string): string {
  if (grade.startsWith("A")) return "Your page is excellent!"
  if (grade.startsWith("B")) return "Your page is doing well"
  if (grade.startsWith("C")) return "Your page could be better"
  if (grade.startsWith("D")) return "Your page needs work"
  return "Your page needs significant improvement"
}

export function categoryTagline(categoryLabel: string, grade: string): string {
  const suffix = grade.startsWith("A") ? "is excellent!"
    : grade.startsWith("B") ? "is good"
    : grade.startsWith("C") ? "could be better"
    : grade.startsWith("D") ? "needs work"
    : "needs significant improvement"
  return `Your ${categoryLabel} ${suffix}`
}

export function transformReport(data: Record<string, unknown>): AuditReport {
  return {
    id: data.id as string,
    jobId: data.jobId as string | undefined,
    url: data.url as string,
    status: data.status as AuditReport["status"],
    pagesAnalyzed: data.pagesAnalyzed as number,
    mode: (data.mode as AuditReport["mode"]) ?? undefined,
    scoring: {
      overall: {
        score: data.overallScore as number,
        grade: (data.overallGrade as string) || "N/A",
        tier: (data.overallTier as string) || "Unknown",
      },
      categories: {
        technical:     { score: data.technicalScore as number,     grade: (data.technicalGrade as string)     || "N/A", tier: (data.technicalTier as string)     || "Unknown" },
        onPage:        { score: data.onPageScore as number,        grade: (data.onPageGrade as string)        || "N/A", tier: (data.onPageTier as string)         || "Unknown" },
        performance:   { score: data.performanceScore as number,   grade: (data.performanceGrade as string)   || "N/A", tier: (data.performanceTier as string)    || "Unknown" },
        accessibility: { score: data.accessibilityScore as number, grade: (data.accessibilityGrade as string) || "N/A", tier: (data.accessibilityTier as string)  || "Unknown" },
        links:         { score: data.linkScore as number,          grade: (data.linkGrade as string)          || "N/A", tier: (data.linkTier as string)           || "Unknown" },
        structuredData:{ score: data.structuredDataScore as number,grade: (data.structuredDataGrade as string)|| "N/A", tier: (data.structuredDataTier as string) || "Unknown" },
        security:      { score: data.securityScore as number,      grade: (data.securityGrade as string)      || "N/A", tier: (data.securityTier as string)       || "Unknown" },
      },
    },
    summary: (data.summary as AuditReport["summary"]) || {
      overall: { score: data.overallScore as number, grade: (data.overallGrade as string) || "N/A", tier: (data.overallTier as string) || "Unknown" },
      categories: [],
      statistics: {
        totalIssues: ((data.issues as unknown[]) || []).length,
        totalPassing: ((data.passingChecks as unknown[]) || []).length,
        penaltyPoints: 0,
        bonusPoints: 0,
        pagesAnalyzed: data.pagesAnalyzed as number,
      },
      insights: { overall: "", categories: [], recommendations: [] },
    },
    categoryDetails: [],
    issues: (data.issues as Issue[]) || [],
    passingChecks: (data.passingChecks as PassingCheck[]) || [],
    sectionScores: data.sectionScores as SectionScore[] | undefined,
    checks: data.checks as SEOAuditCheck[] | undefined,
    screenshots: (data.screenshots as AuditReport["screenshots"]) ?? null,
    linkGraph: (data.linkGraph as InternalLinkGraphData | null) ?? null,
    backlinks: (data.backlinks as BacklinkProfile | null) ?? null,
    pageSpeedStatus: (data.pageSpeedStatus as AuditReport["pageSpeedStatus"]) ?? null,
    createdAt: data.createdAt as string,
    completedAt: data.completedAt as string,
  }
}

// ─── Score Ring ───────────────────────────────────────────────────────────────

export function ScoreRing({ score, grade, tier, size = 120 }: { score: number; grade?: string; tier?: string; size?: number }) {
  const radius = (size - 16) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} className="stroke-border" strokeWidth={8} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          strokeWidth={8} fill="none" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className={`transition-all duration-1000 ${scoreBg(score)}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-bold font-mono ${scoreColor(score)}`}>{Math.round(score)}</span>
        {grade && <span className={`text-lg font-bold font-mono ${gradeColor(grade)}`}>{grade}</span>}
        {tier && <span className="text-xs text-muted-foreground">{tier}</span>}
      </div>
    </div>
  )
}

// ─── Gauge Dial ───────────────────────────────────────────────────────────────

export function GaugeDial({ grade, score, size = 120, pending = false }: { grade: string; score: number; size?: number; pending?: boolean }) {
  const [filled, setFilled] = useState(false)
  useEffect(() => { const t = setTimeout(() => setFilled(true), 50); return () => clearTimeout(t) }, [])

  const sw = 10
  const r = (size - sw) / 2
  const cx = size / 2
  const cy = size / 2
  const circ = 2 * Math.PI * r
  const trackArc = circ * 0.75
  const fillArc  = trackArc * (filled ? ringFillPercent(score) : 0) / 100

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {pending ? (
        // Indeterminate spinner: animated arc on a subtle track
        <svg width={size} height={size} className="animate-spin" style={{ animationDuration: "1.6s" }}>
          <g transform={`rotate(135, ${cx}, ${cy})`}>
            <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={sw} strokeLinecap="round" className="stroke-border/40" strokeDasharray={`${trackArc} ${circ - trackArc}`} />
            <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={sw} strokeLinecap="round" className="stroke-accent" strokeDasharray={`${trackArc * 0.25} ${circ - trackArc * 0.25}`} />
          </g>
        </svg>
      ) : (
        <svg width={size} height={size}>
          <g transform={`rotate(135, ${cx}, ${cy})`}>
            <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={sw} strokeLinecap="round" className="stroke-border/40" strokeDasharray={`${trackArc} ${circ - trackArc}`} />
            <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={sw} strokeLinecap="round" className={`transition-all duration-1000 ease-out ${scoreBg(score)}`} strokeDasharray={`${fillArc} ${circ - fillArc}`} />
          </g>
        </svg>
      )}
      <div className="absolute inset-0 flex items-center justify-center">
        {pending ? (
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">…</span>
        ) : (
          <span className={`font-bold font-mono leading-none ${gradeColor(grade)}`} style={{ fontSize: Math.round(size * 0.28) }}>
            {grade}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Overall Grade Ring ───────────────────────────────────────────────────────

export function OverallGradeRing({ grade, score, size = 200 }: { grade: string; score: number; size?: number }) {
  const [filled, setFilled] = useState(false)
  useEffect(() => { const t = setTimeout(() => setFilled(true), 50); return () => clearTimeout(t) }, [])

  const radius = (size - 20) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - ((filled ? ringFillPercent(score) : 0) / 100) * circumference

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} className="stroke-border/40" strokeWidth={14} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          strokeWidth={14} fill="none" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className={`transition-all duration-1000 ease-out ${scoreBg(score)}`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`font-bold font-mono ${gradeColor(grade)}`} style={{ fontSize: Math.round(size * 0.28) }}>
          {grade}
        </span>
      </div>
    </div>
  )
}

// ─── Website Screenshot ───────────────────────────────────────────────────────

type ScreenshotData = { desktop: string | null; mobile: string | null; failed?: boolean }

const screenshotCache = new Map<string, ScreenshotData>()
const screenshotPromises = new Map<string, Promise<ScreenshotData>>()

/**
 * Kick off a screenshot fetch (or return the in-flight one) for a URL.
 * Subsequent WebsiteScreenshot mounts read from the cache instead of refetching.
 * Callers can await this to gate UI transitions on the screenshot being ready.
 *
 * If `auditReportId` is provided, the backend persists the result on the
 * AuditReport row so refreshing the page returns the cached screenshots
 * instantly instead of recapturing them.
 */
export function prefetchScreenshot(url: string, auditReportId?: string): Promise<ScreenshotData> {
  const cached = screenshotCache.get(url)
  if (cached) return Promise.resolve(cached)
  const inFlight = screenshotPromises.get(url)
  if (inFlight) return inFlight

  const promise = (async (): Promise<ScreenshotData> => {
    try {
      // Through the api client: the endpoint is behind auth (capturing means
      // driving a real browser, so it can't be open), and the client is what
      // attaches the JWT and refreshes it.
      const data = await api.post<{ screenshots?: { desktop?: string | null; mobile?: string | null } }>(
        "/api/page-audit/screenshots",
        auditReportId ? { url, auditReportId } : { url },
      )
      const result: ScreenshotData = {
        desktop: data.screenshots?.desktop ?? null,
        mobile: data.screenshots?.mobile ?? null,
      }
      screenshotCache.set(url, result)
      return result
    } catch {
      const result: ScreenshotData = { desktop: null, mobile: null, failed: true }
      screenshotCache.set(url, result)
      return result
    }
  })()
  screenshotPromises.set(url, promise)
  return promise
}

export function WebsiteScreenshot({
  url,
  auditReportId,
  initial,
}: {
  url: string
  auditReportId?: string
  /** Screenshots persisted on the AuditReport — skip fetching when present. */
  initial?: { desktop?: string | null; mobile?: string | null } | null
}) {
  const t = useTranslations("pageAudit")
  // Seed the module-level cache from the persisted report data, so callers
  // of prefetchScreenshot() (e.g. the audit page's loading gate) also benefit.
  if (initial && (initial.desktop || initial.mobile) && !screenshotCache.has(url)) {
    screenshotCache.set(url, {
      desktop: initial.desktop ?? null,
      mobile: initial.mobile ?? null,
    })
  }
  const cached = screenshotCache.get(url)
  const [data, setData] = useState<ScreenshotData | null>(cached ?? null)
  const [loading, setLoading] = useState(!cached)

  useEffect(() => {
    if (screenshotCache.has(url)) {
      setData(screenshotCache.get(url)!)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    prefetchScreenshot(url, auditReportId).then((d) => {
      if (cancelled) return
      setData(d)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [url, auditReportId])

  if (loading) {
    return (
      <div className="relative h-72 w-full">
        <div className="absolute left-0 top-0 h-[55%] w-[76%] rounded-xl border border-border/30 bg-muted animate-pulse" />
        <div className="absolute right-0 top-[12%] h-[88%] w-[35%] rounded-xl border border-border/30 bg-muted/60 animate-pulse" />
      </div>
    )
  }

  if (!data || data.failed || (!data.desktop && !data.mobile)) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-border/40 bg-muted/30">
        <p className="text-sm text-muted-foreground">{t("screenshotUnavailable")}</p>
      </div>
    )
  }

  const desktopSrc = data.desktop ? `data:image/jpeg;base64,${data.desktop}` : null
  const mobileSrc = data.mobile ? `data:image/jpeg;base64,${data.mobile}` : null

  return (
    <div className="relative h-72 w-full select-none">
      {desktopSrc && (
        <div className="absolute left-0 top-0 h-[95%] w-[90%] overflow-hidden rounded-lg border border-border/40 bg-card shadow-md">
          <img src={desktopSrc} alt={t("desktopPreview")} className="h-full w-full object-fill object-top" />
        </div>
      )}
      {mobileSrc && (
        <div className="absolute right-0 top-[12%] h-[90%] w-[30%] overflow-hidden rounded-lg border border-border/40 bg-card shadow-xl">
          <img src={mobileSrc} alt={t("mobilePreview")} className="h-full w-full object-fill object-top" />
        </div>
      )}
    </div>
  )
}

// ─── SERP Preview ─────────────────────────────────────────────────────────────
//
// Renders the page as a Google search result would display it: favicon +
// breadcrumb URL, blue title, gray description. Pulls title/description from
// the canonical checks payload so it reflects exactly what's on the live page.

export function SerpPreview({
  url,
  title,
  description,
}: {
  url: string
  title: string | null
  description: string | null
}) {
  const t = useTranslations("pageAudit")
  if (!title && !description) return null

  let hostname = url
  let breadcrumb = url
  try {
    const u = new URL(url)
    hostname = u.hostname.replace(/^www\./, "")
    const segments = u.pathname.split("/").filter(Boolean)
    breadcrumb =
      segments.length > 0
        ? `https://${hostname} › ${segments.join(" › ")}`
        : `https://${hostname}`
  } catch {
    // leave defaults
  }

  const favicon = `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(url)}`

  return (
    <div className="py-5">
      {/* Heading row — matches the informational-check look (Hreflang etc.):
          Lucide Info circle + bold title + supporting description. */}
      <div className="mb-2 flex items-center gap-2">
        <Info className="h-4 w-4 shrink-0 text-blue-400" />
        <h4 className="text-[15px] font-semibold leading-snug text-foreground">
          {t("serpPreview")}
        </h4>
      </div>
      <p className="mb-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        This preview represents a simulated search engine result built from your page&rsquo;s metadata, including title tag, meta description, and URL structure. It helps visualize how your page may appear in organic listings, though search engines may dynamically alter snippets based on query intent, ranking signals, and content relevance.
      </p>

      {/* The Google-style snippet card itself — width matches the description
          paragraph above so the card and copy align flush. */}
      <div className="max-w-3xl rounded-lg border border-border/60 bg-card px-5 py-4">
        {/* Top row: favicon + site name + breadcrumb */}
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#ecedef] bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={favicon}
              alt=""
              width={18}
              height={18}
              referrerPolicy="no-referrer"
              className="h-[18px] w-[18px]"
              onError={(e) => {
                ;(e.currentTarget as HTMLImageElement).style.display = "none"
              }}
            />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-foreground">
              {hostname}
            </div>
            <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              <span className="truncate">{breadcrumb}</span>
              <span aria-hidden className="text-muted-foreground/60">⋮</span>
            </div>
          </div>
        </div>

        {/* Title — Google's signature blue/purple */}
        {title && (
          <h3
            className="mt-2 text-xl font-normal leading-snug text-[#1a0dab] hover:underline cursor-pointer"
            title={title}
          >
            {title}
          </h3>
        )}

        {/* Description — Google's gray body */}
        {description && (
          <p className="mt-1 line-clamp-2 text-sm leading-snug text-[#4d5156]">
            {description}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── H2-H6 Header Tag Breakdown ───────────────────────────────────────────────
//
// Renders the per-level heading counts produced by H2H6HeaderTagsRule as a
// table with a proportional bar — visually surfaces whether a page is making
// use of multiple heading levels at a glance.

type HeadingCounts = { h2: number; h3: number; h4: number; h5: number; h6: number }

export function HeadingsBreakdown({
  counts,
  samples,
  passed,
  shortAnswer,
}: {
  counts: HeadingCounts
  samples?: Partial<Record<keyof HeadingCounts, string[]>>
  passed: boolean | null
  shortAnswer: string
}) {
  const t = useTranslations("pageAudit")
  const [showDetails, setShowDetails] = useState(false)
  const levels: Array<keyof HeadingCounts> = ["h2", "h3", "h4", "h5", "h6"]
  const max = Math.max(1, ...levels.map((k) => counts[k]))

  return (
    <div className="py-5">
      {/* Heading row — status icon + title left-aligned, matching the other
          check rows (Title Tag, H1, Hreflang, etc.). */}
      <div className="mb-2 flex items-center gap-2">
        {passed === true ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
        ) : passed === false ? (
          <XCircle className="h-4 w-4 shrink-0 text-red-500" />
        ) : (
          <Info className="h-4 w-4 shrink-0 text-blue-400" />
        )}
        <h4 className="text-[15px] font-semibold leading-snug text-foreground">
          {t("headerTagUsage")}
        </h4>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{shortAnswer}</p>

      {/* Frequency table with proportional bars */}
      <div className="max-w-3xl rounded-lg border border-border/60 bg-card overflow-hidden">
        <div className="grid grid-cols-[88px_88px_1fr] items-center gap-3 border-b border-border/60 bg-muted/30 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <span>{t("headerTag")}</span>
          <span>{t("frequency")}</span>
          <span />
        </div>
        <ul className="divide-y divide-border/60">
          {levels.map((key) => {
            const n = counts[key]
            const widthPct = (n / max) * 100
            return (
              <li
                key={key}
                className="grid grid-cols-[88px_88px_1fr] items-center gap-3 px-4 py-2.5"
              >
                <span className="text-sm font-medium uppercase text-foreground">
                  {key}
                </span>
                <span className="text-sm tabular-nums text-foreground">{n}</span>
                <div className="relative h-2.5 rounded-full bg-muted/40">
                  {n > 0 && (
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-[#2774ff] transition-[width] duration-500"
                      style={{ width: `${widthPct}%` }}
                    />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Optional: show actual heading text per level */}
      {samples && Object.values(samples).some((arr) => arr && arr.length > 0) && (
        <>
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40"
          >
            {showDetails ? t("hideDetails") : t("showDetails")}
            {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showDetails && (
            <div className="mt-3 max-w-3xl space-y-3">
              {levels.map((key) => {
                const list = samples[key]
                if (!list || list.length === 0) return null
                return (
                  <div
                    key={key}
                    className="rounded-lg border border-border/60 bg-card px-4 py-3"
                  >
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {key} · {counts[key]}
                    </p>
                    <ul className="space-y-1 text-sm text-foreground/90">
                      {list.map((text, i) => (
                        <li key={i} className="truncate">
                          {text}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Keyword Consistency Tables ───────────────────────────────────────────────
//
// Renders the per-term breakdown produced by KeywordConsistencyRule —
// "Individual Keywords" (single words) and "Phrases" (bigrams) — each as a
// 5-column table showing which page elements (title/meta/headings) contain
// the term, its frequency, and a proportional bar.

interface KeywordRow {
  word: string
  count: number
  grade?: number
  title: boolean
  description: boolean
  headers: boolean
}

function KeywordConsistencyTable({
  caption,
  termLabel,
  rows,
}: {
  caption: string
  termLabel: string
  rows: KeywordRow[]
}) {
  const t = useTranslations("pageAudit")
  if (rows.length === 0) return null
  const max = Math.max(1, ...rows.map((r) => r.count))

  return (
    <div className="mt-6">
      <h5 className="mb-3 text-center text-base font-medium text-foreground/90">
        {caption}
      </h5>
      <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
        {/* Column headers */}
        <div className="grid grid-cols-[160px_88px_160px_140px_120px_1fr] items-center gap-3 border-b border-border/60 bg-muted/30 px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <span>{termLabel}</span>
          <span className="text-center">Title</span>
          <span className="text-center">{t("metaDescriptionTag")}</span>
          <span className="text-center">{t("headingTags")}</span>
          <span className="text-center">{t("pageFrequency")}</span>
          <span />
        </div>
        {/* Rows */}
        <ul className="divide-y divide-border/60">
          {rows.map((row) => {
            const widthPct = (row.count / max) * 100
            return (
              <li
                key={row.word}
                className="grid grid-cols-[160px_88px_160px_140px_120px_1fr] items-center gap-3 px-5 py-3"
              >
                <span className="truncate text-sm text-muted-foreground">
                  {row.word}
                </span>
                <span className="flex justify-center">
                  <PresenceIcon present={row.title} />
                </span>
                <span className="flex justify-center">
                  <PresenceIcon present={row.description} />
                </span>
                <span className="flex justify-center">
                  <PresenceIcon present={row.headers} />
                </span>
                <span className="text-center text-sm tabular-nums text-foreground">
                  {row.count}
                </span>
                <div className="relative h-2.5 rounded-full bg-muted/40">
                  {row.count > 0 && (
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-[#2774ff] transition-[width] duration-500"
                      style={{ width: `${widthPct}%` }}
                    />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

function PresenceIcon({ present }: { present: boolean }) {
  return present ? (
    <CheckCircle2 className="h-4 w-4 text-green-500" />
  ) : (
    <XCircle className="h-4 w-4 text-red-500" />
  )
}

export function KeywordConsistencyBreakdown({
  keywords,
  phrases,
  passed,
  shortAnswer,
}: {
  keywords: KeywordRow[]
  phrases: KeywordRow[]
  passed: boolean | null
  shortAnswer: string
}) {
  const t = useTranslations("pageAudit")
  if (keywords.length === 0 && phrases.length === 0) return null

  return (
    <div className="py-5">
      {/* Heading row — status icon + title, matches the other check rows */}
      <div className="mb-2 flex items-center gap-2">
        {passed === true ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
        ) : passed === false ? (
          <XCircle className="h-4 w-4 shrink-0 text-red-500" />
        ) : (
          <Info className="h-4 w-4 shrink-0 text-blue-400" />
        )}
        <h4 className="text-[15px] font-semibold leading-snug text-foreground">
          {t("keywordConsistency")}
        </h4>
      </div>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">{shortAnswer}</p>

      <KeywordConsistencyTable
        caption="Individual Keywords"
        termLabel="Keyword"
        rows={keywords}
      />
      <KeywordConsistencyTable
        caption="Phrases"
        termLabel="Phrase"
        rows={phrases}
      />
    </div>
  )
}

// ─── Image Alt Text Breakdown ─────────────────────────────────────────────────
//
// Renders the actual list of images on the page (thumbnail + filename + alt
// text or "Missing alt" badge) instead of just a count. Driven by the
// `data.samples` payload from ImageAltTextRule.

interface ImageSample {
  src: string
  alt: string | null
  hasAlt: boolean
}

function shortFilename(src: string): string {
  try {
    const u = new URL(src, "http://placeholder.invalid")
    const segs = u.pathname.split("/").filter(Boolean)
    const last = segs[segs.length - 1] ?? src
    return last.length > 40 ? last.slice(0, 37) + "..." : last
  } catch {
    return src.length > 40 ? src.slice(0, 37) + "..." : src
  }
}

export function ImageAltTextBreakdown({
  total,
  withAlt,
  missing,
  samples,
  passed,
  shortAnswer,
  pageUrl,
}: {
  total: number
  withAlt: number
  missing: number
  samples: ImageSample[]
  passed: boolean | null
  shortAnswer: string
  pageUrl?: string
}) {
  const t = useTranslations("pageAudit")
  const [showOnlyMissing, setShowOnlyMissing] = useState(false)
  const visible = showOnlyMissing ? samples.filter((s) => !s.hasAlt) : samples
  const hasMore = samples.length < total

  // Resolve a relative src against the audited page URL so thumbnails load.
  const resolveSrc = (src: string): string => {
    if (/^(data:|https?:|\/\/)/i.test(src)) return src
    try {
      return new URL(src, pageUrl ?? "http://placeholder.invalid").toString()
    } catch {
      return src
    }
  }

  return (
    <div className="py-5">
      {/* Heading row — status icon + title (matches the other check rows) */}
      <div className="mb-2 flex items-center gap-2">
        {passed === true ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
        ) : passed === false ? (
          <XCircle className="h-4 w-4 shrink-0 text-red-500" />
        ) : (
          <Info className="h-4 w-4 shrink-0 text-blue-400" />
        )}
        <h4 className="text-[15px] font-semibold leading-snug text-foreground">
          {t("imageAltText")}
        </h4>
      </div>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">{shortAnswer}</p>

      {/* Stats strip */}
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/40 px-3 py-1 font-medium text-foreground/80">
          Total <span className="tabular-nums">{total}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 font-semibold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3 w-3" />
          {t("withAlt")} <span className="tabular-nums">{withAlt}</span>
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold ${
            missing === 0
              ? "bg-muted/40 text-muted-foreground"
              : "bg-red-500/10 text-red-600 dark:text-red-400"
          }`}
        >
          <XCircle className="h-3 w-3" />
          {t("missingAlt")} <span className="tabular-nums">{missing}</span>
        </span>
        {missing > 0 && (
          <button
            type="button"
            onClick={() => setShowOnlyMissing((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 font-medium text-foreground/80 hover:bg-muted/40"
          >
            {showOnlyMissing ? t("showAll") : t("showOnlyMissing")}
          </button>
        )}
      </div>

      {/* Image grid — horizontal cards, multiple per row. Fills available width. */}
      {samples.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noImageSamples")}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((img, i) => {
              const fullSrc = resolveSrc(img.src)
              return (
                <div
                  key={`${img.src}-${i}`}
                  className={`flex gap-3 rounded-lg border bg-card p-3 ${
                    img.hasAlt
                      ? "border-border/60"
                      : "border-red-500/40 bg-red-500/5"
                  }`}
                >
                  {/* Thumbnail */}
                  <a
                    href={fullSrc}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-muted/40"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={fullSrc}
                      alt=""
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        ;(e.currentTarget as HTMLImageElement).style.display = "none"
                      }}
                    />
                  </a>

                  {/* Alt text + filename */}
                  <div className="min-w-0 flex-1">
                    {img.hasAlt ? (
                      <p
                        className="line-clamp-2 text-sm font-medium text-foreground"
                        title={img.alt ?? ""}
                      >
                        {img.alt}
                      </p>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-600 dark:text-red-400">
                        <XCircle className="h-3 w-3" />
                        {t("missingAlt")}
                      </span>
                    )}
                    <a
                      href={fullSrc}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block truncate text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                      title={fullSrc}
                    >
                      {shortFilename(img.src)}
                    </a>
                  </div>
                </div>
              )
            })}
          </div>

          {hasMore && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Showing {samples.length} of {total} images.
            </p>
          )}
        </>
      )}
    </div>
  )
}

// ─── Robots.txt View ──────────────────────────────────────────────────────────

export function RobotsTxtView({
  passed,
  shortAnswer,
  content,
  truncated,
  robotsUrl,
  disallowCount,
}: {
  passed: boolean | null
  shortAnswer: string
  content: string | null
  truncated: boolean
  robotsUrl?: string
  disallowCount?: number
}) {
  const t = useTranslations("pageAudit")
  return (
    <div className="py-5">
      <div className="mb-2 flex items-center gap-2">
        {passed === true ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
        ) : passed === false ? (
          <XCircle className="h-4 w-4 shrink-0 text-red-500" />
        ) : (
          <Info className="h-4 w-4 shrink-0 text-blue-400" />
        )}
        <h4 className="text-[15px] font-semibold leading-snug text-foreground">
          Robots.txt
        </h4>
      </div>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">{shortAnswer}</p>

      {passed && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            {robotsUrl && (
              <a
                href={robotsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 font-semibold text-accent hover:bg-accent/15"
              >
                <ExternalLink className="h-3 w-3" />
                {robotsUrl}
              </a>
            )}
            {typeof disallowCount === "number" && disallowCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/40 px-3 py-1 font-medium text-foreground/80">
                {disallowCount} Disallow rule{disallowCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
          {content ? (
            <div className="max-w-3xl overflow-hidden rounded-lg border border-border/60 bg-muted/30">
              <pre className="max-h-80 overflow-auto whitespace-pre p-4 text-xs leading-relaxed text-foreground/85 font-mono">
                {content}
              </pre>
              {truncated && (
                <div className="border-t border-border/60 bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
                  {t("fileTruncated")}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("fileNotCaptured")}
            </p>
          )}
        </>
      )}
    </div>
  )
}

// ─── Sitemap View ─────────────────────────────────────────────────────────────

export function SitemapView({
  passed,
  shortAnswer,
  urls,
  urlCount,
  truncated,
  sitemapUrl,
}: {
  passed: boolean | null
  shortAnswer: string
  urls: string[]
  urlCount: number
  truncated: boolean
  sitemapUrl?: string
}) {
  const t = useTranslations("pageAudit")
  const [showDetails, setShowDetails] = useState(false)
  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return urls
    return urls.filter((u) => u.toLowerCase().includes(q))
  }, [urls, search])

  return (
    <div className="py-5">
      <div className="mb-2 flex items-center gap-2">
        {passed === true ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
        ) : passed === false ? (
          <XCircle className="h-4 w-4 shrink-0 text-red-500" />
        ) : (
          <Info className="h-4 w-4 shrink-0 text-blue-400" />
        )}
        <h4 className="text-[15px] font-semibold leading-snug text-foreground">
          XML Sitemap
        </h4>
      </div>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">{shortAnswer}</p>

      {passed && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            {sitemapUrl && (
              <a
                href={sitemapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 font-semibold text-accent hover:bg-accent/15"
              >
                <ExternalLink className="h-3 w-3" />
                {sitemapUrl}
              </a>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/40 px-3 py-1 font-medium text-foreground/80">
              {urlCount} URL{urlCount === 1 ? "" : "s"}
            </span>
            {truncated && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 font-medium text-amber-600 dark:text-amber-400">
                Showing first {urls.length} of {urlCount}
              </span>
            )}
          </div>

          {urls.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40"
              >
                {showDetails ? t("hideDetails") : t("showDetails")}
                {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>

              {showDetails && (
                <div className="mt-3 space-y-2">
                  <div className="relative max-w-md">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t("filterUrls")}
                      className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/15"
                    />
                  </div>

                  {/* Table */}
                  <div className="max-w-4xl overflow-hidden rounded-lg border border-border/60 bg-card">
                    <div className="grid grid-cols-[56px_1fr] items-center gap-3 border-b border-border/60 bg-muted/30 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      <span>#</span>
                      <span>URL</span>
                    </div>
                    <div className="max-h-96 overflow-auto">
                      {filtered.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-muted-foreground">
                          No URLs match &ldquo;{search}&rdquo;.
                        </p>
                      ) : (
                        <ul className="divide-y divide-border/60">
                          {filtered.map((u, i) => (
                            <li
                              key={`${u}-${i}`}
                              className="grid grid-cols-[56px_1fr] items-center gap-3 px-4 py-2.5"
                            >
                              <span className="text-right text-[11px] tabular-nums text-muted-foreground/70">
                                {i + 1}
                              </span>
                              <a
                                href={u}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate text-sm text-foreground hover:text-accent hover:underline"
                                title={u}
                              >
                                {u}
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

// ─── Analytics Detection View ─────────────────────────────────────────────────
//
// Renders each detected analytics tool as its own card with a colored icon
// chip, instead of a comma-separated string. Driven by data.tools from
// AnalyticsDetectionRule.

// Multi-color Google "G" mark used for Google Analytics, Google Tag Manager.
function GoogleIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={className}>
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  )
}

// Hotjar brand mark — white "h" on the Hotjar red-orange rounded square.
function HotjarIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <rect width="24" height="24" rx="6" fill="#FF3C00" />
      <path
        fill="#fff"
        d="M8.7 5.5v4.4c.7-.8 1.7-1.3 2.9-1.3 2.1 0 3.4 1.4 3.4 3.7v6.2h-2.5v-5.6c0-1.2-.6-1.9-1.6-1.9-1.1 0-1.9.8-2.2 2v5.5H6.2V5.5h2.5z"
      />
    </svg>
  )
}

// Canonical display label + optional brand icon per detected tool.
interface AnalyticsToolMeta {
  label: string
  icon?: React.ReactNode
}

const ANALYTICS_TOOL_META: Record<string, AnalyticsToolMeta> = {
  "google analytics":   { label: "Google Analytics",   icon: <GoogleIcon /> },
  "google tag manager": { label: "Google Tag Manager", icon: <GoogleIcon /> },
  "facebook pixel":     { label: "Facebook Pixel" },
  hotjar:               { label: "Hotjar", icon: <HotjarIcon /> },
}

function resolveAnalyticsMeta(name: string): AnalyticsToolMeta {
  return ANALYTICS_TOOL_META[name.trim().toLowerCase()] ?? { label: name }
}

export function AnalyticsDetectionView({
  passed,
  shortAnswer,
  tools,
}: {
  passed: boolean | null
  shortAnswer: string
  tools: string[]
}) {
  const t = useTranslations("pageAudit")
  return (
    <div className="py-5">
      <div className="mb-2 flex items-center gap-2">
        {passed === true ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
        ) : passed === false ? (
          <XCircle className="h-4 w-4 shrink-0 text-red-500" />
        ) : (
          <Info className="h-4 w-4 shrink-0 text-blue-400" />
        )}
        <h4 className="text-[15px] font-semibold leading-snug text-foreground">
          Analytics
        </h4>
      </div>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">{shortAnswer}</p>

      {tools.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noAnalytics")}</p>
      ) : (
        <ul className="max-w-md flex flex-col gap-2">
          {tools.map((name, i) => {
            const meta = resolveAnalyticsMeta(name)
            return (
              <li
                key={`${name}-${i}`}
                className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-card px-3 py-2.5 text-sm font-medium text-foreground"
              >
                {meta.icon ? (
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
                    {meta.icon}
                  </span>
                ) : null}
                <span>{meta.label}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─── Deprecated HTML Tags View ────────────────────────────────────────────────

export function DeprecatedTagsView({
  passed,
  shortAnswer,
  tags,
}: {
  passed: boolean | null
  shortAnswer: string
  tags: Array<{ name: string; count: number }>
}) {
  return (
    <div className="py-5">
      <div className="mb-2 flex items-center gap-2">
        {passed === true ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
        ) : passed === false ? (
          <XCircle className="h-4 w-4 shrink-0 text-red-500" />
        ) : (
          <Info className="h-4 w-4 shrink-0 text-blue-400" />
        )}
        <h4 className="text-[15px] font-semibold leading-snug text-foreground">
          Deprecated HTML Tags
        </h4>
      </div>
      <p className="mb-3 max-w-3xl text-sm text-muted-foreground">{shortAnswer}</p>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <span
              key={t.name}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1 font-mono text-xs text-red-600 dark:text-red-400"
            >
              &lt;{t.name}&gt;
              <span className="rounded-sm bg-red-500/20 px-1 text-[10px] font-semibold tabular-nums">
                ×{t.count}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Inline Styles View ───────────────────────────────────────────────────────

export function InlineStylesView({
  passed,
  shortAnswer,
  count,
  samples,
}: {
  passed: boolean | null
  shortAnswer: string
  count: number
  samples: string[]
}) {
  const [showDetails, setShowDetails] = useState(false)
  return (
    <div className="py-5">
      <div className="mb-2 flex items-center gap-2">
        {passed === true ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
        ) : passed === false ? (
          <XCircle className="h-4 w-4 shrink-0 text-red-500" />
        ) : (
          <Info className="h-4 w-4 shrink-0 text-blue-400" />
        )}
        <h4 className="text-[15px] font-semibold leading-snug text-foreground">
          Inline Styles
        </h4>
      </div>
      <p className="mb-3 max-w-3xl text-sm text-muted-foreground">{shortAnswer}</p>

      {count > 0 && samples.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40"
          >
            {showDetails ? "Hide samples" : `Show ${Math.min(samples.length, count)} samples`}
            {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showDetails && (
            <ul className="mt-3 max-w-3xl space-y-1.5 rounded-lg border border-border/60 bg-muted/30 p-3 font-mono text-xs text-foreground/85">
              {samples.map((s, i) => (
                <li key={i} className="break-all">
                  style=<span className="text-muted-foreground">&quot;</span>
                  {s}
                  <span className="text-muted-foreground">&quot;</span>
                </li>
              ))}
              {samples.length < count && (
                <li className="pt-1 text-[11px] text-muted-foreground">
                  Showing {samples.length} of {count}.
                </li>
              )}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

// ─── Email Privacy View ───────────────────────────────────────────────────────

export function EmailPrivacyView({
  passed,
  shortAnswer,
  emails,
  exposedCount,
}: {
  passed: boolean | null
  shortAnswer: string
  emails: string[]
  exposedCount: number
}) {
  return (
    <div className="py-5">
      <div className="mb-2 flex items-center gap-2">
        {passed === true ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
        ) : passed === false ? (
          <XCircle className="h-4 w-4 shrink-0 text-red-500" />
        ) : (
          <Info className="h-4 w-4 shrink-0 text-blue-400" />
        )}
        <h4 className="text-[15px] font-semibold leading-snug text-foreground">
          Email Privacy
        </h4>
      </div>
      <p className="mb-3 max-w-3xl text-sm text-muted-foreground">{shortAnswer}</p>

      {emails.length > 0 && (
        <ul className="max-w-3xl space-y-1 rounded-lg border border-red-500/30 bg-red-500/5 p-3 font-mono text-sm text-foreground/90">
          {emails.map((email, i) => (
            <li key={`${email}-${i}`} className="flex items-center gap-2 break-all">
              <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
              {email}
            </li>
          ))}
          {emails.length < exposedCount && (
            <li className="pt-1 font-sans text-[11px] text-muted-foreground">
              Showing {emails.length} of {exposedCount} exposed addresses.
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

// ─── Web Server View ──────────────────────────────────────────────────────────
//
// Shows the detected server (e.g. "Vercel") with a brand mark when known.
// Falls back to a neutral pill for unrecognized values. No "Length :" line.

function VercelIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 20" aria-hidden className={className}>
      <path d="M12 0L24 20H0L12 0Z" fill="currentColor" />
    </svg>
  )
}

function CloudIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path
        fill="currentColor"
        d="M17 20H7a5 5 0 0 1-.6-9.96A6 6 0 0 1 18.2 11.5 4 4 0 0 1 17 20Z"
      />
    </svg>
  )
}

interface ServerBrandMeta {
  label: string
  icon: React.ReactNode
  /** Tailwind class for the icon foreground. */
  color: string
}

const SERVER_BRAND_META: Array<{ match: RegExp; meta: ServerBrandMeta }> = [
  { match: /vercel/i,                   meta: { label: "Vercel",     icon: <VercelIcon />, color: "text-foreground" } },
  { match: /cloudflare/i,               meta: { label: "Cloudflare", icon: <CloudIcon />,  color: "text-[#f38020]" } },
  { match: /nginx/i,                    meta: { label: "Nginx",      icon: <CloudIcon />,  color: "text-[#009639]" } },
  { match: /apache/i,                   meta: { label: "Apache",     icon: <CloudIcon />,  color: "text-[#d22128]" } },
  { match: /netlify/i,                  meta: { label: "Netlify",    icon: <CloudIcon />,  color: "text-[#00c7b7]" } },
  { match: /fastly/i,                   meta: { label: "Fastly",     icon: <CloudIcon />,  color: "text-[#ff282d]" } },
  { match: /(aws|amazon|cloudfront)/i,  meta: { label: "AWS",        icon: <CloudIcon />,  color: "text-[#ff9900]" } },
  // hCDN is the Server header Hostinger's CDN sends — surface it as Hostinger.
  { match: /\bhcdn\b/i,                 meta: { label: "Hostinger",  icon: <CloudIcon />,  color: "text-[#673de6]" } },
]

function resolveServerBrand(server: string): ServerBrandMeta | null {
  for (const { match, meta } of SERVER_BRAND_META) {
    if (match.test(server)) return meta
  }
  return null
}

export function WebServerView({
  passed,
  server,
}: {
  passed: boolean | null
  server: string | null
}) {
  const brand = server ? resolveServerBrand(server) : null
  const displayName = brand?.label ?? server

  return (
    <div className="py-5">
      <div className="mb-3 flex items-center gap-2">
        {passed === true ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
        ) : passed === false ? (
          <XCircle className="h-4 w-4 shrink-0 text-red-500" />
        ) : (
          <Info className="h-4 w-4 shrink-0 text-blue-400" />
        )}
        <h4 className="text-[15px] font-semibold leading-snug text-foreground">
          Web Server
        </h4>
      </div>

      {displayName && (
        <div className="inline-flex items-center gap-2.5 rounded-lg border border-border/60 bg-card px-3 py-2 text-sm font-medium text-foreground">
          {brand ? (
            <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center ${brand.color}`}>
              {brand.icon}
            </span>
          ) : null}
          <span>{displayName}</span>
        </div>
      )}
    </div>
  )
}

// ─── DNS Nameservers View ─────────────────────────────────────────────────────
//
// Lists each detected nameserver on its own line under the standard check
// header. Driven by data.nameservers from DNSCheckRule.

export function DnsNameserversView({
  passed,
  shortAnswer,
  nameservers,
  domain,
}: {
  passed: boolean | null
  shortAnswer: string
  nameservers: string[]
  domain?: string
}) {
  return (
    <div className="py-5">
      <div className="mb-2 flex items-center gap-2">
        {passed === true ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
        ) : passed === false ? (
          <XCircle className="h-4 w-4 shrink-0 text-red-500" />
        ) : (
          <Info className="h-4 w-4 shrink-0 text-blue-400" />
        )}
        <h4 className="text-[15px] font-semibold leading-snug text-foreground">
          DNS Nameservers
        </h4>
      </div>
      <p className="mb-3 max-w-3xl text-sm text-muted-foreground">{shortAnswer}</p>

      {nameservers.length > 0 && (
        <div className="max-w-3xl rounded-lg border border-border/60 bg-card px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            DNS Servers
          </p>
          <ul className="space-y-0.5 font-mono text-sm text-foreground/90">
            {nameservers.map((ns, i) => (
              <li key={`${ns}-${i}`} className="break-all">
                {ns}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Category Mini Ring ───────────────────────────────────────────────────────

export function CategoryMiniRing({ label, grade, score, size = 68, delay = 0, pending = false }: { label: string; grade: string; score: number; size?: number; delay?: number; pending?: boolean }) {
  const [filled, setFilled] = useState(false)
  useEffect(() => { const t = setTimeout(() => setFilled(true), 50 + delay); return () => clearTimeout(t) }, [delay])

  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - ((filled ? ringFillPercent(score) : 0) / 100) * circumference
  const arc = circumference * 0.25

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        {pending ? (
          <svg width={size} height={size} className="animate-spin" style={{ animationDuration: "1.4s" }}>
            <circle cx={size / 2} cy={size / 2} r={radius} className="stroke-border/40" strokeWidth={5} fill="none" />
            <circle
              cx={size / 2} cy={size / 2} r={radius}
              strokeWidth={5} fill="none" strokeLinecap="round"
              strokeDasharray={`${arc} ${circumference - arc}`}
              className="stroke-accent"
            />
          </svg>
        ) : (
          <svg width={size} height={size} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={radius} className="stroke-border/40" strokeWidth={5} fill="none" />
            <circle
              cx={size / 2} cy={size / 2} r={radius}
              strokeWidth={5} fill="none" strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={offset}
              className={`transition-all duration-700 ease-out ${scoreBg(score)}`}
            />
          </svg>
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          {pending ? (
            <span className="font-mono text-xs text-muted-foreground">…</span>
          ) : (
            <span className={`text-sm font-bold font-mono ${gradeColor(grade)}`}>{grade}</span>
          )}
        </div>
      </div>
      <span className={`max-w-[72px] text-center text-[10px] leading-tight ${pending ? "text-muted-foreground" : gradeColor(grade)}`}>{label}</span>
    </div>
  )
}

// ─── Radar Chart ─────────────────────────────────────────────────────────────

export function RadarChart({ categories }: { categories: Array<{ label: string; score: number }> }) {
  const size = 164
  const cx = size / 2
  const cy = size / 2
  const maxR = size / 2 - 22
  const n = categories.length

  const pt = (i: number, r: number) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
  }

  const polyPoints = (r: number) =>
    categories.map((_, i) => { const p = pt(i, r); return `${p.x},${p.y}` }).join(" ")

  const dataPoints = categories.map((cat, i) => pt(i, maxR * Math.max(cat.score / 100, 0.05)))

  return (
    <svg width={size} height={size} className="shrink-0 overflow-visible">
      {[0.25, 0.5, 0.75, 1].map((level) => (
        <polygon key={level} points={polyPoints(maxR * level)} fill="none" className="stroke-border/30" strokeWidth={1} />
      ))}
      {categories.map((_, i) => {
        const p = pt(i, maxR)
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} className="stroke-border/30" strokeWidth={1} />
      })}
      <polygon points={dataPoints.map((p) => `${p.x},${p.y}`).join(" ")} className="fill-accent/20 stroke-accent/50" strokeWidth={2} />
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} className="fill-accent" />
      ))}
      {categories.map((cat, i) => {
        const p = pt(i, maxR + 16)
        const shortLabel = cat.label.split(" ")[0]
        return (
          <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fontSize={8} className="fill-muted-foreground">
            {shortLabel}
          </text>
        )
      })}
    </svg>
  )
}

// ─── Grade Badge ──────────────────────────────────────────────────────────────

export function GradeBadge({ grade, className = "" }: { grade: string; className?: string }) {
  return (
    <span className={`inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-bold font-mono ${gradeBgColor(grade)} ${gradeColor(grade)} ${className}`}>
      {grade}
    </span>
  )
}

// ─── Issue Card ───────────────────────────────────────────────────────────────

export function IssueCard({ issue }: { issue: Issue }) {
  const [open, setOpen] = useState(false)
  const meta = SEVERITY_META[issue.severity] ?? SEVERITY_META.INFO

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        className="flex w-full items-start gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-medium text-sm">{issue.title}</span>
            <Badge variant="outline" className={`text-xs ${meta.color}`}>{meta.label}</Badge>
            {issue.category && (
              <Badge variant="outline" className="text-xs text-muted-foreground capitalize">
                {(CATEGORY_META[issue.category]?.label) ?? issue.category.toLowerCase()}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">{issue.description}</p>
        </div>
        <span className="shrink-0 text-muted-foreground">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>
      {open && (
        <div className="border-t border-border px-4 py-3 bg-muted/20 text-sm space-y-2">
          <p className="text-foreground">{issue.description}</p>
          {issue.pageUrl && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <ExternalLink className="h-3 w-3" />
              <a href={issue.pageUrl} target="_blank" rel="noopener noreferrer" className="hover:underline truncate">
                {issue.pageUrl}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Status Icon ──────────────────────────────────────────────────────────────

export function StatusIcon({ passed, informational = false }: { passed: boolean | null; informational?: boolean }) {
  if (passed === true) return <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
  if (passed === false) return <XCircle className="h-4 w-4 shrink-0 text-red-500" />
  if (informational) return <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
  return <AlertCircle className="h-4 w-4 shrink-0 text-yellow-500" />
}

// ─── Category Grade Card ──────────────────────────────────────────────────────

export function CategoryGradeCard({
  label, score, grade, Icon,
}: {
  label: string; score: number; grade?: string; Icon: React.ComponentType<{ className?: string }>
}) {
  const resolved = grade ?? sectionScoreToGrade(score)
  const style = gradeCardStyle(resolved)
  return (
    <div className={`flex flex-col items-center gap-1 rounded-xl px-3 py-4 ${style.bg} ${style.text}`}>
      <Icon className="h-5 w-5 opacity-90" />
      <span className="text-2xl font-bold font-mono leading-none">{resolved}</span>
      <span className="text-xs font-medium opacity-80 text-center leading-tight">{label}</span>
      <span className="text-xs opacity-60 font-mono">{Math.round(score)}</span>
    </div>
  )
}

// ─── Section Check Row ────────────────────────────────────────────────────────

export function SectionCheckRow({ check }: { check: SEOAuditCheck }) {
  const t = useTranslations("pageAudit")
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-border/40 last:border-0">
      <button
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <StatusIcon passed={check.passed} informational={check.informational} />
        <span className="flex-1 text-sm">{check.name}</span>
        <span className="hidden sm:block max-w-[220px] truncate text-right text-xs text-muted-foreground">
          {check.shortAnswer}
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
      </button>
      {open && (
        <div className="border-t border-border/40 px-4 py-3 bg-muted/20 space-y-3 text-sm">
          <p className="text-foreground">{check.answer}</p>
          {check.recommendation && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-0.5">{t("fix")}</p>
              <p className="text-sm">{check.recommendation}</p>
            </div>
          )}
          {check.pageUrl && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <ExternalLink className="h-3 w-3" />
              <a href={check.pageUrl} target="_blank" rel="noopener noreferrer" className="hover:underline truncate">
                {check.pageUrl}
              </a>
            </div>
          )}
          {(check.what || check.why || check.how) && (
            <div className="space-y-2 pt-1 border-t border-border/60">
              {check.what && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">{t("what")}</p>
                  <p className="text-muted-foreground">{check.what}</p>
                </div>
              )}
              {check.why && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">{t("whyItMatters")}</p>
                  <p className="text-muted-foreground">{check.why}</p>
                </div>
              )}
              {check.how && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">{t("howToFix")}</p>
                  <p className="text-muted-foreground">{check.how}</p>
                </div>
              )}
              {check.time && <p className="text-xs text-muted-foreground/70">Estimated time: {check.time}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Section Accordion Card ───────────────────────────────────────────────────

export function SectionAccordionCard({
  section, checks, sectionScore,
}: {
  section: AuditSection; checks: SEOAuditCheck[]; sectionScore?: SectionScore
}) {
  const meta = SECTION_META[section]
  const SectionIcon = meta.icon
  const hasFailures = checks.some((c) => c.passed === false)
  const [open, setOpen] = useState(hasFailures)

  const sorted = [...checks].sort((a, b) => {
    const order = (c: SEOAuditCheck) => c.passed === false ? 0 : c.passed === true ? 1 : 2
    return order(a) - order(b)
  })

  const score = sectionScore?.score ?? null
  const grade = score !== null ? sectionScoreToGrade(score) : null
  const failCount = checks.filter((c) => c.passed === false).length
  const passCount = checks.filter((c) => c.passed === true).length

  const borderAccent = score === null ? "border-l-border" : score >= 70 ? "border-l-green-500" : score >= 50 ? "border-l-yellow-500" : "border-l-red-500"

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={`rounded-xl border border-border bg-card border-l-4 ${borderAccent} overflow-hidden`}>
        <CollapsibleTrigger className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/20 transition-colors">
          <SectionIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 font-medium text-sm">{meta.label}</span>
          <div className="flex items-center gap-2 shrink-0">
            {failCount > 0 && <span className="text-xs text-red-500 font-medium">{failCount} failed</span>}
            {passCount > 0 && <span className="text-xs text-green-600 dark:text-green-400 font-medium">{passCount} passed</span>}
            {score !== null && <span className={`text-xs font-mono font-semibold tabular-nums ${scoreColor(score)}`}>{Math.round(score)}</span>}
            {grade && <GradeBadge grade={grade} />}
            {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border/40">
            {sorted.map((check) => <SectionCheckRow key={check.id} check={check} />)}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

// ─── AI Insights Panel ────────────────────────────────────────────────────────

export function AIInsightsPanel({ insights }: { insights?: ScoreSummary["insights"] }) {
  const t = useTranslations("pageAudit")
  if (!insights) return null
  const hasContent = insights.overall || (insights.recommendations && insights.recommendations.length > 0)
  if (!hasContent) return null

  return (
    <div className="space-y-4">
      {insights.overall && (
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/20">
              <Info className="h-4 w-4 text-accent" />
            </div>
            <div className="flex-1">
              <h3 className="mb-1 text-sm font-semibold">{t("overallAssessment")}</h3>
              <p className="text-sm text-muted-foreground">{insights.overall}</p>
            </div>
          </div>
        </div>
      )}
      {insights.recommendations && insights.recommendations.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <BarChart2 className="h-4 w-4 text-accent" />
            {t("topRecommendations")}
          </h3>
          <ol className="space-y-2">
            {insights.recommendations.map((rec, idx) => (
              <li key={idx} className="flex items-start gap-3 text-sm">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent">
                  {idx + 1}
                </span>
                <span className="text-muted-foreground">{rec}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

// ─── Audit Check Row ─────────────────────────────────────────────────────────

export function AuditCheckRow({ check, anchorId }: { check: SEOAuditCheck; anchorId?: string }) {
  const [expanded, setExpanded] = useState(false)
  const valueStr = check.value != null ? String(check.value).trim() : ""
  // Length metadata only makes sense for short-ish text (titles, descriptions,
  // H1s, slugs). Hide for booleans, long blobs, and tiny single-word values.
  const showLength = valueStr.length >= 5 && valueStr.length <= 500 && /\s|[a-z]{4,}/i.test(valueStr)

  const fix = check.how || check.recommendation || ""
  const hasFix = check.passed === false && !!fix

  return (
    <div id={anchorId} className="scroll-mt-28 border-b border-border/40 py-5 last:border-0">
      {/* Heading row: subtle status icon + bold title */}
      <div className="mb-2 flex items-center gap-2">
        {check.passed === true ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
        ) : check.passed === false ? (
          <XCircle className="h-4 w-4 shrink-0 text-red-500" />
        ) : (
          <Info className="h-4 w-4 shrink-0 text-blue-400" />
        )}
        <h4 className="text-[15px] font-semibold leading-snug text-foreground">{check.name}</h4>
      </div>

      {/* Status sentence */}
      {check.shortAnswer && (
        <p className="mb-3 text-sm text-muted-foreground">{check.shortAnswer}</p>
      )}

      {/* Value box — neutral, calm, content-first */}
      {valueStr && (
        <div className="mb-3 rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
          <p className="break-words text-sm text-foreground/90">{valueStr}</p>
          {showLength && (
            <p className="mt-1 font-mono text-xs text-muted-foreground">Length : {valueStr.length}</p>
          )}
        </div>
      )}

      {/* Why this matters — always shown, like the reference */}
      {check.why && (
        <p className="text-sm leading-relaxed text-muted-foreground">{check.why}</p>
      )}

      {/* How to fix — only when the check failed */}
      {hasFix && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          {expanded ? "Hide fix" : "How to fix"}
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      )}
      {expanded && hasFix && (
        <p className="mt-2 rounded-lg border border-accent/20 bg-accent/5 px-4 py-3 text-sm leading-relaxed text-foreground/85">
          {fix}
        </p>
      )}
    </div>
  )
}

// ─── Category Result Section ──────────────────────────────────────────────────

// Evergreen one-paragraph explainer per category, shown in the section header
// when no AI-generated insight is available. Keyed by the category label.
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  "On-Page SEO":
    "The content signals on each page — title tag, meta description, headings, keyword usage and images — that tell search engines and visitors what the page is about. These are the easiest wins to control and edit directly.",
  Technical:
    "The behind-the-scenes signals that let search engines crawl and index your site cleanly — indexability (noindex / robots), HTTPS, redirects, canonical tags, sitemaps and more. Get these right and everything else has a solid foundation to build on.",
  Performance:
    "How quickly your pages load and respond for real users. Speed and Core Web Vitals affect rankings, bounce rate and conversions — slow pages quietly cost you traffic and sales.",
  Security:
    "Whether your site protects visitors and their data — HTTPS encryption, secure response headers, and no exposed sensitive information. Security issues erode trust and can hurt rankings.",
  Links:
    "How your pages link to each other and out to the wider web. Good linking spreads ranking authority to your most important pages and helps users and search engines navigate your site.",
  Accessibility:
    "How usable your site is for everyone, including people using assistive technology — image alt text, form labels, colour contrast and semantic structure. Accessible sites reach more people and tend to be better-built overall.",
  "Structured Data":
    "Schema.org markup that helps search engines understand your content and can unlock rich results — star ratings, FAQs, breadcrumbs and more — making your listings stand out in search.",
}

export function CategoryResultSection({
  title, categoryLabel, grade, score, insight, checks, pageSpeedPending, renderAfterCheck, footer,
}: {
  title: string; categoryLabel: string; grade: string; score: number; insight?: string; checks: SEOAuditCheck[]; pageSpeedPending?: boolean;
  /** Inject extra content immediately after the row whose check.id matches the key. */
  renderAfterCheck?: Record<string, React.ReactNode>
  /** Extra content rendered at the bottom of the section card (e.g. backlinks under Links). */
  footer?: React.ReactNode
}) {
  const t = useTranslations("pageAudit")
  if (!checks.length && !pageSpeedPending && !footer) return null

  return (
    <div className="overflow-hidden rounded-2xl border border-border/40 bg-card">
      <div className="border-b border-border/40 px-6 pb-6 pt-6">
        <h2 className="mb-5 text-lg font-bold">{title}</h2>
        <div className="flex items-center gap-8">
          <GaugeDial grade={grade} score={score} size={128} pending={pageSpeedPending} />
          <div className="min-w-0 flex-1">
            <p className="mb-2 text-base font-semibold">
              {pageSpeedPending ? "Measuring page speed…" : categoryTagline(categoryLabel, grade)}
            </p>
            {insight && !pageSpeedPending && <p className="text-sm leading-relaxed text-muted-foreground">{insight}</p>}
            {!insight && !pageSpeedPending && CATEGORY_DESCRIPTIONS[categoryLabel] && (
              <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                {CATEGORY_DESCRIPTIONS[categoryLabel]}
              </p>
            )}
            {pageSpeedPending && (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t("pageSpeedRunning")}
              </p>
            )}
          </div>
        </div>
        {pageSpeedPending && (
          <div className="mt-5 flex items-center gap-2.5 rounded-lg border border-accent/25 bg-accent/5 px-3.5 py-2.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" />
            <div className="min-w-0">
              <span className="font-medium text-foreground">{t("loadingPageSpeed")}</span>
              <span className="ml-1.5 text-muted-foreground">
                {t("pageSpeedFetching")}
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="px-6">
        {checks.map((check) => {
          // The SERP_SNIPPET rule emits a check whose payload (data.preview)
          // is meant to be rendered as a real Google-style snippet card, not a
          // generic AuditCheckRow. Render it specially.
          if (check.id === "SERP_SNIPPET") {
            const preview = (check.data?.preview ?? null) as
              | { url?: string; title?: string; description?: string }
              | null
            const url = preview?.url ?? check.pageUrl ?? ""
            const title = preview?.title ?? null
            const description = preview?.description ?? null
            return (
              <div
                key={check.id}
                id={`check-${check.id}`}
                className="scroll-mt-28 border-b border-border/40 last:border-0"
              >
                <SerpPreview url={url} title={title} description={description} />
              </div>
            )
          }
          // Social profile rules — show the detected link as a clickable URL.
          if (
            check.id === "INSTAGRAM_LINK" ||
            check.id === "LINKEDIN_LINK" ||
            check.id === "FACEBOOK_LINK" ||
            check.id === "TWITTER_LINK" ||
            check.id === "YOUTUBE_LINK"
          ) {
            const url = (check.data?.url as string | null | undefined) ?? null
            if (url) {
              return (
                <div
                  key={check.id}
                  id={`check-${check.id}`}
                  className="scroll-mt-28 border-b border-border/40 py-5 last:border-0"
                >
                  <div className="mb-2 flex items-center gap-2">
                    {check.passed === true ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                    ) : check.passed === false ? (
                      <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                    ) : (
                      <Info className="h-4 w-4 shrink-0 text-blue-400" />
                    )}
                    <h4 className="text-[15px] font-semibold leading-snug text-foreground">
                      {check.name}
                    </h4>
                  </div>
                  <p className="mb-2 max-w-3xl text-sm text-muted-foreground">
                    {check.shortAnswer}
                  </p>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent hover:bg-accent/15 hover:underline"
                    title={url}
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    <span className="truncate">{url}</span>
                  </a>
                  {check.why && (
                    <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                      {check.why}
                    </p>
                  )}
                </div>
              )
            }
          }
          // Deprecated HTML Tags — show the actual tag names as red pills.
          if (check.id === "DEPRECATED_TAGS") {
            const tags = (check.data?.tags ?? []) as Array<{ name: string; count: number }>
            return (
              <div
                key={check.id}
                id={`check-${check.id}`}
                className="scroll-mt-28 border-b border-border/40 last:border-0"
              >
                <DeprecatedTagsView
                  passed={check.passed}
                  shortAnswer={check.shortAnswer}
                  tags={tags}
                />
              </div>
            )
          }
          // Inline Styles — show actual style="…" samples (collapsible).
          if (check.id === "INLINE_STYLES") {
            const count = (check.data?.inlineStylesCount as number) ?? 0
            const samples = (check.data?.samples ?? []) as string[]
            return (
              <div
                key={check.id}
                id={`check-${check.id}`}
                className="scroll-mt-28 border-b border-border/40 last:border-0"
              >
                <InlineStylesView
                  passed={check.passed}
                  shortAnswer={check.shortAnswer}
                  count={count}
                  samples={samples}
                />
              </div>
            )
          }
          // Email Privacy — list the exposed email addresses inline.
          if (check.id === "EMAIL_PRIVACY") {
            const emails = (check.data?.emails ?? []) as string[]
            const exposedCount = (check.data?.exposedCount as number) ?? emails.length
            return (
              <div
                key={check.id}
                id={`check-${check.id}`}
                className="scroll-mt-28 border-b border-border/40 last:border-0"
              >
                <EmailPrivacyView
                  passed={check.passed}
                  shortAnswer={check.shortAnswer}
                  emails={emails}
                  exposedCount={exposedCount}
                />
              </div>
            )
          }
          // Web Server — show the server name with a brand icon (Vercel, Cloudflare, …).
          if (check.id === "SERVER_SOFTWARE") {
            const server = (check.data?.server as string | null | undefined) ?? null
            return (
              <div
                key={check.id}
                id={`check-${check.id}`}
                className="scroll-mt-28 border-b border-border/40 last:border-0"
              >
                <WebServerView
                  passed={check.passed}
                  server={server}
                />
              </div>
            )
          }
          // DNS Nameservers — show each nameserver as a list, not just the count.
          if (check.id === "DNS_CHECK") {
            const nameservers = (check.data?.nameservers ?? []) as string[]
            return (
              <div
                key={check.id}
                id={`check-${check.id}`}
                className="scroll-mt-28 border-b border-border/40 last:border-0"
              >
                <DnsNameserversView
                  passed={check.passed}
                  shortAnswer={check.shortAnswer}
                  nameservers={nameservers}
                  domain={check.data?.domain as string | undefined}
                />
              </div>
            )
          }
          // Analytics — show each detected tool as its own card with an icon chip.
          if (check.id === "ANALYTICS_DETECTION") {
            const tools = (check.data?.tools ?? []) as string[]
            return (
              <div
                key={check.id}
                id={`check-${check.id}`}
                className="scroll-mt-28 border-b border-border/40 last:border-0"
              >
                <AnalyticsDetectionView
                  passed={check.passed}
                  shortAnswer={check.shortAnswer}
                  tools={tools}
                />
              </div>
            )
          }
          // Robots.txt — show the actual file content (capped) in a code-style block.
          if (check.id === "ROBOTS_TXT") {
            return (
              <div
                key={check.id}
                id={`check-${check.id}`}
                className="scroll-mt-28 border-b border-border/40 last:border-0"
              >
                <RobotsTxtView
                  passed={check.passed}
                  shortAnswer={check.shortAnswer}
                  content={(check.data?.content as string | null) ?? null}
                  truncated={!!check.data?.truncated}
                  robotsUrl={check.data?.robotsUrl as string | undefined}
                  disallowCount={check.data?.disallowCount as number | undefined}
                />
              </div>
            )
          }
          // XML Sitemap — show the discovered URLs in a searchable scrollable list.
          if (check.id === "XML_SITEMAP") {
            const urls = (check.data?.urls ?? []) as string[]
            return (
              <div
                key={check.id}
                id={`check-${check.id}`}
                className="scroll-mt-28 border-b border-border/40 last:border-0"
              >
                <SitemapView
                  passed={check.passed}
                  shortAnswer={check.shortAnswer}
                  urls={urls}
                  urlCount={(check.data?.urlCount as number) ?? urls.length}
                  truncated={!!check.data?.truncated}
                  sitemapUrl={check.data?.sitemapUrl as string | undefined}
                />
              </div>
            )
          }
          // The IMAGE_ALT_TEXT rule ships a sample of images; render the
          // thumbnail + alt list instead of just a count summary.
          if (check.id === "IMAGE_ALT_TEXT") {
            const samples = (check.data?.samples ?? []) as ImageSample[]
            const total = (check.data?.total as number) ?? samples.length
            const withAlt =
              (check.data?.withAlt as number) ??
              samples.filter((s) => s.hasAlt).length
            const missing =
              (check.data?.missing as number) ??
              samples.filter((s) => !s.hasAlt).length
            if (samples.length > 0) {
              return (
                <div
                  key={check.id}
                  className="border-b border-border/40 last:border-0"
                >
                  <ImageAltTextBreakdown
                    total={total}
                    withAlt={withAlt}
                    missing={missing}
                    samples={samples}
                    passed={check.passed}
                    shortAnswer={check.shortAnswer}
                    pageUrl={check.pageUrl}
                  />
                </div>
              )
            }
          }
          // The KEYWORD_CONSISTENCY rule emits per-term grids for Individual
          // Keywords + Phrases — render as two tables instead of the generic row.
          if (check.id === "KEYWORD_CONSISTENCY") {
            const keywords = (check.data?.keywords ?? []) as KeywordRow[]
            const phrases = (check.data?.phrases ?? []) as KeywordRow[]
            if (keywords.length > 0 || phrases.length > 0) {
              return (
                <div
                  key={check.id}
                  className="border-b border-border/40 last:border-0"
                >
                  <KeywordConsistencyBreakdown
                    keywords={keywords}
                    phrases={phrases}
                    passed={check.passed}
                    shortAnswer={check.shortAnswer}
                  />
                </div>
              )
            }
          }
          // The H2_H6_HEADERS rule emits per-level counts; render the table +
          // bar visualization instead of the generic row.
          if (check.id === "H2_H6_HEADERS") {
            const counts = (check.data?.counts ?? null) as HeadingCounts | null
            const samples = (check.data?.samples ?? undefined) as
              | Partial<Record<keyof HeadingCounts, string[]>>
              | undefined
            if (counts) {
              return (
                <div
                  key={check.id}
                  className="border-b border-border/40 last:border-0"
                >
                  <HeadingsBreakdown
                    counts={counts}
                    samples={samples}
                    passed={check.passed}
                    shortAnswer={check.shortAnswer}
                  />
                </div>
              )
            }
          }
          const after = renderAfterCheck?.[check.id]
          if (!after)
            return <AuditCheckRow key={check.id} anchorId={`check-${check.id}`} check={check} />
          return (
            <div key={check.id} id={`check-${check.id}`} className="scroll-mt-28">
              <AuditCheckRow check={check} />
              {after}
            </div>
          )
        })}
      </div>
      {footer && <div className="border-t border-border/40 px-6 py-6">{footer}</div>}
    </div>
  )
}

// ─── Paywall (anonymous gate over deeper sections) ───────────────────────────

function PaywallSection({ children }: { children: React.ReactNode }) {
  const t = useTranslations("pageAudit")
  return (
    <div className="relative my-8 overflow-hidden rounded-2xl border border-border/60">
      {/* Capped teaser strip — blurred + faded out so the CTA reads cleanly */}
      <div
        aria-hidden="true"
        className="pointer-events-none relative h-[440px] select-none"
      >
        <div className="space-y-6 p-1 [filter:blur(7px)_saturate(0.55)]">
          {children}
        </div>
        {/* Strong bottom fade onto background */}
        <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-b from-transparent via-background/70 to-background" />
      </div>

      {/* Centered CTA card on top */}
      <div className="absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 justify-center px-4">
        <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border/60 bg-card/85 p-7 text-center shadow-[0_30px_80px_-20px_oklch(0_0_0/0.45)] backdrop-blur-xl">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-x-4 -top-12 h-32 bg-[radial-gradient(ellipse_60%_70%_at_50%_50%,oklch(0.56_0.21_263/0.25),transparent_70%)] blur-2xl"
          />
          <div className="relative">
            <div className="mx-auto mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-accent/30 bg-accent/10">
              <Lock className="h-5 w-5 text-accent" />
            </div>
            <h3 className="text-lg font-semibold tracking-tight">
              {t("unlockFullReport")}
            </h3>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
              {t("unlockBlurb")}
            </p>

            <ul className="mt-5 space-y-1.5 text-left">
              {[
                "All 7 category scores & breakdowns",
                "AI-prioritized fix list with how-to guides",
                "Save & track audits over time",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-xs text-muted-foreground"
                >
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button asChild size="sm" className="gap-2">
                <Link href="/auth/signup">
                  {t("signUpFree")}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/auth/signin">{t("signIn")}</Link>
              </Button>
            </div>

            <p className="mt-4 text-[10px] text-muted-foreground/70">
              {t("noCardRequired")}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Directed Link Graph (D3) ─────────────────────────────────────────────────

const NODE_COLORS: Record<string, string> = {
  orphan:    "var(--chart-5)",   // red-orange (dark) / amber (light) — signals problem pages
  hub:       "var(--accent)",    // site accent orange — matches active/highlight states
  authority: "var(--chart-2)",   // teal/green — matches the site's "passing" indicator
  normal:    "var(--chart-3)",   // blue/muted — matches LOW-severity info color
}

type NodeClass = "orphan" | "hub" | "authority" | "normal"

function classifyGraphNode(n: InternalLinkGraphData["nodes"][number]): NodeClass {
  if (n.isOrphan)    return "orphan"
  if (n.isHub)       return "hub"
  if (n.isAuthority) return "authority"
  return "normal"
}

function graphNodeRadius(n: InternalLinkGraphData["nodes"][number]): number {
  return 6 + Math.min(14, Math.sqrt(n.inboundCount || 0) * 3.2)
}

function InternalLinkGraph({
  nodes,
  edges,
  orphanData,
}: {
  nodes: InternalLinkGraphData["nodes"]
  edges: InternalLinkGraphData["edges"]
  orphanData: InternalLinkGraphData["orphanData"]
  metadata: InternalLinkGraphMeta
}) {
  const t = useTranslations("pageAudit")
  const [activeTab, setActiveTabState] = useState<"graph" | "nodes" | "orphans">("graph")
  const [searchQuery, setSearchQuery]  = useState("")
  const [visibleCls, setVisibleCls]    = useState<Set<NodeClass>>(
    () => new Set<NodeClass>(["orphan", "hub", "authority", "normal"])
  )
  const [selectedId, setSelectedId]    = useState<string | null>(null)
  const [zoomPct, setZoomPct]          = useState(100)

  const svgRef    = useRef<SVGSVGElement>(null)
  const wrapRef   = useRef<HTMLDivElement>(null)
  const simRef    = useRef<d3.Simulation<any, any> | null>(null)
  const zoomRef   = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const gRootRef  = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)

  const nodeById = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes])

  // ── Build / rebuild D3 graph ─────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== "graph") return
    const svgEl = svgRef.current
    const wrapEl = wrapRef.current
    if (!svgEl || !wrapEl) return

    const { width, height } = wrapEl.getBoundingClientRect()
    const W = width  || 800
    const H = height || 500

    const svg = d3.select(svgEl)
    svg.selectAll("*").remove()
    svg.attr("viewBox", `0 0 ${W} ${H}`)

    const defs = svg.append("defs")
    defs.append("marker")
      .attr("id", "lg-arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 18).attr("refY", 0)
      .attr("markerWidth", 6).attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
        .attr("d", "M0,-4L8,0L0,4")
        .attr("fill", "currentColor")
        .attr("opacity", 0.5)

    const gRoot  = svg.append("g")
    const gLinks = gRoot.append("g").attr("class", "lg-links").style("color", "rgba(140,156,200,0.22)")
    const gNodes = gRoot.append("g").attr("class", "lg-nodes")
    gRootRef.current = gRoot

    type SimNode = InternalLinkGraphData["nodes"][number] & {
      cls: NodeClass; r: number; x?: number; y?: number; fx?: number | null; fy?: number | null
    }
    const simNodes: SimNode[] = nodes.map(n => ({ ...n, cls: classifyGraphNode(n), r: graphNodeRadius(n) }))
    const idMap = new Map(simNodes.map(n => [n.id, n]))
    const simLinks = edges
      .filter(e => idMap.has(e.source) && idMap.has(e.target))
      .map(e => ({ ...e }))

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 4])
      .on("zoom", event => {
        gRoot.attr("transform", event.transform)
        setZoomPct(Math.round(event.transform.k * 100))
      })
    svg.call(zoom)
    svg.on("click.clear", (event: MouseEvent) => {
      if ((event.target as Element)?.tagName === "svg" || event.target === svgEl) setSelectedId(null)
    })
    zoomRef.current = zoom

    const sim = d3.forceSimulation<SimNode>(simNodes)
      .force("link", d3.forceLink<SimNode, any>(simLinks)
        .id(d => d.id).distance(110).strength(0.3))
      .force("charge", d3.forceManyBody().strength(-480))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("collide", d3.forceCollide<SimNode>().radius(d => d.r + 20).strength(0.98))
      .force("x", d3.forceX(W / 2).strength(0.04))
      .force("y", d3.forceY(H / 2).strength(0.04))
    simRef.current = sim

    const link = gLinks.selectAll<SVGPathElement, any>("path")
      .data(simLinks)
      .join("path")
        .attr("fill", "none")
        .attr("stroke", "var(--border)")
        .attr("stroke-width", 1)
        .attr("marker-end", "url(#lg-arrow)")

    const node = gNodes.selectAll<SVGGElement, SimNode>("g.lg-node")
      .data(simNodes)
      .join(enter => {
        const grp = enter.append("g")
          .attr("class", d => `lg-node lg-cls-${d.cls}`)
          .style("color", d => NODE_COLORS[d.cls])
          .style("cursor", "pointer")
          .call(d3.drag<SVGGElement, SimNode>()
            .on("start", (event, d) => {
              if (!event.active) sim.alphaTarget(0.3).restart()
              d.fx = d.x; d.fy = d.y
            })
            .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y })
            .on("end", (event, d) => {
              if (!event.active) sim.alphaTarget(0)
              d.fx = null; d.fy = null
            })
          )
          .on("click", (event, d) => {
            event.stopPropagation()
            setSelectedId(prev => prev === d.id ? null : d.id)
          })

        // soft glow ring behind the node
        grp.append("circle")
          .attr("r", d => d.r + 8)
          .attr("fill", "currentColor").attr("fill-opacity", 0.08)
          .attr("stroke", "none")
        // solid filled core — readable on any background
        grp.append("circle")
          .attr("r", d => d.r)
          .attr("fill", "currentColor").attr("fill-opacity", 0.88)
          .attr("stroke", "var(--background)").attr("stroke-width", 2.5)
        // short label — truncated, theme-adaptive outline
        grp.append("text")
          .attr("text-anchor", "middle").attr("dy", d => d.r + 13)
          .attr("font-size", 9.5).attr("fill", "var(--muted-foreground)")
          .style("pointer-events", "none").style("paint-order", "stroke")
          .attr("stroke", "var(--background)").attr("stroke-width", 3).attr("stroke-linejoin", "round")
          .text(d => {
            const lbl = (d.label || d.id).replace(/^\//, "")
            return lbl.length > 15 ? lbl.slice(0, 13) + "…" : lbl || "/"
          })
        return grp
      })

    sim.on("tick", () => {
      link.attr("d", (d: any) => {
        const dx = d.target.x - d.source.x
        const dy = d.target.y - d.source.y
        const dr = Math.sqrt(dx * dx + dy * dy) * 2.5
        return `M${d.source.x},${d.source.y} A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`
      })
      node.attr("transform", (d: any) => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    const doFit = () => {
      try {
        const b = gRoot.node()?.getBBox()
        if (!b?.width || !b?.height) return
        const scale = 0.85 / Math.max(b.width / W, b.height / H)
        const tx = W / 2 - scale * (b.x + b.width  / 2)
        const ty = H / 2 - scale * (b.y + b.height / 2)
        svg.transition().duration(500).call(
          zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(Math.min(scale, 2.5))
        )
      } catch {}
    }
    setTimeout(doFit, 700)

    return () => { sim.stop() }
  }, [activeTab, nodes, edges])

  // ── Filter / selection dim ───────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== "graph" || !svgRef.current) return
    const svg = d3.select(svgRef.current)
    const q = searchQuery.trim().toLowerCase()

    svg.selectAll<SVGGElement, any>("g.lg-node").each(function(d) {
      const passClass  = visibleCls.has(d.cls)
      const passSearch = !q ||
        (d.label || "").toLowerCase().includes(q) ||
        (d.url   || "").toLowerCase().includes(q) ||
        (d.title || "").toLowerCase().includes(q)
      d3.select(this).style("opacity", passClass && passSearch ? 1 : 0.1)
    })

    if (selectedId) {
      const neighbours = new Set([selectedId])
      edges.forEach(e => {
        const s = typeof e.source === "object" ? (e.source as any).id : e.source
        const t = typeof e.target === "object" ? (e.target as any).id : e.target
        if (s === selectedId) neighbours.add(t)
        if (t === selectedId) neighbours.add(s)
      })
      svg.selectAll<SVGGElement, any>("g.lg-node").each(function(d) {
        const passClass = visibleCls.has(d.cls)
        d3.select(this).style("opacity", neighbours.has(d.id) && passClass ? 1 : 0.08)
      })
      svg.selectAll<SVGPathElement, any>(".lg-links path").each(function(d) {
        if (!d) return
        const sid = d.source?.id ?? d.source
        const tid = d.target?.id ?? d.target
        const el  = d3.select(this)
        if (tid === selectedId)      el.attr("stroke", NODE_COLORS.authority).attr("stroke-width", 1.5).attr("stroke-opacity", 0.85)
        else if (sid === selectedId) el.attr("stroke", NODE_COLORS.hub).attr("stroke-width", 1.5).attr("stroke-opacity", 0.85)
        else                         el.attr("stroke", "rgba(140,156,200,0.06)").attr("stroke-width", 1).attr("stroke-opacity", 1)
      })
    } else {
      svg.selectAll<SVGPathElement, any>(".lg-links path")
        .attr("stroke", "var(--border)")
        .attr("stroke-width", 1).attr("stroke-opacity", 1)
    }
  }, [activeTab, selectedId, searchQuery, visibleCls, edges])

  // ── Zoom controls ────────────────────────────────────────────────────────────
  const zoomBy = useCallback((factor: number) => {
    if (!svgRef.current || !zoomRef.current) return
    d3.select(svgRef.current).transition().duration(180).call(zoomRef.current.scaleBy, factor)
  }, [])

  const fitGraph = useCallback(() => {
    if (!svgRef.current || !zoomRef.current || !gRootRef.current || !wrapRef.current) return
    const { width: W, height: H } = wrapRef.current.getBoundingClientRect()
    try {
      const b = gRootRef.current.node()?.getBBox()
      if (!b?.width || !b?.height) return
      const scale = 0.85 / Math.max(b.width / W, b.height / H)
      const tx = W / 2 - scale * (b.x + b.width  / 2)
      const ty = H / 2 - scale * (b.y + b.height / 2)
      d3.select(svgRef.current).transition().duration(500).call(
        zoomRef.current.transform, d3.zoomIdentity.translate(tx, ty).scale(Math.min(scale, 2.5))
      )
    } catch {}
  }, [])

  const reshuffle = useCallback(() => {
    if (simRef.current) simRef.current.alpha(1).restart()
    setTimeout(fitGraph, 700)
  }, [fitGraph])

  // ── Derived data ─────────────────────────────────────────────────────────────
  const selectedNode  = selectedId ? (nodeById.get(selectedId) ?? null) : null
  const inboundEdges  = useMemo(
    () => edges.filter(e => (typeof e.target === "object" ? (e.target as any).id : e.target) === selectedId),
    [edges, selectedId]
  )
  const outboundEdges = useMemo(
    () => edges.filter(e => (typeof e.source === "object" ? (e.source as any).id : e.source) === selectedId),
    [edges, selectedId]
  )
  const filteredNodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    let list = activeTab === "orphans" ? nodes.filter(n => n.isOrphan) : nodes
    if (q) list = list.filter(n =>
      (n.label || "").toLowerCase().includes(q) ||
      (n.url   || "").toLowerCase().includes(q) ||
      (n.title || "").toLowerCase().includes(q)
    )
    return [...list].sort((a, b) => b.inboundCount - a.inboundCount)
  }, [nodes, activeTab, searchQuery])

  const LEGEND_ITEMS: { cls: NodeClass; label: string }[] = [
    { cls: "orphan",    label: "Orphan"    },
    { cls: "hub",       label: "Hub"       },
    { cls: "authority", label: t("authority") },
    { cls: "normal",    label: "Normal"    },
  ]

  return (
    <div className="flex flex-col rounded-xl border border-border/40 bg-background overflow-hidden" style={{ height: 580 }}>

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-card/60 flex-shrink-0 flex-wrap">
        {/* Tabs */}
        <div className="flex bg-muted/50 border border-border/40 rounded-lg p-0.5 gap-0.5">
          {(["graph", "nodes", "orphans"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTabState(tab)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                activeTab === tab
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "graph" ? "Graph"
                : tab === "nodes"   ? `Nodes (${nodes.length})`
                : `Orphans (${orphanData.graphOrphans.length})`}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative min-w-[140px] max-w-[240px] flex-1">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
          </svg>
          <input
            type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder={t("searchPages")}
            className="w-full h-7 pl-7 pr-3 rounded-md text-xs bg-muted/50 border border-border/40 text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-accent/60 transition-colors"
          />
        </div>

        {/* Legend */}
        {activeTab === "graph" && (
          <div className="flex gap-0.5 bg-muted/50 border border-border/40 rounded-lg p-0.5">
            {LEGEND_ITEMS.map(({ cls, label }) => (
              <button
                key={cls}
                onClick={() => setVisibleCls(prev => {
                  const next = new Set(prev)
                  if (next.has(cls)) next.delete(cls); else next.add(cls)
                  return next
                })}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors ${
                  visibleCls.has(cls) ? "bg-card text-foreground" : "text-muted-foreground/40"
                }`}
              >
                <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: NODE_COLORS[cls] }} />
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Actions */}
        {activeTab === "graph" && (
          <div className="flex items-center gap-1 ml-auto">
            <button onClick={fitGraph} title={t("fitToView")} className="h-7 px-2.5 flex items-center gap-1.5 rounded-md text-xs border border-border/40 bg-card hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors">
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8V5a2 2 0 0 1 2-2h3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 1-2 2h-3"/>
              </svg>
              Fit
            </button>
            <button onClick={reshuffle} title={t("reRunLayout")} className="h-7 px-2.5 flex items-center gap-1.5 rounded-md text-xs border border-border/40 bg-card hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors">
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>
              </svg>
              {t("reshuffle")}
            </button>
            {selectedId && (
              <button onClick={() => setSelectedId(null)} className="h-7 px-2.5 flex items-center gap-1.5 rounded-md text-xs border border-accent/30 bg-accent/10 hover:bg-accent/20 text-accent transition-colors">
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
                {t("clear")}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Graph / Table */}
        <div className="relative flex-1 min-w-0 bg-muted/30" ref={wrapRef}>

          {activeTab === "graph" && (
            <>
              <svg ref={svgRef} className="w-full h-full block" style={{ cursor: "grab" }} />
              {/* Zoom controls */}
              <div className="absolute bottom-3 left-3 flex items-center gap-0.5 rounded-lg border border-border/40 bg-card/80 backdrop-blur-sm p-1">
                <button onClick={() => zoomBy(1.3)} className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6M11 8v6"/>
                  </svg>
                </button>
                <button onClick={() => zoomBy(1 / 1.3)} className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6"/>
                  </svg>
                </button>
                <div className="w-px h-4 bg-border/60 mx-0.5" />
                <button onClick={fitGraph} className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 1 0 9-9"/><path d="M3 3v6h6"/>
                  </svg>
                </button>
              </div>
              {/* Zoom readout */}
              <div className="absolute bottom-3 right-3 font-mono text-[11px] text-muted-foreground/50 bg-card/80 border border-border/40 backdrop-blur-sm px-2 py-1 rounded-md">
                {zoomPct}%
              </div>
            </>
          )}

          {(activeTab === "nodes" || activeTab === "orphans") && (
            <div className="h-full overflow-auto">
              {filteredNodes.length === 0 ? (
                <div className="flex items-center justify-center h-full text-xs text-muted-foreground/50">
                  {activeTab === "orphans" ? "No orphan pages — every crawled page has at least one inbound link." : t("noPagesMatch")}
                </div>
              ) : (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-border/40">
                      {["Page", "Type", "In", "Out", "Depth"].map((h, i) => (
                        <th key={h} className={`text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider px-4 py-2.5 sticky top-0 bg-card/90 backdrop-blur-sm ${i > 1 ? "text-right" : "text-left"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredNodes.map(n => {
                      const cls = classifyGraphNode(n)
                      return (
                        <tr key={n.id} onClick={() => setSelectedId(n.id)}
                          className={`border-b border-border/30 cursor-pointer transition-colors hover:bg-muted/30 ${selectedId === n.id ? "bg-accent/10" : ""}`}
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: NODE_COLORS[cls] }} />
                              <div className="min-w-0">
                                <div className="font-medium text-foreground/90 truncate">{n.title || n.label || n.id}</div>
                                <div className="font-mono text-[11px] text-muted-foreground truncate">{n.url}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="inline-flex items-center text-[11px] font-medium capitalize px-2 py-0.5 rounded-full"
                              style={{ background: `color-mix(in oklch, ${NODE_COLORS[cls]} 15%, transparent)`, color: NODE_COLORS[cls] }}>
                              {cls}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground text-xs">{n.inboundCount}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground text-xs">{n.outboundCount}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground text-xs">{n.depth}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* ── Detail panel ──────────────────────────────────────────────────── */}
        {selectedNode ? (
          <div className="w-72 flex-shrink-0 border-l border-border/40 bg-card/50 flex flex-col overflow-y-auto">
            <div className="px-4 py-3.5 border-b border-border/40">
              <div className="flex flex-wrap gap-1 mb-2">
                {(["orphan", "hub", "authority"] as const).map(cls =>
                  selectedNode[cls === "orphan" ? "isOrphan" : cls === "hub" ? "isHub" : "isAuthority"] ? (
                    <span key={cls} className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full"
                      style={{ background: `color-mix(in oklch, ${NODE_COLORS[cls]} 15%, transparent)`, color: NODE_COLORS[cls] }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: NODE_COLORS[cls] }} />{cls}
                    </span>
                  ) : null
                )}
                {!selectedNode.isOrphan && !selectedNode.isHub && !selectedNode.isAuthority && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{ background: `color-mix(in oklch, ${NODE_COLORS.normal} 15%, transparent)`, color: NODE_COLORS.normal }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: NODE_COLORS.normal }} />normal
                  </span>
                )}
                <span className="inline-flex items-center text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground">
                  Depth {selectedNode.depth}
                </span>
              </div>
              <h4 className="font-semibold text-sm text-foreground leading-snug mb-1">
                {selectedNode.title || selectedNode.label || selectedNode.id}
              </h4>
              <a href={selectedNode.url} target="_blank" rel="noopener noreferrer"
                className="font-mono text-[11px] text-muted-foreground hover:text-accent break-all leading-snug transition-colors">
                {selectedNode.url}
              </a>
            </div>
            <div className="grid grid-cols-2 divide-x divide-border/40 border-b border-border/40">
              <div className="px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">{t("inbound")}</p>
                <p className="text-lg font-bold mt-0.5">{selectedNode.inboundCount}</p>
                <p className="text-[11px] text-muted-foreground">pages link in</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">{t("outbound")}</p>
                <p className="text-lg font-bold mt-0.5">{selectedNode.outboundCount}</p>
                <p className="text-[11px] text-muted-foreground">links out</p>
              </div>
            </div>
            <div className="px-4 py-3 flex flex-col gap-4">
              {[
                { label: t("linkedFrom"), count: inboundEdges.length, color: NODE_COLORS.authority, items: inboundEdges, idKey: "source" as const },
                { label: t("linksTo"),    count: outboundEdges.length, color: NODE_COLORS.hub,       items: outboundEdges, idKey: "target" as const },
              ].map(({ label, count, color, items, idKey }) => (
                <div key={label}>
                  <h5 className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold mb-1.5 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                    {label} ({count})
                  </h5>
                  {items.length === 0 ? (
                    <p className="text-xs text-muted-foreground/40 italic">None</p>
                  ) : (
                    <ul className="flex flex-col gap-0.5">
                      {items.slice(0, 20).map((e, i) => {
                        const nid = typeof e[idKey] === "object" ? (e[idKey] as any).id : e[idKey]
                        const nb  = nodeById.get(nid)
                        return (
                          <li key={i}>
                            <button onClick={() => setSelectedId(nid)}
                              className="w-full text-left font-mono text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/30 rounded px-2 py-1 transition-colors truncate">
                              {nb?.label || nid}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="w-64 flex-shrink-0 border-l border-border/40 bg-card/30 hidden sm:flex flex-col items-center justify-center gap-2 text-center p-6">
            <div className="h-9 w-9 rounded-xl border border-border/40 bg-card flex items-center justify-center text-muted-foreground/50">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M2 12a10 10 0 1 1 20 0M12 2v3M12 22v-3M2 12h3M22 12h-3"/>
              </svg>
            </div>
            <p className="text-xs text-muted-foreground/50 max-w-[160px] leading-relaxed">
              {t("clickNode")}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Internal Link Analysis Section ──────────────────────────────────────────

interface InternalLinkGraphMeta {
  totalPages: number
  totalLinks: number
  maxDepth: number
  orphanPages: number
  hubPages: number
  authorityPages: number
  averageLinksPerPage: number
  topLinkedPages: Array<{ url: string; title: string | null; inboundLinks: number }>
}

interface InternalLinkGraphData {
  nodes: Array<{
    id: string; url: string; label: string; title: string | null
    inboundCount: number; outboundCount: number; depth: number
    isOrphan: boolean; isHub: boolean; isAuthority: boolean
  }>
  edges: Array<{ id: string; source: string; target: string; anchorText?: string; strength: number }>
  orphanData: {
    graphOrphans: string[]; sitemapUnvisited: string[]
    sitemapAvailable: boolean; crawlComplete: boolean
    confidence: "high" | "medium" | "low"
  }
  metadata: InternalLinkGraphMeta
}

/**
 * The link graph is built ONCE, by the audit worker, and stored on the report.
 *
 * This used to fall back to crawling on demand through `/api/link-graph/v2/*`
 * — endpoints belonging to the imported package's own microservice, which was
 * never ported to this backend. So whenever a report had no stored graph, the
 * section asked a route that does not exist and rendered the 404 body as if it
 * were an analysis result:
 *
 *   Internal link analysis unavailable: Route POST /api/link-graph/v2/submit not found
 *
 * There is nothing for the browser to retry here. Either the worker stored a
 * graph or it didn't, so say which.
 */
function InternalLinkSection({
  initial,
}: {
  /** Link graph persisted on the AuditReport by the audit worker. */
  initial?: InternalLinkGraphData | null
}) {
  const t = useTranslations("pageAudit")
  const linkGraph = initial ?? null

  if (!linkGraph) {
    return (
      <div className="overflow-hidden rounded-2xl border border-border/40 bg-card">
        <div className="border-b border-border/40 px-6 py-5">
          <h2 className="text-lg font-bold">{t("internalLinkAnalysis")}</h2>
        </div>
        <div className="px-6 py-5 flex items-start gap-3 text-sm text-muted-foreground">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span>
            {t("noLinkData")}
          </span>
        </div>
      </div>
    )
  }

  const { metadata, orphanData } = linkGraph

  const statItems = [
    { label: t("pagesCrawled"), value: metadata.totalPages.toLocaleString() },
    { label: t("totalLinks"), value: metadata.totalLinks.toLocaleString() },
    { label: t("orphanPages"), value: metadata.orphanPages.toLocaleString() },
    { label: t("hubPages"), value: metadata.hubPages.toLocaleString() },
    { label: t("authorityPages"), value: metadata.authorityPages.toLocaleString() },
    { label: t("avgLinksPerPage"), value: metadata.averageLinksPerPage.toFixed(1) },
  ]

  return (
    <div className="overflow-hidden rounded-2xl border border-border/40 bg-card">
      <div className="border-b border-border/40 px-6 py-5">
        <h2 className="text-lg font-bold">{t("internalLinkAnalysis")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Full-site crawl · {metadata.totalPages} pages · max depth {metadata.maxDepth}
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          A map of how the pages on your site link to each other. A strong internal
          link structure helps search engines discover and understand your content,
          spreads ranking authority (PageRank) to your most important pages, and
          guides visitors deeper into your site. Below you&apos;ll find your crawl
          stats, an interactive link graph, and your most-linked pages — watch for
          orphan pages (pages with no internal links pointing to them) and make sure
          your key pages are well linked.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 divide-x divide-y divide-border/40 border-b border-border/40">
        {statItems.map(({ label, value }) => (
          <div key={label} className="px-5 py-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-0.5 text-2xl font-bold font-mono tracking-tight">{value}</p>
          </div>
        ))}
      </div>

      {/* Directed link graph */}
      <div className="border-b border-border/40 px-4 py-4">
        <h3 className="mb-3 px-2 text-sm font-semibold text-foreground/90">{t("linkGraph")}</h3>
        <InternalLinkGraph nodes={linkGraph.nodes} edges={linkGraph.edges} orphanData={linkGraph.orphanData} metadata={linkGraph.metadata} />
      </div>

      {metadata.topLinkedPages.length > 0 && (
        <div className="border-b border-border/40 px-6 py-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground/90">{t("topLinkedPages")}</h3>
          <div className="space-y-2.5">
            {metadata.topLinkedPages.slice(0, 5).map((page, i) => {
              let displayPath = page.url
              try { displayPath = new URL(page.url).pathname || "/" } catch {}
              return (
                <div key={i} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-4 shrink-0 text-right text-xs font-mono text-muted-foreground/50">{i + 1}</span>
                    <a
                      href={page.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 min-w-0 text-sm text-foreground/80 hover:text-accent transition-colors"
                    >
                      <span className="truncate">{page.title || displayPath}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 opacity-40" />
                    </a>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{page.inboundLinks} inbound</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {orphanData.graphOrphans.length > 0 && (
        <div className="px-6 py-4 flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-orange-500" />
          <div>
            <p className="text-sm font-medium">
              {orphanData.graphOrphans.length} orphan {orphanData.graphOrphans.length === 1 ? "page" : "pages"} found
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("orphanBlurb")}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Audit Report Results ─────────────────────────────────────────────────────

// ─── Backlinks View ─────────────────────────────────────────────────────────

function BacklinkDonut({
  dofollow,
  nofollow,
  size = 132,
}: {
  dofollow: number
  nofollow: number
  size?: number
}) {
  const total = dofollow + nofollow
  const pct = total > 0 ? dofollow / total : 0
  const stroke = 16
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dofollowLen = c * pct
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {/* nofollow (full ring, amber) */}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#fbbf24" strokeWidth={stroke} />
        {/* dofollow arc (green) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#22c55e"
          strokeWidth={stroke}
          strokeDasharray={`${dofollowLen} ${c - dofollowLen}`}
          strokeLinecap="butt"
        />
      </g>
      <text x="50%" y="46%" textAnchor="middle" className="fill-foreground" fontSize="22" fontWeight="700">
        {Math.round(pct * 100)}%
      </text>
      <text x="50%" y="62%" textAnchor="middle" className="fill-muted-foreground" fontSize="10">
        dofollow
      </text>
    </svg>
  )
}

export function BacklinksView({
  data,
  embedded = false,
}: {
  data: BacklinkProfile
  /** When true, render as part of an existing section (no outer card/padding). */
  embedded?: boolean
}) {
  const t = useTranslations("pageAudit")
  const fmt = (n: number) => n.toLocaleString()
  const totalLinks = data.dofollow + data.nofollow
  const top = data.topBacklinks ?? []

  const tiles: Array<{ label: string; value: string; tone?: "good" | "warn" | "bad"; hint?: string }> = [
    { label: t("domainRank"), value: `${data.rank}`, hint: "0–1000 authority" },
    { label: t("totalBacklinks"), value: fmt(data.backlinks) },
    { label: t("referringDomains"), value: fmt(data.referringDomains) },
    { label: t("referringIps"), value: fmt(data.referringIps) },
    {
      label: t("brokenBacklinks"),
      value: fmt(data.brokenBacklinks),
      tone: data.brokenBacklinks > 0 ? "warn" : "good",
    },
  ]

  return (
    <div className={embedded ? "" : "rounded-2xl border border-border bg-card shadow-sm"}>
      <div className={embedded ? "mb-5" : "border-b border-border/40 px-6 pb-5 pt-6"}>
        <h2 className="text-lg font-bold text-foreground">{t("backlinkProfile")}</h2>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          An overview of the external websites linking to{" "}
          <a
            href={data.target.startsWith("http") ? data.target : `https://${data.target}`}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[#0454ff] hover:underline"
          >
            {data.target}
          </a>
          . Backlinks
          are one of the strongest off-page SEO signals — the more high-quality
          referring domains point to your site, the more authority and trust it
          tends to earn with search engines. Below you&apos;ll find your overall link
          metrics, the dofollow vs nofollow split, and the highest-value pages
          linking to you. This section is informational and doesn&apos;t affect your
          audit score.
        </p>
      </div>

      <div className={embedded ? "" : "px-6 py-5"}>
        {/* Metrics + donut */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
          <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-xl border border-border bg-muted/30 px-3 py-3">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t.label}
                </div>
                <div
                  className={`mt-1 text-xl font-bold tabular-nums ${
                    t.tone === "good"
                      ? "text-green-600"
                      : t.tone === "warn"
                        ? "text-amber-600"
                        : t.tone === "bad"
                          ? "text-red-600"
                          : "text-foreground"
                  }`}
                >
                  {t.value}
                </div>
                {t.hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{t.hint}</div>}
              </div>
            ))}
          </div>

          {totalLinks > 0 && (
            <div className="flex items-center gap-4 lg:flex-col lg:items-center">
              <BacklinkDonut dofollow={data.dofollow} nofollow={data.nofollow} />
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm bg-green-500" />
                  <span className="text-muted-foreground">Dofollow</span>
                  <span className="font-semibold tabular-nums text-foreground">{fmt(data.dofollow)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" />
                  <span className="text-muted-foreground">Nofollow</span>
                  <span className="font-semibold tabular-nums text-foreground">{fmt(data.nofollow)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Top backlinks table */}
        {top.length > 0 && (
          <div className="mt-7">
            <h4 className="text-sm font-semibold text-foreground">{t("topBacklinks")}</h4>
            <p className="mb-3 text-xs text-muted-foreground">
              {t("topBacklinksBlurb")}
            </p>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="w-24 px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t("domainStrength")}
                    </th>
                    <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t("referringPage")}
                    </th>
                    <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t("anchorText")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((b, i) => (
                    <tr key={i} className="border-t border-border/60 align-top">
                      <td className="px-4 py-3">
                        <span className="inline-flex min-w-9 items-center justify-center rounded-md bg-cyan-500/10 px-2 py-0.5 text-sm font-bold tabular-nums text-cyan-600">
                          {b.domainStrength}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={b.urlFrom}
                          target="_blank"
                          rel="noreferrer nofollow"
                          className="block break-all text-xs font-medium text-[#0454ff] hover:underline"
                        >
                          {b.urlFrom}
                        </a>
                        {b.pageTitle && (
                          <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                            {b.pageTitle}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-foreground">{b.anchor || "—"}</span>
                        {!b.dofollow && (
                          <span className="ml-2 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
                            nofollow
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {data.firstSeen && (
          <p className="mt-4 text-[11px] text-muted-foreground">
            Profile first seen {new Date(data.firstSeen).toLocaleDateString()}.
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Recommendations (consolidated, prioritized issue list) ──────────────────

function sevToPriority(sev: Issue["severity"]): 1 | 2 | 3 {
  if (sev === "CRITICAL" || sev === "HIGH") return 1
  if (sev === "MEDIUM") return 2
  return 3
}

// Module scope, so it cannot call a hook: it holds the message KEY and the
// component that renders it resolves the label.
const PRIORITY_META: Record<1 | 2 | 3, { labelKey: string; chip: string }> = {
  1: { labelKey: "highPriority", chip: "bg-rose-500/10 text-rose-600" },
  2: { labelKey: "mediumPriority", chip: "bg-amber-500/10 text-amber-600" },
  3: { labelKey: "lowPriority", chip: "bg-emerald-500/10 text-emerald-600" },
}

export type Recommendation = {
  /** Stable key used to curate which recommendations a shared report shows. */
  key: string
  title: string
  how: string
  priority: 1 | 2 | 3
  category: string
}

/**
 * The canonical, prioritized recommendation list for a report — the SAME list
 * the hero ("N issues found"), the PDF, and the share-selection editor all use,
 * so keys and counts always line up. Built from issues (preferred) or failed
 * checks (older reports). Sorted High → Low.
 */
export function buildRecommendations(report: AuditReport): Recommendation[] {
  const checks = report.checks ?? []
  const fromIssues: Recommendation[] = (report.issues ?? []).map((i) => {
    const match = checks.find(
      (c) => c.category === i.category && (c.name === i.title || c.id === i.type),
    )
    return {
      key: `iss:${i.id}`,
      title: i.title,
      how: match?.recommendation || match?.how || i.description || match?.shortAnswer || "",
      priority: sevToPriority(i.severity),
      category: i.category,
    }
  })

  // Fallback only if the report has no issues array (older reports).
  const items: Recommendation[] =
    fromIssues.length > 0
      ? fromIssues
      : checks
          .filter((c) => c.passed === false && !c.informational)
          .map((c) => ({
            key: `chk:${c.category}:${c.name}`,
            title: c.name,
            how: c.recommendation || c.how || c.shortAnswer || "",
            priority: c.priority,
            category: c.category,
          }))

  items.sort((a, b) => a.priority - b.priority)
  return items
}

export type ShareSection = { key: string; label: string }

// Canonical keys for the toggleable report sections (shared between the share
// dialog, the shared-report renderer, and the PDF).
export const SECTION_RECOMMENDATIONS = "recommendations"
export const SECTION_INTERNAL_LINKS = "internal-links"
export const SECTION_BACKLINKS = "backlinks"
export const sectionKeyForCategory = (categoryKey: string) => `cat:${categoryKey}`

/**
 * The sections of a report that an owner can include/exclude per share link.
 * Only lists sections that actually have content for this report, so the share
 * dialog never offers an empty section. The Backlink Profile lives under Links,
 * so it's listed right after the Links category.
 */
export function shareableSections(report: AuditReport): ShareSection[] {
  const out: ShareSection[] = []
  if (buildRecommendations(report).length > 0)
    out.push({ key: SECTION_RECOMMENDATIONS, label: "Recommendations" })
  if (report.linkGraph?.metadata)
    out.push({ key: SECTION_INTERNAL_LINKS, label: "Internal Link Analysis" })
  for (const d of CATEGORY_SCORES_DEF) {
    out.push({ key: sectionKeyForCategory(d.key), label: `${d.label} Results` })
    if (d.key === "LINKS" && report.backlinks)
      out.push({ key: SECTION_BACKLINKS, label: "Backlink Profile" })
  }
  return out
}

/**
 * A simple, prioritized list of everything to fix — like SEOptimer's
 * "Recommendations". Rendered above the detailed per-category sections.
 */
function RecommendationsSection({ report }: { report: AuditReport }) {
  const t = useTranslations("pageAudit")
  const items = buildRecommendations(report)

  if (items.length === 0) return null

  return (
    <div className="overflow-hidden rounded-2xl border border-border/40 bg-card">
      <div className="border-b border-border/40 px-6 pb-5 pt-6">
        <h2 className="text-lg font-bold">{t("recommendations")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {items.length} {items.length === 1 ? "issue" : "issues"} to fix, ordered by priority.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {items.map((it, i) => {
              const pm = PRIORITY_META[it.priority]
              const cat = CATEGORY_META[it.category]
              return (
                <tr key={i} className="border-b border-border/40 last:border-0">
                  <td className="w-full px-6 py-3.5 align-middle font-semibold text-foreground">
                    {it.title}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3.5 text-right align-middle text-muted-foreground">
                    {cat?.label ?? it.category}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3.5 text-right align-middle">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pm.chip}`}>
                      {t(pm.labelKey)}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Connect-Search-Console prompt (authenticated reports only). Renders a button
// in the report's action bar; opening it shows a proper centered modal. It also
// auto-opens once per site — cancel it and the button stays at the top to reopen.

// The checks shown for a category — from full check objects when available,
// else synthesized from issues/passingChecks. Shared by the report sections and
// the Quick-links sub-menus so they stay in sync.
function checksForCategory(report: AuditReport, key: string): SEOAuditCheck[] {
  if (report.checks && report.checks.length > 0) {
    const filtered = report.checks.filter((c) => c.category === key)
    const order = CHECK_ORDER[key]
    if (!order) return filtered
    const rank = (id: string) => {
      const i = order.indexOf(id)
      return i === -1 ? Number.MAX_SAFE_INTEGER : i
    }
    return [...filtered].sort((a, b) => rank(a.id) - rank(b.id))
  }
  return [
    ...(report.issues ?? [])
      .filter((i) => i.category === key)
      .map((i, idx) => ({
        id: `issue-${key}-${idx}`,
        name: i.title,
        maxScore: 10,
        priority: 2 as const,
        section: (CATEGORY_TO_SECTION[key] ?? "seo") as AuditSection,
        informational: false,
        what: "",
        why: "",
        how: "",
        category: key,
        passed: false as boolean | null,
        score: 0,
        shortAnswer: i.description,
        answer: i.description,
        recommendation: null,
        value: null,
      })),
    ...(report.passingChecks ?? [])
      .filter((p) => p.category === key)
      .map((p, idx) => ({
        id: `pass-${key}-${idx}`,
        name: p.title,
        maxScore: 10,
        priority: 2 as const,
        section: (CATEGORY_TO_SECTION[key] ?? "seo") as AuditSection,
        informational: false,
        what: "",
        why: "",
        how: "",
        category: key,
        passed: true as boolean | null,
        score: 10,
        shortAnswer: p.description,
        answer: p.description,
        recommendation: null,
        value: null,
      })),
  ]
}

// Sticky "Quick links" rail (blog-style table of contents) with scroll-spy.
type NavItem = { id: string; label: string; children?: { id: string; label: string }[] }

function QuickLinks({ items }: { items: NavItem[] }) {
  const t = useTranslations("pageAudit")
  const [active, setActive] = useState(items[0]?.id ?? "")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const idsKey = items.map((i) => i.id).join("|")

  useEffect(() => {
    const els = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => !!el)
    if (!els.length) return
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: "-88px 0px -65% 0px" },
    )
    els.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey])

  if (items.length < 2) return null
  const jump = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-24">
        <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
          {t("quickLinks")}
        </p>
        <nav className="mt-3 border-l border-border">
          {items.map((it) => {
            const on = active === it.id
            const hasChildren = !!it.children?.length
            const isOpen = expanded.has(it.id)
            return (
              <div key={it.id}>
                <div className="flex items-stretch">
                  <button
                    type="button"
                    onClick={() => jump(it.id)}
                    className={`-ml-px flex-1 border-l-2 py-1.5 pl-3 pr-2 text-left text-sm transition-colors ${
                      on
                        ? "border-accent font-medium text-foreground"
                        : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                    }`}
                  >
                    {it.label}
                  </button>
                  {hasChildren && (
                    <button
                      type="button"
                      onClick={() => toggle(it.id)}
                      aria-label={isOpen ? "Collapse" : "Expand"}
                      className="flex items-center px-1.5 text-muted-foreground/50 transition-colors hover:text-foreground"
                    >
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform ${isOpen ? "" : "-rotate-90"}`}
                      />
                    </button>
                  )}
                </div>
                {hasChildren && isOpen && (
                  <div className="ml-3 border-l border-border/60">
                    {it.children!.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => jump(c.id)}
                        title={c.label}
                        className="-ml-px block w-full truncate border-l-2 border-transparent py-1 pl-3 pr-2 text-left text-[12.5px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}

export function AuditReportResults({
  report,
  onNewAudit,
  isAuthenticated = false,
  shared = false,
  hiddenSections,
  recommendationsSlot,
}: {
  report: AuditReport
  onNewAudit: () => void
  isAuthenticated?: boolean
  /** Public shared view — hides the AI assistant and share controls. */
  shared?: boolean
  /** Section keys to omit — set per share link (shared view only). */
  hiddenSections?: string[]
  /**
   * Rendered INSTEAD of the Recommendations section.
   *
   * Site audits pass their by-problem rollup here: it belongs in the same slot
   * (first thing after the scores, where "what should I do" lives), and the
   * recommendation list it displaces is empty in this app anyway — the
   * generator wasn't part of the port.
   */
  recommendationsSlot?: React.ReactNode
}) {
  const t = useTranslations("pageAudit")
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareToken, setShareToken] = useState<string | null>(null)
  const [shareLoading, setShareLoading] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // Whether the signed-in owner has white-label branding enabled (set in
  // Settings) — used only for the share-dialog status. The PDF download is never
  // white-labeled; it always uses the standard report styling.
  const [brandingOn, setBrandingOn] = useState<boolean | null>(null)
  const { user: authUser, loading: authLoading } = useAuth()
  const authStatus = authLoading ? "loading" : authUser ? "authenticated" : "unauthenticated"
  const router = useRouter()

  useEffect(() => {
    if (shared || authStatus !== "authenticated") return
    let cancelled = false
    fetch("/api/user-branding")
      .then((r) => r.json())
      .then((d: { branding?: { enabled?: boolean } | null }) => {
        if (!cancelled) setBrandingOn(!!d.branding?.enabled)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [shared, authStatus])

  // ── Per-share section curation ────────────────────────────────────────────
  // The report sections an owner can include/exclude, and the set hidden from
  // THIS share link. Rendering on the shared view uses the `hiddenSections`
  // prop; the dialog below edits the selection for the current token.
  const sections = shareableSections(report)
  const [hiddenSecs, setHiddenSecs] = useState<Set<string>>(new Set())
  const [secSaving, setSecSaving] = useState(false)
  const [secSaved, setSecSaved] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  // Load any saved selection once the share token exists.
  useEffect(() => {
    if (!shareToken) return
    let cancelled = false
    fetch(`/api/share-selection/${shareToken}`)
      .then((r) => r.json())
      .then((d: { hiddenKeys?: string[] }) => {
        if (!cancelled) setHiddenSecs(new Set(d.hiddenKeys ?? []))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [shareToken])

  // Persist the hidden set (auto-save — no separate "save" step to forget).
  async function persistSelection(next: Set<string>) {
    if (!shareToken) return
    setSecSaving(true)
    setSecSaved(false)
    try {
      await fetch("/api/share-selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: shareToken, hiddenKeys: [...next] }),
      })
      setSecSaved(true)
      setTimeout(() => setSecSaved(false), 1500)
    } catch {
      /* best-effort; the visible state still reflects the intent */
    } finally {
      setSecSaving(false)
    }
  }

  function toggleSection(key: string) {
    const next = new Set(hiddenSecs)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setHiddenSecs(next)
    void persistSelection(next)
  }

  function setAllSections(hideAll: boolean) {
    const next = hideAll ? new Set(sections.map((s) => s.key)) : new Set<string>()
    setHiddenSecs(next)
    void persistSelection(next)
  }

  const shownSecCount = sections.length - hiddenSecs.size

  // Sections omitted from THIS view (shared link only).
  const hidden = new Set(hiddenSections ?? [])

  const shareUrl =
    shareToken && typeof window !== "undefined"
      ? `${window.location.origin}/audit/shared/${shareToken}`
      : ""

  async function handleDownloadPdf() {
    if (downloadingPdf) return
    setDownloadingPdf(true)
    try {
      await downloadAuditPdf(report, hiddenSections)
    } finally {
      setDownloadingPdf(false)
    }
  }

  function handleShare() {
    // Creating a share link requires an account — send guests to sign in first.
    if (authStatus !== "authenticated") {
      router.push(`/auth/signin?callbackUrl=${encodeURIComponent(`/audit/${report.id}`)}`)
      return
    }
    setShareOpen(true)
    if (!shareToken) void createShareLink()
  }

  async function createShareLink() {
    setShareLoading(true)
    setShareError(null)
    try {
      // Our API, via the shared client so the JWT rides along. The package
      // POSTed to its own Next route handler, which read a NextAuth session out
      // of a frontend Prisma client — neither exists here.
      //
      // Idempotent server-side: re-sharing returns the token already handed out,
      // so a link someone has been given never silently rotates.
      const data = await api.post<{ shareToken?: string }>(
        `/api/page-audit/reports/${report.id}/share`,
        {},
      )
      if (data.shareToken) setShareToken(data.shareToken)
      else setShareError(t("shareFailed"))
    } catch (err) {
      // ApiError already carries a human-readable message off our error envelope.
      setShareError(err instanceof ApiError ? err.message : t("networkError"))
    } finally {
      setShareLoading(false)
    }
  }

  async function stopSharing() {
    setShareLoading(true)
    const token = shareToken
    try {
      await api.delete(`/api/page-audit/reports/${report.id}/share`)
      // The package also cleaned up per-share "which sections to include"
      // curation here. That lives in its own /api/share-selection store, which
      // wasn't ported, so there is nothing to drop — a revoked token simply
      // stops resolving.
      void token
    } catch {
      /* best-effort */
    } finally {
      setShareToken(null)
      setHiddenSecs(new Set())
      setPickerOpen(false)
      setShareLoading(false)
      setShareOpen(false)
    }
  }

  async function copyShareUrl() {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked — user can copy manually */
    }
  }

  const sortedIssues = [...(report.issues ?? [])].sort(
    (a, b) => (SEVERITY_META[a.severity]?.order ?? 5) - (SEVERITY_META[b.severity]?.order ?? 5)
  )

  const overallScore = report.scoring?.overall?.score ?? report.summary?.overall?.score ?? 0
  const overallGrade = report.scoring?.overall?.grade ?? report.summary?.overall?.grade ?? "N/A"

  const categoryScores = CATEGORY_SCORES_DEF.map(({ key, label, category }) => {
    const catScore = report.scoring?.categories?.[category as keyof typeof report.scoring.categories]
    const catDetail = report.categoryDetails?.find((c: CategoryDetail) => c.category === key)
    return {
      key,
      label,
      score: catScore?.score ?? catDetail?.score ?? 0,
      grade: catScore?.grade ?? catDetail?.grade,
    }
  })

  const hostname = (() => { try { return new URL(report.url).hostname } catch { return report.url } })()

  // Quick-nav targets — mirror the sections actually rendered below, in order.
  const navItems: NavItem[] = [
    ...(!hidden.has(SECTION_RECOMMENDATIONS) && buildRecommendations(report).length > 0
      ? [{ id: "sec-rec", label: "Recommendations" }]
      : []),
    ...(!hidden.has(SECTION_INTERNAL_LINKS) ? [{ id: "sec-internal-links", label: "Internal Links" }] : []),
    ...categoryScores
      .filter(({ key }) => !hidden.has(sectionKeyForCategory(key)))
      .map(({ key, label }) => ({
        id: `sec-${key}`,
        label,
        children: checksForCategory(report, key).map((c) => ({
          id: `check-${c.id}`,
          label: c.name,
        })),
      })),
  ]
  const showToc = (isAuthenticated || shared) && navItems.length >= 2

  return (
    <>
      {/* ── Results Header ── */}
      {/* pt-8, not pt-20: both callers already pad above this (the dashboard page
          has pt-5 plus the "All audits" link, the shared view py-8), so 80px here
          stacked on top of that and pushed the grade and preview a screenful down. */}
      <section className="border-b border-border/40 bg-card pt-8 pb-8">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">

          {/* Top bar: breadcrumb + action */}
          <div className="mb-8 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/50 text-xs font-bold font-mono text-foreground/60">
                {hostname.replace(/^www\./, "").charAt(0).toUpperCase()}
              </div>
              <div className="flex items-center gap-1.5 text-sm min-w-0">
                <span className="text-muted-foreground hidden sm:block">{t("auditResultsFor")}</span>
                <span className="font-semibold text-foreground truncate">{hostname}</span>
                <a href={report.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground/40 hover:text-accent transition-colors">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                {/* How much of the site this score covers. Without it a report
                    from one URL and a report from a 64-page crawl are the same
                    hostname and the same grade, read the same way. */}
                {report.pagesAnalyzed > 0 && (
                  <span className="ml-1 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {report.pagesAnalyzed === 1 ? "1 page" : `${report.pagesAnalyzed} pages`}
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!shared && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={handleShare}
                >
                  <Share2 className="h-3 w-3" />
                  {t("share")}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
              >
                {downloadingPdf ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <Download className="h-3 w-3" />
                )}
                {downloadingPdf ? "Preparing…" : "Download"}
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={onNewAudit}>
                <RefreshCw className="h-3 w-3" />
                {t("newAudit")}
              </Button>
            </div>
          </div>

          {/* Hero row: grade ring + screenshot */}
          <div className="mb-8 grid grid-cols-1 gap-10 sm:grid-cols-2 sm:items-center">
            <div className="flex flex-col items-center gap-4">
              <OverallGradeRing grade={overallGrade} score={overallScore} size={200} />
              <div className="text-center space-y-2">
                <p className="text-base font-semibold text-foreground/90">{gradeTagline(overallGrade)}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${gradeBgColor(overallGrade)} ${gradeColor(overallGrade)}`}>
                    Grade {overallGrade}
                  </span>
                  {sortedIssues.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-600 dark:text-orange-400">
                      {sortedIssues.length} {sortedIssues.length === 1 ? "issue" : "issues"} found
                    </span>
                  )}
                </div>
              </div>
            </div>
            <WebsiteScreenshot
              url={report.url}
              auditReportId={report.id}
              initial={report.screenshots}
            />
          </div>

          {/* Category mini-rings + radar */}
          <div className="rounded-xl border border-border/40 bg-background/50 p-4">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap justify-center gap-4 sm:justify-start sm:gap-5">
                {categoryScores.map((cat, i) => {
                  const pending = cat.key === "PERFORMANCE" && report.pageSpeedStatus === "pending"
                  return (
                    <CategoryMiniRing
                      key={cat.key}
                      label={cat.label}
                      grade={cat.grade ?? "N/A"}
                      score={cat.score}
                      delay={i * 80}
                      pending={pending}
                    />
                  )
                })}
              </div>
              <RadarChart categories={categoryScores} />
            </div>
          </div>

          {report.completedAt && (
            <p className="mt-4 text-xs text-muted-foreground/50">
              Generated{" "}
              {new Date(report.completedAt).toLocaleString("en-US", {
                day: "numeric", month: "long", year: "numeric",
                hour: "numeric", minute: "2-digit", timeZoneName: "short",
              })}
            </p>
          )}
        </div>
      </section>

      {/* ── Share dialog ── */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-4 w-4" />
              {t("shareTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("shareNote")}
            </DialogDescription>
          </DialogHeader>

          {shareLoading && !shareToken ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin text-accent" />
              {t("shareCreating")}
            </div>
          ) : shareError ? (
            <div className="space-y-3">
              <p className="text-sm text-destructive">{shareError}</p>
              <Button size="sm" variant="outline" onClick={createShareLink}>
                {t("tryAgain")}
              </Button>
            </div>
          ) : shareToken ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Input readOnly value={shareUrl} className="text-xs" onFocus={(e) => e.target.select()} />
                <Button size="sm" className="shrink-0 gap-1.5" onClick={copyShareUrl}>
                  {copied ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              {/* White-label branding is configured once in Settings and
                  applied automatically to every report you share. */}
              {brandingOn ? (
                <p className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-xs text-foreground">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  <span>
                    Your white-label branding is applied to this report.{" "}
                    <Link href="/dashboard/settings" className="font-medium text-accent hover:underline">
                      {t("editBranding")}
                    </Link>
                  </span>
                </p>
              ) : (
                <p className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
                  Want your own logo and colors on shared reports?{" "}
                  <Link href="/dashboard/settings" className="font-medium text-accent hover:underline">
                    {t("setUpBranding")}
                  </Link>{" "}
                  in Settings — it applies to every report you share.
                </p>
              )}

              {/* Per-link section curation */}
              {sections.length > 0 && (
                <div className="rounded-lg border border-border/60 bg-muted/20">
                  <button
                    type="button"
                    onClick={() => setPickerOpen((o) => !o)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                  >
                    <span>
                      <span className="block text-sm font-medium text-foreground">
                        {t("sectionsToInclude")}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {shownSecCount === sections.length
                          ? `All ${sections.length} sections shown`
                          : `${shownSecCount} of ${sections.length} sections shown`}
                        {secSaving ? " · Saving…" : secSaved ? " · Saved" : ""}
                      </span>
                    </span>
                    {pickerOpen ? (
                      <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>

                  {pickerOpen && (
                    <div className="border-t border-border/50">
                      <div className="flex items-center justify-between gap-2 px-3 py-2">
                        <p className="text-xs text-muted-foreground">
                          {t("uncheckSections")}
                        </p>
                        <div className="flex shrink-0 gap-1.5">
                          <button
                            type="button"
                            onClick={() => setAllSections(false)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-accent/10"
                          >
                            All
                          </button>
                          <button
                            type="button"
                            onClick={() => setAllSections(true)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
                          >
                            None
                          </button>
                        </div>
                      </div>
                      <div className="max-h-56 overflow-y-auto px-3 pb-2.5">
                        {sections.map((sec) => {
                          const shown = !hiddenSecs.has(sec.key)
                          return (
                            <label
                              key={sec.key}
                              className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-2 hover:bg-muted/60"
                            >
                              <input
                                type="checkbox"
                                checked={shown}
                                onChange={() => toggleSection(sec.key)}
                                className="h-4 w-4 shrink-0 accent-accent"
                              />
                              <span
                                className={`text-sm font-medium ${
                                  shown ? "text-foreground" : "text-muted-foreground line-through"
                                }`}
                              >
                                {sec.label}
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between border-t border-border/50 pt-3">
                <p className="text-xs text-muted-foreground">{t("shareOn")}</p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-xs text-destructive hover:text-destructive"
                  onClick={stopSharing}
                  disabled={shareLoading}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  {t("stopSharing")}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ── Main content — quick-links rail + full-width bands ── */}
      <div className="px-4 sm:px-6 lg:px-8 pt-8 pb-8">
        <div className={showToc ? "lg:grid lg:grid-cols-[196px_minmax(0,1fr)] lg:gap-8" : ""}>
          {showToc && <QuickLinks items={navItems} />}
          <div className="min-w-0 space-y-6">
        {!shared && <AskAiPanel report={report} />}
        {/* A caller can put its own panel in the Recommendations slot. Site
            audits do: the rollup by problem belongs exactly where the
            per-recommendation list would have been, and that list is empty here
            anyway — the recommendation generator wasn't part of the port. */}
        {recommendationsSlot ??
          (!hidden.has(SECTION_RECOMMENDATIONS) && (
            <div id="sec-rec" className="scroll-mt-32">
              <RecommendationsSection report={report} />
            </div>
          ))}
        {!hidden.has(SECTION_INTERNAL_LINKS) && (
          <div id="sec-internal-links" className="scroll-mt-32">
            <InternalLinkSection initial={report.linkGraph} />
          </div>
        )}
        {(() => {
          const categorySections = categoryScores
            .filter(({ key }) => !hidden.has(sectionKeyForCategory(key)))
            .map(({ key, label, grade, score }) => {
            const checks = checksForCategory(report, key)

            const insight = report.summary?.insights?.categories?.find((c) => c.category === key)?.insight
            const pageSpeedPending = key === "PERFORMANCE" && report.pageSpeedStatus === "pending"

            return (
              <div key={key} id={`sec-${key}`} className="scroll-mt-32">
                <CategoryResultSection
                  title={`${label} Results`}
                  categoryLabel={label}
                  grade={grade ?? "N/A"}
                  score={score}
                  insight={insight}
                  checks={checks}
                  pageSpeedPending={pageSpeedPending}
                  footer={
                    key === "LINKS" && report.backlinks && !hidden.has(SECTION_BACKLINKS) ? (
                      <BacklinksView data={report.backlinks} embedded />
                    ) : undefined
                  }
                />
              </div>
            )
          })

          const aiPanel = report.summary?.insights ? (
            <AIInsightsPanel insights={report.summary.insights} />
          ) : null

          // Anonymous users see the first section in full, then a paywall over
          // the rest. Authenticated users — and anyone viewing a shared report
          // — see everything.
          if (!isAuthenticated && !shared && categorySections.length > 0) {
            const [firstSection, ...lockedSections] = categorySections
            return (
              <>
                {firstSection}
                <PaywallSection>
                  {lockedSections}
                  {aiPanel}
                </PaywallSection>
              </>
            )
          }

          return (
            <>
              {categorySections}
              {aiPanel}
            </>
          )
        })()}

        {!isAuthenticated && !shared && (
          <div className="relative overflow-hidden rounded-2xl border border-accent/25 bg-card px-6 py-8 text-center shadow-lg shadow-accent/5">
            {/* Accent glow background */}
            <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-32 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/15 blur-3xl" />
            <div className="relative">
              <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-accent/30 bg-accent/10">
                <Lock className="h-5 w-5 text-accent" />
              </div>
              <h3 className="mb-2 text-xl font-bold font-mono">{t("saveProgress")}</h3>
              <p className="mb-6 mx-auto max-w-sm text-sm text-muted-foreground leading-relaxed">
                {t("createAccountBlurb")}
              </p>
              <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-center">
                <Button asChild>
                  <Link href="/auth/signin" className="gap-2">
                    {t("getStartedFree")}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/#pricing">{t("viewPlans")}</Link>
                </Button>
              </div>
            </div>
          </div>
        )}
          </div>
        </div>
      </div>
    </>
  )
}
