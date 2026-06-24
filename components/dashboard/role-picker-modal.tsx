"use client"

import { useState } from "react"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"

// Canonical role keys must match the backend whitelist in
// freeserp-backend/src/modules/me/me.routes.ts (setOccupationSchema) and the
// admin role-distribution labels.
const ROLE_OPTIONS: { key: string; label: string; hint: string }[] = [
  { key: "freelancer", label: "Freelancer / Consultant", hint: "I work independently for clients" },
  { key: "agency", label: "Agency", hint: "We do SEO / marketing for clients" },
  { key: "business_owner", label: "Business owner", hint: "I run my own business" },
  { key: "marketing_head", label: "Marketing manager / head", hint: "I lead marketing at a company" },
  { key: "in_house_team", label: "In-house marketing / SEO team", hint: "I'm part of an internal team" },
  { key: "other", label: "Other", hint: "Something else" },
]

/**
 * One-time required role picker. Mounted globally by the dashboard layout via
 * <RolePickerGate />, which only renders this once the user is verified and has
 * no occupationRole yet. Intentionally non-dismissable (no close button, no
 * backdrop click) — it gates the dashboard until the user answers.
 */
function RolePickerModal() {
  const { refreshUser } = useAuth()
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) {
      setError("Please pick the option that best describes you.")
      return
    }
    setError("")
    setLoading(true)
    try {
      await api.put("/api/me/occupation", { role: selected })
      // Re-reads /api/auth/me so user.occupationRole is now set and the gate closes.
      await refreshUser()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't save that — please try again.")
      setLoading(false)
    }
  }

  return (
    <div className="fs-app">
      {/* No onClick on the backdrop — the modal is required and can't be dismissed. */}
      <div className="modal-bg">
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
          <div className="modal-h">
            <div>
              <div className="eyebrow" style={{ margin: 0, fontSize: 11 }}>Welcome to FreeSERP</div>
              <div className="b" style={{ fontSize: 18, marginTop: 4 }}>Which best describes you?</div>
            </div>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="modal-b" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="tiny muted" style={{ lineHeight: 1.6 }}>
                This helps us tailor FreeSERP to how you work. You only need to answer this once.
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 10,
                }}
              >
                {ROLE_OPTIONS.map((opt) => {
                  const active = selected === opt.key
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => { setSelected(opt.key); setError("") }}
                      style={{
                        textAlign: "left",
                        padding: "12px 14px",
                        borderRadius: 10,
                        cursor: "pointer",
                        border: `1px solid ${active ? "var(--brand)" : "var(--border)"}`,
                        background: active ? "var(--brand-soft)" : "var(--bg-elev)",
                        color: active ? "var(--brand)" : "var(--text)",
                        transition: "border-color .14s, background .14s, color .14s",
                      }}
                      aria-pressed={active}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{opt.label}</div>
                      <div className="tiny" style={{ marginTop: 3, color: active ? "var(--brand)" : "var(--text-mute)" }}>
                        {opt.hint}
                      </div>
                    </button>
                  )
                })}
              </div>
              {error && (
                <div className="card tight" style={{ borderColor: "var(--neg)", background: "var(--neg-soft)", color: "var(--neg)", fontSize: 12 }}>
                  {error}
                </div>
              )}
            </div>
            <div className="modal-f">
              <button type="submit" className="btn primary" disabled={loading || !selected}>
                {loading ? "Saving…" : "Continue"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

/**
 * Decides whether to show the required role picker. Renders nothing until the
 * session resolves; opens the modal only for a verified user who hasn't picked a
 * role yet (covers email signups, Google signups, and any pre-existing accounts
 * — a one-time backfill).
 */
export function RolePickerGate() {
  const { user, loading } = useAuth()
  if (loading || !user || !user.emailVerified || user.occupationRole) return null
  return <RolePickerModal />
}
