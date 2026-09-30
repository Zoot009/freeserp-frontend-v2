"use client"

import { Suspense, useEffect, useState } from "react"
import { CreditCost } from "@/components/dashboard/credit-cost"
import { CREDIT_ACTION_KEYS } from "@/lib/credits"
import { useSearchParams } from "next/navigation"
import { Link, useRouter } from "@/i18n/navigation"
import { api, ApiError } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"
import { Favicon } from "@/components/favicon"
import { displayDomain } from "@/lib/utils"
import { ToolContext } from "@/components/dashboard/tool-context"
import { Hint } from "@/components/dashboard/widget"

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

// One page of history. The API pages at 50, newest first; `total` comes with
// the first page only.
type HistoryPage = { analyses: AnalysisListItem[]; nextCursor?: string; total?: number }

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })

// Matches the pos/warn/neg score bands used across the dashboard (score cards,
// bars, etc.) so a saved analysis's score badge reads consistently everywhere.
function scoreTone(v: number): { color: string; bg: string } {
  if (v >= 80) return { color: "var(--pos)", bg: "var(--pos-soft)" }
  if (v >= 60) return { color: "var(--brand)", bg: "var(--brand-soft)" }
  return { color: "var(--neg)", bg: "var(--neg-soft)" }
}

/**
 * A finished check's score, as the rank tracker shows a position: a number in
 * a rounded square, coloured by band. A check without a score says why.
 * "Ready" used to sit on every row beside its score, saying nothing the score
 * didn't; only the unfinished and the failed have a status to show now.
 */
function ScoreCell({ a }: { a: AnalysisListItem }) {
  if (a.status === "FAILED") return <span className="chip neg">Failed</span>
  if (a.status === "PENDING") return <span className="chip outline">Queued</span>
  if (a.status === "PROCESSING") {
    return (
      <span className="chip warn" style={{ gap: 5 }}>
        <span className="spin" style={{ display: "inline-flex" }}><Icon.refresh /></span> Analyzing
      </span>
    )
  }
  if (a.overallScore == null) return <span className="tiny muted">—</span>
  const tone = scoreTone(a.overallScore)
  return (
    <Hint text={`Overall score: ${a.overallScore}/100`}>
      <span className="pos-badge" style={{ width: 34, background: tone.bg, color: tone.color }}>{a.overallScore}</span>
    </Hint>
  )
}

/** "freeserp.com/serp-checker": the page, not just its site — one site has many. */
function pageLabel(a: AnalysisListItem): string {
  return (a.url || a.domain || "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")
}

