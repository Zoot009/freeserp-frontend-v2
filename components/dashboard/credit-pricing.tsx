"use client"

/**
 * Credit plans and top-up packs, priced from the API rather than a constant.
 *
 * Everything on this card — the tiers, the pack prices, the free allowance, the
 * "what it buys" column and the per-tool prices — comes from the same
 * `credit_rates` rows that will actually be charged, via quoteCredits. A price
 * shown here and a price charged at spend time cannot drift, because there is
 * only one of them.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Check, Coins, Loader2 } from "lucide-react"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import {
  useCreditRates,
  useCredits,
  formatCredits,
  formatPrice,
  perCreditLabel,
  quoteCredits,
  CREDIT_ACTION_KEYS,
  type CreditPlan,
  type CreditRateCard,
} from "@/lib/credits"
import { GRID_SIZES, RECOMMENDED_GRID_SIZE } from "@/components/maps-tracker/grid"

/** Display names and the case each tier is for. Keyed by the rate-card key. */
const PLAN_COPY: Record<string, { nameKey: string; whoKey: string; popular?: boolean }> = {
  "plan:credits-19": { nameKey: "planStarter", whoKey: "whoStarter" },
  "plan:credits-49": { nameKey: "planPro", whoKey: "whoPro", popular: true },
  "plan:credits-99": { nameKey: "planAgency", whoKey: "whoAgency" },
}

const PACK_COPY: Record<string, string> = {
  "topup-1000": "pack1000",
  "topup-5000": "pack5000",
  "topup-15000": "pack15000",
}

/** The sizes the examples below are priced at: the recommended map grid, a 100-page site. */
const EXAMPLE_GRID_POINTS = RECOMMENDED_GRID_SIZE ** 2
const EXAMPLE_AUDIT_PAGES = 100

/**
 * What a number of credits buys, in the things people actually do. Abstract
 * credit counts mean nothing on their own — "2,000 credits" only lands as a
 * price once you can see it is a keyword checked every day for two months.
 *
 * Each line divides by the rate card's own price for that thing, so the lines
 * move when a rate does. A hardcoded divisor is how this once promised 400
 * "full site audits" for Starter, when a full audit is a credit per page.
 */
function whatItBuys(
  credits: number,
  rates: CreditRateCard,
  t: (k: string, v?: Record<string, string>) => string,
): string[] {
  const lines: [string, number | null][] = [
    ["buysChecks", quoteCredits(rates, CREDIT_ACTION_KEYS.rankCheck)],
    ["buysDaily", (quoteCredits(rates, CREDIT_ACTION_KEYS.rankCheck) ?? 0) * 30 || null],
    ["buysScans", quoteCredits(rates, CREDIT_ACTION_KEYS.mapsScanPoint, EXAMPLE_GRID_POINTS)],
    ["buysAudits", quoteCredits(rates, CREDIT_ACTION_KEYS.siteCrawlPage, EXAMPLE_AUDIT_PAGES)],
  ]
  return lines
    .filter((l): l is [string, number] => !!l[1])
    .map(([key, each]) =>
      t(key, {
        credits: formatCredits(Math.floor(credits / each)),
        grid: `${RECOMMENDED_GRID_SIZE}×${RECOMMENDED_GRID_SIZE}`,
        pages: formatCredits(EXAMPLE_AUDIT_PAGES),
      }),
    )
}

/** What the free tier offers. Mirrors FREE_FEATURES on the marketing site. */
const FREE_FEATURE_KEYS = ["freeEveryTool", "freeCountries", "freeNoCard"]

/**
 * The card shell, shared by Free and the paid tiers.
 *
 * Ported from the marketing site's `.pr-card` so the two pricing pages read as
 * one product. The recommended tier is RAISED rather than recoloured — a second
 * blue card beside the blue CTA turns the row into noise.
 */
const CARD_BASE =
  "relative flex flex-col rounded-2xl border bg-card p-6 shadow-sm transition-all duration-200 hover:shadow-lg"
const CARD_FEATURED = "border-brand shadow-brand/20 shadow-lg lg:-translate-y-2.5"

