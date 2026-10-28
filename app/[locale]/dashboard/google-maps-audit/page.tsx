"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { Camera, Database, Globe, Grid3x3, Link2, MapPin, Search, Star, Store, Zap } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { api, ApiError } from "@/lib/api"
import { BUY_CREDITS_HREF, CREDIT_ACTION_KEYS } from "@/lib/credits"
import { CACHE_DAYS, type AuditListItem, type AuditStatus } from "@/lib/gbp-audit"
import { CreditCost } from "@/components/dashboard/credit-cost"
import { ReportHistory } from "@/components/dashboard/report-history"

// The ReportHistory panel's four states.
const HISTORY_STATUS: Record<AuditStatus, "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"> = {
  QUEUED: "PENDING",
  RUNNING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
}

// What the audit looks at, so the empty form says what it is for.
const COVERS = [
  { icon: Store, tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400", title: "Profile completeness", text: "Claim status, categories, description, phone, hours, attributes" },
  { icon: Star, tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400", title: "Reviews & reputation", text: "Rating, volume vs. competitors, recency, owner replies" },
  { icon: Grid3x3, tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", title: "3×3 rank grid", text: "Your keyword searched from 9 points around the business" },
  { icon: Camera, tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400", title: "Photos & content", text: "Photo count, logo and cover image" },
  { icon: Globe, tone: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400", title: "Website & conversion", text: "Website link, HTTPS, UTM tracking, booking links" },
]

const STEPS = [
  { icon: Link2, title: "Paste a Maps link", text: "Share → Copy link on Google Maps, or the address bar" },
  { icon: Search, title: "Pick a keyword", text: "Optional: we use the primary category if you leave it blank" },
  { icon: Zap, title: "Get the report", text: "Score, rank grid, competitors and a 30-day plan in about a minute" },
]

export default function GoogleMapsAuditPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const tc = useTranslations("credits")

  const [url, setUrl] = useState("")
  const [keyword, setKeyword] = useState("")
  const [starting, setStarting] = useState(false)
  // Synchronous double-submit guard: `disabled` only updates on the next render.
  const submittingRef = useRef(false)
  const [error, setError] = useState("")
  const [shortOfCredits, setShortOfCredits] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) router.push("/login")
  }, [user, authLoading, router])

  const start = async () => {
    setError("")
    setShortOfCredits(false)
    if (!url.trim()) {
      setError("Paste a Google Maps link to a business.")
      return
    }
    if (submittingRef.current) return
    submittingRef.current = true
    setStarting(true)
    try {
      const { audit } = await api.post<{ audit: { id: string } }>("/api/gbp-audit", { url: url.trim(), keyword: keyword.trim() || null })
      // Left true while navigating away, so a stray click can't start a second audit.
      router.push(`/dashboard/google-maps-audit/${audit.id}`)
    } catch (err) {
      setShortOfCredits(err instanceof ApiError && err.code === "insufficient_credits")
      setError(err instanceof Error && err.message ? err.message : "Couldn't start the audit. Please try again.")
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
      <section className="relative overflow-hidden rounded-2xl bg-[#0c1f38] text-white shadow-[0_18px_40px_-24px_rgba(12,31,56,.9)]">
        <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-[#0c1f38] via-[#102b52] to-[#1e40af]" />
        <div aria-hidden className="absolute -right-20 -top-28 h-80 w-80 rounded-full bg-sky-400/25 blur-3xl" />
        <div
          aria-hidden
          className="absolute inset-y-0 right-0 hidden w-1/3 opacity-[0.12] lg:block"
          style={{ backgroundImage: "radial-gradient(circle, #fff 2px, transparent 2.5px)", backgroundSize: "28px 28px" }}
        />
        <div className="relative p-6 sm:p-8">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-200 ring-1 ring-inset ring-white/15">
            <MapPin className="h-3 w-3" /> Local SEO audit
          </div>
          <h1 className="mt-3 text-[28px] font-semibold leading-tight tracking-tight sm:text-[34px]">Google Maps Audit</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/75">
            Paste any Google Business Profile link. We read the live listing and its newest reviews, check where it ranks on a 3×3 map
            grid for your keyword, and hand you a score with a prioritised fix list.
          </p>

          <div className="mt-6 grid gap-2 rounded-2xl bg-white p-2 shadow-lg dark:bg-[#14181f] lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_auto]">
            <label className="flex items-center gap-2.5 rounded-xl px-3 py-2 ring-1 ring-inset ring-border focus-within:ring-brand">
              <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              {/* type="text", not "url": a bare Place ID or "maps.app.goo.gl/…" without a scheme is fine too */}
              <input
                className="h-8 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                placeholder="https://maps.app.goo.gl/…  or  google.com/maps/place/…"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                aria-label="Google Maps link"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && start()}
              />
            </label>
            <label className="flex items-center gap-2.5 rounded-xl px-3 py-2 ring-1 ring-inset ring-border focus-within:ring-brand">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                className="h-8 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                placeholder="Keyword (optional)"
                aria-label="Keyword to rank-check"
                maxLength={80}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && start()}
              />
            </label>
            <button
              type="button"
              onClick={start}
              disabled={starting}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-deep disabled:opacity-60"
            >
              <Zap className="h-4 w-4" />
              {starting ? "Starting…" : "Run audit"}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-white/70">
            <span className="inline-flex flex-wrap items-center gap-1.5">
              Profile <CreditCost action={CREDIT_ACTION_KEYS.gbpAudit} showBalance={false} className="[&_*]:!text-white/70" />
              <span className="text-white/40">+</span>
              3×3 Maps Tracker grid <CreditCost action={CREDIT_ACTION_KEYS.mapsScanPoint} units={9} className="[&_*]:!text-white/70" />
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-sky-300" /> Re-auditing the same business within {CACHE_DAYS} days is free — the data is cached
            </span>
          </div>
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

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {STEPS.map(({ icon: StepIcon, title, text }, i) => (
          <div key={title} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0c1f38] text-sm font-bold text-white dark:bg-brand">{i + 1}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[13px] font-semibold">
                <StepIcon className="h-3.5 w-3.5 text-brand" /> {title}
              </div>
              <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{text}</div>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mb-3 mt-7 text-[15px] font-semibold tracking-tight">What the audit checks</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {COVERS.map(({ icon: CoverIcon, tone, title, text }) => (
          <div key={title} className="rounded-2xl border border-border bg-card p-4 transition-shadow hover:shadow-md">
            <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}>
              <CoverIcon className="h-[18px] w-[18px]" />
            </div>
            <div className="text-[13px] font-semibold">{title}</div>
            <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</div>
          </div>
        ))}
      </div>

      <ReportHistory<AuditListItem>
        path="/api/gbp-audit"
        emptyText="No Google Maps audits yet. Paste a link above to run your first one."
        toRow={(a) => ({
          id: a.id,
          title: a.name ?? "Google Business Profile",
          subtitle: [a.score !== null ? `Score ${a.score}/100` : null, a.keyword ? `“${a.keyword}”` : null, a.fromCache ? "from cache" : null]
            .filter(Boolean)
            .join(" · ") || undefined,
          // Every row is a Maps listing; the pasted input may be a bare Place ID with no host at all.
          domain: "maps.google.com",
          status: HISTORY_STATUS[a.status],
          createdAt: a.createdAt,
          href: `/dashboard/google-maps-audit/${a.id}`,
        })}
      />
    </div>
  )
}
