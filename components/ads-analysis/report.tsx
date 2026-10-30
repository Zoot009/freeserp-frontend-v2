"use client"

// The Google Ads Analysis report: one long page (no tabs), so the screen, the
// printed PDF and the shared link all read the same, top to bottom.
import { useState, type ReactNode } from "react"
import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  CircleHelp,
  ExternalLink,
  Loader2,
  MapPin,
  MessageCircle,
  MousePointerClick,
  Phone,
  ClipboardList,
  Star,
  XCircle,
} from "lucide-react"
import { Panel, ScoreRing } from "@/components/gbp-audit/report"
import {
  BAND_LABEL,
  host,
  money,
  pathOf,
  range,
  SCORE_LABEL,
  WEIGHTS,
  type AdsAnalysisResponse,
  type Assumptions,
  type Fold,
  type Issue,
  type ModuleKey,
  type Priority,
  type ScoreKey,
  type TagStatus,
} from "@/lib/ads-analysis"

const fmtDate = (iso: string) => new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
const num = (n: number) => n.toLocaleString("en-US")

const BAND_TONE = {
  ready: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  needs_work: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  not_ready: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
} as const

const PRIORITY_TONE: Record<Priority, string> = {
  critical: "bg-red-500/10 text-red-700 dark:text-red-400",
  high: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  medium: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  low: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
}

