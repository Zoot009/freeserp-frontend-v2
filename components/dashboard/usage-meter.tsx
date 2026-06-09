"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { api, getAccessToken } from "@/lib/api"

interface UsageInfo {
  plan: string
  workerCount?: number
  dailyUsed: number
  dailyLimit: number
  dailyRemaining: number
}

// Daily rank-check quota + plan, shown in the navbar. Free users get a clickable
// chip linking to pricing; paid users see a static chip. Refreshes on a slow
// interval so the counter tracks checks triggered elsewhere in the app.
const POLL_MS = 60_000

export function UsageMeter() {
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
  const workerSuffix = isPaid && usage.workerCount ? ` (${usage.workerCount} ${usage.workerCount === 1 ? "worker" : "workers"})` : ""

  const chip = (
    <div
      className="row"
      title={`${isPaid ? "Pro" : "Free"} plan${workerSuffix} — ${usage.dailyUsed}/${usage.dailyLimit} rank checks used today`}
      style={{
        gap: 8,
        height: 36,
        padding: "0 10px",
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--bg-inset, transparent)",
        whiteSpace: "nowrap",
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
        {isPaid ? "Pro" : "Free"}
      </span>
      <span className="tiny" style={{ color: countColor }}>
        <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          {usage.dailyUsed}/{usage.dailyLimit}
        </span>{" "}
        <span className="muted usage-suffix">checks today</span>
      </span>
    </div>
  )

  // Free users: the chip doubles as an upgrade entry point.
  return isPaid ? chip : <Link href="/pricing" aria-label="Daily checks — upgrade for more">{chip}</Link>
}
