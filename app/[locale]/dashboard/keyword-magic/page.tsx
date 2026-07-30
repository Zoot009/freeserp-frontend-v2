"use client"

// Keyword Magic Tool — one seed keyword → up to 500 real keywords (broad or
// related) with volume, KD, CPC, intent and SERP features, plus a word-group
// sidebar. Paid-only; the backend (POST /api/keyword-magic) enforces the gate
// and returns a 402 the shared api client already routes to the upsell modal.
//
// NOTE: strings are inline English for this first cut. The rest of the dashboard
// is i18n'd via next-intl; a follow-up should move these into a `dashKeywordMagic`
// message namespace across en/de/es/fr.

import { useCallback, useEffect, useMemo, useState } from "react"
import { api, ApiError } from "@/lib/api"
import { ALL_LOCATIONS } from "@/lib/locations"
import { Flag } from "@/components/flag"
import { Icon } from "@/components/dashboard/icons"
import { Dropdown } from "@/components/dashboard/dropdown"
import { StatTile } from "@/components/dashboard/primitives"

type MatchType = "broad" | "related"

type KwRow = {
  keyword: string
  volume: number | null
  cpc: number | null
  competition: number | null
  difficulty: number | null
  intent: string | null
  serpFeatures: string[]
  trend: { year: number; month: number; searchVolume: number }[]
}

type Usage = {
  plan: "free" | "paid"
  limit: number
  used: number
  remaining: number
  keywordLimit: number
  relatedAvailable: boolean
}

type MagicResponse = {
  seed: string
  matchType: MatchType
  location: string
  totalCount: number
  fetchedCount: number
  totalVolume: number
  avgDifficulty: number | null
  groups: { word: string; count: number }[]
  keywords: KwRow[]
  usage: Usage
}

const MATCH_TABS: { key: MatchType; label: string }[] = [
  { key: "broad", label: "Broad Match" },
  { key: "related", label: "Related" },
]

// intent → compact badge, mirroring how Semrush shows a single letter per row.
const INTENT: Record<string, { label: string; bg: string; fg: string }> = {
  informational: { label: "I", bg: "var(--brand-soft)", fg: "var(--brand)" },
  navigational: { label: "N", bg: "var(--bg-sub)", fg: "var(--text-soft)" },
  commercial: { label: "C", bg: "var(--warn-soft)", fg: "var(--warn)" },
  transactional: { label: "T", bg: "var(--pos-soft)", fg: "var(--pos)" },
}

// SERP feature type → short tag; unmapped types fall back to a trimmed label.
const SERP_ABBR: Record<string, string> = {
  featured_snippet: "Snippet",
  people_also_ask: "PAA",
  related_searches: "Related",
  video: "Video",
  youtube: "Video",
  images: "Images",
  image: "Images",
  knowledge_graph: "Knowledge",
  local_pack: "Local",
  map: "Map",
  top_stories: "News",
  ai_overview: "AI",
  shopping: "Shopping",
  paid: "Ads",
  people_also_search: "PAS",
  faq: "FAQ",
  reviews: "Reviews",
  twitter: "Twitter",
}

function fmtNum(v: number | null): string {
  if (v == null) return "—"
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1) + "M"
  if (v >= 10_000) return Math.round(v / 1_000) + "k"
  return v.toLocaleString()
}

function fmtCpc(v: number | null): string {
  return v == null ? "—" : "$" + v.toFixed(2)
}

function kdColor(kd: number): string {
  return kd <= 33 ? "var(--pos)" : kd <= 66 ? "var(--warn)" : "var(--neg)"
}

