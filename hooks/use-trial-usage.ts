"use client"

// Shared free-trial state for the dashboard chrome. The banner and the sidebar
// both need "how much trial is left", and they must never disagree — so they
// read it from here rather than each deriving it from their own /api/usage call.
//
// Follows the app-wide convention of refetching on the "usage:refresh" event.

import { useCallback, useEffect, useState } from "react"
import { api, getAccessToken } from "@/lib/api"
import { fetchBillingConfig } from "@/lib/billing-config"

export interface TrialUsage {
  plan: string
  dailyUsed: number
  dailyLimit: number
  dailyRemaining: number
  freeCheckTrialEndsAt: string | null
  /**
   * TERMINAL — the trial window elapsed or the lifetime ceiling was hit. This is
   * the paywall flag. A free user who has merely spent today's allowance is NOT
   * exhausted; see freeTrialDailyExhausted.
   */
  freeCheckTrialExhausted: boolean
  /** Today's allowance is spent, resets at UTC midnight. Never a paywall. */
  freeTrialDailyExhausted?: boolean
  /** Trial-wide ceiling. null on paid plans, absent from an older backend. */
  trialLifetimeLimit?: number | null
  trialLifetimeUsed?: number | null
  trialLifetimeRemaining?: number | null
  freeTrialExtensionAvailable?: boolean
}

export interface TrialState {
  /** Epoch ms the trial ends. For call sites that tick a live countdown. */
  endsAtMs: number
  /** Whole hours left, floored at 1 so a live trial never reads as "0 hours". */
  hoursLeft: number
  /** Whole days left, rounded up — matches the topbar usage meter. */
  daysLeft: number
  /** Under 24h: call sites escalate the visual tone. */
  finalDay: boolean
  /** 0-100, share of the trial window already spent. Approximate if extended. */
  percentElapsed: number
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

export function useTrialUsage() {
  const [usage, setUsage] = useState<TrialUsage | null>(null)
  const [windowDays, setWindowDays] = useState<number | null>(null)
  // True until the FIRST fetch settles (success or failure). Lets the chrome hold
  // a stable placeholder instead of flashing the generic pitch, then the trial
  // line, as `usage` fills in.
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!getAccessToken()) {
      setLoading(false)
      return
    }
    try {
      setUsage(await api.get<TrialUsage>("/api/usage"))
    } catch {
      // Never let a usage hiccup surface as an error in the chrome — stay quiet.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const onRefresh = () => void load()
    window.addEventListener("usage:refresh", onRefresh)
    return () => window.removeEventListener("usage:refresh", onRefresh)
  }, [load])

  // Only needed to size the progress bar; a failure just drops the bar, so the
  // fallback config is good enough and this never blocks the banner.
  useEffect(() => {
    let alive = true
    void fetchBillingConfig().then((cfg) => {
      if (alive) setWindowDays(cfg.freeTrial.windowDays)
    })
    return () => {
      alive = false
    }
  }, [])

  // Non-null only while a free user's trial is genuinely still running. The
  // server owns "is it over" — if our clock disagrees, we report nothing rather
  // than rendering "0 days left".
  let trial: TrialState | null = null
  if (usage && usage.plan === "free" && !usage.freeCheckTrialExhausted && usage.freeCheckTrialEndsAt) {
    const endsAtMs = new Date(usage.freeCheckTrialEndsAt).getTime()
    const remainingMs = endsAtMs - Date.now()
    if (Number.isFinite(remainingMs) && remainingMs > 0) {
      // An extended trial can outlast the nominal window, which would read as
      // negative elapsed — clamp rather than invert the bar.
      const totalMs = (windowDays ?? 0) * DAY_MS
      const percentElapsed = totalMs > 0 ? Math.min(100, Math.max(0, ((totalMs - remainingMs) / totalMs) * 100)) : 0
      trial = {
        endsAtMs,
        hoursLeft: Math.max(1, Math.ceil(remainingMs / HOUR_MS)),
        daysLeft: Math.ceil(remainingMs / DAY_MS),
        finalDay: remainingMs < DAY_MS,
        percentElapsed,
      }
    }
  }

  return { usage, trial, loading }
}
