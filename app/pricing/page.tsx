"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth"
import { LocationPicker } from "@/components/location-picker"
import axios from "@/lib/axios"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

interface Status {
  configured: boolean
  plan: "free" | "paid" | string
  planExpiresAt: string | null
  subscriptionId: string | null
  workerCount?: number
}

// Serprobot-style worker pricing: 1 worker = 75 searches/day for $5/month. Capacity and
// price scale linearly with the number of workers.
const SEARCHES_PER_WORKER = 75
const PRICE_PER_WORKER_USD = 5
const MAX_WORKERS = 50

const FREE_FEATURES = [
  "15 rank checks / day",
  "Manual checks only",
  "1 full AI analysis / day",
  "Internal link analysis: your site + 1 competitor",
  "All locations & devices",
]

const PAID_FEATURES = [
  "Automated recurring checks",
  "Unlimited AI analysis (all sections)",
  "Internal link analysis for ALL competitors",
  "Priority support",
]

const STATS = [
  { label: "Markets", value: "30+" },
  { label: "Avg result time", value: "< 4 min" },
  { label: "Commitment", value: "Cancel anytime" },
]

const FAQ = [
  {
    q: "What is a rank check?",
    a: "One keyword × one location × one device, fetched fresh from Google. Stored historically so you can track movement over time.",
  },
  {
    q: "Do unused checks roll over?",
    a: "No — daily limits reset at midnight IST. Each worker adds 75 rank checks/day; add more workers any time to scale your daily capacity.",
  },
  {
    q: "What is a worker?",
    a: "A worker is a unit of daily search capacity: 1 worker = 75 rank checks/day for $5/month. Need more? Add workers — 3 workers = 225 checks/day for $15/month. You can change your worker count anytime and we prorate the difference.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Manage or cancel from your payment provider's customer portal (Razorpay in India, Stripe elsewhere) — your access continues until the end of the paid period.",
  },
]

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

