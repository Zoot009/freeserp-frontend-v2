"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { BarChart3, Gauge, Globe, KeyRound, LayoutTemplate, Link2, Plus, Radar, ShieldCheck, X, Zap } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { api, ApiError } from "@/lib/api"
import { BUY_CREDITS_HREF, CREDIT_ACTION_KEYS } from "@/lib/credits"
import { host, type AnalysisListItem, type AnalysisStatus } from "@/lib/ads-analysis"
import { knownGeoCountry, prefetchGeoCountry } from "@/hooks/use-geo-country"
import { LocationPicker } from "@/components/location-picker"
import { CreditCost } from "@/components/dashboard/credit-cost"
import { ReportHistory } from "@/components/dashboard/report-history"

const HISTORY_STATUS: Record<AnalysisStatus, "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"> = {
  QUEUED: "PENDING",
  RUNNING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
}

const MAX_SERVICES = 10

const COVERS = [
  { icon: LayoutTemplate, tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400", title: "Landing pages", text: "A page per service, with phone, form and call to action above the fold" },
  { icon: Radar, tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400", title: "Tracking", text: "Google Ads tag and conversions, GA4, Tag Manager, call tracking" },
  { icon: Gauge, tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", title: "Speed & mobile", text: "PageSpeed and Core Web Vitals on mobile, layout problems" },
  { icon: KeyRound, tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400", title: "Keywords & costs", text: "Ad groups, searches and cost per click where you advertise" },
  { icon: BarChart3, tone: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400", title: "Budget forecast", text: "Clicks, leads and cost per lead as ranges, and your break-even" },
  { icon: ShieldCheck, tone: "bg-slate-500/10 text-slate-600 dark:text-slate-300", title: "Technical", text: "SSL, https redirect, broken links, insecure content" },
]

const box =
  "flex h-11 items-center gap-2.5 rounded-xl border border-border bg-background px-3 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20"
const inputCls = "h-full w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
const label = "mb-1.5 block text-xs font-medium text-muted-foreground"

export default function AdsAnalysisPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const tc = useTranslations("credits")

  const [url, setUrl] = useState("")
  const [location, setLocation] = useState(() => knownGeoCountry() ?? "")
  const locationTouched = useRef(false)
  const [services, setServices] = useState<string[]>([])
  const [draft, setDraft] = useState("")
  const [pages, setPages] = useState<Record<string, string>>({})
  const [showPages, setShowPages] = useState(false)
  const [budget, setBudget] = useState("")
  const [jobValue, setJobValue] = useState("")
  const [starting, setStarting] = useState(false)
  const submittingRef = useRef(false)
  const [error, setError] = useState("")
  const [shortOfCredits, setShortOfCredits] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) router.push("/login")
  }, [user, authLoading, router])

  useEffect(() => {
    prefetchGeoCountry().then((c) => {
      if (c && !locationTouched.current) setLocation((l) => l || c)
    })
  }, [])

  const addService = (raw: string) => {
    const parts = raw.split(/[,\n]/).map((s) => s.trim().replace(/\s+/g, " ")).filter((s) => s.length >= 2)
    setServices((cur) => {
      const next = [...cur]
      for (const p of parts) if (next.length < MAX_SERVICES && !next.some((s) => s.toLowerCase() === p.toLowerCase())) next.push(p.slice(0, 60))
      return next
    })
    setDraft("")
  }

  const start = async () => {
    setError("")
    setShortOfCredits(false)
    const all = draft.trim() ? [...services, draft.trim()].slice(0, MAX_SERVICES) : services
    if (!url.trim()) return setError("Enter your website address.")
    if (!location) return setError("Choose where your ads will run.")
    if (!all.length) return setError("Add at least one service you want to advertise.")
    if (submittingRef.current) return
    submittingRef.current = true
    setStarting(true)
    try {
      const n = (s: string) => (s.trim() && Number.isFinite(Number(s)) ? Math.max(0, Number(s)) : null)
      const servicePages = Object.fromEntries(Object.entries(pages).filter(([k, v]) => all.includes(k) && v.trim()))
      const { analysis } = await api.post<{ analysis: { id: string } }>("/api/ads-analysis", {
        url: url.trim(),
        location,
        services: all,
        servicePages: Object.keys(servicePages).length ? servicePages : null,
        budgetUsd: n(budget),
        jobValueUsd: n(jobValue),
      })
      router.push(`/dashboard/ads-analysis/${analysis.id}`)
    } catch (err) {
      setShortOfCredits(err instanceof ApiError && err.code === "insufficient_credits")
      setError(err instanceof Error && err.message ? err.message : "Couldn't start the analysis. Please try again.")
      setStarting(false)
      submittingRef.current = false
    }
  }

  if (authLoading) {
    return (
      <div className="page" style={{ color: "var(--text-mute)", fontSize: 13, padding: 60, textAlign: "center" }}>
        Loading…
      </div>
    )
  }
  if (!user) return null

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Google Ads Analysis</h1>
          <div className="sub">
            Is your site ready to spend money on Google Ads? We check each service&apos;s landing page, your tracking, speed and mobile layout, price the keywords
            where you advertise, and forecast what a budget buys.
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,.04)] sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <label className="block">
            <span className={label}>Website</span>
            <span className={box}>
              <Globe className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <input
                className={inputCls}
                placeholder="yourbusiness.com"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                maxLength={2048}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </span>
          </label>
          <div>
            <span className={label}>Where your ads will run</span>
            <LocationPicker
              value={location}
              onChange={(code) => {
                locationTouched.current = true
                setLocation(code)
              }}
              variant="dashboard"
              showFlags
              placeholder="Search a country or city"
            />
          </div>
        </div>

        <div className="mt-3">
          <span className={label}>
            Services to advertise <span className="font-normal">({services.length}/{MAX_SERVICES})</span>
          </span>
          <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-border bg-background px-2 py-1.5 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
            {services.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 rounded-lg bg-brand/10 py-1 pl-2.5 pr-1 text-[13px] font-medium text-brand">
                {s}
                <button
                  type="button"
                  aria-label={`Remove ${s}`}
                  onClick={() => setServices((cur) => cur.filter((x) => x !== s))}
                  className="grid h-5 w-5 place-items-center rounded hover:bg-brand/15"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {services.length < MAX_SERVICES && (
              <input
                className="h-8 min-w-[180px] flex-1 bg-transparent px-1.5 text-sm outline-none placeholder:text-muted-foreground"
                placeholder={services.length ? "Add another…" : "e.g. drain cleaning, water heater repair"}
                maxLength={60}
                value={draft}
                onChange={(e) => (e.target.value.includes(",") ? addService(e.target.value) : setDraft(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    if (draft.trim()) addService(draft)
                  } else if (e.key === "Backspace" && !draft && services.length) setServices((cur) => cur.slice(0, -1))
                }}
                onBlur={() => draft.trim() && addService(draft)}
              />
            )}
          </div>
          <span className="mt-1 block text-[11px] text-muted-foreground">Press Enter or a comma after each one. We find each service&apos;s page on your site.</span>
        </div>

        {services.length > 0 && (
          <div className="mt-3">
            <button type="button" onClick={() => setShowPages((v) => !v)} className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
              {showPages ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />} Already have a page for a service? Point us to it
            </button>
            {showPages && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {services.map((s) => (
                  <label key={s} className="block">
                    <span className="mb-1 block text-[11px] text-muted-foreground">{s}</span>
                    <span className={`${box} h-9`}>
                      <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <input
                        className={inputCls}
                        placeholder={url.trim() ? `${host(url.includes("://") ? url : `https://${url}`)}/…` : "/service-page"}
                        maxLength={2048}
                        value={pages[s] ?? ""}
                        onChange={(e) => setPages((p) => ({ ...p, [s]: e.target.value }))}
                      />
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block">
            <span className={label}>
              Monthly budget, USD <span className="font-normal">(optional)</span>
            </span>
            <span className={box}>
              <span className="text-sm text-muted-foreground">$</span>
              <input className={inputCls} inputMode="decimal" placeholder="We'll suggest one" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ""))} />
            </span>
          </label>
          <label className="block">
            <span className={label}>
              Average job value, USD <span className="font-normal">(optional)</span>
            </span>
            <span className={box}>
              <span className="text-sm text-muted-foreground">$</span>
              <input className={inputCls} inputMode="decimal" placeholder="e.g. 350" value={jobValue} onChange={(e) => setJobValue(e.target.value.replace(/[^\d.]/g, ""))} />
            </span>
          </label>
          <button
            type="button"
            onClick={start}
            disabled={starting}
            className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Zap className="h-4 w-4" aria-hidden />
            {starting ? "Starting…" : "Analyse site"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            Cost <CreditCost action={CREDIT_ACTION_KEYS.adsAnalysis} units={Math.max(services.length, 1)} />
          </span>
          <span>Takes two to four minutes. Credits come back if the analysis fails.</span>
        </div>
      </section>

      {error && (
        <div
          className="card tight"
          role="alert"
          style={{ marginTop: 14, borderColor: "var(--neg)", background: "var(--neg-soft)", color: "var(--neg)", fontSize: 12 }}
        >
          {error}
          {shortOfCredits && (
            <>
              {" "}
              <Link href={BUY_CREDITS_HREF} style={{ color: "inherit", textDecoration: "underline" }}>
                {tc("buyCredits")}
              </Link>
            </>
          )}
        </div>
      )}

      <h2 className="mb-3 mt-7 text-[15px] font-semibold tracking-tight">What the analysis checks</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {COVERS.map(({ icon: Icon, tone, title, text }) => (
          <div key={title} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}>
              <Icon className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold">{title}</div>
              <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{text}</div>
            </div>
          </div>
        ))}
      </div>

      <ReportHistory<AnalysisListItem>
        path="/api/ads-analysis"
        emptyText="No Google Ads analyses yet. Enter your site above to run your first one."
        toRow={(a) => ({
          id: a.id,
          title: host(a.origin),
          subtitle: [a.score !== null ? `Score ${a.score}/100` : null, a.locationLabel, a.services.slice(0, 3).join(", ")].filter(Boolean).join(" · ") || undefined,
          domain: host(a.origin),
          status: HISTORY_STATUS[a.status],
          createdAt: a.createdAt,
          href: `/dashboard/ads-analysis/${a.id}`,
        })}
      />
    </div>
  )
}
