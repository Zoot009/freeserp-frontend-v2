"use client"

/**
 * "Your plan is full" — shown INSTEAD of the create-project modal.
 *
 * Asking someone to name a domain and pick a keyword strategy, then answering
 * with a red 402 box, spends their effort to tell them something we already
 * knew before the click. This says it up front, and makes the next step the
 * thing they'd actually want (see the plans) rather than a dead end.
 *
 * Lifted out of the Rank Tracker page, which was the only screen that had it —
 * the Overview's three "Create SEO Project" entry points went straight to the
 * form. Same `dashProjects` strings, so it stays translated in every locale.
 */

import { Link } from "@/i18n/navigation"
import { useTranslations } from "next-intl"
import { Icon } from "@/components/dashboard/icons"

export function ProjectLimitModal({
  limit,
  used,
  onClose,
}: {
  /** Projects this plan allows — from /api/usage, not a constant. */
  limit: number
  /** Projects the account already owns, for the "1 of 1 used" line. */
  used?: number
  onClose: () => void
}) {
  const t = useTranslations("dashProjects")
  // `t.raw` returns undefined for a locale that hasn't translated this key yet
  // (nl carries only part of the dashProjects namespace), and mapping over that
  // would take the whole page down with it. A missing list drops the bullets;
  // the offer above them still reads.
  const features = t.raw("upgradeFeatures")
  const featureList = Array.isArray(features) ? (features as string[]) : []
  return (
    <div className="fs-app">
      <div className="modal-bg" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
          <div className="modal-h">
            <div>
              <div className="eyebrow" style={{ margin: 0, fontSize: 11 }}>
                <span className="spark"><Icon.spark /></span> {t("upgradeEyebrow")}
              </div>
              <div className="b" style={{ fontSize: 18, marginTop: 4 }}>{t("upgradeTitle")}</div>
              {/* States the count, not just the rule. "1 of 1 used" is the fact
                  the reader is checking when they read "limit reached". */}
              {used !== undefined && (
                <div className="tiny muted" style={{ marginTop: 4 }}>
                  {t("subFree", { used, limit })}
                </div>
              )}
            </div>
            <button type="button" onClick={onClose} className="icon-btn" aria-label={t("close")}>
              <Icon.close />
            </button>
          </div>
          <div className="modal-b" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="tiny muted" style={{ lineHeight: 1.6 }}>
              {t("upgradeBody", { limit })}
            </div>
            {featureList.length > 0 && (
              <div
                className="card tight"
                style={{ borderColor: "var(--brand)", background: "var(--brand-soft)", display: "flex", flexDirection: "column", gap: 8 }}
              >
                {featureList.map((f) => (
                  <div key={f} className="row" style={{ gap: 8, color: "var(--brand)", fontSize: 13 }}>
                    <Icon.check /> <span style={{ color: "var(--text)" }}>{f}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="modal-f">
            <button type="button" className="btn" onClick={onClose}>{t("notNow")}</button>
            <Link href="/pricing?clicked-buy-button">
              <button type="button" className="btn primary">{t("upgradePlan")}</button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
