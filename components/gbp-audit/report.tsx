"use client"

// The Google Business Profile audit report, section by section. The navy hero,
// tinted KPI tiles and severity-edged rows give it the weight of a report you'd
// hand to a client; the grade colours and rings are the AEO / Page Audit ones
// (components/page-audit/audit-ui.tsx), and the rank grid is Maps Tracker's, so
// it still reads as one product.
import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import Link from "next/link"
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  CalendarClock,
  Camera,
  CheckCircle2,
  CircleDashed,
  Clock,
  Database,
  ExternalLink,
  Globe,
  Grid3x3,
  LayoutDashboard,
  ListChecks,
  MapPin,
  MessageSquareText,
  Phone,
  Search,
  Sparkles,
  Star,
  Store,
  Tag,
  Target,
  Trophy,
  Users,
  XCircle,
} from "lucide-react"
import { gradeStroke, sectionScoreToGrade } from "@/components/page-audit/audit-ui"
import { rankColor, type DistanceUnit } from "@/components/maps-tracker/grid"
import { PointDetail, RankGridView, gridPointKey } from "@/components/gbp-audit/rank-grid"
import {
  CACHE_DAYS,
  DAY_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  STEPS,
  age,
  fmtDay,
  hostOf,
  initials,
  pointPlace,
  verdict,
  type AuditStep,
  type Business,
  type CategoryKey,
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

type Tone = { tile: string; bar: string }
const TONES = {
  blue: { tile: "bg-blue-500/10 text-blue-600 dark:text-blue-400", bar: "bg-blue-500" },
  amber: { tile: "bg-amber-500/10 text-amber-600 dark:text-amber-400", bar: "bg-amber-400" },
  green: { tile: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" },
  rose: { tile: "bg-rose-500/10 text-rose-600 dark:text-rose-400", bar: "bg-rose-500" },
  violet: { tile: "bg-violet-500/10 text-violet-600 dark:text-violet-400", bar: "bg-violet-500" },
  cyan: { tile: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400", bar: "bg-cyan-500" },
} satisfies Record<string, Tone>

const CATEGORY_STYLE: Record<CategoryKey, { icon: typeof Star; tone: Tone }> = {
  profile: { icon: Store, tone: TONES.blue },
  reviews: { icon: Star, tone: TONES.amber },
  content: { icon: Camera, tone: TONES.violet },
  website: { icon: Globe, tone: TONES.cyan },
  visibility: { icon: Trophy, tone: TONES.green },
}

const STATUS_STYLE: Record<CheckStatus, { Icon: typeof Star; tone: string; soft: string; edge: string }> = {
  pass: { Icon: CheckCircle2, tone: "text-emerald-600 dark:text-emerald-400", soft: "bg-emerald-500/10", edge: "border-l-emerald-500" },
  warn: { Icon: AlertTriangle, tone: "text-amber-600 dark:text-amber-400", soft: "bg-amber-500/10", edge: "border-l-amber-500" },
  fail: { Icon: XCircle, tone: "text-red-500", soft: "bg-red-500/10", edge: "border-l-red-500" },
  unknown: { Icon: CircleDashed, tone: "text-muted-foreground", soft: "bg-muted", edge: "border-l-border" },
}

const PRIORITY_STYLE: Record<Priority, string> = {
  high: "bg-red-500/10 text-red-600 ring-red-500/25 dark:text-red-400",
  medium: "bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-400",
  low: "bg-muted text-muted-foreground ring-border",
}

const AVATAR_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#0d9488", "#4f46e5", "#0891b2", "#65a30d", "#c026d3"]
const avatarColor = (s: string) => AVATAR_COLORS[[...s].reduce((n, ch) => n + ch.charCodeAt(0), 0) % AVATAR_COLORS.length]!

/** Distance in the business's own units: miles in the US and UK, km elsewhere. */
export const unitFor = (b: Business): DistanceUnit => (b.countryCode && ["US", "GB", "LR", "MM"].includes(b.countryCode) ? "IMPERIAL" : "METRIC")

// ── Building blocks ──────────────────────────────────────────────────────────

/** A report section: a rounded card with a tinted icon, a title, a line of context and an optional right-hand slot. */
export function Panel({
  icon: Icon,
  tone = TONES.blue,
  title,
  hint,
  right,
  children,
  className = "",
}: {
  icon: typeof Star
  tone?: Tone
  title: ReactNode
  hint?: ReactNode
  right?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(15,23,42,.04)] ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone.tile}`}>
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
            {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
          </div>
        </div>
        {right}
      </header>
      {children}
    </section>
  )
}

/** Something wrong, said plainly: a failed audit. */
export function Alarm({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-foreground">
      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
      <span>{children}</span>
    </p>
  )
}

/** A heads-up that isn't a failure of the audit: a step that didn't run. */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-foreground">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
      <span>{children}</span>
    </p>
  )
}

function Bar({ value, className = "h-2" }: { value: number; className?: string }) {
  const fill = gradeStroke(sectionScoreToGrade(value)).replaceAll("stroke-", "bg-")
  return (
    <span className={`block overflow-hidden rounded-full bg-muted ${className}`} aria-hidden>
      <span className={`block h-full rounded-full transition-all duration-700 ${fill}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </span>
  )
}

/** A score out of 100 as a ring. `onDark` draws it for the navy hero. */
export function ScoreRing({ score, size = 112, stroke = 10, onDark = false }: { score: number; size?: number; stroke?: number; onDark?: boolean }) {
  const [filled, setFilled] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setFilled(true), 60)
    return () => clearTimeout(t)
  }, [])
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const grade = sectionScoreToGrade(score)
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} className={onDark ? "stroke-white/15" : "stroke-muted"} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - ((filled ? score : 0) / 100) * c}
          className={`transition-all duration-1000 ease-out ${gradeStroke(grade)}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className={`font-bold tabular-nums ${onDark ? "text-white" : scoreText(score)}`} style={{ fontSize: Math.round(size * 0.3) }}>
          {score}
        </span>
        <span className={`mt-1 text-[11px] ${onDark ? "text-white/60" : "text-muted-foreground"}`}>/100</span>
      </div>
    </div>
  )
}

function Stars({ value, className = "h-3.5 w-3.5", muted = "text-muted-foreground/30" }: { value: number; className?: string; muted?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`${className} ${value >= i - 0.25 ? "fill-amber-400 text-amber-400" : value >= i - 0.75 ? "fill-amber-400/50 text-amber-400" : muted}`} />
      ))}
    </span>
  )
}

function StatusTile({ status }: { status: CheckStatus }) {
  const { Icon, tone, soft } = STATUS_STYLE[status]
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${soft} ${tone}`} title={STATUS_LABEL[status]}>
      <Icon className="h-4 w-4" />
    </span>
  )
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${PRIORITY_STYLE[priority]}`}>
      {PRIORITY_LABEL[priority]}
    </span>
  )
}

function Delta({ from, to }: { from?: number | null; to: number }) {
  if (from == null || from === to) return null
  const up = to > from
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${up ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500"}`}>
      <Icon className="h-3 w-3" />
      {Math.abs(to - from)}
    </span>
  )
}

