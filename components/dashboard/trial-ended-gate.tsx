"use client"

// Hard paywall for free users whose one-time trial is over: replaces the page
// content on every dashboard route with a single conversion surface.
//
// This is a UX gate, NOT a security boundary. Every spend path is already
// enforced server-side (402 `free_trial_exhausted` from rankings.service /
// serpCheck.service, and the scheduler refuses to queue). Someone bypassing this
// component in devtools gets a blocked API, not free checks — so it is free to be
// permissive where blocking would trap the user.
//
// Deliberately NOT applied to billing and settings: the gate exists to route
// people to a plan, so locking them out of the page that sells plans (or the one
// with account controls and sign-out) would be self-defeating. The sidebar and
// topbar stay mounted too — only the page body is replaced.

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

  // Render children until usage is known, so paid users never see a flash of the
  // gate on a slow request.
  const blocked =
    usage?.plan === "free" &&
    usage.freeCheckTrialExhausted &&
    !ALLOWED.some((p) => pathname.startsWith(p))

  if (!blocked) return <>{children}</>

  const canExtend = usage?.freeTrialExtensionAvailable === true

  return (
    <div className="page">
      <div
        className="card"
        style={{ maxWidth: 520, margin: "48px auto", textAlign: "center", padding: "32px 28px" }}
      >
        <div
          aria-hidden
          style={{
            width: 44, height: 44, margin: "0 auto 16px", borderRadius: "50%",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            background: "var(--warn-soft)", color: "var(--warn)",
          }}
        >
          <Icon.key />
        </div>

        <div className="b" style={{ fontSize: 20, marginBottom: 8 }}>{t("title")}</div>
        <p className="tiny muted" style={{ lineHeight: 1.65, marginBottom: 20 }}>
          {canExtend ? t("bodyCanExtend") : t("body")}
        </p>

        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          {canExtend && (
            <button type="button" className="btn" onClick={extend} disabled={busy}>
              {busy ? t("working") : t("extendCta")}
            </button>
          )}
          <Link href="/dashboard/billing">
            <button type="button" className="btn primary">{t("plansCta")}</button>
          </Link>
        </div>

        {usage?.freeTrialExtended && (
          <div className="tiny muted" style={{ marginTop: 16, opacity: 0.8 }}>
            {t("alreadyExtended")}
          </div>
        )}
      </div>
    </div>
  )
}
