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

import { useMemo, useState } from "react"
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
const PLAN_COPY: Record<string, { name: string; who: string; popular?: boolean }> = {
  "plan:credits-19": { name: "Starter", who: "One site, checked daily" },
  "plan:credits-49": { name: "Pro", who: "Several sites, or one you work on hard", popular: true },
  "plan:credits-99": { name: "Agency", who: "Client work and bigger keyword sets" },
}

const PACK_COPY: Record<string, string> = {
  "topup-1000": "A busy week",
  "topup-5000": "A month of extra headroom",
  "topup-15000": "A large one-off audit or migration",
}

/**
 * What a number of credits buys, in the things people actually do. Abstract
 * credit counts mean nothing on their own — "2,000 credits" only lands as a
 * price once you can see it is a keyword checked every day for two months.
 */
function whatItBuys(credits: number): string[] {
  const perDay = Math.floor(credits / 30)
  return [
    `${formatCredits(credits)} rank checks`,
    perDay > 0 ? `or ${formatCredits(perDay)} keywords checked daily for a month` : `or ${credits} keyword checks`,
    `or ${formatCredits(Math.floor(credits / 17))} local grid scans`,
    `or ${formatCredits(Math.floor(credits / 5))} site audits`,
  ]
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
  onChoose,
}: {
  plan: CreditPlan
  current: boolean
  busy: boolean
  onChoose: (slug: string) => void
}) {
  const copy = PLAN_COPY[plan.key] ?? { name: plan.key, who: "" }
  // The rate card keys plans as "plan:credits-49"; checkout wants the slug.
  const slug = plan.key.replace(/^plan:/, "")
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl border bg-card p-5 shadow-sm",
        copy.popular && "border-brand ring-1 ring-brand/20",
      )}
    >
      {copy.popular && (
        <span className="absolute -top-2.5 left-5 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          Most popular
        </span>
      )}
      <div className="text-[15px] font-semibold">{copy.name}</div>
      <p className="mt-0.5 text-xs text-muted-foreground">{copy.who}</p>

      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-[30px] font-bold leading-none tracking-[-0.02em] tabular-nums">
          {formatPrice(plan.priceCents, plan.currency)}
        </span>
        <span className="text-[13px] text-muted-foreground">/month</span>
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-brand">
        <Coins className="size-3.5" />
        {formatCredits(plan.credits)} credits a month
      </div>

      <ul className="mt-4 flex flex-1 flex-col gap-1.5 border-t pt-4 text-xs text-muted-foreground">
        {whatItBuys(plan.credits).map((line) => (
          <li key={line} className="flex items-start gap-2">
            <Check className="mt-0.5 size-3 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={3} />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={current || busy}
        onClick={() => onChoose(slug)}
        className={cn(
          "mt-4 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg text-[13px] font-semibold transition-colors disabled:opacity-70",
          current
            ? "cursor-default border bg-muted text-muted-foreground"
            : copy.popular
              ? "bg-brand text-white hover:brightness-110"
              : "border hover:bg-muted",
        )}
      >
        {busy && <Loader2 className="size-3.5 animate-spin" />}
        {current ? "Current plan" : busy ? "Opening checkout…" : `Choose ${copy.name}`}
      </button>
    </div>
  )
}

const TOOLS: { name: string; what: string; cost: string }[] = [
  { name: "Google Rank Tracker", what: "Daily positions in any country, with history", cost: "1 / keyword" },
  { name: "YouTube Rank Tracker", what: "Video positions, with views and age", cost: "1 / keyword" },
  { name: "Google Maps Tracker", what: "A geo-grid of local rankings, block by block", cost: "3–57 / scan" },
  { name: "Keyword Magic Tool", what: "Hundreds of ideas with volume, difficulty and intent", cost: "3–15 / search" },
  { name: "Website Audit", what: "A real browser crawl and 63 SEO rules", cost: "1 / 20 pages" },
  { name: "Competitor Analysis", what: "Your page against the ones outranking it", cost: "5 / analysis" },
  { name: "AI Internal Linking", what: "Your link graph, with orphans and hubs surfaced", cost: "2 / crawl" },
  { name: "Keyword Score Checker", what: "One page scored against one keyword", cost: "3 / page" },
  { name: "Quick Serp", what: "A live lookup without tracking anything", cost: "1 / lookup" },
  { name: "Search Console & GA4", what: "Real clicks beside your tracked positions", cost: "Free" },
]

function EveryTool() {
  return (
    <div>
      <h3 className="text-[15px] font-semibold">Every tool, on every plan</h3>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Nothing is locked behind a higher tier — your credits work across all of it.
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
              <p className="mt-0.5 pl-5 text-xs text-muted-foreground">{tool.what}</p>
            </div>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-brand">{tool.cost}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function CreditPricing({ className }: { className?: string }) {
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
        <Loader2 className="size-4 animate-spin" /> Loading plans…
      </div>
    )
  }
  if (!rates || plans.length === 0) return null

  return (
    <section className={cn("flex flex-col gap-8", className)}>
      <div>
        <h2 className="text-[22px] font-bold tracking-[-0.02em]">Pay for what you run</h2>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          One credit covers one rank check. Everything else is priced from the same pool — a local grid
          scan, a site audit, a keyword search — so you are never paying for a tool you do not use.
          Free accounts get {formatCredits(rates.freeMonthly)} credits a month, no card.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((p) => {
          const slug = p.key.replace(/^plan:/, "")
          return (
            <PlanCard
              key={p.key}
              plan={p}
              current={credits?.planSlug === slug}
              busy={pending === p.key}
              onChoose={() => void go(p.key, { planSlug: slug })}
            />
          )
        })}
      </div>

      {packs.length > 0 && (
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[15px] font-semibold">Need more this month?</h3>
            <p className="text-xs text-muted-foreground">
              Top-ups never expire on the monthly cycle — they last a year from purchase.
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
                  {formatCredits(pack.credits)} credits
                </span>
                <span className="text-[13px] font-semibold text-brand">
                  {formatPrice(pack.priceCents, pack.currency)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {pending === pack.key
                    ? "Opening checkout…"
                    : (PACK_COPY[pack.key] ?? perCreditLabel(pack.priceCents, pack.credits))}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <EveryTool />

      {failed && (
        <p className="text-xs font-medium text-red-600 dark:text-red-400">
          We couldn&apos;t open checkout. That usually means the plan isn&apos;t connected to a payment
          provider yet — try again, or contact us if it keeps happening.
        </p>
      )}

      {/* The honest note. Credits that quietly evaporate are the single most
          complained-about thing in prepaid pricing; saying the rule plainly
          costs nothing and pre-empts the support ticket. */}
      <p className="text-xs text-muted-foreground">
        Monthly credits refill on your billing date and do not roll over. Purchased top-ups last 12 months.
        Whatever expires soonest is always spent first.
      </p>
    </section>
  )
}
