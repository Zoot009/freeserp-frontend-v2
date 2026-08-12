"use client"

import { useEffect, useState } from "react"
import { api, ApiError } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"
import { Favicon } from "@/components/favicon"
import type { AiCitationState, AiOverviewReference } from "@/components/dashboard/primitives"

// GET /api/projects/:projectId/keywords/:keywordId/ai-overview
type AiOverviewDetail = {
  checkedAt: string | null
  state: AiCitationState
  present: boolean
  pending: boolean
  /** null = unknown. Never render null as "not cited". */
  cited: boolean | null
  citedPosition: number | null
  citedUrl: string | null
  citedInExpansion: boolean
  references: AiOverviewReference[]
  refCount: number
  domainCount: number
  expansionDomains: string[]
}

// Copy per state. `unknown` deliberately explains itself rather than showing a
// verdict — the commonest cause is simply a check that predates the feature.
const STATE_COPY: Record<AiCitationState, { chip: string; cls: string; head: string; sub: string }> = {
  cited: {
    chip: "Cited",
    cls: "chip brand",
    head: "You're cited in the AI Overview",
    sub: "Google is citing your page as a source in its AI-generated answer.",
  },
  "not-cited": {
    chip: "Not cited",
    cls: "chip warn",
    head: "An AI Overview appeared, but your site isn't cited",
    sub: "Google answered this query itself and sourced other sites.",
  },
  "no-overview": {
    chip: "No AI Overview",
    cls: "chip outline",
    head: "No AI Overview for this keyword",
    sub: "Google answered with a normal results page on the last check — no AI summary to be cited in.",
  },
  unknown: {
    chip: "Unknown",
    cls: "chip outline",
    head: "No AI Overview data yet",
    sub: "This keyword hasn't been checked since AI Overview tracking was added. It will populate on its next check.",
  },
}

// `pending` is a distinct situation from "never checked" and deserves its own
// copy: Google acknowledged an AI Overview but returned a placeholder instead of
// the content, so presence is known and the citations genuinely are not.
const PENDING_COPY = {
  chip: "Loading at Google",
  cls: "chip warn",
  head: "Google is still generating this AI Overview",
  sub: "An AI Overview exists for this keyword, but Google returned it as a placeholder without its sources, so we can't tell yet whether you're cited.",
}

function normalizeHost(d: string) {
  return d.replace(/^www\./, "").toLowerCase()
}

