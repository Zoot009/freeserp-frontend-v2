"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import { useAuth } from "@/lib/auth"
import { CheckCircle2, Loader2 } from "lucide-react"
import axios from "@/lib/axios"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

export default function BillingSuccessPage() {
  const t = useTranslations("billingResult")
  const { token } = useAuth()
  const [plan, setPlan] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)

  // Self-heal: the plan flip normally happens asynchronously (webhook → billing
  // worker). If that's delayed or down the account stays "free" and the poll below
  // spins forever. Using the checkout session_id we already carry in the URL, ask
  // the backend to apply the subscription synchronously — the same applySubscription
  // the webhook uses. Best-effort, runs once; the poll remains the backstop.
  useEffect(() => {
    if (!token) return
    const sessionId = new URLSearchParams(window.location.search).get("session_id")
    if (!sessionId) return
    let active = true
    axios
      .post(
        `${API_URL}/api/payments/reconcile`,
        { sessionId },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      .then(res => {
        if (active && res.data?.plan) setPlan(res.data.plan)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [token])

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
      className="fs-app pricing-glow"
      style={{ minHeight: "100vh", background: "var(--bg-sub)", display: "grid", placeItems: "center", padding: 24 }}
    >
      <div
        className="card pop-in"
        style={{ width: "100%", maxWidth: 440, padding: 36, textAlign: "center", boxShadow: "var(--shadow-lg)" }}
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
          <span className="spark">◆</span> {t("eyebrow")}
        </span>

        <h1 style={{ margin: "10px 0 0", fontSize: 30, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
          {isPaid ? t("successAllSetTitle") : stillSyncing ? t("successFinalizingTitle") : t("successThankYouTitle")}
        </h1>

        <p className="muted" style={{ marginTop: 12, fontSize: 14, lineHeight: 1.5, maxWidth: 360, marginInline: "auto" }}>
          {isPaid
            ? t("successAllSetBody")
            : stillSyncing
              ? t("successFinalizingBody")
              : t("successThankYouBody")}
        </p>

        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 28, flexWrap: "wrap" }}>
          <Link href="/dashboard" className="btn primary">
            {t("goToDashboard")}
          </Link>
          <Link href="/dashboard/billing" className="btn">
            {t("viewBilling")}
          </Link>
        </div>
      </div>
    </main>
  )
}
