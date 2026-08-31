"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { useRouter } from "@/i18n/navigation"
import { api, ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { track } from "@/lib/analytics"
import { cn } from "@/lib/utils"
import {
  useCreditRates,
  formatCredits,
  formatPrice,
  type CreditPlan,
} from "@/lib/credits"
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Check } from "lucide-react"

const ROLE_OPTIONS = [
  { key: "business_owner", label: "Business owner / Entrepreneur" },
  { key: "marketing_head", label: "Marketing lead / Manager" },
  { key: "in_house_team", label: "Team member / Specialist" },
  { key: "freelancer", label: "Consultant / Freelancer" },
  { key: "agency", label: "Agency" },
  { key: "other", label: "Other" },
]
const OTHER_MAX = 120
const EXPERIENCE_OPTIONS = [
  { key: "guidance", label: "I need guidance for SEO tasks" },
  { key: "independent", label: "I can work independently on most tasks" },
  { key: "expert", label: "I'm an SEO / marketing expert" },
  { key: "unsure", label: "Not sure yet" },
]
const FOCUS_OPTIONS = [
  { key: "rank_tracking", label: "Rank tracking" },
  { key: "keyword_research", label: "Keyword research" },
  { key: "competitor", label: "Competitor & market analysis" },
  { key: "content", label: "Content & on-page SEO" },
  { key: "backlinks", label: "Backlinks & authority" },
  { key: "local", label: "Local SEO" },
  { key: "ai_visibility", label: "AI visibility" },
  { key: "unsure", label: "Not sure" },
]
// Display names per rate-card plan key, matching credit-pricing.tsx so the
// onboarding step and the pricing page cannot name the same tier differently.
// `recommended` is the tier the step's "For you" badge lands on — the same one
// the pricing page marks most popular.
const PLAN_COPY: Record<string, { name: string; recommended?: boolean }> = {
  "plan:credits-19": { name: "Starter" },
  "plan:credits-49": { name: "Pro", recommended: true },
  "plan:credits-99": { name: "Agency" },
}
const RECOMMENDED_PLAN_KEY = "plan:credits-49"

// Offline fallback, mirroring DEFAULT_CREDIT_RATES in the backend's
// credits/catalog.ts. GET /api/credits/rates is the source of truth; this only
// keeps the step from rendering an empty card row if that call fails.
const FALLBACK_PLANS: CreditPlan[] = [
  { key: "plan:credits-19", credits: 2000, priceCents: 1900, currency: "USD" },
  { key: "plan:credits-49", credits: 6000, priceCents: 4900, currency: "USD" },
  { key: "plan:credits-99", credits: 15000, priceCents: 9900, currency: "USD" },
]
const FALLBACK_FREE_MONTHLY = 100
const PLAN_FEATURES = [
  "Daily Google rank tracking",
  "Keyword Magic — hundreds of ideas with volume & KD",
  "Competitor & backlink analysis",
  "On-page & page-score audits",
  "AI keyword suggestions",
]
const TOTAL_STEPS = 4

// Reusable selectable card (radio / checkbox) matching the Semrush option rows.
function OptionCard({ active, control, label, onClick }: { active: boolean; control: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.() } }}
      className={cn(
        "flex cursor-pointer select-none items-center gap-3 rounded-lg border bg-background px-4 py-3.5 transition-all",
        active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-input hover:border-muted-foreground/40",
      )}
    >
      {/* Control is purely visual — the whole row's onClick owns the toggle, so
          clicks never double-fire via label→control forwarding. */}
      <span className="pointer-events-none">{control}</span>
      <span className="text-sm font-medium text-foreground">{label}</span>
    </div>
  )
}

