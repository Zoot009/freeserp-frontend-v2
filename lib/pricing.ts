// Fixed pricing tiers — no custom amounts. 1 worker = $1/month = 15 checks/day, so
// a tier's dollar price is literally its worker count, which is the quantity sent to
// Stripe checkout (e.g. $50 → quantity 50 → 750 checks/day). Annual billing is
// $10/worker/yr (~2 months free). These constants are the offline FALLBACK — the
// live source of truth is GET /api/billing/config (see lib/billing-config.ts),
// mirroring freeserp-backend-v2/src/modules/billing/pricing.constants.ts.
export const SEARCHES_PER_WORKER = 15
export const PRICE_PER_WORKER_USD = 1
export const PRICE_PER_WORKER_YEAR_USD = 10

// The only purchasable amounts shown as buttons on the pricing page. The old
// 1-worker ($1/mo) tier is retired for new purchases; existing 1-worker
// subscriptions are grandfathered server-side and keep working.
export const PRICING_TIERS = [5, 10, 20, 40, 50, 100, 500] as const

export type BillingInterval = "month" | "year"

export interface TierInfo {
  /** Monthly dollar price = worker count = Stripe quantity. */
  usd: number
  workers: number
  /** Daily check allowance this tier grants. */
  checks: number
}

export const TIERS: TierInfo[] = PRICING_TIERS.map((usd) => ({
  usd,
  workers: usd,
  checks: usd * SEARCHES_PER_WORKER,
}))

/** Price of `workers` workers for the given interval, in whole USD. */
export const tierPriceUsd = (workers: number, interval: BillingInterval): number =>
  workers * (interval === "year" ? PRICE_PER_WORKER_YEAR_USD : PRICE_PER_WORKER_USD)

// Index of the fixed tier nearest an arbitrary worker count. Paid users may sit
// between tiers (proration lets any quantity through, and grandfathered 1-worker
// subs sit below the smallest tier), so the stepper snaps to the closest preset
// when initializing from their current worker count.
export const nearestTier = (count: number): number => {
  let best = 0
  for (let i = 1; i < PRICING_TIERS.length; i++) {
    if (Math.abs(PRICING_TIERS[i] - count) < Math.abs(PRICING_TIERS[best] - count)) best = i
  }
  return best
}
