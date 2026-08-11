"use client"

import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth"
import { api, ApiError } from "@/lib/api"
import { Favicon } from "@/components/favicon"
import { Icon } from "@/components/dashboard/icons"
import {
  StatTile,
  PosBadge,
  FeatChip,
  serpFeaturesToChips,
  type SerpFeatures,
} from "@/components/dashboard/primitives"

// Free accounts can track a single competitor; adding more requires Pro. Keep
// this in sync with the backend limit on POST /api/projects/:id/competitors.
const FREE_COMPETITORS_LIMIT = 1

// ───── Types (mirror the competitor-spy backend response shapes) ─────────────

interface OverviewStats {
  competitorsTracked: number
  addedThisWeek: number
  sharedKeywords: number
  youRankHigher: number
  contentGaps: number
}
interface CompetitorRow {
  id: string
  domain: string
  addedAt: string
  sharedCount: number
  gapCount: number
  rankHigherCount: number
}
interface OverviewResponse {
  stats: OverviewStats
  competitors: CompetitorRow[]
}

interface KeywordRow {
  keywordId: string
  keyword: string
  volume: number | null
  theirPosition: number
  theirUrl: string | null
  serpFeatures: SerpFeatures | null
  yourPosition?: number
}
interface TopPage {
  url: string
  keywords: number
  estTraffic: number
}
interface DetailResponse {
  competitor: {
    id: string
    domain: string
    addedAt: string
    estMonthlyTraffic: number
    avgPosition: number | null
    sharedCount: number
    gapCount: number
    rankHigherCount: number
  }
  sharedKeywords: KeywordRow[]
  contentGaps: KeywordRow[]
  youRankHigher: KeywordRow[]
  topPages: TopPage[]
}

interface Suggestion {
  domain: string
  sharedCount: number
}

interface CheckSummary {
  scheduled: number
  skipped?: "fresh" | "quota" | "none" | "error"
}
interface AddResult {
  competitor: { id: string; domain: string; addedAt: string }
  check: CheckSummary
}

type TabKey = "shared" | "gaps" | "higher" | "pages"

// ───── Helpers ───────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString())

const trafficFmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K`
      : `${n}`

const winStyle = { background: "var(--pos-soft)" }

// Difference between your rank and the competitor's. Lower position = better, so
// your 7 vs their 5 → "2 behind"; your 3 vs their 8 → "5 ahead".
function DiffCell({ your, their }: { your: number | undefined; their: number }) {
  if (your == null) return <span className="chip outline">—</span>
  const diff = your - their
  if (diff === 0) return <span className="chip">tie</span>
  if (diff > 0) return <span className="chip neg"><Icon.arrowDown /> {diff} behind</span>
  return <span className="chip pos"><Icon.arrowUp /> {-diff} ahead</span>
}

function SerpChips({ sf }: { sf: SerpFeatures | null | undefined }) {
  const chips = serpFeaturesToChips(sf)
  if (chips.length === 0) return <span className="tiny muted">—</span>
  return (
    <div className="row" style={{ gap: 3 }}>
      {chips.map((f) => <FeatChip key={f} f={f} />)}
    </div>
  )
}

// ───── Sorting ────────────────────────────────────────────────────────────────

type Dir = "asc" | "desc"
const TEXT_KEYS = new Set(["kw", "url"])

function useSort<K extends string>(key: K, dir: Dir) {
  const [sort, setSort] = useState<{ key: K; dir: Dir }>({ key, dir })
  const click = (k: K) =>
    setSort((s) => ({
      key: k,
      dir: s.key === k ? (s.dir === "asc" ? "desc" : "asc") : TEXT_KEYS.has(k) ? "asc" : "desc",
    }))
  return [sort, click] as const
}

function applySort<T, K extends string>(rows: T[], sort: { key: K; dir: Dir }, val: (r: T, k: K) => number | string): T[] {
  const out = [...rows]
  out.sort((a, b) => {
    const va = val(a, sort.key)
    const vb = val(b, sort.key)
    const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))
    return sort.dir === "asc" ? cmp : -cmp
  })
  return out
}

function SortHeader<K extends string>({
  label, k, sort, onClick, right,
}: {
  label: string
  k: K
  sort: { key: K; dir: Dir }
  onClick: (k: K) => void
  right?: boolean
}) {
  const active = sort.key === k
  return (
    <th onClick={() => onClick(k)} style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", textAlign: right ? "right" : undefined }}>
      {label}
      {active && <span style={{ color: "var(--brand)", marginLeft: 4 }}>{sort.dir === "asc" ? "↑" : "↓"}</span>}
    </th>
  )
}

// Small skeleton block (uses the shared .skeleton shimmer).
function Sk({ w, h = 14, mt = 0 }: { w?: number | string; h?: number; mt?: number }) {
  return <div className="skeleton" style={{ width: w ?? "100%", height: h, marginTop: mt }} />
}

function TableScroll({ children }: { children: React.ReactNode }) {
  return <div style={{ overflowX: "auto" }}>{children}</div>
}

// ───── Add-competitor modal ──────────────────────────────────────────────────

function AddCompetitorModal({
  projectId,
  locked,
  onClose,
  onAdded,
}: {
  projectId: string
  // Free plan already at the competitor limit — the modal still shows the full
  // add experience, but the add action is replaced with an upgrade prompt.
  locked: boolean
  onClose: () => void
  onAdded: (res: AddResult) => void
}) {
  const [domain, setDomain] = useState("")
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    api.get<{ suggestions: Suggestion[] }>(`/api/projects/${projectId}/competitors/suggestions`)
      .then((d) => setSuggestions(d.suggestions))
      .catch(() => setSuggestions([]))
  }, [projectId])

  // Lock <body> scroll while the modal is open so the page underneath doesn't
  // scroll when the wheel is over the backdrop or the modal body reaches its end.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [])

  const add = async (value: string) => {
    if (locked) return // Free plan at the limit — the footer routes to /pricing instead.
    const v = value.trim()
    if (!v) { setError("Enter a competitor domain"); return }
    setError(""); setSubmitting(true)
    try {
      const res = await api.post<AddResult>(`/api/projects/${projectId}/competitors`, { domain: v })
      onAdded(res)
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "Failed to add competitor")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fs-app">
      <div className="modal-bg" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
          <div className="modal-h">
            <div>
              <div className="eyebrow" style={{ margin: 0, fontSize: 11 }}>
                <span className="spark"><Icon.users /></span> COMPETITOR SPY
              </div>
              <div className="b" style={{ fontSize: 18, marginTop: 4 }}>Add a competitor</div>
            </div>
            <button type="button" onClick={onClose} className="icon-btn" aria-label="Close"><Icon.close /></button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); add(domain) }}>
            <div className="modal-b" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="field">
                <label>Competitor domain</label>
                <input
                  autoFocus={!locked}
                  className="input"
                  placeholder="example.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  disabled={locked}
                  style={{ fontFamily: "var(--font-mono)" }}
                />
                <span className="tiny muted">Paste a domain or URL — we compare it against the keywords you already track.</span>
              </div>

              {suggestions == null ? (
                <div className="col" style={{ gap: 6 }}>
                  <Sk w={160} h={12} />
                  <Sk h={36} /><Sk h={36} /><Sk h={36} />
                </div>
              ) : suggestions.length > 0 ? (
                <div className="field">
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    Suggested from your SERPs
                    {/* Locked (free plan): list stays visible but non-clickable — a lock
                        icon + the disabled rows signal it needs Pro. */}
                    {locked && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--brand)" }} aria-label="Pro feature">
                        <rect x="3" y="11" width="18" height="11" rx="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    )}
                  </label>
                  <div className="col" style={{ gap: 6 }}>
                    {suggestions.map((s) => (
                      <button
                        key={s.domain}
                        type="button"
                        className="btn"
                        disabled={submitting || locked}
                        onClick={() => add(s.domain)}
                        style={{ justifyContent: "space-between", width: "100%", cursor: locked ? "not-allowed" : undefined }}
                      >
                        <span className="row" style={{ gap: 8 }}>
                          <Favicon domain={s.domain} size={20} />
                          <span className="mono">{s.domain}</span>
                        </span>
                        <span className="tiny muted">{s.sharedCount} shared</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="tiny muted">No suggestions yet — run rank checks on more keywords to surface competing domains.</div>
              )}

              {error && (
                <div className="card tight" style={{ borderColor: "var(--neg)", background: "var(--neg-soft)", color: "var(--neg)", fontSize: 12 }}>
                  {error}
                </div>
              )}

              {/* Free plan is capped at one competitor — show the full add UI above
                  (greyed out), then the upgrade prompt here at the end. */}
              {locked && (
                <div
                  className="card tight"
                  style={{ borderColor: "var(--brand)", background: "var(--brand-soft)", display: "flex", flexDirection: "column", gap: 8 }}
                >
                  <div className="row" style={{ gap: 8, color: "var(--brand)", fontSize: 13, fontWeight: 600 }}>
                    <span className="spark"><Icon.spark /></span>
                    {`Free plan tracks ${FREE_COMPETITORS_LIMIT} competitor`}
                  </div>
                  <div className="tiny" style={{ color: "var(--text)", lineHeight: 1.6 }}>
                    You&apos;re already tracking your free competitor. Upgrade to Pro to spy on unlimited competitors across the keywords you track.
                  </div>
                </div>
              )}
            </div>
            <div className="modal-f">
              {locked ? (
                <>
                  <button type="button" className="btn" onClick={onClose}>Maybe later</button>
                  <Link href="/pricing?clicked-buy-button">
                    <button type="button" className="btn primary"><Icon.spark /> Upgrade to Pro</button>
                  </Link>
                </>
              ) : (
                <>
                  <button type="button" className="btn" onClick={onClose}>Cancel</button>
                  <button type="submit" className="btn primary" disabled={submitting || !domain.trim()}>
                    {submitting ? "Adding…" : "Add competitor"}
                  </button>
                </>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// ───── Detail tables ─────────────────────────────────────────────────────────

type CmpKey = "kw" | "your" | "their" | "diff" | "vol"

function cmpVal(r: KeywordRow, k: CmpKey): number | string {
  switch (k) {
    case "kw": return r.keyword
    case "your": return r.yourPosition ?? 999
    case "their": return r.theirPosition ?? 999
    case "diff": return (r.yourPosition ?? 999) - r.theirPosition
    case "vol": return r.volume ?? -1
  }
}

// Shared / You-rank-higher: both positions shown, winner cell tinted.
function ComparisonTable({ rows, kind }: { rows: KeywordRow[]; kind: "shared" | "higher" }) {
  const [sort, clickSort] = useSort<CmpKey>("vol", "desc")
  if (rows.length === 0) {
    return kind === "higher"
      ? <EmptyTab icon={<Icon.arrowUp />} title="No wins yet" subtitle="Once you outrank this competitor on a shared keyword, it shows up here." />
      : <EmptyTab icon={<Icon.search />} title="No shared keywords" subtitle="You and this competitor don't yet rank for any of the same tracked keywords." />
  }
  const sorted = applySort(rows, sort, cmpVal)
  return (
    <TableScroll>
      <table className="tbl">
        <thead>
          <tr>
            <SortHeader label="Keyword" k="kw" sort={sort} onClick={clickSort} />
            <SortHeader label="Your position" k="your" sort={sort} onClick={clickSort} />
            <SortHeader label="Their position" k="their" sort={sort} onClick={clickSort} />
            <SortHeader label="Difference" k="diff" sort={sort} onClick={clickSort} />
            <SortHeader label="Volume" k="vol" sort={sort} onClick={clickSort} />
            <th>SERP</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const yourWins = r.yourPosition != null && r.yourPosition < r.theirPosition
            const theirWins = r.yourPosition != null && r.yourPosition > r.theirPosition
            return (
              <tr key={r.keywordId}>
                <td><div className="kw" title={r.keyword}>{r.keyword}</div></td>
                <td style={yourWins ? winStyle : undefined}><PosBadge pos={r.yourPosition} /></td>
                <td style={theirWins ? winStyle : undefined}><PosBadge pos={r.theirPosition} /></td>
                <td><DiffCell your={r.yourPosition} their={r.theirPosition} /></td>
                <td className="tabular">{fmt(r.volume)}</td>
                <td><SerpChips sf={r.serpFeatures} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </TableScroll>
  )
}

type GapKey = "kw" | "their" | "vol"

function GapsTable({ rows }: { rows: KeywordRow[] }) {
  const [sort, clickSort] = useSort<GapKey>("vol", "desc")
  if (rows.length === 0) {
    return <EmptyTab icon={<Icon.check />} title="No content gaps" subtitle="You rank for every tracked keyword this competitor does." />
  }
  const sorted = applySort(rows, sort, (r, k) => (k === "kw" ? r.keyword : k === "their" ? r.theirPosition : r.volume ?? -1))
  return (
    <TableScroll>
      <table className="tbl">
        <thead>
          <tr>
            <SortHeader label="Keyword" k="kw" sort={sort} onClick={clickSort} />
            <SortHeader label="Their position" k="their" sort={sort} onClick={clickSort} />
            <th>Their page</th>
            <SortHeader label="Volume" k="vol" sort={sort} onClick={clickSort} />
            <th>SERP</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.keywordId}>
              <td><div className="kw" title={r.keyword}>{r.keyword}</div></td>
              <td><PosBadge pos={r.theirPosition} /></td>
              <td>
                {r.theirUrl
                  ? <a href={r.theirUrl} target="_blank" rel="noreferrer" className="url">{r.theirUrl}</a>
                  : <span className="tiny muted">—</span>}
              </td>
              <td className="tabular">{fmt(r.volume)}</td>
              <td><SerpChips sf={r.serpFeatures} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  )
}

type PageKey = "url" | "kw" | "traffic"

function TopPagesTable({ rows }: { rows: TopPage[] }) {
  const [sort, clickSort] = useSort<PageKey>("traffic", "desc")
  if (rows.length === 0) {
    return <EmptyTab icon={<Icon.globe />} title="No ranking pages" subtitle="No pages found for this competitor across your tracked keywords yet." />
  }
  const sorted = applySort(rows, sort, (p, k) => (k === "url" ? p.url : k === "kw" ? p.keywords : p.estTraffic))
  return (
    <TableScroll>
      <table className="tbl">
        <thead>
          <tr>
            <SortHeader label="Page" k="url" sort={sort} onClick={clickSort} />
            <SortHeader label="Keywords" k="kw" sort={sort} onClick={clickSort} />
            <SortHeader label="Est. traffic" k="traffic" sort={sort} onClick={clickSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.url}>
              <td><a href={p.url} target="_blank" rel="noreferrer" className="url">{p.url}</a></td>
              <td className="tabular">{p.keywords}</td>
              <td className="tabular">{trafficFmt(p.estTraffic)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  )
}

function EmptyTab({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div style={{ padding: "40px 16px", textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 10, color: "var(--text-mute)" }}>{icon}</div>
      <div className="b" style={{ fontSize: 14 }}>{title}</div>
      {subtitle && <div className="tiny muted" style={{ marginTop: 4, maxWidth: 380, margin: "4px auto 0" }}>{subtitle}</div>}
    </div>
  )
}

// ───── Page ────────────────────────────────────────────────────────────────

export default function CompetitorSpyPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const { user, loading: authLoading } = useAuth()

  const [overview, setOverview] = useState<OverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<DetailResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [tab, setTab] = useState<TabKey>("shared")
  const [showAdd, setShowAdd] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [checkNotice, setCheckNotice] = useState<CheckSummary | null>(null)
  const [detailReloadKey, setDetailReloadKey] = useState(0)
  const [pollsLeft, setPollsLeft] = useState(0)

  // Auth gate (mirrors the project keywords page).
  useEffect(() => {
    if (!authLoading && !user) router.push("/login")
    if (!authLoading && user && !user.emailVerified) router.push("/verify-email")
  }, [user, authLoading, router])

  const loadOverview = useCallback(async () => {
    try {
      const data = await api.get<OverviewResponse>(`/api/projects/${projectId}/competitors`)
      setOverview(data)
      // A ?competitor=<id> query param (e.g. arriving from the project's
      // Competitors insight card) preselects that competitor on first load.
      const fromUrl = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("competitor")
        : null
      // Keep a competitor selected: the current one if still present, else the
      // one named in the URL, else the first.
      setSelectedId((prev) => {
        if (prev && data.competitors.some((c) => c.id === prev)) return prev
        if (fromUrl && data.competitors.some((c) => c.id === fromUrl)) return fromUrl
        return data.competitors[0]?.id ?? null
      })
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 404) { router.replace("/dashboard/projects"); return }
      setError(err instanceof Error ? err.message : "Failed to load competitors")
    } finally {
      setLoading(false)
    }
  }, [projectId, router])

  useEffect(() => { loadOverview() }, [loadOverview])

  // Load detail whenever the selected competitor changes.
  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    let active = true
    setDetailLoading(true)
    api.get<DetailResponse>(`/api/projects/${projectId}/competitors/${selectedId}`)
      .then((d) => { if (active) setDetail(d) })
      .catch(() => { if (active) setDetail(null) })
      .finally(() => { if (active) setDetailLoading(false) })
    return () => { active = false }
  }, [projectId, selectedId, detailReloadKey])

  // After adding a competitor we trigger a background SERP re-check; poll a few
  // times so freshly-ingested ranks surface without a manual refresh.
  useEffect(() => {
    if (pollsLeft <= 0) return
    const t = setTimeout(() => {
      loadOverview()
      setDetailReloadKey((k) => k + 1)
      setPollsLeft((n) => n - 1)
    }, 25_000)
    return () => clearTimeout(t)
  }, [pollsLeft, loadOverview])

  const handleAdded = useCallback((res: AddResult) => {
    setShowAdd(false)
    if (res.competitor?.id) setSelectedId(res.competitor.id)
    setDetailReloadKey((k) => k + 1)
    loadOverview()
    // Show a banner + start polling only when a check was actually scheduled, or
    // when nothing could run because the daily quota is used up.
    if (res.check && (res.check.scheduled > 0 || res.check.skipped === "quota")) {
      setCheckNotice(res.check)
      setPollsLeft(res.check.scheduled > 0 ? 5 : 0)
    } else {
      setCheckNotice(null)
    }
  }, [loadOverview])

  const removeCompetitor = async (id: string) => {
    setRemoving(true)
    try {
      await api.delete(`/api/projects/${projectId}/competitors/${id}`)
      if (selectedId === id) setSelectedId(null)
      await loadOverview()
    } catch {
      /* surfaced via reload; keep silent */
    } finally {
      setRemoving(false)
    }
  }

  if (loading) return <PageSkeleton />
  if (error) {
    return <div className="page"><div className="card" style={{ borderColor: "var(--neg)", color: "var(--neg)" }}>{error}</div></div>
  }

  const stats = overview?.stats
  const competitors = overview?.competitors ?? []
  // Only gate once auth has resolved to "free" — treating the still-loading
  // undefined plan as free would flash the paywall at paid users.
  const isFree = user?.plan === "free"
  const atCompetitorLimit = isFree && competitors.length >= FREE_COMPETITORS_LIMIT
  const shareRate = stats && stats.sharedKeywords > 0
    ? Math.round((stats.youRankHigher / stats.sharedKeywords) * 1000) / 10
    : 0

  return (
    <div className="page">
      {/* Header */}
      <div className="page-h">
        <div style={{ minWidth: 0 }}>
          <Link href={`/dashboard/project/${projectId}/keywords`} className="kd-back" style={{ display: "inline-flex" }}>
            ← Back to project
          </Link>
          <h1 style={{ margin: "6px 0 0" }}>Competitor spy</h1>
          <div className="sub">
            {`${competitors.length} ${competitors.length === 1 ? "domain" : "domains"} you're competing with on shared keywords`}
          </div>
        </div>
        <button type="button" className="btn primary" onClick={() => setShowAdd(true)}>
          <Icon.plus /> Add competitor
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid g-4" style={{ marginBottom: 14 }}>
        <StatTile
          lbl="Competitors tracked"
          icon={<Icon.users />}
          val={stats?.competitorsTracked ?? 0}
          delta={stats && stats.addedThisWeek > 0 ? `+${stats.addedThisWeek} this week` : undefined}
          up={!!stats && stats.addedThisWeek > 0}
        />
        <StatTile lbl="Shared keywords" icon={<Icon.key />} val={fmt(stats?.sharedKeywords ?? 0)} tip="across all competitors" />
        <StatTile
          lbl="You rank higher"
          icon={<Icon.arrowUp />}
          val={stats?.youRankHigher ?? 0}
          tip={stats && stats.sharedKeywords > 0 ? `${shareRate}% of shared` : undefined}
        />
        <StatTile lbl="Content gaps" icon={<Icon.search size={14} />} val={fmt(stats?.contentGaps ?? 0)} tip="they rank, you don't" />
      </div>

      {checkNotice && (
        <div
          className="card tight"
          style={{
            marginBottom: 14, display: "flex", alignItems: "center", gap: 10,
            borderColor: "var(--brand)", background: "var(--brand-soft)", color: "var(--brand)", fontSize: 13,
          }}
        >
          {pollsLeft > 0 && (
            <span
              className="spin" aria-hidden
              style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--brand-soft)", borderTopColor: "var(--brand)", flexShrink: 0 }}
            />
          )}
          <span style={{ flex: 1 }}>
            {checkNotice.scheduled > 0
              ? `Checking ${checkNotice.scheduled} keyword${checkNotice.scheduled === 1 ? "" : "s"} for fresh ranks — results appear in a few minutes.`
              : "Daily check limit reached — these ranks will refresh on the next scheduled check."}
          </span>
          <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setCheckNotice(null)}>
            <Icon.close />
          </button>
        </div>
      )}

      {competitors.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 20px" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, color: "var(--text-mute)" }}>
            <span style={{ display: "inline-flex", transform: "scale(1.7)" }}><Icon.users /></span>
          </div>
          <div className="b" style={{ fontSize: 16 }}>No competitors tracked yet</div>
          <div className="muted" style={{ margin: "8px auto 18px", fontSize: 13, maxWidth: 380 }}>
            Add a competitor domain to compare ranks across the keywords you track.
          </div>
          <button type="button" className="btn primary" onClick={() => setShowAdd(true)}>
            <Icon.plus /> Add competitor
          </button>
        </div>
      ) : (
        <div className="grid g-12">
          {/* Competitor list */}
          <div className="card" style={{ padding: 0, overflow: "hidden", alignSelf: "start", minWidth: 0 }}>
            <div className="card-h" style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
              <span className="t">All competitors</span>
              <button type="button" className="icon-btn" onClick={() => setShowAdd(true)} aria-label="Add competitor">
                <Icon.plus />
              </button>
            </div>
            <div className="col" style={{ gap: 0 }}>
              {competitors.map((c) => {
                const total = c.sharedCount || 1
                const winPct = Math.round((c.rankHigherCount / total) * 100)
                const selected = c.id === selectedId
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className="row"
                    style={{
                      gap: 10, padding: "12px 16px", width: "100%", textAlign: "left",
                      border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer",
                      background: selected ? "var(--brand-soft)" : "transparent",
                    }}
                  >
                    <Favicon domain={c.domain} size={28} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="b" style={{ fontSize: 13, color: selected ? "var(--brand)" : "var(--text)" }}>
                        {c.domain}
                      </div>
                      <div className="tiny muted" style={{ marginBottom: 5 }}>{c.sharedCount} shared · {c.gapCount} gaps</div>
                      {c.sharedCount > 0 && (
                        <div className="bar" title={`You rank higher on ${c.rankHigherCount} of ${c.sharedCount} shared`}>
                          <span style={{ width: `${winPct}%`, background: "var(--pos)" }} />
                        </div>
                      )}
                    </div>
                    <Icon.chevR />
                  </button>
                )
              })}
            </div>
          </div>

          {/* Detail panel */}
          <div className="card" style={{ alignSelf: "start", minWidth: 0 }}>
            {detail ? (
              <CompetitorDetail
                detail={detail}
                tab={tab}
                setTab={setTab}
                removing={removing}
                onRemove={() => removeCompetitor(detail.competitor.id)}
              />
            ) : detailLoading ? (
              <div className="col" style={{ gap: 10 }}>
                <Sk w={200} h={20} />
                <Sk w={280} h={12} />
                <div style={{ height: 12 }} />
                {[0, 1, 2, 3, 4].map((i) => <Sk key={i} h={40} />)}
              </div>
            ) : (
              <div className="muted" style={{ padding: 40, textAlign: "center" }}>Select a competitor</div>
            )}
          </div>
        </div>
      )}

      {showAdd && typeof window !== "undefined" && createPortal(
        <AddCompetitorModal
          projectId={projectId}
          locked={atCompetitorLimit}
          onClose={() => setShowAdd(false)}
          onAdded={handleAdded}
        />,
        document.body,
      )}
    </div>
  )
}

