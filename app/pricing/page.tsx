"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth"
import { Check, Sparkles, Zap, Globe2, Infinity as InfinityIcon } from "lucide-react"
import gsap from "gsap"
import { http } from "@/lib/http"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

interface Status {
  configured: boolean
  plan: "free" | "paid" | string
  planExpiresAt: string | null
  subscriptionId: string | null
}

const FREE_FEATURES = [
  "15 rank checks / day",
  "Manual checks only",
  "1 full AI analysis / day",
  "Internal link analysis: your site + 1 competitor",
  "All locations & devices",
]

const PAID_FEATURES = [
  "75 rank checks / day",
  "Automated recurring checks",
  "Unlimited AI analysis (all sections)",
  "Internal link analysis for ALL competitors",
  "Priority support",
]

const STATS = [
  { icon: Globe2, label: "Markets", value: "30+" },
  { icon: Zap, label: "Avg result time", value: "< 4 min" },
  { icon: InfinityIcon, label: "Plan commitment", value: "Cancel anytime" },
]

const FAQ = [
  {
    q: "What is a rank check?",
    a: "One keyword × one location × one device, fetched fresh from Google. Stored historically so you can track movement over time.",
  },
  {
    q: "Do unused checks roll over?",
    a: "No — daily limits reset at midnight IST. The Paid plan gives you 5× the headroom plus automated recurring checks.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Manage or cancel from the Dodo Payments customer portal — your access continues until the end of the paid period.",
  },
]

