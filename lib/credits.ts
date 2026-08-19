"use client"

// Credit balance and the price card, shared by the shell pill, the billing page
// and the pricing page — so all three quote the same numbers from the same
// place rather than each hardcoding a copy that drifts.

import { useCallback, useEffect, useState } from "react"
import { api } from "@/lib/api"

export type BillingMode = "worker" | "credits"

export interface CreditSummary {
  /** A grandfathered worker subscriber still meters on daily checks, not credits. */
  mode: BillingMode
  balance: number
  expiringSoon: number
  nextExpiryAt: string | null
  monthlyAllowance: number
  nextRefillAt: string | null
  planSlug: string
}

export interface CreditLedgerEntry {
  id: string
  entryType: "grant" | "hold" | "settle" | "refund" | "expire" | "adjust"
  credits: number
  balanceAfter: number
  action: string | null
  refType: string | null
  createdAt: string
}

export interface CreditPlan {
  key: string
  credits: number
  priceCents: number | null
  currency: string
}

export interface CreditActionRate {
  action: string
  variant: string | null
  credits: number
  unitSize: number
  unitLabel: string | null
}

export interface CreditRateCard {
  actions: CreditActionRate[]
  plans: CreditPlan[]
  packages: CreditPlan[]
  freeMonthly: number
}

/**
 * Action keys, mirroring CREDIT_ACTIONS in the backend's credits/catalog.ts.
 * Surfaces reference these rather than the literal strings, so a rename that
 * misses one becomes a type error instead of a silently unpriced button.
 */
export const CREDIT_ACTION_KEYS = {
  rankCheck: "serp.check.standard",
  rankCheckPriority: "serp.check.priority",
  liveCheck: "serp.live",
  youtubeCheck: "youtube.check",
  mapsScanPoint: "maps.scan.point",
  keywordMagicSearch: "keyword_magic.search",
  keywordAdd: "keyword.add",
  competitorAnalysis: "ca.analysis",
  competitorChat: "ca.chat.message",
  internalLinking: "ila.analysis",
  keywordScore: "ka.analysis",
  onPageAudit: "opa.audit",
  siteCrawlPage: "site_crawl.page",
  pageAudit: "page_audit.run",
  pageAuditAsk: "page_audit.ask_ai",
  backlinksRefresh: "backlinks.refresh",
  keywordSuggestions: "ks.run",
} as const

export type CreditActionKey = (typeof CREDIT_ACTION_KEYS)[keyof typeof CREDIT_ACTION_KEYS]

/** Fired after anything spends, so the balance pill refreshes without polling. */
export const CREDITS_REFRESH_EVENT = "credits:refresh"

export function notifyCreditsChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CREDITS_REFRESH_EVENT))
}

/**
 * Live balance. Refreshes on the app-wide spend signals rather than a timer —
 * `usage:refresh` is the event the rest of the app already fires after a check,
 * so listening to both means no surface has to learn a new convention.
 */
export function useCredits() {
  const [data, setData] = useState<CreditSummary | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      setData(await api.get<CreditSummary>("/api/credits"))
    } catch {
      // A failed balance read must not break the page it sits in; the pill
      // simply doesn't render until the next refresh succeeds.
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const onRefresh = () => void load()
    window.addEventListener(CREDITS_REFRESH_EVENT, onRefresh)
    window.addEventListener("usage:refresh", onRefresh)
    return () => {
      window.removeEventListener(CREDITS_REFRESH_EVENT, onRefresh)
      window.removeEventListener("usage:refresh", onRefresh)
    }
  }, [load])

  return { credits: data, loading, reload: load }
}

/** The price card. Static enough to fetch once per mount. */
export function useCreditRates() {
  const [rates, setRates] = useState<CreditRateCard | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api
      .get<CreditRateCard>("/api/credits/rates")
      .then((r) => {
        if (!cancelled) setRates(r)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { rates, loading }
}

export function formatCredits(n: number): string {
  return n.toLocaleString("en-US")
}

export function formatPrice(cents: number | null, currency = "USD"): string {
  if (cents == null) return "—"
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100)
  } catch {
    return `$${(cents / 100).toFixed(2)}`
  }
}

/** "$0.019 / credit" — what a pack really costs, for comparing them honestly. */
export function perCreditLabel(priceCents: number | null, credits: number): string | null {
  if (priceCents == null || credits <= 0) return null
  return `$${(priceCents / 100 / credits).toFixed(4).replace(/0+$/, "").replace(/\.$/, "")} / credit`
}

// ── Quoting an action before it runs ──────────────────────────────────────
//
// Mirrors creditsFor() in the backend's credits/catalog.ts EXACTLY: round the
// units up to whole blocks, multiply, then apply the floor — except a rate of
// zero, which stays zero because another action is paying for that work.
//
// The duplication is deliberate. Quoting on the server would mean a round trip
// before every button could label itself, and a price that appears a moment
// after the button does is worse than no price at all. The rate card these read
// from is the same one the charge resolves against, so the only thing that can
// drift is this arithmetic — which is why it is written once, here.

export function quoteCredits(
  rates: CreditRateCard | null,
  action: string,
  units = 1,
  variant?: string | null,
): number | null {
  if (!rates) return null
  const candidates = rates.actions.filter((r) => r.action === action)
  if (candidates.length === 0) return null
  const rate =
    (variant ? candidates.find((r) => r.variant === variant) : undefined) ??
    candidates.find((r) => r.variant == null) ??
    candidates[0]
  if (!rate) return null
  if (rate.credits === 0) return 0
  const size = Math.max(1, rate.unitSize)
  return Math.max(Math.ceil(Math.max(0, units) / size) * rate.credits, 1)
}

export interface CreditQuote {
  /** Null while the rate card is still loading, or if the action is unpriced. */
  cost: number | null
  balance: number | null
  /** True once we know the balance cannot cover it. */
  short: boolean
  /** What is left afterwards, for "1,240 → 1,224" style previews. */
  after: number | null
  /** False for grandfathered worker subscribers, who spend checks not credits. */
  applies: boolean
}

/**
 * What this action will cost and whether the user can afford it. The one hook
 * every "this will use N credits" label should call, so no surface invents its
 * own arithmetic.
 */
export function useCreditQuote(action: string, units = 1, variant?: string | null): CreditQuote {
  const { rates } = useCreditRates()
  const { credits } = useCredits()
  const cost = quoteCredits(rates, action, units, variant)
  const balance = credits?.balance ?? null
  const applies = credits?.mode === "credits"
  return {
    cost,
    balance,
    applies,
    short: applies && cost != null && balance != null && cost > balance,
    after: cost != null && balance != null ? balance - cost : null,
  }
}
