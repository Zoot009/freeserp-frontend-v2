"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { useRouter } from "@/i18n/navigation"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { track } from "@/lib/analytics"
import {
  PRICE_PER_WORKER_USD,
  PRICE_PER_WORKER_YEAR_USD,
  SEARCHES_PER_WORKER,
  type BillingInterval,
} from "@/lib/pricing"

// ── Step 1: role. Keys MUST match the backend whitelist (me.routes setOccupationSchema)
//    so the answer persists and the dashboard onboarding gate is satisfied. ──
const ROLE_OPTIONS: { key: string; label: string }[] = [
  { key: "business_owner", label: "Business owner / Entrepreneur" },
  { key: "marketing_head", label: "Marketing lead / Manager" },
  { key: "in_house_team", label: "In-house team / Specialist" },
  { key: "freelancer", label: "Consultant / Freelancer" },
  { key: "agency", label: "Agency" },
  { key: "other", label: "Other" },
]
const OTHER_MAX = 120

// ── Step 2: experience (tracked only, no DB field yet). ──
const EXPERIENCE_OPTIONS: { key: string; label: string }[] = [
  { key: "guidance", label: "I need guidance for SEO tasks" },
  { key: "independent", label: "I can work independently on most tasks" },
  { key: "expert", label: "I'm an SEO / marketing expert" },
  { key: "unsure", label: "Not sure yet" },
]

// ── Step 3: focuses (multi-select, tracked only). Tailored to FreeSERP's features. ──
const FOCUS_OPTIONS: { key: string; label: string }[] = [
  { key: "rank_tracking", label: "Rank tracking" },
  { key: "keyword_research", label: "Keyword research" },
  { key: "competitor", label: "Competitor & market analysis" },
  { key: "content", label: "Content & on-page SEO" },
  { key: "backlinks", label: "Backlinks & authority" },
  { key: "local", label: "Local SEO" },
  { key: "ai_visibility", label: "AI visibility" },
  { key: "unsure", label: "Not sure" },
]

// ── Step 4: plans. Our pricing is a "workers" model ($1/worker/mo = 15 checks/day),
//    presented here as three named cards. The middle one is the recommendation. ──
const PLAN_CARDS: { workers: number; name: string; blurb: string; recommended?: boolean }[] = [
  { workers: 5, name: "Starter", blurb: "For a single site and light tracking" },
  { workers: 20, name: "Growth", blurb: "For serious daily SEO work", recommended: true },
  { workers: 50, name: "Pro", blurb: "For agencies and multiple sites" },
]

const PLAN_FEATURES = [
  "Daily Google rank tracking",
  "Keyword Magic — hundreds of ideas with volume & KD",
  "Competitor & backlink analysis",
  "On-page & page-score audits",
  "AI keyword suggestions",
]

const TOTAL_STEPS = 4

