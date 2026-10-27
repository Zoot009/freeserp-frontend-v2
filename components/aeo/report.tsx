"use client"

// The AEO & GEO audit report, section by section. Ported from Aeo-Tool-E's report.tsx and redrawn in the Page Audit
// report's language (components/page-audit/audit-ui.tsx): its rings, grades, radar and colours, rounded cards with a
// severity edge, and rows that open in place. Reusing those pieces is what keeps the two reports looking like one product.
import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Braces,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDot,
  CircleSlash,
  Code,
  Eye,
  Info,
  Lightbulb,
  ListTree,
  MessageSquareText,
  Minus,
  OctagonAlert,
  ScanSearch,
  Settings2,
  ShieldCheck,
  Wrench,
  X,
  XCircle,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { CategoryMiniRing, GradeBadge, gradeColor, gradeStroke, RadarChart, sectionScoreToGrade } from "@/components/page-audit/audit-ui"
import {
  askedHow,
  CATEGORIES,
  CATEGORY_NAMES,
  countryName,
  EFFORT_LABELS,
  ENGINE_NAMES,
  fmtDay,
  overall,
  points,
  serious,
  where,
  type AeoReport,
  type AuditProgress,
  type AuditStatus,
  type Breakdown,
  type Category,
  type EngineScore,
  type Finding,
  type Fix,
  type Outcome,
  type PastAudit,
  type Severity,
  type SiteFacts,
  type Strength,
  type VisibilitySummary,
} from "@/lib/aeo"

const gradeOf = sectionScoreToGrade

// ── Building blocks ────────────────────────────────────────────────────────────────────────────────────────────────

/** A report section: a rounded card with an icon, a title, a line of context and an optional right-hand slot. */
export function Panel({
  icon: Icon,
  title,
  hint,
  right,
  id,
  children,
}: {
  icon: typeof Check
  title: ReactNode
  hint?: ReactNode
  right?: ReactNode
  id?: string
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-6 overflow-hidden rounded-xl border border-border bg-card">
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

/** Something wrong, said plainly: a failed audit, capped scores. */
export function Alarm({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2.5 text-sm text-foreground">
      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
      <span>{children}</span>
    </p>
  )
}

/** A heads-up that isn't a failure of the audit: a step that didn't run. */
function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs text-foreground">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
      <span>{children}</span>
    </p>
  )
}

