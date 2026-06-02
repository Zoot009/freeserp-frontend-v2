"use client"

import { useState } from "react"
import { api, ApiError } from "@/lib/api"
import { ALL_LOCATIONS, flagFor } from "@/lib/locations"
import { Icon } from "@/components/dashboard/icons"
import {
  StatTile,
  FeatChip,
  serpFeaturesToChips,
  type SerpFeatures,
} from "@/components/dashboard/primitives"

type SerpResultRow = {
  position: number
  domain: string
  url: string
  title: string
  snippet: string | null
}

type CompositionRow = { type: string; label: string; count: number }

type CheckResponse = {
  keyword: string
  domain: string | null
  country: string
  device: "desktop" | "mobile"
  checkedAt: string
  position: number | null
  url: string | null
  found: boolean
  searchVolume: number | null
  totalResults: number
  topCompetitor: { domain: string; position: number } | null
  results: SerpResultRow[]
  serpFeatures: SerpFeatures | null
  composition: CompositionRow[]
  aiOverview: { present: boolean; sources: number; cited: boolean } | null
}

function fmtVolume(v: number | null): string {
  if (v == null) return "—"
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1) + "M"
  if (v >= 1_000) return Math.round(v / 1_000) + "k"
  return v.toLocaleString()
}

export default function SerpCheckerPage() {
  const [domain, setDomain] = useState("")
  const [keyword, setKeyword] = useState("")
  const [country, setCountry] = useState("us")
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop")

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CheckResponse | null>(null)

  const canSubmit = keyword.trim().length > 0 && !loading

  async function runCheck(e?: React.FormEvent) {
    e?.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.post<CheckResponse>("/api/check", {
        keyword: keyword.trim(),
        domain: domain.trim() || undefined,
        country,
        device,
      })
      setResult(res)
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Something went wrong. Please try again."
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  function exportReport() {
    if (!result) return
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `serp-check-${result.keyword.replace(/\s+/g, "-").toLowerCase()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const chips = result ? serpFeaturesToChips(result.serpFeatures) : []
  const compMax = result ? Math.max(1, ...result.composition.map((c) => c.count)) : 1

  return (
    <div className="page">
      <div className="page-h">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow"><span className="spark"><Icon.plus /></span> ONE-OFF CHECK</div>
          <h1>SERP Checker</h1>
          <div className="sub">Run an unbiased Google query from a clean server. Top 100, depersonalized.</div>
        </div>
        <div className="row">
          <button className="btn" disabled={!result} onClick={exportReport}>
            <Icon.download /> Export report
          </button>
        </div>
      </div>

      {/* Query form */}
      <form className="card" onSubmit={runCheck} style={{ marginBottom: 16 }}>
        <div className="grid g-2" style={{ marginBottom: 14 }}>
          <Field label="Domain">
            <input
              className="input"
              placeholder="yourdomain.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
          </Field>
          <Field label="Keyword">
            <input
              className="input"
              placeholder="best running shoes"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              required
            />
          </Field>
          <Field label="Country">
            <select
              className="input"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            >
              {ALL_LOCATIONS.map((loc) => (
                <option key={loc.code} value={loc.code}>
                  {flagFor(loc.code)} {loc.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Device">
            <div className="pill-toggle" style={{ width: "100%" }}>
              {(["desktop", "mobile"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  className={device === d ? "active" : ""}
                  style={{ flex: 1 }}
                  onClick={() => setDevice(d)}
                >
                  {d === "desktop" ? <Icon.dash /> : <Icon.globe />}
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <button type="submit" className="btn primary" style={{ width: "100%", justifyContent: "center" }} disabled={!canSubmit}>
          {loading ? <><Icon.refresh /> Checking…</> : <><Icon.zap /> Check Rankings</>}
        </button>
        <div className="tiny muted" style={{ textAlign: "center", marginTop: 10 }}>
          Free · No signup · ~10 seconds
        </div>

        {error && (
          <div
            className="tiny"
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: "var(--r-md)",
              background: "var(--neg-soft)",
              color: "var(--neg)",
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}
      </form>

      {/* Loading skeleton */}
      {loading && !result && (
        <div className="card" style={{ padding: 60, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
          Querying Google for “{keyword.trim()}”…
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          <div className="grid g-4" style={{ marginBottom: 16 }}>
            <StatTile
              lbl="Your position"
              val={result.domain ? (result.found ? `#${result.position}` : "100+") : "—"}
              tip={
                result.domain
                  ? result.found
                    ? `for ${result.domain}`
                    : "not in top 100"
                  : "add a domain to track"
              }
            />
            <StatTile
              lbl="SERP features"
              val={chips.length}
              tip={chips.length ? chips.map((c) => featLabel(c)).join(" · ") : "none detected"}
            />
            <StatTile
              lbl="Top competitor"
              val={result.topCompetitor ? result.topCompetitor.domain : "—"}
              tip={result.topCompetitor ? `#${result.topCompetitor.position} result` : undefined}
            />
            <StatTile
              lbl="Search volume"
              val={fmtVolume(result.searchVolume)}
              tip={`/mo in ${result.country.toUpperCase()}`}
            />
          </div>

          <div className="grid g-21">
            {/* Results list */}
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div
                className="row"
                style={{ justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid var(--border)" }}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="b">Top 10 results for “{result.keyword}”</div>
                  <div className="tiny muted mono" style={{ marginTop: 2 }}>
                    google.com · {result.country.toUpperCase()} · {result.device}
                  </div>
                </div>
                <a
                  className="btn sm"
                  href={`https://www.google.com/search?q=${encodeURIComponent(result.keyword)}&gl=${result.country}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon.globe /> Open in Google
                </a>
              </div>

              {result.aiOverview?.present && (
                <div
                  className="row"
                  style={{
                    gap: 8,
                    alignItems: "center",
                    padding: "10px 16px",
                    background: "var(--brand-soft, rgba(59,130,246,0.08))",
                    borderBottom: "1px solid var(--border)",
                    fontSize: 12.5,
                  }}
                >
                  <span className="chip outline" style={{ color: "var(--brand)" }}><Icon.ai /> AI Overview</span>
                  <span className="muted">
                    {result.aiOverview.sources > 0
                      ? `Cited ${result.aiOverview.sources} source${result.aiOverview.sources === 1 ? "" : "s"}`
                      : "Shown"}
                    {result.domain && (result.aiOverview.cited ? " · you're cited" : ` · you're not one of them`)}
                  </span>
                </div>
              )}

              {result.results.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
                  No organic results returned.
                </div>
              ) : (
                <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {result.results.slice(0, 10).map((r) => {
                    const mine =
                      result.domain != null &&
                      (r.domain === result.domain || r.domain.endsWith(`.${result.domain}`))
                    return (
                      <li
                        key={r.position}
                        className="row"
                        style={{
                          gap: 12,
                          alignItems: "flex-start",
                          padding: "12px 16px",
                          borderBottom: "1px solid var(--border)",
                          background: mine ? "var(--pos-soft)" : undefined,
                        }}
                      >
                        <span className={"pos-badge " + (r.position <= 3 ? "top3" : r.position <= 10 ? "top10" : "")}>
                          {r.position}
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="row" style={{ gap: 6, alignItems: "center" }}>
                            <span className="b" style={{ fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {r.title || r.domain}
                            </span>
                            {mine && <span className="chip">You</span>}
                          </div>
                          <a
                            className="url tiny"
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          >
                            {r.url.replace(/^https?:\/\//, "")}
                          </a>
                          {r.snippet && (
                            <div className="tiny muted" style={{ marginTop: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                              {r.snippet}
                            </div>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>

            {/* SERP composition */}
            <div className="card">
              <div className="b" style={{ marginBottom: 4 }}>SERP composition</div>
              <div className="tiny muted" style={{ marginBottom: 14 }}>
                Elements Google rendered for this query.
              </div>
              {result.composition.length === 0 ? (
                <div className="tiny muted">No data.</div>
              ) : (
                <div className="col" style={{ gap: 12 }}>
                  {result.composition.map((c) => (
                    <div key={c.type}>
                      <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                        <span className="tiny">{c.label}</span>
                        <span className="tiny b tabular">{c.count}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 999, background: "var(--bg-inset)", overflow: "hidden" }}>
                        <div
                          style={{
                            height: "100%",
                            width: `${Math.round((c.count / compMax) * 100)}%`,
                            background: "var(--brand)",
                            borderRadius: 999,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {chips.length > 0 && (
                <>
                  <div className="tiny muted" style={{ margin: "16px 0 8px" }}>SERP features</div>
                  <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                    {chips.map((f) => <FeatChip key={f} f={f} />)}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
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

const FEAT_LABELS: Record<string, string> = {
  AI: "AI", FS: "Featured", PAA: "PAA", VID: "Video", IMG: "Images", LOCAL: "Local", KG: "Knowledge",
}
function featLabel(code: string): string {
  return FEAT_LABELS[code] ?? code
}
