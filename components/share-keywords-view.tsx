"use client"

import { useMemo, useState } from "react"
import { engineOf, DEFAULT_ENGINE } from "@/hooks/use-engines"
import { Favicon } from "@/components/favicon"
import { Icon } from "@/components/dashboard/icons"
import { Flag } from "@/components/flag"
import { PosCell, DeltaCell, type SerpFeatures } from "@/components/dashboard/primitives"

// Read-only keyword shape served by the public share endpoint
// (GET /api/projects/share/k/:token) — a subset of the dashboard's Keyword,
// minus owner-only/interaction fields.
// The public view has no registry to read labels from, so it title-cases the id
// and special-cases the ones we ship. An unknown engine still renders sensibly.
const ENGINE_LABELS: Record<string, string> = { google: "Google", bing: "Bing", yahoo: "Yahoo" }

interface ShareKeyword {
  id: string
  keyword: string
  location: string
  device: string | null
  /** Absent on older payloads; treated as Google. */
  engine?: string | null
  position: number | null
  /** How deep the latest check looked; labels a missing position honestly
      instead of hardcoding "100+". Absent on older payloads. */
  depthSearched?: number | null
  /** Set on sub-country keywords; `location` is a bare code when it is. */
  locationLabel?: string | null
  locationCountry?: string | null
  firstPosition: number | null
  d1: number | null
  url: string | null
  searchVolume: number | null
  serpFeatures: SerpFeatures | null
  status: string | null
  checkedAt: string | null
  pageScore: number | null
  pageScoreGrade: string | null
  pageScoreLabel: string | null
}

export interface ShareKeywordsData {
  name: string
  domain: string
  keywords: ShareKeyword[]
}

// Deterministic accent colour for the favicon fallback (mirrors projectColor on
// the dashboard, keyed on the domain since the share payload omits the id).
function domainColor(s: string): string {
  const palette = ["#2D5BFF", "#F59E0B", "#10B981", "#EC4899", "#8B5CF6", "#06B6D4", "#F97316"]
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

// Read-only status dot — mirrors the dashboard StatusDot (which isn't exported).
function StatusDot({ status }: { status: string | null }) {
  const colorMap: Record<string, string> = {
    COMPLETED: "var(--pos)",
    PENDING: "var(--warn)",
    PROCESSING: "var(--brand)",
    FAILED: "var(--neg)",
  }
  const color = colorMap[status ?? ""] ?? "var(--text-mute)"
  const pulse = status === "PENDING" || status === "PROCESSING"
  return (
    <span
      title={status ?? "NONE"}
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
        animation: pulse ? "shim 1.4s ease-in-out infinite" : undefined,
      }}
    />
  )
}

// Read-only page-audit score badge (same colour buckets as the dashboard, but
// non-interactive — there's no breakdown modal on the public page).
function ScoreBadge({ score, grade, label }: { score: number | null; grade: string | null; label: string | null }) {
  if (score == null) return <span className="tiny muted">—</span>
  const color = score >= 80 ? "var(--pos)" : score >= 60 ? "var(--warn)" : "var(--neg)"
  const soft = score >= 80 ? "var(--pos-soft)" : score >= 60 ? "var(--warn-soft)" : "var(--neg-soft)"
  return (
    <span
      title={`Page audit score${label ? ` — ${label}` : ""}`}
      className="tabular"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 8px",
        borderRadius: "var(--r-sm)",
        background: soft,
        color,
        fontWeight: 600,
        fontSize: 12,
        lineHeight: 1.4,
      }}
    >
      {score}
      {grade ? <span style={{ opacity: 0.75, fontWeight: 500 }}>{grade}</span> : null}
    </span>
  )
}