function Pill({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{children}</span>
}

const barFill = (v: number) => (v >= 80 ? "bg-emerald-500" : v >= 60 ? "bg-amber-500" : "bg-slate-400")

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

export function AdsHero({ data }: { data: AdsAnalysisResponse }) {
  const { analysis, scorecard, result } = data
  const overall = scorecard?.overall ?? null
  return (
    <section className="rounded-[10px] border border-border bg-card p-4 shadow-sm sm:p-5 print:shadow-none">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          {overall !== null ? <ScoreRing score={overall} size={84} stroke={7} showMax /> : <div className="grid h-[84px] w-[84px] shrink-0 place-items-center rounded-full border-[7px] border-muted" />}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight">{host(analysis.origin)}</h1>
              {scorecard?.band && <Pill tone={BAND_TONE[scorecard.band]}>{BAND_LABEL[scorecard.band]}</Pill>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {analysis.locationLabel}
              </span>
              <span>{analysis.services.join(" · ")}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {result ? `Last scanned ${fmtDate(result.scannedAt)}` : `Started ${fmtDate(analysis.createdAt)}`}
              {result ? ` · ${num(result.site.pagesFound)} pages found` : ""}
            </div>
          </div>
        </div>
        {scorecard && (
          <div className="grid flex-[1.2] grid-cols-2 gap-x-5 gap-y-2.5 sm:grid-cols-3">
            {(Object.keys(WEIGHTS) as ScoreKey[]).map((k) => {
              const v = scorecard.modules[k]
              return (
                <div key={k} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="truncate text-muted-foreground">
                      {SCORE_LABEL[k]} <span className="text-[10px] opacity-70">{WEIGHTS[k]}%</span>
                    </span>
                    <span className="font-semibold tabular-nums">{v === null ? "–" : v}</span>
                  </div>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                    {v !== null && <span className={`block h-full rounded-full ${barFill(v)}`} style={{ width: `${v}%` }} />}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// While it runs
// ---------------------------------------------------------------------------

const STEPS: { key: ModuleKey | "score"; label: string }[] = [
  { key: "crawl", label: "Reading the site" },
  { key: "match", label: "Matching services to pages" },
  { key: "speed", label: "Speed, browser and technical checks" },
  { key: "keywords", label: "Keywords and costs" },
  { key: "score", label: "Scoring" },
]

export function AdsProgress({ progress }: { progress: AdsAnalysisResponse["analysis"]["progress"] }) {
  const at = Math.max(0, STEPS.findIndex((s) => s.key === (progress?.step ?? "crawl")))
  return (
    <Panel title="Analysing this site" hint="This page updates by itself. Most analyses take two to four minutes.">
      <ol className="space-y-2.5">
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2.5 text-[13px]">
            {i < at ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : i === at ? (
              <Loader2 className="h-4 w-4 animate-spin text-brand" />
            ) : (
              <CircleDashed className="h-4 w-4 text-muted-foreground/50" />
            )}
            <span className={i > at ? "text-muted-foreground" : ""}>{s.label}</span>
          </li>
        ))}
      </ol>
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

export function AdsReport({ data, onSaveAssumptions }: { data: AdsAnalysisResponse; onSaveAssumptions?: (a: Partial<Assumptions>) => Promise<void> }) {
  const { result, scorecard } = data
  if (!result || !scorecard) return null
  const failed = Object.entries(result.modules).filter(([, m]) => m && m.status === "failed")
  return (
    <div className="space-y-5">
      {failed.length > 0 && (
        <p className="flex items-start gap-2 rounded-[10px] border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span>
            Some checks couldn&apos;t run this time ({failed.map(([k, m]) => m?.detail ?? k).join("; ")}). They&apos;re left out of the score rather than counted against
            you.
          </span>
        </p>
      )}
      <Priorities issues={scorecard.issues} />
      <LandingPages data={data} />
      <div className="grid gap-5 lg:grid-cols-2">
        <TrackingPanel data={data} />
        <SpeedPanel data={data} />
      </div>
      <BudgetPanel data={data} onSave={onSaveAssumptions} />
      <KeywordsPanel data={data} />
      <div className="grid gap-5 lg:grid-cols-2">
        <QuickWinsPanel data={data} />
        <TechnicalPanel data={data} />
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Keyword volumes and costs per click are Google Ads estimates via DataForSEO for {data.analysis.locationLabel}. Page speed is Google PageSpeed Insights (mobile).
        Forecasts are ranges from those estimates and your assumptions, not a promise of results. Tags were detected from outside the site: whether a click-to-call
        or WhatsApp click is tracked as a conversion can only be confirmed inside Google Ads.
      </p>
    </div>
  )
}

function Priorities({ issues }: { issues: Issue[] }) {
  const [all, setAll] = useState(false)
  if (!issues.length) {
    return (
      <Panel title="Top priorities">
        <p className="text-[13px] text-muted-foreground">Nothing urgent found. The site is in good shape for ads.</p>
      </Panel>
    )
  }
  return (
    <Panel title="Top priorities" hint="Fix these before spending on ads, in this order." meta={<span>{issues.length} to fix</span>} flush>
      <ul className="divide-y divide-border">
        {/* Past the first 6, hidden on screen until "Show all", but always printed. */}
        {issues.map((i, n) => (
          <li key={n} className={`${n >= 6 && !all ? "hidden print:grid" : "grid"} gap-1.5 px-4 py-3 sm:grid-cols-[88px_minmax(0,1fr)] sm:gap-3`}>
            <div>
              <Pill tone={PRIORITY_TONE[i.priority]}>{i.priority[0]!.toUpperCase() + i.priority.slice(1)}</Pill>
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold">{i.title}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {i.where} · {i.impact}
              </div>
              <div className="mt-1 text-xs leading-relaxed">{i.fix}</div>
            </div>
          </li>
        ))}
      </ul>
      {issues.length > 6 && (
        <button type="button" onClick={() => setAll((v) => !v)} className={`w-full border-border px-4 py-2.5 text-xs font-medium text-brand hover:bg-muted/50 print:hidden ${all ? "border-t" : ""}`}>
          {all ? "Show fewer" : `Show all ${issues.length}`}
        </button>
      )}
    </Panel>
  )
}

const MATCH_TONE = {
  found: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  weak: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  missing: "bg-red-500/10 text-red-700 dark:text-red-400",
} as const
const MATCH_LABEL = { found: "Page found", weak: "General page", missing: "No page" } as const

function FoldIcons({ fold, label }: { fold: Fold; label: string }) {
  const item = (on: boolean, Icon: typeof Phone, name: string) => (
    <span title={`${name}: ${on ? "visible" : "not visible"} above the fold`} className={`inline-flex items-center gap-1 ${on ? "text-foreground" : "text-muted-foreground/50 line-through"}`}>
      <Icon className="h-3.5 w-3.5" /> {name}
    </span>
  )
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span className="w-14 text-muted-foreground">{label}</span>
      {item(fold.phone, Phone, "Phone")}
      {item(fold.form, ClipboardList, "Form")}
      {item(fold.whatsapp, MessageCircle, "WhatsApp")}
      {item(fold.cta !== "none", MousePointerClick, fold.cta === "weak" ? "CTA (weak)" : "CTA")}
    </div>
  )
}

function LandingPages({ data }: { data: AdsAnalysisResponse }) {
  const { services, pages } = data.result!
  const byUrl = new Map(pages.map((p) => [p.url, p]))
  return (
    <Panel title="Landing pages" hint="Where each service's ads should land, and what a visitor sees on the first screen." flush>
      <ul className="divide-y divide-border">
        {services.map((s) => {
          const page = s.url ? byUrl.get(s.url) : undefined
          return (
            <li key={s.name} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold">{s.name}</span>
                <Pill tone={MATCH_TONE[s.status]}>{MATCH_LABEL[s.status]}</Pill>
                {s.url && (
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 truncate text-xs text-brand hover:underline">
                    {pathOf(s.url)} <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                )}
                {s.source !== "user" && s.status !== "missing" && <span className="text-[11px] text-muted-foreground">{s.confidence}% match</span>}
              </div>
              {s.reason && <p className="mt-1 text-xs text-muted-foreground">{s.reason}</p>}
              {s.suggestion && (
                <div className="mt-2 rounded-lg bg-muted/50 px-3 py-2 text-xs leading-relaxed">
                  <span className="font-medium">Create:</span> <code className="text-[11px]">{s.suggestion.slug}</code> · Title &ldquo;{s.suggestion.title}&rdquo; · H1 &ldquo;
                  {s.suggestion.h1}&rdquo;
                </div>
              )}
              {page?.fold && (
                <div className="mt-2 space-y-1">
                  <FoldIcons fold={page.fold.mobile} label="Mobile" />
                  <FoldIcons fold={page.fold.desktop} label="Desktop" />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

const TAG_UI: Record<TagStatus, { icon: typeof CheckCircle2; tone: string; label: string }> = {
  detected: { icon: CheckCircle2, tone: "text-emerald-600 dark:text-emerald-400", label: "Detected" },
  not_found: { icon: XCircle, tone: "text-red-500", label: "Not found" },
  cannot_confirm: { icon: CircleHelp, tone: "text-muted-foreground", label: "Can't confirm" },
}

function TrackingPanel({ data }: { data: AdsAnalysisResponse }) {
  const t = data.result!.tracking
  const rows: [string, TagStatus, string[]?][] = t
    ? [
        ["Google Ads conversion", t.adsConversion],
        ["Google Ads tag", t.adsTag, t.ids.ads],
        ["Google Analytics 4", t.ga4, t.ids.ga4],
        ["Google Tag Manager", t.gtm, t.ids.gtm],
        ["Call tracking", t.callTracking, t.ids.callTracking],
        ["Meta Pixel", t.metaPixel],
        ["UTM-tagged links", t.utmLinks],
        ["Click-to-call / WhatsApp events", t.clickEvents],
      ]
    : []
  return (
    <Panel title="Tracking" hint="Without conversion tracking, Google Ads can't tell which clicks became leads, so it can't optimise for them." flush>
      {t ? (
        <ul className="divide-y divide-border">
          {rows.map(([label, status, ids]) => {
            const ui = TAG_UI[status]
            return (
              <li key={label} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                <ui.icon className={`h-4 w-4 shrink-0 ${ui.tone}`} />
                <span className="min-w-0 flex-1">
                  {label}
                  {ids && ids.length > 0 && <span className="ml-2 text-[11px] text-muted-foreground">{ids.slice(0, 3).join(", ")}</span>}
                </span>
                <span className={`text-xs ${ui.tone}`}>{ui.label}</span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="p-4 text-[13px] text-muted-foreground">The pages couldn&apos;t be opened in a browser this time, so tracking wasn&apos;t checked.</p>
      )}
    </Panel>
  )
}

const lcpTone = (ms: number) => (ms <= 2500 ? "text-emerald-600 dark:text-emerald-400" : ms <= 4000 ? "text-amber-600" : "text-red-500")
const clsTone = (v: number) => (v <= 0.1 ? "text-emerald-600 dark:text-emerald-400" : v <= 0.25 ? "text-amber-600" : "text-red-500")

function SpeedPanel({ data }: { data: AdsAnalysisResponse }) {
  const pages = data.result!.pages
  return (
    <Panel title="Speed & mobile" hint="Mobile PageSpeed. Slow landing pages raise your cost per click and lose visitors before they see the offer." flush>
      <ul className="divide-y divide-border">
        {pages.map((p) => {
          const lcp = p.psi ? (p.psi.field?.lcpMs ?? p.psi.lcpMs) : null
          const cls = p.psi ? (p.psi.field?.cls ?? p.psi.cls) : null
          return (
            <li key={p.url} className="flex items-center gap-3 px-4 py-2.5">
              {p.psi ? <ScoreRing score={p.psi.score} size={36} stroke={4} /> : <span className="grid h-9 w-9 place-items-center text-xs text-muted-foreground">–</span>}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{pathOf(p.url)}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                  {lcp !== null && <span className={lcpTone(lcp)}>LCP {(Math.ceil(lcp / 100) / 10).toFixed(1)}s</span>}
                  {cls !== null && <span className={clsTone(cls)}>CLS {cls.toFixed(2)}</span>}
                  {p.psi?.field?.inpMs !== undefined && <span>INP {Math.round(p.psi.field.inpMs)}ms</span>}
                  {p.psi && <span>{p.psi.field ? "real visitors" : "lab test"}</span>}
                  {!p.psi && <span>PageSpeed didn&apos;t answer</span>}
                  {p.layout?.horizontalScroll && <span className="text-red-500">Scrolls sideways</span>}
                  {p.layout && p.layout.smallText > 10 && <span className="text-amber-600">Small text</span>}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

function BudgetPanel({ data, onSave }: { data: AdsAnalysisResponse; onSave?: (a: Partial<Assumptions>) => Promise<void> }) {
  const { forecast: f, assumptions, convRateRange } = data
  const [budget, setBudget] = useState(assumptions.budgetUsd?.toString() ?? "")
  const [jobValue, setJobValue] = useState(assumptions.jobValueUsd?.toString() ?? "")
  const [conv, setConv] = useState(String(Math.round(assumptions.convRate * 100)))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const save = async () => {
    if (!onSave) return
    const n = (s: string) => (s.trim() === "" ? null : Math.max(0, Number(s)))
    const rate = Number(conv) / 100
    if ([n(budget), n(jobValue)].some((v) => v !== null && !Number.isFinite(v)) || !Number.isFinite(rate)) {
      setError("Enter numbers only.")
      return
    }
    setSaving(true)
    setError("")
    try {
      await onSave({ budgetUsd: n(budget), jobValueUsd: n(jobValue), convRate: Math.min(convRateRange.max, Math.max(convRateRange.min, rate)) })
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't update the forecast.")
    } finally {
      setSaving(false)
    }
  }

  const field = "h-9 w-full rounded-lg border border-border bg-background px-2.5 text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
  return (
    <Panel title="Budget forecast" hint="A range, never a promise: costs per click and conversion rates move from week to week.">
      {f ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label={f.suggested ? "Suggested budget" : "Monthly budget"} value={money(f.budget)} note={f.suggested ? "≈100 clicks a month" : undefined} />
              <Stat label="Avg. cost per click" value={money(f.avgCpc, 2)} />
              <Stat label="Clicks a month" value={range(f.clicks, num)} />
              <Stat label="Leads a month" value={range(f.leads, num)} note={`at ${Math.round(f.convRate * 100)}% conversion`} />
              <Stat label="Cost per lead" value={range(f.costPerLead, (n) => money(n))} />
              {f.breakevenJobs !== null && <Stat label="Jobs to break even" value={num(f.breakevenJobs)} note="a month" />}
            </div>
          </div>
          {onSave ? (
            <div className="rounded-lg border border-border p-3 print:hidden">
              <div className="mb-2 text-xs font-semibold">Your numbers</div>
              <div className="space-y-2">
                <label className="block text-[11px] text-muted-foreground">
                  Monthly budget (USD)
                  <input className={field} inputMode="decimal" placeholder={`Suggested ${money(f.budget)}`} value={budget} onChange={(e) => setBudget(e.target.value)} />
                </label>
                <label className="block text-[11px] text-muted-foreground">
                  Average job value (USD)
                  <input className={field} inputMode="decimal" placeholder="e.g. 350" value={jobValue} onChange={(e) => setJobValue(e.target.value)} />
                </label>
                <label className="block text-[11px] text-muted-foreground">
                  Conversion rate: {conv}%
                  <input
                    type="range"
                    className="mt-1 w-full accent-brand"
                    min={convRateRange.min * 100}
                    max={convRateRange.max * 100}
                    step={1}
                    value={conv}
                    onChange={(e) => setConv(e.target.value)}
                  />
                </label>
                {error && <p className="text-[11px] text-red-500">{error}</p>}
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-[7px] bg-brand text-[13px] font-medium text-white hover:bg-brand-deep disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Update forecast
                </button>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              {assumptions.jobValueUsd ? `Average job value ${money(assumptions.jobValueUsd)}. ` : ""}Conversion rate {Math.round(assumptions.convRate * 100)}%.
            </div>
          )}
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">No cost-per-click data for these services in {data.analysis.locationLabel}, so there&apos;s no forecast.</p>
      )}
    </Panel>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-[17px] font-semibold tabular-nums">{value}</div>
      {note && <div className="text-[10px] text-muted-foreground">{note}</div>}
    </div>
  )
}

const compTone = (c: number) => (c >= 0.66 ? "text-red-500" : c >= 0.33 ? "text-amber-600" : "text-emerald-600 dark:text-emerald-400")

function KeywordsPanel({ data }: { data: AdsAnalysisResponse }) {
  const k = data.result!.keywords
  if (!k) {
    return (
      <Panel title="Keywords & ad groups">
        <p className="text-[13px] text-muted-foreground">Keyword data wasn&apos;t available this time.</p>
      </Panel>
    )
  }
  return (
    <Panel
      title="Keywords & ad groups"
      hint="One ad group per service, landing on its own page. Volumes and costs are for the location you chose."
      meta={<span>Campaigns: {k.campaignTypes.join(", ")}</span>}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {k.groups.map((g) => (
          <div key={g.service} className="min-w-0 rounded-lg border border-border">
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
              <span className="truncate text-[13px] font-semibold">{g.service}</span>
              <span className="truncate text-[11px] text-muted-foreground">{g.landingUrl ? `→ ${pathOf(g.landingUrl)}` : "→ page needed"}</span>
            </div>
            <table className="w-full text-xs">
              <thead className="text-[11px] text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">Keyword</th>
                  <th className="px-2 py-1.5 text-right font-medium">Searches/mo</th>
                  <th className="px-2 py-1.5 text-right font-medium">CPC</th>
                  <th className="px-3 py-1.5 text-right font-medium">Competition</th>
                </tr>
              </thead>
              <tbody>
                {g.keywords.map((r) => (
                  <tr key={r.term} className="border-t border-border/60">
                    <td className="max-w-0 truncate px-3 py-1.5">{r.term}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.volume === null ? "–" : num(r.volume)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.cpc === null ? "–" : money(r.cpc, 2)}</td>
                    <td className={`px-3 py-1.5 text-right ${r.competition === null ? "" : compTone(r.competition)}`}>
                      {r.competition === null ? "–" : r.competition >= 0.66 ? "High" : r.competition >= 0.33 ? "Medium" : "Low"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <div className="mb-1.5 text-xs font-semibold">Negative keywords to add</div>
        <div className="flex flex-wrap gap-1.5">
          {k.negatives.map((n) => (
            <span key={n} className="rounded-md bg-muted px-2 py-0.5 text-[11px]">
              -{n}
            </span>
          ))}
        </div>
      </div>
    </Panel>
  )
}

function QuickWinsPanel({ data }: { data: AdsAnalysisResponse }) {
  const q = data.result!.quickWins
  return (
    <Panel title="Quick wins">
      <div className="space-y-4 text-[13px]">
        {q.ranking.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-semibold">Close to page one (positions 4–15)</div>
            <p className="mb-2 text-xs text-muted-foreground">From your Rank Tracker. Ads on these terms cover the gap while the page climbs.</p>
            <ul className="space-y-1">
              {q.ranking.map((r) => (
                <li key={r.keyword} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate">{r.keyword}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">#{r.position}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {q.gbp && (
          <div>
            <div className="mb-1 text-xs font-semibold">Google Business Profile</div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span>{q.gbp.name}</span>
              {q.gbp.rating !== null && (
                <span className="inline-flex items-center gap-0.5">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {q.gbp.rating.toFixed(1)}
                  {q.gbp.reviews !== null && <span className="text-muted-foreground"> ({num(q.gbp.reviews)})</span>}
                </span>
              )}
              {q.gbp.claimed === false && <Pill tone={PRIORITY_TONE.high}>Not claimed</Pill>}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Link it to Google Ads to show your address and rating on ads.</p>
          </div>
        )}
        <div>
          <div className="mb-1.5 text-xs font-semibold">Ad assets to set up</div>
          <div className="flex flex-wrap gap-1.5">
            {q.extensions.map((e) => (
              <span key={e} className="rounded-md bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">
                {e}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  )
}

function TechnicalPanel({ data }: { data: AdsAnalysisResponse }) {
  const t = data.result!.technical
  if (!t) {
    return (
      <Panel title="Technical health">
        <p className="text-[13px] text-muted-foreground">The technical checks didn&apos;t run this time.</p>
      </Panel>
    )
  }
  const row = (ok: boolean | null, label: string, detail?: string) => {
    const Icon = ok === null ? CircleHelp : ok ? CheckCircle2 : XCircle
    return (
      <li className="flex items-start gap-2.5 text-[13px]">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${ok === null ? "text-muted-foreground" : ok ? "text-emerald-500" : "text-red-500"}`} />
        <span>
          {label}
          {detail && <span className="block text-[11px] text-muted-foreground">{detail}</span>}
        </span>
      </li>
    )
  }
  return (
    <Panel title="Technical health">
      <ul className="space-y-2.5">
        {row(
          t.ssl ? t.ssl.valid && (t.ssl.daysLeft ?? 99) >= 14 : null,
          t.ssl?.valid ? "SSL certificate valid" : "SSL certificate problem",
          t.ssl?.valid && t.ssl.daysLeft !== null ? `Expires in ${t.ssl.daysLeft} days` : t.ssl?.error,
        )}
        {row(t.httpsRedirect, t.httpsRedirect === false ? "http:// doesn't redirect to https://" : "http:// redirects to https://")}
        {row(t.mixedContent === null ? null : t.mixedContent === 0, t.mixedContent ? `${t.mixedContent} insecure resources` : "No insecure (http://) resources")}
        {row(t.brokenLinks.length === 0, t.brokenLinks.length ? `${t.brokenLinks.length} broken link${t.brokenLinks.length === 1 ? "" : "s"}` : "No broken links", `${num(t.linksChecked)} links checked`)}
      </ul>
      {t.brokenLinks.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border pt-3 text-[11px]">
          {t.brokenLinks.slice(0, 10).map((b) => (
            <li key={b.url} className="flex gap-2">
              <span className="shrink-0 tabular-nums text-red-500">{b.status ?? "–"}</span>
              <span className="min-w-0 truncate">{b.url}</span>
              <span className="hidden min-w-0 max-w-[40%] truncate text-muted-foreground sm:inline">on {pathOf(b.on)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
