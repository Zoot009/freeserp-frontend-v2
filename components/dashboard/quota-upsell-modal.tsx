"use client"

// Global paywall upsell. Listens for the `billing:quota` window event fired by
// lib/api.ts whenever ANY request returns 402 (daily quota, free trial, project
// or keyword limits) and offers the upgrade path right at the moment of intent:
//  - free users → subscribe CTA to /pricing
//  - paid users → one-click prorated bump to the next worker tier (PATCH
//    /api/billing/workers), with a live "charged now" preview when available.
// Mounted once in the dashboard layout; uses the dashboard's .modal-* pattern.

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { api, ApiError } from "@/lib/api"
import { fetchBillingConfig } from "@/lib/billing-config"
import { Icon } from "@/components/dashboard/icons"

interface QuotaEventDetail {
  code?: string
  message?: string
  details?: unknown
}

interface Usage {
  plan: "free" | "paid"
  workerCount: number
  perWorkerDailyChecks: number
  dailyUsed: number
  dailyLimit: number
  dailyRemaining: number
  // One-time trial extension: available only to a free user whose trial is over
  // and who has never redeemed. Absent on backends predating the feature.
  freeTrialExtensionAvailable?: boolean
  freeTrialExtended?: boolean
}

interface WorkersPreview {
  workerCount: number
  interval: "month" | "year"
  currency: string
  amountDueCents: number
  recurringCents: number
}

// Don't reopen for a burst of parallel 402s (e.g. a page firing several
// requests at once) or immediately after the user dismissed it.
const REOPEN_COOLDOWN_MS = 5_000

const KNOWN_CODES = new Set([
  "daily_quota_exhausted",
  "free_trial_exhausted",
  // Free user out of checks for TODAY only — the trial is still running and
  // resets at midnight UTC. Deliberately not a paywall: there is nothing to
  // buy yet and no extension to redeem, so this renders as an FYI.
  "free_daily_quota_exhausted",
  "project_limit_reached",
  "keyword_limit_reached",
  // Free daily keyword-add cap (delete→re-add can't farm past it).
  "keyword_add_limit_reached",
  "ai_analysis_limit_reached",
])

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100)
  } catch {
    return `$${(cents / 100).toFixed(2)}`
  }
}