export default function PricingPage() {
  const { user, token, loading } = useAuth()
  const router = useRouter()
  const [status, setStatus] = useState<Status | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [error, setError] = useState("")
  // Billing country: India is charged in INR via Razorpay; everyone else in USD via Stripe.
  const [country, setCountry] = useState("in")
  const isIndia = country.toLowerCase() === "in"
  // Number of workers to purchase (1 worker = 75 searches/day = $5/mo).
  const [workers, setWorkers] = useState(1)
  const searchesPerDay = workers * SEARCHES_PER_WORKER
  const monthlyUsd = workers * PRICE_PER_WORKER_USD

  useEffect(() => {
    if (!token) return
    axios
      .get(`${API_URL}/api/payments/status`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.status >= 200 && r.status < 300 ? r.data : null))
      .then(d => d && setStatus(d))
      .catch(() => {})
  }, [token])

  const handleUpgrade = async () => {
    if (!user || !token) {
      router.push("/login?next=/pricing")
      return
    }
    setError("")
    setCheckoutLoading(true)
    try {
      const res = await axios.post(
        `${API_URL}/api/payments/checkout`,
        { country: country.toUpperCase(), workerCount: workers },
        { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } },
      )
      const data = res.data
      if (res.status < 200 || res.status >= 300) throw new Error(data?.error || "Failed to start checkout")
      if (!data?.url) throw new Error("Checkout URL missing")
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed")
    } finally {
      setCheckoutLoading(false)
    }
  }

  const isPaid =
    status?.plan === "paid" &&
    (!status.planExpiresAt || new Date(status.planExpiresAt).getTime() > Date.now())

  const stepBtnStyle: React.CSSProperties = {
    width: 44,
    height: 44,
    padding: 0,
    justifyContent: "center",
    fontSize: 20,
    fontWeight: 600,
  }

  return (
    <main className="fs-app" style={{ minHeight: "100vh", background: "var(--bg-sub)" }}>
      {/* Header */}
      <header
        className="row"
        style={{
          justifyContent: "space-between",
          padding: "14px 24px",
          background: "var(--bg-elev)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <Link href="/dashboard" className="row" style={{ gap: 8, textDecoration: "none", color: "var(--text)" }}>
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "var(--brand)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            F
          </span>
          <span style={{ fontWeight: 600 }}>FreeSERP</span>
        </Link>
        <Link href="/dashboard" className="btn sm">
          Dashboard →
        </Link>
      </header>

      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "40px 24px 72px" }}>
        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <span className="eyebrow" style={{ justifyContent: "center" }}>
            <span className="spark">◆</span> Pricing
          </span>
          <h1 style={{ margin: 0, fontSize: 38, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
            Simple plans. <span style={{ color: "var(--brand)" }}>No surprises.</span>
          </h1>
          <p className="muted" style={{ marginTop: 12, fontSize: 14, maxWidth: 520, marginInline: "auto" }}>
            Start free. Add workers when you need more rank checks, automation, and full AI analysis.
          </p>
        </div>

        {/* Pricing cards */}
        <div className="grid g-2" style={{ alignItems: "stretch" }}>
          {/* Free */}
          <div className="card" style={{ padding: 28, display: "flex", flexDirection: "column" }}>
            <span >Free</span>
            <div style={{ marginTop: 18, display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1 }}>$0</span>
              <span className="muted" style={{ fontSize: 13 }}>/month</span>
            </div>
            <p className="tiny muted" style={{ marginTop: 6 }}>Forever. No card, no trial.</p>

            <div style={{ height: 1, background: "var(--border)", margin: "22px 0" }} />

            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {FREE_FEATURES.map(f => (
                <li key={f} className="row" style={{ alignItems: "flex-start", gap: 10, fontSize: 13 }}>
                  <Check />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <button
              className="btn"
              disabled
              style={{ width: "100%", justifyContent: "center", marginTop: "auto", opacity: 0.7, cursor: "not-allowed" }}
            >
              {isPaid ? "Free Plan" : "Current Plan"}
            </button>
          </div>

          {/* Workers */}
          <div className="card" style={{ padding: 28, borderColor: "var(--brand)", boxShadow: "var(--shadow-md)" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="chip brand">Workers</span>
              <span className="chip brand" style={{ fontWeight: 600 }}>Recommended</span>
            </div>

            {/* Price scales with worker count: $5/worker, 75 searches/day per worker. */}
            <div style={{ marginTop: 18, display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1 }}>${monthlyUsd}</span>
              <span className="muted" style={{ fontSize: 13 }}>/month</span>
            </div>
            <p className="tiny muted" style={{ marginTop: 6 }}>
              <span style={{ color: "var(--text)", fontWeight: 600 }}>{searchesPerDay.toLocaleString()}</span> rank
              checks / day · {workers} {workers === 1 ? "worker" : "workers"}
            </p>

            {/* Worker quantity stepper */}
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
                  Workers
                </span>
                <span className="tiny muted">
                  {SEARCHES_PER_WORKER}/day · ${PRICE_PER_WORKER_USD}/mo each
                </span>
              </div>
              <div className="row" style={{ gap: 10 }}>
                <button
                  type="button"
                  aria-label="Remove a worker"
                  className="btn"
                  onClick={() => setWorkers(w => Math.max(1, w - 1))}
                  disabled={workers <= 1}
                  style={stepBtnStyle}
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  max={MAX_WORKERS}
                  value={workers}
                  onChange={e => {
                    const n = parseInt(e.target.value, 10)
                    setWorkers(Number.isNaN(n) ? 1 : Math.min(MAX_WORKERS, Math.max(1, n)))
                  }}
                  className="input"
                  style={{ textAlign: "center", fontSize: 18, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
                />
                <button
                  type="button"
                  aria-label="Add a worker"
                  className="btn"
                  onClick={() => setWorkers(w => Math.min(MAX_WORKERS, w + 1))}
                  disabled={workers >= MAX_WORKERS}
                  style={stepBtnStyle}
                >
                  +
                </button>
              </div>
              <p className="tiny muted" style={{ marginTop: 10 }}>
                Billed monthly via <span style={{ color: "var(--text)", fontWeight: 600 }}>{isIndia ? "Razorpay" : "Stripe"}</span>
                {isIndia ? " — charged in ₹ INR at checkout." : "."}
              </p>
            </div>

            <ul style={{ listStyle: "none", margin: "20px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {PAID_FEATURES.map(f => (
                <li key={f} className="row" style={{ alignItems: "flex-start", gap: 10, fontSize: 13 }}>
                  <Check />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            {!isPaid && (
              <div className="field" style={{ marginTop: 18 }}>
                <label>Billing country</label>
                <LocationPicker value={country} onChange={setCountry} showFlags variant="default" />
              </div>
            )}

            {loading ? (
              <button className="btn primary" disabled style={{ width: "100%", justifyContent: "center", marginTop: 18, opacity: 0.7 }}>
                Loading…
              </button>
            ) : isPaid ? (
              <button
                className="btn"
                disabled
                style={{
                  width: "100%",
                  justifyContent: "center",
                  marginTop: 18,
                  background: "var(--pos-soft)",
                  color: "var(--pos)",
                  borderColor: "transparent",
                  cursor: "not-allowed",
                }}
              >
                ✓ Active Plan
              </button>
            ) : (
              <button
                className="btn primary"
                onClick={handleUpgrade}
                disabled={checkoutLoading || (status && !status.configured) || undefined}
                style={{ width: "100%", justifyContent: "center", marginTop: 18 }}
              >
                {checkoutLoading ? (
                  <>
                    <span
                      className="spin"
                      style={{
                        display: "inline-block",
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        border: "2px solid rgba(255,255,255,0.5)",
                        borderTopColor: "#fff",
                      }}
                    />
                    Redirecting…
                  </>
                ) : status?.configured === false ? (
                  "Payments not configured"
                ) : user ? (
                  `Get ${workers} ${workers === 1 ? "worker" : "workers"} — $${monthlyUsd}/mo →`
                ) : (
                  "Sign in to upgrade"
                )}
              </button>
            )}

            {error && (
              <div
                className="tiny"
                style={{
                  marginTop: 12,
                  padding: "10px 12px",
                  borderRadius: "var(--r-md)",
                  background: "var(--neg-soft)",
                  color: "var(--neg)",
                  textAlign: "center",
                }}
              >
                {error}
              </div>
            )}
          </div>
        </div>

        <p className="tiny muted" style={{ marginTop: 24, textAlign: "center" }}>
          Daily limits reset at midnight IST. Cancel anytime from your payment provider&apos;s customer portal.
        </p>

        {/* Stats */}
        <div className="grid g-3" style={{ marginTop: 40 }}>
          {STATS.map(s => (
            <div key={s.label} className="stat">
              <div className="val">{s.value}</div>
              <div className="lbl">{s.label}</div>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div style={{ marginTop: 48, maxWidth: 720, marginInline: "auto" }}>
          <div style={{ textAlign: "center", marginBottom: 22 }}>
            <span className="eyebrow" style={{ justifyContent: "center" }}>
              <span className="spark">◆</span> FAQ
            </span>
            <h2 style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: "-0.025em" }}>Questions, answered</h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {FAQ.map(item => (
              <details key={item.q} className="card" style={{ padding: 0 }}>
                <summary
                  className="row between"
                  style={{
                    cursor: "pointer",
                    listStyle: "none",
                    padding: "14px 16px",
                    fontSize: 13.5,
                    fontWeight: 600,
                    gap: 12,
                  }}
                >
                  <span>{item.q}</span>
                  <span style={{ color: "var(--brand)", fontSize: 18, lineHeight: 1 }}>+</span>
                </summary>
                <div className="muted" style={{ padding: "0 16px 16px", fontSize: 13, lineHeight: 1.55 }}>
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid var(--border)", background: "var(--bg-elev)" }}>
        <div
          className="row between"
          style={{ maxWidth: 1040, margin: "0 auto", padding: "18px 24px", flexWrap: "wrap", gap: 8 }}
        >
          <span className="tiny muted">© FreeSERP — Pricing</span>
          <Link href="/dashboard" className="tiny muted" style={{ textDecoration: "none" }}>
            Back to dashboard →
          </Link>
        </div>
      </footer>
    </main>
  )
}
