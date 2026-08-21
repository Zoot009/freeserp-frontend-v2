"use client"

import React, { useState, useEffect, useRef, Suspense } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/lib/auth"
import { api } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"
import { FavoriteButton } from "@/components/dashboard/favorite-button"
import { InternalLinkGraph } from "@/components/internal-link-graph"
import { CompetitorComparisonTable } from "@/components/competitor-comparison-table"
import { ShareReportDialog } from "@/components/share-report-dialog"
import { AiChatPanel } from "@/components/ai-chat-panel"
import { AskAnalystUpsell } from "@/components/ai-chat-upsell"
import { SeoQuoteOfDay } from "@/components/seo-quote"
import type { AnalysisData, AiPlan, CompetitorResult } from "@/types/competitor-analysis"
import { buildMarkdownExport } from "@/lib/competitor-analysis-export"
import axios from "@/lib/axios"
import { toast } from "sonner"

function CompetitorAnalysisResultsContent() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()

  // Project id is in the route path now; analysisId / keyword still travel
  // in the query because they vary per analysis run.
  const projectId = (params?.id as string) || ""
  const analysisId = searchParams.get("analysisId") || ""
  const keyword = searchParams.get("keyword") || ""

  const [analysis, setAnalysis] = useState<AnalysisData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [recrawlingDomains, setRecrawlingDomains] = useState<Set<string>>(new Set())
  const [activeResultTab, setActiveResultTab] = useState<"comparison" | "link-graph" | "ai-plan">("comparison")
  const [linkGraphData, setLinkGraphData] = useState<any[] | null>(null) // eslint-disable-line @typescript-eslint/no-explicit-any
  const [linkGraphLoading, setLinkGraphLoading] = useState(false)
  const [linkGraphError, setLinkGraphError] = useState("")
  const [aiPlan, setAiPlan] = useState<AiPlan | null>(null)
  const [aiPlanLoading, setAiPlanLoading] = useState(false)
  const [aiPlanError, setAiPlanError] = useState("")
  const [selectedAiCategory, setSelectedAiCategory] = useState<string | null>(null)
  const [chatScope, setChatScope] = useState<string | null>(null)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  // Favorite state for this analysis. caFavReady flips once the cross-reference
  // fetch resolves so the star can remount with the correct initial value.
  const [caFavorited, setCaFavorited] = useState(false)
  const [caFavReady, setCaFavReady] = useState(false)
  // AI-plan keyword popup — asks whether the tracked keyword is the page's
  // primary ranking target, then generates the plan on demand. Defaults to Yes.
  const [showAiKwModal, setShowAiKwModal] = useState(false)
  const [aiIsPrimary, setAiIsPrimary] = useState(true)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  // Fire the "analysis ready" alert exactly once; request notification permission once.
  const alertedRef = useRef(false)
  const notifReqRef = useRef(false)

  useEffect(() => {
    if (!exportMenuOpen) return
    const onClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [exportMenuOpen])

  // Chat scope follows the currently selected sidebar category by default.
  // Setting `chatScope` to null via the chat panel toggle opts into general mode.
  useEffect(() => {
    setChatScope(selectedAiCategory)
  }, [selectedAiCategory])

  // Cross-reference whether this analysis is already favorited, so the header
  // star renders in the right state. The single header star is visible across
  // all tabs (Comparison / Link Graph / AI Plan), so it doubles as the AI-plan
  // favorite — favoriting the report covers its AI plan (one favorite per report).
  useEffect(() => {
    if (!analysisId) return
    let cancelled = false
    api
      .get<{ favorites: { entity: { id: string } }[] }>("/api/favorites?entityType=competitor_analysis")
      .then((r) => {
        if (cancelled) return
        const set = new Set((r.favorites ?? []).map((f) => f.entity.id))
        setCaFavorited(set.has(analysisId))
        setCaFavReady(true)
      })
      .catch(() => { if (!cancelled) setCaFavReady(true) })
    return () => { cancelled = true }
  }, [analysisId])

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
      fetchAnalysisResults()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, analysisId])

  const fetchAnalysisResults = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

      const response = await axios.get(`${apiUrl}/api/competitor-analysis/${analysisId}`, {
        withCredentials: true,
      })

      if (response.status < 200 || response.status >= 300) throw new Error("Failed to fetch analysis results")

      // Backend wraps the payload as { analysis: {...} }; tolerate a bare
      // object too in case the envelope changes.
      const data = response.data
      const analysisData = data.analysis ?? data
      setAnalysis(analysisData)

      // Pre-populate cached AI plan if available
      if (analysisData.aiPlan) {
        setAiPlan(analysisData.aiPlan)
        if (analysisData.aiPlan.categories?.[0]) setSelectedAiCategory(analysisData.aiPlan.categories[0].id)
      }

      // Hide the full-screen loader as soon as Stage 1 is ready — the
      // comparison view can render while Stage 2 streams in the background.
      const mainReady = !!analysisData?.stages?.main?.ready || analysisData.status === "COMPLETED"
      if (mainReady) setLoading(false)

      // Alert once, the moment results become usable. A desktop notification
      // fires too if the user switched tabs during the (multi-minute) wait.
      if (mainReady && !alertedRef.current) {
        alertedRef.current = true
        const kw = keyword || analysisData.keyword || "your keyword"
        toast.success("Competitor analysis ready", { description: kw })
        if (
          typeof document !== "undefined" &&
          document.hidden &&
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          try {
            new Notification("Analysis ready", { body: `${kw} — your competitor analysis is ready to view` })
          } catch {
            /* ignore */
          }
        }
      }

      // While still processing, request desktop-notification permission once so
      // we can alert even if the user leaves the tab during the wait.
      if (
        (analysisData.status === "PENDING" || analysisData.status === "PROCESSING") &&
        !mainReady &&
        !notifReqRef.current &&
        typeof Notification !== "undefined" &&
        Notification.permission === "default"
      ) {
        notifReqRef.current = true
        void Notification.requestPermission().catch(() => undefined)
      }

      // Polling cadence: 2s while Stage 1 isn't ready (user is staring at a
      // spinner), 4s after — Stage 2 only flips per-row status flags and the
      // payload is bigger now that competitors[] streams.
      if (analysisData.status === "PENDING" || analysisData.status === "PROCESSING") {
        const cadenceMs = mainReady ? 4000 : 2000
        setTimeout(fetchAnalysisResults, cadenceMs)
      } else {
        setLoading(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load results")
      setLoading(false)
    }
  }

  const handleRecrawl = async (domain: string) => {
    setRecrawlingDomains((prev) => new Set(prev).add(domain))
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
      await axios.post(`${apiUrl}/api/competitor-analysis/${analysisId}/recrawl-domain`, { domain }, {
        withCredentials: true,
      })
    } catch {
      setRecrawlingDomains((prev) => {
        const s = new Set(prev)
        s.delete(domain)
        return s
      })
    }
  }

  useEffect(() => {
    if (recrawlingDomains.size === 0) return
    const interval = setInterval(async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
        const res = await axios.get(`${apiUrl}/api/competitor-analysis/${analysisId}`, { withCredentials: true })
        if (res.status < 200 || res.status >= 300) return
        const data = res.data
        const analysisData = data.analysis ?? data
        setAnalysis(analysisData)
        const stillPending = [...recrawlingDomains].filter((dom) => {
          const comp = analysisData.competitors?.find((c: CompetitorResult) => c.domain === dom)
          return !comp || comp.crawlMethod === null || comp.crawlMethod === undefined
        })
        setRecrawlingDomains(new Set(stillPending))
      } catch {
        /* ignore */
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [recrawlingDomains.size, analysisId])

  if (!user) return null

  // ───── Exports ─────────────────────────────────────────────────────────

  const exportCSV = () => {
    if (!analysis) return

    // Same shape as the JSON / Markdown exports — give the user the actual
    // SEO comparison columns, not just rank/domain/title. Anything that
    // doesn't fit a flat table (linkGraph, AI plan) lives in JSON/Markdown.
    const header = [
      "Rank", "Type", "Domain", "URL", "Title", "Word Count", "H1 Count", "H2 Count", "H3 Count",
      "Internal Links", "External Links", "Images", "Internal Pages Crawled",
      "Total Internal Word Count", "Avg Words / Page",
      "Diff vs. You (positions)", "Crawl Method", "Crawled At",
    ]

    const yourRow: (string | number | null)[] = [
      analysis.yourPosition, "You", analysis.yourDomain, analysis.yourUrl, "Your Website",
      analysis.yourWordCount, analysis.yourH1Count, analysis.yourH2Count, analysis.yourH3Count,
      analysis.yourInternalLinks, analysis.yourExternalLinks, analysis.yourImageCount,
      analysis.yourInternalPagesCrawled ?? null,
      analysis.yourTotalInternalWordCount ?? null,
      analysis.yourAvgWordsPerPage ?? null,
      0,
      analysis.yourFullCrawlData?.crawlMethod ?? null,
      analysis.yourFullCrawlData?.crawledAt ?? null,
    ]

    const competitorRows: (string | number | null)[][] = analysis.competitors.map((c) => [
      c.position, "Competitor", c.domain, c.url, c.title,
      c.wordCount, c.h1Count, c.h2Count, c.h3Count,
      c.internalLinks, c.externalLinks, c.imageCount,
      c.internalPagesCrawled ?? null, c.totalInternalWordCount ?? null, c.avgWordsPerPage ?? null,
      // Positive → competitor is ahead of you (their position number is
      // lower). Negative → you are ahead.
      analysis.yourPosition != null && c.position != null
        ? analysis.yourPosition - c.position
        : null,
      c.crawlMethod ?? null,
      c.crawledAt,
    ])

    // RFC 4180 escaping: only quote a cell when it contains a quote, comma,
    // or newline; double internal quotes. Blank cells stay blank (not "N/A")
    // so spreadsheet apps treat them as empty rather than literal strings.
    const escape = (cell: string | number | null | undefined): string => {
      if (cell === null || cell === undefined) return ""
      const s = String(cell)
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }

    // CRLF + UTF-8 BOM = Excel reads accents/emoji correctly and treats the
    // file as a multi-row CSV instead of one long cell.
    const csvContent =
      "﻿" +
      [header, yourRow, ...competitorRows]
        .map((row) => row.map(escape).join(","))
        .join("\r\n")

    downloadBlob(csvContent, "text/csv;charset=utf-8", "csv")
  }

  const ensureLinkGraph = async () => {
    if (linkGraphData) return linkGraphData
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
      const response = await axios.get(`${apiUrl}/api/competitor-analysis/${analysisId}/link-graph`, {
        withCredentials: true,
      })
      if (response.status >= 200 && response.status < 300) {
        const data = response.data
        // Backend returns { ready, domains: [...] }; older callers expected an array.
        const domains = Array.isArray(data) ? data : (data?.domains || [])
        setLinkGraphData(domains)
        return domains
      }
    } catch {
      /* ignore — caller proceeds without link graph */
    }
    return null
  }

  const downloadBlob = (content: string, mime: string, ext: string) => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `competitor-analysis-${keyword.replace(/\s+/g, "-")}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportMarkdown = async () => {
    if (!analysis) return
    const linkGraph = await ensureLinkGraph()
    const md = buildMarkdownExport({
      analysis,
      linkGraph,
      aiPlan: aiPlan ?? null,
      exportedAt: new Date().toISOString(),
    })
    downloadBlob(md, "text/markdown;charset=utf-8", "md")
  }

  const exportJSON = async () => {
    if (!analysis) return
    const linkGraph = await ensureLinkGraph()
    const exportData = {
      exportedAt: new Date().toISOString(),
      keyword,
      analysis,
      internalLinkGraph: linkGraph,
      aiPlan: aiPlan ?? null,
    }
    downloadBlob(JSON.stringify(exportData, null, 2), "application/json", "json")
  }

  const fetchLinkGraph = async () => {
    if (!analysisId) return
    setLinkGraphLoading(true)
    setLinkGraphError("")
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
      const response = await axios.get(`${apiUrl}/api/competitor-analysis/${analysisId}/link-graph`, {
        withCredentials: true,
      })
      if (response.status < 200 || response.status >= 300) throw new Error("Failed to fetch link graph")
      const data = response.data
      // Backend wraps the result as { ready, domains: [...] }. Tolerate both
      // shapes so the frontend keeps working during a rolling deploy.
      setLinkGraphData(Array.isArray(data) ? data : (data?.domains || []))
    } catch (err) {
      setLinkGraphError(err instanceof Error ? err.message : "Failed to load link graph")
    } finally {
      setLinkGraphLoading(false)
    }
  }

  const fetchAiPlan = async (opts: { forceRegenerate?: boolean; isPrimaryKeyword?: boolean } = {}) => {
    if (!analysisId) return
    setAiPlanLoading(true)
    setAiPlanError("")
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
      const response = await axios.post(`${apiUrl}/api/competitor-analysis/${analysisId}/ai-plan`, {
        forceRegenerate: opts.forceRegenerate ?? false,
        ...(opts.isPrimaryKeyword !== undefined ? { isPrimaryKeyword: opts.isPrimaryKeyword } : {}),
      }, {
        withCredentials: true,
      })
      if (response.status < 200 || response.status >= 300) {
        const data = response.data ?? {}
        throw new Error(data.error || "Failed to generate AI plan")
      }
      const data = response.data
      setAiPlan(data)
      if (data.categories?.[0]) setSelectedAiCategory(data.categories[0].id)
    } catch (err) {
      setAiPlanError(err instanceof Error ? err.message : "Failed to generate AI plan")
    } finally {
      setAiPlanLoading(false)
    }
  }

  if (authLoading || (!user && !error)) {
    return (
      <div className="page" style={{ color: "var(--text-mute)", fontSize: 13, padding: 60, textAlign: "center" }}>
        Loading…
      </div>
    )
  }

  const internalReady = !!analysis?.stages?.internal?.ready || analysis?.status === "COMPLETED"
  // The AI plan is generated right after the main-page crawl (Phase 1), independent
  // of the slower internal-link crawl (Phase 2) — so it's available as soon as the
  // main stage is ready. Gate the AI tab on this, NOT on internalReady.
  const aiReady = !!analysis?.stages?.main?.ready || analysis?.status === "COMPLETED"

  return (
    <div className="page">
      {/* Header */}
      <div className="page-h" style={{ alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <Link href={`/dashboard/project/${projectId}/keywords`} className="kd-back" style={{ display: "flex", width: "fit-content", marginBottom: 10 }}>
            ← Back to keywords
          </Link>
          <h1>Analysis results</h1>
          <div className="sub">
            Keyword: <span className="b" style={{ color: "var(--text)" }}>{keyword || analysis?.keyword || "—"}</span>
            {analysis?.yourDomain && (
              <>
                {" · "}
                <span className="mono">{analysis.yourDomain}</span>
              </>
            )}
          </div>
        </div>
        <div className="row" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
          {analysis && analysisId && (
            <FavoriteButton
              key={`cafav-${caFavReady}`}
              entityType="competitor_analysis"
              entityId={analysisId}
              initial={caFavorited}
              size={18}
              onChange={setCaFavorited}
            />
          )}
          {analysis && analysis.status === "COMPLETED" && (
            <>
              <div ref={exportMenuRef} style={{ position: "relative" }}>
                <button className="btn" onClick={() => setExportMenuOpen((o) => !o)} aria-expanded={exportMenuOpen}>
                  <Icon.download /> Export
                </button>
                {exportMenuOpen && (
                  <div
                    style={{
                      position: "absolute",
                      right: 0,
                      top: "100%",
                      marginTop: 6,
                      minWidth: 180,
                      background: "var(--bg-elev)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--r-md)",
                      boxShadow: "var(--shadow-md)",
                      padding: 4,
                      zIndex: 40,
                    }}
                  >
                    {[
                      { label: "Export CSV", fn: exportCSV },
                      { label: "Export JSON", fn: exportJSON },
                      { label: "Export Markdown", fn: exportMarkdown },
                    ].map((opt, idx) => (
                      <button
                        key={opt.label}
                        onClick={() => { setExportMenuOpen(false); opt.fn() }}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 10px",
                          background: "transparent",
                          border: "none",
                          borderRadius: 6,
                          color: "var(--text)",
                          fontSize: 13,
                          cursor: "pointer",
                          borderTop: idx > 0 ? "1px solid var(--border)" : undefined,
                          marginTop: idx > 0 ? 2 : 0,
                          paddingTop: idx > 0 ? 10 : 8,
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button className="btn" onClick={() => setShareDialogOpen(true)}>
                Share report
              </button>
            </>
          )}
        </div>
      </div>

      <ShareReportDialog
        analysisId={analysisId}
        keyword={keyword}
        isOpen={shareDialogOpen}
        onClose={() => setShareDialogOpen(false)}
      />

      {/* Loading state — visible until Stage 1 (main pages) is ready. Once
          main is ready the comparison view renders below and this banner is
          replaced by the Stage 2 progress strip. */}
      {loading && (
        <div className="card oa-fade-up" style={{ padding: 32, marginBottom: 14 }}>
          <div className="col" style={{ alignItems: "center", gap: 18 }}>
            {/* Rotating gradient ring + pulse rings around a brand disc. */}
            <div className="ca-loader" aria-hidden>
              <span className="ca-loader-ring" />
              <span className="ca-loader-icon"><Icon.spark /></span>
            </div>
            <div className="eyebrow" style={{ justifyContent: "center" }}>
              <span className="spark"><Icon.spark /></span> ANALYSIS IN PROGRESS
            </div>
            <div className="b" style={{ fontSize: 18, textAlign: "center" }}>
              {analysis?.status === "PROCESSING" ? "Crawling competitor pages…" : "Starting analysis…"}
            </div>
            <div className="tiny muted" style={{ maxWidth: 420, textAlign: "center" }}>
              This may take a few minutes while we analyze each website. You can leave this
              tab — we&apos;ll notify you when it&apos;s ready.
            </div>

            {/* Staged checklist — shows what's happening and what's next. */}
            {(() => {
              const mainDone = !!analysis?.stages?.main?.ready || analysis?.status === "COMPLETED"
              const internalDone = !!analysis?.stages?.internal?.ready || analysis?.status === "COMPLETED"
              const steps: { label: string; done: boolean; active: boolean }[] = [
                { label: "Crawling competitor pages", done: mainDone, active: !mainDone },
                { label: "Generating AI plan", done: mainDone, active: false },
                { label: "Mapping internal links", done: internalDone, active: mainDone && !internalDone },
              ]
              return (
                <div className="col ca-steps" style={{ gap: 4, width: "100%", maxWidth: 360 }}>
                  {steps.map((s) => (
                    <div
                      key={s.label}
                      className="row"
                      style={{
                        gap: 10,
                        alignItems: "center",
                        padding: "10px 12px",
                        borderRadius: 10,
                        background: s.active ? "var(--brand-soft)" : "transparent",
                        transition: "background .2s ease",
                      }}
                    >
                      <span
                        style={{
                          width: 18,
                          height: 18,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          color: s.done ? "var(--pos)" : s.active ? "var(--brand)" : "var(--text-mute)",
                        }}
                      >
                        {s.done ? <Icon.check /> : s.active ? <span className="spin" style={{ display: "inline-flex" }}><Icon.refresh /></span> : <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", opacity: 0.5 }} />}
                      </span>
                      <span style={{ fontSize: 13, color: s.done || s.active ? "var(--text)" : "var(--text-mute)", fontWeight: s.active ? 600 : 500 }}>
                        {s.label}
                      </span>
                      {s.active && (
                        <span className="tiny" style={{ marginLeft: "auto", color: "var(--brand)", fontWeight: 600 }}>
                          working…
                        </span>
                      )}
                      {s.done && (
                        <span className="tiny" style={{ marginLeft: "auto", color: "var(--pos)", fontWeight: 600 }}>
                          done
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )
            })()}

            {/* SEO quote of the day — keeps the wait from feeling empty. */}
            <SeoQuoteOfDay />

            {(() => {
              const progress = analysis?.progress
              if (!progress || progress.total <= 0) return null
              const pages = progress.currentPages
              return (
                <div style={{ width: "100%", maxWidth: 640 }}>
                  <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                    <span className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 10 }}>
                      Progress
                    </span>
                    <span className="tiny mono" style={{ color: "var(--brand)" }}>
                      {progress.crawled} / {progress.total}
                    </span>
                  </div>
                  <div className="bar thick">
                    <span style={{ width: `${(progress.crawled / progress.total) * 100}%` }} />
                  </div>

                  {/* Crawl log */}
                  <div
                    style={{
                      marginTop: 18,
                      border: "1px solid var(--border)",
                      borderRadius: "var(--r-md)",
                      overflow: "hidden",
                      background: "var(--bg)",
                    }}
                  >
                    <div
                      style={{
                        padding: "10px 14px",
                        borderBottom: "1px solid var(--border)",
                        background: "var(--bg-sub)",
                      }}
                    >
                      <span className="tiny" style={{ textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 10, color: "var(--brand)", fontWeight: 600 }}>
                        Crawl log
                      </span>
                    </div>
                    <div style={{ maxHeight: 260, overflowY: "auto" }}>
                      {pages.map((page, i) => {
                        const dot = page.status === "completed"
                          ? "var(--pos)"
                          : page.status === "failed"
                            ? "var(--neg)"
                            : "var(--text-mute)"
                        const chipCls = page.status === "failed"
                          ? "chip neg"
                          : page.status === "pending"
                            ? "chip"
                            : null
                        return (
                          <div
                            key={i}
                            className="row"
                            style={{
                              alignItems: "flex-start",
                              padding: "10px 14px",
                              borderBottom: i < pages.length - 1 ? "1px solid var(--border)" : "none",
                            }}
                          >
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: dot,
                                flexShrink: 0,
                                marginTop: 5,
                                animation: page.status === "pending" ? "shim 1.4s ease-in-out infinite" : undefined,
                              }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                                <span className="sm mono">{page.domain}</span>
                                {chipCls && <span className={chipCls} style={{ fontSize: 10 }}>{page.status}</span>}
                              </div>
                              <div
                                className="tiny muted mono"
                                style={{ marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                              >
                                {page.url}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {progress.failed > 0 && (
                    <div
                      className="card tight"
                      style={{
                        marginTop: 12,
                        borderColor: "var(--warn)",
                        background: "var(--warn-soft)",
                        color: "var(--warn)",
                        fontSize: 12,
                      }}
                    >
                      {progress.failed} page{progress.failed === 1 ? "" : "s"} failed to crawl — analysis will continue with available data.
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div
          className="card tight"
          style={{
            marginBottom: 14,
            borderColor: "var(--neg)",
            background: "var(--neg-soft)",
            color: "var(--neg)",
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {/* Stage 2 progress banner — shown while internal-link analysis is
          still running. The comparison view renders below regardless. */}
      {analysis && analysis.status !== "FAILED" && (analysis.stages?.main?.ready || analysis.status === "COMPLETED") && analysis.stages?.internal && !analysis.stages.internal.ready && (
        <div
          className="card tight"
          style={{
            marginBottom: 14,
            borderColor: "var(--brand)",
            background: "var(--brand-soft)",
            color: "var(--brand)",
          }}
        >
          <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "var(--brand)",
                marginTop: 5,
                flexShrink: 0,
                animation: "shim 1.4s ease-in-out infinite",
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                <span className="b" style={{ fontSize: 13, color: "var(--brand)" }}>Analyzing internal links</span>
                <span className="tiny mono" style={{ color: "var(--brand)" }}>
                  {analysis.stages.internal.done} / {analysis.stages.internal.total} domains
                  {analysis.stages.internal.failed > 0 && (
                    <span style={{ color: "var(--neg)", marginLeft: 8 }}>· {analysis.stages.internal.failed} failed</span>
                  )}
                </span>
              </div>
              <div className="bar">
                <span
                  style={{
                    width: `${analysis.stages.internal.total > 0
                      ? ((analysis.stages.internal.done + analysis.stages.internal.failed) / analysis.stages.internal.total) * 100
                      : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results — render as soon as Stage 1 finishes. Hidden on FAILED so
          the user sees only the failure banner. */}
      {analysis && analysis.status !== "FAILED" && (analysis.stages?.main?.ready || analysis.status === "COMPLETED") && (
        <>
          {/* Partial-analysis notice — free users get one full analysis/day. */}
          {analysis.access?.partial && (
            <div
              className="card tight"
              style={{
                marginBottom: 14,
                borderColor: "var(--brand)",
                background: "var(--brand-soft)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div className="row" style={{ gap: 10, alignItems: "flex-start", minWidth: 0 }}>
                <span style={{ color: "var(--brand)", flexShrink: 0, marginTop: 1 }}><Icon.spark /></span>
                <div style={{ minWidth: 0 }}>
                  <div className="b" style={{ fontSize: 13 }}>Partial analysis</div>
                  <div className="tiny muted" style={{ marginTop: 2 }}>
                    You&apos;ve used today&apos;s full competitor analysis. This one shows the audit summary,
                    On-Page SEO, and the full comparison — internal links and the rest of the AI plan are limited.
                    Upgrade for unlimited full analyses.
                  </div>
                </div>
              </div>
              <Link href="/pricing?clicked-buy-button" style={{ flexShrink: 0 }}>
                <button className="btn primary sm">Upgrade</button>
              </Link>
            </div>
          )}
          <div className="tabs">
            <button
              className={"tab " + (activeResultTab === "comparison" ? "active" : "")}
              onClick={() => setActiveResultTab("comparison")}
            >
              Comparison
            </button>
            <button
              className={"tab " + (activeResultTab === "link-graph" ? "active" : "")}
              onClick={() => {
                setActiveResultTab("link-graph")
                if (!linkGraphData && !linkGraphLoading) fetchLinkGraph()
              }}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Icon.chart /> Internal links
            </button>
            <button
              className={"tab " + (activeResultTab === "ai-plan" ? "active" : "")}
              onClick={() => {
                if (!aiReady) return
                setActiveResultTab("ai-plan")
                if (!aiPlan && !aiPlanLoading) {
                  setAiIsPrimary(true)
                  setShowAiKwModal(true)
                }
              }}
              disabled={!aiReady}
              title={!aiReady ? "Available once the main-page analysis completes" : undefined}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, opacity: aiReady ? 1 : 0.4, cursor: aiReady ? "pointer" : "not-allowed" }}
            >
              <Icon.ai /> AI plan
              {!aiReady && (
                <span className="tiny muted" style={{ textTransform: "none", letterSpacing: 0, fontSize: 10 }}>
                  (soon)
                </span>
              )}
            </button>
          </div>

          {activeResultTab === "comparison" && (
            <CompetitorComparisonTable analysis={analysis} onRecrawl={handleRecrawl} recrawlingDomains={recrawlingDomains} />
          )}

          {activeResultTab === "link-graph" && (
            <div className="card">
              {!internalReady && (
                <div
                  className="card tight"
                  style={{
                    marginBottom: 14,
                    borderColor: "var(--brand)",
                    background: "var(--brand-soft)",
                    color: "var(--brand)",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
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
                    Internal-link analysis still running ({analysis.stages?.internal?.done ?? 0}/{analysis.stages?.internal?.total ?? 0} domains)
                  </span>
                  <button className="btn sm" style={{ marginLeft: "auto" }} onClick={() => fetchLinkGraph()}>
                    Refresh
                  </button>
                </div>
              )}
              {linkGraphLoading && (
                <div style={{ padding: 60, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
                  Loading link graph…
                </div>
              )}
              {linkGraphError && (
                <div
                  className="card tight"
                  style={{ borderColor: "var(--neg)", background: "var(--neg-soft)", color: "var(--neg)", fontSize: 12 }}
                >
                  {linkGraphError}
                </div>
              )}
              {linkGraphData && !linkGraphLoading && (
                <InternalLinkGraph
                  data={[...(linkGraphData ?? [])].sort((a, b) => (b.isOwnSite ? 1 : 0) - (a.isOwnSite ? 1 : 0))}
                />
              )}
            </div>
          )}

          {activeResultTab === "ai-plan" && (
            <>
              {aiPlanLoading && (
                <div className="card" style={{ padding: 60, textAlign: "center" }}>
                  <div className="eyebrow" style={{ justifyContent: "center" }}>
                    <span className="spark"><Icon.spark /></span> GENERATING PLAN
                  </div>
                  <div className="b" style={{ fontSize: 16, marginTop: 6 }}>Generating your AI plan…</div>
                  <div className="tiny muted" style={{ marginTop: 6 }}>
                    Analyzing competitor data with DeepSeek AI
                  </div>
                </div>
              )}
              {aiPlanError && !aiPlanLoading && (
                <div className="card" style={{ padding: 40, textAlign: "center" }}>
                  <div
                    className="card tight"
                    style={{
                      maxWidth: 480,
                      margin: "0 auto 16px",
                      borderColor: "var(--neg)",
                      background: "var(--neg-soft)",
                      color: "var(--neg)",
                      fontSize: 12,
                    }}
                  >
                    {aiPlanError}
                  </div>
                  <button
                    className="btn"
                    onClick={() => { setAiPlanError(""); setAiIsPrimary(true); setShowAiKwModal(true) }}
                  >
                    <Icon.refresh /> Retry
                  </button>
                </div>
              )}
              {!aiPlan && !aiPlanLoading && !aiPlanError && (
                <div className="card" style={{ padding: 48, textAlign: "center" }}>
                  <div className="eyebrow" style={{ justifyContent: "center" }}><span className="spark"><Icon.ai /></span> AI PLAN</div>
                  <div className="b" style={{ fontSize: 16, marginTop: 6 }}>Generate your AI plan</div>
                  <div className="tiny muted" style={{ marginTop: 6, maxWidth: 380, marginLeft: "auto", marginRight: "auto" }}>
                    Confirm whether this is your page’s primary keyword and we’ll generate a prioritized SEO action plan for this page.
                  </div>
                  <button
                    className="btn primary"
                    style={{ marginTop: 16 }}
                    onClick={() => { setAiIsPrimary(true); setShowAiKwModal(true) }}
                  >
                    <Icon.ai /> Generate AI plan
                  </button>
                </div>
              )}
              {aiPlan && !aiPlanLoading && (
                <>
                  {/* Summary card */}
                  <div className="ai-summary">
                    <div className="lbl">
                      <Icon.ai /> AI SUMMARY
                    </div>
                    <p>{aiPlan.summary}</p>
                  </div>

                  {aiPlan.strengths && aiPlan.strengths.length > 0 && (
                    <div style={{ marginTop: 14, padding: "14px 16px", borderRadius: "var(--r-md)", background: "var(--pos-soft)" }}>
                      <div className="row" style={{ gap: 6, marginBottom: 8, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--pos)" }}>
                        <Icon.check /> {"What's working well"}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                        {aiPlan.strengths.map((s, i) => (
                          <div key={i} className="row" style={{ gap: 8, alignItems: "flex-start", fontSize: 13, color: "var(--text)" }}>
                            <span style={{ color: "var(--pos)", flexShrink: 0, marginTop: 2, display: "inline-flex" }}><Icon.check /></span>
                            <span>{s}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Categories sidebar + tasks layout */}
                  <div className="ap-grid">
                    <div className="ap-cats">
                      <div className="ttl">Recommendation Categories</div>
                      {aiPlan.categories.map((cat, idx) => (
                        <button
                          key={cat.id}
                          onClick={() => setSelectedAiCategory(cat.id)}
                          className={"ap-cat " + (selectedAiCategory === cat.id ? "active" : "")}
                        >
                          <span className="nm">{String(idx + 1).padStart(2, "0")}</span>
                          <div>
                            <div className="lbl">{cat.name}</div>
                            <div className="sub">{cat.taskCount} task{cat.taskCount === 1 ? "" : "s"}</div>
                          </div>
                        </button>
                      ))}
                      {aiPlan.free && aiPlan.lockedCategories?.map((cat, idx) => (
                        <div
                          key={cat.id}
                          className="ap-cat"
                          style={{ opacity: 0.5, cursor: "not-allowed" }}
                          title="Upgrade to Paid to unlock this section"
                        >
                          <span className="nm">{String(aiPlan.categories.length + idx + 1).padStart(2, "0")}</span>
                          <div>
                            <div className="lbl" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                              </svg>
                              {cat.name}
                            </div>
                            <div className="sub">Paid — upgrade to unlock</div>
                          </div>
                        </div>
                      ))}
                      {aiPlan.free && (
                        <Link href="/pricing?clicked-buy-button" style={{ display: "block", marginTop: 12 }}>
                          <button className="btn primary" style={{ width: "100%" }}>
                            Upgrade to unlock full plan
                          </button>
                        </Link>
                      )}
                    </div>

                    <div className="ap-detail">
                      {(() => {
                        const activeCat =
                          aiPlan.categories.find((c) => c.id === selectedAiCategory) || aiPlan.categories[0]
                        if (!activeCat) return null
                        return (
                          <>
                            <div className="ap-detail-h">
                              <div className="row" style={{ gap: 10 }}>
                                {activeCat.icon && <span style={{ fontSize: 22 }}>{activeCat.icon}</span>}
                                <div>
                                  <div className="t">{activeCat.name}</div>
                                  <div className="s">Top recommendations for you</div>
                                </div>
                              </div>
                            </div>
                            {activeCat.tasks.map((task, i) => {
                              const impCls = task.priority === "HIGH" ? "high" : task.priority === "MEDIUM" ? "med" : "low"
                              return (
                                <div key={i} className="ap-task">
                                  <span className="nm">{String(i + 1).padStart(2, "0")}</span>
                                  <div>
                                    <div className="ttl">{task.recommendation}</div>
                                    {task.details && <div className="desc">{task.details}</div>}
                                    {task.impact && <div className="why">{task.impact}</div>}
                                  </div>
                                  <span className={"imp " + impCls}>{task.priority}</span>
                                </div>
                              )
                            })}
                          </>
                        )
                      })()}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}

      {/* Failed state */}
      {analysis && analysis.status === "FAILED" && (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <div className="eyebrow" style={{ justifyContent: "center", color: "var(--neg)" }}>
            ANALYSIS FAILED
          </div>
          <div className="b" style={{ fontSize: 16, marginTop: 6 }}>Something went wrong</div>
          <div className="tiny muted" style={{ marginTop: 6, maxWidth: 380, marginLeft: "auto", marginRight: "auto" }}>
            The analysis didn't complete. You can try again from the keyword's "Improve ranking?" action.
          </div>
          <button
            className="btn primary"
            style={{ marginTop: 16 }}
            onClick={() =>
              router.push(`/dashboard/project/${projectId}/competitor-analysis?keyword=${encodeURIComponent(keyword)}`)
            }
          >
            Try again
          </button>
        </div>
      )}

      {/* Floating AI chat — paid users get the real panel, free users get an
          upsell launcher. Both only show on the AI Plan tab once a plan has
          loaded. */}
      {aiPlan && activeResultTab === "ai-plan" && (
        analysis?.access?.chatEnabled ? (
          <AiChatPanel
            analysisId={analysisId}
            selectedCategory={chatScope}
            categories={aiPlan.categories}
            onScopeChange={setChatScope}
          />
        ) : (
          <AskAnalystUpsell />
        )
      )}

      {/* AI plan keyword popup — asks whether the tracked keyword is the page's
          primary target, then generates the plan with that weighting. */}
      {showAiKwModal && (
        <div className="modal-bg" onClick={() => setShowAiKwModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-h">
              <div>
                <div className="eyebrow" style={{ margin: 0, fontSize: 11 }}><span className="spark"><Icon.ai /></span> AI PLAN</div>
                <div className="b" style={{ fontSize: 18, marginTop: 4 }}>Confirm your keyword</div>
              </div>
              <button onClick={() => setShowAiKwModal(false)} className="icon-btn" aria-label="Close"><Icon.close /></button>
            </div>
            <div className="modal-b" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <p className="tiny" style={{ margin: 0, lineHeight: 1.5 }}>
                Is <span className="b" style={{ color: "var(--text)" }}>“{keyword || analysis?.keyword}”</span> your page’s primary keyword
                (the main keyword you want it to rank for)?
              </p>
              <div className="pill-toggle" style={{ width: "fit-content" }}>
                <button
                  type="button"
                  className={aiIsPrimary ? "active" : ""}
                  onClick={() => setAiIsPrimary(true)}
                >
                  Yes
                </button>
                <button
                  type="button"
                  className={!aiIsPrimary ? "active" : ""}
                  onClick={() => setAiIsPrimary(false)}
                >
                  No
                </button>
              </div>
              <p className="tiny muted" style={{ margin: 0, lineHeight: 1.5 }}>
                {aiIsPrimary
                  ? "We’ll weight this keyword in the analysis and prioritize recommendations toward it."
                  : "We’ll treat it as one of several ranking signals and won’t give it extra weight."}
              </p>
            </div>
            <div className="modal-f">
              <button className="btn" onClick={() => setShowAiKwModal(false)}>Cancel</button>
              <button
                className="btn primary"
                onClick={() => {
                  setShowAiKwModal(false)
                  void fetchAiPlan({ forceRegenerate: !!aiPlan, isPrimaryKeyword: aiIsPrimary })
                }}
              >
                <Icon.ai /> Generate AI plan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CompetitorAnalysisResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="page" style={{ color: "var(--text-mute)", fontSize: 13, padding: 60, textAlign: "center" }}>
          Loading…
        </div>
      }
    >
      <CompetitorAnalysisResultsContent />
    </Suspense>
  )
}