export default function FlowPage() {
  const router = useRouter()
  const { user, loading, refreshUser } = useAuth()

  const [step, setStep] = useState(1)
  const [role, setRole] = useState<string | null>(null)
  const [otherText, setOtherText] = useState("")
  const [experience, setExperience] = useState<string | null>(null)
  const [focuses, setFocuses] = useState<string[]>([])
  const [selectedPlanKey, setSelectedPlanKey] = useState(RECOMMENDED_PLAN_KEY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (loading || ready) return
    if (!user) { router.replace("/login"); return }
    if (!user.emailVerified) { router.replace("/verify-email"); return }
    if (user.occupationRole) { router.replace("/dashboard"); return }
    setReady(true)
  }, [user, loading, ready, router])

  const needsOther = role === "other"
  const toggleFocus = (key: string) =>
    setFocuses((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))

  // Prices, credit allowances and the free monthly grant all come from the
  // same rows that get charged, so what this step quotes and what Stripe bills
  // cannot drift apart.
  const { rates, loading: ratesLoading } = useCreditRates()
  const plans = useMemo(() => {
    const list = rates?.plans?.length ? rates.plans : FALLBACK_PLANS
    // The endpoint makes no ordering promise, and a card row that is not
    // cheapest-first reads as three unrelated prices rather than one scale.
    return list.filter((p) => PLAN_COPY[p.key]).sort((a, b) => (a.priceCents ?? 0) - (b.priceCents ?? 0))
  }, [rates])
  const freeMonthly = rates?.freeMonthly ?? FALLBACK_FREE_MONTHLY
  const selectedPlan = plans.find((p) => p.key === selectedPlanKey) ?? plans[0] ?? null

  const submitRole = async () => {
    if (!role || (needsOther && !otherText.trim())) { setError("Please pick the option that best describes you."); return }
    setError(""); setBusy(true)
    try {
      await api.put("/api/me/occupation", { role, ...(needsOther ? { otherText: otherText.trim() } : {}) })
      track("flow_role", { role })
      await refreshUser()
      setStep(2)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't save that — please try again.")
    } finally { setBusy(false) }
  }

  const goToDashboard = () => router.push("/dashboard")

  // Credit tiers check out by slug — the rate card knows plans by their key,
  // and the server resolves it to a plan id. No worker count and no interval:
  // a credit plan is one flat monthly subscription.
  const startCheckout = async () => {
    if (!selectedPlan) return
    const planSlug = selectedPlan.key.replace(/^plan:/, "")
    setError(""); setBusy(true)
    track("flow_choose_plan", { plan: planSlug, credits: selectedPlan.credits })
    try {
      const data = await api.post<{ url?: string }>("/api/billing/checkout", { planSlug })
      if (!data?.url) throw new Error("Couldn't start checkout — please try again.")
      window.location.href = data.url
    } catch (err) {
      // The tier exists but has no Stripe price wired up yet — say so plainly
      // rather than leaving the button spinning on a generic failure.
      if (err instanceof ApiError && (err.code === "plan_not_purchasable" || err.code === "checkout_unconfigured")) {
        setError("This plan isn't available for purchase yet. You can keep going on the free plan.")
        setBusy(false)
        return
      }
      setError(err instanceof Error ? err.message : "Couldn't start checkout — please try again.")
      setBusy(false)
    }
  }

  if (!ready) return <main className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">Loading…</main>

  const showProgress = step <= 3
  const progressPct = (step / TOTAL_STEPS) * 100

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="px-8 py-7">
        <Image src="/logo.png" alt="FreeSERP" width={36} height={36} priority />
      </div>

      <div className="mx-auto w-full max-w-xl px-6 pb-20">
        {showProgress && (
          <div className="mb-8">
            <p className="mb-2 text-sm text-muted-foreground">Let&apos;s customize your experience</p>
            <Progress value={progressPct} className="h-1.5" />
          </div>
        )}

        {/* Step 1 — Role */}
        {step === 1 && (
          <>
            <h1 className="mb-6 text-3xl font-bold tracking-tight">What best describes your role?</h1>
            <RadioGroup value={role ?? ""} onValueChange={(v) => { setRole(v); setError("") }} className="gap-3">
              {ROLE_OPTIONS.map((opt) => (
                <OptionCard
                  key={opt.key}
                  active={role === opt.key}
                  label={opt.label}
                  onClick={() => { setRole(opt.key); setError("") }}
                  control={<RadioGroupItem value={opt.key} />}
                />
              ))}
            </RadioGroup>
            {needsOther && (
              <Input className="mt-3" autoFocus maxLength={OTHER_MAX} placeholder="Tell us your role…" value={otherText} onChange={(e) => { setOtherText(e.target.value); setError("") }} />
            )}
            {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
            <Button size="lg" className="mt-8 w-full" onClick={submitRole} disabled={busy}>{busy ? "Saving…" : "Continue"}</Button>
          </>
        )}

        {/* Step 2 — Experience */}
        {step === 2 && (
          <>
            <h1 className="mb-6 text-3xl font-bold tracking-tight">What&apos;s your experience with SEO?</h1>
            <RadioGroup value={experience ?? ""} onValueChange={setExperience} className="gap-3">
              {EXPERIENCE_OPTIONS.map((opt) => (
                <OptionCard key={opt.key} active={experience === opt.key} label={opt.label} onClick={() => setExperience(opt.key)} control={<RadioGroupItem value={opt.key} />} />
              ))}
            </RadioGroup>
            <div className="mt-8 flex gap-3">
              <Button size="lg" variant="ghost" onClick={() => setStep(1)}>Back</Button>
              <Button size="lg" className="flex-1" disabled={!experience} onClick={() => { track("flow_experience", { experience }); setStep(3) }}>Continue</Button>
            </div>
          </>
        )}

        {/* Step 3 — Focuses (multi) */}
        {step === 3 && (
          <>
            <h1 className="mb-1 text-3xl font-bold tracking-tight">What are your main focuses?</h1>
            <p className="mb-5 text-sm text-muted-foreground">Select one or several options.</p>
            <div className="grid gap-3">
              {FOCUS_OPTIONS.map((opt) => (
                <OptionCard
                  key={opt.key}
                  active={focuses.includes(opt.key)}
                  label={opt.label}
                  onClick={() => toggleFocus(opt.key)}
                  control={<Checkbox checked={focuses.includes(opt.key)} />}
                />
              ))}
            </div>
            <div className="mt-8 flex gap-3">
              <Button size="lg" variant="ghost" onClick={() => setStep(2)}>Back</Button>
              <Button size="lg" className="flex-1" disabled={focuses.length === 0} onClick={() => { track("flow_focuses", { focuses }); setStep(4) }}>Continue</Button>
            </div>
          </>
        )}

        {/* Step 4 — Plan match */}
        {step === 4 && (
          <>
            <h1 className="text-3xl font-bold tracking-tight">This is your best plan match</h1>
            <p className="mt-2 text-sm text-muted-foreground">Your all-in-one SEO toolkit — every tool runs on one credit balance.</p>

            <div className="mt-5 grid grid-cols-3 gap-2.5">
              {ratesLoading && plans.length === 0
                ? [0, 1, 2].map((i) => <div key={i} className="h-[86px] animate-pulse rounded-xl border border-input bg-muted/40" />)
                : plans.map((plan) => {
                    const copy = PLAN_COPY[plan.key]
                    const active = selectedPlan?.key === plan.key
                    return (
                      <button key={plan.key} onClick={() => setSelectedPlanKey(plan.key)} className={cn("relative rounded-xl border p-3.5 text-left transition-all", active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-input hover:border-muted-foreground/40")}>
                        {copy.recommended && <span className="absolute -top-2 left-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">For you</span>}
                        <div className="text-sm font-semibold">{copy.name}</div>
                        <div className="mt-1 text-lg font-bold">{formatPrice(plan.priceCents, plan.currency)}<span className="text-xs font-normal text-muted-foreground">/mo</span></div>
                        <div className="mt-1 text-[11px] text-muted-foreground">{formatCredits(plan.credits)} credits/mo</div>
                      </button>
                    )
                  })}
            </div>

            <ul className="mt-5 space-y-2">
              {PLAN_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-foreground"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{f}</li>
              ))}
            </ul>

            {selectedPlan && (
              <p className="mt-5 text-sm font-medium">
                {formatPrice(selectedPlan.priceCents, selectedPlan.currency)}<span className="font-normal text-muted-foreground">/month — {formatCredits(selectedPlan.credits)} credits, refilled every month.</span>
              </p>
            )}
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

            <div className="mt-4 space-y-2.5">
              <Button size="lg" className="w-full" onClick={() => startCheckout()} disabled={busy || !selectedPlan}>{busy ? "Starting…" : selectedPlan ? `Continue with ${PLAN_COPY[selectedPlan.key].name}` : "Continue"}</Button>
              <Button size="lg" variant="secondary" className="w-full" onClick={goToDashboard} disabled={busy}>Start free with {formatCredits(freeMonthly)} credits/month</Button>
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground">No commitment — cancel anytime. The free plan keeps working, and you can upgrade whenever you need more credits.</p>
          </>
        )}
      </div>
    </main>
  )
}
