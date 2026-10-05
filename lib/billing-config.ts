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

/**
 * The toast after adding keywords on a free plan when today's checks can't
 * cover them all: how many get checked now, and what the rest wait for. Null
 * when everything added fits, or the plan has no daily ceiling, so the caller
 * keeps its own plain "Added N keywords".
 *
 * `checksLeft` is today's remaining checks as read BEFORE the add: adding runs
 * a first check on the new keywords, and only that many fit today.
 */
export function freeAddedNote(added: number, checksLeft: number | null): string | null {
  if (checksLeft === null || added <= checksLeft) return null
  return checksLeft > 0
    ? `Added ${added} keywords — ${checksLeft} are being checked now. Check the rest tomorrow when your checks reset, or upgrade to check them all.`
    : `Added ${added} keywords. Today's free checks are used — check them tomorrow when they reset, or upgrade to check them now.`
}
