"use client"

/**
 * Credit plans and top-up packs, priced from the API rather than a constant.
 *
 * Every price on this card — the tiers, the pack prices, the free allowance and
 * the per-tool costs — comes from the same `credit_rates` rows that will
 * actually be charged, via quoteCredits. A price shown here and a price charged
 * at spend time cannot drift, because there is only one of them.
 *
 * Kept deliberately short: four cards that each answer "what do I get" in two
 * lines, then packs, then (collapsed) what each tool costs. The free plan is the
 * Google rank tracker only; any plan or pack unlocks every tool.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { Check, ChevronDown, Loader2 } from "lucide-react"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import {
  useCreditRates,
  useCredits,
  formatCredits,
  formatPrice,
  quoteCredits,
  CREDIT_ACTION_KEYS,
  type CreditPlan,
  type CreditRateCard,
} from "@/lib/credits"
import { GRID_SIZES } from "@/components/maps-tracker/grid"

type Interval = "month" | "year"

/**
 * The cards, and which plan slugs (rate-card key minus "plan:") each one sells
 * per billing interval — several slugs means a credit-size picker. Mirrors the
 * backend's CREDIT_PLAN_TIERS. A slug with no rate row is simply not offered.
 * Lite has no monthly slugs: it is annual-only, so the monthly view leaves it out.
 */
const TIERS: { nameKey: string; whoKey: string; popular?: boolean; month: string[]; year: string[] }[] = [
  { nameKey: "planLite", whoKey: "whoLite", month: [], year: ["lite-annual"] },
  { nameKey: "planStarter", whoKey: "whoStarter", month: ["starter-monthly"], year: ["starter-annual"] },
  { nameKey: "planPro", whoKey: "whoPro", popular: true, month: ["pro-monthly"], year: ["pro-annual"] },
  {
    nameKey: "planAgency",
    whoKey: "whoAgency",
    month: ["agency-3k-monthly", "agency-6k-monthly", "agency-9k-monthly"],
    year: ["agency-3k-annual", "agency-6k-annual", "agency-9k-annual"],
  },
]

/** Retired tiers: no longer sold, but people still subscribe to them. */
const LEGACY_NAMES: Record<string, string> = {
  "credits-19": "planStarter",
  "credits-49": "planPro",
  "credits-99": "planAgency",
}

/** Display name for any plan slug, e.g. the billing page's "current plan". */
export function planNameKey(slug: string): string | null {
  return TIERS.find((t) => t.month.includes(slug) || t.year.includes(slug))?.nameKey ?? LEGACY_NAMES[slug] ?? null
}

/** Rounded down, so a discount is never overstated. */
const pctOff = (was: number, now: number) => Math.floor((1 - now / was) * 100)

/** The site size the audit cost note is priced at. */
const EXAMPLE_AUDIT_PAGES = 100

/**
 * The card shell, shared by Free and the paid tiers. The recommended tier is
 * RAISED rather than recoloured — a second blue card beside the blue CTA turns
 * the row into noise.
 */
const CARD_BASE = "relative flex flex-col rounded-2xl border bg-card p-6 shadow-sm"
const CARD_FEATURED = "border-brand shadow-brand/20 shadow-lg lg:-translate-y-2"

function Tick() {
  return <Check className="mt-[3px] size-3.5 shrink-0 text-brand" strokeWidth={2.6} />
}