/** A thin bar out of 100 in its grade's colour. */
function Bar({ value }: { value: number }) {
  const fill = gradeStroke(gradeOf(value)).replaceAll("stroke-", "bg-")
  return (
    <span className="block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
      <span className={`block h-full rounded-full transition-all duration-700 ${fill}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </span>
  )
}

/** A score out of 100 as a ring with the number inside, coloured by its grade like the Page Audit rings. */
function ScoreRing({ score, size, stroke }: { score: number; size: number; stroke: number }) {
  const [filled, setFilled] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setFilled(true), 50)
    return () => clearTimeout(t)
  }, [])
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const grade = gradeOf(score)
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
        <span className={`font-mono font-bold ${gradeColor(grade)}`} style={{ fontSize: Math.round(size * 0.26) }}>
          {score}
        </span>
        {size >= 100 && <span className="mt-1 text-[11px] text-muted-foreground">/100</span>}
      </div>
    </div>
  )
}

/** A score's change since an earlier audit: an arrow and the points. Nothing when unchanged. */
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

const SEVERITY_STYLE: Record<Severity, { badge: string; edge: string; Icon: typeof Check; urge?: string }> = {
  CRITICAL: {
    badge: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
    edge: "border-l-red-500",
    Icon: OctagonAlert,
    urge: "Fix this first: it can keep AI engines from using your site at all.",
  },
  HIGH: {
    badge: "border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-400",
    edge: "border-l-orange-500",
    Icon: AlertTriangle,
    urge: "This is costing you visibility in AI answers.",
  },
  MEDIUM: { badge: "border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400", edge: "border-l-yellow-500", Icon: AlertCircle },
  LOW: { badge: "text-muted-foreground", edge: "border-l-border", Icon: Info },
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const { badge, Icon } = SEVERITY_STYLE[severity]
  return (
    <Badge variant="outline" className={`gap-1 text-[10px] font-semibold uppercase tracking-wide ${badge}`}>
      <Icon className="h-3 w-3" />
      {severity.toLowerCase()}
    </Badge>
  )
}

// The rows that open in place (<details>): the summary is the row, its marker hidden; the chevron turns when open.
const ROW = "flex w-full cursor-pointer list-none items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30 [&::-webkit-details-marker]:hidden"
const Chevron = () => <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
const Label = ({ children }: { children: ReactNode }) => <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>

// ── Header and overview ────────────────────────────────────────────────────────────────────────────────────────────

/** The site, when it was audited, and the report's actions: the Page Audit report's top bar. */
export function ReportHeader({ origin, meta, actions }: { origin: string; meta: ReactNode; actions?: ReactNode }) {
  const host = new URL(origin).hostname.replace(/^www\./, "")
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/50 font-mono text-sm font-bold text-foreground/60">
          {host.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5 text-sm">
            <span className="hidden text-muted-foreground sm:block">AEO &amp; GEO audit for</span>
            <span className="truncate font-semibold text-foreground">{host}</span>
            <a href={origin} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground/50 transition-colors hover:text-primary" aria-label={`Open ${host}`}>
              <ScanSearch className="h-3.5 w-3.5" />
            </a>
          </div>
          <div className="text-xs text-muted-foreground">{meta}</div>
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2 sm:shrink-0">{actions}</div>}
    </div>
  )
}

const VERDICT: Record<string, string> = {
  A: "AI engines can find, read and quote this site well",
  B: "This site is in good shape for AI answers",
  C: "This site could do better in AI answers",
  D: "This site needs work to show up in AI answers",
  F: "AI engines are unlikely to use or cite this site",
}

/** The two headline scores, the numbers behind them, and every category at a glance. */
export function Overview({ report }: { report: AeoReport & { breakdown: Breakdown } }) {
  const { breakdown: b, previous, fixes, pages, seconds } = report
  const rules = b.categories.flatMap((c) => c.rules)
  const urgent = fixes.filter((f) => serious(f.severity)).length
  const cited = overall(b.measured ?? [])
  const grade = gradeOf(Math.min(b.aeo, b.geo))
  const scores = [
    { label: "AEO score", value: b.aeo, before: previous?.aeoScore, hint: "Answer engines: how ready your pages are to be the answer" },
    { label: "GEO score", value: b.geo, before: previous?.geoScore, hint: "Generative AI: how ready your brand is to be cited" },
  ]
  const categories = b.categories
    .filter((c) => c.category !== "CONTENT_QUALITY")
    .map((c) => ({ key: c.category, label: CATEGORY_NAMES[c.category], score: c.score }))
  const stats = [
    { label: "Things to fix", value: fixes.length, note: urgent ? `${urgent} high priority` : "none high priority", warn: urgent > 0 },
    { label: "Checks passed", value: rules.reduce((n, r) => n + r.passed, 0), note: `of ${rules.reduce((n, r) => n + r.total, 0)}` },
    { label: "Pages read", value: pages.length, note: seconds !== null ? `in ${seconds}s` : undefined },
    { label: "Cited in AI answers", value: cited ? `${cited.score}%` : "—", note: cited ? `${cited.cited} of ${cited.answered} answers` : "not measured" },
  ]
  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-center">
        <div className="flex flex-wrap justify-center gap-8 sm:gap-12">
          {scores.map((s) => (
            <div key={s.label} className="flex flex-col items-center gap-2">
              <ScoreRing score={s.value} size={148} stroke={12} />
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium">{s.label}</span>
                <GradeBadge grade={gradeOf(s.value)} />
                <Delta from={s.before} to={s.value} />
              </div>
              <p className="max-w-48 text-center text-[11px] leading-snug text-muted-foreground">{s.hint}</p>
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1 space-y-4">
          <p className="text-base font-semibold text-foreground/90">{VERDICT[grade]}</p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-lg border border-border/60 bg-background/50 px-3 py-2.5">
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
                <p className="mt-0.5 font-mono text-xl font-bold tabular-nums">{s.value}</p>
                {s.note && <p className={`text-[11px] ${s.warn ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"}`}>{s.note}</p>}
              </div>
            ))}
          </div>
          {b.caps.length > 0 && (
            <Alarm>
              Both scores are capped at 40 (they would be AEO {b.uncapped?.aeo} and GEO {b.uncapped?.geo}) because {b.caps.join("; ")}.
            </Alarm>
          )}
        </div>
      </div>
      <div className="mt-6 rounded-xl border border-border/40 bg-background/50 p-4">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap justify-center gap-4 sm:justify-start sm:gap-5">
            {categories.map((c, i) => (
              <a key={c.key} href={`#cat-${c.key}`} className="rounded-lg transition-opacity hover:opacity-80">
                <CategoryMiniRing label={c.label} grade={gradeOf(c.score)} score={c.score} delay={i * 80} />
              </a>
            ))}
          </div>
          {categories.length >= 3 && <RadarChart categories={categories} />}
        </div>
      </div>
    </section>
  )
}

// ── AI engines ─────────────────────────────────────────────────────────────────────────────────────────────────────

