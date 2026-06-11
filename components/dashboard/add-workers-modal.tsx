"use client"

import { useEffect, useState } from "react"
import { api, ApiError } from "@/lib/api"
import { toast } from "sonner"
import { Icon } from "@/components/dashboard/icons"

// Keep in sync with the backend workers plan, the pricing page, and the billing
// page (app/dashboard/billing/page.tsx).
const SEARCHES_PER_WORKER = 15
const PRICE_PER_WORKER_USD = 1
const MAX_WORKERS = 50

// Subset of GET /api/usage we need here (same shape the billing page reads).
interface Usage {
  plan: "free" | "paid" | string
  workerCount: number
  perWorkerDailyChecks: number
}

const stepBtn: React.CSSProperties = {
  width: 44,
  height: 44,
  padding: 0,
  justifyContent: "center",
  fontSize: 20,
  fontWeight: 600,
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
                Each worker adds {perWorker} rank checks/day for ${PRICE_PER_WORKER_USD}/mo. Change anytime — we prorate the difference.
              </p>

              <div className="row" style={{ gap: 10, justifyContent: "center" }}>
                <button
                  type="button"
                  aria-label="Remove a worker"
                  className="btn"
                  onClick={() => setWorkers((w) => Math.max(1, w - 1))}
                  disabled={workers <= 1 || busy}
                  style={stepBtn}
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  max={MAX_WORKERS}
                  value={workers}
                  disabled={busy}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10)
                    setWorkers(Number.isNaN(n) ? 1 : Math.min(MAX_WORKERS, Math.max(1, n)))
                  }}
                  className="input"
                  style={{ width: 90, textAlign: "center", fontSize: 18, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
                />
                <button
                  type="button"
                  aria-label="Add a worker"
                  className="btn"
                  onClick={() => setWorkers((w) => Math.min(MAX_WORKERS, w + 1))}
                  disabled={workers >= MAX_WORKERS || busy}
                  style={stepBtn}
                >
                  +
                </button>
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
