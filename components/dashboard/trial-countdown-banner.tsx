"use client"

// Dashboard-wide countdown for a free trial that is still running: how much is
// left, and a route to the plans. Shown to every free user on every dashboard
// route while the trial lives.
//
// Once the trial ends this yields entirely to TrialEndedGate, which replaces the
// page body with a blocking paywall. Also suppressed on /dashboard/billing, where
// the page renders its own richer version with an inline extend button.

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Link, usePathname } from "@/i18n/navigation"
import { api, getAccessToken } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"

interface UsageInfo {
  plan: string
  dailyRemaining: number
  freeCheckTrialEndsAt: string | null
  freeCheckTrialExhausted: boolean
  freeTrialExtensionAvailable?: boolean
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

// Dismissal is scoped to the calendar day rather than forever: a trial that ends
// in 5 days shouldn't nag on every route change, but it should come back tomorrow
// when there's less of it left.
const dismissKey = (endsAt: string | null) =>
  `trialCountdown:${endsAt?.slice(0, 10) ?? "none"}:${new Date().toISOString().slice(0, 10)}`

export function TrialCountdownBanner() {
  const t = useTranslations("trialCountdown")
  const pathname = usePathname()
  const [usage, setUsage] = useState<UsageInfo | null>(null)
  const [dismissed, setDismissed] = useState(true) // assume hidden until we've checked storage

  const load = useCallback(async () => {
    if (!getAccessToken()) return
    try {
      setUsage(await api.get<UsageInfo>("/api/usage"))
    } catch {
      // Never let a usage hiccup surface as an error banner — just stay hidden.
    }
  }, [])

  useEffect(() => {
    void load()
    const onRefresh = () => void load()
    window.addEventListener("usage:refresh", onRefresh)
    return () => window.removeEventListener("usage:refresh", onRefresh)
  }, [load])

  // Re-read dismissal whenever the trial end date changes (including the bump from
  // redeeming an extension, which should un-dismiss the fresh countdown).
  useEffect(() => {
    if (!usage) return
    try {
      setDismissed(window.localStorage.getItem(dismissKey(usage.freeCheckTrialEndsAt)) === "1")
    } catch {
      setDismissed(false) // storage blocked (private mode) — showing is the safer default
    }
  }, [usage])

  const dismiss = () => {
    setDismissed(true)
    if (!usage) return
    try {
      window.localStorage.setItem(dismissKey(usage.freeCheckTrialEndsAt), "1")
    } catch {
      // Non-persistent dismissal is fine — it still hides for this page view.
    }
  }

  if (!usage || usage.plan !== "free" || dismissed) return null
  // Once the trial is over, TrialEndedGate takes the whole page — a countdown
  // above it would be redundant at best and contradictory at worst.
  if (usage.freeCheckTrialExhausted) return null
  // The billing page says all of this itself, with an inline extend button.
  if (pathname.startsWith("/dashboard/billing")) return null

  const remainingMs = usage.freeCheckTrialEndsAt
    ? new Date(usage.freeCheckTrialEndsAt).getTime() - Date.now()
    : NaN
  // The server owns "is it over"; if our clock disagrees, stay quiet rather than
  // render "0 days left".
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return null

  const finalDay = remainingMs < DAY_MS
  const message = finalDay
    ? t("hoursLeft", { hours: Math.max(1, Math.ceil(remainingMs / HOUR_MS)) })
    : t("daysLeft", { days: Math.ceil(remainingMs / DAY_MS) })

  return (
    <div
      className="tiny"
      role="status"
      style={{
        margin: "0 0 16px",
        padding: "10px 14px",
        borderRadius: "var(--r-sm)",
        // Escalate to the warning tone only on the last day, so the softer brand
        // tone doesn't lose its meaning by crying wolf for a week.
        background: finalDay ? "var(--warn-soft)" : "var(--brand-soft)",
        color: finalDay ? "var(--warn)" : "var(--brand)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <span style={{ flex: 1, minWidth: 200 }}>
        <strong style={{ fontWeight: 600 }}>{message}</strong>
        {usage.dailyRemaining > 0 && <> · {t("checksLeft", { checks: usage.dailyRemaining })}</>}
      </span>
      <Link href="/dashboard/billing" style={{ flexShrink: 0 }}>
        <button type="button" className="btn primary">{t("cta")}</button>
      </Link>
      <button type="button" className="icon-btn" onClick={dismiss} aria-label={t("dismiss")}>
        <Icon.close />
      </button>
    </div>
  )
}
