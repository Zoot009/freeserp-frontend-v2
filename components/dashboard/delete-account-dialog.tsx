"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Icon } from "@/components/dashboard/icons"
import { api, ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { useRouter } from "@/i18n/navigation"

/**
 * Deleting the signed-in account. A soft delete on the server: the data stays,
 * the account just can't be signed in to again.
 *
 * Typing the account's email is the confirmation — SSO and email-code accounts
 * have no password to re-enter — and the server checks it again
 * (authService.deleteAccount). Portalled to <body> because the menu that opens
 * it lives inside the header and sidebar, and a fixed overlay rendered there
 * would be positioned against them rather than the viewport. Wrapped in its own
 * .fs-app (like project-limit-modal) because every .modal-* rule and colour
 * token in dashboard.css is scoped under it — without it the popup rendered
 * unstyled at the bottom of <body>, invisible.
 */
export function DeleteAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("deleteAccount")
  const { user, logout } = useAuth()
  const router = useRouter()
  const [typed, setTyped] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setTyped("")
  }, [open])

  if (!open || !user) return null

  const matches = typed.trim().toLowerCase() === user.email.toLowerCase()

  const confirm = async () => {
    setBusy(true)
    try {
      await api.delete("/api/auth/account", { body: { email: typed } })
      toast.success(t("deleted"))
      logout()
      router.push("/login")
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("error"))
      setBusy(false)
    }
  }

  return createPortal(
    <div className="fs-app">
    <div className="modal-bg" onClick={busy ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-h">
          <div>
            <div className="eyebrow" style={{ margin: 0, fontSize: 11 }}>
              <span className="spark"><Icon.spark /></span> {t("eyebrow")}
            </div>
            <div className="b" style={{ fontSize: 18, marginTop: 4 }}>{t("title")}</div>
          </div>
          <button onClick={onClose} className="icon-btn" aria-label={t("close")} disabled={busy}>
            <Icon.close />
          </button>
        </div>

        <div className="modal-b">
          <p className="tiny muted" style={{ margin: "0 0 12px", lineHeight: 1.55 }}>{t("body")}</p>
          <label htmlFor="delete-account-email" className="tiny" style={{ display: "block", marginBottom: 6 }}>
            {t.rich("typeEmail", {
              email: user.email,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </label>
          <input
            id="delete-account-email"
            className="input"
            type="email"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches && !busy) void confirm()
            }}
            disabled={busy}
            placeholder={user.email}
            style={{ width: "100%" }}
          />
        </div>

        <div className="modal-f">
          <button className="btn" onClick={onClose} disabled={busy}>{t("cancel")}</button>
          <button
            className="btn"
            style={{ color: "var(--neg)", borderColor: "var(--neg)" }}
            disabled={!matches || busy}
            onClick={confirm}
          >
            {busy ? t("working") : t("confirm")}
          </button>
        </div>
      </div>
    </div>
    </div>,
    document.body,
  )
}
