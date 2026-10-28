"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { Camera, Globe, MapPin, Star, Store } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { api, ApiError } from "@/lib/api"
import { BUY_CREDITS_HREF, CREDIT_ACTION_KEYS } from "@/lib/credits"
import { type AuditListItem, type AuditStatus } from "@/lib/gbp-audit"
import { Icon } from "@/components/dashboard/icons"
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
  { icon: Store, title: "Profile completeness", text: "Claim status, categories, description, phone, hours, attributes" },
  { icon: Star, title: "Reviews & reputation", text: "Rating, volume vs. competitors, recency, owner replies" },
  { icon: Camera, title: "Photos & content", text: "Photo count, logo and cover image" },
  { icon: Globe, title: "Website & conversion", text: "Website link, HTTPS, UTM tracking, booking links" },
  { icon: MapPin, title: "Local visibility", text: "Your Maps rank for your own category, and who outranks you" },
]

export default function GoogleMapsAuditPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const tc = useTranslations("credits")

  const [url, setUrl] = useState("")
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
      const { audit } = await api.post<{ audit: { id: string } }>("/api/gbp-audit", { url: url.trim() })
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
      <div className="page-h" style={{ alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <h1>Google Maps Audit</h1>
          <div className="sub">
            Paste a link to any Google Business Profile. We read the live listing, its newest reviews and where it ranks on
            Google Maps for its own category, then score it and give you a prioritised fix list.
          </div>
        </div>
        <div className="row" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button type="button" onClick={start} disabled={starting} className="btn primary">
            {starting ? (
              "Starting…"
            ) : (
              <>
                <Icon.zap />
                Run audit
              </>
            )}
          </button>
          <CreditCost action={CREDIT_ACTION_KEYS.gbpAudit} className="mt-2" />
        </div>
      </div>

      <div className="card" style={{ padding: 18, display: "grid", gap: 10 }}>
        <label className="col" style={{ gap: 6 }}>
          <span className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>
            Google Maps link
          </span>
          {/* type="text", not "url": a bare Place ID or "maps.app.goo.gl/…" without a scheme is fine too */}
          <input
            className="input lg"
            placeholder="https://maps.app.goo.gl/…  or  https://www.google.com/maps/place/…"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && start()}
          />
        </label>
        <span className="tiny muted">
          On Google Maps, open the business and use <b>Share → Copy link</b>, or copy the address bar. <code>?cid=</code> links and
          Place IDs work too. An audit usually takes under a minute.
        </span>
      </div>

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

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {COVERS.map(({ icon: CoverIcon, title, text }) => (
          <div key={title} className="rounded-xl border border-border bg-card p-3.5">
            <div className="mb-2 flex size-8 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <CoverIcon className="size-4" />
            </div>
            <div className="text-[13px] font-medium">{title}</div>
            <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{text}</div>
          </div>
        ))}
      </div>

      <ReportHistory<AuditListItem>
        path="/api/gbp-audit"
        emptyText="No Google Maps audits yet. Paste a link above to run your first one."
        toRow={(a) => ({
          id: a.id,
          title: a.name ?? "Google Business Profile",
          subtitle: a.score !== null ? `Profile score ${a.score}/100` : undefined,
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