// The history table, in the rank tracker's terms. On a narrow card (a phone,
// or a tablet beside the sidebar, hence a container query) the date goes: the
// keyword and its score are what a row is for.
const HISTORY_CSS = `
  .ka-hist-card { container-type: inline-size; }
  .ka-hist tbody tr { cursor: pointer; }
  .ka-hist .ka-open { color: inherit; text-decoration: none; }
  .ka-hist .ka-open:hover { color: var(--brand); }
  @container (max-width: 520px) {
    .ka-hist .ka-hist-date { display: none; }
  }

  /* The form's last line: the price on the left, the button at the end. */
  .ka-go-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 16px; }
  .ka-go { min-width: 180px; height: 38px; justify-content: center; }
  @media (max-width: 640px) {
    .ka-go { flex: 1 1 100%; }
  }
`

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
  // Only the first 50 used to be fetched, and the header called that "50 saved".
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await api.get<HistoryPage>("/api/keyword-analysis")
        if (!cancelled) {
          setHistory(data.analyses ?? [])
          setNextCursor(data.nextCursor ?? null)
          setTotal(data.total ?? null)
        }
      } catch {
        /* history is non-critical — leave it empty */
      } finally {
        if (!cancelled) setLoadingHistory(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const data = await api.get<HistoryPage>("/api/keyword-analysis", { query: { cursor: nextCursor } })
      setHistory((prev) => [...prev, ...(data.analyses ?? [])])
      setNextCursor(data.nextCursor ?? null)
    } catch {
      /* leave the button up to try again */
    } finally {
      setLoadingMore(false)
    }
  }

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
              // Block-level so the .eyebrow below (also inline-flex) starts on its
              // own row instead of sitting beside the pill.
              style={{ display: "flex", width: "fit-content", marginBottom: 16 }}
            >
              <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><Icon.chevR /></span>
              Back to project
            </button>
          )}
          <h1>Keyword Score Checker</h1>
          <div className="sub">Crawl and score one of your own pages for a target keyword — on-page &amp; off-page SEO, no competitors.</div>
        </div>
      </div>

      <ToolContext id="keyword-score-checker" />

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

      {/* Create form, laid out as the SERP checker's: the two fields, then the
          price and the button on one line. The button was a full-width slab,
          the loudest thing on a page that hadn't run anything yet. */}
      <form className="card" onSubmit={submit} style={{ marginBottom: 20 }}>
        <div className="grid g-2" style={{ alignItems: "start" }}>
          <Field
            label="Website URL"
            hint={lockedBase ? "Your project domain is fixed — just add the page path" : "The exact page you want scored"}
          >
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 13, top: 0, bottom: 0, display: "grid", alignItems: "center", color: "var(--text-mute)", pointerEvents: "none" }}>
                <Icon.globe />
              </span>
              <input
                className="input lg"
                style={{ paddingLeft: 38, paddingRight: lockedBase ? 34 : undefined }}
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
                <Hint text="Locked to your project domain">
                  <span
                    style={{ position: "absolute", right: 11, top: 0, bottom: 0, display: "grid", alignItems: "center", color: "var(--text-mute)" }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </span>
                </Hint>
              )}
            </div>
          </Field>
          <Field label="Target keyword" hint="The search term this page should rank for">
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 13, top: 0, bottom: 0, display: "grid", alignItems: "center", color: "var(--text-mute)", pointerEvents: "none" }}>
                <Icon.search />
              </span>
              <input
                className="input lg"
                style={{ paddingLeft: 38 }}
                placeholder="best running shoes"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                required
              />
            </div>
          </Field>
        </div>

        <div className="ka-go-row">
          <div className="col" style={{ gap: 3, minWidth: 0 }}>
            <CreditCost action={CREDIT_ACTION_KEYS.keywordScore} />
            <span className="tiny muted">We crawl the page, check its on-page and technical SEO, and fetch its authority.</span>
          </div>
          <button type="submit" className="btn primary ka-go" disabled={!canSubmit}>
            {submitting ? <><span className="spin" style={{ display: "inline-flex" }}><Icon.refresh /></span> Starting…</> : <><Icon.search /> Score this page</>}
          </button>
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
      <style>{HISTORY_CSS}</style>
      <div className="card ka-hist-card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="card-h" style={{ padding: "14px 16px", marginBottom: 0, borderBottom: "1px solid var(--border)" }}>
          <div className="b">Recent analyses</div>
          {history.length > 0 && <span className="tiny muted">{total ?? history.length} saved</span>}
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
          <table className="tbl flush ka-hist">
            <thead>
              <tr>
                <th>Keyword and page</th>
                <th style={{ width: 110 }}>Score</th>
                <th className="ka-hist-date" style={{ width: 130 }}>Checked</th>
                <th style={{ width: 40 }} aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {history.map((a) => {
                const href = `/dashboard/keyword-analysis/results?id=${a.id}`
                return (
                  // The whole row opens the report; the keyword is the link a
                  // keyboard or a screen reader lands on.
                  <tr key={a.id} onClick={() => router.push(href)}>
                    <td style={{ maxWidth: 0 }}>
                      <div className="row" style={{ gap: 12, minWidth: 0 }}>
                        <Favicon domain={displayDomain(a.domain || a.url)} size={24} />
                        <div style={{ minWidth: 0 }}>
                          <Link href={href} className="kw ka-open" title={a.keyword} onClick={(e) => e.stopPropagation()}>
                            {a.keyword}
                          </Link>
                          <div className="tiny muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.url}>
                            {pageLabel(a)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td><ScoreCell a={a} /></td>
                    <td className="tiny muted tabular ka-hist-date">{fmtDate(a.createdAt)}</td>
                    <td style={{ color: "var(--text-mute)" }}><Icon.chevR /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {!loadingHistory && nextCursor && (
          <div style={{ padding: 12, display: "flex", justifyContent: "center" }}>
            <button type="button" className="btn sm" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? <><span className="spin" style={{ display: "inline-flex" }}><Icon.refresh /></span> Loading…</> : "Load more"}
            </button>
          </div>
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
