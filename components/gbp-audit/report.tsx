"use client"

// The Google Business Profile audit report, section by section. Drawn in the
// same language as the AEO and Page Audit reports (components/aeo/report.tsx,
// components/page-audit/audit-ui.tsx): rounded cards with an icon header, grade-
// coloured rings and bars, and severity badges — so the three read as one product.
import { useEffect, useState, type ReactNode } from "react"
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
  ExternalLink,
  Globe,
  Grid3x3,
  ListChecks,
  MapPin,
  MessageSquareText,
  Phone,
  Star,
  Store,
  Tag,
  Trophy,
  Users,
  XCircle,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { gradeColor, gradeStroke, sectionScoreToGrade } from "@/components/page-audit/audit-ui"
import {
  DAY_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  STEPS,
  fmtDay,
  hostOf,
  initials,
  type AuditStep,
  type Business,
  type CategoryKey,
  type Check,
  type CheckStatus,
  type CompetitorRow,
  type Facts,
  type GbpAuditResponse,
  type PlanPhase,
  type Priority,
  type Report,
  type Review,
} from "@/lib/gbp-audit"

// ── Building blocks ──────────────────────────────────────────────────────────

/** A report section: a rounded card with an icon, a title, a line of context and an optional right-hand slot. */
export function Panel({
  icon: Icon,
  title,
  hint,
  right,
  children,
  className = "",
}: {
  icon: typeof Star
  title: ReactNode
  hint?: ReactNode
  right?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`overflow-hidden rounded-xl border border-border bg-card ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-4 py-3.5">
        <div className="flex min-w-0 items-start gap-2.5">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h2 className="text-sm font-medium">{title}</h2>
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
    <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2.5 text-sm text-foreground">
      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
      <span>{children}</span>
    </p>
  )
}

/** A heads-up that isn't a failure of the audit: a step that didn't run. */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs text-foreground">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
      <span>{children}</span>
    </p>
  )
}

/** A thin bar out of 100 in its grade's colour. */
function Bar({ value, className = "" }: { value: number; className?: string }) {
  const fill = gradeStroke(sectionScoreToGrade(value)).replaceAll("stroke-", "bg-")
  return (
    <span className={`block h-1.5 overflow-hidden rounded-full bg-muted ${className}`} aria-hidden>
      <span className={`block h-full rounded-full transition-all duration-700 ${fill}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </span>
  )
}

/** A score out of 100 as a ring with the number inside, coloured by its grade like the other audit rings. */
export function ScoreRing({ score, size = 112, stroke = 9 }: { score: number; size?: number; stroke?: number }) {
  const [filled, setFilled] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setFilled(true), 50)
    return () => clearTimeout(t)
  }, [])
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const grade = sectionScoreToGrade(score)
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} className="stroke-border/40" strokeWidth={stroke} fill="none" />
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
        <span className={`font-mono font-bold ${gradeColor(grade)}`} style={{ fontSize: Math.round(size * 0.27) }}>
          {score}
        </span>
        {size >= 90 && <span className="mt-1 text-[11px] text-muted-foreground">/100</span>}
      </div>
    </div>
  )
}

function Stars({ value, className = "h-3.5 w-3.5" }: { value: number; className?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`${className} ${value >= i - 0.25 ? "fill-amber-400 text-amber-400" : value >= i - 0.75 ? "fill-amber-400/50 text-amber-400" : "text-muted-foreground/30"}`}
        />
      ))}
    </span>
  )
}

const STATUS_STYLE: Record<CheckStatus, { Icon: typeof Star; tone: string; soft: string }> = {
  pass: { Icon: CheckCircle2, tone: "text-green-600 dark:text-green-400", soft: "bg-green-500/10" },
  warn: { Icon: AlertTriangle, tone: "text-amber-600 dark:text-amber-400", soft: "bg-amber-500/10" },
  fail: { Icon: XCircle, tone: "text-red-500", soft: "bg-red-500/10" },
  unknown: { Icon: CircleDashed, tone: "text-muted-foreground", soft: "bg-muted" },
}

