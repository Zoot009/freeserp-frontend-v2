"use client"

import { Suspense, useState, useEffect, useCallback, useMemo } from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useSearchParams } from "next/navigation"
import { Link, useRouter } from "@/i18n/navigation"
import { CreditPricing } from "@/components/dashboard/credit-pricing"
import { useCredits } from "@/lib/credits"
import { LanguageSwitcher } from "@/components/language-switcher"
import { Icon } from "@/components/dashboard/icons"
import { useAuth } from "@/lib/auth"
// Shared API client (not raw axios): it attaches the access token and, on a 401,
// transparently refreshes + retries. The pricing page previously used raw axios
// with a manually-attached bearer, so an expired token surfaced as a hard
// "Invalid or expired token" mid-checkout instead of silently refreshing.
import { api, ApiError } from "@/lib/api"
import { trackEvent } from "@/lib/track"
import { track } from "@/lib/analytics"
import { type BillingInterval, type TierInfo } from "@/lib/pricing"
import { fetchBillingConfig, FALLBACK_BILLING_CONFIG, type BillingConfig } from "@/lib/billing-config"


interface Status {
  configured: boolean
  plan: "free" | "paid" | string
  planExpiresAt: string | null
  subscriptionId: string | null
  workerCount?: number
  interval?: BillingInterval
  provider?: string | null
}

// A compare row is either a section header or a feature comparison.
type CompareRow = { group: string } | { feature: string; free: string; paid: string }

const Check = () => (
  <span className="feat-check">
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
      <path d="M2 7L5.5 10.5L12 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
)

// useSearchParams suspends while the client bundle hydrates, so Next requires
// a boundary around anything that reads it — without one the whole route is
// forced out of static rendering at build time.
export default function PricingPage() {
  return (
    <Suspense fallback={null}>
      <PricingPageInner />
    </Suspense>
  )
}

