"use client"

import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import { XCircle } from "lucide-react"

export default function BillingCancelPage() {
  const t = useTranslations("billingResult")

  return (
    <main
      className="fs-app pricing-glow"
      style={{ minHeight: "100vh", background: "var(--bg-sub)", display: "grid", placeItems: "center", padding: 24 }}
    >
      <div
        className="card pop-in"
        style={{ width: "100%", maxWidth: 440, padding: 36, textAlign: "center", boxShadow: "var(--shadow-lg)" }}
      >
        {/* Icon badge */}
        <span
          style={{
            display: "grid",
            placeItems: "center",
            width: 56,
            height: 56,
            margin: "0 auto 20px",
            borderRadius: 999,
            background: "var(--warn-soft)",
            color: "var(--warn)",
          }}
        >
          <XCircle size={28} strokeWidth={1.75} />
        </span>

        <span className="eyebrow" style={{ justifyContent: "center" }}>
          <span className="spark">◆</span> {t("eyebrow")}
        </span>

        <h1 style={{ margin: "10px 0 0", fontSize: 30, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
          {t("canceledTitle")}
        </h1>

        <p className="muted" style={{ marginTop: 12, fontSize: 14, lineHeight: 1.5, maxWidth: 360, marginInline: "auto" }}>
          {t("canceledBody")}
        </p>

        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 28, flexWrap: "wrap" }}>
          <Link href="/pricing" className="btn primary">
            {t("backToPricing")}
          </Link>
          <Link href="/dashboard" className="btn">
            {t("goToDashboard")}
          </Link>
        </div>
      </div>
    </main>
  )
}
