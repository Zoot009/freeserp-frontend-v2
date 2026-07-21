// Live pricing config from the backend (GET /api/billing/config) — the single
// source of truth for tiers/prices, with lib/pricing.ts constants as the
// offline fallback so pricing UI still renders if the API is unreachable.

import { apiRequest } from "./api"
import {
  PRICING_TIERS,
  PRICE_PER_WORKER_USD,
  PRICE_PER_WORKER_YEAR_USD,
  SEARCHES_PER_WORKER,
} from "./pricing"

export interface BillingConfig {
  tiers: readonly number[]
  minWorkers: number
  perWorkerDailyChecks: number
  pricePerWorkerCents: { month: number; year: number }
  intervals: readonly ("month" | "year")[]
  // extensionDays/extensionChecks describe the one-time trial extension. Optional
  // because a backend deployed before that feature omits them — call sites fall
  // back rather than rendering "extend by undefined days" mid-rollout.
  freeTrial: {
    /** Checks per UTC day during the trial, resetting at midnight. */
    dailyChecks?: number
    /** Cumulative ceiling across the whole trial. */
    lifetimeChecks?: number
    /** @deprecated alias for lifetimeChecks — drop once every backend serves the new keys. */
    totalChecks: number
    windowDays: number
    extensionDays?: number
    extensionChecks?: number
  }
  /** Daily-quota units one live Quick-SERP lookup consumes. */
  liveCheckUnits?: number
  /** Daily-quota units each interactive (priority) tracked check consumes. */
  priorityCheckUnits?: number
}

export const FALLBACK_BILLING_CONFIG: BillingConfig = {
  tiers: PRICING_TIERS,
  minWorkers: PRICING_TIERS[0],
  perWorkerDailyChecks: SEARCHES_PER_WORKER,
  pricePerWorkerCents: { month: PRICE_PER_WORKER_USD * 100, year: PRICE_PER_WORKER_YEAR_USD * 100 },
  intervals: ["month", "year"],
  freeTrial: {
    dailyChecks: 3,
    lifetimeChecks: 21,
    totalChecks: 21,
    windowDays: 7,
    extensionDays: 2,
    extensionChecks: 6,
  },
  liveCheckUnits: 1,
  priorityCheckUnits: 2,
}

// Static config — cache the successful fetch for the session. Failures are NOT
// cached so a transient error doesn't pin the fallback forever.
let cached: BillingConfig | null = null
let inflight: Promise<BillingConfig> | null = null

export async function fetchBillingConfig(): Promise<BillingConfig> {
  if (cached) return cached
  if (inflight) return inflight
  inflight = apiRequest<BillingConfig>("/api/billing/config", { skipAuth: true })
    .then((cfg) => {
      // Minimal shape guard so a proxy error page can't poison the pricing UI.
      if (!cfg || !Array.isArray(cfg.tiers) || cfg.tiers.length === 0) return FALLBACK_BILLING_CONFIG
      cached = cfg
      return cfg
    })
    .catch(() => FALLBACK_BILLING_CONFIG)
    .finally(() => {
      inflight = null
    })
  return inflight
}
