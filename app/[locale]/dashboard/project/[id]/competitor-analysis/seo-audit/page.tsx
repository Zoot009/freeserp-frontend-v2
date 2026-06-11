"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/lib/auth"
import { AnimatedNoise } from "@/components/animated-noise"
import { ArrowLeft, ExternalLink, AlertCircle, ScanSearch, CheckCircle, XCircle, ChevronDown, ChevronUp } from "lucide-react"
import Link from "next/link"
import axios from "@/lib/axios"

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
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["meta", "content", "keyword", "headings", "links", "images", "technical"]))

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

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(section)) {
      newExpanded.delete(section)
    } else {
      newExpanded.add(section)
    }
    setExpandedSections(newExpanded)
  }

  const Check = ({ value }: { value: boolean }) =>
    value ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> : <XCircle className="h-3.5 w-3.5 text-red-400" />

  const ScoreBar = ({ score, max = 100, label }: { score: number; max?: number; label?: string }) => {
    const pct = Math.min(100, (score / max) * 100)
    const color = pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500"
    return (
      <div>
        {label && <div className="font-mono text-[9px] text-muted-foreground mb-1">{label}</div>}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-border/30 overflow-hidden">
            <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
          </div>
          <span className="font-mono text-xs font-bold text-foreground">{score}</span>
        </div>
      </div>
    )
  }

  const SectionHeader = ({ id, title, subtitle }: { id: string; title: string; subtitle?: string }) => (
    <button
      onClick={() => toggleSection(id)}
      className="w-full flex items-center justify-between p-4 sm:p-5 hover:bg-muted/5 transition-colors"
    >
      <div className="text-left">
        <h3 className="font-[var(--font-bebas)] text-xl sm:text-2xl tracking-tight">{title}</h3>
        {subtitle && <p className="font-mono text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {expandedSections.has(id)
        ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
        : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
    </button>
  )

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

              {/* Overview Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="border border-border/60 bg-card/30 p-4">
                  <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Status</div>
                  <div className={`font-mono text-2xl font-bold ${crawlData.httpStatus >= 200 && crawlData.httpStatus < 300 ? 'text-emerald-400' : crawlData.httpStatus >= 400 ? 'text-red-400' : 'text-yellow-400'}`}>
                    {crawlData.httpStatus || "N/A"}
                  </div>
                </div>
                <div className="border border-border/60 bg-card/30 p-4">
                  <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Words</div>
                  <div className="font-mono text-2xl font-bold text-foreground">
                    {crawlData.content?.wordCount?.toLocaleString() || 0}
                  </div>
                </div>
                <div className="border border-border/60 bg-card/30 p-4">
                  <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Crawl Time</div>
                  <div className="font-mono text-2xl font-bold text-foreground">
                    {(crawlData.crawlTime / 1000).toFixed(1)}s
                  </div>
                </div>
              </div>

              {/* Meta Tags Section */}
              <div className="border border-border/60 bg-card/30">
                <SectionHeader id="meta" title="META TAGS" subtitle="Title, description, canonical, and Open Graph data" />
                {expandedSections.has("meta") && (
                  <div className="px-4 sm:px-5 pb-5 space-y-4">
                    <div className="space-y-3">
                      <div className="border border-border/40 bg-background/50 p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Title</span>
                          <span className={`font-mono text-[9px] ${crawlData.metaTags?.titleLength >= 30 && crawlData.metaTags?.titleLength <= 60 ? 'text-emerald-400' : 'text-yellow-400'}`}>
                            {crawlData.metaTags?.titleLength} chars
                          </span>
                        </div>
                        <p className="font-mono text-sm text-foreground">{crawlData.metaTags?.title || "Not set"}</p>
                      </div>

                      <div className="border border-border/40 bg-background/50 p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Meta Description</span>
                          <span className={`font-mono text-[9px] ${crawlData.metaTags?.descriptionLength >= 120 && crawlData.metaTags?.descriptionLength <= 160 ? 'text-emerald-400' : 'text-yellow-400'}`}>
                            {crawlData.metaTags?.descriptionLength} chars
                          </span>
                        </div>
                        <p className="font-mono text-xs text-foreground/80">{crawlData.metaTags?.description || "Not set"}</p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="border border-border/40 bg-background/50 p-3">
                          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground block mb-1">Canonical</span>
                          <div className="flex items-center gap-1">
                            <Check value={!!crawlData.metaTags?.canonical} />
                            <span className="font-mono text-[10px] text-foreground/80 truncate">{crawlData.metaTags?.canonical || "Not set"}</span>
                          </div>
                        </div>
                        <div className="border border-border/40 bg-background/50 p-3">
                          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground block mb-1">Language</span>
                          <span className="font-mono text-sm text-foreground">{crawlData.metaTags?.language || "N/A"}</span>
                        </div>
                        <div className="border border-border/40 bg-background/50 p-3">
                          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground block mb-1">HTTPS</span>
                          <div className="flex items-center gap-1">
                            <Check value={crawlData.urlInfo?.isHttps} />
                            <span className="font-mono text-[10px] text-foreground/80">{crawlData.urlInfo?.isHttps ? "Secure" : "Not secure"}</span>
                          </div>
                        </div>
                      </div>

                      {/* Open Graph */}
                      {crawlData.openGraph && Object.keys(crawlData.openGraph).length > 0 && (
                        <div className="border border-border/40 bg-background/50 p-3">
                          <span className="font-mono text-[9px] uppercase tracking-wider text-accent block mb-2">Open Graph</span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {Object.entries(crawlData.openGraph).slice(0, 6).map(([key, value]) => (
                              <div key={key} className="font-mono text-[10px]">
                                <span className="text-muted-foreground">{key}: </span>
                                <span className="text-foreground/80 break-all">{String(value).substring(0, 80)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Keyword Analysis Section */}
              <div className="border border-border/60 bg-card/30">
                <SectionHeader id="keyword" title="KEYWORD ANALYSIS" subtitle={`Target: "${keyword}"`} />
                {expandedSections.has("keyword") && crawlData.keywordAnalysis && (
                  <div className="px-4 sm:px-5 pb-5 space-y-4">
                    {/* Keyword presence checklist */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                      {[
                        { label: "In Title", value: crawlData.keywordAnalysis.inTitle },
                        { label: "In H1", value: crawlData.keywordAnalysis.inH1 },
                        { label: "In Meta Desc", value: crawlData.keywordAnalysis.inMetaDescription },
                        { label: "In First 100 Words", value: crawlData.keywordAnalysis.inFirst100Words },
                        { label: "In URL", value: crawlData.keywordAnalysis.inUrl },
                      ].map((item) => (
                        <div key={item.label} className="border border-border/40 bg-background/50 p-3 flex items-center gap-2">
                          <Check value={item.value} />
                          <span className="font-mono text-[10px] text-foreground/80">{item.label}</span>
                        </div>
                      ))}
                    </div>

                    {/* Density stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="border border-border/40 bg-background/50 p-3">
                        <div className="font-mono text-[9px] text-muted-foreground mb-1">Occurrences</div>
                        <div className="font-mono text-xl font-bold text-foreground">{crawlData.keywordAnalysis.occurrences}</div>
                      </div>
                      <div className="border border-border/40 bg-background/50 p-3">
                        <div className="font-mono text-[9px] text-muted-foreground mb-1">Density</div>
                        <div className="font-mono text-xl font-bold text-foreground">{crawlData.keywordAnalysis.density}%</div>
                      </div>
                    </div>

                    {/* By Section */}
                    {crawlData.keywordAnalysis.bySection && Object.keys(crawlData.keywordAnalysis.bySection).length > 0 && (
                      <div>
                        <h4 className="font-mono text-[10px] uppercase tracking-widest text-accent mb-3">Density by Section</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {Object.entries(crawlData.keywordAnalysis.bySection).map(([section, data]) => (
                            <div key={section} className="border border-border/40 bg-background/50 p-3">
                              <div className="font-mono text-[9px] uppercase text-muted-foreground mb-1">{section}</div>
                              <div className="font-mono text-sm text-foreground">{data.occurrences} hits &middot; {data.density}%</div>
                              <div className="font-mono text-[9px] text-muted-foreground">{data.wordCount} words</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Top Phrases */}
                    {crawlData.keywordAnalysis.topPhrases && (
                      <div>
                        <h4 className="font-mono text-[10px] uppercase tracking-widest text-accent mb-3">Top Phrases Found</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {crawlData.keywordAnalysis.topPhrases.twoWord?.length > 0 && (
                            <div className="border border-border/40 bg-background/50 p-3">
                              <div className="font-mono text-[9px] uppercase text-muted-foreground mb-2">Two-word Phrases</div>
                              <div className="space-y-1">
                                {crawlData.keywordAnalysis.topPhrases.twoWord.slice(0, 8).map((p, i) => (
                                  <div key={i} className="flex items-center justify-between font-mono text-[10px]">
                                    <span className="text-foreground/80">&quot;{p.phrase}&quot;</span>
                                    <span className="text-accent">{p.count}x</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {crawlData.keywordAnalysis.topPhrases.threeWord?.length > 0 && (
                            <div className="border border-border/40 bg-background/50 p-3">
                              <div className="font-mono text-[9px] uppercase text-muted-foreground mb-2">Three-word Phrases</div>
                              <div className="space-y-1">
                                {crawlData.keywordAnalysis.topPhrases.threeWord.slice(0, 8).map((p, i) => (
                                  <div key={i} className="flex items-center justify-between font-mono text-[10px]">
                                    <span className="text-foreground/80">&quot;{p.phrase}&quot;</span>
                                    <span className="text-accent">{p.count}x</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Content Analysis Section */}
              <div className="border border-border/60 bg-card/30">
                <SectionHeader id="content" title="CONTENT ANALYSIS" subtitle={`${crawlData.content?.wordCount?.toLocaleString() || 0} words, ${crawlData.content?.readability?.sentenceCount || 0} sentences`} />
                {expandedSections.has("content") && (
                  <div className="px-4 sm:px-5 pb-5 space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                      <div className="border border-border/40 bg-background/50 p-3">
                        <div className="font-mono text-[9px] text-muted-foreground mb-1">Word Count</div>
                        <div className={`font-mono text-xl font-bold ${(crawlData.content?.wordCount || 0) >= 800 ? 'text-emerald-400' : (crawlData.content?.wordCount || 0) >= 300 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {crawlData.content?.wordCount?.toLocaleString() || 0}
                        </div>
                      </div>
                      <div className="border border-border/40 bg-background/50 p-3">
                        <div className="font-mono text-[9px] text-muted-foreground mb-1">Unique Words</div>
                        <div className="font-mono text-xl font-bold text-foreground">{crawlData.content?.uniqueWords || 0}</div>
                      </div>
                      <div className="border border-border/40 bg-background/50 p-3">
                        <div className="font-mono text-[9px] text-muted-foreground mb-1">Paragraphs</div>
                        <div className="font-mono text-xl font-bold text-foreground">{crawlData.content?.paragraphs || 0}</div>
                      </div>
                      <div className="border border-border/40 bg-background/50 p-3">
                        <div className="font-mono text-[9px] text-muted-foreground mb-1">Reading Time</div>
                        <div className="font-mono text-xl font-bold text-foreground">{crawlData.content?.readingTime || 0}m</div>
                      </div>
                      <div className="border border-border/40 bg-background/50 p-3">
                        <div className="font-mono text-[9px] text-muted-foreground mb-1">Sentences</div>
                        <div className="font-mono text-xl font-bold text-foreground">{crawlData.content?.readability?.sentenceCount || 0}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="border border-border/40 bg-background/50 p-3">
                        <ScoreBar score={crawlData.content?.readability?.fleschScore || 0} label="Readability (Flesch Score)" />
                      </div>
                      <div className="border border-border/40 bg-background/50 p-3">
                        <div className="font-mono text-[9px] text-muted-foreground mb-1">Grade Level (Flesch-Kincaid)</div>
                        <div className="font-mono text-xl font-bold text-foreground">{crawlData.content?.readability?.gradeLevel || 0}</div>
                      </div>
                    </div>

                    {/* Page Sections */}
                    {crawlData.pageSections && Object.keys(crawlData.pageSections).length > 0 && (
                      <div>
                        <h4 className="font-mono text-[10px] uppercase tracking-widest text-accent mb-3">Page Sections</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {Object.entries(crawlData.pageSections).map(([section, data]) => (
                            <div key={section} className="border border-border/40 bg-background/50 p-3">
                              <div className="font-mono text-[10px] uppercase font-medium text-foreground mb-2">{section}</div>
                              <div className="space-y-1 font-mono text-[10px] text-muted-foreground">
                                <div>{data.wordCount} words</div>
                                <div>H1: {data.headings?.h1 || 0}, H2: {data.headings?.h2 || 0}, H3: {data.headings?.h3 || 0}</div>
                                <div>{Array.isArray(data.links?.internal) ? data.links.internal.length : (data.links?.internal || 0)} internal, {Array.isArray(data.links?.external) ? data.links.external.length : (data.links?.external || 0)} external links</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Heading Structure Section */}
              <div className="border border-border/60 bg-card/30">
                <SectionHeader id="headings" title="HEADING STRUCTURE" subtitle={`${crawlData.headings?.h1?.length || 0} H1, ${crawlData.headings?.h2?.length || 0} H2, ${crawlData.headings?.h3?.length || 0} H3`} />
                {expandedSections.has("headings") && (
                  <div className="px-4 sm:px-5 pb-5 space-y-4">
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                      {["h1", "h2", "h3", "h4", "h5", "h6"].map((tag) => (
                        <div key={tag} className="border border-border/40 bg-background/50 p-3 text-center">
                          <div className="font-mono text-[9px] uppercase text-muted-foreground mb-1">{tag.toUpperCase()}</div>
                          <div className={`font-mono text-xl font-bold ${tag === "h1" && (crawlData.headings?.[tag as keyof typeof crawlData.headings]?.length || 0) !== 1 ? "text-yellow-400" : "text-foreground"}`}>
                            {crawlData.headings?.[tag as keyof typeof crawlData.headings]?.length || 0}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Heading hierarchy */}
                    {crawlData.headingStructure && crawlData.headingStructure.length > 0 && (
                      <div className="border border-border/40 bg-background/50 p-3 max-h-64 overflow-y-auto">
                        <div className="font-mono text-[9px] uppercase tracking-wider text-accent mb-2">Heading Hierarchy</div>
                        <div className="space-y-1">
                          {crawlData.headingStructure.slice(0, 30).map((h, i) => (
                            <div key={i} className="flex items-start gap-2 font-mono text-[10px]" style={{ paddingLeft: `${(h.level - 1) * 16}px` }}>
                              <span className={`flex-shrink-0 px-1.5 py-0.5 text-[8px] uppercase tracking-wider border ${h.level === 1 ? "border-accent/40 text-accent" : "border-border/40 text-muted-foreground"}`}>
                                H{h.level}
                              </span>
                              <span className="text-foreground/80">{h.text}</span>
                              {h.section && (
                                <span className="text-muted-foreground/50 text-[8px] ml-auto flex-shrink-0">[{h.section}]</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Links Section */}
              <div className="border border-border/60 bg-card/30">
                <SectionHeader id="links" title="LINK ANALYSIS" subtitle={`${crawlData.linkAnalysis?.total || 0} total (${crawlData.linkAnalysis?.internal || 0} internal, ${crawlData.linkAnalysis?.external || 0} external)`} />
                {expandedSections.has("links") && crawlData.linkAnalysis && (
                  <div className="px-4 sm:px-5 pb-5 space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: "Internal", value: crawlData.linkAnalysis.internal },
                        { label: "External", value: crawlData.linkAnalysis.external },
                        { label: "Nofollow", value: crawlData.linkAnalysis.nofollow },
                        { label: "Self-references", value: crawlData.linkAnalysis.selfReferences },
                      ].map((item) => (
                        <div key={item.label} className="border border-border/40 bg-background/50 p-3">
                          <div className="font-mono text-[9px] text-muted-foreground mb-1">{item.label}</div>
                          <div className="font-mono text-xl font-bold text-foreground">{item.value}</div>
                        </div>
                      ))}
                    </div>

                    {/* By Section */}
                    {crawlData.linkAnalysis.bySection && Object.keys(crawlData.linkAnalysis.bySection).length > 0 && (
                      <div>
                        <h4 className="font-mono text-[10px] uppercase tracking-widest text-accent mb-3">Links by Section</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {Object.entries(crawlData.linkAnalysis.bySection).map(([section, data]) => (
                            <div key={section} className="border border-border/40 bg-background/50 p-3">
                              <div className="font-mono text-[10px] uppercase text-muted-foreground mb-1">{section}</div>
                              <div className="font-mono text-sm text-foreground">{data.internal} internal, {data.external} external</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* External domains */}
                    {crawlData.linkAnalysis.externalDomains?.length > 0 && (
                      <div className="border border-border/40 bg-background/50 p-3">
                        <div className="font-mono text-[9px] uppercase tracking-wider text-accent mb-2">
                          External Domains ({crawlData.linkAnalysis.externalDomains.length})
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {crawlData.linkAnalysis.externalDomains.slice(0, 20).map((d, i) => (
                            <span key={i} className="font-mono text-[10px] px-2 py-1 bg-muted/20 border border-border/30 text-foreground/80">{d}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Internal links list */}
                    {crawlData.linkAnalysis.internalLinks?.length > 0 && (
                      <div className="border border-border/40 bg-background/50 p-3 max-h-48 overflow-y-auto">
                        <div className="font-mono text-[9px] uppercase tracking-wider text-accent mb-2">
                          Internal Links (top {Math.min(20, crawlData.linkAnalysis.internalLinks.length)})
                        </div>
                        <div className="space-y-1">
                          {crawlData.linkAnalysis.internalLinks.slice(0, 20).map((link, i) => (
                            <div key={i} className="flex items-center gap-2 font-mono text-[10px]">
                              <span className="text-muted-foreground/50 text-[8px] flex-shrink-0">[{link.section}]</span>
                              <span className="text-foreground/70 truncate">{link.text || "(no anchor)"}</span>
                              <span className="text-accent truncate ml-auto">{link.url}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Images Section */}
              <div className="border border-border/60 bg-card/30">
                <SectionHeader id="images" title="IMAGE ANALYSIS" subtitle={`${crawlData.imageAnalysis?.total || 0} images, ${crawlData.imageAnalysis?.withoutAlt || 0} missing alt`} />
                {expandedSections.has("images") && crawlData.imageAnalysis && (
                  <div className="px-4 sm:px-5 pb-5 space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: "Total Images", value: crawlData.imageAnalysis.total },
                        { label: "With Alt Text", value: crawlData.imageAnalysis.withAlt },
                        { label: "Missing Alt", value: crawlData.imageAnalysis.withoutAlt, warn: crawlData.imageAnalysis.withoutAlt > 0 },
                        { label: "Lazy Loaded", value: crawlData.imageAnalysis.lazyLoaded },
                      ].map((item) => (
                        <div key={item.label} className="border border-border/40 bg-background/50 p-3">
                          <div className="font-mono text-[9px] text-muted-foreground mb-1">{item.label}</div>
                          <div className={`font-mono text-xl font-bold ${item.warn ? 'text-yellow-400' : 'text-foreground'}`}>{item.value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Image list with thumbnails */}
                    {crawlData.imageAnalysis.images?.length > 0 && (
                      <div className="border border-border/40 bg-background/50 p-3 max-h-64 overflow-y-auto">
                        <div className="font-mono text-[9px] uppercase tracking-wider text-accent mb-2">
                          Images (showing {Math.min(15, crawlData.imageAnalysis.images.length)})
                        </div>
                        <div className="space-y-2">
                          {crawlData.imageAnalysis.images.slice(0, 15).map((img, i) => (
                            <div key={i} className="flex items-start gap-3 py-1 border-b border-border/20 last:border-b-0">
                              {img.src && (
                                <img
                                  src={img.src.startsWith("http") ? img.src : `${crawlData.urlInfo?.url?.replace(/\/$/, '')}${img.src.startsWith('/') ? '' : '/'}${img.src}`}
                                  alt={img.alt || ""}
                                  className="w-10 h-10 object-cover border border-border/30 flex-shrink-0 bg-muted/20"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1">
                                  <Check value={img.hasAlt} />
                                  <span className="font-mono text-[10px] text-foreground/80 truncate">{img.alt || "(no alt text)"}</span>
                                </div>
                                <span className="font-mono text-[9px] text-muted-foreground truncate block">{img.src}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Technical SEO Section */}
              <div className="border border-border/60 bg-card/30">
                <SectionHeader id="technical" title="TECHNICAL SEO" subtitle="Performance, structured data, and technical checks" />
                {expandedSections.has("technical") && (
                  <div className="px-4 sm:px-5 pb-5 space-y-4">
                    {/* Performance */}
                    {crawlData.performance && (
                      <div>
                        <h4 className="font-mono text-[10px] uppercase tracking-widest text-accent mb-3">Performance</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                          {[
                            { label: "TTFB", value: `${crawlData.performance.ttfb}ms`, warn: crawlData.performance.ttfb > 600 },
                            { label: "DOM Interactive", value: `${crawlData.performance.domInteractive}ms` },
                            { label: "DOM Loaded", value: `${crawlData.performance.domContentLoaded}ms` },
                            { label: "FCP", value: `${crawlData.performance.webVitals?.fcp}ms`, warn: (crawlData.performance.webVitals?.fcp || 0) > 2500 },
                            { label: "LCP", value: `${crawlData.performance.webVitals?.lcp}ms`, warn: (crawlData.performance.webVitals?.lcp || 0) > 2500 },
                            { label: "CLS", value: String(crawlData.performance.webVitals?.cls || 0), warn: (crawlData.performance.webVitals?.cls || 0) > 0.1 },
                          ].map((item) => (
                            <div key={item.label} className="border border-border/40 bg-background/50 p-3">
                              <div className="font-mono text-[9px] text-muted-foreground mb-1">{item.label}</div>
                              <div className={`font-mono text-sm font-bold ${item.warn ? 'text-yellow-400' : 'text-foreground'}`}>{item.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Technical checks */}
                    <div>
                      <h4 className="font-mono text-[10px] uppercase tracking-widest text-accent mb-3">Technical Checks</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {[
                          { label: "Favicon", value: crawlData.technical?.hasFavicon },
                          { label: "Viewport", value: crawlData.technical?.hasViewport },
                          { label: "Schema Markup", value: (crawlData.structuredData?.totalSchemas || 0) > 0 },
                          { label: "HTTPS", value: crawlData.urlInfo?.isHttps },
                        ].map((item) => (
                          <div key={item.label} className="border border-border/40 bg-background/50 p-3 flex items-center gap-2">
                            <Check value={item.value} />
                            <span className="font-mono text-[10px] text-foreground/80">{item.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Schema types */}
                    {crawlData.structuredData?.schemas?.length > 0 && (
                      <div className="border border-border/40 bg-background/50 p-3">
                        <div className="font-mono text-[9px] uppercase tracking-wider text-accent mb-2">
                          Schema Markup ({crawlData.structuredData.totalSchemas})
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {crawlData.structuredData.schemas.map((s, i) => (
                            <span key={i} className="font-mono text-[10px] px-2 py-1 bg-accent/10 border border-accent/20 text-accent">{s.type}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Resource counts */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="border border-border/40 bg-background/50 p-3">
                        <div className="font-mono text-[9px] text-muted-foreground mb-1">Scripts</div>
                        <div className="font-mono text-xl font-bold text-foreground">{crawlData.technical?.scripts || 0}</div>
                      </div>
                      <div className="border border-border/40 bg-background/50 p-3">
                        <div className="font-mono text-[9px] text-muted-foreground mb-1">Stylesheets</div>
                        <div className="font-mono text-xl font-bold text-foreground">{crawlData.technical?.stylesheets || 0}</div>
                      </div>
                      <div className="border border-border/40 bg-background/50 p-3">
                        <div className="font-mono text-[9px] text-muted-foreground mb-1">Inline Styles</div>
                        <div className="font-mono text-xl font-bold text-foreground">{crawlData.technical?.inlineStyles || 0}</div>
                      </div>
                    </div>

                    {/* Trust Signals */}
                    <div>
                      <h4 className="font-mono text-[10px] uppercase tracking-widest text-accent mb-3">Trust Signals</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { label: "Privacy Policy", value: crawlData.trustSignals?.hasPrivacyPolicy },
                          { label: "Terms of Service", value: crawlData.trustSignals?.hasTermsOfService },
                          { label: "Contact Info", value: crawlData.trustSignals?.hasContactInfo },
                          { label: "Social Links", value: crawlData.trustSignals?.hasSocialLinks },
                        ].map((item) => (
                          <div key={item.label} className="border border-border/40 bg-background/50 p-3 flex items-center gap-2">
                            <Check value={item.value} />
                            <span className="font-mono text-[10px] text-foreground/80">{item.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Content Structure */}
                    <div>
                      <h4 className="font-mono text-[10px] uppercase tracking-widest text-accent mb-3">Content Structure</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        {[
                          { label: "ToC", value: crawlData.contentStructure?.hasTableOfContents },
                          { label: "FAQ", value: crawlData.contentStructure?.hasFaqSection },
                          { label: "Video", value: crawlData.contentStructure?.hasVideo },
                          { label: "Breadcrumb", value: crawlData.contentStructure?.hasBreadcrumb },
                        ].map((item) => (
                          <div key={item.label} className="border border-border/40 bg-background/50 p-3 flex items-center gap-2">
                            <Check value={item.value} />
                            <span className="font-mono text-[10px] text-foreground/80">{item.label}</span>
                          </div>
                        ))}
                        <div className="border border-border/40 bg-background/50 p-3">
                          <div className="font-mono text-[9px] text-muted-foreground mb-1">Lists</div>
                          <div className="font-mono text-lg font-bold text-foreground">{crawlData.contentStructure?.lists || 0}</div>
                        </div>
                        <div className="border border-border/40 bg-background/50 p-3">
                          <div className="font-mono text-[9px] text-muted-foreground mb-1">Bullet Points</div>
                          <div className="font-mono text-lg font-bold text-foreground">{crawlData.contentStructure?.bulletPoints || 0}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

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