export function QuotaUpsellModal() {
  const t = useTranslations("quotaUpsell")
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState<string>("daily_quota_exhausted")
  const [eventDetails, setEventDetails] = useState<{ limit?: number; used?: number } | null>(null)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [nextTier, setNextTier] = useState<number | null>(null)
  const [checksPerDay, setChecksPerDay] = useState(15)
  const [preview, setPreview] = useState<WorkersPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [extension, setExtension] = useState<{ days: number; checks: number } | null>(null)
  const lastShownAt = useRef(0)

  const close = useCallback(() => {
    lastShownAt.current = Date.now()
    setOpen(false)
  }, [])

  useEffect(() => {
    const onQuota = async (ev: Event) => {
      const detail = (ev as CustomEvent<QuotaEventDetail>).detail ?? {}
      const evCode = detail.code && KNOWN_CODES.has(detail.code) ? detail.code : "daily_quota_exhausted"
      if (Date.now() - lastShownAt.current < REOPEN_COOLDOWN_MS) return
      lastShownAt.current = Date.now()

      setCode(evCode)
      setEventDetails((detail.details as { limit?: number; used?: number } | undefined) ?? null)
      setUsage(null)
      setNextTier(null)
      setPreview(null)
      setExtension(null)
      setOpen(true)

      try {
        const [u, cfg] = await Promise.all([api.get<Usage>("/api/usage"), fetchBillingConfig()])
        setUsage(u)
        setChecksPerDay(cfg.perWorkerDailyChecks)
        setExtension({
          days: cfg.freeTrial?.extensionDays ?? 2,
          checks: cfg.freeTrial?.extensionChecks ?? 6,
        })
        if (u.plan === "paid") {
          // First configured tier strictly above the current count — also lifts
          // grandfathered 1-worker subs onto the smallest current tier.
          const next = cfg.tiers.find((tier) => tier > u.workerCount) ?? null
          setNextTier(next)
          if (next !== null) {
            try {
              const p = await api.get<WorkersPreview>("/api/billing/workers/preview", {
                query: { workerCount: next },
              })
              setPreview(p)
            } catch {
              // preview_unavailable (PayU) or transient error — show the tier
              // without the prorated line.
            }
          }
        }
      } catch {
        // Usage fetch failed — keep the generic free-style CTA below.
      }
    }
    window.addEventListener("billing:quota", onQuota)
    return () => window.removeEventListener("billing:quota", onQuota)
  }, [])

  const confirmUpgrade = useCallback(async () => {
    if (nextTier === null) return
    setBusy(true)
    try {
      await api.patch("/api/billing/workers", { workerCount: nextTier })
      window.dispatchEvent(new Event("usage:refresh"))
      toast.success(t("upgraded", { checks: nextTier * checksPerDay }))
      close()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("upgradeFailed"))
    } finally {
      setBusy(false)
    }
  }, [nextTier, checksPerDay, close, t])

  const redeemExtension = useCallback(async () => {
    setBusy(true)
    try {
      await api.post("/api/billing/trial/extend", {})
      window.dispatchEvent(new Event("usage:refresh"))
      toast.success(
        t("extendSuccess", { days: extension?.days ?? 2, checks: extension?.checks ?? 6 }),
      )
      close()
    } catch (err) {
      // A 409 here means it was already redeemed (another tab, or a double click
      // that raced the server's compare-and-set) — the message says so.
      toast.error(err instanceof ApiError ? err.message : t("extendFailed"))
    } finally {
      setBusy(false)
    }
  }, [extension, close, t])

  if (!open) return null

  const isPaid = usage?.plan === "paid"
  // Out of checks for today, trial still alive. Informational — no upgrade push,
  // no extension offer (there's nothing to extend yet), and the dismiss button
  // becomes the primary action.
  const isFreeDaily = code === "free_daily_quota_exhausted"
  // Only offered on the trial-exhausted paywall: the other 402 codes (project /
  // keyword / AI caps) aren't time-limited, so more trial days wouldn't lift them.
  const canExtend =
    !isPaid && code === "free_trial_exhausted" && usage?.freeTrialExtensionAvailable === true
  const bodyKey =
    code === "free_trial_exhausted"
      ? "bodyFreeTrial"
      : isFreeDaily
        ? "bodyFreeDailyQuota"
        : code === "project_limit_reached"
          ? "bodyProjectLimit"
          : code === "keyword_limit_reached" || code === "keyword_add_limit_reached"
            ? "bodyKeywordLimit"
            : code === "ai_analysis_limit_reached"
              ? "bodyAiLimit"
              : "bodyDailyQuota"

  return (
    <div className="fs-app">
      <div className="modal-bg" onClick={busy ? undefined : close}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 470 }}>
          <div className="modal-h">
            <div>
              <div className="eyebrow" style={{ margin: 0, fontSize: 11 }}>
                <span className="spark"><Icon.spark /></span> {t("eyebrow")}
              </div>
              <div className="b" style={{ fontSize: 18, marginTop: 4 }}>
                {isPaid ? t("titlePaid") : isFreeDaily ? t("titleFreeDaily") : t("titleFree")}
              </div>
            </div>
            <button type="button" onClick={close} className="icon-btn" aria-label={t("close")} disabled={busy}>
              <Icon.close />
            </button>
          </div>

          <div className="modal-b" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="tiny muted" style={{ lineHeight: 1.6 }}>
              {t(bodyKey, {
                // The AI-cap error carries its own limit/used in the 402 details;
                // the daily-quota codes read from the usage summary.
                used: eventDetails?.used ?? usage?.dailyUsed ?? 0,
                limit: eventDetails?.limit ?? usage?.dailyLimit ?? 0,
              })}
            </div>

            {isPaid && nextTier !== null && (
              <div
                className="card tight"
                style={{ borderColor: "var(--brand)", background: "var(--brand-soft)", display: "flex", flexDirection: "column", gap: 8 }}
              >
                <div className="b" style={{ fontSize: 14 }}>
                  {t("nextTier", { checks: nextTier * checksPerDay })}
                </div>
                {preview ? (
                  <div className="tiny muted" style={{ lineHeight: 1.55 }}>
                    {t("proratedNow", { amount: formatMoney(preview.amountDueCents, preview.currency) })}
                    <br />
                    {t("thenRecurring", {
                      amount: formatMoney(preview.recurringCents, preview.currency),
                      interval: preview.interval === "year" ? t("perYear") : t("perMonth"),
                    })}
                  </div>
                ) : (
                  <div className="tiny muted">{t("proratedGeneric")}</div>
                )}
              </div>
            )}

            {isPaid && nextTier === null && usage && (
              <div className="tiny muted" style={{ lineHeight: 1.6 }}>{t("maxTier")}</div>
            )}

            {canExtend && (
              <div
                className="card tight"
                style={{ display: "flex", flexDirection: "column", gap: 6 }}
              >
                <div className="b" style={{ fontSize: 14 }}>
                  {t("extendTitle", { days: extension?.days ?? 2 })}
                </div>
                <div className="tiny muted" style={{ lineHeight: 1.55 }}>
                  {t("extendBody", {
                    days: extension?.days ?? 2,
                    checks: extension?.checks ?? 6,
                  })}
                </div>
                <div className="tiny muted" style={{ opacity: 0.8 }}>{t("extendOnce")}</div>
              </div>
            )}
          </div>

          <div className="modal-f">
            {isFreeDaily ? (
              // Dismissal is the primary action — the user has done nothing wrong
              // and their checks come back tomorrow. Plans stay one click away as
              // a secondary, so this is still an upsell surface without pretending
              // the trial is over.
              <>
                <Link href="/pricing?clicked-buy-button" onClick={close}>
                  <button type="button" className="btn">{t("seePlans")}</button>
                </Link>
                <button type="button" className="btn primary" onClick={close}>
                  {t("gotIt")}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn" onClick={close} disabled={busy}>
                  {t("notNow")}
                </button>
                {canExtend && (
                  <button type="button" className="btn" onClick={redeemExtension} disabled={busy}>
                    {busy ? t("working") : t("extendCta", { days: extension?.days ?? 2 })}
                  </button>
                )}
                {isPaid && nextTier !== null ? (
                  <button type="button" className="btn primary" onClick={confirmUpgrade} disabled={busy}>
                    {busy ? t("working") : t("upgradeCta", { checks: nextTier * checksPerDay })}
                  </button>
                ) : (
                  <Link href="/pricing?clicked-buy-button" onClick={close}>
                    <button type="button" className="btn primary">{t("subscribeCta")}</button>
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
