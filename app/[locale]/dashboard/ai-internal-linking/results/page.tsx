"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/lib/auth"
import { Icon } from "@/components/dashboard/icons"
import { InternalLinkGraph, type LinkGraphDomain } from "@/components/internal-link-graph"
import { api, ApiError } from "@/lib/api"

// Consecutive failed polls (5xx / network) tolerated before giving up.
const MAX_POLL_FAILURES = 5

type AnalysisStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"

interface InternalLinkAnalysisData {
  id: string
  domain: string
  status: AnalysisStatus
  error: string | null
  internalLinkGraph: Pick<LinkGraphDomain, "nodes" | "edges" | "metadata" | "orphanData"> | null
}

function AiInternalLinkingResultsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()

  const analysisId = searchParams.get("analysisId") || ""

  const [analysis, setAnalysis] = useState<InternalLinkAnalysisData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  // One poll chain at a time (as on the competitor results pages): leaving the
  // page or switching analysis bumps the generation, so an in-flight poll drops
  // its result instead of rescheduling.
  const pollGenRef = useRef(0)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const failuresRef = useRef(0)

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login")
      return
    }

    if (!analysisId) {
      setError("No analysis ID provided")
      setLoading(false)
      return
    }

    if (!authLoading && user && analysisId) {
      fetchAnalysis(++pollGenRef.current)
    }
    return () => {
      pollGenRef.current++
      clearTimeout(pollTimerRef.current)
    }
    // user?.id, not user: AuthProvider swaps in a fresh user object after
    // /api/auth/me, which re-ran this effect and started a second poll loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading, analysisId])

  const fetchAnalysis = async (gen: number) => {
    try {
      // lib/api, not raw axios: it refreshes an expired session instead of
      // 401-ing every poll, and throws the server's own message.
      const data = await api.get<{ analysis?: InternalLinkAnalysisData }>(`/api/internal-link-analysis/${analysisId}`)
      if (gen !== pollGenRef.current) return
      failuresRef.current = 0
      setError("")

      const analysisData = (data.analysis ?? data) as InternalLinkAnalysisData
      setAnalysis(analysisData)

      if (analysisData.status === "PENDING" || analysisData.status === "PROCESSING") {
        pollTimerRef.current = setTimeout(() => fetchAnalysis(gen), 3000)
      } else {
        setLoading(false)
      }
    } catch (err) {
      if (gen !== pollGenRef.current) return
      // A 4xx (not found, no access) won't change by asking again, so it ends
      // the loop with the server's message. A 5xx or network blip might, so
      // those retry a few times first; before, a blip after the first load
      // retried silently forever and one on the first load stopped for good.
      const status = err instanceof ApiError ? err.status : 0
      failuresRef.current += 1
      if ((status >= 400 && status < 500) || failuresRef.current > MAX_POLL_FAILURES) {
        setError(err instanceof Error && err.message ? err.message : "Failed to load results")
        setLoading(false)
        return
      }
      pollTimerRef.current = setTimeout(() => fetchAnalysis(gen), 4000)
    }
  }

  if (authLoading || !user) return null

  const running = analysis?.status === "PENDING" || analysis?.status === "PROCESSING"
  const domainRow: LinkGraphDomain | null = analysis
    ? {
        domain: analysis.domain,
        isOwnSite: true,
        position: null,
        rankingUrl: "",
        outboundLinks: [],
        inboundLinks: [],
        totalCrawledPages: 0,
        allPages: [],
        hasLinkData: (analysis.internalLinkGraph?.nodes?.length ?? 0) > 0,
        internalCrawlStatus: analysis.status === "COMPLETED" ? "done" : analysis.status === "FAILED" ? "failed" : "crawling",
        nodes: analysis.internalLinkGraph?.nodes ?? [],
        edges: analysis.internalLinkGraph?.edges ?? [],
        metadata: analysis.internalLinkGraph?.metadata ?? null,
        orphanData: analysis.internalLinkGraph?.orphanData ?? null,
      }
    : null

  return (
    <div className="page">
      <div className="page-h" style={{ alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <Link href="/dashboard/ai-internal-linking" className="tiny muted" style={{ display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
            <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><Icon.chevR /></span> Back
          </Link>
          <h1>{analysis?.domain || "Analysis results"}</h1>
        </div>
      </div>

      {loading && !analysis && (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
          Loading…
        </div>
      )}

      {error && (
        <div
          className="card tight"
          style={{ marginTop: 14, borderColor: "var(--neg)", background: "var(--neg-soft)", color: "var(--neg)", fontSize: 12 }}
        >
          {error}
        </div>
      )}

      {analysis?.status === "FAILED" && (
        <div
          className="card tight"
          style={{ borderColor: "var(--neg)", background: "var(--neg-soft)", color: "var(--neg)", fontSize: 12 }}
        >
          {analysis.error || "Internal-link crawl failed for this domain."}
        </div>
      )}

      {running && (
        <div
          className="card tight"
          style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "var(--brand)",
              animation: "shim 1.4s ease-in-out infinite",
            }}
          />
          <span className="sm" style={{ color: "var(--brand)" }}>
            Analyzing internal links…
          </span>
        </div>
      )}

      {/* Only a finished run has a graph. Rendered for any status, the graph's
          own empty state ("may still be running or was not enabled") sat under
          the red failure card and the running banner, contradicting both. */}
      {domainRow && analysis?.status === "COMPLETED" && <InternalLinkGraph data={[domainRow]} />}
    </div>
  )
}

export default function AiInternalLinkingResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="page" style={{ color: "var(--text-mute)", fontSize: 13, padding: 60, textAlign: "center" }}>
          Loading…
        </div>
      }
    >
      <AiInternalLinkingResultsContent />
    </Suspense>
  )
}