/** Name, price, monthly credits, who it's for, two lines, button: identical on every card. */
function CardBody({
  name,
  tag,
  picker,
  price,
  was,
  note,
  credits,
  who,
  lines,
}: {
  name: string
  /** A chip beside the name: "−41%", "Annual only". */
  tag?: string
  /** The credit-size picker, for a tier sold in several sizes. */
  picker?: ReactNode
  price: string
  /** The monthly price an annual one is compared against, struck through. */
  was?: string
  /** What is actually charged, and when: "$348 billed yearly · save $240". */
  note?: string
  credits: number
  who: string
  lines: string[]
}) {
  const t = useTranslations("credits")
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-bold tracking-[0.02em] text-brand">{name}</span>
        {tag && (
          <span className="rounded-full bg-pink-600 px-2 py-0.5 text-[10.5px] font-bold text-white">{tag}</span>
        )}
      </div>
      {picker}
      <div className="mt-2.5 flex items-baseline gap-1.5">
        {was && <s className="text-xl font-semibold text-muted-foreground/60 tabular-nums">{was}</s>}
        <b className="text-[38px] font-bold leading-none tracking-[-0.04em] tabular-nums">{price}</b>
        <span className="text-[13px] text-muted-foreground">{t("perMonth")}</span>
      </div>
      {note && <p className="mt-1.5 text-[11.5px] text-muted-foreground">{note}</p>}
      <p className="mt-2.5 text-[13px] font-semibold">{t("creditsAMonth", { credits: formatCredits(credits) })}</p>
      <p className="mt-1 text-[13px] text-muted-foreground">{who}</p>
      <ul className="mt-5 flex flex-1 flex-col gap-2.5 border-t pt-5 text-[13px]">
        {lines.map((line) => (
          <li key={line} className="flex items-start gap-2">
            <Tick />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

function FreeCard({ freeMonthly, current, endsAt }: { freeMonthly: number; current: boolean; endsAt?: string | null }) {
  const t = useTranslations("credits")
  // The free plan lasts FREE_PLAN_MONTHS from signup; say when, or that it has ended.
  const ends = endsAt ? new Date(endsAt) : null
  const who = !ends
    ? t("freeForMonths", { months: 3 })
    : ends > new Date()
      ? t("freeEndsOn", { date: ends.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) })
      : t("freeEnded")
  return (
    <div className={CARD_BASE}>
      <CardBody
        name={t("planFree")}
        tag={t("freeMonthsTag", { months: 3 })}
        price="$0"
        credits={freeMonthly}
        who={who}
        lines={[t("freeRankTracker"), t("freeHistory")]}
      />
      <div className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg border bg-muted text-[13px] font-semibold text-muted-foreground">
        {current ? t("freeCurrent") : t("freeIncluded")}
      </div>
    </div>
  )
}

/**
 * Hand off to the hosted checkout. Both a plan and a top-up go through the same
 * endpoint — the body decides which — so there is one place that can fail and
 * one place that reports it.
 */
async function startCheckout(body: { planSlug?: string; topupCents?: number }): Promise<string | null> {
  try {
    const { url } = await api.post<{ url: string }>("/api/billing/checkout", body)
    return url ?? null
  } catch {
    return null
  }
}

function TierCard({
  tier,
  interval,
  byKey,
  rates,
  currentSlug,
  pending,
  switching,
  highlight,
  introEligible,
  onChoose,
}: {
  tier: (typeof TIERS)[number]
  interval: Interval
  byKey: Map<string, CreditPlan>
  rates: CreditRateCard
  currentSlug: string | undefined
  pending: string | null
  /** Never subscribed: monthly plans show their first-month intro price. */
  introEligible: boolean
  /** The account already subscribes: other plans open up when its plan ends. */
  switching: boolean
  /** Plan slug from a "Get Pro" link on the marketing site. */
  highlight: string | null | undefined
  onChoose: (plan: CreditPlan) => void
}) {
  const t = useTranslations("credits")
  const annualOnly = tier.month.length === 0
  const slugs = interval === "month" ? tier.month : tier.year
  const sizes = slugs.map((s) => byKey.get(`plan:${s}`)).filter((p): p is CreditPlan => !!p)
  // Open on the size the visitor picked elsewhere (either interval), else the smallest.
  const [index, setIndex] = useState(() =>
    Math.max(0, tier.month.indexOf(highlight ?? ""), tier.year.indexOf(highlight ?? "")),
  )
  const plan = sizes[Math.min(index, sizes.length - 1)]
  if (!plan) return null // includes Lite on the monthly view
  const slug = plan.key.replace(/^plan:/, "")
  // The monthly plan of the same size, for the struck-through comparison.
  const monthly = interval === "year" ? byKey.get(`plan:${tier.month[index] ?? ""}`) : undefined
  const save = monthly?.priceCents && plan.priceCents ? (monthly.priceCents - plan.priceCents) * 12 : 0
  const yearly = formatPrice(plan.priceCents == null ? null : plan.priceCents * 12, plan.currency)
  // Monthly, first-time subscribers: the intro month, then the renewal price.
  const intro = interval === "month" && introEligible && plan.introCents && plan.priceCents ? plan.introCents : null
  const note = intro
    ? t("introNote", { price: formatPrice(plan.priceCents, plan.currency) })
    : interval === "year"
      ? save > 0
        ? t("billedYearlySave", { amount: yearly, save: formatPrice(save, plan.currency) })
        : t("billedYearly", { amount: yearly })
      : t("billedMonthly")
  return (
    <PlanCard
      plan={plan}
      price={intro ? formatPrice(intro, plan.currency) : undefined}
      name={t(tier.nameKey)}
      who={t(tier.whoKey)}
      popular={tier.popular}
      tag={
        annualOnly
          ? t("annualOnly")
          : intro
            ? `−${pctOff(plan.priceCents!, intro)}%`
            : save > 0 && monthly?.priceCents
              ? `−${pctOff(monthly.priceCents, plan.priceCents!)}%`
              : undefined
      }
      was={
        intro
          ? formatPrice(plan.priceCents, plan.currency)
          : save > 0
            ? formatPrice(monthly!.priceCents, plan.currency)
            : undefined
      }
      note={note}
      picker={
        sizes.length > 1 ? (
          <div className="mt-2 inline-flex w-fit gap-0.5 rounded-full bg-muted p-0.5" role="group" aria-label={t("creditSize")}>
            {sizes.map((s, i) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={s === plan}
                onClick={() => setIndex(i)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[11.5px] font-bold tabular-nums text-muted-foreground",
                  s === plan && "bg-background text-foreground shadow-sm",
                )}
              >
                {s.credits / 1000}K
              </button>
            ))}
          </div>
        ) : undefined
      }
      rates={rates}
      current={currentSlug === slug}
      busy={pending === plan.key}
      switching={switching}
      highlighted={slugs.includes(highlight ?? "")}
      onChoose={() => onChoose(plan)}
    />
  )
}

function PlanCard({
  plan,
  price,
  name,
  who,
  popular,
  tag,
  was,
  note,
  picker,
  rates,
  current,
  busy,
  switching,
  highlighted,
  onChoose,
}: {
  plan: CreditPlan
  /** Shown instead of the plan's own price — an intro month. */
  price?: string
  name: string
  who: string
  popular?: boolean
  tag?: string
  was?: string
  note?: string
  picker?: ReactNode
  rates: CreditRateCard
  current: boolean
  busy: boolean
  switching: boolean
  highlighted: boolean
  onChoose: () => void
}) {
  const t = useTranslations("credits")
  const ref = useRef<HTMLDivElement>(null)
  // The one number people compare plans by: keywords the allowance keeps
  // checked every day. Divided by the rate card's own price, so it moves when
  // the rate does.
  const perCheck = quoteCredits(rates, CREDIT_ACTION_KEYS.rankCheck)
  const daily = perCheck ? Math.floor(plan.credits / (perCheck * 30)) : null

  // Someone who clicked "Get Pro" elsewhere has already chosen. Bring their
  // choice into view rather than dropping them at the top of the page. Not an
  // auto-redirect to checkout: landing on a payment page you did not ask for is
  // worse than one more click.
  useEffect(() => {
    if (!highlighted) return
    const id = setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 120)
    return () => clearTimeout(id)
  }, [highlighted])

  return (
    <div
      ref={ref}
      className={cn(CARD_BASE, popular && CARD_FEATURED, highlighted && "border-brand ring-2 ring-brand/40")}
    >
      {popular && (
        <span className="absolute -top-2.5 left-6 rounded-full bg-brand px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-white">
          {t("mostPopular")}
        </span>
      )}
      <CardBody
        name={name}
        tag={tag}
        picker={picker}
        price={price ?? formatPrice(plan.priceCents, plan.currency)}
        was={was}
        note={note}
        credits={plan.credits}
        who={who}
        lines={[t("paidEveryTool"), ...(daily ? [t("buysDaily", { credits: formatCredits(daily) })] : [])]}
      />
      <button
        type="button"
        disabled={current || busy || switching}
        onClick={onChoose}
        className={cn(
          "mt-6 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg text-[13px] font-semibold transition-colors disabled:opacity-70",
          current
            ? "cursor-default border bg-muted text-muted-foreground"
            : popular
              ? "bg-brand text-white hover:brightness-110"
              : "border hover:border-brand hover:bg-muted",
        )}
      >
        {busy && <Loader2 className="size-3.5 animate-spin" />}
        {current
          ? t("currentPlan")
          : switching
            ? t("planLocked")
            : busy
              ? t("openingCheckout")
              : t("choosePlan", { plan: name })}
      </button>
    </div>
  )
}

