"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth"
import { Icon } from "@/components/dashboard/icons"
import axios from "@/lib/axios"
import { ToolContext } from "@/components/dashboard/tool-context"

// Turns a 429's rate-limit headers into a human wait time. Same helper used by
// the competitor-analysis start page.
function retryAfterPhrase(headers: Record<string, unknown>): string | null {
  const combined = String(headers["ratelimit"] ?? "")
  const fromCombined = combined.match(/reset\s*=\s*(\d+)/i)?.[1]
  const seconds = Number.parseInt(fromCombined ?? String(headers["retry-after"] ?? ""), 10)
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  if (seconds < 90) return "less than a minute"
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) return `about ${minutes} minutes`
  const hours = Math.ceil(minutes / 60)
  return hours === 1 ? "about an hour" : `about ${hours} hours`
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="col" style={{ gap: 6 }}>
      <span className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>
        {label}
      </span>
      {children}
    </label>
  )
}

export default function AiInternalLinkingPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const [domain, setDomain] = useState("")
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  // Synchronous double-submit guard: `disabled` only updates on the next
  // render, so a fast second click could slip a second POST through first.
  const submittingRef = useRef(false)
  const [error, setError] = useState("")
  const [quotaBlocked, setQuotaBlocked] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) router.push("/login")
  }, [user, authLoading, router])

  const handleAnalyze = async () => {
    setError("")
    const cleanDomain = domain.trim()
    if (!cleanDomain) {
      setError("Enter a domain.")
      return
    }

    if (submittingRef.current) return
    submittingRef.current = true

    setIsAnalyzing(true)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

      const response = await axios.post(
        `${apiUrl}/api/internal-link-analysis`,
        { domain: cleanDomain },
        { withCredentials: true },
      )

      if (response.status < 200 || response.status >= 300) {
        const body = response.data ?? {}
        const raw = body.error?.message ?? body.error
        const serverMsg = typeof raw === "string" && raw ? raw : ""

        if (response.status === 402) {
          setQuotaBlocked(true)
          setError(serverMsg || "You've used all your internal-link analyses for today. Try again tomorrow.")
        } else if (response.status === 429) {
          const wait = retryAfterPhrase(response.headers ?? {})
          setError(
            wait
              ? `You've started several analyses recently. Please try again in ${wait}.`
              : "You've started several analyses recently. Please wait before starting another.",
          )
        } else {
          setError(serverMsg || "Failed to start internal-link analysis")
        }

        setIsAnalyzing(false)
        submittingRef.current = false
        return
      }

      const { analysis } = response.data
      const analysisId = analysis?.id

      // Deliberately leave submittingRef true while navigating away so a
      // stray click during the route transition can't re-fire.
      router.push(`/dashboard/ai-internal-linking/results?analysisId=${analysisId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start analysis")
      setIsAnalyzing(false)
      submittingRef.current = false // real failure → allow another attempt
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
      {/* Header */}
      <div className="page-h" style={{ alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">
            <span className="spark"><Icon.spark /></span> AI INTERNAL LINKING
          </div>
          <h1>Map a site&apos;s internal links</h1>
          <div className="sub">
            Enter a domain to crawl its internal link structure and surface orphan pages, hubs, and authority pages.
          </div>
        </div>
        <div className="row" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={isAnalyzing || quotaBlocked}
            className="btn primary"
          >
            {isAnalyzing ? (
              "Analyzing…"
            ) : quotaBlocked ? (
              "Daily limit reached"
            ) : (
              <>
                <Icon.zap />
                Analyze internal links
              </>
            )}
          </button>
        </div>
      </div>

      <ToolContext id="ai-internal-linking" />

      {/* Input form */}
      <div className="card" style={{ padding: 18 }}>
        <Field label="Domain">
          <input
            className="input"
            placeholder="example.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
          />
        </Field>
      </div>

      {error && (
        <div
          className="card tight"
          style={{
            marginTop: 14,
            borderColor: "var(--neg)",
            background: "var(--neg-soft)",
            color: "var(--neg)",
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}
    </div>
  )
}
