"use client"

// Hard paywall for free users whose one-time trial is over: a non-dismissible
// modal over a blurred, non-interactive copy of the whole app. The page content
// stays mounted underneath on purpose — seeing your own projects go soft behind
// the card is the pitch. Styles live in app/dashboard.css (.trial-gate*).
//
// This is a UX gate, NOT a security boundary. Every spend path is already
// enforced server-side (402 `free_trial_exhausted` from rankings.service /
// serpCheck.service, and the scheduler refuses to queue). Someone removing this
// component in devtools gets a blocked API, not free checks — so it is free to
// be permissive wherever blocking would trap the user.
//
// Deliberately NOT applied to billing and settings: the gate exists to route
// people to a plan, so covering the page that sells plans (or the one with
// account controls and sign-out) would be self-defeating.

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Link, usePathname } from "@/i18n/navigation"
import { api, ApiError, getAccessToken } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"

interface UsageInfo {
  plan: string
  freeCheckTrialExhausted: boolean
  freeTrialExtensionAvailable?: boolean
  freeTrialExtended?: boolean
}

// Routes that must stay reachable, or the gate becomes a trap with no way to pay.
const ALLOWED = ["/dashboard/billing", "/dashboard/settings"]

export function TrialEndedGate({ children }: { children: React.ReactNode }) {
  const t = useTranslations("trialGate")
  const pathname = usePathname()
  const [usage, setUsage] = useState<UsageInfo | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!getAccessToken()) return
    try {
      setUsage(await api.get<UsageInfo>("/api/usage"))
    } catch {
      // A usage outage must not lock the whole product. Fail open — the backend
      // still refuses the actual spend either way.
    }
  }, [])

  useEffect(() => {
    void load()
    const onRefresh = () => void load()
    window.addEventListener("usage:refresh", onRefresh)
    return () => window.removeEventListener("usage:refresh", onRefresh)
  }, [load])

  // `usage` starts null, so children render until we know — a paid user never
  // sees a flash of the gate on a slow request.
  const blocked =
    usage?.plan === "free" &&
    usage.freeCheckTrialExhausted &&
    !ALLOWED.some((p) => pathname.startsWith(p))

  // The page behind the gate is blurred and unreachable, so let it not scroll
  // either — otherwise a wheel gesture slides content around under the card.
  useEffect(() => {
    if (!blocked) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [blocked])

  const extend = async () => {
    setBusy(true)
    try {
      const { extension } = await api.post<{ extension: { days: number; checks: number } }>(
        "/api/billing/trial/extend",
      )
      toast.success(t("extendSuccess", { days: extension.days, checks: extension.checks }))
      await load() // lifts the gate in place once the server confirms
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("extendError"))
    } finally {
      setBusy(false)
    }
  }

  if (!blocked) return <>{children}</>

  const canExtend = usage?.freeTrialExtensionAvailable === true

  return (
    <>
      {/* Left mounted so the blur has something real to frost, but hidden from
          assistive tech and tab order — behind the gate it is not usable.
          The blur is applied HERE, with `filter` on the subtree, rather than via
          `backdrop-filter` on the overlay: backdrop-filter only frosts what is
          actually painted beneath the element and is silently defeated by an
          ancestor that establishes a containing block, whereas filtering the
          subtree itself is unconditional. */}
      <div className="trial-gate-blur" aria-hidden inert>
        {children}
      </div>

      <div className="trial-gate-bg" role="dialog" aria-modal="true" aria-labelledby="trial-gate-title">
        <div className="trial-gate">
          <div className="trial-gate-eyebrow">
            <Icon.clock size={13} /> {t("eyebrow")}
          </div>

          <h2 id="trial-gate-title" className="trial-gate-title">{t("title")}</h2>

          <p className="trial-gate-body">{canExtend ? t("bodyCanExtend") : t("body")}</p>

          <div className="trial-gate-actions">
            <Link href="/pricing?clicked-buy-button">
              <button type="button" className="btn primary">{t("plansCta")}</button>
            </Link>
            {canExtend && (
              <button type="button" className="btn ghost" onClick={extend} disabled={busy}>
                {busy ? t("working") : t("extendCta")}
              </button>
            )}
          </div>

          {usage?.freeTrialExtended && (
            <div className="trial-gate-note">{t("alreadyExtended")}</div>
          )}
        </div>
      </div>
    </>
  )
}
