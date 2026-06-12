"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Link, useRouter } from "@/i18n/navigation"
import { LanguageSwitcher } from "@/components/language-switcher"
import { useAuth } from "@/lib/auth"
import axios from "@/lib/axios"
import { TIERS, SEARCHES_PER_WORKER, PRICE_PER_WORKER_USD } from "@/lib/pricing"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

interface Status {
  configured: boolean
  plan: "free" | "paid" | string
  planExpiresAt: string | null
  subscriptionId: string | null
  workerCount?: number
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

export default function PricingPage() {
  const t = useTranslations("pricing")
  const freeFeatures = t.raw("freeFeatures") as string[]
  const paidFeatures = t.raw("paidFeatures") as string[]
  const stats = [
    { label: t("statMarketsLabel"), value: t("statMarketsValue") },
    { label: t("statResultTimeLabel"), value: t("statResultTimeValue") },
    { label: t("statCommitmentLabel"), value: t("statCommitmentValue") },
  ]
  const faq = t.raw("faq") as { q: string; a: string }[]
  const { user, token, loading } = useAuth()
  const router = useRouter()
  const [status, setStatus] = useState<Status | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [error, setError] = useState("")
  // Number of workers to purchase (1 worker = 15 searches/day = $1/mo).
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
        { workerCount: workers },
        { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } },
      )
      const data = res.data
      if (res.status < 200 || res.status >= 300) throw new Error(data?.error || t("errorFailedStartCheckout"))
      if (!data?.url) throw new Error(t("errorCheckoutUrlMissing"))
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorCheckoutFailed"))
    } finally {
      setCheckoutLoading(false)
    }
  }

  const isPaid =
    status?.plan === "paid" &&
    (!status.planExpiresAt || new Date(status.planExpiresAt).getTime() > Date.now())

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
        <div className="row" style={{ gap: 12 }}>
          <LanguageSwitcher />
          <Link href="/dashboard" className="btn sm">
            {t("dashboardArrow")}
          </Link>
        </div>
      </header>

      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "40px 24px 72px" }}>
        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <span className="eyebrow" style={{ justifyContent: "center" }}>
            <span className="spark">◆</span> {t("eyebrow")}
          </span>
          <h1 style={{ margin: 0, fontSize: "clamp(28px, 7vw, 38px)", fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
            {t.rich("title", { hl: (chunks) => <span style={{ color: "var(--brand)" }}>{chunks}</span> })}
          </h1>
          <p className="muted" style={{ marginTop: 12, fontSize: 14, maxWidth: 520, marginInline: "auto" }}>
            {t("subtitle")}
          </p>
        </div>

        {/* Pricing cards */}
        <div className="grid g-2" style={{ alignItems: "stretch" }}>
          {/* Free */}
          <div className="card" style={{ padding: 28, display: "flex", flexDirection: "column" }}>
            <span >{t("freeTitle")}</span>
            <div style={{ marginTop: 18, display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: "clamp(34px, 9vw, 44px)", fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1 }}>$0</span>
              <span className="muted" style={{ fontSize: 13 }}>{t("perMonth")}</span>
            </div>
            <p className="tiny muted" style={{ marginTop: 6 }}>{t("freeForever")}</p>

            <div style={{ height: 1, background: "var(--border)", margin: "22px 0" }} />

            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {freeFeatures.map(f => (
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
              {isPaid ? t("freePlan") : t("currentPlan")}
            </button>
          </div>

          {/* Workers */}
          <div className="card" style={{ padding: 28, borderColor: "var(--brand)", boxShadow: "var(--shadow-md)" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="chip brand">{t("workers")}</span>
              <span className="chip brand" style={{ fontWeight: 600 }}>{t("recommended")}</span>
            </div>

            {/* Price scales with worker count: $1/worker, 15 searches/day per worker. */}
            <div style={{ marginTop: 18, display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: "clamp(34px, 9vw, 44px)", fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1 }}>${monthlyUsd}</span>
              <span className="muted" style={{ fontSize: 13 }}>{t("perMonth")}</span>
            </div>
            <p className="tiny muted" style={{ marginTop: 6 }}>
              {t.rich("rankChecksPerDay", {
                searches: searchesPerDay,
                workers,
                b: (chunks) => <span style={{ color: "var(--text)", fontWeight: 600 }}>{chunks}</span>,
              })}
            </p>

            {/* Fixed pricing tiers — pick an amount (no custom values) */}
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
                  {t("choosePlan")}
                </span>
                <span className="tiny muted">
                  {t("perWorkerEach", { searches: SEARCHES_PER_WORKER, price: PRICE_PER_WORKER_USD })}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {TIERS.map(tier => {
                  const active = tier.workers === workers
                  return (
                    <button
                      key={tier.usd}
                      type="button"
                      aria-pressed={active}
                      className="btn"
                      onClick={() => setWorkers(tier.workers)}
                      style={{
                        flexDirection: "column",
                        gap: 2,
                        padding: "10px 4px",
                        height: "auto",
                        borderColor: active ? "var(--brand)" : "var(--border)",
                        background: active ? "var(--brand-soft)" : "var(--bg-elev)",
                        color: active ? "var(--brand)" : "var(--text)",
                        boxShadow: active ? "inset 0 0 0 1px var(--brand)" : "none",
                      }}
                    >
                      <span style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>${tier.usd}</span>
                      <span className="tiny muted" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {t("tierChecks", { checks: tier.checks })}
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="tiny muted" style={{ marginTop: 10 }}>
                {t.rich("billedMonthly", { b: (chunks) => <span style={{ color: "var(--text)", fontWeight: 600 }}>{chunks}</span> })}
              </p>
            </div>

            <ul style={{ listStyle: "none", margin: "20px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {paidFeatures.map(f => (
                <li key={f} className="row" style={{ alignItems: "flex-start", gap: 10, fontSize: 13 }}>
                  <Check />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            {loading ? (
              <button className="btn primary" disabled style={{ width: "100%", justifyContent: "center", marginTop: 18, opacity: 0.7 }}>
                {t("loading")}
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
                {t("activePlan")}
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
                    {t("redirecting")}
                  </>
                ) : status?.configured === false ? (
                  t("paymentsNotConfigured")
                ) : user ? (
                  t("getWorkers", { workers, price: monthlyUsd })
                ) : (
                  t("signInToUpgrade")
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
          {t("limitsReset")}
        </p>

        {/* Stats */}
        <div className="grid g-3" style={{ marginTop: 40 }}>
          {stats.map(s => (
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
              <span className="spark">◆</span> {t("faqEyebrow")}
            </span>
            <h2 style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: "-0.025em" }}>{t("faqTitle")}</h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {faq.map(item => (
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
          <span className="tiny muted">{t("footerCopyright")}</span>
          <Link href="/dashboard" className="tiny muted" style={{ textDecoration: "none" }}>
            {t("backToDashboard")}
          </Link>
        </div>
      </footer>
    </main>
  )
}
