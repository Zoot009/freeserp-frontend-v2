"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "@/i18n/navigation"
import { api, ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { track } from "@/lib/analytics"
import { cn } from "@/lib/utils"
import {
  PRICE_PER_WORKER_USD,
  PRICE_PER_WORKER_YEAR_USD,
  SEARCHES_PER_WORKER,
  type BillingInterval,
} from "@/lib/pricing"
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Check } from "lucide-react"
import { Logo } from "@/components/brand/logo"

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
const PLAN_CARDS = [
  { workers: 5, name: "Starter" },
  { workers: 20, name: "Growth", recommended: true },
  { workers: 50, name: "Pro" },
]
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
  const [interval, setBillingInterval] = useState<BillingInterval>("year")
  const [selectedWorkers, setSelectedWorkers] = useState(20)
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

  const price = useMemo(() => {
    const perYear = selectedWorkers * PRICE_PER_WORKER_YEAR_USD
    const perMonth = selectedWorkers * PRICE_PER_WORKER_USD
    return { perYear, perMonth, monthlyEquivalent: interval === "year" ? perYear / 12 : perMonth }
  }, [selectedWorkers, interval])

  const fmt = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`)

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

  const startCheckout = async (forceMonthly = false) => {
    setError(""); setBusy(true)
    const useInterval: BillingInterval = forceMonthly ? "month" : interval
    track("flow_get_trial", { workers: selectedWorkers, interval: useInterval })
    try {
      const data = await api.post<{ url?: string }>("/api/payments/checkout", { workerCount: selectedWorkers, interval: useInterval })
      if (!data?.url) throw new Error("Couldn't start checkout — please try again.")
      window.location.href = data.url
    } catch (err) {
      if (!forceMonthly && err instanceof ApiError && err.code === "annual_unavailable") { setBillingInterval("month"); void startCheckout(true); return }
      setError(err instanceof Error ? err.message : "Couldn't start checkout — please try again.")
      setBusy(false)
    }
  }

  if (!ready) return <main className="grid min-h-screen place-items-center bg-white text-sm text-muted-foreground">Loading…</main>

  const showProgress = step <= 3
  const progressPct = (step / TOTAL_STEPS) * 100

  return (
    <main className="min-h-screen bg-white text-foreground">
      <div className="px-8 py-7">
        <Logo size={36} className="rounded-lg" />
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
            <p className="mt-2 text-sm text-muted-foreground">Your all-in-one SEO toolkit — start free, upgrade anytime.</p>

            <div className="mt-5 inline-flex rounded-full border p-1 text-sm">
              <button onClick={() => setBillingInterval("month")} className={cn("rounded-full px-4 py-1.5 font-medium transition", interval === "month" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>Monthly</button>
              <button onClick={() => setBillingInterval("year")} className={cn("rounded-full px-4 py-1.5 font-medium transition", interval === "year" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>Annual</button>
            </div>
            {interval === "year" && <span className="ml-3 text-xs font-semibold text-primary">Save ~2 months</span>}

            <div className="mt-4 grid grid-cols-3 gap-2.5">
              {PLAN_CARDS.map((p) => {
                const active = selectedWorkers === p.workers
                const perMonth = interval === "year" ? (p.workers * PRICE_PER_WORKER_YEAR_USD) / 12 : p.workers * PRICE_PER_WORKER_USD
                return (
                  <button key={p.workers} onClick={() => setSelectedWorkers(p.workers)} className={cn("relative rounded-xl border p-3.5 text-left transition-all", active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-input hover:border-muted-foreground/40")}>
                    {p.recommended && <span className="absolute -top-2 left-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">For you</span>}
                    <div className="text-sm font-semibold">{p.name}</div>
                    <div className="mt-1 text-lg font-bold">{Number.isInteger(perMonth) ? `$${perMonth}` : `$${perMonth.toFixed(2)}`}<span className="text-xs font-normal text-muted-foreground">/mo</span></div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{p.workers * SEARCHES_PER_WORKER} checks/day</div>
                  </button>
                )
              })}
            </div>

            <ul className="mt-5 space-y-2">
              {PLAN_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-foreground"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{f}</li>
              ))}
            </ul>

            <p className="mt-5 text-sm font-medium">7 days free, then {fmt(interval === "year" ? price.perYear : price.perMonth)}<span className="font-normal text-muted-foreground">{interval === "year" ? "/yr" : "/mo"} ({fmt(Math.round(price.monthlyEquivalent * 100) / 100)}/mo)</span></p>
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

            <div className="mt-4 space-y-2.5">
              <Button size="lg" className="w-full" onClick={() => startCheckout()} disabled={busy}>{busy ? "Starting…" : "Get free trial"}</Button>
              <Button size="lg" variant="secondary" className="w-full" onClick={goToDashboard} disabled={busy}>Skip trial</Button>
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground">No commitment — cancel anytime. You can also keep using the free plan.</p>
          </>
        )}
      </div>
    </main>
  )
}