/** "3" or "3–57": the cheapest and dearest way to run a tool, from the rate card. */
function span(low: number | null, high: number | null): string | null {
  if (low == null || high == null) return low == null ? null : formatCredits(low)
  return low === high ? formatCredits(low) : `${formatCredits(low)}–${formatCredits(high)}`
}

/** Smallest and largest map grids the tracker offers. */
const GRID_POINTS_MIN = GRID_SIZES[0] ** 2
const GRID_POINTS_MAX = GRID_SIZES[GRID_SIZES.length - 1] ** 2

type ToolRow = { name: string; whatKey: string; costKey: string; cost: string | null; note?: string }

// Tool NAMES stay in English: they are product names, and a translated row
// that renames the tool no longer matches the sidebar the user clicks.
function toolRows(rates: CreditRateCard, t: (k: string, v?: Record<string, string>) => string): ToolRow[] {
  const q = (action: string, units = 1, variant?: string) => quoteCredits(rates, action, units, variant)
  const standard = q(CREDIT_ACTION_KEYS.rankCheck)
  const priority = q(CREDIT_ACTION_KEYS.rankCheckPriority)
  const perAudit = q(CREDIT_ACTION_KEYS.siteCrawlPage, EXAMPLE_AUDIT_PAGES)
  return [
    // The Google tracker is the one row where the headline number is a range.
    // A manual check of a few keywords on a paid plan goes to the priority
    // queue so the answer comes back in seconds; scheduled and bulk checks are
    // standard. Printing a flat "1 / keyword" made the ledger's -2 look like a
    // bug — which is exactly how it was reported.
    {
      name: "Keyword Rank Tracker",
      whatKey: "toolRankWhat",
      costKey: "costPerKeyword",
      cost: span(standard, priority),
      note:
        standard != null && priority != null && priority !== standard
          ? t("costPerKeywordNote", { standard: formatCredits(standard), priority: formatCredits(priority) })
          : undefined,
    },
    // YouTube has no priority queue price: every check is the same rate.
    { name: "YouTube Rank Tracker", whatKey: "toolYoutubeWhat", costKey: "costPerKeyword", cost: span(q(CREDIT_ACTION_KEYS.youtubeCheck), null) },
    {
      name: "Google Maps Tracker",
      whatKey: "toolMapsWhat",
      costKey: "costPerScan",
      cost: span(q(CREDIT_ACTION_KEYS.mapsScanPoint, GRID_POINTS_MIN), q(CREDIT_ACTION_KEYS.mapsScanPoint, GRID_POINTS_MAX)),
    },
    {
      name: "Keyword Magic Tool",
      whatKey: "toolMagicWhat",
      costKey: "costPerSearch",
      cost: span(q(CREDIT_ACTION_KEYS.keywordMagicSearch, 1, "free"), q(CREDIT_ACTION_KEYS.keywordMagicSearch, 1, "paid")),
    },
    // Per page crawled, so the honest example is a site size, not "per audit".
    {
      name: "Website Audit",
      whatKey: "toolAuditWhat",
      costKey: "costPerPage",
      cost: span(q(CREDIT_ACTION_KEYS.siteCrawlPage), null),
      note: perAudit != null ? t("costPerAuditNote", { pages: formatCredits(EXAMPLE_AUDIT_PAGES), credits: formatCredits(perAudit) }) : undefined,
    },
    { name: "Competitor Analysis", whatKey: "toolCompetitorWhat", costKey: "costPerAnalysis", cost: span(q(CREDIT_ACTION_KEYS.competitorAnalysis), null) },
    { name: "AI Internal Linking", whatKey: "toolLinkingWhat", costKey: "costPerCrawl", cost: span(q(CREDIT_ACTION_KEYS.internalLinking), null) },
    { name: "Keyword Score Checker", whatKey: "toolScoreWhat", costKey: "costPerPage", cost: span(q(CREDIT_ACTION_KEYS.keywordScore), null) },
    { name: "Quick Serp", whatKey: "toolQuickWhat", costKey: "costPerLookup", cost: span(q(CREDIT_ACTION_KEYS.liveCheck), q(CREDIT_ACTION_KEYS.liveCheck, 1, "paid")) },
    { name: "Search Console & GA4", whatKey: "toolConsoleWhat", costKey: "costFree", cost: "" },
  ]
}

