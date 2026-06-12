"use client"

import { useEffect, useState } from "react"
import { api, ApiError } from "@/lib/api"
import { toast } from "sonner"
import { Icon } from "@/components/dashboard/icons"
import { TIERS, SEARCHES_PER_WORKER, PRICE_PER_WORKER_USD } from "@/lib/pricing"

// Subset of GET /api/usage we need here (same shape the billing page reads).
interface Usage {
  plan: "free" | "paid" | string
  workerCount: number
  perWorkerDailyChecks: number
}

export function AddWorkersModal({ onClose }: { onClose: () => void }) {
  const [usage, setUsage] = useState<Usage | null>(null)
  const [loading, setLoading] = useState(true)
  const [workers, setWorkers] = useState(1)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const u = await api.get<Usage>("/api/usage")
        if (!cancelled && u) {
          setUsage(u)
          setWorkers(Math.max(1, u.workerCount ?? 1))
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
  const perWorker = usage?.perWorkerDailyChecks ?? SEARCHES_PER_WORKER
  const searchesPerDay = workers * perWorker
  const monthlyUsd = workers * PRICE_PER_WORKER_USD
  const dirty = isPaid && workers !== (usage?.workerCount ?? 1)

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

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-h">
          <div>
            <div className="eyebrow" style={{ margin: 0, fontSize: 11 }}>
              <span className="spark"><Icon.spark /></span> {isPaid ? "ADD WORKERS" : "GET MORE CHECKS"}
            </div>
            <div className="b" style={{ fontSize: 18, marginTop: 4 }}>
              {isPaid ? "Scale your daily checks" : "Add workers"}
            </div>
          </div>
          <button onClick={onClose} className="icon-btn" aria-label="Close"><Icon.close /></button>
        </div>

        <div className="modal-b" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {loading ? (
            <div className="tiny muted">Loading…</div>
          ) : (
            <>
              <p className="tiny muted" style={{ margin: 0 }}>
                Each $1/mo adds {perWorker} rank checks/day. Pick a plan — change anytime, we prorate the difference.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {TIERS.map((tier) => {
                  const active = tier.workers === workers
                  return (
                    <button
                      key={tier.usd}
                      type="button"
                      aria-pressed={active}
                      className="btn"
                      onClick={() => setWorkers(tier.workers)}
                      disabled={busy}
                      style={{
                        flexDirection: "column",
                        gap: 2,
                        padding: "9px 4px",
                        height: "auto",
                        borderColor: active ? "var(--brand)" : "var(--border)",
                        background: active ? "var(--brand-soft)" : "var(--bg-elev)",
                        color: active ? "var(--brand)" : "var(--text)",
                        boxShadow: active ? "inset 0 0 0 1px var(--brand)" : "none",
                      }}
                    >
                      <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>${tier.usd}</span>
                      <span className="tiny muted" style={{ fontVariantNumeric: "tabular-nums" }}>{tier.checks.toLocaleString()}/day</span>
                    </button>
                  )
                })}
              </div>

              <p className="tiny muted" style={{ margin: 0, textAlign: "center" }}>
                <span style={{ color: "var(--text)", fontWeight: 600 }}>{searchesPerDay.toLocaleString()}</span> rank checks / day ·{" "}
                <span style={{ color: "var(--text)", fontWeight: 600 }}>${monthlyUsd}</span>/month
              </p>
            </>
          )}
        </div>

        <div className="modal-f">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          {isPaid ? (
            <button className="btn primary" onClick={handleSave} disabled={busy || loading || !dirty}>
              {busy ? "Saving…" : dirty ? "Save changes (prorated)" : "Saved"}
            </button>
          ) : (
            <button className="btn primary" onClick={handleBuy} disabled={busy || loading}>
              {busy ? "Redirecting…" : `Get ${workers} ${workers === 1 ? "worker" : "workers"} — $${monthlyUsd}/mo →`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
