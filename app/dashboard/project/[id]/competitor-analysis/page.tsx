"use client"

import { useState, useEffect, Suspense } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/lib/auth"
import { useTutorial } from "@/lib/tutorial"
import { Icon } from "@/components/dashboard/icons"
import { PosBadge } from "@/components/dashboard/primitives"
import { http } from "@/lib/http"

interface SerpCompetitor {
  position: number
  domain: string
  url: string
  title: string
  snippet: string
}

// Stable per-domain hue so the favicon-style swatch matches across renders
// and lines up visually with how the keyword-detail SERP tab colours its rows.
function domainColor(domain: string): string {
  const palette = ["#2D5BFF", "#F59E0B", "#10B981", "#EC4899", "#8B5CF6", "#06B6D4", "#F97316"]
  let h = 0
  for (let i = 0; i < domain.length; i++) h = (h * 31 + domain.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

// Build a Google-style "host › path › to › page" breadcrumb from a URL.
// Falls back to the host + path stripped of protocol if parsing fails.
function breadcrumbFor(url: string): string {
  const stripped = url.replace(/^https?:\/\//, "")
  try {
    const u = new URL(url)
    const parts = u.pathname.split("/").filter(Boolean).slice(0, 3)
    const decoded = parts.map((p) => {
      try { return decodeURIComponent(p) } catch { return p }
    })
    const host = u.hostname.replace(/^www\./, "")
    return decoded.length > 0 ? `${host} › ${decoded.join(" › ")}` : host
  } catch {
    return stripped
  }
}

// Own-domain test reused by render + Select-Top-3 — normalise both sides
// (lowercase, strip leading www.) and accept subdomain matches so
// "blog.example.com" still reads as the user's site when their project is
// "example.com".
function isOwn(competitorDomain: string, yourDomain: string): boolean {
  if (!yourDomain) return false
  const a = competitorDomain.toLowerCase().replace(/^www\./, "")
  const b = yourDomain.toLowerCase().replace(/^www\./, "")
  return a === b || a.endsWith(`.${b}`) || a.includes(b)
}

function CompetitorAnalysisContent() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const { advanceFromStep } = useTutorial()

  // Project id comes from the path (/dashboard/project/[id]/competitor-analysis).
  // Keyword + keywordId still travel in the query string because they vary
  // per-call. Domain is fetched from the keyword-detail response below so the
  // URL only carries identifiers, not redundant data.
  const projectId = (params?.id as string) || ""
  const keyword = searchParams.get("keyword") || ""
  const keywordId = searchParams.get("keywordId") || ""
  const [domain, setDomain] = useState("")

  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState("")
  const [serpCompetitors, setSerpCompetitors] = useState<SerpCompetitor[]>([])
  const [loadingSerpData, setLoadingSerpData] = useState(false)
  const [selectedSerpDomains, setSelectedSerpDomains] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!authLoading && !user) router.push("/login")
  }, [user, authLoading, router])

  // Fetch SERP competitors if keywordId is provided.
  useEffect(() => {
    const fetchSerpData = async () => {
      if (authLoading || !user || !keywordId || !projectId) return

      setLoadingSerpData(true)
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
        const response = await http.get(`${apiUrl}/api/projects/${projectId}/keywords/${keywordId}/detail`, {
          withCredentials: true,
        })

        if (response.status >= 200 && response.status < 300) {
          const data = response.data
          // The detail endpoint includes the keyword's project so we can hydrate
          // the domain without an extra round-trip / query param.
          if (data.project?.domain) setDomain(data.project.domain)
          if (data.latestCheck?.competitors) setSerpCompetitors(data.latestCheck.competitors)
        }
      } catch (err) {
        console.error("Failed to fetch SERP data:", err)
      } finally {
        setLoadingSerpData(false)
      }
    }

    fetchSerpData()
  }, [keywordId, projectId, user, authLoading])

  const toggleSerpDomain = (d: string) => {
    const newSelected = new Set(selectedSerpDomains)
    if (newSelected.has(d)) {
      newSelected.delete(d)
    } else {
      // Cap at 3 competitors. The CTA also disables until exactly 3 are
      // selected, but we still surface the cap inline if the user keeps
      // clicking past it.
      if (newSelected.size >= 3) {
        setError("You can only select up to 3 competitors.")
        return
      }
      newSelected.add(d)
    }
    setSelectedSerpDomains(newSelected)
    setError("")
  }

  const handleSelectAll = () => {
    // Acts as a Clear when already at the cap; otherwise picks the first
    // three non-self competitors.
    if (selectedSerpDomains.size >= 3) {
      setSelectedSerpDomains(new Set())
    } else {
      const competitorsOnly = serpCompetitors.filter((c) => !isOwn(c.domain, domain))
      setSelectedSerpDomains(new Set(competitorsOnly.slice(0, 3).map((c) => c.domain)))
    }
    setError("")
  }

  const handleAnalyze = async () => {
    setError("")
    const selectedCompetitors = Array.from(selectedSerpDomains)
    if (selectedCompetitors.length !== 3) {
      setError("Please select exactly 3 competitors from the SERP results.")
      return
    }

    setIsAnalyzing(true)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

      const response = await http.post(`${apiUrl}/api/competitor-analysis`, {
        yourDomain: domain,
        keyword,
        selectedDomains: selectedCompetitors,
        projectId,
        keywordId,
      }, {
        withCredentials: true,
      })

      if (response.status < 200 || response.status >= 300) {
        const errorData = response.data ?? {}
        throw new Error(errorData.error || "Failed to start competitor analysis")
      }

      const { analysis } = response.data
      const analysisId = analysis?.id ?? analysis?.analysisId

      // Tutorial step 6 → 7 (done)
      advanceFromStep(6)

      router.push(`/dashboard/project/${projectId}/competitor-analysis/results?analysisId=${analysisId}&keyword=${encodeURIComponent(keyword)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start analysis")
      setIsAnalyzing(false)
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

  const ownDomainPresent = serpCompetitors.some((c) => isOwn(c.domain, domain))

  return (
    <div className="page">
      {/* Header */}
      <div className="page-h" style={{ alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <Link href={`/dashboard/project/${projectId}/keywords`} className="kd-back" style={{ display: "inline-flex" }}>
            ← Back to keywords
          </Link>
          <div className="eyebrow" style={{ marginTop: 4 }}><span className="spark"><Icon.spark /></span> COMPETITOR ANALYSIS</div>
          <h1>Select competitors</h1>
          <div className="sub">
            Pick 3 SERP results for{" "}
            <span className="b" style={{ color: "var(--text)" }}>“{keyword}”</span>{" "}
            to compare against{" "}
            <span className="b mono" style={{ color: "var(--text)" }}>{domain || "your site"}</span>.
            {ownDomainPresent && " Your own site will be included automatically."}
          </div>
        </div>
        <div className="row" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn"
            onClick={() => router.push(`/dashboard/project/${projectId}/keywords`)}
            disabled={isAnalyzing}
          >
            Cancel
          </button>
          <button
            type="button"
            data-tutorial="analyze-btn"
            onClick={handleAnalyze}
            disabled={isAnalyzing || selectedSerpDomains.size !== 3 || serpCompetitors.length === 0}
            className="btn primary"
          >
            {isAnalyzing ? (
              "Analyzing…"
            ) : (
              <>
                <Icon.zap />
                {selectedSerpDomains.size > 0
                  ? `Analyze ${selectedSerpDomains.size} competitor${selectedSerpDomains.size === 1 ? "" : "s"}`
                  : "Analyze competitors"}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Context card — your site / target keyword */}
      <div className="card tight" style={{ marginBottom: 14 }}>
        <div className="grid g-2" style={{ gap: 14 }}>
          <div>
            <div className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 10 }}>
              Your site
            </div>
            <div className="b mono" style={{ fontSize: 14, marginTop: 4 }}>{domain || "—"}</div>
          </div>
          <div>
            <div className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 10 }}>
              Target keyword
            </div>
            <div className="b" style={{ fontSize: 14, marginTop: 4 }}>{keyword || "—"}</div>
          </div>
        </div>
      </div>

      {/* SERP results card */}
      <div data-tutorial="competitor-list" className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          className="card-h"
          style={{ padding: "16px 18px", marginBottom: 0, borderBottom: "1px solid var(--border)" }}
        >
          <div>
            <div className="t">SERP results</div>
            <div className="tiny muted" style={{ marginTop: 2 }}>
              {serpCompetitors.length > 0
                ? `Pick 3 to compare against your site · ${serpCompetitors.length} ranking page${serpCompetitors.length === 1 ? "" : "s"} found`
                : "Pick 3 to compare against your site"}
            </div>
          </div>
          {serpCompetitors.length > 0 && (
            <button type="button" className="btn sm" onClick={handleSelectAll}>
              {selectedSerpDomains.size >= 3 ? "Clear selection" : "Select top 3"}
            </button>
          )}
        </div>

        {loadingSerpData ? (
          <div style={{ padding: 60, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
            Loading SERP results…
          </div>
        ) : serpCompetitors.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
            <div className="b" style={{ fontSize: 14, color: "var(--text)" }}>No SERP data available</div>
            <div className="tiny muted" style={{ marginTop: 6, maxWidth: 360, marginLeft: "auto", marginRight: "auto" }}>
              Run a rank check for this keyword from the project page to populate the
              SERP results, then come back here to pick competitors.
            </div>
          </div>
        ) : (
          <div>
            {serpCompetitors.map((c) => {
              const isOwnSite = isOwn(c.domain, domain)
              const isSelected = selectedSerpDomains.has(c.domain)
              const breadcrumb = breadcrumbFor(c.url)
              const swatch = isOwnSite ? "var(--brand)" : domainColor(c.domain)
              const rowStyle: React.CSSProperties = {
                padding: "14px 16px",
                gap: 14,
                display: "flex",
                alignItems: "flex-start",
                borderBottom: "1px solid var(--border)",
                cursor: isOwnSite ? "not-allowed" : "pointer",
                background: isSelected
                  ? "var(--brand-soft)"
                  : isOwnSite
                    ? "var(--bg-sub)"
                    : "transparent",
                opacity: isOwnSite ? 0.75 : 1,
                transition: "background 0.12s",
              }
              return (
                <div
                  key={c.url + c.position}
                  className={"serp-row " + (isOwnSite ? "mine" : "")}
                  style={rowStyle}
                  onClick={() => !isOwnSite && toggleSerpDomain(c.domain)}
                  role="button"
                  tabIndex={isOwnSite ? -1 : 0}
                  aria-disabled={isOwnSite}
                  aria-pressed={isSelected}
                  onKeyDown={(e) => {
                    if (isOwnSite) return
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      toggleSerpDomain(c.domain)
                    }
                  }}
                >
                  <div
                    className="rank"
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: 36, flexShrink: 0 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isOwnSite}
                      onChange={() => toggleSerpDomain(c.domain)}
                      aria-label={`Select ${c.domain}`}
                      style={{ width: 16, height: 16, cursor: isOwnSite ? "not-allowed" : "pointer" }}
                    />
                    <PosBadge pos={c.position} />
                  </div>
                  <div className="body" style={{ flex: 1, minWidth: 0 }}>
                    <div className="url-line">
                      <span className="fav" style={{ background: swatch, color: "white" }}>
                        {c.domain[0]?.toUpperCase() ?? "?"}
                      </span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {breadcrumb}
                      </span>
                      {isOwnSite && (
                        <span className="chip brand" style={{ marginLeft: 4, fontSize: 10 }} title="Your site">
                          Your site
                        </span>
                      )}
                    </div>
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="title"
                      style={{
                        display: "inline-block",
                        color: "var(--brand)",
                        textDecoration: "none",
                        fontSize: 16,
                        lineHeight: 1.3,
                        marginBottom: 4,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                      onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                    >
                      {c.title || c.url}
                    </a>
                    {c.snippet && <div className="desc">{c.snippet}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Selection-count hint — shows when partial selection but not yet at 3 */}
      {serpCompetitors.length > 0 && selectedSerpDomains.size > 0 && selectedSerpDomains.size !== 3 && (
        <div
          className="card tight"
          style={{
            marginTop: 14,
            borderColor: "var(--warn)",
            background: "var(--warn-soft)",
            color: "var(--warn)",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--warn)" }} />
          {selectedSerpDomains.size < 3
            ? `Select ${3 - selectedSerpDomains.size} more to continue — exactly 3 required.`
            : `Deselect ${selectedSerpDomains.size - 3} to continue — exactly 3 required.`}
        </div>
      )}

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

export default function CompetitorAnalysisPage() {
  return (
    <Suspense
      fallback={
        <div className="page" style={{ color: "var(--text-mute)", fontSize: 13, padding: 60, textAlign: "center" }}>
          Loading…
        </div>
      }
    >
      <CompetitorAnalysisContent />
    </Suspense>
  )
}
