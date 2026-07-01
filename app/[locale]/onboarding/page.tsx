"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { useRouter } from "@/i18n/navigation"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { track } from "@/lib/analytics"

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

const OTHER_MAX = 120

/**
 * One-time required onboarding role page. The dashboard shell redirects verified
 * users here while occupationRole is null; once answered it can't be revisited
 * (the guard below sends answered users back to the dashboard). When "Other" is
 * picked, a free-text description is captured and stored separately.
 */
export default function OnboardingPage() {
  const router = useRouter()
  const { user, loading, refreshUser } = useAuth()
  const [selected, setSelected] = useState<string | null>(null)
  const [otherText, setOtherText] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  // Same gate the dashboard shell uses, in reverse: only an unanswered, verified
  // user belongs here. Everyone else is routed away so the page is truly one-time.
  useEffect(() => {
    if (loading) return
    if (!user) router.push("/login")
    else if (!user.emailVerified) router.push("/verify-email")
    else if (user.occupationRole) router.push("/dashboard/projects")
  }, [user, loading, router])

  const needsOther = selected === "other"
  const canSubmit = !!selected && (!needsOther || otherText.trim().length > 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) {
      setError("Please pick the option that best describes you.")
      return
    }
    setError("")
    setSaving(true)
    try {
      await api.put("/api/me/occupation", {
        role: selected,
        ...(needsOther ? { otherText: otherText.trim() } : {}),
      })
      track("onboarding_completed", { role: selected })
      // Re-reads /api/auth/me so user.occupationRole is now set; the guard above
      // (and the dashboard shell) then treat onboarding as complete.
      await refreshUser()
      router.push("/dashboard/projects")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't save that — please try again.")
      setSaving(false)
    }
  }

  // Don't flash the form while the session resolves or while redirecting away.
  if (loading || !user || !user.emailVerified || user.occupationRole) {
    return (
      <main className="min-h-screen grid place-items-center bg-white text-slate-400 text-sm">
        Loading…
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white text-slate-900 flex flex-col px-6 sm:px-10 lg:px-16 py-8">
      {/* Top bar */}
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl shadow-sm">
          <Image src="/logo.png" alt="FreeSERP Logo" width={32} height={32} />
        </span>
        <span className="font-semibold text-slate-900">FreeSERP</span>
      </div>

      {/* Form area */}
      <div className="flex-1 flex items-center justify-center mt-10 lg:mt-0">
        <div className="w-full max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 uppercase tracking-wider">
            <span className="text-blue-500">★</span> Welcome to FreeSERP
          </span>
          <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            Which best describes you?
          </h1>
          <p className="mt-2 text-slate-500">
            This helps us tailor FreeSERP to how you work. You only need to answer this once.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div className="grid sm:grid-cols-2 gap-3">
              {ROLE_OPTIONS.map((opt) => {
                const active = selected === opt.key
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => { setSelected(opt.key); setError("") }}
                    aria-pressed={active}
                    className={`text-left rounded-2xl border px-4 py-3 transition-all duration-200 ${
                      active
                        ? "border-blue-500 bg-blue-50 ring-4 ring-blue-100"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                    }`}
                  >
                    <div className={`text-sm font-semibold ${active ? "text-blue-700" : "text-slate-900"}`}>
                      {opt.label}
                    </div>
                    <div className={`mt-0.5 text-xs ${active ? "text-blue-600" : "text-slate-500"}`}>
                      {opt.hint}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Free-text detail, required only for "Other" */}
            {needsOther && (
              <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2">
                <label htmlFor="otherText" className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Tell us your role
                </label>
                <input
                  id="otherText"
                  type="text"
                  autoFocus
                  required
                  maxLength={OTHER_MAX}
                  placeholder="e.g. SEO educator, affiliate marketer…"
                  value={otherText}
                  onChange={(e) => { setOtherText(e.target.value); setError("") }}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all duration-200"
                />
              </div>
            )}

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="pt-1">
              <button
                type="submit"
                disabled={saving || !canSubmit}
                className="w-full sm:w-auto rounded-2xl bg-blue-600 px-8 py-3 text-sm font-semibold text-white shadow-md shadow-blue-600/20 hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/30 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-md transition-all duration-200"
              >
                {saving ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    Saving…
                  </span>
                ) : (
                  "Continue"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  )
}
