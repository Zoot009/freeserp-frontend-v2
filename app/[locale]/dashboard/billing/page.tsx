"use client"

import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import { toast } from "sonner"
import { api, ApiError, getAccessToken } from "@/lib/api"
import { StatTile } from "@/components/dashboard/primitives"
import { Icon } from "@/components/dashboard/icons"
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog"
import { TIERS, SEARCHES_PER_WORKER, tierPriceUsd, type BillingInterval } from "@/lib/pricing"

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

export default function BillingPage() {
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
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

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
  // Billing interval is derived from the subscription's plan slug (there is no
  // interval column) — annual subs are billed once a year at $10/worker.
  const interval: BillingInterval = sub?.plan?.slug === "workers-annual" ? "year" : "month"
  const perSuffix = interval === "year" ? t("perYearSuffix") : t("perMonthSuffix")
  // A grandfathered (pre-minimum-tier) worker count, e.g. the retired $1 tier —
  // shown as its own locked tile since it no longer matches a purchasable tier.
  const isLegacyCount = isPaid && !TIERS.some((tier) => tier.workers === currentWorkers)
  const dirty = isPaid && workers !== currentWorkers
  const searchesPerDay = workers * perWorker
  const priceUsd = tierPriceUsd(workers, interval)
  const priceDelta = tierPriceUsd(workers, interval) - tierPriceUsd(currentWorkers, interval)
  const usedPct = usage && usage.dailyLimit > 0 ? Math.min(100, Math.round((usage.dailyUsed / usage.dailyLimit) * 100)) : 0
  // Only Stripe supports resume; PayU SI mandates (and legacy Razorpay) can't be reinstated.
  const canResume = sub?.provider === "stripe"
  // Stripe flips the sub to past_due while its dunning retries run; the user's
  // plan is already degraded to free, so this must render independent of isPaid.
  const isPastDue = sub?.status === "past_due"

  const refreshMeter = () => window.dispatchEvent(new Event("usage:refresh"))

  // Live "charged now" proration preview while the tier selection is dirty.
  // Debounced; absence (PayU or a transient error) falls back to the static
  // price-difference line.
  const [preview, setPreview] = useState<WorkersPreview | null>(null)
  useEffect(() => {
    setPreview(null)
    if (!dirty) return
    const timer = setTimeout(() => {
      api
        .get<WorkersPreview>("/api/billing/workers/preview", { query: { workerCount: workers } })
        .then((p) => setPreview(p.workerCount === workers ? p : null))
        .catch(() => setPreview(null))
    }, 350)
    return () => clearTimeout(timer)
  }, [dirty, workers])

  const applyWorkerChange = async () => {
    if (!dirty) return
    setSaving(true)
    try {
      await api.patch("/api/billing/workers", { workerCount: workers })
      toast.success(t("workersUpdated", { count: workers, checks: searchesPerDay.toLocaleString() }))
      await load()
      refreshMeter()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("workersUpdateError"))
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

  const Header = (
    <div className="page-h">
      <div>
        <div className="eyebrow"><span className="spark"><Icon.spark /></span> {t("eyebrow")}</div>
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

      {trialExpiredRedirect && !isPaid && (
        <div
          className="tiny"
          style={{ marginBottom: 16, padding: "10px 14px", borderRadius: "var(--r-sm)", background: "var(--warn-soft)", color: "var(--warn)" }}
        >
          {t("trialExpiredBanner")}
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

      {/* Overview tiles */}
      <div className="grid g-4" style={{ marginBottom: 16 }}>
        <StatTile lbl={t("tilePlan")} val={isPaid ? t("workers") : t("free")} tip={isPaid ? t("tilePlanActive", { count: usage?.workerCount ?? 0 }) : t("tilePlanManual")} />
        <StatTile lbl={t("workers")} val={isPaid ? (usage?.workerCount ?? 1) : "—"} tip={isPaid ? t("tileWorkersEach", { count: perWorker }) : undefined} />
        <StatTile
          lbl={interval === "year" ? t("tileYearlyCost") : t("tileMonthlyCost")}
          val={isPaid ? `$${tierPriceUsd(currentWorkers, interval)}` : "$0"}
          tip={isPaid ? (interval === "year" ? t("tileBilledAnnually") : t("tileBilledMonthly")) : t("tileFreeForever")}
        />
        <StatTile
          lbl={isPaid ? t("tileChecksToday") : t("tileChecksTrial")}
          val={`${usage?.dailyUsed ?? 0} / ${usage?.dailyLimit ?? 0}`}
          tip={t("tileRemaining", { count: usage?.dailyRemaining ?? 0 })}
        />
      </div>

      <div className="grid g-21" style={{ marginBottom: 16, alignItems: "start" }}>
        {/* Plan & workers */}
        <div className="card">
          <div className="card-h">
            <div>
              <div className="t">{isPaid ? t("workers") : t("yourPlan")}</div>
              <div className="tiny muted">{isPaid ? t("workerCardHintPaid") : t("workerCardHintFree")}</div>
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
          ) : (
            <div>
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
                {t.rich("workerSummary", {
                  checks: searchesPerDay.toLocaleString(),
                  cost: priceUsd,
                  per: perSuffix,
                  strong: (chunks) => <span style={{ color: "var(--text)", fontWeight: 600 }}>{chunks}</span>,
                })}
              </p>
              {dirty && (
                <p className="tiny" style={{ marginTop: 8, padding: "8px 10px", borderRadius: "var(--r-sm)", background: "var(--bg-inset)" }}>
                  <span className="muted">{t("workerDeltaFrom", { from: currentWorkers, to: workers })} · </span>
                  {preview ? (
                    <span style={{ color: preview.amountDueCents >= 0 ? "var(--pos)" : "var(--neg)", fontWeight: 600 }}>
                      {t("previewChargeNow", { amount: formatMoney(preview.amountDueCents, preview.currency) })}
                    </span>
                  ) : (
                    <>
                      <span style={{ color: priceDelta >= 0 ? "var(--pos)" : "var(--neg)", fontWeight: 600 }}>
                        {priceDelta >= 0 ? "+" : "−"}${Math.abs(priceDelta)}{perSuffix}
                      </span>
                      <span className="muted">{t("workerDeltaProrated")}</span>
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
              t("usageLinePaid", { remaining: usage.dailyRemaining, count: usage.workerCount, perWorker })
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