/** What each tool costs in credits — reference material, so it starts folded. */
export function CreditCosts({ rates }: { rates: CreditRateCard }) {
  const t = useTranslations("credits")
  return (
    <details className="group overflow-hidden rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-[14px] font-semibold [&::-webkit-details-marker]:hidden">
        {t("everyToolTitle")}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      {toolRows(rates, t).filter((tool) => tool.cost != null).map((tool) => (
        <div key={tool.name} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t px-5 py-3">
          <div className="min-w-0">
            <div className="text-[13px] font-medium">{tool.name}</div>
            <p className="mt-0.5 text-xs text-muted-foreground">{t(tool.whatKey)}</p>
            {tool.note && <p className="mt-1 text-[11px] leading-snug text-muted-foreground/80">{tool.note}</p>}
          </div>
          <span className="shrink-0 text-xs font-semibold tabular-nums text-brand">
            {t(tool.costKey, { cost: tool.cost ?? "" })}
          </span>
        </div>
      ))}
    </details>
  )
}

export function CreditPricing({
  className,
  /** Plan slug or pack key to ring and scroll to, from ?plan= / ?topup=. */
  highlight,
}: {
  className?: string
  highlight?: string | null
}) {
  const t = useTranslations("credits")
  const { rates, loading } = useCreditRates()
  const { credits } = useCredits()
  // Which button is mid-checkout, and whether the last attempt failed. A dead
  // button with no explanation is the worst outcome on a pricing page.
  const [pending, setPending] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const packsRef = useRef<HTMLDivElement>(null)

  // "Buy credits" links from anywhere in the app land here with ?topup=packs.
  // The packs sit below the plans, so without this the person who came to buy
  // credits lands on a row of subscriptions and has to go looking. Keyed on
  // `loading` because the block only exists once the rate card has arrived.
  useEffect(() => {
    if (highlight !== "packs" || loading) return
    const id = setTimeout(() => packsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 120)
    return () => clearTimeout(id)
  }, [highlight, loading])

  const go = async (key: string, body: { planSlug?: string; topupCents?: number }) => {
    setPending(key)
    setFailed(false)
    const url = await startCheckout(body)
    if (url) {
      window.location.href = url
      return
    }
    setPending(null)
    setFailed(true)
  }

  // No plan changes mid-period, by policy: a subscriber tops up for more
  // credits now, and picks another plan once theirs ends (cancel in Billing).
  // The server refuses a second checkout anyway (already_subscribed), and the
  // Stripe portal has upgrades/downgrades switched off.
  const subscribed = !!credits?.planSlug && credits.planSlug !== "free"

  // Annual unless the visitor arrived holding a monthly plan's link, or is on one.
  const isMonthly = (slug: string | null | undefined) => !!slug && TIERS.some((t) => t.month.includes(slug))
  const [interval, setBilling] = useState<Interval>(isMonthly(highlight) ? "month" : "year")
  const currentSlug = credits?.planSlug
  useEffect(() => {
    if (!highlight && isMonthly(currentSlug)) setBilling("month")
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the plan arrives
  }, [currentSlug])

  const byKey = useMemo(() => new Map((rates?.plans ?? []).map((p) => [p.key, p])), [rates])

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground", className)}>
        <Loader2 className="size-4 animate-spin" /> {t("loadingPlans")}
      </div>
    )
  }
  if (!rates || byKey.size === 0) return null

  return (
    <section className={cn("flex flex-col gap-6", className)}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full bg-muted p-1" role="group" aria-label={t("billing")}>
          {(["month", "year"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={interval === v}
              onClick={() => setBilling(v)}
              className={cn(
                "rounded-full px-4 py-1.5 text-[13px] font-semibold text-muted-foreground",
                interval === v && "bg-background text-foreground shadow-sm",
              )}
            >
              {t(v === "month" ? "billingMonthly" : "billingAnnual")}
            </button>
          ))}
        </div>
        <span className="text-[12.5px] font-bold text-pink-600">{t("annualSaves")}</span>
      </div>

      {/* Free in the same row as the paid tiers, so the range reads as one scale. */}
      {/* Lite is annual-only, so the monthly view has one card fewer. */}
      <div
        className={cn(
          "grid items-stretch gap-5 sm:grid-cols-2 lg:pt-3",
          interval === "year" ? "lg:grid-cols-3 xl:grid-cols-5" : "xl:grid-cols-4",
        )}
      >
        <FreeCard freeMonthly={rates.freeMonthly} current={credits?.planSlug === "free"} endsAt={credits?.freeEndsAt} />
        {TIERS.map((tier) => (
          <TierCard
            key={tier.nameKey}
            tier={tier}
            interval={interval}
            byKey={byKey}
            rates={rates}
            currentSlug={currentSlug}
            pending={pending}
            switching={subscribed}
            highlight={highlight}
            introEligible={credits?.introEligible ?? false}
            onChoose={(p) => void go(p.key, { planSlug: p.key.replace(/^plan:/, "") })}
          />
        ))}
      </div>

      {subscribed && <p className="text-[13px] text-muted-foreground">{t("subscribedNote")}</p>}

      {failed && <p className="text-xs font-medium text-red-600 dark:text-red-400">{t("checkoutFailed")}</p>}

      {rates.topup && (
        <div
          ref={packsRef}
          className={cn("rounded-xl border bg-card p-5 shadow-sm", highlight === "packs" && "border-brand ring-2 ring-brand/40")}
        >
          <AddFunds
            topup={rates.topup}
            subscribed={subscribed}
            busy={pending === "topup"}
            onTopup={(cents) => void go("topup", { topupCents: cents })}
          />
        </div>
      )}
    </section>
  )
}