function PricingPageInner() {
  const t = useTranslations("pricing")
  const freeFeatures = t.raw("freeFeatures") as string[]
  const paidFeatures = t.raw("paidFeatures") as string[]
  // Rows are either a section header ({ group }) or a feature row. The compare
  // table groups ~17 rows under three headings so it stays scannable.
  // Which billing model this visitor is on. Null while loading and for signed
  // -out visitors, both of which should see the credit plans — that is the
  // product now; workers are a legacy path with an existing subscription.
  const { credits: creditSummary } = useCredits()
  const mode = creditSummary?.mode ?? "credits"

  const compareRows = t.raw("compareRows") as CompareRow[]
  const stats = [
    { label: t("statMarketsLabel"), value: t("statMarketsValue"), icon: <Icon.globe /> },
    { label: t("statResultTimeLabel"), value: t("statResultTimeValue"), icon: <Icon.zap /> },
    { label: t("statCommitmentLabel"), value: t("statCommitmentValue"), icon: <Icon.shield /> },
  ]
  const faq = t.raw("faq") as { q: string; a: string }[]
  const { user, token, loading } = useAuth()
  const router = useRouter()
  // Arriving from a "Get Pro" link on the marketing site, which appends
  // ?plan=credits-49 or ?topup=5000. Without reading it the choice the visitor
  // already made is silently thrown away at the door.
  const searchParams = useSearchParams()
  const highlight =
    searchParams.get("plan") ??
    (searchParams.get("topup") ? `topup-${searchParams.get("topup")}` : null)
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
  // Monthly vs annual billing. New users pick it at checkout; existing paid
  // Stripe subscribers can switch their live subscription's interval in place
  // (prorated price swap). Initialized to the user's current interval below.
  const [interval, setBillingInterval] = useState<BillingInterval>("month")
  // The interval the user is CURRENTLY billed at (paid users only) — lets the
  // Save button detect an interval switch and the toggle open on the right side.
  const [currentInterval, setCurrentInterval] = useState<BillingInterval | null>(null)
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
  // Annual discount vs paying 12× the monthly rate, for the selected tier.
  const monthlyYearUsd = workers * (cfg.pricePerWorkerCents.month / 100) * 12
  const annualUsd = workers * (cfg.pricePerWorkerCents.year / 100)
  const annualSaveUsd = Math.max(0, monthlyYearUsd - annualUsd)
  const annualSavePct = monthlyYearUsd > 0 ? Math.round((annualSaveUsd / monthlyYearUsd) * 100) : 0
  const showAnnualSavings = interval === "year" && annualSaveUsd > 0

  // Load plan status; for paid users also resolve the current worker count so the
  // stepper opens on their tier and the Save button can detect changes.
  const loadStatus = useCallback(async () => {
    if (!token) return
    try {
      const d = await api.get<Status>("/api/payments/status")
      setStatus(d)
      if (d?.plan === "paid") {
        let wc = typeof d.workerCount === "number" ? d.workerCount : null
        if (wc == null) {
          try {
            const u = await api.get<{ workerCount?: number }>("/api/usage")
            if (typeof u?.workerCount === "number") wc = u.workerCount
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
        // Open the toggle on the user's current interval so "Save" only fires on
        // an actual change.
        if (d.interval === "month" || d.interval === "year") {
          setCurrentInterval(d.interval)
          setBillingInterval(d.interval)
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
      const data = await api.post<{ url?: string }>("/api/payments/checkout", {
        workerCount: workers,
        interval,
      })
      if (!data?.url) throw new Error(t("errorCheckoutUrlMissing"))
      window.location.href = data.url
    } catch (err) {
      // Annual is Stripe-only; PayU-billed regions get bounced back to monthly.
      if (err instanceof ApiError && err.code === "annual_unavailable") {
        setBillingInterval("month")
        toast.error(t("annualUnavailable"))
        return
      }
      setError(err instanceof Error ? err.message : t("errorCheckoutFailed"))
    } finally {
      setCheckoutLoading(false)
    }
  }

  const isPaid =
    status?.plan === "paid" &&
    (!status.planExpiresAt || new Date(status.planExpiresAt).getTime() > Date.now())

  // A paid user only has a MANAGEABLE plan when a real provider subscription
  // exists. Admin-granted paid accounts have plan='paid' but no subscription,
  // so worker/interval changes (PATCH /workers) would 404 — those users get the
  // checkout flow instead, to start a real subscription.
  const manageable = isPaid && Boolean(status?.subscriptionId)

  // Interval switching in-place is Stripe-only (PayU mandates are monthly).
  const canSwitchInterval = manageable && status?.provider === "stripe"
  const intervalChanged = Boolean(isPaid && currentInterval != null && interval !== currentInterval)

  // Paid users adjust worker count and/or billing interval right here — prorated,
  // mirroring the billing dashboard's PATCH. Enabled once either differs.
  const dirty = Boolean(
    isPaid && ((currentWorkers != null && workers !== currentWorkers) || intervalChanged),
  )

  const handleSaveWorkers = async () => {
    if (!dirty || !token) return
    setSaving(true)
    try {
      // Only send interval when it actually changed (avoids a no-op price swap).
      await api.patch("/api/billing/workers", {
        workerCount: workers,
        ...(intervalChanged ? { interval } : {}),
      })
      toast.success(t("savedToast", { checks: searchesPerDay }))
      window.dispatchEvent(new Event("usage:refresh"))
      setCurrentWorkers(workers)
      setCurrentInterval(interval)
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

  // Renders a comparison cell. "✓" / "—" are sentinels the message files use for
  // included / not-included — everything else renders as plain text. Translators
  // must preserve those two glyphs exactly.
  const cmpCell = (v: string) => {
    if (v === "✓")
      return (
        <span className="cmp-yes" role="img" aria-label={t("compareIncluded")}>
          <Icon.check size={14} />
        </span>
      )
    if (v === "—")
      return (
        <span className="cmp-no" role="img" aria-label={t("compareNotIncluded")}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
      )
    return <span>{v}</span>
  }

  return (
    <main className="fs-app" style={{ minHeight: "100vh", background: "var(--bg-sub)" }}>
      {/* Header */}
      <header className="pricing-header row" style={{ justifyContent: "space-between", padding: "14px 24px" }}>
        <Link href="/dashboard" className="row" style={{ gap: 8, textDecoration: "none", color: "var(--text)" }}>
          <Image src="/logo.png" alt="FreeSERP" width={28} height={28} priority />
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
        </div>
      </div>

      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "36px 24px 72px" }}>
        {/* Free-tier callout. It is a recurring monthly allowance now, not a
            one-off trial, so it keeps arriving — but paid users already have a
            larger one, and it would only confuse them. */}
        {!isPaid && (
          <p className="trial-banner">
            <Icon.zap />
            <span>
              <b>{t("trialBannerLead")}</b> {t("trialBannerRest")}
            </span>
          </p>
        )}

        {/* Pricing cards */}
        {/* The current model. Rendered from the credit rate card, so the prices
            here are the rows that will actually be charged. */}
        {mode !== "worker" && <CreditPricing className="mb-10" highlight={highlight} />}

        {/* The worker plans, kept for subscribers who are grandfathered onto
            them. New visitors never see this — showing both models at once
            asks people to choose a billing system rather than a plan. */}
        {mode === "worker" && (
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

            <ul className="price-feats">
              {freeFeatures.map(f => (
                <li key={f}>
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
          <div className="card price-card featured" style={{ padding: 28, display: "flex", flexDirection: "column" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="chip brand">{t("paidTitle")}</span>
              <span className="price-ribbon"><Icon.star size={11} /> {t("recommended")}</span>
            </div>

            {/* Monthly / annual toggle — shown whenever the user will CHECKOUT a
                new subscription (`!manageable`: free, unauthenticated, or an
                admin-granted paid account with no real subscription) AND for
                existing paid Stripe subs (in-place prorated interval switch).
                Managed PayU subs stay monthly, so it's hidden for them. */}
            {(!manageable || canSwitchInterval) && (
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
              {showAnnualSavings && (
                <span className="muted" style={{ fontSize: 18, textDecoration: "line-through", opacity: 0.6 }}>${monthlyYearUsd}</span>
              )}
              <span style={{ fontSize: "clamp(34px, 9vw, 44px)", fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1 }}>${priceUsd}</span>
              <span className="muted" style={{ fontSize: 13 }}>{perLabel}</span>
            </div>
            {showAnnualSavings && (
              <p className="tiny" style={{ marginTop: 6, color: "var(--pos)", fontWeight: 600 }}>
                {t("annualSaveNote", { save: annualSaveUsd, pct: annualSavePct })}
              </p>
            )}
            <p className="tiny muted" style={{ marginTop: 6 }}>
              {t.rich("rankChecksPerDay", {
                searches: searchesPerDay,
                workers,
                b: (chunks) => <span style={{ color: "var(--text)", fontWeight: 600 }}>{chunks}</span>,
              })}
            </p>

            {/* Fixed pricing tiers — pick an amount (no custom values) */}
            <div className="tier-picker">
              <div className="row between" style={{ marginBottom: 10 }}>
                <span className="tier-picker-h">{isPaid ? t("manageTitle") : t("choosePlan")}</span>
                <span className="tiny muted">
                  {interval === "year"
                    ? t("perDollarEachYear", { searches: cfg.perWorkerDailyChecks, price: perWorkerUsd })
                    : t("perDollarEach", { searches: cfg.perWorkerDailyChecks, price: perWorkerUsd })}
                </span>
              </div>
              {/* Incremental stepper — −/+ move between the fixed tiers. Checks/day
                  leads, price is secondary: capacity is what's being bought. */}
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
                <div className="tier-readout">
                  <span className="tier-readout-checks">{t("tierChecks", { checks: searchesPerDay })}</span>
                  <span className="tiny muted tabular">
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
            </div>

            <ul className="price-feats" style={{ marginTop: 20 }}>
              {paidFeatures.map(f => (
                <li key={f}>
                  <Check />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            {/* marginTop:auto keeps this CTA level with the Free card's button */}
            <div style={{ marginTop: "auto", paddingTop: 18 }}>
            {loading ? (
              <button className="btn primary" disabled style={{ width: "100%", justifyContent: "center", opacity: 0.7 }}>
                {t("loading")}
              </button>
            ) : manageable ? (
              // Paid with a real subscription — re-tier workers in place (prorated).
              // Admin-granted paid (no subscription) falls through to checkout below.
              <button
                className="btn primary"
                onClick={handleSaveWorkers}
                disabled={saving || !dirty}
                style={{ width: "100%", justifyContent: "center", opacity: saving || !dirty ? 0.85 : 1 }}
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
                style={{ width: "100%", justifyContent: "center" }}
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
                    ? t("getChecksYear", { checks: searchesPerDay, price: priceUsd })
                    : t("getChecks", { checks: searchesPerDay, price: priceUsd })
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
        </div>
        )}

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
              <span className="cmp-val" style={{ color: "var(--brand)", fontWeight: 700 }}>{t("comparePaid")}</span>
            </div>
            {compareRows.map(r =>
              "group" in r ? (
                <div className="cmp-group" key={r.group}>{r.group}</div>
              ) : (
                <div className="cmp-row" key={r.feature}>
                  <span className="cmp-feat">{r.feature}</span>
                  <span className="cmp-val">{cmpCell(r.free)}</span>
                  <span className="cmp-val paid">{cmpCell(r.paid)}</span>
                </div>
              ),
            )}
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
