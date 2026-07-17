"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Link, useRouter } from "@/i18n/navigation"
import { LanguageSwitcher } from "@/components/language-switcher"
import { Icon } from "@/components/dashboard/icons"
import { useAuth } from "@/lib/auth"
import axios from "@/lib/axios"
import { trackEvent } from "@/lib/track"
import { track } from "@/lib/analytics"
import { type BillingInterval, type TierInfo } from "@/lib/pricing"
import { fetchBillingConfig, FALLBACK_BILLING_CONFIG, type BillingConfig } from "@/lib/billing-config"

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
  const compareRows = t.raw("compareRows") as { feature: string; free: string; paid: string }[]
  const stats = [
    { label: t("statMarketsLabel"), value: t("statMarketsValue"), icon: <Icon.globe /> },
    { label: t("statResultTimeLabel"), value: t("statResultTimeValue"), icon: <Icon.zap /> },
    { label: t("statCommitmentLabel"), value: t("statCommitmentValue"), icon: <Icon.refresh /> },
  ]
  const faq = t.raw("faq") as { q: string; a: string }[]
  const { user, token, loading } = useAuth()
  const router = useRouter()
  const [status, setStatus] = useState<Status | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  // Live pricing config from GET /api/billing/config (single source of truth);
  // the imported constants only serve as the offline fallback inside it.
  const [cfg, setCfg] = useState<BillingConfig>(FALLBACK_BILLING_CONFIG)
  useEffect(() => {
    void fetchBillingConfig().then(setCfg)
  }, [])
  // Monthly vs annual billing for NEW subscriptions. Existing paid users manage
  // quantity only — interval switching mid-subscription is not offered here.
  const [interval, setBillingInterval] = useState<BillingInterval>("month")
  const perWorkerUsd = (cfg.pricePerWorkerCents[interval] ?? 100) / 100
  const tiers = useMemo<TierInfo[]>(
    () => cfg.tiers.map((w) => ({ usd: w, workers: w, checks: w * cfg.perWorkerDailyChecks })),
    [cfg],
  )
  // Fixed pricing tiers stepped through with −/+ (no custom amounts). The selected
  // tier drives the worker quantity, price, and daily checks shown on the card.
  const [tierIndex, setTierIndex] = useState(0)
  // Paid users' current worker count — the stepper starts here and the Save button
  // is only enabled once they pick a different tier.
  const [currentWorkers, setCurrentWorkers] = useState<number | null>(null)
  const tier = tiers[Math.min(tierIndex, tiers.length - 1)]
  const workers = tier.workers
  const searchesPerDay = tier.checks
  const priceUsd = workers * perWorkerUsd
  const atMin = tierIndex <= 0
  const atMax = tierIndex >= tiers.length - 1
  const perLabel = interval === "year" ? t("perYear") : t("perMonth")

  // Load plan status; for paid users also resolve the current worker count so the
  // stepper opens on their tier and the Save button can detect changes.
  const loadStatus = useCallback(async () => {
    if (!token) return
    const headers = { Authorization: `Bearer ${token}` }
    try {
      const r = await axios.get(`${API_URL}/api/payments/status`, { headers })
      if (r.status < 200 || r.status >= 300) return
      const d = r.data as Status
      setStatus(d)
      if (d?.plan === "paid") {
        let wc = typeof d.workerCount === "number" ? d.workerCount : null
        if (wc == null) {
          try {
            const u = await axios.get(`${API_URL}/api/usage`, { headers })
            if (typeof u.data?.workerCount === "number") wc = u.data.workerCount
          } catch {
            /* usage is best-effort; fall back to leaving the stepper at tier 0 */
          }
        }
        if (wc != null) {
          setCurrentWorkers(wc)
          // Snap the stepper to the tier nearest the current count (paid users may
          // sit off-tier via proration or a grandfathered 1-worker subscription).
          const count = Math.max(1, wc)
          let best = 0
          for (let i = 1; i < tiers.length; i++) {
            if (Math.abs(tiers[i].workers - count) < Math.abs(tiers[best].workers - count)) best = i
          }
          setTierIndex(best)
        }
      }
    } catch {
      /* status is best-effort — the page still renders with defaults */
    }
  }, [token, tiers])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const handleUpgrade = async () => {
    // Buy intent — fire the GTM conversion before any redirect to checkout/login.
    trackEvent("clicked-buy-button")
    track("checkout_started")
    if (!user || !token) {
      router.push("/login?next=/pricing")
      return
    }
    setError("")
    setCheckoutLoading(true)
    try {
      const res = await axios.post(
        `${API_URL}/api/payments/checkout`,
        { workerCount: workers, interval },
        { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } },
      )
      const data = res.data as { url?: string; error?: { code?: string; message?: string } }
      if (res.status < 200 || res.status >= 300) {
        // Annual is Stripe-only; PayU-billed regions get bounced back to monthly.
        if (data?.error?.code === "annual_unavailable") {
          setBillingInterval("month")
          toast.error(t("annualUnavailable"))
          return
        }
        throw new Error(data?.error?.message || t("errorFailedStartCheckout"))
      }
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

  // Paid users adjust their worker count right here — prorated, mirroring the
  // billing dashboard's PATCH. Only enabled once the picked tier differs.
  const dirty = Boolean(isPaid && currentWorkers != null && workers !== currentWorkers)

  const handleSaveWorkers = async () => {
    if (!dirty || !token) return
    setSaving(true)
    try {
      await axios.patch(
        `${API_URL}/api/billing/workers`,
        { workerCount: workers },
        { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } },
      )
      toast.success(t("savedToast", { workers, checks: searchesPerDay }))
      window.dispatchEvent(new Event("usage:refresh"))
      setCurrentWorkers(workers)
      void loadStatus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errorSaveFailed"))
    } finally {
      setSaving(false)
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

  // Renders a comparison cell: check / dash get iconography, everything else is text.
  const cmpCell = (v: string) => {
    if (v === "✓") return <span className="cmp-yes" aria-label="Included"><Icon.check size={16} /></span>
    if (v === "—") return <span className="cmp-no" aria-hidden>—</span>
    return <span>{v}</span>
  }

  return (
    <main className="fs-app" style={{ minHeight: "100vh", background: "var(--bg-sub)" }}>
      {/* Header */}
      <header className="pricing-header row" style={{ justifyContent: "space-between", padding: "14px 24px" }}>
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

      {/* Hero */}
      <div className="pricing-glow">
        <div style={{ maxWidth: 1040, margin: "0 auto", padding: "56px 24px 0", textAlign: "center" }}>
          <span className="eyebrow" style={{ justifyContent: "center" }}>
            <span className="spark">◆</span> {t("eyebrow")}
          </span>
          <h1 style={{ margin: "6px 0 0", fontSize: "clamp(30px, 7vw, 42px)", fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.08 }}>
            {t.rich("title", { hl: (chunks) => <span style={{ color: "var(--brand)" }}>{chunks}</span> })}
          </h1>
          <p className="muted" style={{ marginTop: 12, fontSize: 15, maxWidth: 540, marginInline: "auto" }}>
            {t("subtitle")}
          </p>
          {/* Trust pills — grounded in the real stat values below */}
          <div className="row" style={{ justifyContent: "center", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
            {stats.map((s) => (
              <span key={s.label} className="trust-pill">
                <span className="spark" style={{ display: "inline-flex" }}>{s.icon}</span>
                <b style={{ fontWeight: 600, color: "var(--text)" }}>{s.value}</b> {s.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "36px 24px 72px" }}>
        {/* Pricing cards */}
        <div className="grid g-2" style={{ alignItems: "stretch" }}>
          {/* Free */}
          <div className="card price-card" style={{ padding: 28, display: "flex", flexDirection: "column" }}>
            <span className="chip outline" style={{ alignSelf: "flex-start" }}>{t("freeTitle")}</span>
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
              style={{ width: "100%", justifyContent: "center", marginTop: "auto", paddingTop: 10, paddingBottom: 10, opacity: 0.7, cursor: "not-allowed" }}
            >
              {isPaid ? t("freePlan") : t("currentPlan")}
            </button>
          </div>

          {/* Workers */}
          <div className="card price-card featured" style={{ padding: 28 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="chip brand">{t("workers")}</span>
              <span className="price-ribbon"><Icon.star size={11} /> {t("recommended")}</span>
            </div>

            {/* Monthly / annual toggle — new subscriptions only. Existing paid users
                manage quantity here; interval switching isn't offered in-place. */}
            {!isPaid && (
              <div className="row" style={{ gap: 6, marginTop: 16 }}>
                <button
                  type="button"
                  className="btn sm"
                  aria-pressed={interval === "month"}
                  onClick={() => setBillingInterval("month")}
                  style={interval === "month" ? { borderColor: "var(--brand)", background: "var(--brand-soft)", color: "var(--brand)" } : undefined}
                >
                  {t("intervalMonthly")}
                </button>
                <button
                  type="button"
                  className="btn sm"
                  aria-pressed={interval === "year"}
                  onClick={() => setBillingInterval("year")}
                  style={interval === "year" ? { borderColor: "var(--brand)", background: "var(--brand-soft)", color: "var(--brand)" } : undefined}
                >
                  {t("intervalAnnual")}
                  <span className="tiny" style={{ marginLeft: 6, color: "var(--pos)", fontWeight: 600 }}>{t("annualSavings")}</span>
                </button>
              </div>
            )}

            {/* Price scales with worker count: $1/worker/mo or $10/worker/yr. */}
            <div style={{ marginTop: 18, display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: "clamp(34px, 9vw, 44px)", fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1 }}>${priceUsd}</span>
              <span className="muted" style={{ fontSize: 13 }}>{perLabel}</span>
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
                  {isPaid ? t("manageTitle") : t("choosePlan")}
                </span>
                <span className="tiny muted">
                  {interval === "year"
                    ? t("perWorkerEachYear", { searches: cfg.perWorkerDailyChecks, price: perWorkerUsd })
                    : t("perWorkerEach", { searches: cfg.perWorkerDailyChecks, price: perWorkerUsd })}
                </span>
              </div>
              {/* Incremental stepper — −/+ move between the fixed tiers */}
              <div className="row" style={{ gap: 12, alignItems: "stretch" }}>
                <button
                  type="button"
                  aria-label={t("fewerChecks")}
                  className="btn"
                  onClick={() => setTierIndex(i => Math.max(0, i - 1))}
                  disabled={atMin}
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
                    {t("tierChecks", { checks: searchesPerDay })}
                  </span>
                  <span className="tiny muted" style={{ fontVariantNumeric: "tabular-nums" }}>
                    ${priceUsd}{perLabel}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label={t("moreChecks")}
                  className="btn"
                  onClick={() => setTierIndex(i => Math.min(tiers.length - 1, i + 1))}
                  disabled={atMax}
                  style={stepBtnStyle}
                >
                  +
                </button>
              </div>

              {/* Tier scale — click a segment to jump straight to that tier */}
              <div className="row" style={{ gap: 4, marginTop: 12 }}>
                {tiers.map((tt, i) => (
                  <button
                    key={tt.usd}
                    type="button"
                    aria-label={`$${tt.workers * perWorkerUsd}`}
                    aria-pressed={i === tierIndex}
                    onClick={() => setTierIndex(i)}
                    className={`tier-seg${i <= tierIndex ? " on" : ""}`}
                  />
                ))}
              </div>
              <div className="row between" style={{ marginTop: 6 }}>
                <span className="tiny muted">${tiers[0].workers * perWorkerUsd}</span>
                <span className="tiny muted">${tiers[tiers.length - 1].workers * perWorkerUsd}</span>
              </div>
              <p className="tiny muted" style={{ marginTop: 10 }}>
                {interval === "year"
                  ? t.rich("billedAnnually", { b: (chunks) => <span style={{ color: "var(--text)", fontWeight: 600 }}>{chunks}</span> })
                  : t.rich("billedMonthly", { b: (chunks) => <span style={{ color: "var(--text)", fontWeight: 600 }}>{chunks}</span> })}
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
              // Paid — let them re-tier their workers in place (prorated) instead of a dead end.
              <button
                className="btn primary"
                onClick={handleSaveWorkers}
                disabled={saving || !dirty}
                style={{ width: "100%", justifyContent: "center", marginTop: 18, opacity: saving || !dirty ? 0.85 : 1 }}
              >
                {saving ? (
                  <>
                    <span
                      className="spin"
                      style={{ display: "inline-block", width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.5)", borderTopColor: "#fff" }}
                    />
                    {t("redirecting")}
                  </>
                ) : dirty ? (
                  t("saveChanges")
                ) : (
                  t("activePlan")
                )}
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
                  interval === "year"
                    ? t("getWorkersYear", { workers, price: priceUsd })
                    : t("getWorkers", { workers, price: priceUsd })
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

        {/* Comparison */}
        <div style={{ marginTop: 56 }}>
          <div style={{ textAlign: "center", marginBottom: 22 }}>
            <span className="eyebrow" style={{ justifyContent: "center" }}>
              <span className="spark">◆</span> {t("compareEyebrow")}
            </span>
            <h2 style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: "-0.025em" }}>{t("compareTitle")}</h2>
          </div>
          <div className="cmp">
            <div className="cmp-row cmp-head">
              <span />
              <span className="cmp-val">{t("compareFree")}</span>
              <span className="cmp-val" style={{ color: "var(--brand)", fontWeight: 700 }}>{t("compareWorkers")}</span>
            </div>
            {compareRows.map(r => (
              <div className="cmp-row" key={r.feature}>
                <span className="cmp-feat">{r.feature}</span>
                <span className="cmp-val">{cmpCell(r.free)}</span>
                <span className="cmp-val paid">{cmpCell(r.paid)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="stat-band" style={{ marginTop: 48 }}>
          {stats.map(s => (
            <div key={s.label}>
              <span className="ic">{s.icon}</span>
              <div className="val">{s.value}</div>
              <div className="lbl">{s.label}</div>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div style={{ marginTop: 56, maxWidth: 720, marginInline: "auto" }}>
          <div style={{ textAlign: "center", marginBottom: 22 }}>
            <span className="eyebrow" style={{ justifyContent: "center" }}>
              <span className="spark">◆</span> {t("faqEyebrow")}
            </span>
            <h2 style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: "-0.025em" }}>{t("faqTitle")}</h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {faq.map(item => (
              <details key={item.q} className="card faq-item" style={{ padding: 0 }}>
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
                  <span className="faq-mark" style={{ color: "var(--brand)", fontSize: 18, lineHeight: 1 }}>+</span>
                </summary>
                <div className="muted" style={{ padding: "0 16px 16px", fontSize: 13, lineHeight: 1.55 }}>
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </div>

        {/* Final CTA */}
        <div className="cta-band" style={{ marginTop: 56 }}>
          <h2 style={{ margin: 0, fontSize: "clamp(24px, 5vw, 30px)", fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
            {t("ctaTitle")}
          </h2>
          <p style={{ margin: "10px auto 0", maxWidth: 460, fontSize: 14.5, lineHeight: 1.5, opacity: 0.92 }}>
            {t("ctaSubtitle")}
          </p>
          <button
            className="btn on-brand"
            style={{ marginTop: 22, paddingLeft: 20, paddingRight: 20 }}
            onClick={() => {
              if (isPaid) window.scrollTo({ top: 0, behavior: "smooth" })
              else void handleUpgrade()
            }}
          >
            {t("ctaButton")} →
          </button>
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