function serpTag(t: string): string {
  return SERP_ABBR[t] ?? t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function KeywordMagicPage() {
  const [seed, setSeed] = useState("")
  const [country, setCountry] = useState("us")
  const [matchType, setMatchType] = useState<MatchType>("broad")

  const [result, setResult] = useState<MagicResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paywalled, setPaywalled] = useState(false)

  // Client-side narrowing of the already-fetched rows — no extra API calls.
  const [filter, setFilter] = useState("")
  const [activeGroup, setActiveGroup] = useState<string | null>(null)

  // Today's search allowance — fetched on load, then kept fresh from every
  // search response (and from a quota 402's details).
  const [usage, setUsage] = useState<Usage | null>(null)
  useEffect(() => {
    void api.get<Usage>("/api/keyword-magic/usage").then(setUsage).catch(() => {})
  }, [])
  const outOfSearches = usage != null && usage.remaining <= 0

  const run = useCallback(
    async (match: MatchType) => {
      const q = seed.trim()
      if (!q) return
      setLoading(true)
      setError(null)
      setPaywalled(false)
      setActiveGroup(null)
      setFilter("")
      try {
        const res = await api.post<MagicResponse>("/api/keyword-magic", {
          seed: q,
          matchType: match,
          country,
        })
        setResult(res)
        setUsage(res.usage)
        setMatchType(match)
      } catch (err) {
        setResult(null)
        if (err instanceof ApiError && err.status === 402) {
          // The api client already fired billing:quota for the global upsell
          // modal; we just switch this page into its paywalled state.
          setPaywalled(err.code === "plan_upgrade_required")
          setError(err.message)
          // The quota 402 carries the fresh usage snapshot — reflect it so the
          // "0 left" state and the disabled button appear immediately.
          if (err.code === "keyword_magic_quota_exhausted" && err.details) {
            setUsage(err.details as Usage)
          }
        } else {
          setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
        }
      } finally {
        setLoading(false)
      }
    },
    [seed, country],
  )

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void run(matchType)
  }

  // Switching tab re-runs the search for that match type (a distinct dataset +
  // a separate cache entry on the backend), but only when there's a seed.
  const switchTab = (key: MatchType) => {
    if (key === matchType && result) return
    setMatchType(key)
    if (seed.trim() && (result || loading)) void run(key)
  }

  const rows = useMemo(() => {
    if (!result) return []
    const f = filter.trim().toLowerCase()
    const g = activeGroup
    return result.keywords.filter((r) => {
      if (g && !r.keyword.toLowerCase().split(/[^a-z0-9]+/).includes(g)) return false
      if (f && !r.keyword.toLowerCase().includes(f)) return false
      return true
    })
  }, [result, filter, activeGroup])

  return (
    <div className="page">
      <div className="page-h">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">
            <span className="spark"><Icon.key /></span> SEO · Keyword Research
          </div>
          <h1>Keyword Magic Tool</h1>
          <div className="sub">
            One seed keyword → hundreds of real keyword ideas with search volume, difficulty, CPC and intent.
          </div>
        </div>

        {/* Daily allowance pill */}
        {usage && (
          <div
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0,
              padding: "7px 13px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap",
              border: "1px solid " + (outOfSearches ? "var(--neg)" : "var(--border)"),
              background: outOfSearches ? "var(--neg-soft)" : "var(--brand-soft)",
              color: outOfSearches ? "var(--neg)" : "var(--brand)",
            }}
            title={`${usage.plan === "paid" ? "Paid" : "Free"} plan · ${usage.keywordLimit} keywords per search`}
          >
            {outOfSearches ? <Icon.lock /> : <Icon.zap />}
            {outOfSearches
              ? `${usage.limit} of ${usage.limit} searches used`
              : `${usage.remaining} of ${usage.limit} searches left today`}
          </div>
        )}
      </div>

      {/* Limit-reached banner — clear state + a path to upgrade (free) */}
      {outOfSearches && usage && (
        <div
          className="card"
          style={{ marginBottom: 16, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", borderColor: "var(--neg)", background: "var(--neg-soft)" }}
        >
          <span style={{ fontSize: 13.5, color: "var(--neg)", fontWeight: 500 }}>
            You've used all {usage.limit} of today's Keyword Magic searches. They reset daily.
          </span>
          {usage.plan === "free" && (
            <a className="btn primary sm" href="/dashboard/billing" style={{ flexShrink: 0 }}>
              <Icon.zap /> Upgrade for more
            </a>
          )}
        </div>
      )}

      {/* Search form */}
      <form className="card" onSubmit={onSubmit} style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "stretch" }}>
          <div style={{ position: "relative", flex: "1 1 340px", minWidth: 0 }}>
            <span
              style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-mute)", display: "inline-flex" }}
            >
              <Icon.search />
            </span>
            <input
              className="input"
              style={{ paddingLeft: 36, width: "100%" }}
              placeholder="Enter a seed keyword, e.g. free serp checker"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              autoFocus
            />
          </div>
          <Dropdown
            menuAlign="left"
            value={country}
            options={ALL_LOCATIONS.map((loc) => ({
              value: loc.code,
              label: (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <Flag code={loc.code} size={15} /> {loc.name}
                </span>
              ),
            }))}
            onChange={setCountry}
            ariaLabel="Database country"
            style={{ flex: "0 0 200px" }}
          />
          <button type="submit" className="btn primary" disabled={loading || !seed.trim() || outOfSearches} style={{ flex: "0 0 auto" }}>
            {loading ? <><Icon.refresh /> Searching…</> : <><Icon.search /> Search</>}
          </button>
        </div>

        {/* Match-type tabs */}
        <div className="pill-toggle" style={{ marginTop: 12, display: "inline-flex" }}>
          {MATCH_TABS.map((tab) => {
            // Related is paid-only. For free users show it locked (a clear upsell)
            // rather than a normal tab that only errors after a wasted click.
            const locked = tab.key === "related" && usage != null && !usage.relatedAvailable
            return (
              <button
                key={tab.key}
                type="button"
                className={matchType === tab.key ? "active" : ""}
                onClick={() => {
                  if (locked) {
                    // Fire the global upsell modal; leave the current results intact.
                    window.dispatchEvent(new CustomEvent("billing:quota", {
                      detail: { code: "plan_upgrade_required", message: "The Related keywords view is available on paid plans. Upgrade to unlock it." },
                    }))
                    return
                  }
                  switchTab(tab.key)
                }}
                title={locked ? "Related is a paid feature — upgrade to unlock" : undefined}
                style={locked ? { display: "inline-flex", alignItems: "center", gap: 5 } : undefined}
              >
                {locked && <Icon.lock />}{tab.label}
              </button>
            )
          })}
        </div>
      </form>

      {/* Upgrade prompt — shown when a free user hits a paid boundary (e.g. the
          Related view). The specific reason comes from the backend message. */}
      {paywalled && (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <div className="spark" style={{ margin: "0 auto 12px", width: 40, height: 40 }}><Icon.lock /></div>
          <h2 style={{ margin: "0 0 6px", fontSize: 18 }}>Upgrade to unlock this</h2>
          <div className="sub" style={{ marginBottom: 16 }}>
            {error ?? "This is available on paid plans — upgrade for more keywords per search, more searches per day, and the Related view."}
          </div>
          <a className="btn primary" href="/dashboard/billing" style={{ display: "inline-flex" }}>
            <Icon.zap /> See plans
          </a>
        </div>
      )}

      {/* Non-paywall error */}
      {error && !paywalled && (
        <div
          className="tiny"
          style={{ marginBottom: 16, padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--neg-soft)", color: "var(--neg)", textAlign: "center" }}
        >
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !result && (
        <div className="card" style={{ padding: 60, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
          <span className="spin" style={{ display: "inline-flex", marginRight: 8 }}><Icon.refresh /></span>
          Crawling the keyword database for “{seed.trim()}”…
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          <div className="grid g-4" style={{ marginBottom: 16 }}>
            <StatTile
              lbl="Keywords"
              val={fmtNum(result.totalCount)}
              tip={`Showing ${result.fetchedCount.toLocaleString()} of ${result.totalCount.toLocaleString()}`}
              icon={<Icon.key />}
            />
            <StatTile lbl="Total volume" val={fmtNum(result.totalVolume)} tip="Monthly searches, shown rows" icon={<Icon.chart />} />
            <StatTile lbl="Average KD" val={result.avgDifficulty != null ? `${result.avgDifficulty}%` : "—"} tip="Keyword difficulty, shown rows" icon={<Icon.shield />} />
            <StatTile lbl="Match" val={matchType === "broad" ? "Broad" : "Related"} tip={`Market: ${result.location.toUpperCase()}`} icon={<Icon.filter />} />
          </div>

          <div className="km-layout">
            {/* Word-group sidebar */}
            <div className="card" style={{ padding: 12 }}>
              <div className="tiny muted" style={{ padding: "4px 8px 8px", fontWeight: 600 }}>By keyword</div>
              <button
                className="km-group"
                data-active={activeGroup == null}
                onClick={() => setActiveGroup(null)}
              >
                <span>All keywords</span>
                <span className="tabular">{result.fetchedCount}</span>
              </button>
              {result.groups.map((g) => (
                <button
                  key={g.word}
                  className="km-group"
                  data-active={activeGroup === g.word}
                  onClick={() => setActiveGroup(activeGroup === g.word ? null : g.word)}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.word}</span>
                  <span className="tabular" style={{ color: "var(--text-mute)" }}>{g.count}</span>
                </button>
              ))}
            </div>

            {/* Results table */}
            <div className="card" style={{ padding: 0 }}>
              <div className="row" style={{ padding: "12px 14px", gap: 10, alignItems: "center", borderBottom: "1px solid var(--border)" }}>
                <div style={{ position: "relative", flex: "1 1 auto", minWidth: 0 }}>
                  <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-mute)", display: "inline-flex" }}>
                    <Icon.search />
                  </span>
                  <input
                    className="input"
                    style={{ paddingLeft: 32, width: "100%" }}
                    placeholder="Filter these keywords…"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                </div>
                {activeGroup && (
                  <button className="chip" onClick={() => setActiveGroup(null)} title="Clear group filter">
                    {activeGroup} <Icon.close />
                  </button>
                )}
                <span className="tiny muted" style={{ whiteSpace: "nowrap" }}>{rows.length.toLocaleString()} shown</span>
              </div>

              <div className="tbl-scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Keyword</th>
                      <th style={{ width: 60, textAlign: "center" }}>Intent</th>
                      <th style={{ width: 110, textAlign: "right" }}>Volume</th>
                      <th style={{ width: 80, textAlign: "right" }}>KD %</th>
                      <th style={{ width: 90, textAlign: "right" }}>CPC</th>
                      <th style={{ width: 220 }}>SERP Features</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const intent = r.intent ? INTENT[r.intent] : null
                      const feats = r.serpFeatures.slice(0, 4)
                      const extra = r.serpFeatures.length - feats.length
                      return (
                        <tr key={r.keyword}>
                          <td>
                            <a
                              href={`https://www.google.com/search?q=${encodeURIComponent(r.keyword)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: "var(--brand)", textDecoration: "none" }}
                            >
                              {r.keyword}
                            </a>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            {intent ? (
                              <span
                                className="badge"
                                title={r.intent ?? undefined}
                                style={{ background: intent.bg, color: intent.fg, fontWeight: 600 }}
                              >
                                {intent.label}
                              </span>
                            ) : (
                              <span style={{ color: "var(--text-mute)" }}>—</span>
                            )}
                          </td>
                          <td className="tabular" style={{ textAlign: "right" }}>{fmtNum(r.volume)}</td>
                          <td className="tabular" style={{ textAlign: "right" }}>
                            {r.difficulty != null ? (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                                {r.difficulty}
                                <span style={{ width: 8, height: 8, borderRadius: "50%", background: kdColor(r.difficulty) }} />
                              </span>
                            ) : "—"}
                          </td>
                          <td className="tabular" style={{ textAlign: "right" }}>{fmtCpc(r.cpc)}</td>
                          <td>
                            <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap" }}>
                              {feats.map((f) => (
                                <span key={f} className="tag" title={f.replace(/_/g, " ")}>{serpTag(f)}</span>
                              ))}
                              {extra > 0 && <span className="tag" title="More features">+{extra}</span>}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ textAlign: "center", padding: 40, color: "var(--text-mute)" }}>
                          No keywords match your filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* First-load empty state */}
      {!result && !loading && !error && (
        <div className="card" style={{ padding: 60, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
          <div className="spark" style={{ margin: "0 auto 12px", width: 40, height: 40 }}><Icon.key /></div>
          Enter a seed keyword above to discover hundreds of related keywords with real metrics.
        </div>
      )}

      <style jsx>{`
        .km-layout {
          display: grid;
          grid-template-columns: 230px minmax(0, 1fr);
          gap: 16px;
          align-items: start;
        }
        /* Stack the word-group sidebar above the results table on narrow screens
           so neither overflows. */
        @media (max-width: 860px) {
          .km-layout {
            grid-template-columns: 1fr;
          }
        }
        .km-group {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 7px 8px;
          border: none;
          background: none;
          border-radius: var(--r-sm);
          font-size: 13px;
          color: var(--text-soft);
          cursor: pointer;
          text-align: left;
        }
        .km-group:hover {
          background: var(--bg-sub);
        }
        .km-group[data-active="true"] {
          background: var(--brand-soft);
          color: var(--brand);
          font-weight: 600;
        }
      `}</style>
    </div>
  )
}
