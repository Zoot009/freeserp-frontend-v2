"use client"

import { useState, useEffect, useRef, useCallback, Suspense } from "react"
import { CreditCost } from "@/components/dashboard/credit-cost"
import { CREDIT_ACTION_KEYS } from "@/lib/credits"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth"
import { Icon } from "@/components/dashboard/icons"
import { Favicon } from "@/components/favicon"
import { fetchBillingConfig } from "@/lib/billing-config"
import axios from "@/lib/axios"
import { ToolContext } from "@/components/dashboard/tool-context"

const MAX_COMPETITORS = 10

// Daily-quota cost of one live SERP lookup — offline fallback only; the live
// value comes from GET /api/billing/config (backend LIVE_SERP_CHECK_UNITS).
const LIVE_CHECK_COST_FALLBACK = 1

// Rotated while a live lookup is in flight so the wait reads as progress
// rather than a stuck spinner.
const SEARCHING_MESSAGES = [
  "Searching Google for your keyword…",
  "Scanning the top ranking pages…",
  "Identifying real competitors…",
  "Almost there…",
]

interface SerpResultRow {
  position: number
  domain: string
  url: string
  title: string
  snippet: string | null
}

type SerpCheckStatus = "PROCESSING" | "COMPLETED" | "FAILED"

// Own-domain test so users can't pick themselves as a "competitor" — normalise
// both sides (lowercase, strip leading www.) and accept subdomain matches.
function isOwnDomain(candidate: string, yours: string): boolean {
  if (!yours) return false
  const a = candidate.toLowerCase().replace(/^www\./, "")
  const b = yours.toLowerCase().replace(/^www\./, "")
  return a === b || a.endsWith(`.${b}`)
}

// Turns a 429's rate-limit headers into a human wait time. Same helper as the
// project-scoped intake page — express-rate-limit's draft-7 mode sends a
// combined `RateLimit: limit=10, remaining=0, reset=3542` (seconds until the
// window clears); older drafts send `Retry-After`. Both are only readable
// cross-origin because the API's CORS config exposes them.
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

function CompetitorAnalysisContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()

  // Standalone tool — no project/keyword context, so every field is typed by
  // hand instead of being sourced from a project's rank-checked SERP results.
  const [keyword, setKeyword] = useState(searchParams.get("keyword") || "")
  const [domain, setDomain] = useState("")
  const [competitors, setCompetitors] = useState<string[]>([])
  // Manual typed rows are opt-in — the SERP picker is the default path, and
  // typing only shows up once the user asks for it (or already has rows from
  // picking SERP results, which reuse the same list).
  const [manualMode, setManualMode] = useState(false)

  const [isAnalyzing, setIsAnalyzing] = useState(false)
  // Synchronous double-submit guard: `disabled` only updates on the next
  // render, so a fast second click could slip a second POST through first.
  const submittingRef = useRef(false)
  const [error, setError] = useState("")
  // Set once the server reports the daily analysis quota is spent (402).
  // Keeps the button off for the rest of the session — no retry can succeed
  // until the UTC day rolls over.
  const [quotaBlocked, setQuotaBlocked] = useState(false)

  // Optional "find competitors from search results" picker — an alternative to
  // typing domains by hand. Runs a live SERP lookup (same one behind the Quick
  // Serp tool), which spends a daily-quota unit, so it's confirmed first.
  const [liveCheckCost, setLiveCheckCost] = useState(LIVE_CHECK_COST_FALLBACK)
  const [serpLookupId, setSerpLookupId] = useState<string | null>(null)
  const [serpResults, setSerpResults] = useState<SerpResultRow[]>([])
  const [selectedSerpUrls, setSelectedSerpUrls] = useState<Set<string>>(new Set())
  const [serpError, setSerpError] = useState("")
  const serpPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const serpLookupInFlight = serpLookupId != null
  // "domain|keyword" pair the last lookup (auto or manual) ran for — guards the
  // debounced auto-run below from re-firing (and re-spending quota) for values
  // it's already fetched, while still re-triggering once either field changes.
  const lastLookupKeyRef = useRef<string | null>(null)
  // Cycles the centered "searching" copy so the wait (a few seconds of
  // polling) feels active rather than frozen on one static line.
  const [searchingMsgIdx, setSearchingMsgIdx] = useState(0)
  useEffect(() => {
    if (!serpLookupInFlight) {
      setSearchingMsgIdx(0)
      return
    }
    const id = setInterval(() => setSearchingMsgIdx((i) => (i + 1) % SEARCHING_MESSAGES.length), 1600)
    return () => clearInterval(id)
  }, [serpLookupInFlight])

  useEffect(() => {
    if (!authLoading && !user) router.push("/login")
  }, [user, authLoading, router])

  useEffect(() => {
    void fetchBillingConfig().then((cfg) => {
      if (typeof cfg.liveCheckUnits === "number") setLiveCheckCost(cfg.liveCheckUnits)
    })
  }, [])

  const stopSerpPolling = useCallback(() => {
    if (serpPollRef.current) {
      clearInterval(serpPollRef.current)
      serpPollRef.current = null
    }
  }, [])

  useEffect(() => stopSerpPolling, [stopSerpPolling])

  const pollSerpCheck = useCallback(
    (id: string) => {
      stopSerpPolling()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
      const tick = async () => {
        try {
          const res = await axios.get(`${apiUrl}/api/serp-check/${id}`, { withCredentials: true })
          if (res.status < 200 || res.status >= 300) return
          const check = res.data?.check as
            | { status: SerpCheckStatus; result?: { results?: SerpResultRow[] } | null; error?: string | null }
            | undefined
          if (!check || check.status === "PROCESSING") return

          stopSerpPolling()
          setSerpLookupId(null)
          if (check.status === "COMPLETED") {
            setSerpResults(check.result?.results ?? [])
          } else {
            setSerpError(check.error || "Failed to fetch SERP results.")
          }
        } catch {
          /* transient — keep polling */
        }
      }
      void tick()
      serpPollRef.current = setInterval(() => void tick(), 2000)
    },
    [stopSerpPolling],
  )

  const runSerpLookup = async () => {
    lastLookupKeyRef.current = `${domain.trim().toLowerCase()}|${keyword.trim().toLowerCase()}`
    setSerpError("")
    setSerpResults([])
    setSelectedSerpUrls(new Set())
    toast(`Searching for competitors — this uses ${liveCheckCost} daily check${liveCheckCost === 1 ? "" : "s"}.`)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
      const res = await axios.post(
        `${apiUrl}/api/serp-check`,
        { keyword: keyword.trim(), domain: domain.trim() || undefined, country: "us", device: "desktop" },
        { withCredentials: true },
      )
      if (res.status < 200 || res.status >= 300) {
        const body = res.data ?? {}
        const raw = body.error?.message ?? body.error
        const serverMsg = typeof raw === "string" && raw ? raw : ""
        if (res.status === 402) {
          setQuotaBlocked(true)
          setSerpError(serverMsg || "You've used all your daily checks. Try again tomorrow.")
        } else if (res.status === 429) {
          const wait = retryAfterPhrase(res.headers ?? {})
          setSerpError(wait ? `Please try again in ${wait}.` : "Please wait before starting another lookup.")
        } else {
          setSerpError(serverMsg || "Failed to fetch SERP results.")
        }
        return
      }
      const id = res.data?.id as string | undefined
      if (id) {
        setSerpLookupId(id)
        pollSerpCheck(id)
      }
    } catch (err) {
      setSerpError(err instanceof Error ? err.message : "Failed to fetch SERP results.")
    }
  }

  // Combined cap across both entry paths — manually typed rows plus SERP
  // picks — since both feed the same competitor list at analyze time.
  const remainingSlots = () =>
    MAX_COMPETITORS - competitors.filter((c) => c.trim()).length - selectedSerpUrls.size

  // Auto-run the SERP lookup once both fields are filled and settled — no
  // button click, no confirm dialog. Debounced so it fires once per pause in
  // typing rather than on every keystroke; the key-ref guard in runSerpLookup
  // stops it firing again for a domain/keyword pair it already fetched.
  useEffect(() => {
    const d = domain.trim()
    const k = keyword.trim()
    if (!d || !k) return
    if (serpLookupInFlight || quotaBlocked) return
    if (remainingSlots() <= 0) return
    const key = `${d.toLowerCase()}|${k.toLowerCase()}`
    if (key === lastLookupKeyRef.current) return

    const timer = setTimeout(() => {
      void runSerpLookup()
    }, 900)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, keyword, serpLookupInFlight, quotaBlocked])

  const toggleSerpUrl = (u: string) => {
    setSelectedSerpUrls((prev) => {
      const next = new Set(prev)
      if (next.has(u)) {
        next.delete(u)
      } else {
        // A pick occupies a slot alongside — not on top of — the manually
        // typed rows, so cap against both together.
        const manualCount = competitors.filter((c) => c.trim()).length
        if (manualCount + next.size >= MAX_COMPETITORS) {
          setSerpError(`You can only add ${MAX_COMPETITORS} competitors total.`)
          return prev
        }
        next.add(u)
      }
      setSerpError("")
      return next
    })
  }

  const updateCompetitor = (i: number, value: string) => {
    setCompetitors((prev) => prev.map((c, idx) => (idx === i ? value : c)))
  }
  const addCompetitor = () => {
    setCompetitors((prev) => (prev.length >= MAX_COMPETITORS ? prev : [...prev, ""]))
  }
  const removeCompetitor = (i: number) => {
    setCompetitors((prev) => {
      const next = prev.filter((_, idx) => idx !== i)
      // Emptying the list manually collapses the section back to just the
      // "Find competitors" picker + the "add manually" link.
      if (next.length === 0) setManualMode(false)
      return next
    })
  }
  const startManualEntry = () => {
    setManualMode(true)
    setCompetitors((prev) => (prev.length > 0 ? prev : [""]))
  }

  const handleAnalyze = async () => {
    setError("")
    const cleanKeyword = keyword.trim()
    const cleanDomain = domain.trim()
    // Competitors can come from the manually typed rows and/or checked SERP
    // picks — combine both so clicking Analyze works straight off a
    // selection, with no separate "add selected" step required.
    const selectedDomains = serpResults.filter((r) => selectedSerpUrls.has(r.url)).map((r) => r.domain)
    const seen = new Set<string>()
    const cleanCompetitors: string[] = []
    for (const c of [...competitors.map((c) => c.trim()).filter(Boolean), ...selectedDomains]) {
      const key = c.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      cleanCompetitors.push(c)
    }

    if (!cleanKeyword) {
      setError("Enter a target keyword.")
      return
    }
    if (!cleanDomain) {
      setError("Enter your domain.")
      return
    }
    if (cleanCompetitors.length === 0) {
      setError("Add at least one competitor domain or URL.")
      return
    }
    if (cleanCompetitors.length > MAX_COMPETITORS) {
      setError(`You can compare up to ${MAX_COMPETITORS} competitors.`)
      return
    }

    if (submittingRef.current) return
    submittingRef.current = true

    setIsAnalyzing(true)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

      // `competitors` accepts bare domains or full URLs — the backend
      // normalizes bare domains to https:// URLs itself (domainToUrl), so
      // users don't have to type "https://" for every row.
      const response = await axios.post(
        `${apiUrl}/api/competitor-analysis`,
        {
          yourDomain: cleanDomain,
          keyword: cleanKeyword,
          competitors: cleanCompetitors,
        },
        { withCredentials: true },
      )

      if (response.status < 200 || response.status >= 300) {
        const body = response.data ?? {}
        const raw = body.error?.message ?? body.error
        const serverMsg = typeof raw === "string" && raw ? raw : ""

        if (response.status === 402) {
          setQuotaBlocked(true)
          setError(serverMsg || "You've used all your AI analyses for today. Try again tomorrow.")
        } else if (response.status === 429) {
          const wait = retryAfterPhrase(response.headers ?? {})
          setError(
            wait
              ? `You've started several analyses recently. Please try again in ${wait}.`
              : "You've started several analyses recently. Please wait before starting another.",
          )
        } else {
          setError(serverMsg || "Failed to start competitor analysis")
        }

        setIsAnalyzing(false)
        submittingRef.current = false
        return
      }

      const { analysis } = response.data
      const analysisId = analysis?.id ?? analysis?.analysisId

      // Deliberately leave submittingRef true while navigating away so a
      // stray click during the route transition can't re-fire.
      router.push(`/dashboard/competitor-analysis/results?analysisId=${analysisId}&keyword=${encodeURIComponent(cleanKeyword)}`)
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
          <h1>Compare against competitors</h1>
          <div className="sub">
            Enter your site, a target keyword, and up to {MAX_COMPETITORS} competitor domains to crawl and compare.
          </div>
        </div>
        <div className="row" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            type="button"
            data-tutorial="analyze-btn"
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
                Analyze competitors
              </>
            )}
          </button>
          <CreditCost action={CREDIT_ACTION_KEYS.competitorAnalysis} className="mt-2" />
        </div>
      </div>

      <ToolContext id="competitor-analysis" />

      {/* Input form */}
      <div className="card" style={{ padding: 18 }}>
        <div className="grid g-2" style={{ gap: 14, marginBottom: 16 }}>
          <Field label="Your site">
            <input
              className="input"
              placeholder="example.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
          </Field>
          <Field label="Target keyword">
            <input
              className="input"
              placeholder="best project management software"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </Field>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
          <span
            className="tiny muted"
            style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}
          >
            Competitors
          </span>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {!manualMode && competitors.length === 0 && (
              <button type="button" className="btn sm" onClick={startManualEntry}>
                + Add competitors manually
              </button>
            )}
            <button
              type="button"
              className="btn sm"
              onClick={() => void runSerpLookup()}
              disabled={!domain.trim() || !keyword.trim() || serpLookupInFlight || quotaBlocked || remainingSlots() <= 0}
            >
              {serpLookupInFlight ? (
                <><span className="spin" style={{ display: "inline-flex" }}><Icon.refresh /></span> Searching…</>
              ) : (
                <><Icon.search /> {serpResults.length > 0 || serpError ? "Search again" : "Find competitors from search results"}</>
              )}
            </button>
          </div>
        </div>

        {!serpLookupInFlight && serpResults.length === 0 && !serpError && (
          <div className="tiny muted" style={{ marginBottom: 8 }}>
            {domain.trim() && keyword.trim()
              ? `Fetching real search results automatically — uses ${liveCheckCost} daily check${liveCheckCost === 1 ? "" : "s"}.`
              : `Enter your site and target keyword above to see real search results here — uses ${liveCheckCost} daily check${liveCheckCost === 1 ? "" : "s"}.`}
          </div>
        )}

        {serpLookupInFlight && (
          <div
            style={{
              padding: "48px 20px",
              textAlign: "center",
              marginBottom: 14,
              border: "1px dashed var(--border)",
              borderRadius: "var(--r-md)",
            }}
          >
            <span className="spin" style={{ display: "inline-flex", marginBottom: 12, color: "var(--brand)", transform: "scale(1.6)" }}>
              <Icon.refresh />
            </span>
            <div className="b" style={{ fontSize: 14, color: "var(--text)" }}>
              {SEARCHING_MESSAGES[searchingMsgIdx]}
            </div>
            <div className="tiny muted" style={{ marginTop: 6 }}>
              Searching for <span className="b mono" style={{ color: "var(--text)" }}>“{keyword.trim()}”</span> — this usually takes a few seconds.
            </div>
          </div>
        )}

        {serpError && (
          <div className="tiny" style={{ marginBottom: 8, color: "var(--neg)" }}>
            {serpError}
          </div>
        )}

        {serpResults.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div className="tiny muted" style={{ marginBottom: 8 }}>
              Pick up to {MAX_COMPETITORS} — {selectedSerpUrls.size} selected
              {selectedSerpUrls.size > 0 && " · they'll be included when you click Analyze competitors"}
            </div>
            <div className="cmp-list">
              {serpResults.map((r) => {
                const own = isOwnDomain(r.domain, domain)
                const selected = selectedSerpUrls.has(r.url)
                return (
                  <div
                    key={r.url + r.position}
                    className={"cmp-card" + (selected ? " selected" : "") + (own ? " mine" : "")}
                    onClick={() => !own && toggleSerpUrl(r.url)}
                    role="button"
                    tabIndex={own ? -1 : 0}
                    aria-disabled={own}
                    aria-pressed={selected}
                    aria-label={`Select ${r.domain}`}
                    onKeyDown={(e) => {
                      if (own) return
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        toggleSerpUrl(r.url)
                      }
                    }}
                  >
                    <span className={"cmp-check" + (selected ? " on" : "")} aria-hidden>
                      {selected && <Icon.check size={13} />}
                    </span>
                    <div className="body" style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Favicon domain={r.domain} size={22} />
                        <div style={{ minWidth: 0, lineHeight: 1.25 }}>
                          <div style={{ fontSize: 13, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.domain.replace(/^www\./, "")}
                          </div>
                          {r.title && (
                            <div style={{ fontSize: 12, color: "var(--text-mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {r.title}
                            </div>
                          )}
                        </div>
                        {own && (
                          <span className="chip brand" style={{ marginLeft: 4, fontSize: 10 }} title="Your site">
                            Your site
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={"cmp-rank" + (r.position <= 3 ? " top" : "")} title={`Ranks #${r.position}`}>
                      #{r.position}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {(manualMode || competitors.length > 0) && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {competitors.map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 8 }}>
                  <input
                    className="input"
                    style={{ flex: 1 }}
                    placeholder="competitor.com or https://competitor.com/page"
                    value={c}
                    onChange={(e) => updateCompetitor(i, e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => removeCompetitor(i)}
                    aria-label="Remove competitor"
                  >
                    <Icon.close />
                  </button>
                </div>
              ))}
            </div>
            {competitors.length < MAX_COMPETITORS && (
              <button type="button" className="btn sm" style={{ marginTop: 10 }} onClick={addCompetitor}>
                + Add competitor
              </button>
            )}
          </>
        )}
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