/** The listing's photo, or a monogram when Google has none (or it fails to load). */
function BusinessTile({ business, size = 48, className = "" }: { business: Business; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false)
  const src = business.logo ?? business.mainImage
  if (src && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Google-hosted photo, not ours to optimise
      <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className={`shrink-0 rounded-2xl object-cover ${className}`} style={{ width: size, height: size }} />
    )
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-2xl font-bold tracking-tight text-white ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34), background: avatarColor(business.name) }}
      aria-hidden
    >
      {initials(business.name)}
    </div>
  )
}

function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ width: size, height: size, background: avatarColor(name) }} aria-hidden>
      {initials(name)}
    </span>
  )
}

const ExtLink = ({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className={`hover:underline ${className}`}>
    {children}
  </a>
)

// ── Hero and progress ────────────────────────────────────────────────────────

/** The top of the report: who was audited, the score, and the report's actions, on a navy band. */
export function ReportHero({ data, actions }: { data: GbpAuditResponse; actions?: ReactNode }) {
  const { audit, facts, report } = data
  const b = facts?.business
  const photo = b?.mainImage ?? b?.logo
  const keyword = facts?.grid?.keyword ?? facts?.visibility?.keyword ?? audit.keyword
  const cachedFrom = facts?.sources?.profile.cached ? facts.sources.profile.fetchedAt : null
  return (
    <section className="relative mb-5 overflow-hidden rounded-2xl bg-[#0c1f38] text-white shadow-[0_18px_40px_-24px_rgba(12,31,56,.9)]">
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element -- decorative backdrop from Google's CDN
        <img src={photo} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-md" />
      )}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-[#0c1f38]/95 via-[#102b52]/90 to-[#1e40af]/85" />
      <div aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-sky-400/20 blur-3xl" />

      <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
          {b ? (
            <BusinessTile business={b} size={84} className="ring-4 ring-white/20" />
          ) : (
            <div className="flex h-[84px] w-[84px] shrink-0 items-center justify-center rounded-2xl bg-white/10">
              <Store className="h-8 w-8 text-white/70" />
            </div>
          )}
          <div className="min-w-0 space-y-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-300">Google Business Profile audit</div>
            <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-[28px]">{b?.name ?? audit.name ?? "Reading the profile…"}</h1>
            {b && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {b.rating !== null && (
                  <span className="inline-flex items-center gap-1.5">
                    <Stars value={b.rating} className="h-4 w-4" muted="text-white/25" />
                    <b>{b.rating.toFixed(1)}</b>
                    <span className="text-white/70">({b.reviewCount?.toLocaleString() ?? 0} reviews)</span>
                  </span>
                )}
                {b.category && <HeroChip icon={Tag}>{b.category}</HeroChip>}
                {b.isClaimed === true && (
                  <HeroChip icon={BadgeCheck} className="bg-emerald-400/15 text-emerald-200 ring-emerald-300/30">
                    Claimed
                  </HeroChip>
                )}
                {b.isClaimed === false && (
                  <HeroChip icon={AlertTriangle} className="bg-red-400/15 text-red-200 ring-red-300/30">
                    Unclaimed
                  </HeroChip>
                )}
                {keyword && <HeroChip icon={Search}>Keyword: {keyword}</HeroChip>}
              </div>
            )}
            {b && (
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-white/75">
                {b.address && (
                  <span className="inline-flex items-start gap-1.5">
                    <MapPin className="mt-px h-3.5 w-3.5 shrink-0 text-sky-300" /> {b.address}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-sky-300" /> {b.phone ?? <span className="text-red-300">No phone number</span>}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-sky-300" />
                  {b.website ? <ExtLink href={b.website}>{hostOf(b.website)}</ExtLink> : <span className="text-red-300">No website</span>}
                </span>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/55">
              <span>Audited {fmtDay(audit.createdAt)}</span>
              {audit.status === "COMPLETED" && audit.seconds !== null && <span>· finished in {audit.seconds}s</span>}
              {cachedFrom && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-white/80">
                  <Database className="h-3 w-3" /> Google data from {age(cachedFrom)} (cached)
                </span>
              )}
            </div>
          </div>
        </div>

        {report?.score != null && (
          <div className="flex items-center gap-4 rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/10 backdrop-blur-sm lg:flex-col lg:gap-2 lg:px-6">
            <ScoreRing score={report.score} size={116} onDark />
            <div className="lg:text-center">
              <div className="text-[11px] uppercase tracking-wider text-white/60">Profile health</div>
              <div className="text-sm font-semibold">{verdict(report.score)}</div>
              {data.previous?.score != null && data.previous.score !== report.score && (
                <div className="mt-1 text-[11px] text-white/60">
                  <Delta from={data.previous.score} to={report.score} /> vs {fmtDay(data.previous.createdAt)}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {actions && <div className="relative flex flex-wrap gap-2 border-t border-white/10 bg-black/10 px-5 py-3 sm:px-7 print:hidden">{actions}</div>}
    </section>
  )
}

function HeroChip({ icon: Icon, children, className = "bg-white/10 text-white/90 ring-white/15" }: { icon: typeof Star; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${className}`}>
      <Icon className="h-3 w-3" /> {children}
    </span>
  )
}

/** The hero's buttons: glassy on navy. */
export const heroButton =
  "inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/20 disabled:opacity-60"
export const heroButtonPrimary =
  "inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[#0c1f38] transition-colors hover:bg-sky-50 disabled:opacity-60"

/** While the audit runs: the three steps, with the current one spinning. */
export function Progress({ step }: { step: AuditStep | null }) {
  const at = step ? STEPS.findIndex((s) => s.key === step) : 0
  return (
    <Panel icon={Clock} title="Auditing this profile" hint="This page updates by itself. Most audits finish in under a minute.">
      <ol className="grid gap-3 p-5 sm:grid-cols-3">
        {STEPS.map((s, i) => {
          const done = i < at
          const current = i === at
          return (
            <li key={s.key} className={`rounded-xl border p-4 ${current ? "border-brand/40 bg-brand-soft/50" : "border-border"}`}>
              <div className="flex items-center gap-2">
                {done ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : current ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand/25 border-t-brand" />
                ) : (
                  <CircleDashed className="h-5 w-5 text-muted-foreground/50" />
                )}
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Step {i + 1}</span>
              </div>
              <div className={`mt-2 text-sm font-medium ${done || current ? "" : "text-muted-foreground"}`}>{s.label}</div>
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
export const TABS: { key: TabKey; label: string; icon: typeof Star }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "profile", label: "Profile audit", icon: ListChecks },
  { key: "reviews", label: "Reviews", icon: MessageSquareText },
  { key: "rankings", label: "Rankings & grid", icon: Grid3x3 },
  { key: "plan", label: "Action plan", icon: Target },
]

export function Tabs({ active, onChange, counts }: { active: TabKey; onChange: (t: TabKey) => void; counts: Partial<Record<TabKey, number>> }) {
  return (
    <div className="mb-1 flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 print:hidden" role="tablist">
      {TABS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={active === key}
          onClick={() => onChange(key)}
          className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors ${
            active === key ? "bg-[#0c1f38] text-white shadow-sm dark:bg-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Icon className="h-4 w-4" />
          {label}
          {counts[key] ? (
            <span className={`rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums ${active === key ? "bg-white/20 text-white" : "bg-red-500/10 text-red-600"}`}>{counts[key]}</span>
          ) : null}
        </button>
      ))}
    </div>
  )
}

// ── Overview ─────────────────────────────────────────────────────────────────

function Kpi({ icon: Icon, tone, label, value, suffix, foot }: { icon: typeof Star; tone: Tone; label: string; value: ReactNode; suffix?: string; foot: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
      <div className="flex items-center gap-2.5">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone.tile}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-1 text-[30px] font-semibold leading-none tracking-tight tabular-nums">
        {value}
        {suffix && <span className="text-sm font-medium text-muted-foreground">{suffix}</span>}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{foot}</div>
      <span aria-hidden className={`absolute inset-x-0 bottom-0 h-1 ${tone.bar} opacity-80`} />
    </div>
  )
}

export function Overview({ data, report, onOpen }: { data: GbpAuditResponse; report: Report; onOpen: (t: TabKey) => void }) {
  const facts = data.facts!
  const b = facts.business
  const vis = facts.visibility
  const grid = facts.grid
  const by = (p: Priority) => report.findings.filter((f) => f.priority === p).length
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={ListChecks}
          tone={TONES.blue}
          label="Profile health"
          value={report.score ?? "—"}
          suffix={report.score !== null ? "/100" : undefined}
          foot={report.score !== null ? <span className={`font-medium ${scoreText(report.score)}`}>{verdict(report.score)}</span> : "Not scored"}
        />
        <Kpi
          icon={Star}
          tone={TONES.amber}
          label="Google rating"
          value={b.rating !== null ? b.rating.toFixed(1) : "—"}
          suffix={b.rating !== null ? "/5" : undefined}
          foot={
            <span className="inline-flex items-center gap-1.5">
              {b.rating !== null && <Stars value={b.rating} className="h-3 w-3" />}
              {b.reviewCount !== null ? `${b.reviewCount.toLocaleString()} reviews` : "No reviews"}
            </span>
          }
        />
        <Kpi
          icon={Trophy}
          tone={TONES.green}
          label={vis ? `Rank for “${vis.keyword}”` : "Local rank"}
          value={vis ? (vis.rank !== null ? `#${vis.rank}` : `${vis.depth}+`) : "—"}
          foot={grid ? `Top 3 at ${grid.metrics.top3Points} of ${grid.metrics.scoredPoints} grid points` : vis ? "At the business’s location" : "Ranking check didn't run"}
        />
        <Kpi
          icon={AlertTriangle}
          tone={TONES.rose}
          label="Issues found"
          value={report.findings.length}
          foot={
            <span className="inline-flex flex-wrap gap-1.5">
              <PriorityPill n={by("high")} p="high" />
              <PriorityPill n={by("medium")} p="medium" />
              <PriorityPill n={by("low")} p="low" />
            </span>
          }
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {grid ? (
          <GridPanel facts={facts} grid={grid} onOpen={() => onOpen("rankings")} />
        ) : (
          <Panel icon={Grid3x3} tone={TONES.green} title="Local rank grid" hint="Run the audit again to add a 3×3 rank grid">
            <p className="p-5 text-sm text-muted-foreground">This audit was run before the rank grid existed, or the grid couldn&apos;t run.</p>
          </Panel>
        )}
        <CategoryHealth report={report} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel
          icon={AlertTriangle}
          tone={TONES.rose}
          title="Priority findings"
          hint="The issues that matter most, first"
          right={
            <button type="button" className="text-xs font-semibold text-brand hover:underline print:hidden" onClick={() => onOpen("profile")}>
              All {report.checks.length} checks →
            </button>
          }
        >
          {report.findings.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">Nothing to fix — every check we could run passed.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {report.findings.slice(0, 5).map((f) => (
                <FindingRow key={f.id} check={f} />
              ))}
            </ul>
          )}
        </Panel>
        <div className="space-y-5">
          <ProfileSnapshot facts={facts} />
          <Strengths report={report} />
        </div>
      </div>

      {report.competitors.rows.length > 0 && (
        <Panel
          icon={Users}
          tone={TONES.violet}
          title="Competitor snapshot"
          hint={vis ? `Who ranks for “${vis.keyword}” at the business’s location` : undefined}
          right={
            <button type="button" className="text-xs font-semibold text-brand hover:underline print:hidden" onClick={() => onOpen("rankings")}>
              Compare all →
            </button>
          }
        >
          <CompetitorTable rows={snapshotRows(facts)} business={b} />
        </Panel>
      )}

      <Plan plan={report.plan} />
    </div>
  )
}

function PriorityPill({ n, p }: { n: number; p: Priority }) {
  if (n === 0) return null
  return <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset ${PRIORITY_STYLE[p]}`}>{n} {PRIORITY_LABEL[p].toLowerCase()}</span>
}

function CategoryHealth({ report }: { report: Report }) {
  return (
    <Panel icon={ListChecks} tone={TONES.blue} title="Audit health by category" hint="What couldn't be verified is left out, not counted against you">
      <ul className="space-y-1 p-3">
        {report.categories.map((c) => {
          const { icon: Icon, tone } = CATEGORY_STYLE[c.key]
          const toFix = c.failed + c.warned
          return (
            <li key={c.key} className="rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/40">
              <div className="flex items-center gap-3">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone.tile}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-medium">{c.label}</span>
                    <span className={`text-sm font-bold tabular-nums ${c.score !== null ? scoreText(c.score) : "text-muted-foreground"}`}>{c.score ?? "—"}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    {c.score !== null ? <Bar value={c.score} className="h-1.5 flex-1" /> : <span className="block h-1.5 flex-1 rounded-full bg-muted" />}
                    <span className="w-14 shrink-0 text-right text-[11px] text-muted-foreground">{toFix ? `${toFix} to fix` : "All clear"}</span>
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

function FindingRow({ check }: { check: Check }) {
  return (
    <li className={`flex items-start gap-3 border-l-[3px] px-5 py-3.5 ${STATUS_STYLE[check.status].edge}`}>
      <StatusTile status={check.status} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[13px] font-semibold">{check.label}</span>
          <span className="text-xs text-muted-foreground">{check.value}</span>
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{check.detail}</p>
        {check.fix && (
          <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs leading-relaxed text-foreground/85">
            <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-brand" /> {check.fix}
          </p>
        )}
      </div>
      <PriorityBadge priority={check.priority} />
    </li>
  )
}

function Strengths({ report }: { report: Report }) {
  if (report.strengths.length === 0) return null
  return (
    <Panel icon={CheckCircle2} tone={TONES.green} title="Strengths" hint="Already working for this profile">
      <ul className="space-y-2 p-4">
        {report.strengths.slice(0, 5).map((s) => (
          <li key={s.id} className="flex items-start gap-2.5 text-xs">
            <CheckCircle2 className="mt-px h-4 w-4 shrink-0 text-emerald-500" />
            <span>
              <b className="font-semibold">{s.label}</b> <span className="text-muted-foreground">· {s.value}</span>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function ProfileSnapshot({ facts }: { facts: Facts }) {
  const b = facts.business
  const today = b.hours?.[(new Date(facts.fetchedAt).getDay() + 6) % 7]
  const chips: { label: string; ok: boolean }[] = [
    { label: b.website ? "Website" : "No website", ok: !!b.website },
    { label: b.phone ? "Phone" : "No phone", ok: !!b.phone },
    { label: b.hours ? "Hours set" : "No hours", ok: !!b.hours },
    { label: `${b.totalPhotos ?? 0} photos`, ok: (b.totalPhotos ?? 0) >= 10 },
    { label: `${b.attributes.reduce((n, g) => n + g.items.length, 0)} attributes`, ok: b.attributes.length > 0 },
  ]
  return (
    <Panel
      icon={Store}
      tone={TONES.cyan}
      title="Profile snapshot"
      hint="As Google shows it"
      right={
        b.mapsUrl && (
          <ExtLink href={b.mapsUrl} className="inline-flex items-center gap-1 text-xs font-semibold text-brand print:hidden">
            Open on Maps <ExternalLink className="h-3 w-3" />
          </ExtLink>
        )
      }
    >
      <div className="space-y-1.5 p-4 text-xs text-muted-foreground">
        {b.category && (
          <div className="flex items-center gap-2">
            <Tag className="h-3.5 w-3.5 shrink-0" /> <span className="text-foreground">{[b.category, ...b.additionalCategories.slice(0, 2)].join(" · ")}</span>
          </div>
        )}
        {today && (
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 shrink-0" /> {DAY_LABEL[today.day]}: <span className="text-foreground">{today.open.length ? today.open.join(", ") : "Closed"}</span>
          </div>
        )}
        {b.description && <p className="line-clamp-3 pt-1 leading-relaxed">{b.description}</p>}
      </div>
      <div className="flex flex-wrap gap-1.5 border-t border-border/60 px-4 py-3">
        {chips.map((c) => (
          <span
            key={c.label}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${c.ok ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-400" : "bg-red-500/10 text-red-600 ring-red-500/20 dark:text-red-400"}`}
          >
            {c.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />} {c.label}
          </span>
        ))}
      </div>
    </Panel>
  )
}

