"use client"

/**
 * Billing, for an account that spends credits.
 *
 * The existing billing page is worker-shaped — a tier grid measured in workers,
 * per-worker daily checks and a proration preview. None of that means anything
 * to a credits account, and rewriting it in place would have put the
 * grandfathered path one bad conditional away from breaking. So this is a
 * separate view and `page.tsx` branches on `mode`: a worker subscriber runs the
 * old file untouched, byte for byte.
 *
 * What a credits user actually needs to know, in the order they ask it:
 *   1. How much is left, and how much of the month that is
 *   2. When more arrives, and whether any is about to expire
 *   3. Where it went
 *   4. How to get more
 */

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { ChevronLeft, ChevronRight, Coins, Loader2, TriangleAlert } from "lucide-react"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { CreditPricing } from "@/components/dashboard/credit-pricing"
import {
  useCredits,
  formatCredits,
  type CreditLedgerEntry,
  type CreditSummary,
} from "@/lib/credits"

/** Statement page size. Matches the audit history, which is the same shape. */
const STATEMENT_PAGE_SIZE = 20

/** Plan slug to the message key naming it. Unknown slugs fall back to the slug. */
const PLAN_KEYS: Record<string, string> = {
  free: "planFree",
  "credits-19": "planStarter",
  "credits-49": "planPro",
  "credits-99": "planAgency",
}

/**
 * Ledger rows carry a SIGNED delta: a hold is negative, a settle or refund is
 * what came back, an expiry is negative. Labels are written from the user's
 * side of it — nobody thinks of themselves as having settled a hold, they got
 * unused credits back.
 */
const ENTRY_KEYS: Record<CreditLedgerEntry["entryType"], string> = {
  grant: "entryGrant",
  hold: "entryHold",
  settle: "entrySettle",
  refund: "entryRefund",
  expire: "entryExpire",
  adjust: "entryAdjust",
}

/** Action keys are machine-shaped (serp.check.standard); this is the human name. */
const ACTION_NAMES: Record<string, string> = {
  "serp.check.standard": "Rank check",
  "serp.check.priority": "Priority rank check",
  "serp.live": "Quick Serp",
  "youtube.check": "YouTube rank check",
  "maps.scan.point": "Map grid scan",
  "keyword_magic.search": "Keyword Magic search",
  "ca.analysis": "Competitor analysis",
  "ca.chat.message": "Competitor chat",
  "ila.analysis": "Internal link crawl",
  "ka.analysis": "Keyword Score Checker",
  "opa.audit": "Page audit",
  "page_audit.run": "Website Audit",
  "page_audit.ask_ai": "Audit Assistant",
  "backlinks.refresh": "Backlink refresh",
  "ks.run": "Starter keyword suggestions",
}

/**
 * What a statement row was for. Tool names are product names and are left in
 * English on purpose — the same reason Starter, Pro and Agency are — so a
 * translated statement still says the name the user sees in the sidebar.
 */
function describe(entry: CreditLedgerEntry, t: (k: string) => string): string {
  if (entry.action && ACTION_NAMES[entry.action]) return ACTION_NAMES[entry.action]!
  if (entry.action) return entry.action
  return t(ENTRY_KEYS[entry.entryType])
}

function formatDay(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short" })
  } catch {
    return iso.slice(0, 10)
  }
}

function formatFullDate(iso: string | null): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })
  } catch {
    return null
  }
}

/**
 * Balance, and how much of the monthly allowance is left.
 *
 * The bar measures the balance against the allowance, NOT "credits used" — the
 * API reports a balance, and a top-up pack legitimately pushes it above the
 * allowance. Inventing a "used" figure by subtraction would read as wrong the
 * moment someone buys a pack, so the bar caps at full and the extra is named
 * separately.
 */
