"use client"

import type { ReactNode } from "react"
import { useTranslations } from "next-intl"
import { Icon } from "@/components/dashboard/icons"

// Small in-app confirmation dialog reusing the dashboard's .modal-* pattern
// (see add-workers-modal.tsx) so destructive actions don't fall back to the
// browser-native window.confirm(). Renders nothing when `open` is false.
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  body?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const t = useTranslations("confirmDialog")
  if (!open) return null

  return (
    <div className="modal-bg" onClick={busy ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-h">
          <div>
            <div className="eyebrow" style={{ margin: 0, fontSize: 11 }}>
              <span className="spark"><Icon.spark /></span> {t("eyebrow")}
            </div>
            <div className="b" style={{ fontSize: 18, marginTop: 4 }}>{title}</div>
          </div>
          <button onClick={onClose} className="icon-btn" aria-label={t("close")} disabled={busy}><Icon.close /></button>
        </div>

        {body && (
          <div className="modal-b">
            <p className="tiny muted" style={{ margin: 0, lineHeight: 1.55 }}>{body}</p>
          </div>
        )}

        <div className="modal-f">
          <button className="btn" onClick={onClose} disabled={busy}>{cancelLabel ?? t("cancel")}</button>
          <button
            className={"btn" + (danger ? "" : " primary")}
            onClick={onConfirm}
            disabled={busy}
            style={danger ? { color: "var(--neg)", borderColor: "var(--neg)" } : undefined}
          >
            {busy ? t("working") : (confirmLabel ?? t("confirm"))}
          </button>
        </div>
      </div>
    </div>
  )
}
