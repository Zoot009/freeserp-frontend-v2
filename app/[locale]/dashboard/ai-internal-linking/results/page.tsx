"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/lib/auth"
import { Icon } from "@/components/dashboard/icons"
import { InternalLinkGraph, type LinkGraphDomain } from "@/components/internal-link-graph"
import axios from "@/lib/axios"

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
  const hasLoadedRef = useRef(false)

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
      fetchAnalysis()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, analysisId])

  const fetchAnalysis = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
      const response = await axios.get(`${apiUrl}/api/internal-link-analysis/${analysisId}`, {
        withCredentials: true,
      })
      if (response.status < 200 || response.status >= 300) throw new Error("Failed to fetch analysis results")

      setError("")
      hasLoadedRef.current = true

      const data = response.data
      const analysisData: InternalLinkAnalysisData = data.analysis ?? data
      setAnalysis(analysisData)

      if (analysisData.status === "PENDING" || analysisData.status === "PROCESSING") {
        setTimeout(fetchAnalysis, 3000)
      } else {
        setLoading(false)
      }
    } catch (err) {
      if (!hasLoadedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load results")
        setLoading(false)
        return
      }
      setTimeout(fetchAnalysis, 4000)
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
          <div className="eyebrow">
            <span className="spark"><Icon.spark /></span> AI INTERNAL LINKING
          </div>
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

      {domainRow && <InternalLinkGraph data={[domainRow]} />}
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
