"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth"
import { AnimatedNoise } from "@/components/animated-noise"
import { CheckCircle2 } from "lucide-react"
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

  const stillSyncing = plan !== "paid" && attempts < 15

  return (
    <main className="relative min-h-screen overflow-x-hidden flex items-center justify-center">
      <AnimatedNoise opacity={0.025} />
      <div className="grid-bg fixed inset-0 opacity-15 pointer-events-none" aria-hidden="true" />

      <div className="relative z-10 max-w-md mx-auto px-6 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500 mb-6" />
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">Payment</span>
        <h1 className="mt-2 font-[var(--font-bebas)] text-5xl tracking-tight">THANK YOU</h1>
        <p className="mt-4 font-mono text-sm text-muted-foreground">
          {plan === "paid"
            ? "Your paid plan is active. Daily limit is now 75 rank checks."
            : stillSyncing
              ? "Finalizing your subscription… this usually takes a few seconds."
              : "We received your payment. If your plan hasn't updated within a minute, refresh this page or check your dashboard."}
        </p>
        <a
          href="/dashboard"
          className="mt-8 inline-block bg-accent text-accent-foreground px-6 py-3 font-mono text-xs uppercase tracking-widest hover:bg-accent/80 transition-colors"
        >
          Go to Dashboard
        </a>
      </div>
    </main>
  )
}
