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

import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Check, ChevronDown, Loader2 } from "lucide-react"
import { api, ApiError } from "@/lib/api"
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

/** Display names and the case each tier is for. Keyed by the rate-card key. */
const PLAN_COPY: Record<string, { nameKey: string; whoKey: string; popular?: boolean }> = {
  "plan:credits-19": { nameKey: "planStarter", whoKey: "whoStarter" },
  "plan:credits-49": { nameKey: "planPro", whoKey: "whoPro", popular: true },
  "plan:credits-99": { nameKey: "planAgency", whoKey: "whoAgency" },
}

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
  price,
  credits,
  who,
  lines,
}: {
  name: string
  price: string
  credits: number
  who: string
  lines: string[]
}) {
  const t = useTranslations("credits")
  return (
    <>
      <span className="text-[13px] font-bold tracking-[0.02em] text-brand">{name}</span>
      <div className="mt-2.5 flex items-baseline gap-1">
        <b className="text-[38px] font-bold leading-none tracking-[-0.04em] tabular-nums">{price}</b>
        <span className="text-[13px] text-muted-foreground">{t("perMonth")}</span>
      </div>
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

function FreeCard({ freeMonthly, current }: { freeMonthly: number; current: boolean }) {
  const t = useTranslations("credits")
  return (
    <div className={CARD_BASE}>
      <CardBody
        name={t("planFree")}
        price="$0"
        credits={freeMonthly}
        who={t("freeRefilled")}
        lines={[t("freeRankTracker"), t("freeHistory")]}
      />
      <div className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg border bg-muted text-[13px] font-semibold text-muted-foreground">
        {current ? t("freeCurrent") : t("freeIncluded")}
      </div>
    </div>
  )
}

/**
 * Hand off to the hosted checkout. Both a plan and a pack go through the same
 * endpoint — the body decides which — so there is one place that can fail and
 * one place that reports it.
 */
async function startCheckout(body: { planSlug?: string; packageKey?: string }): Promise<string | null> {
  try {
    const { url } = await api.post<{ url: string }>("/api/billing/checkout", body)
    return url ?? null
  } catch {
    return null
  }
}

function PlanCard({
  plan,
  rates,
  current,
  busy,
  switching,
  highlighted,
  onChoose,
}: {
  plan: CreditPlan
  rates: CreditRateCard
  current: boolean
  busy: boolean
  /** The account already subscribes to another plan: this card switches it in the billing portal. */
  switching: boolean
  /** Arrived here from a "Get Pro" link on the marketing site. */
  highlighted: boolean
  onChoose: () => void
}) {
  const t = useTranslations("credits")
  const copy = PLAN_COPY[plan.key]
  const name = copy ? t(copy.nameKey) : plan.key
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
      className={cn(CARD_BASE, copy?.popular && CARD_FEATURED, highlighted && "border-brand ring-2 ring-brand/40")}
    >
      {copy?.popular && (
        <span className="absolute -top-2.5 left-6 rounded-full bg-brand px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-white">
          {t("mostPopular")}
        </span>
      )}
      <CardBody
        name={name}
        price={formatPrice(plan.priceCents, plan.currency)}
        credits={plan.credits}
        who={copy ? t(copy.whoKey) : ""}
        lines={[t("paidEveryTool"), ...(daily ? [t("buysDaily", { credits: formatCredits(daily) })] : [])]}
      />
      <button
        type="button"
        disabled={current || busy}
        onClick={onChoose}
        className={cn(
          "mt-6 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg text-[13px] font-semibold transition-colors disabled:opacity-70",
          current
            ? "cursor-default border bg-muted text-muted-foreground"
            : copy?.popular
              ? "bg-brand text-white hover:brightness-110"
              : "border hover:border-brand hover:bg-muted",
        )}
      >
        {busy && <Loader2 className="size-3.5 animate-spin" />}
        {current
          ? t("currentPlan")
          : busy
            ? t(switching ? "openingPortal" : "openingCheckout")
            : t(switching ? "switchPlan" : "choosePlan", { plan: name })}
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
  const [portalError, setPortalError] = useState<string | null>(null)
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

  const go = async (key: string, body: { planSlug?: string; packageKey?: string }) => {
    setPending(key)
    setFailed(false)
    setPortalError(null)
    const url = await startCheckout(body)
    if (url) {
      window.location.href = url
      return
    }
    setPending(null)
    setFailed(true)
  }

  // An account with a live subscription changes plan in the billing portal.
  // A second checkout would start a second subscription billed beside the
  // first, so the server refuses it (already_subscribed); the card goes to the
  // portal instead. The server's message is shown as it is, since it can be
  // specific (PayU plans are changed by cancelling first).
  const subscribed = !!credits?.planSlug && credits.planSlug !== "free"
  const switchPlan = async (key: string) => {
    setPending(key)
    setFailed(false)
    setPortalError(null)
    try {
      const { url } = await api.post<{ url: string }>("/api/billing/portal")
      window.location.href = url
    } catch (err) {
      setPending(null)
      setPortalError(err instanceof ApiError && err.message ? err.message : t("portalFailed"))
    }
  }

  const plans = useMemo(
    () => (rates?.plans ?? []).slice().sort((a, b) => (a.priceCents ?? 0) - (b.priceCents ?? 0)),
    [rates],
  )
  const packs = useMemo(
    () => (rates?.packages ?? []).slice().sort((a, b) => (a.priceCents ?? 0) - (b.priceCents ?? 0)),
    [rates],
  )

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground", className)}>
        <Loader2 className="size-4 animate-spin" /> {t("loadingPlans")}
      </div>
    )
  }
  if (!rates || plans.length === 0) return null

  return (
    <section className={cn("flex flex-col gap-6", className)}>
      {/* Free in the same row as the paid tiers, so the range reads as one scale. */}
      <div className="grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:pt-3">
        <FreeCard freeMonthly={rates.freeMonthly} current={credits?.planSlug === "free"} />
        {plans.map((p) => {
          const slug = p.key.replace(/^plan:/, "")
          return (
            <PlanCard
              key={p.key}
              plan={p}
              rates={rates}
              current={credits?.planSlug === slug}
              busy={pending === p.key}
              switching={subscribed}
              highlighted={highlight === slug}
              onChoose={() => void (subscribed ? switchPlan(p.key) : go(p.key, { planSlug: slug }))}
            />
          )
        })}
      </div>

      {(failed || portalError) && (
        <p className="text-xs font-medium text-red-600 dark:text-red-400">{portalError ?? t("checkoutFailed")}</p>
      )}

      {packs.length > 0 && (
        <div
          ref={packsRef}
          className={cn(
            "flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5 shadow-sm",
            highlight === "packs" && "border-brand ring-2 ring-brand/40",
          )}
        >
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold">{t("packsTitle")}</h3>
            <p className="mt-1 text-[13px] text-muted-foreground">{t("packsNote")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {packs.map((pack) => (
              <button
                key={pack.key}
                type="button"
                disabled={pending === pack.key}
                onClick={() => void go(pack.key, { packageKey: pack.key })}
                className="inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-[13px] transition-colors hover:border-brand hover:bg-muted disabled:opacity-70"
              >
                {pending === pack.key && <Loader2 className="size-3.5 animate-spin" />}
                <b className="tabular-nums">{t("packCredits", { credits: formatCredits(pack.credits) })}</b>
                <span className="font-semibold text-brand">{formatPrice(pack.priceCents, pack.currency)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
