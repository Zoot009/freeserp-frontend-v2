"use client"

import { useEffect, useState } from "react"
import { api, ApiError } from "@/lib/api"
import { toast } from "sonner"
import { Icon } from "@/components/dashboard/icons"
import { SEARCHES_PER_WORKER, PRICE_PER_WORKER_USD, PRICING_TIERS } from "@/lib/pricing"

// Subset of GET /api/usage we need here (same shape the billing page reads).
interface Usage {
  plan: "free" | "paid" | string
  workerCount: number
  perWorkerDailyChecks: number
}

// Plan benefits — mirrors the paid column on the standalone pricing page.
const FEATURES = [
  "Automated recurring checks",
  "Unlimited AI analysis (all sections)",
  "Internal link analysis for ALL competitors",
  "Priority support",
]

// Nearest fixed tier to an arbitrary worker count (paid users may sit between tiers).
const nearestTier = (count: number) => {
  let best = 0
  for (let i = 1; i < PRICING_TIERS.length; i++) {
    if (Math.abs(PRICING_TIERS[i] - count) < Math.abs(PRICING_TIERS[best] - count)) best = i
  }
  return best
}

const Check = () => (
  <span
    style={{
      display: "grid",
      placeItems: "center",
      width: 18,
      height: 18,
      flexShrink: 0,
      borderRadius: 6,
      background: "var(--brand-soft)",
      color: "var(--brand)",
      marginTop: 1,
    }}
  >
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
      <path d="M2 7L5.5 10.5L12 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
)