const TOPUP_PRESETS = [5, 100, 200, 500, 1_000]

/**
 * Top up any whole-dollar amount on top of a plan. Subscribers only — the
 * server refuses anyone else (topup_needs_plan), so a free account sees why
 * instead of a form that cannot work.
 */
function AddFunds({
  topup,
  subscribed,
  busy,
  onTopup,
}: {
  topup: NonNullable<CreditRateCard["topup"]>
  subscribed: boolean
  busy: boolean
  onTopup: (cents: number) => void
}) {
  const t = useTranslations("credits")
  const min = topup.minCents / 100
  const max = topup.maxCents / 100
  const [amount, setAmount] = useState(String(min))
  const dollars = Number(amount)
  const valid = Number.isInteger(dollars) && dollars >= min && dollars <= max

  if (!subscribed) {
    return (
      <>
        <h3 className="text-[15px] font-semibold">{t("topupTitle")}</h3>
        <p className="mt-1 text-[13px] text-muted-foreground">{t("topupNeedsPlan")}</p>
      </>
    )
  }
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) onTopup(dollars * 100)
      }}
    >
      <div>
        <h3 className="text-[15px] font-semibold">{t("topupTitle")}</h3>
        <p className="mt-1 text-[13px] text-muted-foreground">{t("topupNote", { months: topup.expiryMonths })}</p>
      </div>
      <label className="flex max-w-sm flex-col gap-1.5 text-[13px] font-semibold">
        {t("topupAmount")}
        <span className="flex h-11 items-center gap-2 rounded-lg border bg-background px-3 focus-within:border-brand">
          <span className="text-muted-foreground">$</span>
          <input
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            step={1}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-transparent text-[15px] font-semibold tabular-nums outline-none"
          />
        </span>
        <span className="text-[11.5px] font-normal text-muted-foreground">
          {t("topupLimits", { min: formatPrice(topup.minCents), max: formatPrice(topup.maxCents) })}
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        {TOPUP_PRESETS.filter((p) => p >= min && p <= max).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setAmount(String(p))}
            aria-pressed={dollars === p}
            className={cn(
              "rounded-full border px-3 py-1 text-[12.5px] font-semibold tabular-nums transition-colors hover:border-brand",
              dollars === p && "border-brand bg-brand/10 text-brand",
            )}
          >
            {formatPrice(p * 100)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!valid || busy}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand px-5 text-[13px] font-semibold text-white hover:brightness-110 disabled:opacity-60"
        >
          {busy && <Loader2 className="size-3.5 animate-spin" />}
          {busy ? t("openingCheckout") : t("topupButton", { amount: valid ? formatPrice(dollars * 100) : "" })}
        </button>
        {valid && (
          <span className="text-[12.5px] text-muted-foreground">
            {t("topupGets", { credits: formatCredits(dollars * topup.creditsPerDollar) })}
          </span>
        )}
      </div>
    </form>
  )
}
