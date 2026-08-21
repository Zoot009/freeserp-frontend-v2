"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import { toast } from "sonner"
import { api, ApiError, getAccessToken } from "@/lib/api"
import { StatTile } from "@/components/dashboard/primitives"
import { Icon } from "@/components/dashboard/icons"
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog"
import { TIERS, SEARCHES_PER_WORKER, tierPriceUsd, type BillingInterval } from "@/lib/pricing"
import { Loader2 } from "lucide-react"
import { useCredits } from "@/lib/credits"
import { CreditsBilling } from "@/components/dashboard/credits-billing"

interface Usage {
  plan: "free" | "paid" | string
  planSlug: string
  workerCount: number
  perWorkerDailyChecks: number
  dailyUsed: number
  dailyLimit: number
  dailyRemaining: number
  // One-time, non-recurring free-plan trial state. Always null/false for paid.
  freeCheckTrialEndsAt: string | null
  freeCheckTrialExhausted: boolean
  // One-time trial extension. Optional so a backend predating the feature simply
  // hides the offer rather than rendering a broken CTA.
  freeTrialExtensionAvailable?: boolean
  freeTrialExtended?: boolean
  aiAnalyses?: AiAnalyses
}

/**
 * Today's AI-analysis allowance. `unlimited` and `degrades` qualify `remaining`
 * and must be read with it: on free plans running out degrades new analyses to
 * previews rather than blocking, so free users are never "out".
 *
 * Counts competitor analyses only — rerunning one or regenerating its AI plan
 * spends tokens without moving this number, matching what the cap enforces.
 */
interface AiAnalyses {
  used: number
  limit: number
  remaining: number | null
  perWorkerPerDay: number
  unlimited: boolean
  degrades: boolean
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
  payuMandateId: string | null
  // Included by GET /api/billing/subscription; the slug tells us the billing
  // interval (workers = monthly, workers-annual = yearly).
  plan?: { slug: string } | null
}

