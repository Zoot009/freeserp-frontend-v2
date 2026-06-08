"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/lib/auth"
import { CheckCircle2, Loader2 } from "lucide-react"
import axios from "@/lib/axios"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

export default function BillingSuccessPage() {
  const { token } = useAuth()
  const [plan, setPlan] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)

  // Poll briefly — the payment provider's webhook (Stripe or Razorpay) may
  // arrive a moment after the redirect back from the hosted checkout page.
  useEffect(() => {
    if (!token) return
    const id = setInterval(async () => {
      try {
        const res = await axios.get(`${API_URL}/api/payments/status`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.status >= 200 && res.status < 300) {
          const data = res.data
          setPlan(data.plan)
          if (data.plan === "paid") clearInterval(id)
        }
      } catch {}
      setAttempts(a => a + 1)
    }, 2000)
    return () => clearInterval(id)
  }, [token])

  const isPaid = plan === "paid"
  const stillSyncing = !isPaid && attempts < 15

  return (
    <main
      className="fs-app"
      style={{ minHeight: "100vh", background: "var(--bg-sub)", display: "grid", placeItems: "center", padding: 24 }}
    >
      <div
        className="card"
        style={{ width: "100%", maxWidth: 440, padding: 36, textAlign: "center" }}
      >
        {/* Icon badge — positive once active, neutral-pending while syncing */}
        <span
          style={{
            display: "grid",
            placeItems: "center",
            width: 56,
            height: 56,
            margin: "0 auto 20px",
            borderRadius: 999,
            background: stillSyncing ? "var(--brand-soft)" : "var(--pos-soft)",
            color: stillSyncing ? "var(--brand)" : "var(--pos)",
          }}
        >
          {stillSyncing ? (
            <Loader2 size={28} strokeWidth={1.75} className="animate-spin" />
          ) : (
            <CheckCircle2 size={28} strokeWidth={1.75} />
          )}
        </span>

        <span className="eyebrow" style={{ justifyContent: "center" }}>
          <span className="spark">◆</span> Payment
        </span>

        <h1 style={{ margin: "10px 0 0", fontSize: 30, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
          {isPaid ? "You're all set" : stillSyncing ? "Finalizing…" : "Thank you"}
        </h1>

        <p className="muted" style={{ marginTop: 12, fontSize: 14, lineHeight: 1.5, maxWidth: 360, marginInline: "auto" }}>
          {isPaid
            ? "Your paid plan is active — your daily rank-check limit has increased."
            : stillSyncing
              ? "Finalizing your subscription… this usually takes a few seconds."
              : "We received your payment. If your plan hasn't updated within a minute, refresh this page or check your dashboard."}
        </p>

        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 28, flexWrap: "wrap" }}>
          <Link href="/dashboard" className="btn primary">
            Go to dashboard
          </Link>
          <Link href="/dashboard/billing" className="btn">
            View billing
          </Link>
        </div>
      </div>
    </main>
  )
}