const OUTCOME: Record<Outcome, { label: string; Icon: typeof Check; color: string }> = {
  cited: { label: "Cited", Icon: CheckCircle2, color: "text-green-600 dark:text-green-400" },
  consulted: { label: "Read your site, cited others", Icon: Eye, color: "text-yellow-600 dark:text-yellow-400" },
  named: { label: "Named you, no link", Icon: MessageSquareText, color: "text-primary" },
  absent: { label: "Not cited", Icon: Circle, color: "text-muted-foreground" },
  none: { label: "No AI answer shown", Icon: CircleSlash, color: "text-muted-foreground" },
}
const UNASKED = { label: "Couldn't ask", Icon: Minus, color: "text-muted-foreground" }
const engineName = (m: VisibilitySummary) => ENGINE_NAMES[m.engine] ?? m.engine

/** Measured, not estimated: every engine's answers to the same customer questions, and which sites they link to. */
export function AiVisibility({ measured, host }: { measured: VisibilitySummary[]; host: string }) {
  if (!measured.length) return null
  // The provider's own words only while developing: in production they're for the logs, not the site owner.
  const dev = process.env.NODE_ENV === "development"
  const asked = measured.filter((m) => m.status !== "skipped")
  const total = overall(asked)
  if (!total) {
    const detail = asked.find((m) => m.detail)?.detail
    return (
      <Panel icon={MessageSquareText} title="Measured in AI answers">
        <div className="p-4">
          <Notice>
            {asked.length
              ? `The AI visibility check failed${dev && detail ? `: ${detail}` : ". Running the audit again usually fixes this."}`
              : `AI visibility wasn't measured: ${measured[0]!.detail}.`}
          </Notice>
        </div>
      </Panel>
    )
  }
  const first = asked.find((m) => m.questions?.length)?.questions ?? [] // the same questions, in the same order, for every engine
  const questions = first.map((q) => q.question)
  const ours = (domain: string) => domain === host || domain.endsWith(`.${host}`)
  const { market, checkedAt } = asked[0]!
  // The sites cited instead, across every engine: in how many answers, and by which engines.
  const rivals = new Map<string, { answers: number; engines: Set<string> }>()
  for (const m of asked)
    for (const q of m.questions ?? [])
      for (const d of q.outcome ? q.cited : [])
        if (!ours(d)) {
          const r = rivals.get(d) ?? { answers: 0, engines: new Set<string>() }
          r.answers++
          r.engines.add(engineName(m))
          rivals.set(d, r)
        }
  const top = [...rivals].sort((a, b) => b[1].answers - a[1].answers || a[0].localeCompare(b[0])).slice(0, 8)
  const cols = { gridTemplateColumns: `minmax(0,1fr) repeat(${asked.length}, 5rem)` }
  return (
    <Panel
      id="visibility"
      icon={MessageSquareText}
      title="Measured in AI answers"
      hint={`We asked ${new Intl.ListFormat("en-GB").format(asked.map(engineName))} the same ${questions.length} questions a customer${market ? ` in ${countryName(market.country)}` : ""} might ask, ${askedHow(first)}, and checked which sites the answers link to${checkedAt ? `, on ${fmtDay(checkedAt)}` : ""}. Answers change from run to run.`}
    >
      <div className="flex flex-col gap-6 p-4 lg:flex-row lg:items-center">
        <div className="flex items-center gap-4 lg:w-60">
          <ScoreRing score={total.score} size={96} stroke={9} />
          <div>
            <p className="text-sm font-medium">{asked.length > 1 ? "All engines" : engineName(asked[0]!)}</p>
            <p className="text-xs text-muted-foreground">
              Cited in {total.cited} of {total.answered} answers{asked.length > 1 && ` from ${total.engines} engines`}
            </p>
          </div>
        </div>
        <ul className="flex-1 space-y-3">
          {asked.map((m) => (
            <li key={m.engine} className="grid grid-cols-[7rem_minmax(0,1fr)_3rem] items-center gap-x-4 gap-y-1">
              <span className="min-w-0">
                <span className="block text-sm font-medium">{engineName(m)}</span>
                {m.model && <span className="block truncate text-[11px] text-muted-foreground">{m.model}</span>}
              </span>
              {m.score !== undefined ? (
                <>
                  <Bar value={m.score} />
                  <span className={`text-right font-mono text-sm font-semibold tabular-nums ${gradeColor(gradeOf(m.score))}`}>{m.score}%</span>
                </>
              ) : (
                <span className="col-span-2 text-xs text-muted-foreground">
                  Couldn&apos;t measure{dev && m.detail ? `: ${m.detail}` : ". Running the audit again usually fixes this."}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
      {/* One row per question, one column per engine; open a row for the sites each engine cited. */}
      <div className="border-t border-border/60">
        <div className="hidden gap-3 border-b border-border/60 bg-muted/20 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:grid" style={cols}>
          <span>Question</span>
          {asked.map((m) => (
            <span key={m.engine} className="text-center">
              {engineName(m)}
            </span>
          ))}
        </div>
        <ol>
          {questions.map((question, i) => (
            <li key={i} className="border-b border-border/40 last:border-0">
              <details className="group">
                <summary className={`${ROW} text-sm md:grid`} style={cols}>
                  <span className="flex items-start gap-2">
                    <Chevron />
                    <span>
                      {question}
                      {first[i]?.branded && (
                        <Badge variant="outline" className="ml-2 align-middle text-[10px] text-muted-foreground">
                          Branded
                        </Badge>
                      )}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-x-4 gap-y-1 pl-6 md:contents">
                    {asked.map((m) => {
                      const r = m.questions?.[i]
                      const { label, Icon, color } = r?.outcome ? OUTCOME[r.outcome] : UNASKED
                      return (
                        <span key={m.engine} title={`${engineName(m)}: ${label}`} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground md:justify-center">
                          <Icon className={`h-4 w-4 ${color}`} />
                          <span className="md:sr-only">{engineName(m)}</span>
                          <span className="sr-only">: {label}</span>
                        </span>
                      )
                    })}
                  </span>
                </summary>
                <ul className="space-y-1 bg-muted/20 px-4 py-3 pl-11 text-xs text-muted-foreground">
                  {asked.map((m) => {
                    const r = m.questions?.[i]
                    const { label, color } = r?.outcome ? OUTCOME[r.outcome] : UNASKED
                    const others = r?.cited.filter((d) => !ours(d)) ?? []
                    return (
                      <li key={m.engine}>
                        <span className="font-medium text-foreground">{engineName(m)}</span> · <span className={`font-medium ${color}`}>{label}</span>
                        {r?.position && ` · your site was source #${r.position}`}
                        {others.length > 0 && ` · cited ${others.slice(0, 4).join(", ")}${others.length > 4 ? ` and ${others.length - 4} more` : ""}`}
                      </li>
                    )
                  })}
                </ul>
              </details>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
          {[...Object.values(OUTCOME), UNASKED].map(({ label, Icon, color }) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              <Icon className={`h-3.5 w-3.5 ${color}`} />
              {label}
            </span>
          ))}
        </div>
      </div>
      {top.length > 0 && (
        <div className="border-t border-border/60 p-4">
          <Label>Cited instead</Label>
          <ul className="grid grid-cols-1 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
            {top.map(([domain, r]) => (
              <li key={domain} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">
                  {domain} <span className="text-xs text-muted-foreground">{[...r.engines].join(", ")}</span>
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {r.answers}/{total.answered}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  )
}

function BotStatus({ token, allowed }: { token: string; allowed: number }) {
  const [Icon, word, color] =
    allowed === 1
      ? [Check, "allowed", "text-green-600 dark:text-green-400"]
      : allowed === 0
        ? [X, "blocked", "text-red-500"]
        : [Minus, "blocked on some pages", "text-yellow-600 dark:text-yellow-400"]
  return (
    <span className="flex items-center gap-1 text-[11px]">
      <Icon className={`h-3 w-3 shrink-0 ${color}`} />
      <span className="truncate font-mono">{token}</span>
      <span className="text-muted-foreground">{word}</span>
    </span>
  )
}

/** Readiness per AI engine: an estimate from this audit, with each engine's crawler verdicts spelled out. */
export function EngineReadiness({ engines, measured }: { engines?: EngineScore[]; measured: VisibilitySummary[] }) {
  const cited = new Map(measured.map((m) => [m.engine, m.score]))
  return (
    <Panel
      icon={ScanSearch}
      title="AI engine readiness"
      hint="Estimated from this audit: whether each engine's crawlers may read the site, and how well it does on what that engine weighs most. Not a measure of whether an engine cites you today."
    >
      {engines?.length ? (
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {engines.map((e) => (
            <div key={e.id} className="flex gap-4 rounded-lg border border-border/60 bg-background/50 p-3.5">
              <ScoreRing score={e.score} size={64} stroke={6} />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight">{e.name}</p>
                    <p className="text-[11px] text-muted-foreground">{e.maker}</p>
                  </div>
                  <GradeBadge grade={gradeOf(e.score)} />
                </div>
                <div className="space-y-0.5">
                  {e.bots.map((bot) => (
                    <BotStatus key={bot.token} token={bot.token} allowed={bot.allowed} />
                  ))}
                </div>
                {e.capped && <p className="text-[11px] text-red-500">Capped at 40: its main crawler is blocked from the homepage.</p>}
                {cited.get(e.id) !== undefined && (
                  <a href="#visibility" className="block text-[11px] text-primary hover:underline">
                    Measured: cited in {cited.get(e.id)}% of answers
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="p-4 text-sm text-muted-foreground">This audit has no per-engine scores. Run it again to see them.</p>
      )}
    </Panel>
  )
}

// ── Changes, fixes, categories ─────────────────────────────────────────────────────────────────────────────────────

/** Since the site's previous completed audit: how the scores moved, and which checks were fixed or started failing. */
export function Comparison({ breakdown, previous }: { breakdown: Breakdown; previous: NonNullable<AeoReport["previous"]> }) {
  const { fixed, regressed } = previous
  return (
    <Panel
      icon={CalendarClock}
      title="Since the last audit"
      hint={`Compared with the audit of this site on ${fmtDay(previous.createdAt)}.`}
      right={
        <Link href={`/dashboard/aeo-audit/${previous.id}`} className="text-xs font-medium text-primary hover:underline">
          Open that report
        </Link>
      }
    >
      <div className="space-y-3 p-4 text-sm">
        <p className="flex flex-wrap gap-x-6 gap-y-1 font-mono">
          <span>
            AEO {previous.aeoScore} → <b>{breakdown.aeo}</b> <Delta from={previous.aeoScore} to={breakdown.aeo} />
          </span>
          <span>
            GEO {previous.geoScore} → <b>{breakdown.geo}</b> <Delta from={previous.geoScore} to={breakdown.geo} />
          </span>
        </p>
        {fixed.length > 0 && <ChangeList title={`Fixed (${fixed.length})`} items={fixed} good />}
        {regressed.length > 0 && <ChangeList title={`New problems (${regressed.length})`} items={regressed} />}
        {!fixed.length && !regressed.length && <p className="text-muted-foreground">No check went from failing to passing, or back.</p>}
      </div>
    </Panel>
  )
}

function ChangeList({ title, items, good = false }: { title: string; items: { checkId: string; title: string }[]; good?: boolean }) {
  const Icon = good ? CheckCircle2 : XCircle
  const color = good ? "text-green-500" : "text-red-500"
  return (
    <div>
      <p className={`mb-1 text-xs font-semibold ${good ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>{title}</p>
      <ul className="space-y-1">
        {items.map((c) => (
          <li key={c.checkId} className="flex gap-2">
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
            {c.title}
          </li>
        ))}
      </ul>
    </div>
  )
}

const PAGES_SHOWN = 3 // pages listed under a fix before the rest fold away

/** One fix: a row that opens on what was found, why it matters and how to fix it. */
function FixRow({ fix, rank, origin, open }: { fix: Fix; rank: number; origin: string; open: boolean }) {
  const worst = fix.failing[0]!
  const home = (url: string) => where(url, origin) === "/"
  const page = (f: Finding, j: number) => (
    <li key={j} className="space-y-0.5">
      <span className={`inline-block break-all rounded bg-muted px-1.5 py-0.5 text-xs ${home(f.url) ? "" : "font-mono"}`}>{home(f.url) ? "Homepage" : where(f.url, origin)}</span>
      {fix.failing.length > 1 && f.title !== worst.title && <span className="text-xs"> · {f.title}</span>}
      <p className="whitespace-pre-line wrap-break-word text-muted-foreground">{f.evidence}</p>
    </li>
  )
  const rest = fix.failing.slice(PAGES_SHOWN)
  const { edge, urge } = SEVERITY_STYLE[fix.severity]
  return (
    <li id={`fix-${fix.checkId}`} className={`scroll-mt-6 border-b border-l-4 border-b-border/40 last:border-b-0 ${edge}`}>
      <details open={open} className="group">
        <summary className={`${ROW} flex-wrap`}>
          <span className="w-5 font-mono text-xs text-muted-foreground tabular-nums">{rank}</span>
          <span className="min-w-48 flex-1">
            <span className="block text-sm font-medium">{worst.title}</span>
            {urge && <span className="mt-0.5 block text-xs text-muted-foreground">{urge}</span>}
          </span>
          <span className="flex flex-wrap items-center gap-1.5">
            <SeverityBadge severity={fix.severity} />
            <Badge variant="outline" className="border-primary/30 bg-primary/5 font-mono text-[10px] text-primary">
              {points(fix.gain.aeo)} AEO · {points(fix.gain.geo)} GEO
            </Badge>
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              {EFFORT_LABELS[fix.effort]}
            </Badge>
            {fix.total > 1 && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                {fix.failing.length}/{fix.total} pages
              </Badge>
            )}
          </span>
          <Chevron />
        </summary>
        {/* The problem on the left, what to do about it on the right. No code: the fix says what to change, in words. */}
        <div className={`grid gap-5 border-t border-border/40 bg-muted/20 px-4 py-4 text-sm sm:pl-12 ${worst.fix ? "lg:grid-cols-2 lg:gap-8" : ""}`}>
          <div className="space-y-4">
            <div>
              <Label>{fix.total > 1 ? `What we found · ${fix.failing.length} of ${fix.total} pages` : "What we found"}</Label>
              <ul className="space-y-2.5">{fix.failing.slice(0, PAGES_SHOWN).map(page)}</ul>
              {rest.length > 0 && (
                <details className="group/more mt-1">
                  <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-primary hover:underline [&::-webkit-details-marker]:hidden">
                    {rest.length} more page{rest.length === 1 ? "" : "s"}
                    <ChevronDown className="h-3.5 w-3.5 transition-transform group-open/more:rotate-180" />
                  </summary>
                  <ul className="mt-2.5 space-y-2.5">{rest.map((f, j) => page(f, PAGES_SHOWN + j))}</ul>
                </details>
              )}
            </div>
            <div>
              <Label>Why it matters</Label>
              <p className="text-muted-foreground">{worst.why}</p>
            </div>
          </div>
          {worst.fix && (
            <div className="self-start rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                <Wrench className="h-3.5 w-3.5" />
                How to fix
              </p>
              <p className="leading-relaxed">{worst.fix}</p>
            </div>
          )}
        </div>
      </details>
    </li>
  )
}

export function FixList({ fixes, origin }: { fixes: Fix[]; origin: string }) {
  if (!fixes.length) return null
  const urgent = fixes.filter((f) => serious(f.severity)).length
  return (
    <Panel
      icon={Lightbulb}
      title="Fix first"
      hint="Ranked by impact against effort. Impact is how many points each score gains once the issue is fixed everywhere."
      right={
        urgent > 0 ? (
          <span className="text-xs font-medium text-red-500">{urgent} high priority</span>
        ) : (
          <span className="text-xs text-muted-foreground">{fixes.length} to fix</span>
        )
      }
    >
      <ol>
        {fixes.map((fix, i) => (
          <FixRow key={fix.checkId} fix={fix} rank={i + 1} origin={origin} open={i === 0} />
        ))}
      </ol>
    </Panel>
  )
}

const CATEGORY_ICON: Record<Category, typeof Check> = {
  CRAWL_ACCESS: ScanSearch,
  RENDERING: Code,
  STRUCTURED_DATA: Braces,
  CONTENT_STRUCTURE: ListTree,
  ENTITY_TRUST: ShieldCheck,
  FRESHNESS: CalendarClock,
  TECHNICAL: Settings2,
  CONTENT_QUALITY: Lightbulb,
}

/**
 * Every category as the Page Audit report draws its sections: a card with a grade edge, its failed and passed counts,
 * opening on the fixes in it and the checks that pass. Opens by itself when something in it fails.
 */
export function Categories({ breakdown, fixes, strengths }: { breakdown: Breakdown; fixes: Fix[]; strengths: Strength[] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="text-sm font-medium">By category</h2>
        <p className="text-xs text-muted-foreground">How much each counts toward AEO and GEO</p>
      </div>
      {CATEGORIES.map((category) => {
        const result = breakdown.categories.find((c) => c.category === category)
        if (!result) return null
        const failing = fixes.filter((f) => f.category === category)
        const passing = strengths.filter((s) => s.category === category)
        const Icon = CATEGORY_ICON[category]
        const edge = result.score >= 70 ? "border-l-green-500" : result.score >= 50 ? "border-l-yellow-500" : "border-l-red-500"
        return (
          <details key={category} id={`cat-${category}`} open={failing.length > 0} className={`group scroll-mt-6 overflow-hidden rounded-xl border border-l-4 border-border bg-card ${edge}`}>
            <summary className={`${ROW} py-3.5`}>
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{CATEGORY_NAMES[category]}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {breakdown.weights.aeo[category] ?? 0}% of AEO · {breakdown.weights.geo[category] ?? 0}% of GEO
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {failing.length > 0 && <span className="text-xs font-medium text-red-500">{failing.length} to fix</span>}
                {passing.length > 0 && <span className="text-xs font-medium text-green-600 dark:text-green-400">{passing.length} passed</span>}
                <span className={`font-mono text-xs font-semibold tabular-nums ${gradeColor(gradeOf(result.score))}`}>{result.score}</span>
                <GradeBadge grade={gradeOf(result.score)} />
                <Chevron />
              </span>
            </summary>
            <ul className="border-t border-border/40">
              {failing.map((f) => (
                <li key={f.checkId} className="border-b border-border/40 last:border-0">
                  <a href={`#fix-${f.checkId}`} className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/30">
                    <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                    <span className="flex-1">{f.failing[0]!.title}</span>
                    <SeverityBadge severity={f.severity} />
                  </a>
                </li>
              ))}
              {passing.map((s) => (
                <li key={s.checkId} className="flex items-center gap-3 border-b border-border/40 px-4 py-2.5 text-sm last:border-0">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                  <span className="flex-1">{s.title}</span>
                  {s.count > 1 && <span className="text-xs text-muted-foreground">all {s.count} pages</span>}
                </li>
              ))}
            </ul>
          </details>
        )
      })}
    </div>
  )
}

// ── Pages, crawl, history, progress ────────────────────────────────────────────────────────────────────────────────

const REASON_ORDER = ["home", "about", "contact", "faq", "pricing", "blog", "article", "link", "sitemap"]
const SEVERITY_ORDER: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]

export function PageDetails({ pages, findings, origin }: { pages: AeoReport["pages"]; findings: Finding[]; origin: string }) {
  const sorted = [...pages].sort((a, b) => REASON_ORDER.indexOf(a.facts.reason) - REASON_ORDER.indexOf(b.facts.reason))
  const pageUrls = new Set(pages.map((p) => p.url))
  const siteFiles = findings.filter((f) => !pageUrls.has(f.url))
  const groups = [
    ...sorted.map((p) => ({
      key: p.id,
      label: where(p.url, origin),
      meta: `${p.facts.reason} · ${p.statusCode ? `HTTP ${p.statusCode}` : (p.facts.error ?? "not loaded")}${p.facts.ms !== undefined ? ` · ${p.facts.ms} ms` : ""}`,
      findings: findings.filter((f) => f.url === p.url),
    })),
    ...(siteFiles.length ? [{ key: "files", label: "Site files", meta: "robots.txt, sitemaps, llms.txt", findings: siteFiles }] : []),
  ]
  return (
    <Panel icon={ListTree} title="Pages" hint="Every page the audit read, with its own results." right={<span className="text-xs text-muted-foreground">{pages.length} pages</span>}>
      <ul>
        {groups.map((group) => {
          const issues = group.findings.filter((f) => !f.passed).sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
          const passes = group.findings.filter((f) => f.passed)
          return (
            <li key={group.key} className="border-b border-border/40 last:border-0">
              <details className="group">
                <summary className={`${ROW} flex-wrap`}>
                  {issues.length ? <XCircle className="h-4 w-4 shrink-0 text-red-500" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />}
                  <span className="min-w-0 flex-1 break-all font-mono text-xs">{group.label}</span>
                  <span className="text-[11px] text-muted-foreground">{group.meta}</span>
                  <span className={`text-xs font-medium ${issues.length ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
                    {issues.length ? `${issues.length} issue${issues.length === 1 ? "" : "s"}` : "No issues"}
                  </span>
                  <Chevron />
                </summary>
                <div className="space-y-3 border-t border-border/40 bg-muted/20 px-4 py-3 text-sm">
                  {issues.map((f, j) => (
                    <div key={j} className="space-y-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <SeverityBadge severity={f.severity} />
                        <span className="font-medium">{f.title}</span>
                      </p>
                      <p className="whitespace-pre-line wrap-break-word text-muted-foreground">{f.evidence}</p>
                    </div>
                  ))}
                  {passes.length > 0 && (
                    <p className="text-muted-foreground">
                      <CheckCircle2 className="mr-1 inline h-4 w-4 align-text-bottom text-green-500" />
                      Passed: {passes.map((f) => f.title).join(" · ")}
                    </p>
                  )}
                </div>
              </details>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

export function CrawlSummary({ site }: { site: SiteFacts }) {
  const sitemapUrls = site.sitemaps.reduce((n, s) => n + (s.kind === "urlset" ? s.count : 0), 0)
  // Listed but unfetchable is not the same as missing.
  const unreachable = sitemapUrls ? [] : site.sitemaps.filter((s) => s.error).map((s) => `${s.url}: ${s.error}`)
  const llmsFound = site.llmsTxt.status === 200 && !/html/i.test(site.llmsTxt.contentType ?? "")
  const items: [label: string, value: string, ok: boolean, status: number | null, details?: string[]][] = [
    ["robots.txt", { ok: "Found", missing: "Not found", unreachable: "Unreachable" }[site.robots.state], site.robots.state === "ok", site.robots.status],
    ["llms.txt", llmsFound ? "Found" : "Not found", llmsFound, site.llmsTxt.status],
    ["Sitemap", sitemapUrls ? `${sitemapUrls.toLocaleString("en")} URLs` : unreachable.length ? "Unreachable" : "Not found", sitemapUrls > 0, site.sitemaps[0]?.status ?? null, unreachable],
  ]
  return (
    <Panel icon={Braces} title="Crawl" hint="The site files every crawler reads first.">
      <dl className="grid gap-3 p-4 sm:grid-cols-3">
        {items.map(([label, value, ok, status, details]) => (
          <div key={label} className="rounded-lg border border-border/60 bg-background/50 px-3 py-2.5">
            <dt className="text-[11px] text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 text-sm font-medium">
              {ok ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <AlertCircle className="h-4 w-4 text-yellow-500" />}
              {value}
              {status !== null && <span className="font-mono text-[11px] font-normal text-muted-foreground">HTTP {status}</span>}
            </dd>
            {details?.map((line) => (
              <dd key={line} className="mt-1 break-all text-[11px] text-muted-foreground">
                {line}
              </dd>
            ))}
          </div>
        ))}
      </dl>
      {site.skipped.length > 0 && (
        <div className="border-t border-border/60 px-4 py-3 text-sm">
          <Label>Not fetched</Label>
          <ul className="space-y-0.5 text-muted-foreground">
            {site.skipped.map((s, i) => (
              <li key={i} className="break-all">
                {s.url}: {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  )
}

/** The site's other audits, newest first: the history behind this report. */
export function OtherAudits({ audits }: { audits: PastAudit[] }) {
  if (!audits.length) return null
  return (
    <Panel icon={CalendarClock} title="Other audits of this site">
      <ul>
        {audits.map((a) => (
          <li key={a.id} className="border-b border-border/40 last:border-0">
            <Link href={`/dashboard/aeo-audit/${a.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm transition-colors hover:bg-muted/30">
              <span>{fmtDay(a.createdAt)}</span>
              {a.aeoScore !== null && a.geoScore !== null ? (
                <span className="flex items-center gap-3 font-mono text-xs">
                  <span>
                    AEO <b className={gradeColor(gradeOf(a.aeoScore))}>{a.aeoScore}</b>
                  </span>
                  <span>
                    GEO <b className={gradeColor(gradeOf(a.geoScore))}>{a.geoScore}</b>
                  </span>
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">{a.status === "FAILED" ? "Failed" : a.status === "COMPLETED" ? "No scores" : "Running…"}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

const PHASES: [AuditStatus, string][] = [
  ["CRAWLING", "Crawl the site"],
  ["CHECKING", "Run the checks"],
  ["ANALYZING", "Ask the AI engines"],
]

/** While an audit runs: its phases, how far the current one has got, and whether this is a retry. */
export function Progress({ status, progress, attempts, maxAttempts }: { status: AuditStatus; progress: AuditProgress | null; attempts: number; maxAttempts: number }) {
  const current = PHASES.findIndex(([phase]) => phase === status) // -1 while queued
  // The AI phase asks the engines; it's skipped when the server has no keys for it.
  const counts: [number, number, string][] = []
  if (status === "CRAWLING" && progress?.pages) counts.push([...progress.pages, "pages"])
  if (status === "ANALYZING" && progress?.answers) counts.push([...progress.answers, "answers"])
  const done = counts.reduce((n, c) => n + c[0], 0)
  const total = counts.length ? counts.reduce((n, c) => n + c[1], 0) : undefined
  return (
    <section className="rounded-xl border border-border bg-card p-5" aria-live="polite">
      <ol className="flex flex-col gap-3 sm:flex-row sm:gap-8">
        {PHASES.map(([phase, label], i) => {
          const Icon = i < current ? CheckCircle2 : i === current ? CircleDot : Circle
          return (
            <li key={phase} aria-current={i === current ? "step" : undefined} className={`flex items-center gap-2 text-sm ${i > current ? "text-muted-foreground" : ""} ${i === current ? "font-medium" : ""}`}>
              <Icon className={`h-4 w-4 shrink-0 ${i < current ? "text-green-500" : i === current ? "animate-pulse text-primary" : ""}`} />
              {label}
              {i === current &&
                counts.map(([d, t, what]) => (
                  <span key={what} className="font-normal tabular-nums text-muted-foreground">
                    · {d} of {t} {what}
                  </span>
                ))}
              {i === current && progress?.choosing && <span className="font-normal text-primary">· waiting for your choice of questions</span>}
            </li>
          )
        })}
      </ol>
      {total ? (
        <span className="mt-4 block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span className="block h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${(100 * done) / total}%` }} />
        </span>
      ) : null}
      {attempts > 1 && (
        <p className="mt-3 text-sm text-muted-foreground">
          The previous run stopped partway, so the audit started again (attempt {attempts} of {maxAttempts}).
        </p>
      )}
    </section>
  )
}
