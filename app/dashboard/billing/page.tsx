"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { api, ApiError, getAccessToken } from "@/lib/api"
import { StatTile } from "@/components/dashboard/primitives"
import { Icon } from "@/components/dashboard/icons"

// Keep in sync with the backend workers plan (planLimits / seed) and the pricing page.
const SEARCHES_PER_WORKER = 15
const PRICE_PER_WORKER_USD = 1
const MAX_WORKERS = 50

interface Usage {
  plan: "free" | "paid" | string
  planSlug: string
  workerCount: number
  perWorkerDailyChecks: number
  dailyUsed: number
  dailyLimit: number
  dailyRemaining: number
}

interface Subscription {
  status: string
  provider: string
  workerCount: number
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  trialEndsAt: string | null
  stripeSubscriptionId: string | null
  razorpaySubscriptionId: string | null
}

interface Payment {
  id: string
  date: string
  provider: string
  label: string
  amountCents: number
  currency: string
  status: string
}

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

export default function BillingPage() {
  const [usage, setUsage] = useState<Usage | null>(null)
  const [sub, setSub] = useState<Subscription | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [workers, setWorkers] = useState(1)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!getAccessToken()) {
      setLoading(false)
      return
    }
    try {
      const [u, s, h] = await Promise.all([
        api.get<Usage>("/api/usage").catch(() => null),
        api.get<{ subscription: Subscription | null }>("/api/billing/subscription").catch(() => ({ subscription: null })),
        api.get<{ payments: Payment[] }>("/api/billing/history").catch(() => ({ payments: [] })),
      ])
      if (u) {
        setUsage(u)
        setWorkers(u.workerCount ?? 1)
      }
      setSub(s?.subscription ?? null)
      setPayments(h?.payments ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const isPaid = usage?.plan === "paid"
  const perWorker = usage?.perWorkerDailyChecks ?? SEARCHES_PER_WORKER
  const dirty = isPaid && workers !== (usage?.workerCount ?? 1)
  const searchesPerDay = workers * perWorker
  const monthlyUsd = workers * PRICE_PER_WORKER_USD
  const usedPct = usage && usage.dailyLimit > 0 ? Math.min(100, Math.round((usage.dailyUsed / usage.dailyLimit) * 100)) : 0
  const canResume = sub?.provider !== "razorpay"

  const refreshMeter = () => window.dispatchEvent(new Event("usage:refresh"))

  const applyWorkerChange = async () => {
    if (!dirty) return
    setSaving(true)
    try {
      await api.patch("/api/billing/workers", { workerCount: workers })
      toast.success(`Updated to ${workers} ${workers === 1 ? "worker" : "workers"} — ${searchesPerDay.toLocaleString()} checks/day. Prorated.`)
      await load()
      refreshMeter()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update your workers")
    } finally {
      setSaving(false)
    }
  }

  const cancelPlan = async () => {
    if (!confirm("Cancel your plan? You'll keep access until the end of the current billing period.")) return
    setBusy(true)
    try {
      await api.post("/api/billing/cancel")
      toast.success("Plan cancelled — active until the end of the period.")
      await load()
      refreshMeter()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not cancel")
    } finally {
      setBusy(false)
    }
  }

  const resumePlan = async () => {
    setBusy(true)
    try {
      await api.post("/api/billing/resume")
      toast.success("Plan resumed — auto-renewal is back on.")
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not resume")
    } finally {
      setBusy(false)
    }
  }

  const openPortal = async () => {
    setBusy(true)
    try {
      const { url } = await api.post<{ url: string }>("/api/billing/portal")
      window.location.href = url
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Billing portal unavailable")
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="tiny muted">Loading billing…</div>
      </div>
    )
  }

  return (
    <div className="page" style={{ maxWidth: 1040 }}>
      {/* Header */}
      <div className="page-h">
        <div>
          <div className="eyebrow"><span className="spark"><Icon.spark /></span> BILLING</div>
          <h1>Billing &amp; usage</h1>
          <div className="sub">Manage your plan, see usage, and review payments.</div>
        </div>
      </div>

      {/* Overview tiles */}
      <div className="grid g-4" style={{ marginBottom: 16 }}>
        <StatTile lbl="Plan" val={isPaid ? "Workers" : "Free"} tip={isPaid ? `${usage?.workerCount} active` : "Manual checks"} />
        <StatTile lbl="Workers" val={isPaid ? (usage?.workerCount ?? 1) : "—"} tip={isPaid ? `${perWorker}/day each` : undefined} />
        <StatTile lbl="Monthly cost" val={isPaid ? `$${(usage?.workerCount ?? 1) * PRICE_PER_WORKER_USD}` : "$0"} tip={isPaid ? "billed monthly" : "free forever"} />
        <StatTile lbl="Checks today" val={`${usage?.dailyUsed ?? 0} / ${usage?.dailyLimit ?? 0}`} tip={`${usage?.dailyRemaining ?? 0} remaining`} />
      </div>

      <div className="grid g-21" style={{ marginBottom: 16, alignItems: "start" }}>
        {/* Plan & workers */}
        <div className="card">
          <div className="card-h">
            <div>
              <div className="t">{isPaid ? "Workers" : "Your plan"}</div>
              <div className="tiny muted">{isPaid ? "Each worker adds 15 checks/day for $1/mo" : "Upgrade to scale your daily checks"}</div>
            </div>
          </div>

          {!isPaid ? (
            <div>
              <p className="tiny muted" style={{ marginBottom: 14 }}>
                You&apos;re on the Free plan — {usage?.dailyLimit ?? 15} rank checks/day, manual only. Add workers to
                unlock automated recurring checks and more capacity.
              </p>
              <Link href="/pricing"><button className="btn primary">Upgrade →</button></Link>
            </div>
          ) : (
            <div>
              <div className="row" style={{ gap: 10 }}>
                <button className="btn" onClick={() => setWorkers(w => Math.max(1, w - 1))} disabled={workers <= 1 || saving} style={stepBtn} aria-label="Remove a worker">−</button>
                <input
                  type="number"
                  min={1}
                  max={MAX_WORKERS}
                  value={workers}
                  disabled={saving}
                  onChange={e => {
                    const n = parseInt(e.target.value, 10)
                    setWorkers(Number.isNaN(n) ? 1 : Math.min(MAX_WORKERS, Math.max(1, n)))
                  }}
                  className="input"
                  style={{ width: 80, textAlign: "center", fontSize: 18, fontWeight: 600 }}
                />
                <button className="btn" onClick={() => setWorkers(w => Math.min(MAX_WORKERS, w + 1))} disabled={workers >= MAX_WORKERS || saving} style={stepBtn} aria-label="Add a worker">+</button>
              </div>
              <p className="tiny muted" style={{ marginTop: 12 }}>
                <span style={{ color: "var(--text)", fontWeight: 600 }}>{searchesPerDay.toLocaleString()}</span> rank checks / day ·{" "}
                <span style={{ color: "var(--text)", fontWeight: 600 }}>${monthlyUsd}</span>/month
              </p>
              <button className="btn primary" onClick={applyWorkerChange} disabled={!dirty || saving} style={{ marginTop: 14 }}>
                {saving ? "Saving…" : dirty ? "Save changes (prorated)" : "Saved"}
              </button>
            </div>
          )}
        </div>

        {/* Subscription details */}
        <div className="card">
          <div className="card-h">
            <div className="t">Subscription</div>
            {isPaid && sub && (
              <span className={"chip " + (sub.cancelAtPeriodEnd ? "warn" : "pos")}>
                {sub.cancelAtPeriodEnd ? "Cancels soon" : sub.status === "trialing" ? "Trial" : "Active"}
              </span>
            )}
          </div>

          {!isPaid || !sub ? (
            <div className="tiny muted">No active subscription.</div>
          ) : (
            <>
              <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", fontSize: 13 }}>
                <dt className="muted">Provider</dt>
                <dd style={{ margin: 0, textTransform: "capitalize" }}>{sub.provider}</dd>
                <dt className="muted">{sub.cancelAtPeriodEnd ? "Ends" : "Renews"}</dt>
                <dd style={{ margin: 0 }}>{formatDate(sub.currentPeriodEnd)}</dd>
                {sub.trialEndsAt && (
                  <>
                    <dt className="muted">Trial ends</dt>
                    <dd style={{ margin: 0 }}>{formatDate(sub.trialEndsAt)}</dd>
                  </>
                )}
              </dl>

              {sub.cancelAtPeriodEnd && (
                <div className="tiny" style={{ marginTop: 12, padding: "8px 10px", borderRadius: "var(--r-sm)", background: "var(--warn-soft)", color: "var(--warn)" }}>
                  Your plan is set to cancel on {formatDate(sub.currentPeriodEnd)}.
                </div>
              )}

              <div className="divider" />
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                {sub.provider === "stripe" && (
                  <button className="btn" onClick={openPortal} disabled={busy}>Manage billing</button>
                )}
                {sub.cancelAtPeriodEnd ? (
                  canResume ? (
                    <button className="btn primary" onClick={resumePlan} disabled={busy}>Resume plan</button>
                  ) : (
                    <Link href="/pricing"><button className="btn">Re-subscribe</button></Link>
                  )
                ) : (
                  <button className="btn" onClick={cancelPlan} disabled={busy} style={{ color: "var(--neg)" }}>Cancel plan</button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Usage */}
      {isPaid && usage && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-h">
            <div>
              <div className="t">Daily usage</div>
              <div className="tiny muted">Resets at midnight IST</div>
            </div>
            <div className="tiny muted tabular">{usage.dailyUsed} / {usage.dailyLimit} checks</div>
          </div>
          <div className="bar thick"><span style={{ width: `${usedPct}%`, background: usedPct >= 100 ? "var(--neg)" : "var(--brand)" }} /></div>
          <div className="tiny muted" style={{ marginTop: 8 }}>
            {usage.dailyRemaining} checks remaining today · {usage.workerCount} {usage.workerCount === 1 ? "worker" : "workers"} × {perWorker}/day
          </div>
        </div>
      )}

      {/* Payment history */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="card-h" style={{ padding: "14px 16px", marginBottom: 0, borderBottom: "1px solid var(--border)" }}>
          <div className="t">Payment history</div>
        </div>
        {payments.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center" }} className="tiny muted">No payments yet.</div>
        ) : (
          <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id}>
                  <td>{formatDate(p.date)}</td>
                  <td>{p.label}</td>
                  <td className="tabular">{formatMoney(p.amountCents, p.currency)}</td>
                  <td>
                    <span className={"chip " + (p.status === "failed" ? "neg" : "pos")}>{p.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}

const stepBtn: React.CSSProperties = {
  width: 44,
  height: 44,
  padding: 0,
  justifyContent: "center",
  fontSize: 20,
  fontWeight: 600,
}