export function AiOverviewPanel({
  projectId,
  keywordId,
  projectDomain,
}: {
  projectId: string
  keywordId: string
  projectDomain: string
}) {
  const [data, setData] = useState<AiOverviewDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!projectId || !keywordId) return
    let cancelled = false
    setLoading(true)
    setError("")
    setUnavailable(false)
    api
      .get<{ aiOverview: AiOverviewDetail }>(`/api/projects/${projectId}/keywords/${keywordId}/ai-overview`)
      .then((r) => { if (!cancelled) setData(r.aiOverview) })
      .catch((err) => {
        if (cancelled) return
        // A 404 here means the backend predates this endpoint (the dashboard can
        // run against an older API), not that the keyword is missing. Say so
        // plainly instead of showing a scary error on an otherwise fine page.
        if (err instanceof ApiError && err.status === 404) setUnavailable(true)
        else setError(err instanceof Error ? err.message : "Failed to load AI Overview data")
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [projectId, keywordId])

  if (loading) {
    return (
      <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
        Loading AI Overview…
      </div>
    )
  }

  if (unavailable) {
    return (
      <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
        AI Overview tracking isn&apos;t available on this API version yet.
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--neg)", fontSize: 13 }}>
        {error || "No AI Overview data"}
      </div>
    )
  }

  const copy = data.pending ? PENDING_COPY : STATE_COPY[data.state]
  const ownHost = normalizeHost(projectDomain)

  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-h">
          <div>
            <div className="t" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon.ai /> AI Overview
              <span className={copy.cls} style={{ fontSize: 10 }}>{copy.chip}</span>
            </div>
            <div className="tiny muted" style={{ marginTop: 2 }}>
              {data.checkedAt
                ? `Last checked ${new Date(data.checkedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`
                : "Never checked"}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 15, color: "var(--text)", marginBottom: 4 }}>{copy.head}</div>
        <div className="tiny muted" style={{ lineHeight: 1.5 }}>{copy.sub}</div>

        {data.state === "cited" && data.citedPosition != null && (
          <div className="row" style={{ gap: 14, marginTop: 12, flexWrap: "wrap" }}>
            <span className="tiny muted">
              Citation <span className="b tabular" style={{ color: "var(--brand)" }}>#{data.citedPosition}</span>
              {data.refCount > 0 && <span> of {data.refCount}</span>}
            </span>
            {data.citedUrl && (
              <a href={data.citedUrl} target="_blank" rel="noreferrer" className="tiny" style={{ color: "var(--brand)" }}>
                Cited page <Icon.external size={11} />
              </a>
            )}
          </div>
        )}

        {/* Cited in a nested AI block but not the overview itself — a near miss
            worth surfacing, since it's a different signal from a flat "no". */}
        {data.state === "not-cited" && data.citedInExpansion && (
          <div className="tiny" style={{ marginTop: 10, color: "var(--warn)" }}>
            Your site is cited in a nested AI block on this page, just not in the AI Overview itself.
          </div>
        )}

        {data.present && !data.pending && (
          <div className="row" style={{ gap: 18, marginTop: 12, flexWrap: "wrap" }}>
            <span className="tiny muted">Sources <span className="b tabular">{data.refCount}</span></span>
            <span className="tiny muted">Domains <span className="b tabular">{data.domainCount}</span></span>
          </div>
        )}
      </div>

      {data.references.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="card-h" style={{ padding: "16px 18px", marginBottom: 0, borderBottom: "1px solid var(--border)" }}>
            <div>
              <div className="t">Cited sources</div>
              <div className="tiny muted" style={{ marginTop: 2 }}>
                In the order Google cites them
                {data.refCount > data.references.length && ` · showing first ${data.references.length} of ${data.refCount}`}
              </div>
            </div>
          </div>

          <div className="cmp-list">
            {data.references.map((r, i) => {
              const host = normalizeHost(r.domain)
              const isOwn = host === ownHost || host.endsWith(`.${ownHost}`)
              return (
                <div
                  key={`${r.url}-${i}`}
                  className="cmp-card static"
                  style={isOwn ? { borderColor: "var(--brand)", background: "var(--brand-soft)" } : undefined}
                >
                  <div className="body">
                    <div className="url-line" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Favicon domain={r.domain} fallbackColor={isOwn ? "var(--brand)" : undefined} />
                      <div style={{ minWidth: 0, lineHeight: 1.25 }}>
                        <div style={{ fontSize: 13, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.source || host}
                        </div>
                        <span className="tiny muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {host}
                        </span>
                      </div>
                      {isOwn && (
                        <span className="chip brand" style={{ marginLeft: 4, fontSize: 10 }} title="Your site">
                          Your site
                        </span>
                      )}
                    </div>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="title"
                      style={{ display: "inline-block", color: "var(--brand)", textDecoration: "none", fontSize: 15, lineHeight: 1.3 }}
                    >
                      {r.title || r.url}
                    </a>
                  </div>
                  <span className="cmp-rank" title={`Cited #${i + 1}`}>#{i + 1}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Nested AI blocks (product considerations, AI-expanded PAA). Domains only
          — the backend stores just those, since it's a secondary signal. */}
      {data.expansionDomains.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-h">
            <div>
              <div className="t">Other AI blocks on this page</div>
              <div className="tiny muted" style={{ marginTop: 2 }}>
                Domains cited by AI-generated sections other than the AI Overview
              </div>
            </div>
          </div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {data.expansionDomains.map((d) => {
              const host = normalizeHost(d)
              const isOwn = host === ownHost || host.endsWith(`.${ownHost}`)
              return (
                <span key={d} className={isOwn ? "chip brand" : "chip outline"} style={{ fontSize: 11 }}>
                  {host}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