export default function PricingPage() {
  const { user, token, loading } = useAuth()
  const router = useRouter()
  const [status, setStatus] = useState<Status | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [error, setError] = useState("")

  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!token) return
    http.get(`${API_URL}/api/payments/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => (r.status >= 200 && r.status < 300 ? r.data : null))
      .then(d => d && setStatus(d))
      .catch(() => {})
  }, [token])

  useEffect(() => {
    if (!rootRef.current) return
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".pricing-eyebrow",
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" },
      )
      gsap.fromTo(
        ".pricing-title",
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", delay: 0.1 },
      )
      gsap.fromTo(
        ".pricing-subtitle",
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.6, ease: "power3.out", delay: 0.25 },
      )
      gsap.fromTo(
        ".pricing-card",
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.7, stagger: 0.12, ease: "power3.out", delay: 0.4 },
      )
      gsap.fromTo(
        ".feature-row",
        { opacity: 0, x: -8 },
        { opacity: 1, x: 0, duration: 0.4, stagger: 0.05, ease: "power3.out", delay: 0.7 },
      )
      gsap.fromTo(
        ".stat-tile",
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.08, ease: "power3.out", delay: 0.95 },
      )
      gsap.fromTo(
        ".faq-row",
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.45, stagger: 0.07, ease: "power3.out", delay: 1.1 },
      )
    }, rootRef)
    return () => ctx.revert()
  }, [])

  const handleUpgrade = async () => {
    if (!user || !token) {
      router.push("/login?next=/pricing")
      return
    }
    setError("")
    setCheckoutLoading(true)
    try {
      const res = await http.post(`${API_URL}/api/payments/checkout`, null, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      })
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

  return (
    <main ref={rootRef} className="relative min-h-screen overflow-x-hidden bg-white text-slate-900">
      {/* Soft ambient blue glow */}
      <div
        aria-hidden="true"
        className="auth-blob pointer-events-none absolute -top-40 -right-40 h-128 w-lg rounded-full bg-blue-400/30 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="auth-blob-alt pointer-events-none absolute top-[55%] -left-40 h-112 w-md rounded-full bg-blue-300/30 blur-3xl"
      />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 sm:px-10 lg:px-16 py-6">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-sm shadow-sm transition-transform group-hover:scale-105">
            F
          </span>
          <span className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
            FreeSERP
          </span>
        </Link>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors"
        >
          Dashboard →
        </Link>
      </header>

      {/* Hero */}
      <section className="relative z-10 px-6 sm:px-10 lg:px-16 pt-12 md:pt-20 pb-12 max-w-5xl mx-auto text-center">
        <span className="pricing-eyebrow inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 uppercase tracking-wider">
          <Sparkles className="h-3 w-3 text-blue-500" />
          Pricing
        </span>
        <h1 className="pricing-title mt-5 text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-slate-900 leading-tight">
          Simple plans.<br />
          <span className="text-blue-600">No surprises.</span>
        </h1>
        <p className="pricing-subtitle mt-5 text-base sm:text-lg text-slate-500 max-w-xl mx-auto leading-relaxed">
          Start free. Upgrade when you need more rank checks, automation, and full AI analysis.
        </p>
      </section>

      {/* Pricing cards */}
      <section className="relative z-10 px-6 sm:px-10 lg:px-16 pb-16 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          {/* Free */}
          <article className="pricing-card group relative rounded-3xl border border-slate-200 bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-lg">
            <div className="mb-6">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                Free
              </span>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
                Get started
              </h2>
              <p className="mt-4 flex items-baseline gap-1">
                <span className="text-5xl font-bold tracking-tight text-slate-900">$0</span>
                <span className="text-sm text-slate-500">/month</span>
              </p>
              <p className="mt-2 text-sm text-slate-500">Forever. No card, no trial.</p>
            </div>

            <ul className="space-y-3 mb-8">
              {FREE_FEATURES.map(f => (
                <li key={f} className="feature-row flex items-start gap-3 text-sm text-slate-700">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 mt-0.5">
                    <Check className="h-3 w-3 text-blue-600" strokeWidth={3} />
                  </span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <button
              disabled
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-6 py-3 text-sm font-semibold text-slate-500 cursor-not-allowed"
            >
              Current Plan
            </button>
          </article>

          {/* Paid */}
          <article className="pricing-card group relative overflow-hidden rounded-3xl bg-linear-to-br from-blue-600 via-blue-600 to-blue-700 text-white p-8 shadow-lg shadow-blue-600/20 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-blue-600/30">
            {/* Inner glow blobs */}
            <div className="auth-blob absolute -top-24 -right-24 h-64 w-64 rounded-full bg-blue-400 blur-3xl pointer-events-none" aria-hidden="true" />
            <div className="auth-blob-alt absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-blue-800 blur-3xl pointer-events-none" aria-hidden="true" />
            {/* Subtle grid */}
            <div
              className="absolute inset-0 opacity-10 pointer-events-none"
              aria-hidden="true"
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.2) 1px, transparent 1px)",
                backgroundSize: "48px 48px",
              }}
            />

            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white ring-1 ring-white/30">
                  Paid
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-700 animate-pulse">
                  <Sparkles className="h-3 w-3" />
                  Recommended
                </span>
              </div>

              <h2 className="mt-4 text-3xl font-bold tracking-tight">
                Go pro
              </h2>
              <p className="mt-4 text-sm text-blue-100">
                Billed monthly via{" "}
                <span className="font-semibold text-white">Dodo Payments</span>
              </p>
              <p className="mt-2 text-sm text-blue-100/80">
                Live pricing shown at checkout.
              </p>

              <ul className="mt-6 space-y-3 mb-8">
                {PAID_FEATURES.map(f => (
                  <li key={f} className="feature-row flex items-start gap-3 text-sm text-blue-50">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30 mt-0.5 transition-all group-hover:bg-white group-hover:ring-white">
                      <Check className="h-3 w-3 text-white transition-colors group-hover:text-blue-600" strokeWidth={3} />
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {loading ? (
                <button
                  disabled
                  className="w-full rounded-2xl bg-white/30 px-6 py-3 text-sm font-semibold text-white"
                >
                  Loading…
                </button>
              ) : isPaid ? (
                <button
                  disabled
                  className="w-full rounded-2xl bg-emerald-400 px-6 py-3 text-sm font-semibold text-emerald-950 cursor-not-allowed"
                >
                  ✓ Active Plan
                </button>
              ) : (
                <button
                  onClick={handleUpgrade}
                  disabled={checkoutLoading || (status && !status.configured) || undefined}
                  className="w-full rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-blue-700 shadow-md shadow-blue-900/20 hover:bg-blue-50 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 transition-all duration-200"
                >
                  {checkoutLoading ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <span className="h-4 w-4 rounded-full border-2 border-blue-200 border-t-blue-700 animate-spin" />
                      Redirecting…
                    </span>
                  ) : status?.configured === false ? (
                    "Payments not configured"
                  ) : user ? (
                    "Upgrade to Paid →"
                  ) : (
                    "Sign in to upgrade"
                  )}
                </button>
              )}

              {error && (
                <div className="mt-3 rounded-xl bg-red-500/15 border border-red-300/40 px-3 py-2 text-xs text-red-50 animate-in fade-in slide-in-from-top-2">
                  {error}
                </div>
              )}
            </div>
          </article>
        </div>

        <p className="mt-10 text-center text-sm text-slate-500">
          Daily limits reset at midnight IST. Cancel anytime from your Dodo customer portal.
        </p>
      </section>

      {/* Stats band */}
      <section className="relative z-10 px-6 sm:px-10 lg:px-16 pb-16 max-w-5xl mx-auto">
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {STATS.map(s => {
              const Icon = s.icon
              return (
                <div
                  key={s.label}
                  className="stat-tile flex items-center gap-4 rounded-2xl bg-slate-50/60 p-5 transition-colors hover:bg-blue-50/60"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600/10 ring-1 ring-blue-600/20">
                    <Icon className="h-5 w-5 text-blue-600" />
                  </span>
                  <div>
                    <p className="text-xl font-bold tracking-tight text-slate-900 leading-none">
                      {s.value}
                    </p>
                    <p className="mt-1 text-xs font-medium uppercase tracking-wider text-slate-500">
                      {s.label}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="relative z-10 px-6 sm:px-10 lg:px-16 pb-24 max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 uppercase tracking-wider">
            FAQ
          </span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            Questions, answered
          </h2>
        </div>
        <div className="space-y-3">
          {FAQ.map(item => (
            <details
              key={item.q}
              className="faq-row group rounded-2xl border border-slate-200 bg-white shadow-sm open:shadow-md transition-shadow"
            >
              <summary className="cursor-pointer list-none flex items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-slate-900 hover:text-blue-600 transition-colors">
                <span>{item.q}</span>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 text-lg leading-none transition-transform duration-300 group-open:rotate-45">
                  +
                </span>
              </summary>
              <div className="px-5 pb-5 text-sm leading-relaxed text-slate-600">
                {item.a}
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-200 bg-white/60 backdrop-blur-sm">
        <div className="px-6 sm:px-10 lg:px-16 py-6 max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-slate-500">© FreeSERP — Pricing</p>
          <Link
            href="/dashboard"
            className="text-xs font-medium text-slate-500 hover:text-blue-600 transition-colors"
          >
            Back to dashboard →
          </Link>
        </div>
      </footer>
    </main>
  )
}