function StatusTile({ status }: { status: CheckStatus }) {
  const { Icon, tone, soft } = STATUS_STYLE[status]
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${soft} ${tone}`} title={STATUS_LABEL[status]}>
      <Icon className="h-4 w-4" />
    </span>
  )
}

const PRIORITY_STYLE: Record<Priority, string> = {
  high: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  low: "text-muted-foreground",
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <Badge variant="outline" className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide ${PRIORITY_STYLE[priority]}`}>
      {PRIORITY_LABEL[priority]}
    </Badge>
  )
}

/** A score's change since the previous audit of the same listing. Nothing when unchanged. */
function Delta({ from, to }: { from?: number | null; to: number }) {
  if (from == null || from === to) return null
  const up = to > from
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`inline-flex items-center text-xs font-medium tabular-nums ${up ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
      <Icon className="h-3.5 w-3.5" />
      {Math.abs(to - from)}
      <span className="sr-only"> {up ? "up" : "down"} from {from}</span>
    </span>
  )
}

/** The listing's photo, or a monogram when Google has none (or it fails to load). */
function BusinessTile({ business, size = 48 }: { business: Business; size?: number }) {
  const [broken, setBroken] = useState(false)
  const src = business.logo ?? business.mainImage
  if (src && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Google-hosted photo, not ours to optimise
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="shrink-0 rounded-xl border border-border object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-xl bg-[#10243a] font-bold tracking-tight text-white dark:bg-brand-soft dark:text-brand"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
      aria-hidden
    >
      {initials(business.name)}
    </div>
  )
}

const ExtLink = ({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className={`text-primary hover:underline ${className}`}>
    {children}
  </a>
)

// ── Header and progress ──────────────────────────────────────────────────────

/** The business bar: who was audited, where, and the report's actions. */
export function ReportHeader({ data, actions }: { data: GbpAuditResponse; actions?: ReactNode }) {
  const { audit, facts } = data
  const b = facts?.business
  const meta = [
    fmtDay(audit.createdAt),
    audit.status === "COMPLETED" && audit.seconds !== null ? `finished in ${audit.seconds}s` : null,
    audit.status === "FAILED" ? "failed" : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="mb-5 flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        {b ? (
          <BusinessTile business={b} />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Store className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wider text-brand">Google Business Profile audit</div>
          <h1 className="truncate text-lg font-semibold leading-tight tracking-tight">{b?.name ?? audit.name ?? "Reading the profile…"}</h1>
          <div className="truncate text-xs text-muted-foreground">
            {b?.address ? `${b.address} · ` : ""}
            {meta}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {b && (
          <>
            {b.isClaimed === true && (
              <Badge variant="outline" className="gap-1 border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400">
                <BadgeCheck className="h-3 w-3" /> Claimed
              </Badge>
            )}
            {b.isClaimed === false && (
              <Badge variant="outline" className="gap-1 border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400">
                <AlertTriangle className="h-3 w-3" /> Unclaimed
              </Badge>
            )}
            {b.category && (
              <Badge variant="outline" className="gap-1 border-brand/30 bg-brand-soft text-brand">
                <Tag className="h-3 w-3" /> {b.category}
              </Badge>
            )}
          </>
        )}
        {actions}
      </div>
    </div>
  )
}

/** While the audit runs: the three steps, with the current one spinning. */
export function Progress({ step }: { step: AuditStep | null }) {
  const at = step ? STEPS.findIndex((s) => s.key === step) : 0
  return (
    <Panel icon={Clock} title="Auditing this profile" hint="This page updates by itself. Most audits finish in under a minute.">
      <ol className="divide-y divide-border/60">
        {STEPS.map((s, i) => {
          const done = i < at
          const current = i === at
          return (
            <li key={s.key} className="flex items-center gap-3 px-4 py-3">
              {done ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
              ) : current ? (
                <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-brand/25 border-t-brand" />
              ) : (
                <CircleDashed className="h-5 w-5 shrink-0 text-muted-foreground/50" />
              )}
              <div className={done || current ? "" : "opacity-60"}>
                <div className="text-sm font-medium">{s.label}</div>
                <div className="text-xs text-muted-foreground">{s.hint}</div>
              </div>
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
  { key: "rankings", label: "Rankings & competitors" },
  { key: "plan", label: "Action plan" },
]

export function Tabs({ active, onChange, counts }: { active: TabKey; onChange: (t: TabKey) => void; counts: Partial<Record<TabKey, number>> }) {
  return (
    <div className="tabs overflow-x-auto print:hidden" role="tablist">
      {TABS.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={active === t.key} className={`tab whitespace-nowrap ${active === t.key ? "active" : ""}`} onClick={() => onChange(t.key)}>
          {t.label}
          {counts[t.key] ? <span className="ml-1.5 rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold tabular-nums text-muted-foreground">{counts[t.key]}</span> : null}
        </button>
      ))}
    </div>
  )
}

// ── Overview ─────────────────────────────────────────────────────────────────

function Kpi({ icon: Icon, label, value, suffix, foot }: { icon: typeof Star; label: string; value: ReactNode; suffix?: string; foot: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        {label}
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-2.5 flex items-baseline gap-1 text-[28px] font-semibold leading-none tracking-tight tabular-nums">
        {value}
        {suffix && <span className="text-sm font-medium text-muted-foreground">{suffix}</span>}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{foot}</div>
    </div>
  )
}

export function Overview({ data, report, onOpen }: { data: GbpAuditResponse; report: Report; onOpen: (t: TabKey) => void }) {
  const facts = data.facts!
  const b = facts.business
  const vis = facts.visibility
  const high = report.findings.filter((f) => f.priority === "high").length
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={ListChecks}
          label="Profile health"
          value={report.score ?? "—"}
          suffix={report.score !== null ? "/100" : undefined}
          foot={
            <span className="inline-flex items-center gap-1.5">
              {report.score !== null && <Delta from={data.previous?.score} to={report.score} />}
              {data.previous ? `vs ${data.previous.score ?? "—"} on ${fmtDay(data.previous.createdAt)}` : "Weighted across 5 categories"}
            </span>
          }
        />
        <Kpi
          icon={Star}
          label="Google rating"
          value={b.rating !== null ? b.rating.toFixed(1) : "—"}
          suffix={b.rating !== null ? "/5" : undefined}
          foot={b.reviewCount !== null ? `${b.reviewCount.toLocaleString()} reviews` : "No reviews returned"}
        />
        <Kpi
          icon={Trophy}
          label="Local rank"
          value={vis ? (vis.rank !== null ? `#${vis.rank}` : `${vis.depth}+`) : "—"}
          foot={vis ? `for “${vis.keyword}” from the business’s location` : "Ranking check didn't run"}
        />
        <Kpi
          icon={AlertTriangle}
          label="Issues found"
          value={report.findings.length}
          foot={`${high} high priority · ${report.checks.filter((c) => c.status === "pass").length} checks passed`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel icon={ListChecks} title="Audit health by category" hint="Checks we couldn't verify are left out of the score, not counted against you">
          <div className="flex flex-col gap-5 p-4 sm:flex-row sm:items-center">
            {report.score !== null && (
              <div className="flex flex-col items-center gap-1 sm:pr-2">
                <ScoreRing score={report.score} />
                <span className="text-xs text-muted-foreground">Overall</span>
              </div>
            )}
            <div className="flex-1 space-y-3.5">
              {report.categories.map((c) => (
                <div key={c.key}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="font-medium">{c.label}</span>
                    <span className="flex items-baseline gap-2 text-xs text-muted-foreground">
                      {c.failed + c.warned > 0 && <span>{c.failed + c.warned} to fix</span>}
                      <span className={`font-mono text-sm font-semibold ${c.score !== null ? gradeColor(sectionScoreToGrade(c.score)) : ""}`}>{c.score ?? "—"}</span>
                    </span>
                  </div>
                  {c.score !== null ? <Bar value={c.score} /> : <span className="block h-1.5 rounded-full bg-muted" />}
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <ProfileSnapshot facts={facts} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel
          icon={AlertTriangle}
          title="Priority findings"
          hint="The issues that matter most, first"
          right={
            <button type="button" className="text-xs font-medium text-primary hover:underline print:hidden" onClick={() => onOpen("profile")}>
              View all checks →
            </button>
          }
        >
          {report.findings.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Nothing to fix — every check we could run passed.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {report.findings.slice(0, 5).map((f) => (
                <FindingRow key={f.id} check={f} />
              ))}
            </ul>
          )}
        </Panel>

        <Panel icon={CheckCircle2} title="Strengths" hint="What's already working for this profile">
          {report.strengths.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No standout strengths yet — the action plan is the place to start.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {report.strengths.slice(0, 5).map((s) => (
                <li key={s.id} className="flex items-start gap-3 px-4 py-3">
                  <StatusTile status="pass" />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium">
                      {s.label} <span className="font-normal text-muted-foreground">· {s.value}</span>
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{s.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {report.competitors.rows.length > 0 && (
        <Panel
          icon={Users}
          title="Competitor snapshot"
          hint={vis ? `Who ranks for “${vis.keyword}” around this business` : undefined}
          right={
            <button type="button" className="text-xs font-medium text-primary hover:underline print:hidden" onClick={() => onOpen("rankings")}>
              Compare competitors →
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

function FindingRow({ check }: { check: Check }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <StatusTile status={check.status} />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium">
          {check.label} <span className="font-normal text-muted-foreground">· {check.value}</span>
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{check.detail}</p>
        {check.fix && <p className="mt-1 text-xs leading-relaxed text-foreground/80">→ {check.fix}</p>}
      </div>
      <PriorityBadge priority={check.priority} />
    </li>
  )
}

function ProfileSnapshot({ facts }: { facts: Facts }) {
  const b = facts.business
  const today = b.hours?.[(new Date(facts.fetchedAt).getDay() + 6) % 7]
  const chips = [
    b.website ? "Website linked" : "No website",
    b.phone ? "Phone listed" : "Phone missing",
    b.totalPhotos !== null ? `${b.totalPhotos} photos` : null,
    b.hours ? "Hours set" : "No hours",
    b.attributes.length ? `${b.attributes.reduce((n, g) => n + g.items.length, 0)} attributes` : null,
  ].filter((c): c is string => !!c)
  return (
    <Panel
      icon={Store}
      title="Business profile snapshot"
      hint="As Google shows it today"
      right={
        b.mapsUrl && (
          <ExtLink href={b.mapsUrl} className="inline-flex items-center gap-1 text-xs font-medium print:hidden">
            Open on Maps <ExternalLink className="h-3 w-3" />
          </ExtLink>
        )
      }
    >
      <div className="flex gap-3.5 p-4">
        <BusinessTile business={b} size={76} />
        <div className="min-w-0 space-y-1 text-xs text-muted-foreground">
          <div className="text-sm font-semibold text-foreground">{b.name}</div>
          {b.rating !== null && (
            <div className="flex items-center gap-1.5">
              <Stars value={b.rating} />
              <span className="text-foreground/80">
                {b.rating.toFixed(1)} · {b.reviewCount?.toLocaleString() ?? 0} reviews
              </span>
            </div>
          )}
          {b.category && <div>{[b.category, ...b.additionalCategories.slice(0, 2)].join(" · ")}</div>}
          {b.address && (
            <div className="flex items-start gap-1.5">
              <MapPin className="mt-px h-3.5 w-3.5 shrink-0" /> {b.address}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 shrink-0" /> {b.phone ?? <span className="text-red-500">No phone number</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 shrink-0" />
            {b.website ? <ExtLink href={b.website}>{hostOf(b.website)}</ExtLink> : <span className="text-red-500">No website</span>}
          </div>
          {today && (
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 shrink-0" /> {DAY_LABEL[today.day]}: {today.open.length ? today.open.join(", ") : "Closed"}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 border-t border-border/60 px-4 py-3">
        {chips.map((c) => (
          <span key={c} className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground">
            {c}
          </span>
        ))}
      </div>
    </Panel>
  )
}

// ── Profile audit ────────────────────────────────────────────────────────────

const CATEGORY_ICON: Record<CategoryKey, typeof Star> = {
  profile: Store,
  reviews: Star,
  content: Camera,
  website: Globe,
  visibility: Trophy,
}

export function ProfileAudit({ facts, report }: { facts: Facts; report: Report }) {
  const b = facts.business
  const counts = (s: CheckStatus) => report.checks.filter((c) => c.status === s).length
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        {report.categories.map((cat) => {
          const checks = report.checks.filter((c) => c.category === cat.key)
          return (
            <Panel
              key={cat.key}
              icon={CATEGORY_ICON[cat.key]}
              title={cat.label}
              hint={`${cat.passed} passed · ${cat.warned} need attention · ${cat.failed} failed`}
              right={cat.score !== null ? <span className={`font-mono text-lg font-bold ${gradeColor(sectionScoreToGrade(cat.score))}`}>{cat.score}</span> : <span className="text-xs text-muted-foreground">Not scored</span>}
            >
              <ul className="divide-y divide-border/60">
                {checks.map((c) => (
                  <li key={c.id} className="flex items-start gap-3 px-4 py-3">
                    <StatusTile status={c.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="text-[13px] font-medium">{c.label}</span>
                        <span className="max-w-full truncate text-xs text-muted-foreground">{c.value}</span>
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{c.detail}</p>
                      {c.fix && <p className="mt-1 text-xs leading-relaxed text-foreground/80">→ {c.fix}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )
        })}
      </div>

      <div className="space-y-4">
        <Panel icon={ListChecks} title="Score methodology" hint="How this score is built">
          <div className="flex flex-col items-center gap-2 p-4">
            {report.score !== null && <ScoreRing score={report.score} size={120} />}
            <p className="text-center text-xs text-muted-foreground">FreeSERP's checklist score — not a score Google publishes</p>
            <div className="mt-2 grid w-full grid-cols-2 gap-2">
              {(["pass", "warn", "fail", "unknown"] as const).map((s) => (
                <div key={s} className="rounded-lg bg-muted/60 px-3 py-2.5">
                  <div className={`text-lg font-semibold tabular-nums ${STATUS_STYLE[s].tone}`}>{counts(s)}</div>
                  <div className="text-[11px] text-muted-foreground">{STATUS_LABEL[s]}</div>
                </div>
              ))}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Each check counts by its weight: passed in full, needs attention as half, failed as nothing. Categories are weighted
              Profile 30, Reviews 25, Local visibility 20, Photos 15, Website 10. Data we couldn&apos;t get is marked not verified and
              left out.
            </p>
          </div>
        </Panel>

        <Panel icon={CalendarClock} title="Opening hours">
          {b.hours ? (
            <table className="w-full text-xs">
              <tbody>
                {b.hours.map((d) => (
                  <tr key={d.day} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2 font-medium">{DAY_LABEL[d.day]}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{d.open.length ? d.open.join(", ") : "Closed"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-4 py-4 text-xs text-muted-foreground">No opening hours on the profile.</p>
          )}
        </Panel>

        <Panel icon={Tag} title="Categories & attributes">
          <div className="space-y-3 p-4 text-xs">
            <div>
              <div className="mb-1.5 font-medium">Categories</div>
              <div className="flex flex-wrap gap-1.5">
                {b.category && <span className="rounded-md bg-brand-soft px-2 py-1 font-medium text-brand">{b.category}</span>}
                {b.additionalCategories.map((c) => (
                  <span key={c} className="rounded-md border border-border px-2 py-1 text-muted-foreground">
                    {c}
                  </span>
                ))}
                {!b.category && <span className="text-muted-foreground">None set</span>}
              </div>
            </div>
            {b.attributes.map((g) => (
              <div key={g.group}>
                <div className="mb-1.5 font-medium">{g.group}</div>
                <div className="flex flex-wrap gap-1.5">
                  {g.items.map((i) => (
                    <span key={i} className="rounded-md border border-border px-2 py-1 text-muted-foreground">
                      {i}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {b.description && (
              <div>
                <div className="mb-1.5 font-medium">Description</div>
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
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Panel icon={Star} title="Review reputation" hint="Rating and how it's spread, as Google shows it">
          <div className="flex flex-col gap-5 p-4 sm:flex-row sm:items-center">
            <div className="text-center sm:w-32">
              <div className="text-5xl font-semibold tracking-tight tabular-nums">{b.rating?.toFixed(1) ?? "—"}</div>
              {b.rating !== null && <Stars value={b.rating} className="h-4 w-4" />}
              <div className="mt-1 text-xs text-muted-foreground">{b.reviewCount?.toLocaleString() ?? 0} reviews</div>
            </div>
            {dist && total > 0 ? (
              <div className="flex-1 space-y-1.5">
                {(["5", "4", "3", "2", "1"] as const).map((k) => (
                  <div key={k} className="flex items-center gap-2 text-xs">
                    <span className="w-6 text-muted-foreground">{k}★</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className={`block h-full rounded-full ${Number(k) >= 4 ? "bg-green-500" : k === "3" ? "bg-amber-400" : "bg-red-500"}`}
                        style={{ width: `${(dist[k] / total) * 100}%` }}
                      />
                    </span>
                    <span className="w-10 text-right tabular-nums text-muted-foreground">{dist[k]}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="flex-1 text-xs text-muted-foreground">Google didn&apos;t return the rating breakdown for this profile.</p>
            )}
          </div>
        </Panel>

        <Panel icon={MessageSquareText} title="Review activity" hint={s.sampled ? `From the ${s.sampled} newest reviews` : "No reviews to read"}>
          <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
            <Mini label="Owner replies" value={s.responseRate !== null ? `${Math.round(s.responseRate * 100)}%` : "—"} sub={`${s.replied} of ${s.sampled}`} />
            <Mini label="Newest review" value={s.daysSinceNewest !== null ? (s.daysSinceNewest === 0 ? "Today" : `${s.daysSinceNewest}d`) : "—"} sub={s.newestAt ? fmtDay(s.newestAt) : "—"} />
            <Mini label="Low ratings" value={String(s.negative)} sub={`${s.negativeUnanswered} unanswered`} warn={s.negativeUnanswered > 0} />
            <Mini label="Recent average" value={s.sampleAverage?.toFixed(1) ?? "—"} sub="newest reviews" />
          </div>
          {b.placeTopics.length > 0 && (
            <div className="border-t border-border/60 px-4 py-3">
              <div className="mb-2 text-xs font-medium">What reviewers mention</div>
              <div className="flex flex-wrap gap-1.5">
                {b.placeTopics.slice(0, 12).map((t) => (
                  <span key={t.topic} className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground">
                    {t.topic} <span className="font-semibold text-foreground/70">{t.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>

      <Panel icon={MessageSquareText} title="Newest reviews" hint="Unanswered low ratings are highlighted">
        {reviews.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No reviews were returned for this profile.</p>
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

function Mini({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/60 px-3 py-2.5">
      <div className={`text-lg font-semibold tabular-nums ${warn ? "text-red-500" : ""}`}>{value}</div>
      <div className="text-[11px] font-medium">{label}</div>
      <div className="text-[11px] text-muted-foreground">{sub}</div>
    </div>
  )
}

function ReviewRow({ review: r }: { review: Review }) {
  const needsReply = r.rating !== null && r.rating <= 3 && !r.ownerAnswer
  return (
    <li className={`px-4 py-3 ${needsReply ? "border-l-2 border-l-red-500 bg-red-500/[0.03]" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="font-medium">{r.author ?? "A Google user"}</span>
        {r.localGuide && <span className="text-muted-foreground">· Local Guide</span>}
        {r.rating !== null && <Stars value={r.rating} className="h-3 w-3" />}
        <span className="text-muted-foreground">{r.timeAgo ?? (r.publishedAt ? fmtDay(r.publishedAt) : "")}</span>
        <span className="ml-auto">
          {r.ownerAnswer ? (
            <span className="text-green-600 dark:text-green-400">Replied</span>
          ) : (
            <span className={needsReply ? "font-medium text-red-500" : "text-muted-foreground"}>{needsReply ? "Needs a reply" : "No reply"}</span>
          )}
        </span>
      </div>
      {r.text && <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{r.text}</p>}
      {r.ownerAnswer && (
        <p className="mt-1.5 line-clamp-2 border-l-2 border-border pl-2 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground/70">Owner: </span>
          {r.ownerAnswer}
        </p>
      )}
    </li>
  )
}

// ── Rankings & competitors ───────────────────────────────────────────────────

/** The organic Maps results, the business itself included, best first. */
function mapsResults(facts: Facts): CompetitorRow[] {
  return (facts.visibility?.results ?? []).filter((r, i, all) => all.findIndex((x) => x.rank === r.rank) === i).slice(0, 20)
}

/** The top five, plus the business itself when it ranks below them, so the snapshot always shows where it stands. */
function snapshotRows(facts: Facts): CompetitorRow[] {
  const all = mapsResults(facts)
  const top = all.slice(0, 5)
  const target = all.find((r) => r.isTarget)
  return target && !top.includes(target) ? [...top, target] : top
}

function CompetitorTable({ rows, business }: { rows: CompetitorRow[]; business: Business }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="w-14 px-4 py-2.5 font-semibold">Rank</th>
            <th className="px-4 py-2.5 font-semibold">Business</th>
            <th className="px-4 py-2.5 font-semibold">Rating</th>
            <th className="px-4 py-2.5 font-semibold">Reviews</th>
            <th className="px-4 py-2.5 font-semibold">Category</th>
            <th className="px-4 py-2.5 font-semibold">Website</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const more = r.reviewCount !== null && business.reviewCount !== null && !r.isTarget && r.reviewCount > business.reviewCount
            return (
              <tr key={`${r.rank}-${r.title}`} className={`border-b border-border/60 last:border-0 ${r.isTarget ? "bg-brand-soft/60" : ""}`}>
                <td className="px-4 py-2.5">
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white ${r.rank <= 3 ? "bg-green-600" : r.rank <= 10 ? "bg-amber-500" : "bg-red-500"}`}
                  >
                    {r.rank}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="font-medium">
                    {r.title}
                    {r.isTarget && <span className="ml-1.5 rounded bg-brand px-1.5 py-px text-[10px] font-semibold text-white">You</span>}
                  </div>
                  {r.address && <div className="max-w-[260px] truncate text-[11px] text-muted-foreground">{r.address}</div>}
                </td>
                <td className="px-4 py-2.5 tabular-nums">{r.rating !== null ? `${r.rating.toFixed(1)} ★` : "—"}</td>
                <td className={`px-4 py-2.5 tabular-nums ${more ? "font-medium text-red-500" : ""}`}>{r.reviewCount?.toLocaleString() ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{r.category ?? "—"}</td>
                <td className="px-4 py-2.5">
                  {r.website ? <ExtLink href={r.website}>{hostOf(r.website)}</ExtLink> : <span className="text-muted-foreground">None</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function Rankings({ facts, report }: { facts: Facts; report: Report }) {
  const vis = facts.visibility
  const b = facts.business
  const c = report.competitors
  if (!vis) {
    return (
      <div className="space-y-4">
        <Notice>The local ranking check didn&apos;t run for this audit, so there are no rankings or competitors to show. Run the audit again to retry it.</Notice>
        <GridCta />
      </div>
    )
  }
  const rows = mapsResults(facts)
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Rank for “{vis.keyword}”</div>
          <div className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">{vis.rank !== null ? `#${vis.rank}` : `Not in top ${vis.depth}`}</div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Searched on Google Maps from the business’s own pin, the best case for a nearby searcher.{" "}
            {vis.rank !== null && vis.rank <= 3 ? "It's in the local pack." : "The local pack shows the top 3."}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Reviews vs. competitors</div>
          <div className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">
            {b.reviewCount?.toLocaleString() ?? "—"}
            <span className="ml-1.5 text-sm font-medium text-muted-foreground">vs {c.medianReviews?.toLocaleString() ?? "—"}</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Yours against the median of the {c.rows.length} businesses ranking around you.</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Rating vs. competitors</div>
          <div className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">
            {b.rating?.toFixed(1) ?? "—"}
            <span className="ml-1.5 text-sm font-medium text-muted-foreground">vs {c.avgRating?.toFixed(1) ?? "—"}</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {c.topCategory ? `Most of them (${c.topCategory.count}) use the category “${c.topCategory.name}”.` : "Yours against their average."}
          </p>
        </div>
      </div>

      <Panel icon={Users} title="Google Maps results" hint={`Top ${rows.length} for “${vis.keyword}” from the business’s location · ads excluded`}>
        {rows.length ? <CompetitorTable rows={rows} business={b} /> : <p className="px-4 py-6 text-sm text-muted-foreground">Google Maps returned no results for this search.</p>}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <GridCta />
        {b.peopleAlsoSearch.length > 0 && (
          <Panel icon={Users} title="People also search for" hint="Google's own list of related businesses">
            <ul className="divide-y divide-border/60">
              {b.peopleAlsoSearch.slice(0, 6).map((p) => (
                <li key={`${p.cid}-${p.title}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                  <span className="font-medium">{p.title}</span>
                  <span className="text-muted-foreground">
                    {p.rating !== null ? `${p.rating.toFixed(1)} ★` : ""}
                    {p.reviewCount !== null ? ` · ${p.reviewCount.toLocaleString()} reviews` : ""}
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

function GridCta() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-brand/30 bg-brand-soft/60 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-white">
        <Grid3x3 className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-sm font-medium">See your rank across the whole area</div>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          This audit checks one point: the business itself. A geo-grid scan measures every point around it, as a heatmap.
        </p>
        <Link href="/dashboard/google-maps-tracker/new" className="mt-2 inline-block text-xs font-semibold text-primary hover:underline print:hidden">
          Run a grid scan in Google Maps Tracker →
        </Link>
      </div>
    </div>
  )
}

// ── Action plan ──────────────────────────────────────────────────────────────

const PHASE_EDGE = ["border-t-brand", "border-t-amber-500", "border-t-green-600"]

export function Plan({ plan }: { plan: PlanPhase[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {plan.map((p, i) => (
        <div key={p.window} className={`rounded-xl border border-border border-t-[3px] bg-card p-4 ${PHASE_EDGE[i] ?? ""}`}>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{p.window}</div>
          <h3 className="mt-1 text-sm font-semibold">{p.title}</h3>
          <ul className="mt-2.5 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-muted-foreground">
            {p.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export function ActionPlan({ report }: { report: Report }) {
  return (
    <div className="space-y-4">
      <Plan plan={report.plan} />
      <Panel icon={ListChecks} title="Every recommendation" hint="All findings, highest priority first">
        {report.findings.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nothing to fix — every check we could run passed.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">Recommendation</th>
                  <th className="px-4 py-2.5 font-semibold">Found</th>
                  <th className="px-4 py-2.5 font-semibold">Area</th>
                  <th className="px-4 py-2.5 font-semibold">Priority</th>
                </tr>
              </thead>
              <tbody>
                {report.findings.map((f) => (
                  <tr key={f.id} className="border-b border-border/60 last:border-0 align-top">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{f.label}</div>
                      <div className="mt-0.5 leading-relaxed text-muted-foreground">{f.fix}</div>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{f.value}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{report.categories.find((c) => c.key === f.category)?.label}</td>
                    <td className="px-4 py-2.5">
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
    <Panel icon={CalendarClock} title="Earlier audits of this profile">
      <ul className="divide-y divide-border/60">
        {audits.map((a) => (
          <li key={a.id}>
            <Link href={`/dashboard/google-maps-audit/${a.id}`} className="flex items-center justify-between gap-4 px-4 py-3 text-sm transition-colors hover:bg-muted/30">
              <span>{fmtDay(a.createdAt)}</span>
              <span className={`font-mono font-semibold ${a.score !== null ? gradeColor(sectionScoreToGrade(a.score)) : "text-muted-foreground"}`}>{a.score ?? "—"}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