export function AddWorkersModal({ onClose }: { onClose: () => void }) {
  const [usage, setUsage] = useState<Usage | null>(null)
  const [loading, setLoading] = useState(true)
  const [tierIndex, setTierIndex] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const u = await api.get<Usage>("/api/usage")
        if (!cancelled && u) {
          setUsage(u)
          setTierIndex(nearestTier(Math.max(1, u.workerCount ?? 1)))
        }
      } catch {
        // The modal still works with defaults if usage can't be fetched.
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const isPaid = usage?.plan === "paid"
  // Pricing is fixed at $1/worker = SEARCHES_PER_WORKER checks/day, matching the
  // standalone pricing page. Don't use usage.perWorkerDailyChecks here — for a
  // free viewer that's their (smaller) free daily limit, which would understate
  // what buying workers actually grants.
  const perWorker = SEARCHES_PER_WORKER
  const workers = PRICING_TIERS[tierIndex]
  const searchesPerDay = workers * perWorker
  const monthlyUsd = workers * PRICE_PER_WORKER_USD
  const dirty = isPaid && workers !== (usage?.workerCount ?? 1)
  const atMin = tierIndex <= 0
  const atMax = tierIndex >= PRICING_TIERS.length - 1

  const handleBuy = async () => {
    setBusy(true)
    try {
      const { url } = await api.post<{ url: string }>("/api/billing/checkout", { workerCount: workers })
      if (!url) throw new Error("Checkout URL missing")
      window.location.href = url
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not start checkout")
      setBusy(false)
    }
  }

  const handleSave = async () => {
    if (!dirty) return
    setBusy(true)
    try {
      await api.patch("/api/billing/workers", { workerCount: workers })
      toast.success(`Updated to ${workers} ${workers === 1 ? "worker" : "workers"} — ${searchesPerDay.toLocaleString()} checks/day. Prorated.`)
      window.dispatchEvent(new Event("usage:refresh"))
      onClose()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update your workers")
      setBusy(false)
    }
  }

  const stepBtnStyle: React.CSSProperties = {
    width: 46,
    height: 46,
    padding: 0,
    justifyContent: "center",
    fontSize: 22,
    fontWeight: 600,
    flexShrink: 0,
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal aw-modal" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="aw-close" aria-label="Close"><Icon.close /></button>

        <div className="aw-body">
          {loading ? (
            <div className="aw-loading tiny muted">Loading…</div>
          ) : (
            <>
              <span className="chip brand">Workers</span>

              {/* Price scales with worker count: $1/worker, perWorker checks/day each. */}
              <div style={{ marginTop: 16, display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: "clamp(34px, 9vw, 44px)", fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1 }}>
                  ${monthlyUsd}
                </span>
                <span className="muted" style={{ fontSize: 13 }}>/month</span>
              </div>
              <p className="tiny muted" style={{ marginTop: 6 }}>
                <span style={{ color: "var(--text)", fontWeight: 600 }}>{searchesPerDay.toLocaleString()}</span> rank checks / day · {workers} {workers === 1 ? "worker" : "workers"}
              </p>

              {/* Fixed pricing tiers — stepped through with −/+ (no custom amounts). */}
              <div
                style={{
                  marginTop: 20,
                  padding: 14,
                  borderRadius: "var(--r-md)",
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                }}
              >
                <div className="row between" style={{ marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-mute)" }}>
                    Choose your plan
                  </span>
                  <span className="tiny muted">{perWorker}/day · ${PRICE_PER_WORKER_USD}/mo each</span>
                </div>

                {/* Incremental stepper — −/+ move between the fixed tiers */}
                <div className="row" style={{ gap: 12, alignItems: "stretch" }}>
                  <button
                    type="button"
                    aria-label="Fewer checks"
                    className="btn"
                    onClick={() => setTierIndex((i) => Math.max(0, i - 1))}
                    disabled={busy || atMin}
                    style={stepBtnStyle}
                  >
                    −
                  </button>
                  <div
                    style={{
                      flex: 1,
                      display: "grid",
                      placeItems: "center",
                      gap: 2,
                      padding: "6px 4px",
                      borderRadius: "var(--r-sm)",
                      background: "var(--bg-elev)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <span style={{ fontSize: 20, fontWeight: 700, color: "var(--brand)", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
                      {searchesPerDay.toLocaleString()} checks/day
                    </span>
                    <span className="tiny muted" style={{ fontVariantNumeric: "tabular-nums" }}>
                      ${monthlyUsd}/month
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label="More checks"
                    className="btn"
                    onClick={() => setTierIndex((i) => Math.min(PRICING_TIERS.length - 1, i + 1))}
                    disabled={busy || atMax}
                    style={stepBtnStyle}
                  >
                    +
                  </button>
                </div>

                {/* Tier scale — click a segment to jump straight to that tier */}
                <div className="row" style={{ gap: 4, marginTop: 12 }}>
                  {PRICING_TIERS.map((tt, i) => (
                    <button
                      key={tt}
                      type="button"
                      aria-label={`$${tt}`}
                      aria-pressed={i === tierIndex}
                      onClick={() => setTierIndex(i)}
                      disabled={busy}
                      style={{
                        flex: 1,
                        height: 6,
                        padding: 0,
                        border: "none",
                        cursor: busy ? "default" : "pointer",
                        borderRadius: 3,
                        background: i <= tierIndex ? "var(--brand)" : "var(--border)",
                      }}
                    />
                  ))}
                </div>
                <div className="row between" style={{ marginTop: 6 }}>
                  <span className="tiny muted">${PRICING_TIERS[0]}</span>
                  <span className="tiny muted">${PRICING_TIERS[PRICING_TIERS.length - 1]}</span>
                </div>
                <p className="tiny muted" style={{ marginTop: 10 }}>
                  Billed <span style={{ color: "var(--text)", fontWeight: 600 }}>monthly</span>, cancel anytime.
                </p>
              </div>

              <ul style={{ listStyle: "none", margin: "20px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                {FEATURES.map((f) => (
                  <li key={f} className="row" style={{ alignItems: "flex-start", gap: 10, fontSize: 13 }}>
                    <Check />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {isPaid ? (
                <button
                  className="btn primary"
                  onClick={handleSave}
                  disabled={busy || !dirty}
                  style={{ width: "100%", justifyContent: "center", marginTop: 20 }}
                >
                  {busy ? "Saving…" : dirty ? "Save changes" : "Saved"}
                </button>
              ) : (
                <button
                  className="btn primary"
                  onClick={handleBuy}
                  disabled={busy}
                  style={{ width: "100%", justifyContent: "center", marginTop: 20 }}
                >
                  {busy ? "Redirecting…" : `Get ${workers} ${workers === 1 ? "worker" : "workers"} — $${monthlyUsd}/mo →`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
