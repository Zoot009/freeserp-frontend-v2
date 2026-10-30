"use client"

// The Google Business Profile audit report, section by section. It is built
// from the dashboard's own parts: StatCard for the headline figures, plain
// bordered panels with an InfoHint in the header, and brand blue for the one
// primary action. The grade colours are the AEO / Page Audit ones
// (components/page-audit/audit-ui.tsx) and the rank grid is Maps Tracker's, so
// it reads as one product.
import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react"
import { flushSync } from "react-dom"
import Link from "next/link"
import { AlertCircle, AlertTriangle, BadgeCheck, CheckCircle2, CircleDashed, Globe, MapPin, Phone, Star, XCircle } from "lucide-react"
import { gradeStroke, sectionScoreToGrade } from "@/components/page-audit/audit-ui"
import { formatDistance, rankColor, type DistanceUnit } from "@/components/maps-tracker/grid"
import { useCompetitors } from "@/components/maps-tracker/use-competitors"
import type { Scan } from "@/components/maps-tracker/types"
import { PointDetail, RankGridView, RankLegend, gridPointKey } from "@/components/gbp-audit/rank-grid"
import { api } from "@/lib/api"
import { StatCard } from "@/components/dashboard/stat-card"
import { Hint, InfoHint } from "@/components/dashboard/widget"
import { EngineMark } from "@/components/dashboard/engine-marks"
import {
  CACHE_DAYS,
  DAY_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  STEPS,
  fmtDay,
  hostOf,
  initials,
  pointPlace,
  verdict,
  findLeaderboardRow,
  rivalGrid,
  bestOf,
  contenders,
  gaps,
  mapsResults,
  type Contender,
  type AuditStep,
  type Business,
  type Check,
  type CheckStatus,
  type CompetitorRow,
  type Facts,
  type GbpAuditResponse,
  type Grid,
  type PlanPhase,
  type Priority,
  type Report,
  type Review,
} from "@/lib/gbp-audit"

// ── Colour and type ──────────────────────────────────────────────────────────

/** Text colour for a 0–100 score, on the shared grade bands. */
const scoreText = (score: number) => {
  const g = sectionScoreToGrade(score)
  return g === "A" ? "text-green-600 dark:text-green-400" : g === "B" ? "text-lime-600 dark:text-lime-400" : g === "C" ? "text-yellow-600 dark:text-yellow-400" : g === "D" ? "text-orange-500" : "text-red-500"
}
/** Fill colour for a 0–100 score, on the same bands. */
const scoreFill = (score: number) => gradeStroke(sectionScoreToGrade(score)).replaceAll("stroke-", "bg-")

const STATUS_STYLE: Record<CheckStatus, { Icon: typeof CheckCircle2; tone: string }> = {
  pass: { Icon: CheckCircle2, tone: "text-green-600 dark:text-green-400" },
  warn: { Icon: AlertTriangle, tone: "text-amber-500" },
  fail: { Icon: XCircle, tone: "text-red-500" },
  unknown: { Icon: CircleDashed, tone: "text-muted-foreground" },
}

const PRIORITY_STYLE: Record<Priority, string> = {
  high: "bg-red-500/10 text-red-600 dark:text-red-400",
  medium: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  low: "bg-muted text-muted-foreground",
}

/** Distance in the business's own units: miles in the US and UK, km elsewhere. */
export const unitFor = (b: Business): DistanceUnit => (b.countryCode && ["US", "GB", "LR", "MM"].includes(b.countryCode) ? "IMPERIAL" : "METRIC")

const LINK = "text-[13px] font-medium text-brand hover:underline print:hidden"

/**
 * Set on the public share page. Owner-only links (Maps Tracker, which needs an
 * account) are left out, and the competitors' grids come with the report
 * instead of being asked for.
 */
export const SharedReportContext = createContext<{ leaderboard: GbpAuditResponse["leaderboard"] } | null>(null)

// ── Building blocks ──────────────────────────────────────────────────────────

/** A report section: a bordered card with a title, an explanation behind the "i", and a right-hand slot. */
export function Panel({
  title,
  hint,
  meta,
  flush = false,
  className = "",
  children,
}: {
  title: ReactNode
  hint?: ReactNode
  meta?: ReactNode
  /** Body without padding, for rows and tables that run edge to edge. */
  flush?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`flex min-w-0 flex-col rounded-[10px] border border-border bg-card shadow-sm print:break-inside-avoid print:shadow-none ${className}`}>
      <header className="flex min-h-[47px] flex-wrap items-center gap-1.5 border-b border-border px-4 py-3">
        <h2 className="text-[15px] font-semibold leading-tight">{title}</h2>
        {hint && <InfoHint>{hint}</InfoHint>}
        {meta && <div className="ml-auto flex items-center gap-4 text-[13px] text-muted-foreground">{meta}</div>}
      </header>
      <div className={`min-w-0 flex-1 ${flush ? "" : "p-4"}`}>{children}</div>
    </section>
  )
}

/** Something wrong, said plainly: a failed audit. */
export function Alarm({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-[10px] border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-foreground">
      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
      <span>{children}</span>
    </p>
  )
}

/** A heads-up that isn't a failure of the audit: a step that didn't run. */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-[10px] border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-foreground">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
      <span>{children}</span>
    </p>
  )
}