function Tick() {
  return (
    <Check className="mt-[3px] size-3.5 shrink-0 text-brand" strokeWidth={2.6} />
  )
}

/** The free tier, shaped like the paid ones so the row reads as one scale. */
function FreeCard({ freeMonthly, current }: { freeMonthly: number; current: boolean }) {
  const t = useTranslations("credits")
  return (
    <div className={CARD_BASE}>
      <span className="text-[13px] font-bold tracking-[0.02em] text-brand">{t("planFree")}</span>
      <div className="mt-2.5 flex items-baseline gap-1">
        <b className="text-[38px] font-bold leading-none tracking-[-0.04em]">$0</b>
        <span className="text-[13px] text-muted-foreground">{t("perMonth")}</span>
      </div>
      <p className="mt-2.5 text-[13px] font-semibold">{t("creditsAMonth", { credits: formatCredits(freeMonthly) })}</p>
      <p className="mt-1 text-[13px] text-muted-foreground">{t("freeRefilled")}</p>
      <div className="my-5 h-px bg-border" />
      <ul className="flex flex-1 flex-col gap-2.5 text-[13px] text-muted-foreground">
        <li className="flex items-start gap-2">
          <Tick />
          <span>{t("freeCreditsEvery", { credits: formatCredits(freeMonthly) })}</span>
        </li>
        {FREE_FEATURE_KEYS.map((k) => (
          <li key={k} className="flex items-start gap-2">
            <Tick />
            <span>{t(k)}</span>
          </li>
        ))}
      </ul>
      <div
        className={cn(
          "mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg border text-[13px] font-semibold",
          current ? "bg-muted text-muted-foreground" : "text-muted-foreground",
        )}
      >
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
  highlighted,
  onChoose,
}: {
  plan: CreditPlan
  rates: CreditRateCard
  current: boolean
  busy: boolean
  /** Arrived here from a "Get Pro" link on the marketing site. */
  highlighted: boolean
  onChoose: (slug: string) => void
}) {
  const t = useTranslations("credits")
  const copy = PLAN_COPY[plan.key]
  const name = copy ? t(copy.nameKey) : plan.key
  const who = copy ? t(copy.whoKey) : ""
  // The rate card keys plans as "plan:credits-49"; checkout wants the slug.
  const slug = plan.key.replace(/^plan:/, "")
  const ref = useRef<HTMLDivElement>(null)

  // Someone who clicked "Get Pro" elsewhere has already chosen. Bring their
  // choice into view rather than dropping them at the top of a page of three
  // identical-looking cards. Not an auto-redirect to checkout: landing on a
  // payment page you did not ask for, with a back button that bounces you
  // straight back to it, is worse than one more click.
  useEffect(() => {
    if (!highlighted) return
    const t = setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 120)
    return () => clearTimeout(t)
  }, [highlighted])

  return (
    <div
      ref={ref}
      className={cn(
        CARD_BASE,
        copy?.popular && CARD_FEATURED,
        highlighted && "border-brand ring-2 ring-brand/40",
      )}
    >
      {copy?.popular && (
        <span className="absolute -top-2.5 left-6 rounded-full bg-brand px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-white">
          {t("mostPopular")}
        </span>
      )}
      <span className="text-[13px] font-bold tracking-[0.02em] text-brand">{name}</span>

      <div className="mt-2.5 flex items-baseline gap-1">
        <b className="text-[38px] font-bold leading-none tracking-[-0.04em] tabular-nums">
          {formatPrice(plan.priceCents, plan.currency)}
        </b>
        <span className="text-[13px] text-muted-foreground">{t("perMonth")}</span>
      </div>

      <p className="mt-2.5 flex items-center gap-1.5 text-[13px] font-semibold">
        <Coins className="size-3.5 text-brand" />
        {t("creditsAMonth", { credits: formatCredits(plan.credits) })}
      </p>
      <p className="mt-1 text-[13px] text-muted-foreground">{who}</p>

      <div className="my-5 h-px bg-border" />

      <ul className="flex flex-1 flex-col gap-2.5 text-[13px] text-muted-foreground">
        {whatItBuys(plan.credits, rates, t).map((line) => (
          <li key={line} className="flex items-start gap-2">
            <Tick />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={current || busy}
        onClick={() => onChoose(slug)}
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
        {current ? t("currentPlan") : busy ? t("openingCheckout") : t("choosePlan", { plan: name })}
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
    { name: "Quick Serp", whatKey: "toolQuickWhat", costKey: "costPerLookup", cost: span(q(CREDIT_ACTION_KEYS.liveCheck), null) },
    { name: "Search Console & GA4", whatKey: "toolConsoleWhat", costKey: "costFree", cost: "" },
  ]
}

function EveryTool({ rates }: { rates: CreditRateCard }) {
  const t = useTranslations("credits")
  return (
    <div>
      <h3 className="text-[15px] font-semibold">{t("everyToolTitle")}</h3>
      <p className="mt-1 text-[13px] text-muted-foreground">
        {t("everyToolIntro")}
      </p>
      <div className="mt-4 overflow-hidden rounded-xl border">
        {toolRows(rates, t).filter((tool) => tool.cost != null).map((tool, i) => (
          <div
            key={tool.name}
            className={cn(
              "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-card px-4 py-3",
              i > 0 && "border-t",
            )}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[13px] font-medium">
                <Check className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={3} />
                {tool.name}
              </div>
              <p className="mt-0.5 pl-5 text-xs text-muted-foreground">{t(tool.whatKey)}</p>
              {tool.note && (
                <p className="mt-1 pl-5 text-[11px] leading-snug text-muted-foreground/80">
                  {tool.note}
                </p>
              )}
            </div>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-brand">
              {t(tool.costKey, { cost: tool.cost ?? "" })}
            </span>
          </div>
        ))}
      </div>
    </div>
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
    const t = setTimeout(() => packsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 120)
    return () => clearTimeout(t)
  }, [highlight, loading])

  const go = async (key: string, body: { planSlug?: string; packageKey?: string }) => {
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
    <section className={cn("flex flex-col gap-8", className)}>
      <div>
        <h2 className="text-[22px] font-bold tracking-[-0.02em]">{t("pricingTitle")}</h2>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          {t("pricingIntro", { credits: formatCredits(rates.freeMonthly) })}
        </p>
      </div>

      {/* Four across, Free included — the marketing site shows the free tier in
          the same row so the range reads as one scale rather than three paid
          options with the free plan mentioned somewhere else. */}
      <div className="grid items-start gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:pt-3">
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
              highlighted={highlight === slug}
              onChoose={() => void go(p.key, { planSlug: slug })}
            />
          )
        })}
      </div>

      {packs.length > 0 && (
        <div
          ref={packsRef}
          className={cn("rounded-xl border bg-card p-5 shadow-sm", highlight === "packs" && "border-brand ring-2 ring-brand/40")}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[15px] font-semibold">{t("packsTitle")}</h3>
            <p className="text-xs text-muted-foreground">
              {t("packsNote")}
            </p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {packs.map((pack) => (
              <button
                key={pack.key}
                type="button"
                disabled={pending === pack.key}
                onClick={() => void go(pack.key, { packageKey: pack.key })}
                className="flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors hover:border-brand hover:bg-muted/50 disabled:opacity-70"
              >
                <span className="text-[15px] font-bold tabular-nums">
                  {t("packCredits", { credits: formatCredits(pack.credits) })}
                </span>
                <span className="text-[13px] font-semibold text-brand">
                  {formatPrice(pack.priceCents, pack.currency)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {pending === pack.key
                    ? t("openingCheckout")
                    : PACK_COPY[pack.key]
                      ? t(PACK_COPY[pack.key]!)
                      : perCreditLabel(pack.priceCents, pack.credits)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <EveryTool rates={rates} />

      {failed && (
        <p className="text-xs font-medium text-red-600 dark:text-red-400">
          {t("checkoutFailed")}
        </p>
      )}

      {/* The honest note. Credits that quietly evaporate are the single most
          complained-about thing in prepaid pricing; saying the rule plainly
          costs nothing and pre-empts the support ticket. */}
      <p className="text-xs text-muted-foreground">
        {t("expiryNote")}
      </p>
    </section>
  )
}