// ── The rank grid ────────────────────────────────────────────────────────────

/** The grid with its headline numbers beside it. `large` is the Rankings tab's version, with every point listed. */
function GridPanel({ facts, grid, onOpen, large = false }: { facts: Facts; grid: Grid; onOpen?: () => void; large?: boolean }) {
  const [selected, setSelected] = useState<string | null>(null)
  const m = grid.metrics
  const unit = unitFor(facts.business)
  const stats: { label: string; value: string; hint: string }[] = [
    { label: "Visibility", value: m.visibility !== null ? `${Math.round(m.visibility)}%` : "—", hint: "100% = #1 everywhere" },
    { label: "Top 3 coverage", value: `${m.top3Points}/${m.scoredPoints}`, hint: "points in the local pack" },
    { label: "Avg. rank", value: m.arp !== null ? m.arp.toFixed(1) : "—", hint: "where found" },
    { label: "Found at", value: `${m.foundPoints}/${m.scoredPoints}`, hint: `points in the top ${grid.depth}` },
  ]
  return (
    <Panel
      icon={Grid3x3}
      tone={TONES.green}
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          Local rank grid
          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">“{grid.keyword}”</span>
        </span>
      }
      hint={`${grid.gridSize}×${grid.gridSize} Google Maps Tracker scan · the keyword searched from ${grid.points.length} points around the business`}
      right={
        <div className="flex items-center gap-3 print:hidden">
          {grid.scanId && (
            <Link href={`/dashboard/google-maps-tracker/${grid.scanId}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
              <MapPin className="h-3.5 w-3.5" /> Open in Maps Tracker
            </Link>
          )}
          {onOpen && (
            <button type="button" className="text-xs font-semibold text-brand hover:underline" onClick={onOpen}>
              Open grid →
            </button>
          )}
        </div>
      }
    >
      <div className={`grid gap-5 p-5 ${large ? "lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" : "md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]"}`}>
        <RankGridView grid={grid} unit={unit} selected={selected} onSelect={setSelected} size={large ? "lg" : "md"} />
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl bg-muted/50 px-3 py-2.5">
                <div className="text-xl font-semibold tabular-nums">{s.value}</div>
                <div className="text-[11px] font-medium">{s.label}</div>
                <div className="text-[10px] text-muted-foreground">{s.hint}</div>
              </div>
            ))}
          </div>
          <PointDetail grid={grid} pointKey={selected} />
          {large && <PointList grid={grid} selected={selected} onSelect={setSelected} />}
          {!large && <p className="text-[11px] text-muted-foreground">Click a pin on the map to see who ranks there.</p>}
        </div>
      </div>
    </Panel>
  )
}

function PointList({ grid, selected, onSelect }: { grid: Grid; selected: string | null; onSelect: (k: string) => void }) {
  const ordered = [...grid.points].sort((a, b) => a.row - b.row || a.col - b.col)
  return (
    <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border">
      {ordered.map((p) => {
        const c = rankColor(p.rank, p.status)
        const k = gridPointKey(p)
        const leader = p.top[0]
        return (
          <li key={k}>
            <button type="button" onClick={() => onSelect(k)} className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/40 ${selected === k ? "bg-brand-soft/60" : ""}`}>
              <span className="flex h-6 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold" style={{ background: c.bg, color: c.fg }}>
                {c.label}
              </span>
              <span className="w-28 shrink-0 font-medium">{pointPlace(p.row, p.col, grid.gridSize)}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{leader ? `#1 ${leader.isTarget ? "You" : leader.title}` : "—"}</span>
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
  const counts = (s: CheckStatus) => report.checks.filter((c) => c.status === s).length
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        {report.categories.map((cat) => {
          const checks = report.checks.filter((c) => c.category === cat.key)
          const { icon, tone } = CATEGORY_STYLE[cat.key]
          return (
            <Panel
              key={cat.key}
              icon={icon}
              tone={tone}
              title={cat.label}
              hint={`${cat.passed} passed · ${cat.warned} need attention · ${cat.failed} failed`}
              right={
                cat.score !== null ? (
                  <span className={`rounded-xl bg-muted/60 px-3 py-1 text-lg font-bold tabular-nums ${scoreText(cat.score)}`}>{cat.score}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">Not scored</span>
                )
              }
            >
              <ul className="divide-y divide-border/60">
                {checks.map((c) => (
                  <li key={c.id} className={`flex items-start gap-3 border-l-[3px] px-5 py-3.5 ${STATUS_STYLE[c.status].edge}`}>
                    <StatusTile status={c.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="text-[13px] font-semibold">{c.label}</span>
                        <span className="max-w-full truncate text-xs font-medium text-muted-foreground">{c.value}</span>
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{c.detail}</p>
                      {c.fix && (
                        <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs leading-relaxed text-foreground/85">
                          <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-brand" /> {c.fix}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )
        })}
      </div>

      <div className="space-y-5">
        <Panel icon={ListChecks} tone={TONES.blue} title="How the score works">
          <div className="flex flex-col items-center gap-3 p-5">
            {report.score !== null && <ScoreRing score={report.score} size={128} />}
            <p className="text-center text-xs text-muted-foreground">FreeSERP&apos;s weighted checklist — not a score Google publishes</p>
            <div className="grid w-full grid-cols-2 gap-2">
              {(["pass", "warn", "fail", "unknown"] as const).map((s) => {
                const { Icon, tone, soft } = STATUS_STYLE[s]
                return (
                  <div key={s} className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 ${soft}`}>
                    <Icon className={`h-4 w-4 ${tone}`} />
                    <div>
                      <div className={`text-lg font-bold leading-none tabular-nums ${tone}`}>{counts(s)}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{STATUS_LABEL[s]}</div>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Each check counts by its weight: passed in full, needs attention as half, failed as nothing. Categories are weighted
              Profile 30, Reviews 25, Local visibility 20, Photos 15, Website 10. Anything we couldn&apos;t get is left out.
            </p>
          </div>
        </Panel>

        <Panel icon={CalendarClock} tone={TONES.cyan} title="Opening hours">
          {b.hours ? (
            <table className="w-full text-xs">
              <tbody>
                {b.hours.map((d) => (
                  <tr key={d.day} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-2 font-medium">{DAY_LABEL[d.day]}</td>
                    <td className={`px-5 py-2 text-right ${d.open.length ? "text-muted-foreground" : "text-red-500"}`}>{d.open.length ? d.open.join(", ") : "Closed"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-5 py-4 text-xs text-muted-foreground">No opening hours on the profile.</p>
          )}
        </Panel>

        <Panel icon={Tag} tone={TONES.violet} title="Categories & attributes">
          <div className="space-y-4 p-5 text-xs">
            <div>
              <div className="mb-2 font-semibold">Categories</div>
              <div className="flex flex-wrap gap-1.5">
                {b.category && <span className="rounded-full bg-brand px-2.5 py-1 font-medium text-white">{b.category}</span>}
                {b.additionalCategories.map((c) => (
                  <span key={c} className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                    {c}
                  </span>
                ))}
                {!b.category && <span className="text-muted-foreground">None set</span>}
              </div>
            </div>
            {b.attributes.map((g) => (
              <div key={g.group}>
                <div className="mb-2 font-semibold">{g.group}</div>
                <div className="flex flex-wrap gap-1.5">
                  {g.items.map((i) => (
                    <span key={i} className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                      {i}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {b.description && (
              <div>
                <div className="mb-2 font-semibold">Description</div>
                <p className="leading-relaxed text-muted-foreground">{b.description}</p>
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  )
}

// ── Reviews ──────────────────────────────────────────────────────────────────

export function Reviews({ facts, report }: { facts: Facts; report: Report }) {
  const b = facts.business
  const s = report.reviewStats
  const dist = b.ratingDistribution
  const total = dist ? Object.values(dist).reduce((n, v) => n + v, 0) : 0
  const reviews = facts.reviews?.items ?? []
  const activity = [
    { icon: MessageSquareText, tone: TONES.blue, label: "Owner replies", value: s.responseRate !== null ? `${Math.round(s.responseRate * 100)}%` : "—", sub: `${s.replied} of ${s.sampled} newest` },
    { icon: CalendarClock, tone: TONES.green, label: "Newest review", value: s.daysSinceNewest !== null ? (s.daysSinceNewest === 0 ? "Today" : `${s.daysSinceNewest}d ago`) : "—", sub: s.newestAt ? fmtDay(s.newestAt) : "—" },
    { icon: AlertTriangle, tone: TONES.rose, label: "Low ratings", value: String(s.negative), sub: `${s.negativeUnanswered} without a reply` },
    { icon: Star, tone: TONES.amber, label: "Recent average", value: s.sampleAverage?.toFixed(1) ?? "—", sub: "across the newest reviews" },
  ]
  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Panel icon={Star} tone={TONES.amber} title="Rating" hint="How the stars are spread, as Google shows it">
          <div className="flex flex-col gap-6 p-5 sm:flex-row sm:items-center">
            <div className="rounded-2xl bg-gradient-to-br from-amber-400/15 to-amber-400/5 px-6 py-5 text-center">
              <div className="text-5xl font-semibold tracking-tight tabular-nums">{b.rating?.toFixed(1) ?? "—"}</div>
              {b.rating !== null && <Stars value={b.rating} className="h-4 w-4" />}
              <div className="mt-1 text-xs text-muted-foreground">{b.reviewCount?.toLocaleString() ?? 0} reviews</div>
            </div>
            {dist && total > 0 ? (
              <div className="flex-1 space-y-2">
                {(["5", "4", "3", "2", "1"] as const).map((k) => (
                  <div key={k} className="flex items-center gap-2.5 text-xs">
                    <span className="flex w-7 items-center gap-0.5 text-muted-foreground">
                      {k}
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    </span>
                    <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className={`block h-full rounded-full ${Number(k) >= 4 ? "bg-emerald-500" : k === "3" ? "bg-amber-400" : "bg-red-500"}`}
                        style={{ width: `${(dist[k] / total) * 100}%` }}
                      />
                    </span>
                    <span className="w-12 text-right tabular-nums text-muted-foreground">{dist[k]}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="flex-1 text-xs text-muted-foreground">Google didn&apos;t return the rating breakdown for this profile.</p>
            )}
          </div>
        </Panel>

        <Panel icon={MessageSquareText} tone={TONES.blue} title="Review activity" hint={s.sampled ? `From the ${s.sampled} newest reviews` : "No reviews to read"}>
          <div className="grid grid-cols-2 gap-3 p-5 lg:grid-cols-4">
            {activity.map(({ icon: Icon, tone, label, value, sub }) => (
              <div key={label} className="rounded-xl border border-border p-3">
                <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tone.tile}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="mt-2 text-xl font-semibold tabular-nums">{value}</div>
                <div className="text-[11px] font-medium">{label}</div>
                <div className="text-[11px] text-muted-foreground">{sub}</div>
              </div>
            ))}
          </div>
          {b.placeTopics.length > 0 && (
            <div className="border-t border-border/60 px-5 py-4">
              <div className="mb-2 text-xs font-semibold">What reviewers mention</div>
              <div className="flex flex-wrap gap-1.5">
                {b.placeTopics.slice(0, 12).map((t) => (
                  <span key={t.topic} className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
                    {t.topic} <b className="text-foreground/70">{t.count}</b>
                  </span>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>

      <Panel icon={MessageSquareText} tone={TONES.violet} title="Newest reviews" hint="Low ratings without a reply are highlighted">
        {reviews.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">No reviews were returned for this profile.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {reviews.map((r, i) => (
              <ReviewRow key={i} review={r} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

function ReviewRow({ review: r }: { review: Review }) {
  const needsReply = r.rating !== null && r.rating <= 3 && !r.ownerAnswer
  const name = r.author ?? "A Google user"
  return (
    <li className={`flex gap-3 px-5 py-4 ${needsReply ? "border-l-[3px] border-l-red-500 bg-red-500/[0.03]" : "border-l-[3px] border-l-transparent"}`}>
      <Avatar name={name} size={32} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="font-semibold">{name}</span>
          {r.localGuide && <span className="rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground">Local Guide</span>}
          {r.rating !== null && <Stars value={r.rating} className="h-3 w-3" />}
          <span className="text-muted-foreground">{r.timeAgo ?? (r.publishedAt ? fmtDay(r.publishedAt) : "")}</span>
          <span className="ml-auto">
            {r.ownerAnswer ? (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">Replied</span>
            ) : (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${needsReply ? "bg-red-500/10 text-red-600" : "bg-muted text-muted-foreground"}`}>
                {needsReply ? "Needs a reply" : "No reply"}
              </span>
            )}
          </span>
        </div>
        {r.text && <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-foreground/80">{r.text}</p>}
        {r.ownerAnswer && (
          <p className="mt-2 line-clamp-2 rounded-lg bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground/70">Owner: </span>
            {r.ownerAnswer}
          </p>
        )}
      </div>
    </li>
  )
}

// ── Rankings & competitors ───────────────────────────────────────────────────

/** The organic Maps results at the business's own location, the business itself included, best first. */
function mapsResults(facts: Facts): CompetitorRow[] {
  return (facts.visibility?.results ?? []).filter((r, i, all) => all.findIndex((x) => x.rank === r.rank) === i).slice(0, 20)
}

/** The top five, plus the business itself when it ranks below them. */
function snapshotRows(facts: Facts): CompetitorRow[] {
  const all = mapsResults(facts)
  const top = all.slice(0, 5)
  const target = all.find((r) => r.isTarget)
  return target && !top.includes(target) ? [...top, target] : top
}

function CompetitorTable({ rows, business }: { rows: CompetitorRow[]; business: Business }) {
  const maxReviews = Math.max(1, ...rows.map((r) => r.reviewCount ?? 0))
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="w-16 px-5 py-3 font-semibold">Rank</th>
            <th className="px-3 py-3 font-semibold">Business</th>
            <th className="px-3 py-3 font-semibold">Rating</th>
            <th className="w-44 px-3 py-3 font-semibold">Reviews</th>
            <th className="px-3 py-3 font-semibold">Category</th>
            <th className="px-5 py-3 font-semibold">Website</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const c = rankColor(r.rank, "SUCCEEDED")
            const more = r.reviewCount !== null && business.reviewCount !== null && !r.isTarget && r.reviewCount > business.reviewCount
            return (
              <tr key={`${r.rank}-${r.title}`} className={`border-b border-border/60 last:border-0 ${r.isTarget ? "bg-brand-soft/70" : "hover:bg-muted/30"}`}>
                <td className="px-5 py-3">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold shadow-sm" style={{ background: c.bg, color: c.fg }}>
                    {r.rank}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={r.title} />
                    <div className="min-w-0">
                      <div className="font-semibold">
                        {r.title}
                        {r.isTarget && <span className="ml-1.5 rounded bg-brand px-1.5 py-px text-[10px] font-bold text-white">YOU</span>}
                      </div>
                      {r.address && <div className="max-w-[260px] truncate text-[11px] text-muted-foreground">{r.address}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  {r.rating !== null ? (
                    <span className="inline-flex items-center gap-1 font-medium">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      {r.rating.toFixed(1)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-10 tabular-nums ${more ? "font-semibold text-red-500" : ""}`}>{r.reviewCount?.toLocaleString() ?? "—"}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <span className={`block h-full rounded-full ${r.isTarget ? "bg-brand" : "bg-slate-400 dark:bg-slate-500"}`} style={{ width: `${((r.reviewCount ?? 0) / maxReviews) * 100}%` }} />
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3 text-muted-foreground">{r.category ?? "—"}</td>
                <td className="px-5 py-3">
                  {r.website ? (
                    <ExtLink href={r.website} className="text-brand">
                      {hostOf(r.website)}
                    </ExtLink>
                  ) : (
                    <span className="text-muted-foreground">None</span>
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
}: {
  facts: Facts
  report: Report
  onCheckKeyword?: (keyword: string) => void
  checking?: boolean
}) {
  const vis = facts.visibility
  const b = facts.business
  const c = report.competitors
  const rows = mapsResults(facts)
  const compare = [
    { icon: Trophy, tone: TONES.green, label: vis ? `Rank for “${vis.keyword}”` : "Local rank", value: vis ? (vis.rank !== null ? `#${vis.rank}` : `${vis.depth}+`) : "—", sub: "searched at the business’s own pin" },
    { icon: MessageSquareText, tone: TONES.blue, label: "Reviews vs. competitors", value: `${b.reviewCount?.toLocaleString() ?? "—"}`, sub: `median nearby: ${c.medianReviews?.toLocaleString() ?? "—"}` },
    { icon: Star, tone: TONES.amber, label: "Rating vs. competitors", value: b.rating?.toFixed(1) ?? "—", sub: `average nearby: ${c.avgRating?.toFixed(1) ?? "—"}` },
    { icon: Tag, tone: TONES.violet, label: "Most-used category", value: c.topCategory?.name ?? "—", sub: c.topCategory ? `${c.topCategory.count} of ${c.rows.length} competitors` : "not enough data" },
  ]
  return (
    <div className="space-y-5">
      {onCheckKeyword && <KeywordForm current={facts.grid?.keyword ?? vis?.keyword ?? ""} onSubmit={onCheckKeyword} busy={!!checking} />}
      {facts.grid ? (
        <GridPanel facts={facts} grid={facts.grid} large />
      ) : (
        <Notice>The rank grid didn&apos;t run for this audit. Run it again to add one.</Notice>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {compare.map(({ icon: Icon, tone, label, value, sub }) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2.5">
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tone.tile}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-xs font-medium text-muted-foreground">{label}</span>
            </div>
            <div className="mt-2.5 truncate text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
          </div>
        ))}
      </div>

      <Panel icon={Users} tone={TONES.violet} title="Google Maps results" hint={vis ? `Top ${rows.length} for “${vis.keyword}” at the business’s location · ads excluded` : undefined}>
        {rows.length ? <CompetitorTable rows={rows} business={b} /> : <p className="px-5 py-8 text-sm text-muted-foreground">No results to show.</p>}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex items-start gap-3 rounded-2xl border border-brand/30 bg-gradient-to-br from-brand-soft to-card p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white shadow-sm">
            <Grid3x3 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold">See the whole area, not just the neighbourhood</div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              This audit runs a 3×3 grid 1 km apart. Google Maps Tracker scans up to 21×21, tracks it over time, and compares you with each competitor point by point.
            </p>
            <Link href="/dashboard/google-maps-tracker/new" className="mt-3 inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-deep print:hidden">
              Run a bigger grid in Maps Tracker →
            </Link>
          </div>
        </div>
        {b.peopleAlsoSearch.length > 0 && (
          <Panel icon={Users} tone={TONES.cyan} title="People also search for" hint="Google's own list of related businesses">
            <ul className="divide-y divide-border/60">
              {b.peopleAlsoSearch.slice(0, 6).map((p) => (
                <li key={`${p.cid}-${p.title}`} className="flex items-center gap-2.5 px-5 py-2.5 text-xs">
                  <Avatar name={p.title} size={24} />
                  <span className="min-w-0 flex-1 truncate font-medium">{p.title}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {p.rating !== null ? `${p.rating.toFixed(1)}★` : ""}
                    {p.reviewCount !== null ? ` · ${p.reviewCount.toLocaleString()}` : ""}
                  </span>
                </li>
              ))}
            </ul>
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
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center print:hidden">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
          <Search className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold">Check another keyword</div>
          <div className="text-xs text-muted-foreground">
            Now showing “{current}”. The profile and reviews are reused from the {CACHE_DAYS}-day cache; the new keyword runs as a 3×3 Maps Tracker scan (3 credits).
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <input
          className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-brand sm:w-64"
          placeholder="e.g. exporter in navi mumbai"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={80}
        />
        <button type="submit" disabled={busy || !value.trim()} className="h-9 shrink-0 rounded-lg bg-brand px-3 text-xs font-semibold text-white hover:bg-brand-deep disabled:opacity-50">
          {busy ? "Starting…" : "Check rank"}
        </button>
      </div>
    </form>
  )
}

// ── Action plan ──────────────────────────────────────────────────────────────

const PHASES = [
  { ring: "bg-brand text-white", edge: "from-brand/80 to-brand/10" },
  { ring: "bg-amber-500 text-white", edge: "from-amber-500/80 to-amber-500/10" },
  { ring: "bg-emerald-600 text-white", edge: "from-emerald-600/80 to-emerald-600/10" },
]

export function Plan({ plan }: { plan: PlanPhase[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {plan.map((p, i) => (
        <div key={p.window} className="relative overflow-hidden rounded-2xl border border-border bg-card p-5">
          <span aria-hidden className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${PHASES[i]?.edge ?? ""}`} />
          <div className="flex items-center gap-3">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${PHASES[i]?.ring ?? "bg-muted"}`}>{i + 1}</span>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{p.window}</div>
              <h3 className="text-sm font-semibold">{p.title}</h3>
            </div>
          </div>
          <ul className="mt-4 space-y-2.5">
            {p.items.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
                <span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-2 border-border" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export function ActionPlan({ report }: { report: Report }) {
  return (
    <div className="space-y-5">
      <Plan plan={report.plan} />
      <Panel icon={ListChecks} tone={TONES.rose} title="Every recommendation" hint="All findings, highest priority first">
        {report.findings.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">Nothing to fix — every check we could run passed.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3 font-semibold">Recommendation</th>
                  <th className="px-3 py-3 font-semibold">Found</th>
                  <th className="px-3 py-3 font-semibold">Area</th>
                  <th className="px-5 py-3 font-semibold">Priority</th>
                </tr>
              </thead>
              <tbody>
                {report.findings.map((f) => {
                  const { icon: Icon, tone } = CATEGORY_STYLE[f.category]
                  return (
                    <tr key={f.id} className="border-b border-border/60 align-top last:border-0 hover:bg-muted/30">
                      <td className="px-5 py-3">
                        <div className="font-semibold">{f.label}</div>
                        <div className="mt-0.5 leading-relaxed text-muted-foreground">{f.fix}</div>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{f.value}</td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone.tile}`}>
                          <Icon className="h-3 w-3" />
                          {report.categories.find((c) => c.key === f.category)?.label}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <PriorityBadge priority={f.priority} />
                      </td>
                    </tr>
                  )
                })}
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
    <Panel icon={CalendarClock} tone={TONES.cyan} title="Earlier audits of this profile">
      <ul className="divide-y divide-border/60">
        {audits.map((a) => (
          <li key={a.id}>
            <Link href={`/dashboard/google-maps-audit/${a.id}`} className="flex items-center justify-between gap-4 px-5 py-3 text-sm transition-colors hover:bg-muted/30">
              <span>{fmtDay(a.createdAt)}</span>
              <span className={`font-bold tabular-nums ${a.score !== null ? scoreText(a.score) : "text-muted-foreground"}`}>{a.score ?? "—"}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
