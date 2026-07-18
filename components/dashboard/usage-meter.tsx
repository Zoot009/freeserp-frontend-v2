"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "@/i18n/navigation"
import { api, getAccessToken } from "@/lib/api"
import { trackEvent } from "@/lib/track"

interface UsageInfo {
  plan: string
  workerCount?: number
  dailyUsed: number
  dailyLimit: number
  dailyRemaining: number
  // One-time, non-recurring free-plan trial state (see /api/usage). Always
  // null/false for paid plans.
  freeCheckTrialEndsAt: string | null
  freeCheckTrialExhausted: boolean
}

// Daily rank-check quota + plan, shown in the navbar. The whole chip is a single
// "buy more" control: a trailing "Buy" sends the user to the pricing page — where
// free users convert and paid users re-tier their workers. Refreshes on a slow
// interval so the counter tracks checks triggered elsewhere in the app.
const POLL_MS = 60_000

export function UsageMeter() {
  const t = useTranslations("usageMeter")
  const router = useRouter()
  const [usage, setUsage] = useState<UsageInfo | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!getAccessToken()) return
      try {
        const data = await api.get<UsageInfo>("/api/usage")
        if (!cancelled && data && typeof data.dailyLimit === "number") setUsage(data)
      } catch {
        /* silent — the navbar shouldn't surface transient quota-fetch errors */
      }
    }
    void load()
    const t = setInterval(() => void load(), POLL_MS)
    // Other pages dispatch this after consuming quota (e.g. the SERP Checker)
    // so the counter updates immediately instead of waiting for the next poll.
    const onRefresh = () => void load()
    window.addEventListener("usage:refresh", onRefresh)
    return () => {
      cancelled = true
      clearInterval(t)
      window.removeEventListener("usage:refresh", onRefresh)
    }
  }, [])

  if (!usage) return null

  const isPaid = usage.plan === "paid"
  const exhausted = usage.dailyRemaining <= 0
  const countColor = exhausted ? "var(--neg)" : "var(--text)"
  const buyLabel = isPaid ? t("addChecks") : t("buyMore")

  // Free plan: a one-time trial (FREE_TRIAL_WINDOW_DAYS), not a daily
  // allowance — show days remaining (or "Trial ended") instead of "checks today".
  const trialDaysLeft = !isPaid && usage.freeCheckTrialEndsAt
    ? Math.max(0, Math.ceil((new Date(usage.freeCheckTrialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : null
  const freeSuffixLabel = usage.freeCheckTrialExhausted
    ? t("trialEnded")
    : trialDaysLeft != null
      ? `${t("checksTotal")} · ${t("trialDaysLeft", { days: trialDaysLeft })}`
      : t("checksTotal")
  const chipTitle = isPaid
    ? t("chipTitle", {
        plan: t("planPro"),
        used: usage.dailyUsed,
        limit: usage.dailyLimit,
      })
    : t("chipTitleTrial", { used: usage.dailyUsed, limit: usage.dailyLimit })

  return (
    <>
      <button
        type="button"
        className="usage-pill"
        onClick={() => { trackEvent("clicked-buy-button"); router.push("/pricing?clicked-buy-button") }}
        aria-label={buyLabel}
        title={chipTitle}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          height: 36,
          padding: "0 6px 0 10px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--bg-inset, transparent)",
          whiteSpace: "nowrap",
          cursor: "pointer",
          font: "inherit",
          color: "inherit",
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            padding: "2px 6px",
            borderRadius: 5,
            color: isPaid ? "var(--brand)" : "var(--text-mute)",
            background: isPaid ? "var(--brand-soft)" : "var(--bg-inset, transparent)",
            border: isPaid ? "none" : "1px solid var(--border)",
          }}
        >
          {isPaid ? t("planPro") : t("planFree")}
        </span>
        <span className="tiny" style={{ color: countColor }}>
          <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            {usage.dailyUsed}/{usage.dailyLimit}
          </span>{" "}
          <span className="muted usage-suffix">{isPaid ? t("checksToday") : freeSuffixLabel}</span>
        </span>
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            height: 22,
            padding: "0 9px",
            borderRadius: 6,
            color: "var(--brand)",
            background: "var(--brand-soft)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.02em",
          }}
        >
          {t("buy")}
        </span>
      </button>
    </>
  )
}
