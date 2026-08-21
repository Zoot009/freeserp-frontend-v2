"use client"

import React, { useState, useEffect, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/lib/auth"
import { api } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"
import { FavoriteButton } from "@/components/dashboard/favorite-button"
import { CompetitorComparisonTable } from "@/components/competitor-comparison-table"
import { ShareReportDialog } from "@/components/share-report-dialog"
import { SeoQuoteOfDay } from "@/components/seo-quote"
import type { AnalysisData, CompetitorResult } from "@/types/competitor-analysis"
import { buildMarkdownExport } from "@/lib/competitor-analysis-export"
import axios from "@/lib/axios"
import { toast } from "sonner"

function CompetitorAnalysisResultsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()

  // Standalone route — no project context. analysisId / keyword travel in the
  // query string because they vary per analysis run.
  const analysisId = searchParams.get("analysisId") || ""
  const keyword = searchParams.get("keyword") || ""

  const [analysis, setAnalysis] = useState<AnalysisData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [recrawlingDomains, setRecrawlingDomains] = useState<Set<string>>(new Set())
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  // Favorite state for this analysis. caFavReady flips once the cross-reference
  // fetch resolves so the star can remount with the correct initial value.
  const [caFavorited, setCaFavorited] = useState(false)
  const [caFavReady, setCaFavReady] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  // Fire the "analysis ready" alert exactly once; request notification permission once.
  const alertedRef = useRef(false)
  const notifReqRef = useRef(false)
  // Whether any poll has ever succeeded — read instead of the `analysis` state
  // inside fetchAnalysisResults's recursive setTimeout chain, since that
  // closure is captured once (at the effect that kicked off polling) and would
  // otherwise always see the initial null.
  const hasLoadedRef = useRef(false)

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

  // Cross-reference whether this analysis is already favorited, so the header
  // star renders in the right state.
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

      // A prior poll attempt may have failed transiently and left `error` set —
      // clear it now that a poll has actually succeeded, so the banner doesn't
      // stick around forever while later polls keep the view updating fine.
      setError("")
      hasLoadedRef.current = true

      // Backend wraps the payload as { analysis: {...} }; tolerate a bare
      // object too in case the envelope changes.
      const data = response.data
      const analysisData = data.analysis ?? data
      setAnalysis(analysisData)

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
      // spinner), 4s after.
      if (analysisData.status === "PENDING" || analysisData.status === "PROCESSING") {
        const cadenceMs = mainReady ? 4000 : 2000
        setTimeout(fetchAnalysisResults, cadenceMs)
      } else {
        setLoading(false)
      }
    } catch (err) {
      if (!hasLoadedRef.current) {
        // Never got a single successful poll — a real problem (bad ID, auth,
        // analysis not found), so surface it and stop.
        setError(err instanceof Error ? err.message : "Failed to load results")
        setLoading(false)
        return
      }
      // Already have data on screen — this is a transient blip mid-poll.
      // Keep polling quietly instead of killing the loop and leaving a
      // scary banner over data that's actually fine.
      setTimeout(fetchAnalysisResults, 4000)
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
    // SEO comparison columns, not just rank/domain/title.
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

  const downloadBlob = (content: string, mime: string, ext: string) => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `competitor-analysis-${keyword.replace(/\s+/g, "-")}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportMarkdown = () => {
    if (!analysis) return
    const md = buildMarkdownExport({
      analysis,
      linkGraph: null,
      aiPlan: null,
      exportedAt: new Date().toISOString(),
    })
    downloadBlob(md, "text/markdown;charset=utf-8", "md")
  }

  const exportJSON = () => {
    if (!analysis) return
    const exportData = {
      exportedAt: new Date().toISOString(),
      keyword,
      analysis,
    }
    downloadBlob(JSON.stringify(exportData, null, 2), "application/json", "json")
  }

  if (authLoading || (!user && !error)) {
    return (
      <div className="page" style={{ color: "var(--text-mute)", fontSize: 13, padding: 60, textAlign: "center" }}>
        Loading…
      </div>
    )
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="page-h" style={{ alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <Link href="/dashboard/competitor-analysis" className="kd-back" style={{ display: "flex", width: "fit-content", marginBottom: 10 }}>
            ← Back to Competitor Analysis
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

      {/* Loading state — visible until Stage 1 (main pages) is ready. */}
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
                    On-Page SEO, and the full comparison. Upgrade for unlimited full analyses.
                  </div>
                </div>
              </div>
              <Link href="/pricing?clicked-buy-button" style={{ flexShrink: 0 }}>
                <button className="btn primary sm">Upgrade</button>
              </Link>
            </div>
          )}

          <CompetitorComparisonTable analysis={analysis} onRecrawl={handleRecrawl} recrawlingDomains={recrawlingDomains} />
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
            The analysis didn't complete. You can try again below.
          </div>
          <button
            className="btn primary"
            style={{ marginTop: 16 }}
            onClick={() =>
              router.push(`/dashboard/competitor-analysis?keyword=${encodeURIComponent(keyword)}`)
            }
          >
            Try again
          </button>
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
