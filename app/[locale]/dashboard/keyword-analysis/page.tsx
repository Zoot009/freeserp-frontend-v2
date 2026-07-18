"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useRouter } from "@/i18n/navigation"
import { api, ApiError } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"
import { Favicon } from "@/components/favicon"
import { displayDomain } from "@/lib/utils"

// A saved single-site analysis as returned by GET /api/keyword-analysis (list
// shape — no crawlData blob).
type AnalysisListItem = {
  id: string
  keyword: string
  url: string
  domain: string | null
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"
  error: string | null
  overallScore: number | null
  domainAuthority: number | null
  pageAuthority: number | null
  createdAt: string
  completedAt: string | null
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })

// Matches the pos/warn/neg score bands used across the dashboard (score cards,
// bars, etc.) so a saved analysis's score badge reads consistently everywhere.
function scoreTone(v: number): { color: string; bg: string } {
  if (v >= 80) return { color: "var(--pos)", bg: "var(--pos-soft)" }
  if (v >= 60) return { color: "var(--brand)", bg: "var(--brand-soft)" }
  return { color: "var(--neg)", bg: "var(--neg-soft)" }
}

function ScoreBadge({ value }: { value: number | null }) {
  if (value == null) {
    return <span className="tiny muted" style={{ width: 36, textAlign: "center", flexShrink: 0 }}>—</span>
  }
  const tone = scoreTone(value)
  return (
    <span
      className="tabular"
      title={`Overall score: ${value}/100`}
      style={{
        display: "inline-grid",
        placeItems: "center",
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: tone.bg,
        color: tone.color,
        fontSize: 13,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {value}
    </span>
  )
}

function StatusChip({ status }: { status: AnalysisListItem["status"] }) {
  const map: Record<AnalysisListItem["status"], { cls: string; label: string }> = {
    COMPLETED: { cls: "chip pos", label: "Ready" },
    FAILED: { cls: "chip neg", label: "Failed" },
    PROCESSING: { cls: "chip warn", label: "Analyzing" },
    PENDING: { cls: "chip outline", label: "Queued" },
  }
  const { cls, label } = map[status]
  return <span className={cls}>{label}</span>
}

function KeywordAnalysisContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Context when launched from a project keyword's "Score" CTA (non-ranking
  // keyword): prefill the keyword and carry the ids through to the results page
  // so the computed score can be saved back onto that keyword.
  const ctxKeyword = searchParams.get("keyword") || ""
  const ctxProjectId = searchParams.get("projectId") || ""
  const ctxKeywordId = searchParams.get("keywordId") || ""
  const ctxDomain = searchParams.get("domain") || ""
  const fromProject = !!(ctxProjectId && ctxKeywordId)

  // When scoring a project keyword, the page must live on the project's own
  // domain (the score is saved back to that keyword). So we LOCK the domain part
  // of the URL — the user can only append the page path after the trailing "/",
  // never change "https://freeserp.com/" to some other site.
  const lockedBase = ctxDomain
    ? `https://${ctxDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "")}/`
    : null

  const [url, setUrl] = useState(lockedBase ?? "")
  const [keyword, setKeyword] = useState(ctxKeyword)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [history, setHistory] = useState<AnalysisListItem[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await api.get<{ analyses: AnalysisListItem[] }>("/api/keyword-analysis")
        if (!cancelled) setHistory(data.analyses ?? [])
      } catch {
        /* history is non-critical — leave it empty */
      } finally {
        if (!cancelled) setLoadingHistory(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const canSubmit = url.trim().length > 0 && keyword.trim().length > 0 && !submitting

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const trimmedUrl = url.trim()
    const trimmedKeyword = keyword.trim()
    if (!trimmedUrl || !trimmedKeyword) {
      setError("Both a website URL and a keyword are required.")
      return
    }
    // Prepend https:// when the user omits the scheme so the backend URL check passes.
    const normalizedUrl = /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`
    setSubmitting(true)
    try {
      const res = await api.post<{ analysis: { id: string; status: string } }>(
        "/api/keyword-analysis",
        { url: normalizedUrl, keyword: trimmedKeyword },
      )
      // When launched from a project keyword, carry the ids so the results page
      // can save the computed score back onto that keyword.
      const ctx = fromProject ? `&projectId=${ctxProjectId}&keywordId=${ctxKeywordId}` : ""
      router.push(`/dashboard/keyword-analysis/results?id=${res.analysis.id}${ctx}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start analysis. Please try again.")
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <div className="page-h">
        <div style={{ minWidth: 0 }}>
          {fromProject && (
            <button
              className="btn sm kd-back-btn"
              onClick={() => router.push(`/dashboard/project/${ctxProjectId}/keywords`)}
              style={{ marginBottom: 14 }}
            >
              <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><Icon.chevR /></span>
              Back to project
            </button>
          )}
          <div className="eyebrow"><span className="spark"><Icon.search /></span> Keyword Analysis</div>
          <h1>Analyze your page</h1>
          <div className="sub">Crawl and score one of your own pages for a target keyword — on-page &amp; off-page SEO, no competitors.</div>
        </div>
      </div>

      {/* Context banner — shown when scoring a specific project keyword. */}
      {fromProject && (
        <div
          className="card tight"
          style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10, background: "var(--brand-soft)", borderColor: "var(--brand)", color: "var(--brand)", fontSize: 13 }}
        >
          <Icon.spark />
          <span>
            Scoring <b>“{ctxKeyword}”</b> for your project. Enter the page that ranks for it — the score
            will be saved back to that keyword.
          </span>
        </div>
      )}

      {/* Create form */}
      <form className="card" onSubmit={submit} style={{ marginBottom: 20 }}>
        <div className="grid g-2" style={{ marginBottom: 16, alignItems: "start" }}>
          <Field
            label="Website URL"
            hint={lockedBase ? "Your project domain is fixed — just add the page path" : "The exact page you want scored"}
          >
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 11, top: 0, bottom: 0, display: "grid", alignItems: "center", color: "var(--text-mute)" }}>
                <Icon.globe />
              </span>
              <input
                className="input"
                style={{ paddingLeft: 32, paddingRight: lockedBase ? 34 : undefined }}
                placeholder={lockedBase ? `${lockedBase}page-path` : "https://example.com/page"}
                value={url}
                onChange={(e) => {
                  // Domain locked (project context): accept edits only when the
                  // value still begins with the project's "https://domain/" base;
                  // any attempt to alter the domain snaps back to the base.
                  if (lockedBase) {
                    const v = e.target.value
                    setUrl(v.startsWith(lockedBase) ? v : lockedBase)
                  } else {
                    setUrl(e.target.value)
                  }
                }}
              />
              {lockedBase && (
                <span
                  title="Locked to your project domain"
                  style={{ position: "absolute", right: 11, top: 0, bottom: 0, display: "grid", alignItems: "center", color: "var(--text-mute)" }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
              )}
            </div>
          </Field>
          <Field label="Target Keyword" hint="The search term this page should rank for">
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 11, top: 0, bottom: 0, display: "grid", alignItems: "center", color: "var(--text-mute)" }}>
                <Icon.search />
              </span>
              <input
                className="input"
                style={{ paddingLeft: 32 }}
                placeholder="best running shoes"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                required
              />
            </div>
          </Field>
        </div>

        <button type="submit" className="btn primary" style={{ width: "100%", justifyContent: "center" }} disabled={!canSubmit}>
          {submitting ? <><span className="spin" style={{ display: "inline-flex" }}><Icon.refresh /></span> Starting…</> : <><Icon.search /> Analyze Page</>}
        </button>
        <div className="tiny muted" style={{ textAlign: "center", marginTop: 10 }}>
          We crawl the page, check technical &amp; on-page SEO, and fetch domain authority.
        </div>

        {error && (
          <div
            className="tiny"
            style={{ marginTop: 12, padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--neg-soft)", color: "var(--neg)", textAlign: "center" }}
          >
            {error}
          </div>
        )}
      </form>

      {/* History */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="card-h" style={{ padding: "14px 16px", marginBottom: 0, borderBottom: "1px solid var(--border)" }}>
          <div className="b">Recent analyses</div>
          {history.length > 0 && <span className="tiny muted">{history.length} saved</span>}
        </div>

        {loadingHistory ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
            <span className="spin" style={{ display: "inline-flex", marginRight: 8 }}><Icon.refresh /></span> Loading…
          </div>
        ) : history.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <div style={{ color: "var(--text-mute)", marginBottom: 8, display: "flex", justifyContent: "center" }}>
              <span style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--bg-inset)", display: "grid", placeItems: "center" }}>
                <Icon.search />
              </span>
            </div>
            <div className="tiny muted">No analyses yet. Run your first one above.</div>
          </div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {history.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/dashboard/keyword-analysis/results?id=${a.id}`)}
                  className="list-row"
                  style={{ display: "flex", width: "100%", textAlign: "left", alignItems: "center", gap: 12, padding: "12px 16px", border: "none", borderBottom: "1px solid var(--border)", background: "transparent", cursor: "pointer" }}
                >
                  <Favicon domain={displayDomain(a.domain || a.url)} size={28} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="b" style={{ fontSize: 13, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.keyword}</span>
                    <span className="tiny muted mono" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayDomain(a.domain || a.url)}</span>
                  </span>
                  <ScoreBadge value={a.status === "COMPLETED" ? a.overallScore : null} />
                  <span className="tiny muted tabular" style={{ display: "inline-block", flexShrink: 0, width: 78 }}>{fmtDate(a.createdAt)}</span>
                  <span style={{ display: "inline-block", flexShrink: 0, width: 76 }}><StatusChip status={a.status} /></span>
                  <span style={{ flexShrink: 0, color: "var(--text-mute)" }}><Icon.chevR /></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default function KeywordAnalysisPage() {
  return (
    <Suspense
      fallback={
        <div className="page" style={{ color: "var(--text-mute)", fontSize: 13, padding: 60, textAlign: "center" }}>
          Loading…
        </div>
      }
    >
      <KeywordAnalysisContent />
    </Suspense>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="col" style={{ gap: 6 }}>
      <span className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>{label}</span>
      {children}
      {hint && <span className="tiny muted" style={{ opacity: 0.8 }}>{hint}</span>}
    </label>
  )
}
