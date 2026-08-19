"use client"

/**
 * Credit plans and top-up packs, priced from the API rather than a constant.
 *
 * Everything on this card — the tiers, the pack prices, the free allowance and
 * the "what it buys" column — comes from the same `credit_rates` rows that will
 * actually be charged. A price shown here and a price charged at spend time
 * cannot drift, because there is only one of them.
 *
 * English copy for now, matching how keyword-magic, maps-tracker and the other
 * newer surfaces ship. The four-locale message files are a separate pass.
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
  type CreditPlan,
} from "@/lib/credits"

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

/**
 * What a number of credits buys, in the things people actually do. Abstract
 * credit counts mean nothing on their own — "2,000 credits" only lands as a
 * price once you can see it is a keyword checked every day for two months.
 */
function whatItBuys(credits: number, t: (k: string, v?: Record<string, string>) => string): string[] {
  const n = (d: number) => formatCredits(Math.floor(credits / d))
  return [
    t("buysChecks", { credits: formatCredits(credits) }),
    t("buysDaily", { credits: n(30) }),
    t("buysScans", { credits: n(17) }),
    t("buysAudits", { credits: n(5) }),
  ]
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
  current,
  busy,
  highlighted,
  onChoose,
}: {
  plan: CreditPlan
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
        {whatItBuys(plan.credits, t).map((line) => (
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

// Tool NAMES stay in English: they are product names, and a translated row
// that renames the tool no longer matches the sidebar the user clicks.
const TOOLS: { name: string; whatKey: string; costKey: string }[] = [
  { name: "Google Rank Tracker", whatKey: "toolRankWhat", costKey: "costPerKeyword" },
  { name: "YouTube Rank Tracker", whatKey: "toolYoutubeWhat", costKey: "costPerKeyword" },
  { name: "Google Maps Tracker", whatKey: "toolMapsWhat", costKey: "costPerScan" },
  { name: "Keyword Magic Tool", whatKey: "toolMagicWhat", costKey: "costPerSearch" },
  { name: "Website Audit", whatKey: "toolAuditWhat", costKey: "costPerPages" },
  { name: "Competitor Analysis", whatKey: "toolCompetitorWhat", costKey: "costPerAnalysis" },
  { name: "AI Internal Linking", whatKey: "toolLinkingWhat", costKey: "costPerCrawl" },
  { name: "Keyword Score Checker", whatKey: "toolScoreWhat", costKey: "costPerPage" },
  { name: "Quick Serp", whatKey: "toolQuickWhat", costKey: "costPerLookup" },
  { name: "Search Console & GA4", whatKey: "toolConsoleWhat", costKey: "costFree" },
]

function EveryTool() {
  const t = useTranslations("credits")
  return (
    <div>
      <h3 className="text-[15px] font-semibold">{t("everyToolTitle")}</h3>
      <p className="mt-1 text-[13px] text-muted-foreground">
        {t("everyToolIntro")}
      </p>
      <div className="mt-4 overflow-hidden rounded-xl border">
        {TOOLS.map((tool, i) => (
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
            </div>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-brand">{t(tool.costKey)}</span>
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
              current={credits?.planSlug === slug}
              busy={pending === p.key}
              highlighted={highlight === slug}
              onChoose={() => void go(p.key, { planSlug: slug })}
            />
          )
        })}
      </div>

      {packs.length > 0 && (
        <div className="rounded-xl border bg-card p-5 shadow-sm">
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

      <EveryTool />

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