// ───── Detail panel ──────────────────────────────────────────────────────────

function CompetitorDetail({
  detail,
  tab,
  setTab,
  removing,
  onRemove,
}: {
  detail: DetailResponse
  tab: TabKey
  setTab: (t: TabKey) => void
  removing: boolean
  onRemove: () => void
}) {
  const c = detail.competitor
  const winPct = c.sharedCount > 0 ? Math.round((c.rankHigherCount / c.sharedCount) * 100) : 0

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "shared", label: "Shared keywords", count: detail.sharedKeywords.length },
    { key: "gaps", label: "Content gaps", count: detail.contentGaps.length },
    { key: "higher", label: "You rank higher", count: detail.youRankHigher.length },
    { key: "pages", label: "Top pages", count: detail.topPages.length },
  ]

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div className="row" style={{ gap: 10 }}>
          <Favicon domain={c.domain} size={32} />
          <div>
            <div className="b" style={{ fontSize: 16 }}>{c.domain}</div>
            <div className="tiny muted">Tracked since {new Date(c.addedAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</div>
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <a href={`https://${c.domain}`} target="_blank" rel="noreferrer" className="btn sm">
            <Icon.external /> Visit site
          </a>
          <button type="button" className="btn sm" disabled={removing} onClick={onRemove}>
            {removing ? "Removing…" : "Remove"}
          </button>
        </div>
      </div>

      {/* Sub-stats strip */}
      <div className="row" style={{ gap: 0, marginBottom: 14, border: "1px solid var(--border)", borderRadius: "var(--r-md)", overflow: "hidden", flexWrap: "wrap" }}>
        <SubStat label="Est. monthly traffic" value={trafficFmt(c.estMonthlyTraffic)} />
        <Sep />
        <SubStat label="Avg position" value={c.avgPosition != null ? `#${c.avgPosition}` : "—"} />
        <Sep />
        <SubStat label="Shared keywords" value={fmt(c.sharedCount)} />
        <Sep />
        <SubStat label="Content gaps" value={fmt(c.gapCount)} accent />
      </div>

      {/* Win-rate bar */}
      {c.sharedCount > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <span className="tiny muted">You rank higher on {c.rankHigherCount} of {c.sharedCount} shared</span>
            <span className="tiny b" style={{ color: "var(--pos)" }}>{winPct}%</span>
          </div>
          <div className="bar thick"><span style={{ width: `${winPct}%`, background: "var(--pos)" }} /></div>
        </div>
      )}

      {/* Tabs — nowrap + scroll so labels keep one line and the strip never
          changes height between tabs. */}
      <div className="tabs" style={{ overflowX: "auto" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            className={"tab " + (tab === t.key ? "active" : "")}
            onClick={() => setTab(t.key)}
            style={{ whiteSpace: "nowrap" }}
          >
            {t.label} <span className="muted">({t.count})</span>
          </button>
        ))}
      </div>

      {tab === "shared" && <ComparisonTable rows={detail.sharedKeywords} kind="shared" />}
      {tab === "gaps" && <GapsTable rows={detail.contentGaps} />}
      {tab === "higher" && <ComparisonTable rows={detail.youRankHigher} kind="higher" />}
      {tab === "pages" && <TopPagesTable rows={detail.topPages} />}
    </>
  )
}

function Sep() {
  return <div style={{ width: 1, alignSelf: "stretch", background: "var(--border)" }} />
}

function SubStat({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div style={{ flex: "1 1 120px", padding: "10px 14px" }}>
      <div className="tiny muted" style={{ marginBottom: 3 }}>{label}</div>
      <div className="b" style={{ fontSize: 19, color: accent ? "var(--warn)" : "var(--text)" }}>{value}</div>
    </div>
  )
}

// ───── Loading skeleton ────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="page">
      <div className="page-h">
        <div>
          <Sk w={90} h={12} />
          <Sk w={200} h={28} mt={10} />
          <Sk w={300} h={14} mt={8} />
        </div>
        <Sk w={140} h={36} />
      </div>
      <div className="grid g-4" style={{ marginBottom: 14 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="stat">
            <Sk w={120} h={12} />
            <Sk w={64} h={28} mt={8} />
          </div>
        ))}
      </div>
      <div className="grid g-21">
        <div className="card"><Sk h={220} /></div>
        <div className="card"><Sk h={340} /></div>
      </div>
    </div>
  )
}