interface WorkersPreview {
  workerCount: number
  interval: BillingInterval
  currency: string
  amountDueCents: number
  recurringCents: number
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

/**
 * The worker billing page, unchanged.
 *
 * Only reachable now by a grandfathered subscriber (or as the fallback when
 * the balance endpoint is unreachable). Left exactly as it was: every limit it
 * renders is still the one those accounts are metered on.
 */
function WorkerBillingPage() {
  const t = useTranslations("dashBilling")
  const searchParams = useSearchParams()
  const trialExpiredRedirect = searchParams.get("trial") === "expired"
  const upgradePerks = t.raw("upgradePerks") as string[]
  const [usage, setUsage] = useState<Usage | null>(null)
  const [sub, setSub] = useState<Subscription | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [workers, setWorkers] = useState(1)
  // Null = keep the current billing interval; set when the user picks the other
  // one (monthly↔annual switch on a live Stripe subscription).
  const [targetInterval, setTargetInterval] = useState<BillingInterval | null>(null)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const workerCardRef = useRef<HTMLDivElement>(null)

  const switchToAnnual = () => {
    setTargetInterval("year")
    // Take the user straight to the tier card where Save (with the prorated
    // preview) lives — the nudge banner is above the fold, the card isn't.
    requestAnimationFrame(() => workerCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }))
  }

  const load = useCallback(async () => {
    if (!getAccessToken()) {
      setLoading(false)
      return
    }
    setError(false)
    try {
      // Usage is the page's required call — if it fails, surface a real error
      // instead of silently rendering the user as a free account. Subscription
      // and history stay best-effort.
      const u = await api.get<Usage>("/api/usage")
      const [s, h] = await Promise.all([
        api.get<{ subscription: Subscription | null }>("/api/billing/subscription").catch(() => ({ subscription: null })),
        api.get<{ payments: Payment[] }>("/api/billing/history").catch(() => ({ payments: [] })),
      ])
      setUsage(u)
      setWorkers(u.workerCount ?? 1)
      setSub(s?.subscription ?? null)
      setPayments(h?.payments ?? [])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const isPaid = usage?.plan === "paid"
  const trialEndsAtDate = !isPaid && usage?.freeCheckTrialEndsAt ? new Date(usage.freeCheckTrialEndsAt) : null
  const perWorker = usage?.perWorkerDailyChecks ?? SEARCHES_PER_WORKER
  const currentWorkers = usage?.workerCount ?? 1
  // Current billing interval, derived from the subscription's plan slug (there is
  // no interval column) — annual subs are billed once a year at $10/worker.
  const currentInterval: BillingInterval = sub?.plan?.slug === "workers-annual" ? "year" : "month"
  // Interval switching in-place is Stripe-only (PayU mandates are monthly).
  const canSwitchInterval = isPaid && sub?.provider === "stripe"
  const interval = targetInterval ?? currentInterval
  const intervalChanged = isPaid && interval !== currentInterval
  const perSuffix = interval === "year" ? t("perYearSuffix") : t("perMonthSuffix")
  // A grandfathered (pre-minimum-tier) worker count, e.g. the retired $1 tier —
  // shown as its own locked tile since it no longer matches a purchasable tier.
  const isLegacyCount = isPaid && !TIERS.some((tier) => tier.workers === currentWorkers)
  const dirty = isPaid && (workers !== currentWorkers || intervalChanged)
  const searchesPerDay = workers * perWorker
  const priceUsd = tierPriceUsd(workers, interval)
  const priceDelta = tierPriceUsd(workers, interval) - tierPriceUsd(currentWorkers, currentInterval)
  // Annual discount vs 12× the monthly rate for the selected tier.
  const annualSaveUsd = Math.max(0, tierPriceUsd(workers, "month") * 12 - tierPriceUsd(workers, "year"))
  const annualSavePct =
    tierPriceUsd(workers, "month") * 12 > 0
      ? Math.round((annualSaveUsd / (tierPriceUsd(workers, "month") * 12)) * 100)
      : 0
  // Proactive nudge for monthly subscribers — savings at their CURRENT worker
  // count if they switched to annual (stable regardless of the tier stepper).
  const currentAnnualSaveUsd = Math.max(
    0,
    tierPriceUsd(currentWorkers, "month") * 12 - tierPriceUsd(currentWorkers, "year"),
  )
  const currentAnnualSavePct =
    tierPriceUsd(currentWorkers, "month") * 12 > 0
      ? Math.round((currentAnnualSaveUsd / (tierPriceUsd(currentWorkers, "month") * 12)) * 100)
      : 0
  const showAnnualNudge =
    canSwitchInterval && currentInterval === "month" && !intervalChanged && currentAnnualSaveUsd > 0
  const usedPct = usage && usage.dailyLimit > 0 ? Math.min(100, Math.round((usage.dailyUsed / usage.dailyLimit) * 100)) : 0
  // Older backends don't send aiAnalyses; the whole card is hidden rather than
  // rendered as 0/0. An unlimited cap has no bar to fill, so it stays at 0 too.
  const ai = usage?.aiAnalyses
  const aiUsedPct = ai && !ai.unlimited && ai.limit > 0 ? Math.min(100, Math.round((ai.used / ai.limit) * 100)) : 0
  // Free users degrade to previews instead of being blocked, so a full bar is a
  // nudge, not an error — reserve the red only for paid users who are hard-stopped.
  const aiBarColor = ai && !ai.degrades && aiUsedPct >= 100 ? "var(--neg)" : "var(--brand)"
  // Only Stripe supports resume; PayU SI mandates (and legacy Razorpay) can't be reinstated.
  const canResume = sub?.provider === "stripe"
  // Stripe flips the sub to past_due while its dunning retries run; the user's
  // plan is already degraded to free, so this must render independent of isPaid.
  const isPastDue = sub?.status === "past_due"

  const refreshMeter = () => window.dispatchEvent(new Event("usage:refresh"))

  // Live "charged now" proration preview while the tier/interval selection is
  // dirty. Debounced; absence (PayU or a transient error) falls back to the
  // static price-difference line.
  const [preview, setPreview] = useState<WorkersPreview | null>(null)
  useEffect(() => {
    setPreview(null)
    if (!dirty) return
    const query: Record<string, string | number> = { workerCount: workers }
    if (intervalChanged) query.interval = interval
    const timer = setTimeout(() => {
      api
        .get<WorkersPreview>("/api/billing/workers/preview", { query })
        .then((p) => setPreview(p.workerCount === workers ? p : null))
        .catch(() => setPreview(null))
    }, 350)
    return () => clearTimeout(timer)
  }, [dirty, workers, interval, intervalChanged])

  const applyWorkerChange = async () => {
    if (!dirty) return
    setSaving(true)
    try {
      await api.patch("/api/billing/workers", {
        workerCount: workers,
        ...(intervalChanged ? { interval } : {}),
      })
      toast.success(t("planUpdated", { checks: searchesPerDay.toLocaleString() }))
      setTargetInterval(null)
      await load()
      refreshMeter()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("planUpdateError"))
    } finally {
      setSaving(false)
    }
  }

  const cancelPlan = async () => {
    setBusy(true)
    try {
      await api.post("/api/billing/cancel")
      toast.success(t("cancelSuccess"))
      setConfirmCancel(false)
      await load()
      refreshMeter()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("cancelError"))
    } finally {
      setBusy(false)
    }
  }

  const resumePlan = async () => {
    setBusy(true)
    try {
      await api.post("/api/billing/resume")
      toast.success(t("resumeSuccess"))
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("resumeError"))
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
      toast.error(err instanceof ApiError ? err.message : t("portalError"))
      setBusy(false)
    }
  }

  // Redeem the one-time trial extension. Reloads rather than patching state
  // locally so the meter, the trial-ends date and the banner all re-derive from
  // the server's summary — the same numbers the backend will enforce.
  const extendTrial = async () => {
    setBusy(true)
    try {
      const { extension } = await api.post<{ extension: { days: number; checks: number } }>(
        "/api/billing/trial/extend",
      )
      toast.success(t("extendSuccess", { days: extension.days, checks: extension.checks }))
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("extendError"))
    } finally {
      setBusy(false)
    }
  }

  const Header = (
    <div className="page-h">
      <div>
        <h1>{t("title")}</h1>
        <div className="sub">{t("subtitle")}</div>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="page">
        {Header}
        <div className="grid g-4" style={{ marginBottom: 16 }}>
          {[0, 1, 2, 3].map((i) => <div key={i} className="placeholder" style={{ height: 76 }} />)}
        </div>
        <div className="grid g-21" style={{ marginBottom: 16, alignItems: "start" }}>
          <div className="placeholder" style={{ height: 180 }} />
          <div className="placeholder" style={{ height: 180 }} />
        </div>
        <div className="placeholder" style={{ height: 120 }} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="page">
        {Header}
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <span className="chip neg" style={{ marginBottom: 12 }}>{t("loadErrorChip")}</span>
          <p className="tiny muted" style={{ margin: "0 auto 16px", maxWidth: 360 }}>
            {t("loadErrorBody")}
          </p>
          <button className="btn primary" onClick={() => { setLoading(true); void load() }} style={{ margin: "0 auto" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon.refresh /> {t("retry")}</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      {/* Header */}
      {Header}

      {/* Yields to the offer banner below, which carries the same message plus the
          CTAs — otherwise an expiry redirect stacks two near-identical warnings. */}
      {trialExpiredRedirect && !isPaid && !usage?.freeCheckTrialExhausted && (
        <div
          className="tiny"
          style={{ marginBottom: 16, padding: "10px 14px", borderRadius: "var(--r-sm)", background: "var(--warn-soft)", color: "var(--warn)" }}
        >
          {t("trialExpiredBanner")}
        </div>
      )}

      {/* Post-expiry offer: extend once, or go straight to a plan. Persistent
          counterpart to the QuotaUpsellModal, which only fires on a live 402. */}
      {!isPaid && usage?.freeCheckTrialExhausted && (
        <div
          className="tiny"
          style={{ marginBottom: 16, padding: "10px 14px", borderRadius: "var(--r-sm)", background: "var(--warn-soft)", color: "var(--warn)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
        >
          <span style={{ flex: 1, minWidth: 220 }}>
            {usage.freeTrialExtensionAvailable
              ? t("trialExtendOffer")
              : usage.freeTrialExtended
                ? t("trialExtendUsed")
                : t("trialExpiredBanner")}
          </span>
          {usage.freeTrialExtensionAvailable && (
            <button className="btn" onClick={extendTrial} disabled={busy} style={{ flexShrink: 0 }}>
              {busy ? t("saving") : t("trialExtendCta")}
            </button>
          )}
          <button
            className="btn primary"
            onClick={() => workerCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
            style={{ flexShrink: 0 }}
          >
            {t("trialSubscribeCta")}
          </button>
        </div>
      )}

      {isPastDue && (
        <div
          className="tiny"
          style={{ marginBottom: 16, padding: "10px 14px", borderRadius: "var(--r-sm)", background: "var(--warn-soft)", color: "var(--warn)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
        >
          <span style={{ flex: 1, minWidth: 220 }}>{t("pastDueBanner")}</span>
          {sub?.provider === "stripe" && (
            <button className="btn" onClick={openPortal} disabled={busy} style={{ flexShrink: 0 }}>
              {t("pastDueCta")}
            </button>
          )}
        </div>
      )}

      {showAnnualNudge && (
        <div
          className="tiny"
          style={{ marginBottom: 16, padding: "10px 14px", borderRadius: "var(--r-sm)", background: "var(--pos-soft, var(--brand-soft))", color: "var(--pos)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
        >
          <span style={{ flex: 1, minWidth: 220, fontWeight: 600 }}>
            {t("annualNudge", { save: currentAnnualSaveUsd, pct: currentAnnualSavePct })}
          </span>
          <button
            className="btn"
            onClick={switchToAnnual}
            style={{ flexShrink: 0, borderColor: "var(--pos)", color: "var(--pos)" }}
          >
            {t("annualNudgeCta")}
          </button>
        </div>
      )}

      {/* Overview tiles */}
      <div className="grid g-4" style={{ marginBottom: 16 }}>
        <StatTile lbl={t("tilePlan")} val={isPaid ? t("paidPlanName") : t("free")} tip={isPaid ? t("tilePlanActive", { count: currentWorkers * perWorker }) : t("tilePlanManual")} />
        <StatTile lbl={t("tileChecksPerDay")} val={isPaid ? (currentWorkers * perWorker).toLocaleString() : "—"} tip={isPaid ? t("tileChecksEach", { count: perWorker }) : undefined} />
        <StatTile
          lbl={currentInterval === "year" ? t("tileYearlyCost") : t("tileMonthlyCost")}
          val={isPaid ? `$${tierPriceUsd(currentWorkers, currentInterval)}` : "$0"}
          tip={isPaid ? (currentInterval === "year" ? t("tileBilledAnnually") : t("tileBilledMonthly")) : t("tileFreeForever")}
        />
        <StatTile
          lbl={isPaid ? t("tileChecksToday") : t("tileChecksTrial")}
          val={`${usage?.dailyUsed ?? 0} / ${usage?.dailyLimit ?? 0}`}
          tip={t("tileRemaining", { count: usage?.dailyRemaining ?? 0 })}
        />
      </div>

      <div className="grid g-21" style={{ marginBottom: 16, alignItems: "start" }}>
        {/* Plan & workers */}
        <div className="card" ref={workerCardRef}>
          <div className="card-h">
            <div>
              <div className="t">{isPaid ? t("paidPlanName") : t("yourPlan")}</div>
              <div className="tiny muted">{isPaid ? t("planCardHintPaid") : t("planCardHintFree")}</div>
            </div>
          </div>

          {!isPaid ? (
            <div>
              <p className="tiny muted" style={{ marginBottom: 14 }}>
                {usage?.freeCheckTrialExhausted
                  ? t("freePlanLineExhausted")
                  : trialEndsAtDate
                    ? t("freePlanLine", { count: usage?.dailyLimit ?? 3, date: formatDate(trialEndsAtDate.toISOString()) })
                    : t("freePlanLineExhausted")}
              </p>
              <ul style={{ listStyle: "none", margin: "0 0 16px", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {upgradePerks.map(perk => (
                  <li key={perk} className="row tiny" style={{ alignItems: "flex-start", gap: 8 }}>
                    <span style={{ color: "var(--pos)", marginTop: 1, flexShrink: 0, display: "inline-flex" }}><Icon.check /></span>
                    <span>{perk}</span>
                  </li>
                ))}
              </ul>
              <Link href="/pricing?clicked-buy-button"><button className="btn primary">{t("upgrade")}</button></Link>
            </div>
          ) : !sub ? (
            // Paid via an admin grant (no billing subscription) — there's no
            // provider subscription to adjust, so offer to start a real one
            // instead of a Save button that can only 404.
            <div>
              <p className="tiny muted" style={{ marginBottom: 14, lineHeight: 1.6 }}>{t("grantedNoSub")}</p>
              <Link href="/pricing?clicked-buy-button"><button className="btn primary">{t("startSubscription")}</button></Link>
            </div>
          ) : (
            <div>
              {/* Monthly / annual interval switch (Stripe subs only) — prorated
                  price swap on the live subscription. */}
              {canSwitchInterval && (
                <div className="row" style={{ gap: 6, marginBottom: 12 }}>
                  <button
                    type="button"
                    className="btn sm"
                    aria-pressed={interval === "month"}
                    onClick={() => setTargetInterval("month")}
                    style={interval === "month" ? { borderColor: "var(--brand)", background: "var(--brand-soft)", color: "var(--brand)" } : undefined}
                  >
                    {t("intervalMonthly")}
                  </button>
                  <button
                    type="button"
                    className="btn sm"
                    aria-pressed={interval === "year"}
                    onClick={() => setTargetInterval("year")}
                    style={interval === "year" ? { borderColor: "var(--brand)", background: "var(--brand-soft)", color: "var(--brand)" } : undefined}
                  >
                    {t("intervalAnnual")}
                    <span className="tiny" style={{ marginLeft: 6, color: "var(--pos)", fontWeight: 600 }}>{t("annualSavings")}</span>
                  </button>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {isLegacyCount && (
                  // Grandfathered pre-minimum tier (e.g. the retired $1/1-worker
                  // plan): shown but not re-selectable — the only move is up.
                  <button
                    type="button"
                    aria-pressed={workers === currentWorkers}
                    className="btn"
                    disabled
                    style={{
                      flexDirection: "column",
                      gap: 2,
                      padding: "9px 4px",
                      height: "auto",
                      borderColor: workers === currentWorkers ? "var(--brand)" : "var(--border)",
                      background: workers === currentWorkers ? "var(--brand-soft)" : "var(--bg-elev)",
                      color: workers === currentWorkers ? "var(--brand)" : "var(--text)",
                      boxShadow: workers === currentWorkers ? "inset 0 0 0 1px var(--brand)" : "none",
                      opacity: 1,
                    }}
                  >
                    <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      ${tierPriceUsd(currentWorkers, interval)}
                    </span>
                    <span className="tiny muted">{t("legacyTier")}</span>
                  </button>
                )}
                {TIERS.map(tier => {
                  const active = tier.workers === workers
                  return (
                    <button
                      key={tier.usd}
                      type="button"
                      aria-pressed={active}
                      className="btn"
                      onClick={() => setWorkers(tier.workers)}
                      disabled={saving}
                      style={{
                        flexDirection: "column",
                        gap: 2,
                        padding: "9px 4px",
                        height: "auto",
                        borderColor: active ? "var(--brand)" : "var(--border)",
                        background: active ? "var(--brand-soft)" : "var(--bg-elev)",
                        color: active ? "var(--brand)" : "var(--text)",
                        boxShadow: active ? "inset 0 0 0 1px var(--brand)" : "none",
                      }}
                    >
                      <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        ${tierPriceUsd(tier.workers, interval)}
                      </span>
                      <span className="tiny muted" style={{ fontVariantNumeric: "tabular-nums" }}>{t("tierChecks", { checks: tier.checks })}</span>
                    </button>
                  )
                })}
              </div>
              <p className="tiny muted" style={{ marginTop: 12 }}>
                {t.rich("planSummary", {
                  checks: searchesPerDay.toLocaleString(),
                  cost: priceUsd,
                  per: perSuffix,
                  strong: (chunks) => <span style={{ color: "var(--text)", fontWeight: 600 }}>{chunks}</span>,
                })}
              </p>
              {interval === "year" && annualSaveUsd > 0 && (
                <p className="tiny" style={{ marginTop: 6, color: "var(--pos)", fontWeight: 600 }}>
                  {t("annualSaveNote", { save: annualSaveUsd, pct: annualSavePct })}
                </p>
              )}
              {dirty && (
                <p className="tiny" style={{ marginTop: 8, padding: "8px 10px", borderRadius: "var(--r-sm)", background: "var(--bg-inset)" }}>
                  <span className="muted">{t("planDeltaFrom", { from: currentWorkers * perWorker, to: searchesPerDay })} · </span>
                  {preview ? (
                    <span style={{ color: preview.amountDueCents >= 0 ? "var(--pos)" : "var(--neg)", fontWeight: 600 }}>
                      {t("previewChargeNow", { amount: formatMoney(preview.amountDueCents, preview.currency) })}
                    </span>
                  ) : (
                    <>
                      <span style={{ color: priceDelta >= 0 ? "var(--pos)" : "var(--neg)", fontWeight: 600 }}>
                        {priceDelta >= 0 ? "+" : "−"}${Math.abs(priceDelta)}{perSuffix}
                      </span>
                      <span className="muted">{t("planDeltaProrated")}</span>
                    </>
                  )}
                </p>
              )}
              <button className="btn primary" onClick={applyWorkerChange} disabled={!dirty || saving} style={{ marginTop: 14 }}>
                {saving ? t("saving") : t("saveChanges")}
              </button>
            </div>
          )}
        </div>

        {/* Subscription details */}
        <div className="card">
          <div className="card-h">
            <div className="t">{t("subscription")}</div>
            {isPaid && sub && (
              <span className={"chip " + (sub.cancelAtPeriodEnd ? "warn" : "pos")}>
                {sub.cancelAtPeriodEnd ? t("statusCancelsSoon") : sub.status === "trialing" ? t("statusTrial") : t("statusActive")}
              </span>
            )}
          </div>

          {!isPaid || !sub ? (
            <div className="tiny muted">{t("noSubscription")}</div>
          ) : (
            <>
              <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", fontSize: 13 }}>
                <dt className="muted">{t("provider")}</dt>
                <dd style={{ margin: 0, textTransform: "capitalize" }}>{sub.provider}</dd>
                <dt className="muted">{sub.cancelAtPeriodEnd ? t("ends") : t("renews")}</dt>
                <dd style={{ margin: 0 }}>{formatDate(sub.currentPeriodEnd)}</dd>
                {sub.trialEndsAt && (
                  <>
                    <dt className="muted">{t("trialEnds")}</dt>
                    <dd style={{ margin: 0 }}>{formatDate(sub.trialEndsAt)}</dd>
                  </>
                )}
              </dl>

              {sub.cancelAtPeriodEnd && (
                <div className="tiny" style={{ marginTop: 12, padding: "8px 10px", borderRadius: "var(--r-sm)", background: "var(--warn-soft)", color: "var(--warn)" }}>
                  {t("cancelNotice", { date: formatDate(sub.currentPeriodEnd) })}
                </div>
              )}

              <div className="divider" />
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                {sub.provider === "stripe" && (
                  <button className="btn" onClick={openPortal} disabled={busy}>{t("manageBilling")}</button>
                )}
                {sub.cancelAtPeriodEnd ? (
                  canResume ? (
                    <button className="btn primary" onClick={resumePlan} disabled={busy}>{t("resumePlan")}</button>
                  ) : (
                    <Link href="/pricing?clicked-buy-button"><button className="btn">{t("resubscribe")}</button></Link>
                  )
                ) : (
                  <button className="btn" onClick={() => setConfirmCancel(true)} disabled={busy} style={{ color: "var(--neg)" }}>{t("cancelPlan")}</button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Usage — shown for every plan; free users get a one-time trial allowance. */}
      {usage && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-h">
            <div>
              <div className="t">{isPaid ? t("dailyUsage") : t("trialUsage")}</div>
              <div className="tiny muted">
                {isPaid ? t("resetsMidnight") : trialEndsAtDate ? t("trialEndsOn", { date: formatDate(trialEndsAtDate.toISOString()) }) : t("trialEnded")}
              </div>
            </div>
            <div className="tiny muted tabular">{t("usageChecks", { used: usage.dailyUsed, limit: usage.dailyLimit })}</div>
          </div>
          <div className="bar thick"><span style={{ width: `${usedPct}%`, background: usedPct >= 100 ? "var(--neg)" : "var(--brand)" }} /></div>
          <div className="tiny muted" style={{ marginTop: 8 }}>
            {isPaid ? (
              t("usageLinePaid", { remaining: usage.dailyRemaining, limit: usage.dailyLimit })
            ) : usage.freeCheckTrialExhausted ? (
              t.rich("usageLineFreeExhausted", {
                link: (chunks) => <Link href="/pricing?clicked-buy-button" style={{ color: "var(--brand)", fontWeight: 600 }}>{chunks}</Link>,
              })
            ) : (
              t.rich("usageLineFree", {
                remaining: usage.dailyRemaining,
                limit: usage.dailyLimit,
                link: (chunks) => <Link href="/pricing?clicked-buy-button" style={{ color: "var(--brand)", fontWeight: 600 }}>{chunks}</Link>,
              })
            )}
          </div>
        </div>
      )}

      {/* AI analyses — separate allowance from daily checks, also resets at UTC midnight. */}
      {ai && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-h">
            <div>
              <div className="t">{t("aiUsage")}</div>
              <div className="tiny muted">{t("resetsMidnight")}</div>
            </div>
            <div className="tiny muted tabular">
              {ai.unlimited ? t("aiUnlimited") : t("usageAnalyses", { used: ai.used, limit: ai.limit })}
            </div>
          </div>
          {!ai.unlimited && (
            <div className="bar thick"><span style={{ width: `${aiUsedPct}%`, background: aiBarColor }} /></div>
          )}
          <div className="tiny muted" style={{ marginTop: 8 }}>
            {ai.unlimited ? (
              t("aiLineUnlimited")
            ) : ai.degrades ? (
              // Free plan: the cap doesn't block, it downgrades. Say what actually
              // happens next rather than showing a scary "0 remaining".
              t.rich(ai.remaining === 0 ? "aiLineFreeUsed" : "aiLineFree", {
                remaining: ai.remaining ?? 0,
                link: (chunks) => <Link href="/pricing?clicked-buy-button" style={{ color: "var(--brand)", fontWeight: 600 }}>{chunks}</Link>,
              })
            ) : ai.remaining === 0 ? (
              t.rich("aiLinePaidExhausted", {
                limit: ai.limit,
                link: (chunks) => <Link href="/pricing?clicked-buy-button" style={{ color: "var(--brand)", fontWeight: 600 }}>{chunks}</Link>,
              })
            ) : (
              t("aiLinePaid", { remaining: ai.remaining ?? 0, limit: ai.limit })
            )}
          </div>
        </div>
      )}

      {/* Payment history */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="card-h" style={{ padding: "14px 16px", marginBottom: 0, borderBottom: "1px solid var(--border)" }}>
          <div className="t">{t("paymentHistory")}</div>
        </div>
        {payments.length === 0 ? (
          <div style={{ padding: 36, textAlign: "center" }}>
            <span style={{ display: "inline-flex", color: "var(--text-mute)", marginBottom: 8 }}><Icon.download /></span>
            <div className="tiny muted">{t("noPayments")}</div>
            <div className="tiny muted" style={{ marginTop: 2 }}>{t("noPaymentsHint")}</div>
          </div>
        ) : (
          <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t("colDate")}</th>
                <th>{t("colDescription")}</th>
                <th>{t("colAmount")}</th>
                <th>{t("colStatus")}</th>
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

      <ConfirmDialog
        open={confirmCancel}
        title={t("cancelDialogTitle")}
        body={t("cancelDialogBody")}
        confirmLabel={t("cancelPlan")}
        cancelLabel={t("keepPlan")}
        danger
        busy={busy}
        onConfirm={cancelPlan}
        onClose={() => setConfirmCancel(false)}
      />
    </div>
  )
}

/**
 * Which billing page you get depends on which currency you spend.
 *
 * A grandfathered worker subscriber keeps `WorkerBillingPage` verbatim — the
 * tier grid, the proration preview, all of it. Everyone else, including every
 * free account, is on credits and gets the balance, statement and packs
 * instead. Branching here rather than threading `mode` through seven hundred
 * lines is what stops the grandfathered path drifting.
 *
 * A failed balance read falls through to the worker page rather than rendering
 * nothing: that page fetches its own data and will show something, and a blank
 * billing page is the worst of the three outcomes.
 */
export default function BillingPage() {
  const { credits, loading } = useCredits()
  const searchParams = useSearchParams()

  if (loading) {
    // Render a spinner rather than a default page — the two views look nothing
    // alike, and swapping one for the other after a beat is very visible.
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading billing…
      </div>
    )
  }

  if (credits?.mode === "credits") {
    return <CreditsBilling highlight={searchParams.get("plan") ?? searchParams.get("topup")} />
  }
  return <WorkerBillingPage />
}
