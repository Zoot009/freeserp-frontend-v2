"use client"

/**
 * Cancelling a paid plan, in two steps.
 *
 * Step one asks whether they mean it. Step two asks why — AFTER the decision,
 * never before it: a reason form standing between someone and the cancel button
 * they came for is a retention dark pattern, and it makes the answers worthless
 * anyway, because half of them are whatever got the form to go away fastest.
 *
 * Which is also why every part of step two can be skipped. The confirm button
 * says "Cancel plan" whether or not a reason is picked, and the cancellation
 * goes through either way. An unexplained cancellation is a fine outcome; a
 * customer who could not leave is not.
 */

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Icon } from "@/components/dashboard/icons"

/** Kept in sync with CANCELLATION_REASONS in the backend's billing.routes. */
export const CANCEL_REASONS = [
  "too_expensive",
  "missing_features",
  "not_using",
  "switched_tool",
  "data_quality",
  "technical_issues",
  "temporary",
  "other",
] as const

export type CancelReason = (typeof CANCEL_REASONS)[number]

export function CancelPlanDialog({
  open,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean
  busy: boolean
  onConfirm: (input: { reason?: CancelReason; details?: string }) => void
  onClose: () => void
}) {
  const t = useTranslations("dashBilling")
  const [step, setStep] = useState<"confirm" | "reason">("confirm")
  const [reason, setReason] = useState<CancelReason | null>(null)
  const [details, setDetails] = useState("")

  // Reopening lands on step one again. Without this, someone who backed out
  // halfway would reopen into the reason form with their half-finished answer
  // still in it, having never re-confirmed the thing the form is about.
  useEffect(() => {
    if (!open) return
    setStep("confirm")
    setReason(null)
    setDetails("")
  }, [open])

  if (!open) return null

  const asking = step === "reason"

  return (
    <div className="modal-bg" onClick={busy ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="modal-h">
          <div>
            <div className="eyebrow" style={{ margin: 0, fontSize: 11 }}>
              <span className="spark"><Icon.spark /></span> {t("cancelEyebrow")}
            </div>
            <div className="b" style={{ fontSize: 18, marginTop: 4 }}>
              {asking ? t("cancelReasonTitle") : t("cancelDialogTitle")}
            </div>
          </div>
          <button onClick={onClose} className="icon-btn" aria-label={t("close")} disabled={busy}>
            <Icon.close />
          </button>
        </div>

        <div className="modal-b">
          {asking ? (
            <>
              <p className="tiny muted" style={{ margin: "0 0 12px", lineHeight: 1.55 }}>
                {t("cancelReasonBody")}
              </p>
              <div className="col" style={{ gap: 2 }}>
                {CANCEL_REASONS.map((r) => (
                  <label
                    key={r}
                    className="row"
                    style={{
                      gap: 9,
                      alignItems: "flex-start",
                      padding: "7px 9px",
                      borderRadius: 8,
                      cursor: busy ? "default" : "pointer",
                      background: reason === r ? "var(--brand-soft)" : "transparent",
                    }}
                  >
                    <input
                      type="radio"
                      name="cancel-reason"
                      checked={reason === r}
                      onChange={() => setReason(r)}
                      disabled={busy}
                      style={{ marginTop: 2 }}
                    />
                    <span style={{ fontSize: 13 }}>{t(`cancelReason.${r}`)}</span>
                  </label>
                ))}
              </div>
              <textarea
                className="input"
                rows={3}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                disabled={busy}
                maxLength={2000}
                placeholder={t("cancelDetailsPlaceholder")}
                style={{ marginTop: 10, width: "100%", resize: "vertical" }}
              />
            </>
          ) : (
            <p className="tiny muted" style={{ margin: 0, lineHeight: 1.55 }}>
              {t("cancelDialogBody")}
            </p>
          )}
        </div>

        <div className="modal-f">
          <button className="btn" onClick={onClose} disabled={busy}>
            {t("keepPlan")}
          </button>
          <button
            className="btn"
            style={{ color: "var(--neg)", borderColor: "var(--neg)" }}
            disabled={busy}
            onClick={() =>
              asking
                ? onConfirm({ reason: reason ?? undefined, details: details.trim() || undefined })
                : setStep("reason")
            }
          >
            {busy ? t("cancelWorking") : asking ? t("cancelPlan") : t("cancelContinue")}
          </button>
        </div>
      </div>
    </div>
  )
}
