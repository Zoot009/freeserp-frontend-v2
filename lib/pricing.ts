// Fixed pricing tiers — no custom amounts. 1 worker = $1/month = 15 checks/day, so
// a tier's dollar price is literally its worker count, which is the quantity sent to
// Stripe checkout (e.g. $50 → quantity 50 → 750 checks/day). Keep PRICING_TIERS in
// sync with the backend (freeserp-backend/src/modules/billing/billing.routes.ts).
export const SEARCHES_PER_WORKER = 15
export const PRICE_PER_WORKER_USD = 1

// The only purchasable amounts shown as buttons on the pricing page.
export const PRICING_TIERS = [1, 5, 10, 20, 40, 50, 100, 500] as const

export interface TierInfo {
  /** Dollar price = worker count = Stripe quantity. */
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