function BalanceCard({ credits }: { credits: CreditSummary }) {
  const t = useTranslations("credits")
  const allowance = credits.monthlyAllowance
  const balance = credits.balance
  const pct = allowance > 0 ? Math.min(100, Math.round((balance / allowance) * 100)) : 0
  const extra = allowance > 0 ? Math.max(0, balance - allowance) : balance
  const refill = formatFullDate(credits.nextRefillAt)
  const expiry = formatFullDate(credits.nextExpiryAt)

  // Amber under a quarter left, red at nothing — the same thresholds the
  // balance pill in the header uses, so the two never disagree on "low".
  const low = allowance > 0 && balance < allowance * 0.25
  const tone = balance === 0 ? "text-red-600 dark:text-red-400" : low ? "text-amber-600 dark:text-amber-500" : ""

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
            <Coins className="size-3.5" /> {t("balanceLabel")}
          </div>
          <div className={cn("mt-1.5 text-[38px] font-bold leading-none tracking-[-0.04em] tabular-nums", tone)}>
            {formatCredits(balance)}
          </div>
        </div>
        <div className="text-right text-[13px] text-muted-foreground">
          <div>
            {t("planLabel")}{" "}
            <span className="font-semibold text-foreground">
              {PLAN_KEYS[credits.planSlug] ? t(PLAN_KEYS[credits.planSlug]!) : credits.planSlug}
            </span>
          </div>
          {allowance > 0 && <div className="mt-0.5">{t("creditsAMonth", { credits: formatCredits(allowance) })}</div>}
        </div>
      </div>

      {allowance > 0 && (
        <div className="mt-5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                balance === 0 ? "bg-red-500" : low ? "bg-amber-500" : "bg-brand",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-[13px] text-muted-foreground">
            {t("monthlyLeft", { balance: formatCredits(balance), allowance: formatCredits(allowance) })}
            {extra > 0 ? ` · ${t("fromTopups", { credits: formatCredits(extra) })}` : ""}
          </p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-1.5 border-t pt-4 text-[13px] text-muted-foreground">
        {refill && (
          <span>{t("refills", { date: refill })}</span>
        )}
        {credits.expiringSoon > 0 && expiry && (
          <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-500">
            <TriangleAlert className="size-3.5" />
            {t("expiring", { credits: formatCredits(credits.expiringSoon), date: expiry })}
          </span>
        )}
      </div>
    </div>
  )
}

/** The statement. Append-only on the server, so this is only ever a read. */
/**
 * The statement. Append-only on the server, so this is only ever a read.
 *
 * Paged rather than a flat list: the endpoint answered with the newest 50 and
 * no count, so an account past its first busy month had older movements it
 * could not reach and no indication any were missing. Server-side, the same
 * limit/offset the audit history uses — a ledger is the one list that only
 * grows, and shipping the whole of it to slice in the browser is the version
 * of this that gets slower every month.
 */
function Statement() {
  const t = useTranslations("credits")
  const [entries, setEntries] = useState<CreditLedgerEntry[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .get<{ entries: CreditLedgerEntry[]; total?: number }>(
        `/api/credits/ledger?limit=${STATEMENT_PAGE_SIZE}&offset=${page * STATEMENT_PAGE_SIZE}`,
      )
      .then((r) => {
        if (cancelled) return
        setEntries(r.entries ?? [])
        // An older server that doesn't send `total` would otherwise report 0
        // and hide the footer entirely; fall back to what this page holds.
        setTotal(r.total ?? r.entries?.length ?? 0)
      })
      .catch(() => {
        if (!cancelled) setEntries([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [page])

  const pageCount = Math.max(1, Math.ceil(total / STATEMENT_PAGE_SIZE))
  const from = total === 0 ? 0 : page * STATEMENT_PAGE_SIZE + 1
  const to = Math.min(total, (page + 1) * STATEMENT_PAGE_SIZE)

  return (
    <div>
      <h3 className="text-[15px] font-semibold">{t("statementTitle")}</h3>
      <p className="mt-1 text-[13px] text-muted-foreground">
        {t("statementIntro")}
      </p>

      <div className="mt-4 overflow-hidden rounded-xl border">
        {loading ? (
          <div className="flex items-center justify-center gap-2 bg-card py-12 text-[13px] text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {t("statementLoading")}
          </div>
        ) : !entries || entries.length === 0 ? (
          <div className="bg-card px-4 py-12 text-center text-[13px] text-muted-foreground">
            {t("statementEmpty")}
          </div>
        ) : (
          entries.map((e, i) => (
            <div
              key={e.id}
              className={cn(
                "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-card px-4 py-3",
                i > 0 && "border-t",
              )}
            >
              <div className="min-w-0">
                <div className="text-[13px] font-medium">{describe(e, t)}</div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDay(e.createdAt)} · {t(ENTRY_KEYS[e.entryType])}
                </p>
              </div>
              <div className="flex shrink-0 items-baseline gap-4 tabular-nums">
                <span
                  className={cn(
                    "text-[13px] font-semibold",
                    e.credits > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground",
                  )}
                >
                  {e.credits > 0 ? "+" : ""}
                  {formatCredits(e.credits)}
                </span>
                <span className="w-16 text-right text-xs text-muted-foreground">
                  {formatCredits(e.balanceAfter)}
                </span>
              </div>
            </div>
          ))
        )}

        {/* Rendered while a page is loading too, so stepping through the
            statement doesn't drop the controls out from under the cursor. */}
        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-card px-4 py-2.5 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {t("statementRange", { from, to, total })}
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                disabled={loading || page === 0}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft className="size-3.5" /> {t("statementPrev")}
              </Button>
              <span className="tabular-nums">
                {t("statementPage", { page: page + 1, pages: pageCount })}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                disabled={loading || page >= pageCount - 1}
                onClick={() => setPage(page + 1)}
              >
                {t("statementNext")} <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function CreditsBilling({ highlight }: { highlight?: string | null }) {
  const t = useTranslations("credits")
  const { credits, loading } = useCredits()

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> {t("loadingBilling")}
      </div>
    )
  }
  if (!credits) return null

  return (
    <div className="flex flex-col gap-10 px-6 pb-16 pt-5">
      <div>
        <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em]">{t("billingTitle")}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {t("billingIntro")}
        </p>
      </div>

      <BalanceCard credits={credits} />
      <Statement />
      <CreditPricing highlight={highlight} />
    </div>
  )
}