export default function FlowPage() {
  const router = useRouter()
  const { user, loading, refreshUser } = useAuth()

  const [step, setStep] = useState(1)
  const [role, setRole] = useState<string | null>(null)
  const [otherText, setOtherText] = useState("")
  const [experience, setExperience] = useState<string | null>(null)
  const [focuses, setFocuses] = useState<string[]>([])
  const [interval, setBillingInterval] = useState<BillingInterval>("year") // Annual by default
  const [selectedWorkers, setSelectedWorkers] = useState(20) // recommended tier
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  // Same guard the onboarding page uses: only an unanswered, verified user belongs
  // here. (occupationRole is set at the end of step 1, so a returning user who
  // already finished is routed to the dashboard.)
  useEffect(() => {
    if (loading) return
    if (!user) router.push("/login")
    else if (!user.emailVerified) router.push("/verify-email")
    else if (user.occupationRole) router.push("/dashboard/projects")
  }, [user, loading, router])

  const needsOther = role === "other"
  const toggleFocus = (key: string) =>
    setFocuses((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))

  // Price of the selected tier for the chosen interval.
  const price = useMemo(() => {
    const perYear = selectedWorkers * PRICE_PER_WORKER_YEAR_USD
    const perMonth = selectedWorkers * PRICE_PER_WORKER_USD
    const monthlyEquivalent = interval === "year" ? perYear / 12 : perMonth
    return {
      perYear,
      perMonth,
      monthlyEquivalent,
      checksPerDay: selectedWorkers * SEARCHES_PER_WORKER,
    }
  }, [selectedWorkers, interval])

  const fmt = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`)

  // ── Actions ──────────────────────────────────────────────────────────────
  const submitRole = async () => {
    if (!role || (needsOther && !otherText.trim())) {
      setError("Please pick the option that best describes you.")
      return
    }
    setError("")
    setBusy(true)
    try {
      await api.put("/api/me/occupation", {
        role,
        ...(needsOther ? { otherText: otherText.trim() } : {}),
      })
      track("flow_role", { role })
      await refreshUser() // sets occupationRole so the dashboard gate passes later
      setStep(2)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't save that — please try again.")
    } finally {
      setBusy(false)
    }
  }

  const goToDashboard = () => router.push("/dashboard/projects")

  const startCheckout = async () => {
    setError("")
    setBusy(true)
    track("flow_get_trial", { workers: selectedWorkers, interval })
    try {
      const data = await api.post<{ url?: string }>("/api/payments/checkout", {
        workerCount: selectedWorkers,
        interval,
      })
      if (data?.url) {
        window.location.href = data.url
        return
      }
      goToDashboard() // no URL returned — don't trap the user
    } catch {
      // Checkout unavailable (e.g. annual+PayU region) — fall through to the app;
      // they can still upgrade later from /pricing.
      goToDashboard()
    }
  }

  // Don't flash the wizard while the session resolves or while redirecting away.
  if (loading || !user || !user.emailVerified || user.occupationRole) {
    return (
      <main className="min-h-screen grid place-items-center bg-white text-slate-400 text-sm">
        Loading…
      </main>
    )
  }

  const showProgress = step <= 3
  const progressPct = (step / TOTAL_STEPS) * 100

  return (
    <main className="min-h-screen bg-white text-slate-900 flex flex-col px-6 sm:px-10 py-7">
      {/* Top bar */}
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl shadow-sm">
          <Image src="/logo.png" alt="FreeSERP" width={32} height={32} />
        </span>
        <span className="font-semibold text-slate-900">FreeSERP</span>
      </div>

      <div className="flex-1 flex items-start justify-center mt-8 sm:mt-14">
        <div className="w-full max-w-xl">
          {/* Progress */}
          {showProgress && (
            <div className="mb-7">
              <div className="text-xs font-medium text-slate-500 mb-2">Let&apos;s customize your experience</div>
              <div className="h-1 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {/* ── Step 1: Role ─────────────────────────────────────────────── */}
          {step === 1 && (
            <>
              <h1 className="text-3xl font-bold tracking-tight">What best describes your role?</h1>
              <div className="mt-6 space-y-3">
                {ROLE_OPTIONS.map((opt) => (
                  <OptionRow
                    key={opt.key}
                    label={opt.label}
                    active={role === opt.key}
                    type="radio"
                    onClick={() => { setRole(opt.key); setError("") }}
                  />
                ))}
                {needsOther && (
                  <input
                    type="text"
                    autoFocus
                    maxLength={OTHER_MAX}
                    placeholder="Tell us your role…"
                    value={otherText}
                    onChange={(e) => { setOtherText(e.target.value); setError("") }}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                )}
              </div>
              {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
              <NavButtons onNext={submitRole} nextLabel="Continue" busy={busy} />
            </>
          )}

          {/* ── Step 2: Experience ───────────────────────────────────────── */}
          {step === 2 && (
            <>
              <h1 className="text-3xl font-bold tracking-tight">What&apos;s your experience with SEO?</h1>
              <div className="mt-6 space-y-3">
                {EXPERIENCE_OPTIONS.map((opt) => (
                  <OptionRow
                    key={opt.key}
                    label={opt.label}
                    active={experience === opt.key}
                    type="radio"
                    onClick={() => setExperience(opt.key)}
                  />
                ))}
              </div>
              <NavButtons
                onBack={() => setStep(1)}
                onNext={() => { track("flow_experience", { experience }); setStep(3) }}
                nextLabel="Continue"
                nextDisabled={!experience}
              />
            </>
          )}

          {/* ── Step 3: Focuses (multi) ──────────────────────────────────── */}
          {step === 3 && (
            <>
              <h1 className="text-3xl font-bold tracking-tight">What are your main focuses?</h1>
              <p className="mt-2 text-sm text-slate-500">Select one or several options.</p>
              <div className="mt-5 space-y-3">
                {FOCUS_OPTIONS.map((opt) => (
                  <OptionRow
                    key={opt.key}
                    label={opt.label}
                    active={focuses.includes(opt.key)}
                    type="checkbox"
                    onClick={() => toggleFocus(opt.key)}
                  />
                ))}
              </div>
              <NavButtons
                onBack={() => setStep(2)}
                onNext={() => { track("flow_focuses", { focuses }); setStep(4) }}
                nextLabel="Continue"
                nextDisabled={focuses.length === 0}
              />
            </>
          )}

          {/* ── Step 4: Plan match ───────────────────────────────────────── */}
          {step === 4 && (
            <div className="pb-10">
              <h1 className="text-3xl font-bold tracking-tight">This is your best plan match</h1>
              <p className="mt-2 text-sm text-slate-500">Your all-in-one SEO toolkit — start free, upgrade anytime.</p>

              {/* Interval toggle — Annual default */}
              <div className="mt-5 flex items-center gap-3">
                <div className="inline-flex rounded-full border border-slate-200 p-1 text-sm">
                  <button
                    type="button"
                    onClick={() => setBillingInterval("month")}
                    className={`px-4 py-1.5 rounded-full font-medium transition ${interval === "month" ? "bg-slate-900 text-white" : "text-slate-600"}`}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingInterval("year")}
                    className={`px-4 py-1.5 rounded-full font-medium transition ${interval === "year" ? "bg-slate-900 text-white" : "text-slate-600"}`}
                  >
                    Annual
                  </button>
                </div>
                {interval === "year" && (
                  <span className="text-xs font-semibold text-emerald-600">Save ~2 months</span>
                )}
              </div>

              {/* Plan cards */}
              <div className="mt-4 grid grid-cols-3 gap-2.5">
                {PLAN_CARDS.map((p) => {
                  const active = selectedWorkers === p.workers
                  const perMonth = interval === "year" ? (p.workers * PRICE_PER_WORKER_YEAR_USD) / 12 : p.workers * PRICE_PER_WORKER_USD
                  return (
                    <button
                      key={p.workers}
                      type="button"
                      onClick={() => setSelectedWorkers(p.workers)}
                      className={`relative text-left rounded-2xl border p-3.5 transition-all ${active ? "border-blue-500 bg-blue-50 ring-4 ring-blue-100" : "border-slate-200 hover:border-slate-300"}`}
                    >
                      {p.recommended && (
                        <span className="absolute -top-2 left-3 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                          For you
                        </span>
                      )}
                      <div className="text-sm font-semibold text-slate-900">{p.name}</div>
                      <div className="mt-1 text-lg font-bold text-slate-900">
                        {Number.isInteger(perMonth) ? `$${perMonth}` : `$${perMonth.toFixed(2)}`}
                        <span className="text-xs font-normal text-slate-500">/mo</span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">{p.workers * SEARCHES_PER_WORKER} checks/day</div>
                    </button>
                  )
                })}
              </div>

              {/* Feature list */}
              <ul className="mt-5 space-y-2">
                {PLAN_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                    <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" /></svg>
                    {f}
                  </li>
                ))}
              </ul>

              <p className="mt-5 text-sm font-medium text-slate-900">
                7 days free, then {fmt(interval === "year" ? price.perYear : price.perMonth)}
                <span className="font-normal text-slate-500">{interval === "year" ? "/yr" : "/mo"} ({fmt(Math.round(price.monthlyEquivalent * 100) / 100)}/mo)</span>
              </p>

              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

              <div className="mt-4 space-y-2.5">
                <button
                  type="button"
                  onClick={startCheckout}
                  disabled={busy}
                  className="w-full rounded-xl bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 transition"
                >
                  {busy ? "Starting…" : "Get free trial"}
                </button>
                <button
                  type="button"
                  onClick={goToDashboard}
                  disabled={busy}
                  className="w-full rounded-xl bg-slate-100 px-6 py-3.5 text-sm font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-60 transition"
                >
                  Skip trial
                </button>
              </div>
              <p className="mt-3 text-center text-xs text-slate-400">
                No commitment — cancel anytime. You can also keep using the free plan.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

// ── Small building blocks ─────────────────────────────────────────────────
function OptionRow({
  label, active, type, onClick,
}: { label: string; active: boolean; type: "radio" | "checkbox"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-all ${
        active ? "border-blue-500 bg-blue-50 ring-4 ring-blue-100" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <span
        className={`flex-shrink-0 grid place-items-center h-5 w-5 border transition ${
          type === "radio" ? "rounded-full" : "rounded-md"
        } ${active ? "border-blue-600 bg-blue-600" : "border-slate-300"}`}
      >
        {active && (
          type === "radio"
            ? <span className="h-2 w-2 rounded-full bg-white" />
            : <svg className="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" /></svg>
        )}
      </span>
      <span className={`text-sm font-medium ${active ? "text-blue-800" : "text-slate-800"}`}>{label}</span>
    </button>
  )
}

function NavButtons({
  onNext, onBack, nextLabel, nextDisabled, busy,
}: { onNext: () => void; onBack?: () => void; nextLabel: string; nextDisabled?: boolean; busy?: boolean }) {
  return (
    <div className="mt-8 flex items-center gap-3">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="rounded-xl px-5 py-3 text-sm font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-60 transition"
        >
          Back
        </button>
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled || busy}
        className="flex-1 rounded-xl bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40 transition"
      >
        {busy ? "Saving…" : nextLabel}
      </button>
    </div>
  )
}