function Bar({ value, fill }: { value: number; fill: string }) {
  return (
    <span className="block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
      <span className={`block h-full rounded-full transition-all duration-700 ${fill}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </span>
  )
}

/** Label / value rows with hairlines between them. */
function KeyValues({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="m-0 divide-y divide-border">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 py-2 text-[13px] first:pt-0 last:pb-0">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="m-0 text-right font-medium tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** A score out of 100 as a ring. */
export function ScoreRing({
  score,
  size = 64,
  stroke = 6,
  ringClass,
  showMax = false,
}: {
  score: number
  size?: number
  stroke?: number
  /** Overrides the grade colour. */
  ringClass?: string
  /** "/100" under the number. */
  showMax?: boolean
}) {
  const [filled, setFilled] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setFilled(true), 60)
    return () => clearTimeout(t)
  }, [])
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Score ${score} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} className="stroke-muted" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - ((filled ? score : 0) / 100) * c}
          className={`transition-all duration-1000 ease-out ${ringClass ?? gradeStroke(sectionScoreToGrade(score))}`}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-semibold tabular-nums" style={{ fontSize: Math.round(size * 0.3) }}>
          {score}
        </span>
        {showMax && <span className="mt-1 text-[10px] font-medium text-muted-foreground">/100</span>}
      </span>
    </div>
  )
}

function Stars({ value, size = "h-3.5 w-3.5" }: { value: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          aria-hidden
          className={`${size} ${value >= i - 0.25 ? "fill-amber-400 text-amber-400" : value >= i - 0.75 ? "fill-amber-400/50 text-amber-400" : "fill-muted text-muted-foreground/30"}`}
        />
      ))}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`shrink-0 whitespace-nowrap rounded px-1.5 py-px text-[11px] font-medium ${PRIORITY_STYLE[priority]}`}>{PRIORITY_LABEL[priority]}</span>
}

function StatusIcon({ status }: { status: CheckStatus }) {
  const { Icon, tone } = STATUS_STYLE[status]
  return <Icon className={`mt-0.5 h-[15px] w-[15px] shrink-0 ${tone}`} aria-label={STATUS_LABEL[status]} />
}

/** One check: what it is, what we found, why it matters and the fix. */
function CheckRow({ check: c, showPriority = true }: { check: Check; showPriority?: boolean }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <StatusIcon status={c.status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <b className="text-[13px] font-medium">{c.label}</b>
          <span className="flex shrink-0 items-center gap-2">
            <span className="max-w-[220px] truncate text-xs text-muted-foreground">{c.value}</span>
            {showPriority && (c.status === "fail" || c.status === "warn") && <PriorityBadge priority={c.priority} />}
          </span>
        </div>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{c.detail}</p>
        {c.fix && <p className="mt-1 text-[13px] leading-relaxed text-foreground">→ {c.fix}</p>}
      </div>
    </div>
  )
}

/** The listing's photo, or its initials when Google has none (or it fails to load). */
function BusinessTile({ business, size = 56 }: { business: Business; size?: number }) {
  const [broken, setBroken] = useState(false)
  const src = business.logo ?? business.mainImage
  if (src && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Google-hosted photo, not ours to optimise
      <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="shrink-0 rounded-[10px] object-cover ring-1 ring-border" style={{ width: size, height: size }} />
    )
  }
  return (
    <div className="grid shrink-0 place-items-center rounded-[10px] bg-muted text-lg font-semibold text-muted-foreground" style={{ width: size, height: size }} aria-hidden>
      {initials(business.name)}
    </div>
  )
}

const ExtLink = ({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className={`hover:underline ${className}`}>
    {children}
  </a>
)

// ── Header and progress ──────────────────────────────────────────────────────

/** The top of the report: who was audited, the score, and how to reach them. */
export function ReportHero({ data, onOpenPlan }: { data: GbpAuditResponse; /** Opens the Action plan tab. */ onOpenPlan?: () => void }) {
  const { audit, facts, report } = data
  const b = facts?.business
  // Only a keyword the user typed. Left blank, the audit uses the primary
  // category, which the line already shows.
  const customKeyword = audit.keyword
  return (
    <section className="flex flex-col gap-4 rounded-[10px] border border-border bg-card p-4 shadow-sm md:flex-row md:items-center md:gap-6">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        {b ? (
          <BusinessTile business={b} size={112} />
        ) : (
          <div className="grid h-28 w-28 shrink-0 place-items-center rounded-[10px] bg-muted text-muted-foreground" aria-hidden>
            <MapPin className="h-7 w-7" />
          </div>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="text-lg font-semibold leading-snug tracking-[-0.01em]">{b?.name ?? audit.name ?? "Reading the profile…"}</h1>
            {b?.isClaimed === true && (
              <Hint text="The owner has verified this business on Google Business Profile. Only they can edit its details, post updates and reply to reviews.">
                <button type="button" className="inline-flex cursor-help items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                  <BadgeCheck className="h-3 w-3" /> Claimed
                </button>
              </Hint>
            )}
            {b?.isClaimed === false && (
              <Hint text="No one has verified ownership of this business on Google. Anyone can suggest changes to its details, and nobody can reply to reviews as the owner. Claim it at business.google.com.">
                <button type="button" className="inline-flex cursor-help items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-3 w-3" /> Unclaimed
                </button>
              </Hint>
            )}
          </div>
          {b && (
            <>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                {b.category && <span>{b.category}</span>}
                {customKeyword && (
                  <span>
                    Keyword: <span className="font-medium text-foreground">{customKeyword}</span>
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-col gap-1 text-[13px] text-foreground/80">
                {b.address && (
                  <span className="flex min-w-0 items-start gap-1.5">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" /> <span className="leading-snug">{b.address}</span>
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> {b.phone ? <span className="tabular-nums">{b.phone}</span> : <span className="text-red-500">No phone</span>}
                </span>
                <span className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {b.website ? (
                    <ExtLink href={b.website} className="text-brand">
                      {hostOf(b.website)}
                    </ExtLink>
                  ) : (
                    <span className="text-red-500">No website</span>
                  )}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
      {b?.rating != null && (
        <div className="flex shrink-0 flex-col gap-1.5 md:items-end">
          <div className="flex items-center gap-2">
            <b className="text-3xl font-semibold leading-none tracking-tight tabular-nums">{b.rating.toFixed(1)}</b>
            <Stars value={b.rating} size="h-[18px] w-[18px]" />
          </div>
          <span className="inline-flex items-center gap-2 text-base text-muted-foreground">
            <EngineMark id="google" label="Google" size={18} />
            Reviews <span className="font-medium text-foreground tabular-nums">({b.reviewCount?.toLocaleString() ?? 0})</span>
          </span>
        </div>
      )}
      {report?.score != null && (
        // Brand blue and plain words, not a red alarm: this sums up a to-do list,
        // and the findings below already say what matters most.
        <div className="flex shrink-0 items-center gap-4 rounded-xl bg-muted/50 py-3 pl-3 pr-5">
          <ScoreRing score={report.score} size={80} stroke={7} ringClass="stroke-brand" showMax />
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              Profile health
              <InfoHint>
                FreeSERP&apos;s weighted checklist of {report.checks.length} checks across the profile, reviews, photos, website and local
                rankings, out of 100. It isn&apos;t a score Google publishes.
              </InfoHint>
            </div>
            <div className="mt-0.5 text-lg font-semibold leading-tight">{verdict(report.score)}</div>
            {data.previous?.score != null && data.previous.score !== report.score && (
              <div className="mt-0.5 text-xs text-muted-foreground">
                {report.score > data.previous.score ? "Up" : "Down"} {Math.abs(report.score - data.previous.score)} since {fmtDay(data.previous.createdAt)}
              </div>
            )}
            {report.findings.length > 0 &&
              (onOpenPlan ? (
                <button type="button" onClick={onOpenPlan} className="mt-1.5 text-[13px] font-medium text-brand hover:underline print:no-underline">
                  {report.findings.length} {report.findings.length === 1 ? "thing" : "things"} to improve →
                </button>
              ) : (
                <div className="mt-1.5 text-[13px] text-muted-foreground">
                  {report.findings.length} {report.findings.length === 1 ? "thing" : "things"} to improve
                </div>
              ))}
          </div>
        </div>
      )}
    </section>
  )
}

/** The header's buttons: a quiet outline, and one brand-blue primary. */
export const heroButton =
  "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[7px] border border-border bg-card px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
export const heroButtonPrimary =
  "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[7px] border border-brand bg-brand px-3 text-[13px] font-medium text-white transition-colors hover:bg-brand-deep disabled:opacity-60"

/** While the audit runs: the three steps, with the current one spinning. */
export function Progress({ step }: { step: AuditStep | null }) {
  const at = step ? STEPS.findIndex((s) => s.key === step) : 0
  return (
    <Panel title="Auditing this profile" hint="This page updates by itself. Most audits finish in under a minute.">
      <ol className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((s, i) => {
          const done = i < at
          const current = i === at
          return (
            <li key={s.key} className={`rounded-lg border p-3.5 ${current ? "border-brand/40 bg-brand-soft/50" : "border-border"}`}>
              <div className="flex items-center gap-2">
                {done ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : current ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand/25 border-t-brand" />
                ) : (
                  <CircleDashed className="h-4 w-4 text-muted-foreground/50" />
                )}
                <span className="text-xs text-muted-foreground">Step {i + 1}</span>
              </div>
              <div className={`mt-2 text-[13px] font-medium ${done || current ? "" : "text-muted-foreground"}`}>{s.label}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{s.hint}</div>
            </li>
          )
        })}
      </ol>
    </Panel>
  )
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

export type TabKey = "overview" | "profile" | "reviews" | "rankings" | "plan"
export const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "profile", label: "Profile audit" },
  { key: "reviews", label: "Reviews" },
  { key: "rankings", label: "Rankings" },
  { key: "plan", label: "Action plan" },
]

export function Tabs({ active, onChange, counts }: { active: TabKey; onChange: (t: TabKey) => void; counts: Partial<Record<TabKey, number>> }) {
  return (
    <nav className="flex gap-6 overflow-x-auto overflow-y-hidden border-b border-border [scrollbar-width:none] print:hidden [&::-webkit-scrollbar]:hidden" role="tablist">
      {TABS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={active === key}
          onClick={() => onChange(key)}
          className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 py-2.5 text-sm font-medium transition-colors ${
            active === key ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {label}
          {counts[key] ? <span className="rounded-[5px] bg-muted px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">{counts[key]}</span> : null}
        </button>
      ))}
    </nav>
  )
}

// ── Overview ─────────────────────────────────────────────────────────────────

const rankLabel = (vis: NonNullable<Facts["visibility"]>) => (vis.rank !== null ? `#${vis.rank}` : `${vis.depth}+`)

export function Overview({ data, report, onOpen, printing = false }: { data: GbpAuditResponse; report: Report; onOpen: (t: TabKey) => void; printing?: boolean }) {
  const facts = data.facts!
  const b = facts.business
  const vis = facts.visibility
  const grid = facts.grid
  const m = grid?.metrics
  const rs = report.reviewStats
  const by = (p: Priority) => report.findings.filter((f) => f.priority === p).length
  const issues = [by("high") > 0 && <span key="h" className="text-red-500">{by("high")} high</span>, by("medium") > 0 && `${by("medium")} medium`, by("low") > 0 && `${by("low")} low`].filter(Boolean)
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Owner replies"
          hint={`Of the ${rs.sampled} newest reviews, how many the owner has replied to. Replies show searchers, and Google, that the business is active.`}
          value={rs.responseRate !== null ? `${Math.round(rs.responseRate * 100)}%` : "—"}
          tone="text-foreground"
          caption={rs.sampled ? `${rs.replied} of ${rs.sampled} newest reviews` : "No reviews to read"}
          fill={rs.responseRate !== null ? rs.responseRate * 100 : null}
          fillClass={rs.responseRate !== null ? scoreFill(rs.responseRate * 100) : undefined}
        />
        <StatCard
          label={vis ? `Rank for “${vis.keyword}”` : "Local rank"}
          hint="Where the business ranks on Google Maps for the keyword, searched from its own location. 20+ means it isn't in the top 20."
          value={vis ? rankLabel(vis) : "—"}
          tone={vis?.rank != null && vis.rank <= 3 ? "text-green-600 dark:text-green-400" : "text-foreground"}
          caption={vis ? "At the business’s location" : "Ranking check didn't run"}
        />
        <StatCard
          label="Grid visibility"
          hint={`How visible the business is across the ${grid?.points.length ?? 9} grid points: top-3 spots count fully, lower ranks less.`}
          value={m?.visibility != null ? `${Math.round(m.visibility)}%` : "—"}
          tone="text-foreground"
          caption={m ? `Top 3 at ${m.top3Points} of ${m.scoredPoints} points` : "No grid for this audit"}
          fill={m?.visibility ?? null}
          fillClass={m?.visibility != null ? scoreFill(m.visibility) : undefined}
        />
        <StatCard
          label="Issues found"
          hint="Checks that failed or need attention, by how much they matter."
          value={report.findings.length}
          tone="text-foreground"
          caption={issues.length ? issues.map((x, i) => [i > 0 && " · ", x]) : "Nothing to fix"}
        />
      </div>

      {/* Full width: the grid is the report's one picture, and squeezed beside
          another panel its nine points sat on top of each other. */}
      {grid ? (
        <>
          <GridPanel facts={facts} grid={grid} onOpen={() => onOpen("rankings")} />
          <RivalGrids facts={facts} />
        </>
      ) : (
        <Panel title="Local rank grid">
          <p className="text-[13px] text-muted-foreground">This audit was run before the rank grid existed, or the grid couldn&apos;t run. Run it again to add one.</p>
        </Panel>
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel
          title="Priority findings"
          hint="The issues that matter most, highest priority first."
          meta={
            <button type="button" className={LINK} onClick={() => onOpen("profile")}>
              All {report.checks.length} checks
            </button>
          }
          flush
          className="xl:col-span-2"
        >
          {report.findings.length === 0 ? (
            <p className="p-4 text-[13px] text-muted-foreground">Nothing to fix — every check we could run passed.</p>
          ) : (
            <div className="divide-y divide-border">
              {report.findings.slice(0, 5).map((f) => (
                <CheckRow key={f.id} check={f} />
              ))}
            </div>
          )}
        </Panel>
        <div className="space-y-5">
          <CategoryHealth report={report} />
          <ProfileFacts facts={facts} />
          <Strengths report={report} />
        </div>
      </div>

      <HeadToHead facts={facts} onOpenAll={() => onOpen("rankings")} />

      {!printing && <Plan plan={report.plan} />}
    </div>
  )
}

function CategoryHealth({ report }: { report: Report }) {
  return (
    <Panel title="Health by category" hint="Each category's checks, weighted. Anything we couldn't verify is left out rather than counted against you.">
      <ul className="space-y-4">
        {report.categories.map((c) => {
          const toFix = c.failed + c.warned
          return (
            <li key={c.key}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
                <span className="font-medium">{c.label}</span>
                <span className="flex items-baseline gap-2">
                  <span className="text-xs text-muted-foreground">{toFix ? `${toFix} to fix` : "All clear"}</span>
                  <span className={`w-7 text-right font-semibold tabular-nums ${c.score !== null ? scoreText(c.score) : "text-muted-foreground"}`}>{c.score ?? "—"}</span>
                </span>
              </div>
              {c.score !== null ? <Bar value={c.score} fill={scoreFill(c.score)} /> : <span className="block h-1.5 rounded-full bg-muted" />}
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

function Strengths({ report }: { report: Report }) {
  if (report.strengths.length === 0) return null
  return (
    <Panel title="Strengths" hint="The checks this profile already passes that count the most.">
      <ul className="space-y-2 text-[13px]">
        {report.strengths.slice(0, 5).map((s) => (
          <li key={s.id} className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-[13px] w-[13px] shrink-0 text-green-600 dark:text-green-400" />
            <span>
              {s.label} <span className="text-muted-foreground">· {s.value}</span>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function ProfileFacts({ facts }: { facts: Facts }) {
  const b = facts.business
  const today = b.hours?.[(new Date(facts.fetchedAt).getDay() + 6) % 7]
  const short = (d: string) => DAY_LABEL[d as keyof typeof DAY_LABEL].slice(0, 3)
  const missing = (text: string) => <span className="text-red-500">{text}</span>
  return (
    <Panel
      title="Profile"
      meta={
        b.mapsUrl && (
          <ExtLink href={b.mapsUrl} className="text-[13px] font-medium text-brand print:hidden">
            Open on Maps
          </ExtLink>
        )
      }
    >
      <KeyValues
        rows={[
          ["Categories", b.category ? 1 + b.additionalCategories.length : missing("None")],
          ["Photos", (b.totalPhotos ?? 0) >= 50 ? (b.totalPhotos ?? 0) : missing(String(b.totalPhotos ?? 0))],
          ["Attributes", b.attributes.reduce((n, g) => n + g.items.length, 0)],
          ["Hours", !b.hours ? missing("Not set") : today ? (today.open.length ? `${short(today.day)} ${today.open.join(", ")}` : `Closed ${short(today.day)}`) : "Set"],
          ["Description", b.description ? `${b.description.length} chars` : missing("None")],
        ]}
      />
    </Panel>
  )
}

// ── The rank grid ────────────────────────────────────────────────────────────

/** The grid with its headline numbers beside it. `large` is the Rankings tab's version, with every point listed. */
function GridPanel({ facts, grid, onOpen, large = false, className = "" }: { facts: Facts; grid: Grid; onOpen?: () => void; large?: boolean; className?: string }) {
  const [selected, setSelected] = useState<string | null>(null)
  const shared = useContext(SharedReportContext)
  const m = grid.metrics
  return (
    <Panel
      title={`Your business · “${grid.keyword}”`}
      hint={`A ${grid.gridSize}×${grid.gridSize} Google Maps Tracker scan: the keyword searched on Google Maps from ${grid.points.length} points around the business. Click a pin to see who ranks there.`}
      meta={
        <>
          {grid.scanId && !shared && (
            <Link href={`/dashboard/google-maps-tracker/${grid.scanId}`} className={LINK}>
              Open in Maps Tracker
            </Link>
          )}
          {onOpen && (
            <button type="button" className={LINK} onClick={onOpen}>
              Details
            </button>
          )}
        </>
      }
      className={className}
    >
      <div className={`grid gap-5 ${large ? "lg:grid-cols-[minmax(0,1fr)_320px]" : "md:grid-cols-[minmax(0,1fr)_300px]"}`}>
        <RankGridView grid={grid} unit={unitFor(facts.business)} selected={selected} onSelect={setSelected} size={large ? "lg" : "md"} />
        <div className="min-w-0 space-y-4">
          <KeyValues
            rows={[
              ["Visibility", m.visibility !== null ? `${Math.round(m.visibility)}%` : "—"],
              ["Top 3 at", `${m.top3Points} of ${m.scoredPoints} points`],
              ["Found at", `${m.foundPoints} of ${m.scoredPoints} points`],
              ["Avg. rank where found", m.arp !== null ? m.arp.toFixed(1) : "—"],
            ]}
          />
          <PointDetail grid={grid} pointKey={selected} />
          {large && <PointList grid={grid} selected={selected} onSelect={setSelected} />}
        </div>
      </div>
    </Panel>
  )
}

/** The Maps Tracker keyword the audit's grid is, so its competitor leaderboard can be read. */
function useScanKeywordId(scanId: string | null | undefined, keyword: string | undefined) {
  const [id, setId] = useState<string | null>(null)
  useEffect(() => {
    if (!scanId) return
    let cancelled = false
    api
      .get<{ scan: Scan }>(`/api/maps-tracker/scans/${scanId}`)
      .then(({ scan }) => {
        if (cancelled) return
        const k = scan.keywords.find((x) => x.normalizedKeyword === keyword) ?? scan.keywords[0]
        setId(k?.id ?? null)
      })
      .catch(() => {
        // Non-fatal: the report reads fine without the competitors' grids.
      })
    return () => {
      cancelled = true
    }
  }, [scanId, keyword])
  return id
}

/**
 * The three nearest competitors, each on their own 3×3 from the same nine
 * points as the business's grid. Read from the grid's Maps Tracker scan, which
 * already holds every point's full result list, so nothing new is searched.
 */
function RivalGrids({ facts }: { facts: Facts }) {
  const grid = facts.grid
  // On the public page the grids arrive with the report: a visitor can't ask Maps Tracker.
  const shared = useContext(SharedReportContext)
  const keywordId = useScanKeywordId(shared ? null : grid?.scanId, grid?.keyword)
  const fetched = useCompetitors(shared ? null : (grid?.scanId ?? null), keywordId, !shared && !!grid?.scanId)
  const leaderboard = shared ? (shared.leaderboard ?? null) : fetched.leaderboard
  const loading = shared ? false : fetched.loading
  if (!grid?.scanId) return null

  const unit = unitFor(facts.business)
  const rivals = mapsResults(facts)
    .filter((r) => !r.isTarget)
    .slice(0, 3)
    .map((r) => {
      const row = leaderboard ? findLeaderboardRow(leaderboard.rows, r) : null
      return { result: r, grid: row && leaderboard ? rivalGrid(grid, leaderboard.points, row) : null }
    })
  if (rivals.length === 0 || (!loading && !leaderboard)) return null

  return (
    <Panel
      title="Your top 3 competitors on the grid"
      hint={`Where each of your three nearest competitors ranks for “${grid.keyword}” from the same ${grid.points.length} points as your grid. Read from the grid’s Maps Tracker scan, so nothing new is searched.`}
      meta={
        !shared && (
          <Link href={`/dashboard/google-maps-tracker/${grid.scanId}`} className={LINK}>
            Compare in Maps Tracker
          </Link>
        )
      }
    >
      <div className="grid gap-5 lg:grid-cols-3">
        {rivals.map(({ result: r, grid: g }) => (
          <div key={`${r.rank}-${r.title}`} className="min-w-0">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground" title={r.title}>
                  {r.title}
                </div>
                <div className="text-xs text-muted-foreground">#{r.rank} at your location</div>
              </div>
              {g && g.metrics.visibility !== null && (
                <div className="shrink-0 text-right">
                  <div className="text-[15px] font-semibold tabular-nums">{Math.round(g.metrics.visibility)}%</div>
                  <div className="text-[11px] text-muted-foreground">visibility</div>
                </div>
              )}
            </div>
            {g ? (
              <>
                <RankGridView grid={g} unit={unit} selected={null} onSelect={() => {}} size="sm" legend={false} />
                <div className="mt-2 flex justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    Top 3 at <b className="font-medium text-foreground">{g.metrics.top3Points}</b> of {g.metrics.scoredPoints}
                  </span>
                  <span>
                    Avg. rank <b className="font-medium text-foreground">{g.metrics.arp !== null ? g.metrics.arp.toFixed(1) : "—"}</b>
                  </span>
                </div>
              </>
            ) : loading ? (
              <div className="h-[250px] animate-pulse rounded-xl bg-muted" aria-label="Loading" />
            ) : (
              <p className="grid h-[250px] place-items-center rounded-xl border border-dashed border-border px-6 text-center text-xs text-muted-foreground">
                Not found in this grid&apos;s results.
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4">
        <RankLegend spacing={formatDistance(grid.spacingMeters, unit)} />
      </div>
    </Panel>
  )
}

function PointList({ grid, selected, onSelect }: { grid: Grid; selected: string | null; onSelect: (k: string) => void }) {
  const ordered = [...grid.points].sort((a, b) => a.row - b.row || a.col - b.col)
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
      {ordered.map((p) => {
        const c = rankColor(p.rank, p.status)
        const k = gridPointKey(p)
        const leader = p.top[0]
        return (
          <li key={k}>
            <button type="button" onClick={() => onSelect(k)} className={`flex w-full items-center gap-3 px-3 py-[7px] text-left text-[13px] transition-colors hover:bg-muted ${selected === k ? "bg-muted" : ""}`}>
              <span className="flex h-5 w-8 shrink-0 items-center justify-center rounded text-[11px] font-semibold" style={{ background: c.bg, color: c.fg }}>
                {c.label}
              </span>
              <span className="w-24 shrink-0">{pointPlace(p.row, p.col, grid.gridSize)}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{leader ? (leader.isTarget ? "You lead here" : `#1 ${leader.title}`) : "—"}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// ── Profile audit ────────────────────────────────────────────────────────────

export function ProfileAudit({ facts, report }: { facts: Facts; report: Report }) {
  const b = facts.business
  const count = (s: CheckStatus) => report.checks.filter((c) => c.status === s).length
  return (
    <div className="grid items-start gap-5 xl:grid-cols-3">
      <div className="space-y-5 xl:col-span-2">
        {report.categories.map((cat) => (
          <Panel
            key={cat.key}
            title={cat.label}
            meta={
              <>
                <span>
                  {cat.passed} passed · {cat.warned + cat.failed} to fix
                </span>
                <span className={`text-[15px] font-semibold tabular-nums ${cat.score !== null ? scoreText(cat.score) : ""}`}>{cat.score ?? "—"}</span>
              </>
            }
            flush
          >
            <div className="divide-y divide-border">
              {report.checks
                .filter((c) => c.category === cat.key)
                .map((c) => (
                  <CheckRow key={c.id} check={c} showPriority={false} />
                ))}
            </div>
          </Panel>
        ))}
      </div>

      <div className="space-y-5">
        <Panel
          title="Score"
          hint="Each check counts by its weight: passed in full, needs attention as half, failed as nothing. Categories weigh Profile 30, Reviews 25, Local visibility 20, Photos 15, Website 10. FreeSERP's checklist, not a score Google publishes."
        >
          <div className="flex items-center gap-5">
            {report.score !== null && <ScoreRing score={report.score} size={76} stroke={7} />}
            <div className="flex-1">
              <KeyValues rows={(["pass", "warn", "fail", "unknown"] as const).map((s) => [<span key={s} className={STATUS_STYLE[s].tone}>{STATUS_LABEL[s]}</span>, count(s)])} />
            </div>
          </div>
        </Panel>

        <Panel title="Opening hours">
          {b.hours ? (
            <KeyValues rows={b.hours.map((d) => [DAY_LABEL[d.day], d.open.length ? d.open.join(", ") : <span className="text-red-500">Closed</span>])} />
          ) : (
            <p className="text-[13px] text-muted-foreground">No opening hours on the profile.</p>
          )}
        </Panel>

        <Panel title="Categories & attributes">
          <div className="space-y-3.5 text-[13px]">
            <div className="flex flex-wrap gap-1.5">
              {b.category ? <Tag primary>{b.category}</Tag> : <span className="text-muted-foreground">No category set</span>}
              {b.additionalCategories.map((c) => (
                <Tag key={c}>{c}</Tag>
              ))}
            </div>
            {b.attributes.map((g) => (
              <div key={g.group}>
                <div className="mb-1.5 text-xs text-muted-foreground">{g.group}</div>
                <div className="flex flex-wrap gap-1.5">
                  {g.items.map((i) => (
                    <Tag key={i}>{i}</Tag>
                  ))}
                </div>
              </div>
            ))}
            {b.description && <p className="leading-relaxed text-muted-foreground">{b.description}</p>}
          </div>
        </Panel>
      </div>
    </div>
  )
}

function Tag({ children, primary = false }: { children: ReactNode; primary?: boolean }) {
  return <span className={`rounded-[5px] px-2 py-0.5 text-xs ${primary ? "bg-brand-soft font-medium text-brand" : "bg-muted"}`}>{children}</span>
}

// ── Reviews ──────────────────────────────────────────────────────────────────

export function Reviews({ facts, report }: { facts: Facts; report: Report }) {
  const b = facts.business
  const s = report.reviewStats
  const dist = b.ratingDistribution
  const total = dist ? Object.values(dist).reduce((n, v) => n + v, 0) : 0
  const reviews = facts.reviews?.items ?? []
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Rating"
          hint="The average star rating Google shows."
          value={b.rating?.toFixed(1) ?? "—"}
          tone="text-foreground"
          caption={`${b.reviewCount?.toLocaleString() ?? 0} reviews`}
          fill={b.rating !== null ? (b.rating / 5) * 100 : null}
          fillClass="bg-amber-400"
        />
        <StatCard
          label="Owner replies"
          hint={`Of the ${s.sampled} newest reviews, how many have a reply from the owner.`}
          value={s.responseRate !== null ? `${Math.round(s.responseRate * 100)}%` : "—"}
          tone="text-foreground"
          caption={`${s.replied} of ${s.sampled} newest`}
          fill={s.responseRate !== null ? s.responseRate * 100 : null}
        />
        <StatCard
          label="Newest review"
          hint="How long ago the most recent review was left."
          value={s.daysSinceNewest !== null ? (s.daysSinceNewest === 0 ? "Today" : `${s.daysSinceNewest}d`) : "—"}
          tone="text-foreground"
          caption={s.newestAt ? fmtDay(s.newestAt) : "—"}
        />
        <StatCard
          label="Low ratings"
          hint={`Reviews of 3★ or lower among the ${s.sampled} newest, and how many have no reply.`}
          value={s.negative}
          tone={s.negativeUnanswered > 0 ? "text-red-500" : "text-foreground"}
          caption={`${s.negativeUnanswered} without a reply`}
        />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-3">
        <Panel title="Rating breakdown" hint="How the stars are spread, as Google shows it.">
          {dist && total > 0 ? (
            <div className="space-y-2.5">
              {(["5", "4", "3", "2", "1"] as const).map((k) => (
                <div key={k} className="flex items-center gap-3 text-[13px]">
                  <span className="w-6 text-muted-foreground">{k}★</span>
                  <span className="flex-1">
                    <Bar value={(dist[k] / total) * 100} fill="bg-amber-400" />
                  </span>
                  <span className="w-10 text-right tabular-nums text-muted-foreground">{dist[k]}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">Google didn&apos;t return the rating breakdown for this profile.</p>
          )}
          {b.placeTopics.length > 0 && (
            <div className="mt-5 border-t border-border pt-4">
              <div className="mb-2 text-xs text-muted-foreground">What reviewers mention</div>
              <div className="flex flex-wrap gap-1.5">
                {b.placeTopics.slice(0, 12).map((t) => (
                  <Tag key={t.topic}>
                    {t.topic} <span className="text-muted-foreground">{t.count}</span>
                  </Tag>
                ))}
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Newest reviews" hint="Low ratings without a reply are marked." flush className="xl:col-span-2">
          {reviews.length === 0 ? (
            <p className="p-4 text-[13px] text-muted-foreground">No reviews were returned for this profile.</p>
          ) : (
            <div className="divide-y divide-border">
              {reviews.map((r, i) => (
                <ReviewRow key={i} review={r} />
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}

function ReviewRow({ review: r }: { review: Review }) {
  const needsReply = r.rating !== null && r.rating <= 3 && !r.ownerAnswer
  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
        <b className="font-medium">{r.author ?? "A Google user"}</b>
        {r.rating !== null && <Stars value={r.rating} />}
        <span className="text-xs text-muted-foreground">{r.timeAgo ?? (r.publishedAt ? fmtDay(r.publishedAt) : "")}</span>
        <span className={`ml-auto text-xs ${r.ownerAnswer ? "text-green-600 dark:text-green-400" : needsReply ? "font-medium text-red-500" : "text-muted-foreground"}`}>
          {r.ownerAnswer ? "Replied" : needsReply ? "Needs a reply" : "No reply"}
        </span>
      </div>
      {r.text && <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{r.text}</p>}
      {r.ownerAnswer && (
        <p className="mt-1.5 border-l-2 border-border pl-3 text-[13px] leading-relaxed text-muted-foreground">
          <b className="font-medium text-foreground">Owner: </b>
          {r.ownerAnswer}
        </p>
      )}
    </div>
  )
}

// ── Rankings & competitors ───────────────────────────────────────────────────

// ── You vs your top three ────────────────────────────────────────────────────

export function HeadToHead({ facts, onOpenAll }: { facts: Facts; onOpenAll?: () => void }) {
  const { you, rivals, scored } = contenders(facts)
  if (rivals.length === 0) return null
  const all = [you, ...rivals]
  const keyword = facts.visibility?.keyword
  const rows: { label: string; hint?: string; values: (c: Contender) => ReactNode; best?: number | null; num?: (c: Contender) => number | null }[] = [
    {
      label: "Rank here",
      hint: keyword ? `Position on Google Maps for “${keyword}”, searched from your business’s location.` : undefined,
      num: (c) => c.rank,
      best: bestOf(all.map((c) => c.rank), true),
      values: (c) => (c.rank !== null ? `#${c.rank}` : `${facts.visibility?.depth ?? 20}+`),
    },
    ...(scored
      ? [
          {
            label: "Top 3 across the area",
            hint: `In how many of the ${scored} grid points around you they show in the top 3.`,
            num: (c: Contender) => c.top3,
            best: bestOf(all.map((c) => c.top3)),
            values: (c: Contender) => (c.top3 !== null ? `${c.top3} of ${scored}` : "—"),
          },
        ]
      : []),
    {
      label: "Rating",
      num: (c) => c.rating,
      best: bestOf(all.map((c) => c.rating)),
      values: (c) =>
        c.rating !== null ? (
          <span className="inline-flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
            {c.rating.toFixed(1)}
          </span>
        ) : (
          "—"
        ),
    },
    {
      label: "Reviews",
      num: (c) => c.reviews,
      best: bestOf(all.map((c) => c.reviews)),
      values: (c) => c.reviews?.toLocaleString() ?? "—",
    },
    { label: "Category", values: (c) => <span className="text-muted-foreground">{c.category ?? "—"}</span> },
    {
      label: "Website",
      values: (c) =>
        c.website ? (
          <ExtLink href={c.website} className="text-brand">
            {hostOf(c.website)}
          </ExtLink>
        ) : (
          <span className="text-red-500">None</span>
        ),
    },
  ]
  return (
    <Panel
      title="You vs your top 3 competitors"
      hint={keyword ? `The three businesses closest to you for “${keyword}” on Google Maps, side by side. The best in each row is marked.` : undefined}
      meta={
        onOpenAll && (
          <button type="button" className={LINK} onClick={onOpenAll}>
            All results
          </button>
        )
      }
      flush
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] table-fixed border-collapse text-[13px]">
          <colgroup>
            <col className="w-44" />
            {all.map((c) => (
              <col key={c.name} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="border-b border-border px-4 py-3" />
              {all.map((c) => (
                <th key={c.name} className={`border-b border-border px-3 py-3 text-left align-bottom font-normal ${c.you ? "bg-brand/5" : ""}`}>
                  <div className="flex min-w-0 items-center gap-2">
                    {c.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element -- Google-hosted photo
                      <img src={c.photo} alt="" referrerPolicy="no-referrer" className="h-8 w-8 shrink-0 rounded-md object-cover ring-1 ring-border" />
                    ) : (
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-muted text-[11px] font-semibold text-muted-foreground" aria-hidden>
                        {initials(c.name)}
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-medium" title={c.name}>
                        {c.name}
                      </div>
                      <div className="text-xs text-muted-foreground">{c.you ? <span className="font-medium text-brand">You</span> : c.rank !== null ? `#${c.rank} here` : "Competitor"}</div>
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="px-4 py-2.5 text-left font-normal text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    {row.label}
                    {row.hint && <InfoHint>{row.hint}</InfoHint>}
                  </span>
                </th>
                {all.map((c) => {
                  const lead = row.num && row.best != null && row.num(c) === row.best
                  return (
                    <td key={c.name} className={`truncate px-3 py-2.5 tabular-nums ${c.you ? "bg-brand/5" : ""} ${lead ? "font-semibold text-green-700 dark:text-green-400" : ""}`}>
                      {row.values(c)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-1.5 border-t border-border px-4 py-3 text-[13px]">
        {gaps(you, rivals, scored).map((g) => (
          <li key={g} className="flex gap-2 text-muted-foreground">
            <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground" aria-hidden />
            <span>{g}</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

const TH = "whitespace-nowrap border-b border-border px-2 py-2.5 text-left text-xs font-medium text-muted-foreground first:pl-4 last:pr-4"
const TD = "px-2 py-2.5 align-middle first:pl-4 last:pr-4"

function CompetitorTable({ rows, business }: { rows: CompetitorRow[]; business: Business }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-[13px]">
        <thead>
          <tr>
            <th className={`${TH} w-14`}>Rank</th>
            <th className={TH}>Business</th>
            <th className={`${TH} w-[72px] text-right`}>Rating</th>
            <th className={`${TH} w-[88px] text-right`}>Reviews</th>
            <th className={TH}>Category</th>
            <th className={TH}>Website</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => {
            const c = rankColor(r.rank, "SUCCEEDED")
            const more = r.reviewCount !== null && business.reviewCount !== null && !r.isTarget && r.reviewCount > business.reviewCount
            return (
              <tr key={`${r.rank}-${r.title}`} className={r.isTarget ? "bg-brand/5" : "hover:bg-muted/60"}>
                <td className={TD}>
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold" style={{ background: c.bg, color: c.fg }}>
                    {r.rank}
                  </span>
                </td>
                <td className={`${TD} max-w-[320px]`}>
                  <div className="truncate font-medium">
                    {r.title}
                    {r.isTarget && <span className="ml-1.5 rounded bg-brand px-1.5 align-[1px] text-[10px] font-semibold text-white">You</span>}
                  </div>
                  {r.address && <div className="truncate text-xs text-muted-foreground">{r.address}</div>}
                </td>
                <td className={`${TD} text-right tabular-nums`}>{r.rating !== null ? r.rating.toFixed(1) : "—"}</td>
                <td className={`${TD} text-right tabular-nums ${more ? "text-red-500" : ""}`}>{r.reviewCount?.toLocaleString() ?? "—"}</td>
                <td className={`${TD} text-muted-foreground`}>{r.category ?? "—"}</td>
                <td className={TD}>
                  {r.website ? (
                    <ExtLink href={r.website} className="text-brand">
                      {hostOf(r.website)}
                    </ExtLink>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function Rankings({
  facts,
  report,
  onCheckKeyword,
  checking,
  printing = false,
}: {
  facts: Facts
  report: Report
  onCheckKeyword?: (keyword: string) => void
  checking?: boolean
  /** In the full-report print the grids and the comparison are already in the Overview. */
  printing?: boolean
}) {
  const vis = facts.visibility
  const b = facts.business
  const c = report.competitors
  const rows = mapsResults(facts)
  const shared = useContext(SharedReportContext)
  const fewerReviews = c.medianReviews !== null && b.reviewCount !== null && b.reviewCount < c.medianReviews
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={vis ? `Rank for “${vis.keyword}”` : "Local rank"}
          hint="Searched on Google Maps from the business's own location."
          value={vis ? rankLabel(vis) : "—"}
          tone="text-foreground"
          caption="At the business"
        />
        <StatCard
          label="Reviews"
          hint="This profile's reviews against the median of the businesses ranking around it."
          value={b.reviewCount?.toLocaleString() ?? "—"}
          tone={fewerReviews ? "text-red-500" : "text-foreground"}
          caption={`Median nearby: ${c.medianReviews?.toLocaleString() ?? "—"}`}
        />
        <StatCard
          label="Rating"
          hint="This profile's rating against the average of the businesses ranking around it."
          value={b.rating?.toFixed(1) ?? "—"}
          tone="text-foreground"
          caption={`Average nearby: ${c.avgRating?.toFixed(1) ?? "—"}`}
        />
        <StatCard
          label="Top category nearby"
          hint="The category most of the businesses ranking around it use."
          value={<span className="text-[22px]">{c.topCategory?.name ?? "—"}</span>}
          tone="text-foreground"
          caption={c.topCategory ? `${c.topCategory.count} of ${c.rows.length} competitors` : "Not enough data"}
        />
      </div>

      {printing ? null : facts.grid ? (
        <>
          <GridPanel facts={facts} grid={facts.grid} large />
          <RivalGrids facts={facts} />
        </>
      ) : (
        <Notice>The rank grid didn&apos;t run for this audit. Run it again to add one.</Notice>
      )}

      {onCheckKeyword && <KeywordForm current={facts.grid?.keyword ?? vis?.keyword ?? ""} onSubmit={onCheckKeyword} busy={!!checking} />}

      {!printing && <HeadToHead facts={facts} />}

      <Panel title="Google Maps results" hint={vis ? `The top ${rows.length} results for “${vis.keyword}” at the business’s location. Ads are left out.` : undefined} flush>
        {rows.length ? <CompetitorTable rows={rows} business={b} /> : <p className="p-4 text-[13px] text-muted-foreground">No results to show.</p>}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        {!shared && (
        <Panel
          title="See the whole area"
          meta={
            <Link href="/dashboard/google-maps-tracker/new" className={LINK}>
              Open Maps Tracker
            </Link>
          }
        >
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            This audit runs a 3×3 grid 1 km apart. Google Maps Tracker scans up to 21×21, tracks it over time, and compares you with each competitor point by point.
          </p>
        </Panel>
        )}
        {b.peopleAlsoSearch.length > 0 && (
          <Panel title="People also search for" hint="Google's own list of related businesses." flush>
            <div className="divide-y divide-border">
              {b.peopleAlsoSearch.slice(0, 6).map((p) => (
                <div key={`${p.cid}-${p.title}`} className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-[13px]">
                  <span className="truncate">{p.title}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {p.rating !== null ? `${p.rating.toFixed(1)}★` : ""}
                    {p.reviewCount !== null ? ` · ${p.reviewCount.toLocaleString()}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </div>
  )
}

/** Re-run the grid for another keyword. The listing and reviews come from the cache, so only the grid is charged. */
function KeywordForm({ current, onSubmit, busy }: { current: string; onSubmit: (keyword: string) => void; busy: boolean }) {
  const [value, setValue] = useState("")
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const v = value.trim()
    if (v && v.toLowerCase() !== current.toLowerCase()) onSubmit(v)
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-[10px] border border-border bg-card px-4 py-3 shadow-sm sm:flex-row sm:items-center print:hidden">
      <div className="min-w-0 flex-1 text-[13px]">
        <b className="font-medium">Check another keyword</b>
        <span className="text-muted-foreground">
          {" "}
          · the profile and reviews are reused from the {CACHE_DAYS}-day cache; the new keyword runs as a 3×3 Maps Tracker scan (3 credits)
        </span>
      </div>
      <div className="flex gap-2">
        <input
          className="h-8 w-full rounded-[7px] border border-border bg-background px-2.5 text-[13px] outline-none focus:border-brand sm:w-56"
          placeholder={current ? `Instead of “${current}”` : "e.g. helmet shop"}
          aria-label="Another keyword to check"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={80}
        />
        <button type="submit" disabled={busy || !value.trim()} className={heroButtonPrimary}>
          {busy ? "Starting…" : "Check"}
        </button>
      </div>
    </form>
  )
}

// ── Action plan ──────────────────────────────────────────────────────────────

export function Plan({ plan }: { plan: PlanPhase[] }) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {plan.map((p, i) => (
        <Panel
          key={p.window}
          title={
            <span className="inline-flex items-center">
              <span className="mr-2 inline-grid h-5 w-5 place-items-center rounded-full bg-brand text-[11px] font-semibold text-white">{i + 1}</span>
              {p.title}
            </span>
          }
          meta={p.window}
        >
          <ul className="space-y-2">
            {p.items.map((item) => (
              <li key={item} className="flex gap-2.5 text-[13px] leading-relaxed text-muted-foreground">
                <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </Panel>
      ))}
    </div>
  )
}

/**
 * True while the whole report is laid out for printing. Print / PDF turns it on
 * and waits for the maps that mount to draw; the browser's own print (Ctrl+P)
 * turns it on in beforeprint, synchronously, so the dialog sees every section.
 */
export function usePrintAll() {
  const [printAll, setPrintAll] = useState(false)
  useEffect(() => {
    const before = () => flushSync(() => setPrintAll(true))
    const after = () => setPrintAll(false)
    window.addEventListener("beforeprint", before)
    window.addEventListener("afterprint", after)
    return () => {
      window.removeEventListener("beforeprint", before)
      window.removeEventListener("afterprint", after)
    }
  }, [])
  const print = () => {
    setPrintAll(true)
    // Time for the maps that just mounted to load their tiles.
    setTimeout(() => window.print(), 1500)
  }
  return { printAll, print }
}

/**
 * The report body: the open tab on screen, every section in order when
 * printing, so a PDF is the whole report rather than whichever tab was open.
 */
export function ReportSections({
  data,
  tab,
  printAll,
  onOpen,
  onCheckKeyword,
  checking,
}: {
  data: GbpAuditResponse
  tab: TabKey
  printAll: boolean
  onOpen: (t: TabKey) => void
  onCheckKeyword?: (keyword: string) => void
  checking?: boolean
}) {
  const facts = data.facts!
  const report = data.report!
  const keys = printAll ? TABS.map((t) => t.key) : [tab]
  return (
    <>
      {keys.map((k, i) => (
        <section key={k} className={`space-y-5 ${printAll && i > 0 ? "print:break-before-page" : ""}`}>
          {printAll && <h2 className="hidden border-b border-border pb-2 text-xl font-semibold print:block">{TABS.find((t) => t.key === k)!.label}</h2>}
          {k === "overview" && <Overview data={data} report={report} onOpen={onOpen} printing={printAll} />}
          {k === "profile" && <ProfileAudit facts={facts} report={report} />}
          {k === "reviews" && <Reviews facts={facts} report={report} />}
          {k === "rankings" && <Rankings facts={facts} report={report} onCheckKeyword={onCheckKeyword} checking={checking} printing={printAll} />}
          {k === "plan" && <ActionPlan report={report} />}
        </section>
      ))}
    </>
  )
}

export function ActionPlan({ report }: { report: Report }) {
  const area = (k: Check["category"]) => report.categories.find((c) => c.key === k)?.label ?? ""
  return (
    <div className="space-y-5">
      <Plan plan={report.plan} />
      <Panel title="Every recommendation" hint="All findings, highest priority first." flush>
        {report.findings.length === 0 ? (
          <p className="p-4 text-[13px] text-muted-foreground">Nothing to fix — every check we could run passed.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className={TH}>Recommendation</th>
                  <th className={`${TH} w-40`}>Found</th>
                  <th className={`${TH} w-44`}>Area</th>
                  <th className={`${TH} w-[90px] text-right`}>Priority</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {report.findings.map((f) => (
                  <tr key={f.id} className="align-top">
                    <td className={TD}>
                      <div className="font-medium">{f.label}</div>
                      <div className="mt-0.5 leading-relaxed text-muted-foreground">{f.fix}</div>
                    </td>
                    <td className={`${TD} text-muted-foreground`}>{f.value}</td>
                    <td className={`${TD} text-muted-foreground`}>{area(f.category)}</td>
                    <td className={`${TD} text-right`}>
                      <PriorityBadge priority={f.priority} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}

/** Earlier audits of the same listing, to step back through. */
export function OtherAudits({ audits }: { audits: GbpAuditResponse["others"] }) {
  if (audits.length === 0) return null
  return (
    <Panel title="Earlier audits of this profile" flush>
      <div className="divide-y divide-border">
        {audits.map((a) => (
          <Link key={a.id} href={`/dashboard/google-maps-audit/${a.id}`} className="flex items-center justify-between gap-4 px-4 py-2.5 text-[13px] transition-colors hover:bg-muted">
            <span>{fmtDay(a.createdAt)}</span>
            <b className={`tabular-nums ${a.score !== null ? scoreText(a.score) : "text-muted-foreground"}`}>{a.score ?? "—"}</b>
          </Link>
        ))}
      </div>
    </Panel>
  )
}
