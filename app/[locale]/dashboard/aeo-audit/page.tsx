"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { useAuth } from "@/lib/auth"
import { api, ApiError } from "@/lib/api"
import { BUY_CREDITS_HREF, CREDIT_ACTION_KEYS } from "@/lib/credits"
import { PAGE_CHOICES, type AuditStatus } from "@/lib/aeo"
import { Icon } from "@/components/dashboard/icons"
import { CreditCost } from "@/components/dashboard/credit-cost"
import { ReportHistory } from "@/components/dashboard/report-history"

// The ReportHistory panel knows four states; an audit has more phases than that.
const HISTORY_STATUS: Record<AuditStatus, "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"> = {
  QUEUED: "PENDING",
  CRAWLING: "PROCESSING",
  CHECKING: "PROCESSING",
  ANALYZING: "PROCESSING",
  SCORING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
}

export default function AeoAuditPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const tc = useTranslations("credits")

  const [url, setUrl] = useState("")
  const [pages, setPages] = useState<(typeof PAGE_CHOICES)[number]>(10)
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
      setError("Enter a website, e.g. example.com.")
      return
    }
    if (submittingRef.current) return
    submittingRef.current = true
    setStarting(true)
    try {
      const { audit } = await api.post<{ audit: { id: string } }>("/api/aeo-audit", { url: url.trim(), pages })
      // Left true while navigating away, so a stray click can't start a second audit.
      router.push(`/dashboard/aeo-audit/${audit.id}`)
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
          <h1>AEO &amp; GEO Audit</h1>
          <div className="sub">
            See how ready a website is for AI answer engines: an AEO and a GEO score, readiness for ChatGPT, Claude, Perplexity,
            Gemini, AI Overviews and Copilot, how often they actually cite the site, and a fix list ranked by impact.
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
          <CreditCost action={CREDIT_ACTION_KEYS.aeoAudit} className="mt-2" />
        </div>
      </div>

      <div className="card" style={{ padding: 18, display: "grid", gap: 16 }}>
        <label className="col" style={{ gap: 6 }}>
          <span className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>
            Website
          </span>
          {/* type="text", not "url": people type "example.com", which a url input rejects */}
          <input
            className="input"
            placeholder="example.com"
            inputMode="url"
            autoComplete="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && start()}
          />
        </label>
        <div className="col" style={{ gap: 6 }}>
          <span className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>
            Pages to read besides the homepage
          </span>
          <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div className="pill-toggle" role="radiogroup" aria-label="Pages to read">
              {PAGE_CHOICES.map((n) => (
                <button key={n} type="button" role="radio" aria-checked={pages === n} className={pages === n ? "active" : ""} onClick={() => setPages(n)}>
                  {n}
                </button>
              ))}
            </div>
            <span className="tiny muted">More pages take longer. An audit usually finishes in 2–5 minutes.</span>
          </div>
        </div>
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

      <ReportHistory<AuditListItem>
        path="/api/aeo-audit"
        emptyText="No AEO audits yet. Run your first one above."
        toRow={(a) => {
          const host = new URL(a.origin).hostname.replace(/^www\./, "")
          return {
            id: a.id,
            title: host,
            subtitle: a.aeoScore !== null && a.geoScore !== null ? `AEO ${a.aeoScore} · GEO ${a.geoScore}` : undefined,
            domain: host,
            status: HISTORY_STATUS[a.status],
            createdAt: a.createdAt,
            href: `/dashboard/aeo-audit/${a.id}`,
          }
        }}
      />
    </div>
  )
}

// GET /api/aeo-audit list shape.
type AuditListItem = {
  id: string
  origin: string
  status: AuditStatus
  aeoScore: number | null
  geoScore: number | null
  createdAt: string
}
