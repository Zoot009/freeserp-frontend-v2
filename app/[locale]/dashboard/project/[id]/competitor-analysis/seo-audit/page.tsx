"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/lib/auth"
import { AnimatedNoise } from "@/components/animated-noise"
import { ArrowLeft, ExternalLink, AlertCircle, ScanSearch } from "lucide-react"
import axios from "@/lib/axios"
import { SinglePageReport } from "@/components/single-page-report"
import type { CrawlData as ReportCrawlData } from "@/types/competitor-analysis"

interface CrawlData {
  urlInfo: {
    url: string
    protocol: string
    hostname: string
    pathname: string
    isHttps: boolean
  }
  metaTags: {
    title: string
    titleLength: number
    description: string
    descriptionLength: number
    canonical: string
    language: string
    robots: string
  }
  openGraph: Record<string, string>
  twitterCard: Record<string, string>
  headings: {
    h1: string[]
    h2: string[]
    h3: string[]
    h4: string[]
    h5: string[]
    h6: string[]
  }
  headingStructure: Array<{ level: number; text: string; section: string }>
  content: {
    wordCount: number
    uniqueWords: number
    paragraphs: number
    readingTime: number
    readability: {
      fleschScore: number
      gradeLevel: number
      avgWordsPerSentence: number
      sentenceCount: number
    }
    firstWords: string
  }
  keywordAnalysis: {
    targetKeyword: string
    occurrences: number
    density: string
    inTitle: boolean
    inH1: boolean
    inMetaDescription: boolean
    inFirst100Words: boolean
    inUrl: boolean
    bySection: Record<string, {
      occurrences: number
      density: string
      wordCount: number
    }>
    topPhrases: {
      twoWord: Array<{ phrase: string; count: number }>
      threeWord: Array<{ phrase: string; count: number }>
    }
  }
  pageSections: Record<string, {
    wordCount: number
    headings: Record<string, number>
    links: { internal: number; external: number }
    images: number
    text: string
  }>
  imageAnalysis: {
    total: number
    withAlt: number
    withoutAlt: number
    lazyLoaded: number
    images: Array<{
      src: string
      alt: string
      hasAlt: boolean
      isLazy: boolean
      width?: string
      height?: string
    }>
  }
  linkAnalysis: {
    total: number
    internal: number
    external: number
    nofollow: number
    selfReferences: number
    externalDomains: string[]
    bySection: Record<string, { internal: number; external: number }>
    internalLinks: Array<{ text: string; url: string; section: string }>
    externalLinks: Array<{ text: string; url: string; section: string; isNofollow: boolean }>
  }
  structuredData: {
    schemas: Array<{ type: string; data: Record<string, unknown> }>
    totalSchemas: number
  }
  technical: {
    hasFavicon: boolean
    hasViewport: boolean
    scripts: number
    stylesheets: number
    inlineStyles: number
    metaRobots: string
    xRobotsTag: string
  }
  trustSignals: {
    hasPrivacyPolicy: boolean
    hasTermsOfService: boolean
    hasContactInfo: boolean
    hasSocialLinks: boolean
  }
  contentStructure: {
    hasTableOfContents: boolean
    hasFaqSection: boolean
    hasVideo: boolean
    hasBreadcrumb: boolean
    lists: number
    bulletPoints: number
  }
  httpStatus: number
  redirected: boolean
  performance: {
    ttfb: number
    domInteractive: number
    domContentLoaded: number
    webVitals: {
      fcp: number
      lcp: number
      cls: number
    }
  }
  crawlMethod: string
  crawlTime: number
  crawledAt: string
}

function SeoAuditContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()

  const url = searchParams.get("url") || ""
  const keyword = searchParams.get("keyword") || ""

  const [crawlData, setCrawlData] = useState<CrawlData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login")
      return
    }
    if (!url || !keyword) {
      setError("URL and keyword are required")
      setLoading(false)
      return
    }
    if (!authLoading && user) {
      runAudit()
    }
  }, [user, authLoading])

  const runAudit = async () => {
    setLoading(true)
    setError("")
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
      const response = await axios.post(`${apiUrl}/api/competitor-analysis/seo-audit`, { url, keyword }, {
        withCredentials: true,
      })

      if (response.status < 200 || response.status >= 300) {
        const data = response.data ?? {}
        throw new Error(data.error || "Failed to run SEO audit")
      }

      const result = response.data
      setCrawlData(result.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run audit")
    } finally {
      setLoading(false)
    }
  }

  if (authLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="h-8 w-8 rounded-full border-2 border-accent/50 border-t-accent animate-spin" />
    </div>
  )

  if (!user) return null

  return (
    <div className="min-h-screen bg-background">
      <AnimatedNoise opacity={0.03} />

      {/* Header */}
      <div className="relative border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors mb-4 sm:mb-6"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to Results
          </button>

          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">SEO Audit</span>
            <h1 className="mt-1 font-[var(--font-bebas)] text-4xl sm:text-5xl md:text-6xl tracking-tight leading-none">
              PAGE ANALYSIS
            </h1>
            <div className="mt-2 sm:mt-3 space-y-1">
              <p className="font-mono text-xs sm:text-sm text-muted-foreground">
                URL: <a href={url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline inline-flex items-center gap-1">
                  <span className="break-all">{url}</span>
                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                </a>
              </p>
              <p className="font-mono text-xs sm:text-sm text-muted-foreground">
                Keyword: <span className="text-foreground font-medium">&quot;{keyword}&quot;</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative container mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="max-w-5xl mx-auto">

          {/* Loading State */}
          {loading && (
            <div className="border border-border/60 bg-card/30 backdrop-blur-sm p-8 sm:p-12">
              <div className="flex flex-col items-center gap-6">
                <div className="relative">
                  <div className="h-12 w-12 rounded-full border-2 border-accent/50 border-t-accent animate-spin" />
                  <ScanSearch className="h-5 w-5 text-accent absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <div className="text-center">
                  <p className="font-mono text-sm text-foreground mb-2">Running comprehensive SEO audit...</p>
                  <p className="font-mono text-xs text-muted-foreground">Crawling page, analyzing content, checking technical SEO</p>
                  <p className="font-mono text-[10px] text-muted-foreground/60 mt-2">This may take 10-30 seconds</p>
                </div>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="border border-red-500/30 bg-red-500/5 px-4 sm:px-6 py-4">
              <div className="flex items-start gap-2 mb-4">
                <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="font-mono text-xs sm:text-sm text-red-400">{error}</p>
              </div>
              <button
                onClick={runAudit}
                className="px-4 py-2 bg-accent text-accent-foreground font-mono text-[10px] uppercase tracking-widest hover:bg-accent/80 transition-all"
              >
                Retry Audit
              </button>
            </div>
          )}

          {/* Results */}
          {crawlData && !loading && (
            <div className="space-y-3">

              <SinglePageReport crawlData={crawlData as unknown as ReportCrawlData} keyword={keyword} />

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-2">
                <button
                  onClick={() => router.back()}
                  className="flex-1 border border-border/40 px-6 py-3 sm:py-4 font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-accent transition-all"
                >
                  Back to Results
                </button>
                <button
                  onClick={runAudit}
                  className="flex-1 bg-accent text-accent-foreground px-6 py-3 sm:py-4 font-mono text-xs uppercase tracking-widest hover:bg-accent/80 transition-all flex items-center justify-center gap-2"
                >
                  <ScanSearch className="h-4 w-4" />
                  Re-run Audit
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


export default function SeoAuditPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-accent/50 border-t-accent animate-spin" />
      </div>
    }>
      <SeoAuditContent />
    </Suspense>
  )
}