export function ShareKeywordsView({ data }: { data: ShareKeywordsData }) {
  const [filter, setFilter] = useState("")
  const [deviceTab, setDeviceTab] = useState<"desktop" | "mobile">("desktop")
  const [engineTab, setEngineTab] = useState<string>(DEFAULT_ENGINE)
  const color = domainColor(data.domain)

  // Engines are derived from the payload rather than /api/engines: this view is
  // public and unauthenticated, so it cannot call that endpoint — and what a
  // shared report should show is exactly the engines it contains, nothing more.
  const shareEngines = useMemo(() => {
    const ids = [...new Set(data.keywords.map((k) => engineOf(k)))]
    return ids.sort((a, b) => (a === DEFAULT_ENGINE ? -1 : b === DEFAULT_ENGINE ? 1 : a.localeCompare(b)))
  }, [data.keywords])
  const multiEngine = shareEngines.length > 1

  const deviceCounts = useMemo(() => {
    const c = { desktop: 0, mobile: 0 }
    data.keywords.forEach((k) => {
      if (multiEngine && engineOf(k) !== engineTab) return
      k.device === "mobile" ? c.mobile++ : c.desktop++
    })
    return c
  }, [data.keywords, engineTab, multiEngine])

  const engineCounts = useMemo(() => {
    const c: Record<string, number> = {}
    data.keywords.forEach((k) => {
      if ((k.device === "mobile" ? "mobile" : "desktop") !== deviceTab) return
      const id = engineOf(k)
      c[id] = (c[id] ?? 0) + 1
    })
    return c
  }, [data.keywords, deviceTab])

  // Scoped to device AND engine. Without the engine half, a shared report would
  // average a Google rank with a Bing one and present the result as a single
  // number — the recipient has no way to tell that happened.
  const scoped = useMemo(
    () =>
      data.keywords.filter(
        (k) =>
          (k.device === "mobile" ? "mobile" : "desktop") === deviceTab &&
          (!multiEngine || engineOf(k) === engineTab),
      ),
    [data.keywords, deviceTab, engineTab, multiEngine],
  )

  const statusCounts = useMemo(
    () =>
      scoped.reduce<Record<string, number>>((acc, kw) => {
        const s = kw.status || "NONE"
        acc[s] = (acc[s] || 0) + 1
        return acc
      }, {}),
    [scoped],
  )

  const stats = useMemo(() => {
    const positions = scoped
      .map((k) => k.position)
      .filter((p): p is number => p != null && Number.isFinite(p))
    return {
      total: scoped.length,
      avgPos: positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : 0,
      top3: positions.filter((p) => p <= 3).length,
      top10: positions.filter((p) => p <= 10).length,
    }
  }, [scoped])

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (!needle) return scoped
    return scoped.filter(
      (k) => k.keyword.toLowerCase().includes(needle) || (k.url ?? "").toLowerCase().includes(needle),
    )
  }, [scoped, filter])

  return (
    <div className="fs-app" translate="no" style={{ minHeight: "100vh", background: "var(--bg-sub)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "clamp(20px, 4vw, 28px) clamp(14px, 4vw, 24px) 64px" }}>
        {/* Header */}
        <div className="page-h" style={{ alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ marginBottom: 8 }}>
              <Favicon domain={data.domain} size={36} fallbackColor={color} />
              <div style={{ minWidth: 0 }}>
                <h1 style={{ margin: 0 }}>{data.name}</h1>
                <div className="tiny muted mono">{data.domain}</div>
              </div>
            </div>
            <div className="sub">
              {data.keywords.length} keyword{data.keywords.length !== 1 ? "s" : ""} tracked
            </div>
          </div>
        </div>

        {/* Stat tiles */}
        <div className="grid g-3" style={{ marginBottom: 14 }}>
          <div className="stat">
            <div className="lbl">Keywords tracked</div>
            <div className="val tabular">{stats.total.toLocaleString()}</div>
            <span className="tiny muted">{stats.top3} in top 3</span>
          </div>
          <div className="stat">
            <div className="lbl">Average position</div>
            <div className="val tabular">{stats.avgPos ? stats.avgPos.toFixed(1) : "—"}</div>
            <span className="tiny muted">
              {stats.total > 0
                ? `${stats.total - (statusCounts["FAILED"] || 0) - (statusCounts["NONE"] || 0)} ranked`
                : "no data"}
            </span>
          </div>
          <div className="stat">
            <div className="lbl">In top 10</div>
            <div className="val tabular">{stats.top10.toLocaleString()}</div>
            <span className="tiny muted">
              {stats.total ? `${Math.round((stats.top10 / stats.total) * 100)}%` : "—"}
            </span>
          </div>
        </div>

        {/* Filter row */}
        {data.keywords.length > 0 && (
          <div className="filter-row">
            <div style={{ position: "relative", width: 260 }}>
              <span style={{ position: "absolute", left: 10, top: 9, color: "var(--text-mute)" }}>
                <Icon.search />
              </span>
              <input
                className="input"
                style={{ paddingLeft: 32 }}
                placeholder="Search keywords or URLs…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <div className="tiny muted spacer">
              Showing {filtered.length} of {scoped.length}
            </div>
            <div className="pill-toggle" style={{ width: "fit-content" }}>
              {multiEngine &&
        shareEngines.map((id) => (
          <button
            key={id}
            type="button"
            className={engineTab === id ? "active" : ""}
            onClick={() => setEngineTab(id)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            {ENGINE_LABELS[id] ?? id} ({engineCounts[id] ?? 0})
          </button>
        ))}
      {(["desktop", "mobile"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  className={deviceTab === d ? "active" : ""}
                  onClick={() => setDeviceTab(d)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  {d === "desktop" ? <Icon.monitor /> : <Icon.smartphone />}
                  {d === "desktop" ? "Desktop" : "Mobile"} ({deviceCounts[d]})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Keywords table */}
        {filtered.length === 0 ? (
          <div
            className="card"
            style={{
              padding: "40px 32px",
              textAlign: "center",
              border: "1px dashed var(--border-strong)",
              background: "transparent",
              color: "var(--text-mute)",
              fontSize: 13,
            }}
          >
            {filter.trim() ? `No keywords match “${filter}”.` : "No keywords to show."}
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto", overflowY: "visible" }}>
              <table className="tbl" style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    <th>Keyword</th>
                    <th>Position</th>
                    <th style={{ whiteSpace: "nowrap" }}>First check</th>
                    <th>Volume</th>
                    <th>URL</th>
                    <th>Keyword score</th>
                    <th>Last checked</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((kw) => {
                    const isActive = kw.status === "PENDING" || kw.status === "PROCESSING"
                    return (
                      <tr key={kw.id} style={isActive ? { background: "var(--warn-soft)" } : undefined}>
                        <td>
                          <span className="row" style={{ gap: 8, alignItems: "center" }}>
                            {/* See the note in dashboard/keywords: below country
                                level `location` is a bare DataForSEO code. */}
                            <Flag
                              code={kw.locationCountry ?? kw.location}
                              title={kw.locationLabel ?? kw.location?.toUpperCase()}
                            />
                            <span className="kw" title={kw.keyword}>{kw.keyword}</span>
                          </span>
                        </td>
                        <td>
                          <div className="row" style={{ gap: 8, alignItems: "center" }}>
                            <PosCell
                              position={kw.position}
                              processing={isActive}
                              checked={!!kw.checkedAt}
                              depthSearched={kw.depthSearched}
                            />
                            {/* Inline delta only when there was actual movement —
                                a "—" placeholder next to the badge reads as clutter. */}
                            {kw.position != null && kw.d1 != null && kw.d1 !== 0 && (
                              <DeltaCell from={kw.position + kw.d1} to={kw.position} />
                            )}
                          </div>
                        </td>
                        <td>
                          <PosCell position={kw.firstPosition} checked={!!kw.checkedAt} />
                        </td>
                        <td className="tabular">{kw.searchVolume != null ? kw.searchVolume.toLocaleString() : "—"}</td>
                        <td style={{ maxWidth: 220 }}>
                          {kw.url ? (
                            <a
                              href={kw.url}
                              target="_blank"
                              rel="noreferrer"
                              className="url"
                              style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                            >
                              {kw.url.replace(/^https?:\/\//, "")}
                            </a>
                          ) : (
                            <span className="tiny muted" title="No URL — keyword is ranking deeper than the top 100">
                              —
                            </span>
                          )}
                        </td>
                        <td>
                          <ScoreBadge score={kw.pageScore} grade={kw.pageScoreGrade} label={kw.pageScoreLabel} />
                        </td>
                        <td className="tiny muted" style={{ whiteSpace: "nowrap" }}>
                          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                            <span>
                              {kw.checkedAt
                                ? new Date(kw.checkedAt).toLocaleDateString("en-IN", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  })
                                : "Never"}
                            </span>
                            <StatusDot status={kw.status} />
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer — branding */}
        <div
          className="row between"
          style={{ marginTop: 36, paddingTop: 16, borderTop: "1px solid var(--border)", flexWrap: "wrap", gap: 8 }}
        >
          <span className="tiny muted">Powered by FreeSERP</span>
          <a href="https://freeserp.com" target="_blank" rel="noopener noreferrer" className="tiny muted" style={{ textDecoration: "none" }}>
            freeserp.com
          </a>
        </div>
      </div>
    </div>
  )
}
