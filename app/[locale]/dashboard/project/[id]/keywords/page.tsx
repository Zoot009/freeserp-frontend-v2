"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { createPortal } from "react-dom"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/lib/auth"
import { api, ApiError } from "@/lib/api"
import { useTutorial } from "@/lib/tutorial"
import { LocationPicker } from "@/components/location-picker"
import { Favicon } from "@/components/favicon"
import { Icon } from "@/components/dashboard/icons"
import { Dropdown } from "@/components/dashboard/dropdown"
import { setProjectCrumb } from "@/components/dashboard/crumb-store"
import { FavoriteButton } from "@/components/dashboard/favorite-button"
import { StatCard, scoreBand } from "@/components/dashboard/stat-card"
import { InfoHint } from "@/components/dashboard/widget"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { AlertSettingsModal } from "@/components/dashboard/alert-settings-modal"
import { ReportModal } from "@/components/dashboard/report-modal"
import { Flag } from "@/components/flag"
import { trackOnce, trackMilestone } from "@/lib/track"
import { track } from "@/lib/analytics"
import {
  PosCell,
  DeltaCell,
  aiCitationState,
  type AiCitationState,
  type SerpFeatures,
  type MonthlySearch,
} from "@/components/dashboard/primitives"
import { Sparkle, Sparkles, Pencil, Check, X } from "lucide-react"

// Feature flag — automated/scheduled rank checks. When true, paid users see
// the check-frequency picker and the schedule chip. Free users never hit the
// scheduler (gated server-side in scheduler.runProjectChecks). Keep this in
// sync with the matching flag in freeserp-backend/src/routes/projects.js.
const SCHEDULED_CHECKS_ENABLED = true

// Per-project keyword cap for free users. Paid users have no cap. Must stay
// in sync with the free plan's dailyChecks in the backend.
const FREE_DAILY_CHECKS = 3

// Human label for an auto-check cadence (hours). Options offered: 24h / 7d /
// 15d / 30d — anything else falls back to a plain "Every Nh". Localized via the
// passed translator (projKeywords namespace).
function freqLabel(hours: number, t: (k: string) => string): string {
  switch (hours) {
    case 24: return t("freq24")
    case 168: return t("freq7d")
    case 360: return t("freq15d")
    case 720: return t("freq30d")
    default: return `Every ${hours}h`
  }
}

// Cadences offered when switching the schedule on, in the order they're listed.
const FREQ_CHOICES = [24, 168, 360, 720]

// ───── Types ───────────────────────────────────────────────────────────────

/**
 * Coarse elapsed-time label for a check that is taking longer than expected.
 * Deliberately low-precision — the point is "this has been a while", not a
 * stopwatch, and a ticking seconds counter on a stalled check reads as anxious.
 */
function formatCheckDuration(ms: number): string {
  const mins = Math.floor(ms / 60_000)
  if (mins < 60) return `${Math.max(1, mins)}m`
  const hours = Math.floor(mins / 60)
  const rem = mins % 60
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`
}

interface Keyword {
  id: string
  keyword: string
  location: string
  device: string | null
  addedAt: string
  position: number | null
  // First (oldest) rank ever recorded for this keyword — drives the "First check" column.
  firstPosition: number | null
  // Position deltas over the 1/7/15/30-day windows (positive = rank improved).
  d1: number | null
  d7: number | null
  d15: number | null
  d30: number | null
  url: string | null
  monthlyTraffic: number | null
  searchVolume: number | null
  serpFeatures: SerpFeatures | null
  searchVolumeTrend: MonthlySearch[] | null
  status: string | null
  // When the in-flight check started, and whether it has outlived its expected
  // window. Both absent unless a check is actually running — they let the UI age
  // its wording instead of promising every check lands within a minute.
  //
  // Optional because the frontend can run against a backend that predates them
  // (local bundle + deployed API). Absent degrades to the old always-optimistic
  // copy rather than throwing.
  checkStartedAt?: string | null
  checkOverdue?: boolean
  checkedAt: string | null
  latestAnalysisId: string | null
  // Keyword Score (0–100) of the ranking page for this keyword — the "Keyword
  // score" column. Mirrored from the Keyword Score Checker report. Null until
  // the keyword ranks and that report has run.
  pageScore: number | null
  pageScoreGrade: string | null
  pageScoreLabel: string | null
  // The exact page that was scored (ranking URL, or domain homepage when not
  // ranking). Also the URL the Keyword Score Checker report opens against.
  pageScoreUrl: string | null
}

interface ProjectDetail {
  id: string
  name: string
  domain: string
  isActive: boolean
  isPaused: boolean
  // Opt-in auto-check schedule. Off by default — the schedule card/select only
  // arm a cadence once the (paid) owner turns this on.
  autoCheckEnabled: boolean
  checkFrequency: number
  lastScheduledCheck: string | null
  nextScheduledCheck: string | null
  createdAt: string
  // Public-share token for the keywords page. Null = sharing off; non-null means
  // the read-only /share/keywords/<token> page is live. Drives the Share modal.
  shareToken: string | null
  // Domain authority & backlinks (DataForSEO) — fetched right after project
  // creation, auto-refreshed every 30 days. Null until the first fetch lands.
  domainAuthority: number | null
  domainBacklinks: number | null
  backlinksCheckedAt: string | null
  keywords: Keyword[]
}

type UsageInfo = { plan: string; dailyUsed: number; dailyLimit: number; dailyRemaining: number; isAdmin?: boolean }

type SortKey = "kw" | "pos" | "d1" | "d7" | "vol" | "checkedAt" | "score" | "aio"

// Sort rank for the AI Overview column. Ascending puts the actionable rows first:
// where we're cited, then where Google answered without us, then the states we
// can't act on.
//
// `pending` is not an AiCitationState — it maps to `unknown` there — but it gets
// its own rank so the rows worth re-checking group together instead of scattering
// among genuinely unchecked ones.
type AioSortState = AiCitationState | "pending"

const AIO_RANK: Record<AioSortState, number> = {
  cited: 0,
  "not-cited": 1,
  pending: 2,
  unknown: 3,
  "no-overview": 4,
}

function aioRank(features: SerpFeatures | null): number {
  if (features?.aiOverviewData?.pending) return AIO_RANK.pending
  return AIO_RANK[aiCitationState(features)]
}

// ───── Helpers ─────────────────────────────────────────────────────────────

function projectColor(id: string): string {
  const palette = ["#2D5BFF", "#F59E0B", "#10B981", "#EC4899", "#8B5CF6", "#06B6D4", "#F97316"]
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

/**
 * AI Overview citation verdict for one keyword.
 *
 * Four states, plus `pending` which overrides them: Google acknowledged an AI
 * Overview but returned a placeholder without its sources, so the citation is
 * genuinely unknown rather than negative — showing "Not cited" there would be a
 * lie the user can't distinguish from a real one.
 *
 * "No AI Overview" and "not checked yet" both render as a plain dash: neither is
 * actionable and a table shouldn't shout about them. Their tooltips differ,
 * because the two facts are not the same.
 */
function AiOverviewCell({ features }: { features: SerpFeatures | null }) {
  const t = useTranslations("projKeywords")
  const data = features?.aiOverviewData
  const citation = features?.aiOverviewCitation
  const state = aiCitationState(features)

  if (data?.pending) {
    return (
      <Hint text={t("aioPendingTip")}>
        <span className="aio pending">
          <span className="dot" aria-hidden />
          {t("aioPending")}
        </span>
      </Hint>
    )
  }
  if (state === "cited") {
    // refCount is the true citation count; `references` is always [] in the list
    // payload (trimmed for wire size), so never measure it here.
    const n = data?.refCount ?? 0
    return (
      <Hint
        text={n > 0 ? t("aioCitedTip", { position: citation?.citedPosition ?? 0, count: n }) : t("aioCitedTipNoCount")}
      >
        <span className="aio cited">
          <span className="dot" aria-hidden />
          {citation?.citedPosition != null ? t("aioCitedAt", { position: citation.citedPosition }) : t("aioCited")}
        </span>
      </Hint>
    )
  }
  if (state === "not-cited") {
    const domains = data?.domainCount ?? 0
    return (
      <Hint text={domains > 0 ? t("aioNotCitedTip", { count: domains }) : t("aioNotCitedTipNoCount")}>
        <span className="aio not-cited">
          <span className="dot" aria-hidden />
          {t("aioNotCited")}
        </span>
      </Hint>
    )
  }
  return (
    <Hint text={state === "no-overview" ? t("aioNoneTip") : t("aioUnknownTip")}>
      <span className="tiny muted">—</span>
    </Hint>
  )
}

function StatusDot({ status }: { status: string | null }) {
  const colorMap: Record<string, string> = {
    COMPLETED: "var(--pos)",
    PENDING: "var(--warn)",
    PROCESSING: "var(--brand)",
    FAILED: "var(--neg)",
  }
  const color = colorMap[status ?? ""] ?? "var(--text-mute)"
  const pulse = status === "PENDING" || status === "PROCESSING"
  // Minimal: just the colored dot; the status label lives in the tooltip.
  return (
    <Hint text={status ?? "NONE"}>
      <span
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
    </Hint>
  )
}

// Page-audit score badge. Same color buckets as the competitor-analysis
// comparison table (≥80 good, ≥60 fair, else poor) so the two surfaces agree.
// Keyword Page Score breakdown — fetched on demand when a score badge is
// clicked. Density-focused, scored over 5 fields (URL/Title/Meta/Content/
// Headings) by the backend (pageScore.ts); the detail lives in pageScoreData.
// This is intentionally decoupled from lib/seoScorer.ts (the 12-factor
// competitor-comparison scorer) — don't re-sync them.
interface KeywordScoreBreakdown {
  url: number
  title: number
  meta: number
  content: number
  headings: number
  density: number // measured content keyword density %
  total: number
  grade: string
  label: string
}

interface ScoreInfo {
  pageScore: number | null
  pageScoreGrade: string | null
  pageScoreLabel: string | null
  pageScoreUrl: string | null
  pageScoreAt: string | null
  breakdown: KeywordScoreBreakdown | null
}

// Field labels + maxes — must match the weighting in the backend pageScore.ts.
const SCORE_CATEGORIES: { key: keyof KeywordScoreBreakdown; label: string; max: number }[] = [
  { key: "url", label: "URL", max: 15 },
  { key: "title", label: "Title", max: 15 },
  { key: "meta", label: "Meta", max: 15 },
  { key: "content", label: "Content", max: 40 },
  { key: "headings", label: "Headings", max: 15 },
]

function ScoreBadge({ score, label, onClick, onEmptyClick, emptyTitle, loading }: { score: number | null; grade?: string | null; label: string | null; onClick?: () => void; onEmptyClick?: () => void; emptyTitle?: string; loading?: boolean }) {
  if (loading) {
    return (
      <span className="tiny muted" title="Opening detailed report…">
        <span className="spin" style={{ display: "inline-block", width: 13, height: 13, borderRadius: "50%", border: "2px solid var(--border-strong)", borderTopColor: "var(--brand)", boxSizing: "border-box", verticalAlign: "middle" }} />
      </span>
    )
  }
  if (score == null) {
    // Unscored (keyword not ranking) → the "—" becomes a call-to-action that
    // sends the user to the Keyword Score Checker to designate a page manually.
    if (onEmptyClick) {
      return (
        <Hint text={emptyTitle}>
        <span
          role="button"
          tabIndex={0}
          aria-label={emptyTitle}
          onClick={(e) => { e.stopPropagation(); onEmptyClick() }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onEmptyClick() } }}
          // Icon-only: the label lived in a wide pill that pushed this column out
          // of line with the numeric badges. The title/aria-label still explain it.
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 28, height: 21, borderRadius: "var(--r-sm)",
            border: "1px dashed var(--border-strong)", color: "var(--text-mute)",
            cursor: "pointer",
          }}
        >
          <Icon.plus />
        </span>
        </Hint>
      )
    }
    return (
      <Hint text={emptyTitle ?? "Scored automatically once the keyword ranks"}>
        <span className="tiny muted">—</span>
      </Hint>
    )
  }
  const color = score >= 80 ? "var(--pos)" : score >= 60 ? "var(--warn)" : "var(--neg)"
  const soft = score >= 80 ? "var(--pos-soft)" : score >= 60 ? "var(--warn-soft)" : "var(--neg-soft)"
  const clickable = !!onClick
  return (
    <Hint text={`Keyword score${label ? ` — ${label}` : ""}${clickable ? " — click to view in detail" : ""}`}>
    <span
      className="tabular"
      onClick={clickable ? (e) => { e.stopPropagation(); onClick!() } : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onClick!() } } : undefined}
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
        cursor: clickable ? "pointer" : "default",
      }}
    >
      {score}
    </span>
    </Hint>
  )
}

// (AuditBadge lived here — the P.S badge. Removed with the page score.)

function CountdownTimer({ targetDate }: { targetDate: string | null }) {
  const [timeLeft, setTimeLeft] = useState<string>("")

  useEffect(() => {
    if (!targetDate) {
      setTimeLeft("Not scheduled")
      return
    }
    const update = () => {
      const diff = new Date(targetDate).getTime() - Date.now()
      if (diff <= 0) {
        setTimeLeft("Running soon…")
        return
      }
      const days = Math.floor(diff / 86_400_000)
      const hours = Math.floor((diff % 86_400_000) / 3_600_000)
      const minutes = Math.floor((diff % 3_600_000) / 60_000)
      const seconds = Math.floor((diff % 60_000) / 1000)
      if (days > 0) setTimeLeft(`${days}d ${hours}h ${minutes}m`)
      else if (hours > 0) setTimeLeft(`${hours}h ${minutes}m ${seconds}s`)
      else if (minutes > 0) setTimeLeft(`${minutes}m ${seconds}s`)
      else setTimeLeft(`${seconds}s`)
    }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [targetDate])

  if (!targetDate) return <span className="tiny muted">Not scheduled</span>
  return <span className="tabular">{timeLeft}</span>
}

// ───── Add keywords modal ──────────────────────────────────────────────────

function AddKeywordsModal({
  projectId,
  currentCount,
  plan,
  domain,
  existingKeywords,
  aiSuggestions,
  aiStatus,
  onClose,
  onAdded,
}: {
  projectId: string
  currentCount: number
  plan?: string
  // Project context used to bias keyword suggestions toward the site's niche.
  domain: string
  existingKeywords: string[]
  // Whole-site keywords proposed by the AI from a crawl of the project's
  // homepage. Distinct from the Google-autocomplete chips below, which are
  // related-to-what-you-just-typed. Empty unless the run completed.
  aiSuggestions?: AiSuggestion[]
  aiStatus?: "idle" | "choosing" | "running" | "done" | "failed"
  onClose: () => void
  onAdded: (device: "desktop" | "mobile") => void
}) {
  const t = useTranslations("projKeywords")
  const [raw, setRaw] = useState("")
  const [location, setLocation] = useState("in")
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [suggLoading, setSuggLoading] = useState(false)
  // Sub-seeds already fetched (so we never re-request one), and the next
  // alphabet-expansion index — together they let the related-keyword pool keep
  // growing ("seo" → "seo a" → "seo b" …) so the user never runs out.
  const fetchedSeedsRef = useRef<Set<string>>(new Set())
  const expandIdxRef = useRef(0)
  const seedRef = useRef("")
  const taRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { taRef.current?.focus() }, [])

  // Only treat the user as free when /api/usage has explicitly told us so;
  // undefined (still loading) shouldn't surface paywall copy.
  const isFree = plan === "free"
  // No per-project keyword cap on any plan. Storing a keyword costs nothing —
  // only checking it does — so the list is unlimited, and the daily check
  // allowance is what rations the expensive part.
  const pendingLines = raw.split(/[\r\n,]+/).map((l) => l.trim()).filter(Boolean)

  // Anchor the related-keyword suggestions to the FIRST keyword entered (not the
  // last word being typed), so they stay stable as the user clicks to add more
  // related keywords instead of vanishing/changing on every keystroke.
  const seed = pendingLines[0] ?? ""

  // Niche context to bias suggestions toward the site's topic (so "serp" on an
  // SEO site suggests "serp checker", not "serpent"). Tokenize the domain (minus
  // protocol/www/TLD) and the already-tracked keywords, drop stopwords and short
  // tokens, and keep the most frequent — existing keywords are the strongest signal.
  const nicheTokens = useMemo(() => {
    const STOP = new Set(["the", "and", "for", "with", "your", "you", "how", "what", "best", "top", "near", "com", "www"])
    const counts = new Map<string, number>()
    const bump = (text: string, weight: number) => {
      for (const w of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
        if (w.length < 3 || STOP.has(w) || /^\d+$/.test(w)) continue
        counts.set(w, (counts.get(w) ?? 0) + weight)
      }
    }
    bump(domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\.[a-z.]+$/, ""), 1)
    for (const kw of existingKeywords) bump(kw, 2)
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([w]) => w)
  }, [domain, existingKeywords])

  // Fetch one batch of related keywords for a sub-seed and MERGE the unique ones
  // into the growing pool (never replace — so the strip keeps filling up). Uses
  // our local /api/keyword-suggest route (free Google autocomplete), reached
  // with a same-origin fetch (NOT lib/api, which points at the backend).
  const fetchSuggestionBatch = useCallback(async (subSeed: string) => {
    if (fetchedSeedsRef.current.has(subSeed)) return
    fetchedSeedsRef.current.add(subSeed)
    setSuggLoading(true)
    try {
      const ctx = nicheTokens.join(",")
      const res = await fetch(
        `/api/keyword-suggest?q=${encodeURIComponent(subSeed)}&gl=${encodeURIComponent(location)}&ctx=${encodeURIComponent(ctx)}`,
      )
      const data: { suggestions?: string[] } = await res.json()
      // Discard if the first keyword changed while this request was in flight,
      // so old-seed results don't leak into the new pool.
      if (!subSeed.toLowerCase().startsWith(seedRef.current.toLowerCase())) return
      const incoming = data.suggestions ?? []
      setSuggestions((prev) => {
        const seen = new Set(prev.map((s) => s.toLowerCase()))
        const merged = [...prev]
        for (const s of incoming) {
          const key = s.toLowerCase()
          if (!seen.has(key)) { merged.push(s); seen.add(key) }
        }
        return merged
      })
    } catch {
      /* aborted or failed — keep whatever we had */
    } finally {
      setSuggLoading(false)
    }
  }, [nicheTokens, location])

  // Reset the pool whenever the first keyword (or location) changes.
  useEffect(() => {
    seedRef.current = seed
    setSuggestions([])
    fetchedSeedsRef.current = new Set()
    expandIdxRef.current = 0
  }, [seed, location])

  // Suggestions not already added to the textarea. Show a generous batch (12).
  const pendingSet = new Set(pendingLines.map((l) => l.toLowerCase()))
  const visibleSuggestions = suggestions.filter((s) => !pendingSet.has(s.toLowerCase())).slice(0, 12)

  // Keep the pool topped up: fetch the base seed first, then alphabet-expansion
  // sub-seeds ("seo a", "seo b" …) whenever the visible strip runs low — so the
  // user always has fresh related keywords to add and never runs out.
  useEffect(() => {
    if (seed.length < 2) { setSuggLoading(false); return }
    const t = setTimeout(() => {
      if (!fetchedSeedsRef.current.has(seed)) { void fetchSuggestionBatch(seed); return }
      if (visibleSuggestions.length < 6) {
        const letters = "abcdefghijklmnopqrstuvwxyz0123456789"
        while (expandIdxRef.current < letters.length) {
          const sub = `${seed} ${letters[expandIdxRef.current]}`
          expandIdxRef.current++
          if (!fetchedSeedsRef.current.has(sub)) { void fetchSuggestionBatch(sub); break }
        }
      }
    }, 300)
    return () => clearTimeout(t)
  }, [seed, visibleSuggestions.length, fetchSuggestionBatch])

  // Clicking a chip APPENDS the related keyword as a new line (keeping everything
  // already entered, including the first/seed keyword) and refocuses. It does NOT
  // clear the suggestions — the strip stays anchored to the first keyword so the
  // user can keep adding related ones (each added chip is filtered out below).
  // Routing through `raw` keeps the free keyword cap enforced automatically.
  const addSuggestion = (kw: string) => {
    setRaw((prev) => {
      const base = prev.replace(/[\s,]+$/, "")
      return (base ? base + "\n" : "") + kw + "\n"
    })
    taRef.current?.focus()
  }

  // AI chips the user hasn't already staged in the textarea. Filtering on
  // `pendingSet` (not on a separate "added" list) means clicking a chip makes it
  // disappear and deleting the line brings it back — same behaviour as the
  // Google strip, one source of truth.
  const visibleAiSuggestions = (aiSuggestions ?? []).filter((s) => !pendingSet.has(s.keyword.toLowerCase()))

  // Bulk-add the top N. The whole point of the feature is that the user doesn't
  // have to evaluate 20 keywords one by one — they're already volume-sorted.
  // Routed through `raw` so the free-plan cap applies exactly as it does to
  // manual typing.
  const addTopAiSuggestions = () => {
    const picks = visibleAiSuggestions.slice(0, AI_BULK_ADD_COUNT).map((s) => s.keyword)
    if (!picks.length) return
    setRaw((prev) => {
      const base = prev.replace(/[\s,]+$/, "")
      return (base ? base + "\n" : "") + picks.join("\n") + "\n"
    })
    taRef.current?.focus()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const lines = raw.split(/[\r\n,]+/).map((l) => l.trim()).filter(Boolean)
    if (!lines.length) { setError("Enter at least one keyword"); return }
    setError(""); setLoading(true)
    try {
      await api.post(`/api/projects/${projectId}/keywords`, { keywords: lines.map((k) => ({ keyword: k, location, device })) })
      // Adding to a still-empty project might be this account's first-ever set of
      // keywords — let the backend decide (deduped per account, so it won't
      // re-fire on a later new project the way the old per-browser guard could).
      if (currentCount === 0) void trackMilestone("first-set-keywords-added")
      track("keywords_added", { projectId, count: lines.length })
      onAdded(device)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add keywords")
    } finally { setLoading(false) }
  }

  return (
    <div className="fs-app">
      <div className="modal-bg" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
          <div className="modal-h">
            <div>
              <div className="eyebrow" style={{ margin: 0, fontSize: 11 }}><span className="spark"><Icon.spark /></span> TRACK KEYWORDS</div>
              <div className="b" style={{ fontSize: 18, marginTop: 4 }}>Add keywords</div>
            </div>
            <button type="button" onClick={onClose} className="icon-btn" aria-label="Close"><Icon.close /></button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="modal-b" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="field">
                <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                  <label style={{ margin: 0 }}>
                    Keywords <span className="muted" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(one per line or comma-separated)</span>
                  </label>
                  <span
                    className="tiny"
                    style={{ color: "var(--text-mute)", fontFamily: "var(--font-mono)" }}
                  >
                    {`${pendingLines.length} pending · unlimited`}
                  </span>
                </div>
                <textarea
                  ref={taRef}
                  required
                  rows={6}
                  placeholder={"seo tools, keyword research\nfree serp checker"}
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  className="input"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 13,
                    resize: "vertical",
                    minHeight: 140,
                    lineHeight: 1.5,
                  }}
                />
                <span className="tiny muted">
                  {isFree
                    ? `Add as many keywords as you like (${currentCount} tracked). On the free plan ${FREE_DAILY_CHECKS} are checked each day — upgrade to check them all.`
                    : `Unlimited keywords per project (${currentCount} tracked).`}
                </span>

                {/* AI suggestions for the whole site, from a crawl of the
                    homepage. Rendered ABOVE the Google strip and independent of
                    it: these answer "what should this site target?", the ones
                    below answer "what's related to what you just typed?". The
                    Google strip needs a 2-char seed, so on a fresh project with
                    an empty textarea these are the only chips showing — which
                    is exactly the moment they matter. */}
                {visibleAiSuggestions.length > 0 && (
                  <div className="col" style={{ gap: 6, marginTop: 8 }}>
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                      <span className="tiny muted" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <span className="spark"><Icon.spark /></span> {t("aiChipsLabel")}
                      </span>
                      {visibleAiSuggestions.length > 1 && (
                        <button
                          type="button"
                          className="tiny"
                          onClick={addTopAiSuggestions}
                          style={{ background: "none", border: "none", padding: 0, color: "var(--brand)", cursor: "pointer", fontWeight: 500 }}
                        >
                          {t("aiAddTopN", { n: Math.min(AI_BULK_ADD_COUNT, visibleAiSuggestions.length) })}
                        </button>
                      )}
                    </div>
                    <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                      {visibleAiSuggestions.slice(0, 20).map((s) => (
                        <button
                          key={s.keyword}
                          type="button"
                          className="chip brand"
                          onClick={() => addSuggestion(s.keyword)}
                          title={s.rationale ?? `Add "${s.keyword}"`}
                          style={{ border: "none", cursor: "pointer" }}
                        >
                          + {s.keyword}
                          {s.volume != null && (
                            <span className="tiny muted" style={{ marginLeft: 6, fontFamily: "var(--font-mono)" }}>
                              {formatVolume(s.volume)}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {aiStatus === "failed" && (
                  <span className="tiny muted" style={{ marginTop: 8 }}>{t("aiFailedHint")}</span>
                )}

                {/* Live related-keyword suggestions (free Google autocomplete). */}
                {seed.length >= 2 && (suggLoading || visibleSuggestions.length > 0) && (
                  <div className="col" style={{ gap: 6, marginTop: 8 }}>
                    <span className="tiny muted">
                      {visibleSuggestions.length === 0 && suggLoading
                        ? "Finding related keywords…"
                        : "Related keywords — click to add"}
                    </span>
                    <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                      {visibleSuggestions.map((kw) => (
                        <button
                          key={kw}
                          type="button"
                          className="chip brand"
                          onClick={() => addSuggestion(kw)}
                          title={`Add "${kw}"`}
                          style={{ border: "none", cursor: "pointer" }}
                        >
                          + {kw}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="field">
                <label>Search location</label>
                <LocationPicker value={location} onChange={setLocation} variant="dashboard" showFlags />
              </div>
              <div className="field">
                <label>Device</label>
                <div className="pill-toggle" style={{ width: "fit-content" }}>
                  {(["desktop", "mobile"] as const).map((d) => (
                    <button key={d} type="button" onClick={() => setDevice(d)} className={device === d ? "active" : ""}>
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              {error && (
                <div className="card tight" style={{ borderColor: "var(--neg)", background: "var(--neg-soft)", color: "var(--neg)", fontSize: 12 }}>
                  {error}
                </div>
              )}
            </div>
            <div className="modal-f">
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn primary" disabled={loading}>
                {loading ? "Adding…" : "Add keywords"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// ───── AI keyword suggestions ──────────────────────────────────────────────

// One AI-proposed keyword, enriched with real DataForSEO volume. `volume` is
// null both when the provider has no data and when the enrichment call failed —
// the UI treats them identically (no badge).
export interface AiSuggestion {
  keyword: string
  intent: "informational" | "commercial" | "transactional" | "navigational"
  rationale?: string
  group?: string
  volume: number | null
  trend?: MonthlySearch[]
}

interface SuggestionRun {
  id: string
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"
  error: string | null
  crawlMethod: string | null
  suggestions: {
    siteSummary: string | null
    location: string
    suggestions: AiSuggestion[]
  } | null
}

// Give up on the analysis after this long and let the user get on with it. The
// individual HTTP calls are all sub-second (202 + status polls); this bounds the
// *job*, which crawls a third-party site and calls an LLM.
const AI_ANALYSIS_TIMEOUT_MS = 90_000
const AI_POLL_INTERVAL_MS = 3000
// How many suggestions the "Add top N" shortcut stages at once.
const AI_BULK_ADD_COUNT = 10

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k`
  return String(v)
}

// Roughly how long a full run takes (crawl + LLM + volume lookup). Paces the
// percentage only — the real finish is the COMPLETED status, which unmounts
// this screen entirely.
const AI_EXPECTED_MS = 22_000

// The three stages are the real sequence the worker performs, in order (see
// runKeywordSuggestions.worker.ts). The backend reports only PENDING →
// PROCESSING → COMPLETED, not sub-steps, so the percentage is paced by elapsed
// time rather than measured.
//
// Two rules stop it from lying outright: while the run is still queued the
// number holds near zero (PENDING means no worker has picked it up yet), and it
// stops at 99% — the last percent belongs to the completion event, not the clock.
const AI_STAGE_COUNT = 3

function AiAnalysisLoader({
  domain,
  status,
  startedAt,
  onSkip,
  t,
}: {
  domain: string
  status: SuggestionRun["status"] | undefined
  startedAt: number
  onSkip: () => void
  t: ReturnType<typeof useTranslations>
}) {
  const [elapsed, setElapsed] = useState(() => Date.now() - startedAt)

  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 200)
    return () => clearInterval(id)
  }, [startedAt])

  const queued = status === "PENDING" || status === undefined
  // Ease-out: brisk at first, slowing as it nears the cap, instead of racing to
  // the ceiling and sitting there looking stalled.
  const eased = 1 - Math.pow(1 - Math.min(1, elapsed / AI_EXPECTED_MS), 2)
  const pct = queued ? Math.min(8, Math.round(eased * 99)) : Math.round(eased * 99)

  // Stages derive from the same number, so the checklist can never contradict
  // the percentage.
  const stage = Math.min(AI_STAGE_COUNT - 1, Math.floor((pct / 100) * AI_STAGE_COUNT))
  const stages = [t("aiStageRead"), t("aiStageIdeas"), t("aiStageVolume")]

  return (
    <div className="card ks-load" style={{ border: "1px dashed var(--border-strong)", background: "transparent" }}>
      <div className="ks-head">
        {t.rich("aiAnalyzingDomain", { domain, b: (c) => <b>{c}</b> })}
      </div>

      <div className="ks-pct" role="status" aria-live="polite">
        {pct}<span>%</span>
      </div>

      <div className="ks-bar"><div className="ks-bar-fill" style={{ width: `${pct}%` }} /></div>

      <div className="ks-steps">
        {stages.map((label, i) => (
          <div key={label} className={`ks-step${i < stage ? " done" : i === stage ? " active" : ""}`}>
            <span className="ks-step-mark">{i < stage && <Icon.check />}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>

      {/* Escape hatch — the run continues in the background and its chips still
          appear in the modal if it lands. */}
      <button className="ks-bail" onClick={onSkip}>{t("aiSkip")}</button>
    </div>
  )
}

// ───── Page ────────────────────────────────────────────────────────────────

export default function ProjectKeywordsPage() {
  const t = useTranslations("projKeywords")
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = params.id as string
  const { user, loading: authLoading, token, refreshUser } = useAuth()
  const { advanceFromStep, isActive: tutorialActive, step: tutorialStep } = useTutorial()

  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [usage, setUsage] = useState<UsageInfo | null>(null)

  // Feed the topbar breadcrumb the real project name instead of "Project".
  useEffect(() => {
    if (project) setProjectCrumb(project.id, project.name || project.domain)
  }, [project])

  // Action state
  const [checking, setChecking] = useState(false)
  // Keywords today's plan budget couldn't cover on the last run — shown locked
  // with an upgrade prompt rather than silently left unchecked.
  const [lockedKwIds, setLockedKwIds] = useState<Set<string>>(new Set())
  // Keyword IDs with a per-keyword refresh in flight (drives the ↻ spinner).
  const [refreshingKw, setRefreshingKw] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Inline project-name rename (click the pencil next to the title).
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState("")
  const [savingName, setSavingName] = useState(false)
  // Keyword-delete confirmation: holds the ids slated for deletion. Single
  // delete = [oneId]; bulk delete = all selected ids. `null` = modal closed.
  const [confirmDeleteKwIds, setConfirmDeleteKwIds] = useState<string[] | null>(null)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [showAddKw, setShowAddKw] = useState(false)

  // `?add=1` opens the add-keyword panel on arrival — that panel owns the
  // location picker and the desktop/mobile toggle, so links elsewhere that
  // promise "set location & device" land ON the control instead of dropping the
  // user at the table to hunt for it. The param is scrubbed immediately so a
  // refresh or a bookmark doesn't keep reopening the panel.
  const wantsAdd = searchParams.get("add") === "1"
  useEffect(() => {
    if (!wantsAdd) return
    setShowAddKw(true)
    if (typeof window === "undefined") return
    const url = new URL(window.location.href)
    url.searchParams.delete("add")
    window.history.replaceState(null, "", url.toString())
  }, [wantsAdd])

  // ── AI keyword suggestions (new-project onboarding flow) ────────────────
  // `?new=1` is set by the projects page right after creation. It puts this
  // page into the analysis flow instead of showing an empty keyword table.
  const isNewProject = searchParams.get("new") === "1"
  const [aiRun, setAiRun] = useState<SuggestionRun | null>(null)
  // "choosing" → the new-project screen now ASKS whether to run the AI analysis
  // (crawl + OpenAI + volume, which costs money) or add keywords manually, instead
  // of auto-running it. The run only starts when the user picks "Analyze".
  const [aiPhase, setAiPhase] = useState<"idle" | "choosing" | "running" | "done" | "failed">(
    isNewProject ? "choosing" : "idle",
  )
  // Guards the START call only — polling must be free to re-arm on remount.
  const aiStartedRef = useRef(false)
  // Absolute give-up time, fixed on the first mount so StrictMode remounts and
  // token refreshes can't keep extending the analysis screen indefinitely.
  const aiDeadlineRef = useRef<number | null>(null)
  // When the analysis screen first appeared. Drives the loader's stage clock,
  // and is a ref (not state) so a StrictMode remount doesn't restart it.
  const aiStartedAtRef = useRef<number>(Date.now())
  const aiSuggestions = aiRun?.suggestions?.suggestions ?? []

  // Leave the onboarding flow: drop `?new=1` so a later refresh or a bookmark
  // doesn't drop the user back into the analysis screen.
  //
  // history.replaceState rather than router.replace on purpose. This page's
  // useRouter comes from next/navigation (not @/i18n/navigation), so replacing
  // with a bare "/dashboard/..." path would strip the locale prefix and bounce
  // a Spanish user into English mid-onboarding. We only want to scrub a query
  // param — no navigation, no re-render, no locale to get wrong.
  const exitNewProjectFlow = useCallback(() => {
    if (!isNewProject || typeof window === "undefined") return
    const url = new URL(window.location.href)
    url.searchParams.delete("new")
    window.history.replaceState(null, "", url.toString())
  }, [isNewProject])

  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null)

  // Dismiss the row-action menu on any outside interaction WITHOUT eating the
  // click (no blocking overlay — that forced users to click twice). The menu
  // and its own trigger are exempt; the trigger's onClick handles toggling.
  useEffect(() => {
    if (!openMenuId) return
    const close = () => { setOpenMenuId(null); setMenuPosition(null) }
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest("[data-kw-row-menu]")) return
      if (target?.closest(`[data-menu-trigger="${openMenuId}"]`)) return
      close()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [openMenuId])
  const [updatingFrequency, setUpdatingFrequency] = useState(false)
  // "off" = turn the schedule off; a number = the cadence in hours to arm.
  const [showAlerts, setShowAlerts] = useState(false)
  const [showReport, setShowReport] = useState(false)
  // Public-share modal state. project.shareToken is the source of truth for
  // whether sharing is on; these just track in-flight UI.
  const [showShare, setShowShare] = useState(false)
  const [shareBusy, setShareBusy] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [pausing, setPausing] = useState(false)
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set())
  const [historyKeywordId, setHistoryKeywordId] = useState<string | null>(null)
  const [historyItems, setHistoryItems] = useState<{ id: string; status: string; createdAt: string; completedAt: string | null }[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  // Page-score breakdown modal — null id = closed. Breakdown is fetched on open.
  const [scoreKeywordId, setScoreKeywordId] = useState<string | null>(null)
  const [scoreInfo, setScoreInfo] = useState<ScoreInfo | null>(null)
  const [scoreLoading, setScoreLoading] = useState(false)
  // Keyword favorites for this user, cross-referenced once so each row's star
  // starts in the right state. favReady flips when the fetch resolves so the
  // star remounts with the correct initial value.
  const [favKw, setFavKw] = useState<Set<string>>(new Set())
  const [favReady, setFavReady] = useState(false)

  // Filter + sort state
  const [filter, setFilter] = useState("")
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "pos", dir: "asc" })
  // Device view — keywords are tracked separately per device, so the table
  // shows one device at a time. Defaults to desktop; auto-flips to mobile once
  // (on first load) if the project only has mobile keywords.
  const [deviceTab, setDeviceTab] = useState<"desktop" | "mobile">("desktop")
  // Time window for the "Rankings improved" card (1/7/15/30-day deltas).
  const [rankPeriod, setRankPeriod] = useState<"d1" | "d7" | "d15" | "d30">("d1")
  const deviceTabInit = useRef(false)

  // Auth gate
  useEffect(() => {
    if (!authLoading && !user) router.push("/login")
    if (!authLoading && user && !user.emailVerified) router.push("/verify-email")
  }, [user, authLoading, router])

  // Load project
  const load = useCallback(async (silent = false): Promise<ProjectDetail | null> => {
    if (!silent) setLoading(true)
    try {
      const data = await api.get<ProjectDetail>(`/api/projects/${projectId}`)
      setProject(data)
      return data
    } catch (err: unknown) {
      // 404 = project doesn't exist (deleted, or wrong id); bounce to list.
      if (err instanceof ApiError && err.status === 404) {
        router.replace("/dashboard/projects")
        return null
      }
      // Background polls (silent) must not surface an error banner: the page
      // already shows data, so a transient network blip during polling would
      // otherwise flash a scary "Network Error". Fail quietly and let the next
      // poll retry. Only the initial (non-silent) load reports a load failure.
      if (!silent) setError(err instanceof Error ? err.message : "Failed to load project")
      return null
    } finally {
      if (!silent) setLoading(false)
    }
  }, [projectId, router])

  useEffect(() => { void load() }, [load])

  // On first load, if every keyword is mobile, open on the Mobile tab so the
  // table isn't empty. Runs once — the user's manual tab choice wins after.
  useEffect(() => {
    if (deviceTabInit.current || !project) return
    deviceTabInit.current = true
    const hasDesktop = project.keywords.some((k) => k.device !== "mobile")
    const hasMobile = project.keywords.some((k) => k.device === "mobile")
    if (!hasDesktop && hasMobile) setDeviceTab("mobile")
  }, [project])

  // Open the score-breakdown modal for a keyword and fetch its detail on demand
  // (mirrors the analysis-history modal). The header falls back to the row's
  // score while the breakdown loads.
  const openScore = async (kwId: string) => {
    setScoreKeywordId(kwId)
    setScoreInfo(null)
    setScoreLoading(true)
    try {
      const data = await api.get<ScoreInfo>(`/api/projects/${projectId}/keywords/${kwId}/score`)
      setScoreInfo(data)
    } catch {
      /* leave the breakdown empty on failure — the header still shows the score */
    } finally {
      setScoreLoading(false)
    }
  }

  // Keyword score click (ranking keyword) → open the full detailed Keyword Score
  // Checker report for the keyword + its ranking page, instead of the compact
  // modal. Reuses a recent analysis for the same url+keyword so repeated clicks
  // don't re-pay for the crawl.
  const [openingReportKwId, setOpeningReportKwId] = useState<string | null>(null)
  const openKeywordReport = async (kw: Keyword) => {
    if (openingReportKwId) return
    if (!kw.pageScoreUrl) { openScore(kw.id); return } // no ranking page → fall back to the modal
    setOpeningReportKwId(kw.id)
    try {
      const res = await api.post<{ analysis: { id: string } }>("/api/keyword-analysis/open", {
        keyword: kw.keyword,
        url: kw.pageScoreUrl,
      })
      router.push(`/dashboard/keyword-analysis/results?id=${res.analysis.id}&projectId=${projectId}&keywordId=${kw.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to open the detailed report.")
      setOpeningReportKwId(null)
    }
  }

  // Load usage info — drives the daily-checks counter shown in the header.
  // Seed from a session cache first so a page refresh restores the "checks reset
  // in …" notice instantly instead of flashing in once /api/usage returns.
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const cached = sessionStorage.getItem("fs:usage")
      if (cached) {
        const parsed = JSON.parse(cached) as UsageInfo
        if (parsed && typeof parsed.dailyLimit === "number") setUsage((prev) => prev ?? parsed)
      }
    } catch { /* ignore a bad/absent cache */ }
  }, [])
  useEffect(() => {
    if (!token || !user?.emailVerified) return
    api.get<UsageInfo>("/api/usage")
      .then((data) => {
        if (data && typeof data.dailyLimit === "number") {
          setUsage(data)
          try { sessionStorage.setItem("fs:usage", JSON.stringify(data)) } catch { /* quota/full — non-fatal */ }
        }
      })
      .catch(() => undefined)
  }, [token, user?.emailVerified])

  // Load the user's keyword favorites once, to seed each row's star state.
  useEffect(() => {
    if (!token || !user?.emailVerified) return
    let cancelled = false
    api.get<{ favorites: { entity: { id: string } }[] }>("/api/favorites?entityType=keyword")
      .then((r) => {
        if (cancelled) return
        setFavKw(new Set((r.favorites ?? []).map((f) => f.entity.id)))
        setFavReady(true)
      })
      .catch(() => { if (!cancelled) setFavReady(true) })
    return () => { cancelled = true }
  }, [token, user?.emailVerified])

  // AI keyword suggestions for a brand-new project: kick off the run, then poll
  // until it's terminal and open Add Keywords with whatever we got.
  //
  // The POST is idempotent server-side (it rejoins an in-flight or recent run
  // rather than starting a second one), so a refresh mid-analysis costs nothing
  // — that's what makes it safe to fire on every mount of a `?new=1` page.
  useEffect(() => {
    if (!isNewProject || !token || !user?.emailVerified) return
    // Only after the user chose "Analyze" (aiPhase → "running"). While "choosing"
    // / "idle" / terminal we don't POST — that's what makes declining cost nothing.
    if (aiPhase !== "running") return

    let cancelled = false
    let timer: ReturnType<typeof setInterval> | undefined
    const stop = () => { if (timer) clearInterval(timer); timer = undefined }

    const finish = (phase: "done" | "failed") => {
      if (cancelled) return
      stop()
      setAiPhase(phase)
      setShowAddKw(true)
    }

    const poll = async () => {
      try {
        const { run } = await api.get<{ run: SuggestionRun | null }>(
          `/api/projects/${projectId}/keyword-suggestions`,
        )
        if (cancelled || !run) return
        setAiRun(run)
        if (run.status === "COMPLETED") finish("done")
        else if (run.status === "FAILED") finish("failed")
      } catch (err) {
        // 404 (project deleted, so its run cascaded away) and 401/403 are
        // permanent — retrying can only burn the full timeout on a screen that
        // will never resolve. Fail fast into the manual flow instead.
        const status = err instanceof ApiError ? err.status : 0
        if (status === 404 || status === 401 || status === 403) {
          finish("failed")
          return
        }
        // Anything else (network blip, brief 5xx) — keep polling; the deadline
        // effect below guarantees we don't wait forever.
      }
    }

    // The ref gates ONLY the POST, never the polling setup. It used to gate the
    // whole effect, which deadlocked the screen: React StrictMode (on by default
    // in dev) mounts → unmounts → remounts, so the first mount set the ref and
    // the cleanup tore down the interval AND the deadline, then the remount hit
    // the ref and returned early — no poll, no timeout, spinner forever. A token
    // refresh re-running this effect caused the same hang in production.
    const alreadyStarted = aiStartedRef.current
    aiStartedRef.current = true

    const start = alreadyStarted
      ? Promise.resolve()
      // A failed start is still worth polling — getOrCreate is idempotent, so
      // the run may already exist from a previous mount.
      : api.post(`/api/projects/${projectId}/keyword-suggestions`, {}).catch(() => undefined)

    void start.then(() => {
      if (cancelled) return
      void poll()
      timer = setInterval(() => void poll(), AI_POLL_INTERVAL_MS)
    })

    return () => { cancelled = true; stop() }
  }, [isNewProject, token, user?.emailVerified, projectId, aiPhase])

  // The analysis deadline lives in its OWN effect, depending on neither `token`
  // nor `emailVerified`. It used to sit in the polling effect above, which made
  // it hostage to that effect's early return: when an access token expired and
  // could not be refreshed, api.ts cleared it to null, `token` flipped, the
  // cleanup killed the deadline, and the re-run bailed at the `!token` guard
  // BEFORE re-arming it. aiPhase stayed "running" with nothing left to ever end
  // it — the spinner ran forever. Anything that can strand the analysis screen
  // must be timed out by a clock that cannot itself be torn down by that same
  // condition.
  useEffect(() => {
    if (!isNewProject) return
    // Only clocks the analysis itself — not the "choosing" screen (no time limit
    // on deciding) or the terminal states.
    if (aiPhase !== "running") return
    // Anchored to the first mount so remounts can't keep pushing it out.
    if (aiDeadlineRef.current === null) aiDeadlineRef.current = Date.now() + AI_ANALYSIS_TIMEOUT_MS
    const remaining = Math.max(0, aiDeadlineRef.current - Date.now())
    const deadline = setTimeout(() => {
      setAiPhase("failed")
      setShowAddKw(true)
    }, remaining)
    return () => clearTimeout(deadline)
  }, [isNewProject, aiPhase])

  // Poll while any keyword is PENDING or PROCESSING — drives status dot
  // transitions without a manual refresh. Stops once everything is terminal.
  useEffect(() => {
    const hasActive = project?.keywords.some((k) => k.status === "PENDING" || k.status === "PROCESSING")
    if (!hasActive) return
    const timer = setInterval(async () => {
      const updated = await load(true)
      const stillActive = updated?.keywords?.some((k) => k.status === "PENDING" || k.status === "PROCESSING")
      if (!stillActive) clearInterval(timer)
    }, 3000)
    return () => clearInterval(timer)
  }, [project, load])

  // Also poll when the scheduler is active so we detect when it picks up the
  // next batch. Skipped when the in-flight poll above is already running.
  useEffect(() => {
    if (!project || project.isPaused || !project.nextScheduledCheck) return
    const hasActive = project.keywords.some((k) => k.status === "PENDING" || k.status === "PROCESSING")
    if (hasActive) return
    const timer = setInterval(() => { void load(true) }, 5000)
    return () => clearInterval(timer)
  }, [project, load])

  const handleRunCheck = async () => {
    if (!project) return
    // First rank check ever for this project (no keyword has been checked yet)
    // = the "first rank check" milestone. Captured before the post.
    const isFirstCheck = project.keywords.length > 0 && project.keywords.every((k) => !k.checkedAt)
    setChecking(true); setError("")
    try {
      const keywordIds = selectedKeywords.size > 0 ? Array.from(selectedKeywords) : undefined
      // The backend now runs a PARTIAL check when today's budget only covers some
      // of the batch, handing back the keywords it couldn't afford. Lock those in
      // the table behind an upgrade prompt instead of failing the whole run.
      const res = await api.post<{ scheduled: number; skippedKeywordIds?: string[] }>(
        `/api/projects/${project.id}/check`,
        { keywordIds },
      )
      setLockedKwIds(new Set(res?.skippedKeywordIds ?? []))
      if (isFirstCheck) trackOnce("first-rank-check-button-clicked")
      track("rank_check_run", { projectId: project.id, keywordCount: keywordIds?.length ?? project.keywords.length })
      setSelectedKeywords(new Set())
      advanceFromStep(3)
      setTimeout(load, 2000)
      if (refreshUser) setTimeout(() => refreshUser(), 2500)
    } catch (err: unknown) {
      // 402 = quota / trial exhausted. The global QuotaUpsellModal (fired from
      // lib/api.ts on any 402) offers the subscribe / tier-bump path, so no
      // redirect here — just keep the contextual inline message.
      if (err instanceof ApiError && err.status === 402) {
        setError(err.message || "Daily check limit reached.")
      } else {
        setError(err instanceof Error ? err.message : "Failed to start check")
      }
    } finally { setChecking(false) }
  }

  // Refresh a single keyword — schedules a SERP check for just that keyword.
  const handleRefreshKeyword = async (kwId: string) => {
    if (!project) return
    setRefreshingKw((prev) => new Set(prev).add(kwId))
    setError("")
    try {
      await api.post(`/api/projects/${project.id}/check`, { keywordIds: [kwId] })
      // Budget covered it after all (quota reset, or an upgrade) — drop any lock
      // left on this row by an earlier partial run.
      setLockedKwIds((prev) => {
        if (!prev.has(kwId)) return prev
        const next = new Set(prev)
        next.delete(kwId)
        return next
      })
      // Let the SerpTask register, then reload so the row flips to PROCESSING;
      // the existing 3s status poll carries it to COMPLETED.
      setTimeout(() => load(true), 1500)
      if (refreshUser) setTimeout(() => refreshUser(), 2000)
    } catch (err: unknown) {
      // 402 → the global QuotaUpsellModal handles the upgrade path.
      if (err instanceof ApiError && err.status === 402) {
        setError(err.message || "Daily check limit reached.")
      } else {
        setError(err instanceof Error ? err.message : "Failed to refresh keyword")
      }
    } finally {
      setRefreshingKw((prev) => {
        const next = new Set(prev)
        next.delete(kwId)
        return next
      })
    }
  }

  const handleSelectAll = () => {
    const visibleIds = filtered.map((kw) => kw.id)
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedKeywords.has(id))
    setSelectedKeywords(allSelected ? new Set() : new Set(visibleIds))
  }

  const handleToggleKeyword = (kwId: string) => {
    setSelectedKeywords((prev) => {
      const next = new Set(prev)
      if (next.has(kwId)) next.delete(kwId)
      else next.add(kwId)
      return next
    })
  }

  // Bulk delete — fires DELETE calls in parallel, then prunes local state in
  // one pass so the table only re-renders once. If a subset fails, only the
  // successfully-deleted ones are removed from view and a generic error is
  // surfaced.
  const handleBulkDeleteKeywords = async (kwIds: string[]) => {
    setBulkDeleting(true); setError("")
    try {
      const results = await Promise.allSettled(
        kwIds.map((id) => api.delete(`/api/projects/${projectId}/keywords/${id}`))
      )
      const deletedIds = new Set<string>()
      kwIds.forEach((id, i) => { if (results[i].status === "fulfilled") deletedIds.add(id) })
      setProject((prev) => prev ? { ...prev, keywords: prev.keywords.filter((k) => !deletedIds.has(k.id)) } : prev)
      setSelectedKeywords((prev) => {
        const next = new Set(prev)
        deletedIds.forEach((id) => next.delete(id))
        return next
      })
      const failedCount = kwIds.length - deletedIds.size
      if (failedCount > 0) setError(`Removed ${deletedIds.size} of ${kwIds.length} keywords — ${failedCount} failed.`)
    } finally {
      setBulkDeleting(false)
      setConfirmDeleteKwIds(null)
    }
  }

  const handleDeleteProject = async () => {
    setDeleting(true); setError("")
    try {
      await api.delete(`/api/projects/${projectId}`)
      router.replace("/dashboard/projects")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete project")
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const startEditingName = () => {
    if (!project) return
    setNameInput(project.name)
    setEditingName(true)
  }

  const cancelEditingName = () => {
    setEditingName(false)
    setNameInput("")
  }

  const handleSaveName = async () => {
    if (!project) return
    const trimmed = nameInput.trim()
    if (!trimmed || trimmed === project.name) {
      cancelEditingName()
      return
    }
    setSavingName(true); setError("")
    try {
      const data = await api.patch<Partial<ProjectDetail>>(`/api/projects/${project.id}`, { name: trimmed })
      setProject((prev) => prev ? { ...prev, ...data } : prev)
      setEditingName(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to rename project")
    } finally {
      setSavingName(false)
    }
  }

  const handleUpdateFrequency = async (choice: number | "off") => {
    setUpdatingFrequency(true); setError("")
    try {
      // "off" clears the schedule; a number turns it on and sets the cadence.
      const body = choice === "off"
        ? { autoCheckEnabled: false }
        : { autoCheckEnabled: true, checkFrequency: choice }
      const data = await api.patch<Partial<ProjectDetail>>(`/api/projects/${projectId}/frequency`, body)
      setProject((prev) => prev ? { ...prev, ...data } : prev)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update frequency")
    } finally { setUpdatingFrequency(false) }
  }

  const handleTogglePause = async () => {
    if (!project) return
    setPausing(true); setError("")
    try {
      // Pause/resume is part of the (paid-gated) schedule endpoint — PATCH
      // /:id/frequency accepts isPaused and returns the project.
      const data = await api.patch<Partial<ProjectDetail>>(`/api/projects/${project.id}/frequency`, { isPaused: !project.isPaused })
      setProject((prev) => prev ? { ...prev, ...data } : prev)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to toggle pause")
    } finally { setPausing(false) }
  }

  // Public share URL for the current token (host-relative so it points at the
  // domain the user is actually on). Empty when sharing is off.
  const shareUrl =
    project?.shareToken && typeof window !== "undefined"
      ? `${window.location.origin}/share/keywords/${project.shareToken}`
      : ""

  // Enable public sharing — idempotent on the backend, so reopening the modal
  // and clicking again just returns the existing token.
  const handleCreateShare = async () => {
    if (!project) return
    setShareBusy(true); setError("")
    try {
      const data = await api.post<{ shareToken: string }>(`/api/projects/${project.id}/share`)
      setProject((prev) => (prev ? { ...prev, shareToken: data.shareToken } : prev))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create share link")
    } finally { setShareBusy(false) }
  }

  // Revoke the link — the public page 404s afterwards.
  const handleDisableShare = async () => {
    if (!project) return
    setShareBusy(true); setError("")
    try {
      await api.delete(`/api/projects/${project.id}/share`)
      setProject((prev) => (prev ? { ...prev, shareToken: null } : prev))
      setShareCopied(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to disable sharing")
    } finally { setShareBusy(false) }
  }

  const handleCopyShare = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    } catch {
      // Clipboard blocked (insecure context / permissions) — non-fatal.
    }
  }

  // ───── Derived data ─────────────────────────────────────────────────────

  const statusCounts: Record<string, number> = useMemo(() => {
    if (!project) return {}
    return project.keywords.reduce<Record<string, number>>((acc, kw) => {
      const s = kw.status || "NONE"
      acc[s] = (acc[s] || 0) + 1
      return acc
    }, {})
  }, [project])

  const pendingCount = (statusCounts["PENDING"] || 0) + (statusCounts["PROCESSING"] || 0)

  // Ticking clock so the elapsed wording ages while the user watches, without
  // waiting on the next data refresh. Only runs while something is in flight.
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    if (pendingCount === 0) return
    setNowTick(Date.now())
    const id = setInterval(() => setNowTick(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [pendingCount])

  // Age of the longest-running in-flight check, and whether any has blown its
  // expected window. A check normally lands in well under a minute, so once one
  // has been running for several minutes the reassurance line stops being true —
  // and a page that keeps promising "under a minute" over a check that has been
  // going for hours reads as broken even when the backend is healthy.
  const checkProgress = useMemo(() => {
    if (!project) return { longestMs: 0, overdue: false }
    let longestMs = 0
    let overdue = false
    for (const kw of project.keywords) {
      if (kw.checkOverdue) overdue = true
      if (!kw.checkStartedAt) continue
      const started = new Date(kw.checkStartedAt).getTime()
      if (!Number.isFinite(started)) continue
      longestMs = Math.max(longestMs, nowTick - started)
    }
    return { longestMs, overdue }
  }, [project, nowTick])

  // Threshold for "this is taking longer than usual". Generous relative to the
  // ~70-110s a live SERP fetch actually takes, so a normal check never trips it.
  const SLOW_CHECK_MS = 5 * 60_000
  const checkIsSlow = checkProgress.longestMs > SLOW_CHECK_MS

  // Keyword count per device — drives the labels on the Desktop/Mobile tabs.
  // Legacy rows with a null device are treated as desktop.
  const deviceCounts = useMemo(() => {
    const c = { desktop: 0, mobile: 0 }
    project?.keywords.forEach((k) => { k.device === "mobile" ? c.mobile++ : c.desktop++ })
    return c
  }, [project])

  // Keywords for the active device tab. Stats + table both scope to this so the
  // whole view reflects the selected device.
  const scoped = useMemo(
    () => (project?.keywords ?? []).filter((k) => (k.device === "mobile" ? "mobile" : "desktop") === deviceTab),
    [project, deviceTab],
  )

  // Project stats — drives the stat tiles in the header (scoped to the device tab).
  const stats = useMemo(() => {
    const positions = scoped
      .map((k) => k.position)
      .filter((p): p is number => p != null && Number.isFinite(p))
    const ranked = scoped.filter((k) => k.position != null)
    // 7-day movement — real deltas only, from each keyword's d7 window.
    const d7s = ranked
      .map((k) => k.d7)
      .filter((d): d is number => d != null && Number.isFinite(d))
    const prevPositions = ranked
      .filter((k) => k.position != null && k.d7 != null)
      .map((k) => (k.position as number) + (k.d7 as number))
    return {
      total: scoped.length,
      avgPos: positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : 0,
      top3: positions.filter((p) => p <= 3).length,
      top10: positions.filter((p) => p <= 10).length,
      // "In top 100" — every keyword the SERP check actually found.
      top100: positions.length,
      // 1-day movement split (d1 > 0 = rank improved).
      gained: ranked.filter((k) => (k.d1 ?? 0) > 0).length,
      lost: ranked.filter((k) => (k.d1 ?? 0) < 0).length,
      noChange: ranked.filter((k) => (k.d1 ?? 0) === 0).length,
      estTraffic: scoped.reduce((s, k) => s + (k.monthlyTraffic ?? 0), 0),
      // Positive = average rank improved over the last 7 days.
      avgPosD7: d7s.length ? d7s.reduce((a, b) => a + b, 0) / d7s.length : null,
      top3D7: prevPositions.length
        ? positions.filter((p) => p <= 3).length - prevPositions.filter((p) => p <= 3).length
        : null,
      top10D7: prevPositions.length
        ? positions.filter((p) => p <= 10).length - prevPositions.filter((p) => p <= 10).length
        : null,
    }
  }, [scoped])

  // Rankings-improved movement for the selected time window (1/7/15/30 days).
  const movement = useMemo(() => {
    const ranked = scoped.filter((k) => k.position != null)
    const delta = (k: Keyword) => k[rankPeriod] ?? 0
    return {
      gained: ranked.filter((k) => delta(k) > 0).length,
      lost: ranked.filter((k) => delta(k) < 0).length,
      noChange: ranked.filter((k) => delta(k) === 0).length,
    }
  }, [scoped, rankPeriod])

  // Filter + sort the keyword list.
  const filtered = useMemo(() => {
    if (!project) return []
    let rows = scoped
    if (filter.trim()) {
      const needle = filter.toLowerCase()
      rows = rows.filter((r) =>
        r.keyword.toLowerCase().includes(needle) ||
        (r.url ?? "").toLowerCase().includes(needle)
      )
    }
    rows = [...rows].sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1
      if (sort.key === "kw") return a.keyword.localeCompare(b.keyword) * dir
      if (sort.key === "checkedAt") {
        const av = a.checkedAt ? new Date(a.checkedAt).getTime() : 0
        const bv = b.checkedAt ? new Date(b.checkedAt).getTime() : 0
        return (av - bv) * dir
      }
      const map: Record<Exclude<SortKey, "kw" | "checkedAt">, (k: Keyword) => number> = {
        pos: (k) => k.position ?? 999,
        d1: (k) => k.d1 ?? 0,
        d7: (k) => k.d7 ?? 0,
        vol: (k) => k.searchVolume ?? 0,
        // Un-scored keywords (null) sort to the bottom.
        score: (k) => k.pageScore ?? -1,
        aio: (k) => aioRank(k.serpFeatures),
      }
      const fn = map[sort.key as Exclude<SortKey, "kw" | "checkedAt">]
      return (fn(a) - fn(b)) * dir
    })
    return rows
  }, [project, scoped, filter, sort])

  const clickSort = (k: SortKey) =>
    setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === "asc" ? "desc" : "asc") : k === "kw" ? "asc" : "desc" }))

  // ───── Render ──────────────────────────────────────────────────────────

  if (authLoading || (loading && !project)) {
    return (
      <div className="page" style={{ color: "var(--text-mute)", fontSize: 13, padding: 60, textAlign: "center" }}>
        {t("loadingProject")}
      </div>
    )
  }

  if (!project) {
    return (
      <div className="page" style={{ color: "var(--neg)", fontSize: 13, padding: 60, textAlign: "center" }}>
        {error || t("projectNotFound")}
      </div>
    )
  }

  const plan = usage?.plan
  const color = projectColor(project.id)

  // Out of TODAY's rank checks (free plan). This gates CHECKING, not adding —
  // adding is limited by the keyword cap — so we show a small non-blocking
  // "checks reset in …" notice rather than locking the add button. The daily
  // allowance resets at 00:00 UTC; `nextUtcMidnightIso` is stable within a day,
  // so CountdownTimer doesn't re-init on every render. Paid never shows it.
  const outOfChecks = !!usage && plan !== "paid" && usage.dailyRemaining <= 0
  const nextUtcMidnightIso = (() => {
    const now = new Date()
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)).toISOString()
  })()

  return (
    <div className="page">
      {/* Header */}
      <div className="page-h kd-proj-h">
        <div style={{ minWidth: 0 }}>
          <Link href="/dashboard/projects" className="kd-back" style={{ display: "inline-flex" }}>
            ← {t("allProjects")}
          </Link>
          <div className="row" style={{ marginBottom: 8 }}>
            <Favicon domain={project.domain} size={36} fallbackColor={color} />
            <div style={{ minWidth: 0 }}>
              {editingName ? (
                <div className="row" style={{ gap: 6, alignItems: "center" }}>
                  <input
                    autoFocus
                    className="input"
                    value={nameInput}
                    maxLength={120}
                    disabled={savingName}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveName()
                      if (e.key === "Escape") cancelEditingName()
                    }}
                    style={{ fontSize: 20, fontWeight: 600, padding: "2px 8px", height: 34 }}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={handleSaveName}
                    disabled={savingName}
                    title="Save"
                    style={{ width: 28, height: 28 }}
                  >
                    <Check size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={cancelEditingName}
                    disabled={savingName}
                    title="Cancel"
                    style={{ width: 28, height: 28 }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="row" style={{ gap: 6, alignItems: "center" }}>
                  <h1 style={{ margin: 0 }}>{project.name}</h1>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={startEditingName}
                    title="Rename project"
                    style={{ width: 26, height: 26, opacity: 0.6, border: "none" }}
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              )}
              <div className="tiny muted mono">{project.domain}</div>
            </div>
          </div>
        </div>
        <div className="col kd-proj-actions">
          {/* Auto-check schedule chip — paid-only. Shows a live countdown +
              pause/resume once a `nextScheduledCheck` is set. */}
          {SCHEDULED_CHECKS_ENABLED && plan === "paid" && (
            <div className="card tight" style={{ padding: "10px 14px", minWidth: 300 }}>
              <div className="row" style={{ gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                    <span className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 10 }}>
                      {project.autoCheckEnabled && project.nextScheduledCheck ? t("nextCheckIn") : t("autoCheck")}
                    </span>
                    {project.autoCheckEnabled && project.nextScheduledCheck && (
                      <button
                        onClick={handleTogglePause}
                        disabled={pausing}
                        type="button"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--brand)",
                          padding: 0,
                          cursor: "pointer",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          fontSize: 10,
                          fontWeight: 600,
                        }}
                        title={project.isPaused ? t("resumeTitle") : t("pauseTitle")}
                      >
                        {pausing ? "…" : project.isPaused ? `▶ ${t("resume")}` : `⏸ ${t("pause")}`}
                      </button>
                    )}
                  </div>
                  {!project.autoCheckEnabled ? (
                    <span className="b" style={{ color: "var(--text-mute)", fontSize: 13 }}>{t("offNotScheduled")}</span>
                  ) : project.nextScheduledCheck ? (
                    project.isPaused ? (
                      <span className="b" style={{ color: "var(--warn)", fontSize: 13 }}>{t("paused")}</span>
                    ) : (
                      <span
                        className="b"
                        style={{ color: "var(--brand)", fontSize: 13 }}
                        // Keeps the exact run time available — it used to have its
                        // own "SCHEDULED AT" cell where the switch now sits.
                        title={new Date(project.nextScheduledCheck).toLocaleString("en-IN", {
                          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                        })}
                      >
                        <CountdownTimer targetDate={project.nextScheduledCheck} />
                      </span>
                    )
                  ) : (
                    <span className="b" style={{ color: "var(--brand)", fontSize: 13 }}>{t("pendingFirstRun")}</span>
                  )}
                </div>
                <div style={{ width: 1, alignSelf: "stretch", background: "var(--border)" }} />
                {/* The schedule switch lives in this card now. Its label already
                    states the cadence, so the FREQUENCY read-out that used to sit
                    here was saying the same thing twice. */}
                <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                  <ScheduleToggle
                    enabled={project.autoCheckEnabled}
                    frequency={project.checkFrequency || 24}
                    busy={updatingFrequency}
                    onPick={handleUpdateFrequency}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="row kd-proj-btns">
            <button
              data-tutorial="add-keywords-btn"
              type="button"
              className={selectedKeywords.size > 0 ? "btn" : "btn primary"}
              onClick={() => setShowAddKw(true)}
            >
              <Icon.plus /> {t("keywordsBtn")}
            </button>
            {/* Out of TODAY's rank checks (free). A non-blocking notice — adding
                keywords is NOT gated by checks (it's gated by the keyword cap),
                so we don't lock the button; we just show when checks come back. */}
            {outOfChecks && (
              <span
                className="kd-checks-reset"
                title={t("outOfChecksTip")}
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("billing:quota", { detail: { code: "free_daily_quota_exhausted" } }),
                  )
                }
              >
                <Icon.lock /> {t("checksResetIn")} <CountdownTimer targetDate={nextUtcMidnightIso} />
              </span>
            )}
            {/* Search Console — temporarily hidden (feature paused). Restore by
                uncommenting; the /search-console route still exists.
            <Link
              href={`/dashboard/project/${project.id}/search-console`}
              className="btn"
              title="View Google Search Console performance for this project"
            >
              Search Console
            </Link>
            */}
            {/* {plan === "paid" && (
              <button
                type="button"
                className="btn"
                onClick={() => setShowReport(true)}
                title="Generate a shareable rank report (link + PDF)"
              >
                Report
              </button>
            )} */}
            {/* The auto-check switch used to sit here; it now lives inside the
                AUTO CHECK card above, next to the state it controls. */}
            {/* Hidden by default — only surfaces once keywords are selected (or a
                check is actively running), so it doesn't sit idle next to
                "+ Keywords". Stays visible during the onboarding tutorial's
                "run-check" step since that step spotlights this exact button. */}
            {(checking || pendingCount > 0 || selectedKeywords.size > 0 || (tutorialActive && tutorialStep.id === "run-check")) && (
              <Hint text={pendingCount > 0 ? t("checkRunningTitle") : undefined}>
              <button
                data-tutorial="run-check-btn"
                type="button"
                onClick={handleRunCheck}
                // Block while a check is already running for this project — each
                // check costs us money, so don't let the button be spammed.
                disabled={checking || project.keywords.length === 0 || pendingCount > 0}
                className={selectedKeywords.size > 0 ? "btn primary" : "btn"}
              >
                {checking
                  ? t("checking")
                  : pendingCount > 0
                    ? t("checkInProgress")
                    : selectedKeywords.size > 0
                      ? t("checkSelected", { count: selectedKeywords.size })
                      : t("runCheck")}
              </button>
              </Hint>
            )}
            {selectedKeywords.size > 0 && (
              // No Hint here: the button's own label already says exactly what
              // the tooltip did, and repeating it on hover is noise.
              <button
                type="button"
                onClick={() => setConfirmDeleteKwIds(Array.from(selectedKeywords))}
                className="btn"
                style={{ borderColor: "var(--neg)", color: "var(--neg)" }}
              >
                {t("deleteN", { count: selectedKeywords.size })}
              </button>
            )}
            {/* Direct icon actions instead of a "More options" menu — one click
                each. Icon-only, so the label lives in the tooltip, and stays on
                aria-label as well: a tooltip is not an accessible name, and a
                screen reader announcing "button" would leave nothing to go on. */}
            <div className="icon-group">
            {plan === "paid" && (
              <Hint text={t("alerts")}>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setShowAlerts(true)}
                  aria-label={t("alerts")}
                >
                  <Icon.bell />
                </button>
              </Hint>
            )}
            <Hint text={t("share")}>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowShare(true)}
                aria-label={t("share")}
              >
                <Icon.globe />
              </button>
            </Hint>
            <Hint text={t("deleteProject")}>
              <button
                type="button"
                className="icon-btn danger"
                onClick={() => setConfirmDelete(true)}
                aria-label={t("deleteProject")}
              >
                <Icon.trash />
              </button>
            </Hint>
            </div>
          </div>
        </div>
      </div>

      {/* Stat strip.
          Rebuilt on the Overview's StatCard rather than the old divider-cell
          card, so the two pages present a number the same way — and, more to the
          point, so every figure carries an explanation. "2.5" and "9 / 100" mean
          nothing on their own, and a bare label has nowhere to say what counts
          as good. */}
      {(() => {
        const da = project.domainAuthority
        const band = scoreBand(da)
        const ranked = stats.total - (statusCounts["FAILED"] || 0) - (statusCounts["NONE"] || 0)
        const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toLocaleString())
        /** Greyed when there is nothing to report, so real numbers stand out. */
        const dim = (n: number | null | undefined) => (n ? undefined : "text-muted-foreground/50")

        return (
          <div className="mb-3.5 grid grid-cols-2 gap-3.5 md:grid-cols-4 xl:grid-cols-7">
            <StatCard
              label={t("keywordsTracked")}
              hint="How many keywords you're tracking for this project."
              value={stats.total.toLocaleString()}
              tone={dim(stats.total)}
              caption={t("inTop3Count", { count: stats.top3 })}
              fill={null}
            />

            <StatCard
              label={t("avgPosition")}
              hint="Your average Google position across the keywords that rank. Lower is better."
              value={stats.avgPos ? stats.avgPos.toFixed(1) : "—"}
              tone={dim(stats.avgPos)}
              caption={
                stats.avgPosD7 != null && Math.round(stats.avgPosD7 * 10) !== 0 ? (
                  <DeltaPill value={Math.round(stats.avgPosD7 * 10) / 10} format={(n) => n.toFixed(1)} />
                ) : stats.total > 0 ? (
                  t("rankedCount", { count: ranked })
                ) : (
                  t("noData")
                )
              }
              fill={null}
            />

            <StatCard
              label={t("top3Keywords")}
              hint="Keywords ranking in the top 3, where most clicks go."
              value={stats.top3.toLocaleString()}
              tone={dim(stats.top3)}
              caption={
                stats.top3D7 != null && stats.top3D7 !== 0 ? (
                  <DeltaPill value={stats.top3D7} />
                ) : stats.total ? (
                  `${Math.round((stats.top3 / stats.total) * 100)}% of tracked`
                ) : (
                  "—"
                )
              }
              fill={stats.total ? (stats.top3 / stats.total) * 100 : 0}
            />

            <StatCard
              label={t("inTop10")}
              hint="Keywords ranking on page one. Page two gets a small fraction of the traffic."
              value={stats.top10.toLocaleString()}
              tone={dim(stats.top10)}
              caption={
                stats.top10D7 != null && stats.top10D7 !== 0 ? (
                  <DeltaPill value={stats.top10D7} />
                ) : stats.total ? (
                  `${Math.round((stats.top10 / stats.total) * 100)}% of tracked`
                ) : (
                  "—"
                )
              }
              fill={stats.total ? (stats.top10 / stats.total) * 100 : 0}
            />

            <StatCard
              label={t("estTraffic")}
              hint="How many visits these keywords are likely bringing you each month."
              value={stats.estTraffic > 0 ? compact(stats.estTraffic) : "—"}
              tone={dim(stats.estTraffic)}
              caption={t("monthlyModelled")}
              // Traffic has no ceiling to be a proportion of.
              fill={null}
            />

            <StatCard
              label={t("statDomainAuthority")}
              hint="How strong this domain is, from 0 to 100. Under 30 is weak, 30–59 middling, 60+ strong."
              value={da ?? "—"}
              tone={band.text}
              caption={
                da == null
                  ? t("daOutOf100")
                  : da >= 60
                    ? "strong · of 100"
                    : da >= 30
                      ? "moderate · of 100"
                      : "weak · of 100"
              }
              fill={da}
              fillClass={band.bar}
            />

            <StatCard
              label={t("backlinks")}
              hint="How many links from other sites point at this domain."
              value={project.domainBacklinks != null ? compact(project.domainBacklinks) : "—"}
              tone={dim(project.domainBacklinks)}
              caption={t("siteWide")}
              fill={null}
            />
          </div>
        )
      })()}

      {error && (
        <div
          className="card tight"
          style={{ marginBottom: 14, borderColor: "var(--neg)", background: "var(--neg-soft)", color: "var(--neg)", fontSize: 12 }}
        >
          {error}
        </div>
      )}

      {/* Live check-in-progress strip. Brand-colored "working" state (not a
          warning), with a spinner + sliding bar so it reads as active, and a
          reassurance line so users wait here instead of leaving. Once a check
          outlives its expected window the tone drops to a warning — at that
          point it is no longer "working", it is waiting to be marked failed. */}
      {pendingCount > 0 && (
        <div
          className="card tight check-banner"
          style={{
            marginBottom: 14,
            ...(checkProgress.overdue
              ? { borderColor: "var(--neg)", background: "var(--neg-soft)" }
              : {}),
          }}
        >
          <div className="row" style={{ gap: 12, alignItems: "center" }}>
            <span
              className="spin"
              aria-hidden
              style={{
                width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                border: `2.5px solid color-mix(in srgb, ${checkProgress.overdue ? "var(--neg)" : "var(--brand)"} 25%, transparent)`,
                borderTopColor: checkProgress.overdue ? "var(--neg)" : "var(--brand)", boxSizing: "border-box",
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="b" style={{ fontSize: 13, color: checkProgress.overdue ? "var(--neg)" : "var(--brand)" }}>
                {statusCounts["PROCESSING"] > 0
                  ? t("statusChecking", { count: pendingCount })
                  : t("statusQueued", { count: pendingCount })}
              </div>
              <div className="tiny" style={{ color: checkProgress.overdue ? "var(--neg)" : "var(--brand)", opacity: 0.75, marginTop: 1 }}>
                {t("statusPendingProcessing", { pending: statusCounts["PENDING"] || 0, processing: statusCounts["PROCESSING"] || 0 })}
                {" · "}
                {/* The reassurance line ages with the check. Promising "under a
                    minute" over one that has been running for hours is what made
                    a healthy-but-slow check look like a broken page. */}
                {checkProgress.overdue
                  ? t("checkStayOverdue")
                  : checkIsSlow
                    ? `${t("checkStaySlow")} · ${t("checkRunningFor", { duration: formatCheckDuration(checkProgress.longestMs) })}`
                    : t("checkStay")}
              </div>
            </div>
          </div>
          <div className="check-bar" aria-hidden><span /></div>
        </div>
      )}

      {/* Keywords table — the insight rail always shows (even before any
          keywords exist); the right column is the empty state or the table. */}
      <div className="kd-layout">
          {/* Insight rail */}
          <div className="col" style={{ gap: 14, minWidth: 0 }}>
            <div className="card">
              <div className="card-h" style={{ marginBottom: 10 }}>
                <div className="t">{t("rankingsImproved")}</div>
                {/* Time-window tabs — 1d / 7d / 15d / 30d */}
                <div className="pill-toggle" style={{ padding: 2 }}>
                  {(["d1", "d7", "d15", "d30"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={rankPeriod === p ? "active" : ""}
                      onClick={() => setRankPeriod(p)}
                      style={{ padding: "3px 8px", fontSize: 11.5 }}
                    >
                      {p === "d1" ? "1d" : p === "d7" ? "7d" : p === "d15" ? "15d" : "30d"}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span className="tabular" style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.025em", lineHeight: 1.1 }}>
                  {movement.gained}
                </span>
                <span className="tiny muted">{t(rankPeriod === "d1" ? "vs24h" : rankPeriod === "d7" ? "vs7d" : rankPeriod === "d15" ? "vs15d" : "vs30d")}</span>
              </div>
              <div style={{ marginTop: 10 }}>
                <div className="insight-row">
                  <span className="muted">{t("gained")}</span>
                  <span className="b tabular" style={{ color: "var(--pos)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {movement.gained} <Icon.arrowUp />
                  </span>
                </div>
                <div className="insight-row">
                  <span className="muted">{t("lost")}</span>
                  <span className="b tabular" style={{ color: "var(--neg)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {movement.lost} <Icon.arrowDown />
                  </span>
                </div>
                <div className="insight-row">
                  <span className="muted">{t("noChange")}</span>
                  <span className="b tabular" style={{ color: "var(--text-soft)" }}>{movement.noChange} →</span>
                </div>
              </div>
            </div>

            <CompetitorsCard projectId={project.id} yourAvg={stats.avgPos > 0 ? stats.avgPos : null} />
          </div>

          {/* Right column — for a just-created project we first ASK whether to
              run the (paid) AI analysis or add keywords by hand; then the analysis
              screen if they chose it; then the empty "Start tracking" state before
              any keywords exist; otherwise the SERP rank-tracking table. */}
          {aiPhase === "choosing" ? (
            <div
              className="card"
              style={{
                padding: "56px 32px", textAlign: "center", border: "1px dashed var(--border-strong)",
                background: "transparent", display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", minHeight: 300,
              }}
            >
              <div className="eyebrow" style={{ justifyContent: "center" }}>
                <span className="spark"><Icon.spark /></span> {t("aiChoiceEyebrow")}
              </div>
              <div className="b" style={{ fontSize: 18, marginTop: 8 }}>{t("aiChoiceTitle")}</div>
              <div className="tiny muted" style={{ marginTop: 8, maxWidth: 400 }}>{t("aiChoiceDesc")}</div>
              <div className="row" style={{ gap: 10, marginTop: 22, justifyContent: "center", flexWrap: "wrap" }}>
                <button type="button" className="btn primary" onClick={() => setAiPhase("running")}>
                  <Icon.spark /> {t("aiChoiceAnalyze")}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => { setAiPhase("idle"); exitNewProjectFlow(); setShowAddKw(true) }}
                >
                  {t("aiChoiceManual")}
                </button>
              </div>
            </div>
          ) : aiPhase === "running" ? (
            <AiAnalysisLoader
              domain={project.domain}
              status={aiRun?.status}
              startedAt={aiStartedAtRef.current}
              onSkip={() => { setAiPhase("idle"); setShowAddKw(true); exitNewProjectFlow() }}
              t={t}
            />
          ) : project.keywords.length === 0 ? (
            <div
              className="card"
              style={{
                padding: "60px 32px",
                textAlign: "center",
                border: "1px dashed var(--border-strong)",
                background: "transparent",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 300,
              }}
            >
              <div className="eyebrow" style={{ justifyContent: "center" }}>
                <span className="spark"><Icon.spark /></span> {t("noKeywordsEyebrow")}
              </div>
              <div className="b" style={{ fontSize: 16, marginTop: 4 }}>{t("startTracking")}</div>
              <div className="tiny muted" style={{ marginTop: 6, maxWidth: 320 }}>
                {t("startTrackingDesc")}
              </div>
              <button className="btn primary" style={{ marginTop: 16 }} onClick={() => setShowAddKw(true)}>
                <Icon.plus /> {t("addKeywords")}
              </button>
              {outOfChecks && (
                <span className="kd-checks-reset" style={{ marginTop: 12 }} title={t("outOfChecksTip")}>
                  <Icon.lock /> {t("checksResetIn")} <CountdownTimer targetDate={nextUtcMidnightIso} />
                </span>
              )}
            </div>
          ) : (
          <div className="card" style={{ padding: 0, overflow: "hidden", minWidth: 0 }}>
            <div className="serp-track-h">
              <div className="b" style={{ fontSize: 14 }}>{t("serpRankTracking")}</div>
              <div style={{ position: "relative", width: 240 }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", display: "inline-flex", color: "var(--text-mute)" }}><Icon.search /></span>
                <input
                  className="input"
                  style={{ paddingLeft: 32, height: 34 }}
                  placeholder={t("searchPlaceholder")}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
              <div className="tiny muted">
                {t("showingOf", { n: filtered.length, total: scoped.length })}
              </div>
              <div className="pill-toggle" style={{ width: "fit-content", marginLeft: "auto" }}>
                {(["desktop", "mobile"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={deviceTab === d ? "active" : ""}
                    onClick={() => setDeviceTab(d)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    {d === "desktop" ? <Icon.monitor /> : <Icon.smartphone />}
                    {d === "desktop" ? t("deviceDesktop") : t("deviceMobile")} ({deviceCounts[d]})
                  </button>
                ))}
              </div>
            </div>
            {filtered.length === 0 ? (
              <div style={{ padding: "40px 32px", textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
                {filter.trim()
                  ? t("noMatch", { filter })
                  : t("noDeviceKeywords", {
                      device: deviceTab === "desktop" ? t("deviceDesktop") : t("deviceMobile"),
                      other: deviceTab === "desktop" ? t("deviceMobile") : t("deviceDesktop"),
                    })}
              </div>
            ) : (
          <div style={{ overflowX: "auto", overflowY: "visible" }}>
            <table className="tbl" style={{ minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <Hint text={t("tipSelectAll")}>
                      <input
                        type="checkbox"
                        checked={filtered.length > 0 && filtered.every((kw) => selectedKeywords.has(kw.id))}
                        onChange={handleSelectAll}
                      />
                    </Hint>
                  </th>
                  <SortHeader label={t("colKeyword")} title={t("tipKeyword")} k="kw" sort={sort} onClick={clickSort} width={220} />
                  <SortHeader label={t("colPosition")} title={t("tipPosition")} k="pos" sort={sort} onClick={clickSort} width={104} />
                  <th style={{ whiteSpace: "nowrap", width: 92 }}>
                    <Hint text={t("tipFirstCheck")}><span>{t("colFirstCheck")}</span></Hint>
                  </th>
                  <SortHeader label={t("colVolume")} title={t("tipVolume")} k="vol" sort={sort} onClick={clickSort} width={88} />
                  <th style={{ width: 220 }}>
                    <Hint text={t("tipUrl")}><span>{t("colUrl")}</span></Hint>
                  </th>
                  {/* Keyword score only. The Page Score half of this column was
                      removed — it measured a different thing (how well one URL
                      is built) and sat beside a keyword metric, which read as
                      two views of the same number. Page auditing now lives in
                      its own tool. */}
                  <SortHeader
                    // Short label on purpose: the th is white-space:nowrap, so the
                    // header text — not `width` — sets the column's floor, and
                    // "KEYWORD SCORE" plus the ⓘ was forcing it ~40px wider than
                    // the two-digit badge needs. Only one score column remains, so
                    // "Score" is unambiguous; the full name is in the tooltip.
                    label={t("colScoreShort")}
                    title={t("tipKeywordScore")}
                    k="score"
                    sort={sort}
                    onClick={clickSort}
                    width={72}
                    info={<HeaderInfo>{t("scoreInfoKs")}</HeaderInfo>}
                  />
                  <SortHeader
                    label={t("colAiOverview")}
                    k="aio"
                    sort={sort}
                    onClick={clickSort}
                    width={104}
                    // The same sentence that was the th's native title. Moved
                    // into the hint so it matches every other explanation on the
                    // page — and so it isn't announced twice from one header.
                    info={<HeaderInfo>{t("colAiOverviewTitle")}</HeaderInfo>}
                  />
                  <SortHeader label={t("colLastChecked")} title={t("tipLastChecked")} k="checkedAt" sort={sort} onClick={clickSort} width={116} />
                  <th style={{ width: 190, whiteSpace: "nowrap" }}>
                    <Hint text={t("tipActions")}><span>{t("colActions")}</span></Hint>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((kw, i) => {
                  const isActive = kw.status === "PENDING" || kw.status === "PROCESSING"
                  const isSelected = selectedKeywords.has(kw.id)
                  const rowStyle: React.CSSProperties = {}
                  if (isActive) rowStyle.background = "var(--warn-soft)"
                  else if (isSelected) rowStyle.background = "var(--brand-soft)"
                  return (
                    <tr
                      key={kw.id}
                      style={{ ...rowStyle, cursor: "pointer" }}
                      onClick={() => router.push(`/dashboard/project/${project.id}/keywords/${kw.id}`)}
                      title="View keyword details"
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleKeyword(kw.id)}
                          title={`Select ${kw.keyword}`}
                        />
                      </td>
                      <td>
                        {/* minWidth:0 lets the .kw ellipsis engage — without it the
                            flex child sizes to its content and never truncates. */}
                        <span className="row" style={{ gap: 8, alignItems: "center", minWidth: 0 }}>
                          <Flag code={kw.location} title={kw.location?.toUpperCase()} />
                          <span className="kw" title={kw.keyword}>{kw.keyword}</span>
                        </span>
                      </td>
                      <td>
                        <div className="row" style={{ gap: 8, alignItems: "center" }}>
                          {lockedKwIds.has(kw.id) ? (
                            // Today's plan budget didn't stretch to this keyword.
                            <Link href="/pricing?clicked-buy-button" className="kw-locked" title={t("lockedTip", { limit: usage?.dailyLimit ?? 3 })}>
                              <Icon.lock size={11} /> {t("locked")}
                            </Link>
                          ) : (
                            <>
                              <PosCell position={kw.position} processing={isActive} checked={!!kw.checkedAt} />
                              {/* Inline delta only when there was actual movement —
                                  a "—" placeholder next to the badge reads as clutter. */}
                              {kw.position != null && kw.d1 != null && kw.d1 !== 0 && (
                                <DeltaCell from={kw.position + kw.d1} to={kw.position} />
                              )}
                            </>
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
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              display: "inline-block",
                              maxWidth: "100%",
                              verticalAlign: "middle",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {kw.url.replace(/^https?:\/\//, "")}
                          </a>
                        ) : (
                          <span className="tiny muted" title="No URL — keyword is ranking deeper than the top 100">—</span>
                        )}
                      </td>
                      {/* Keyword score. `pageScore` is misleadingly named — it
                          is the KEYWORD score; the page score was pageAuditScore,
                          which is gone. */}
                      <td>
                        <ScoreBadge
                          score={kw.pageScore}
                          grade={kw.pageScoreGrade}
                          label={kw.pageScoreLabel}
                          loading={openingReportKwId === kw.id || (isActive && kw.pageScore == null)}
                          onClick={() => openKeywordReport(kw)}
                          emptyTitle="Not ranking yet — click to score a page for this keyword"
                          onEmptyClick={() =>
                            router.push(
                              `/dashboard/keyword-analysis?keyword=${encodeURIComponent(kw.keyword)}&projectId=${project.id}&keywordId=${kw.id}&domain=${encodeURIComponent(project.domain)}`
                            )
                          }
                        />
                      </td>
                      <td>
                        <AiOverviewCell features={kw.serpFeatures} />
                      </td>
                      <td className="tiny muted" style={{ whiteSpace: "nowrap" }}>
                        <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                          <span>
                            {kw.checkedAt
                              ? new Date(kw.checkedAt).toLocaleDateString("en-IN", {
                                  day: "2-digit", month: "short", year: "numeric",
                                })
                              : t("never")}
                          </span>
                          <StatusDot status={kw.status} />
                        </span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="row" style={{ gap: 6, justifyContent: "flex-start" }}>
                          <FavoriteButton
                            key={`kf-${kw.id}-${favReady}`}
                            entityType="keyword"
                            entityId={kw.id}
                            initial={favKw.has(kw.id)}
                            size={15}
                            style={{ width: 28, height: 28 }}
                          />
                          <Hint text="Refresh this keyword">
                            <button
                              onClick={() => handleRefreshKeyword(kw.id)}
                              disabled={refreshingKw.has(kw.id) || kw.status === "PENDING" || kw.status === "PROCESSING"}
                              className="icon-btn"
                              style={{ width: 28, height: 28 }}
                            >
                              <Icon.refresh />
                            </button>
                          </Hint>
                          <Hint text="Options">
                            <button
                              data-menu-trigger={kw.id}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (openMenuId === kw.id) {
                                  setOpenMenuId(null)
                                  setMenuPosition(null)
                                } else {
                                  const rect = e.currentTarget.getBoundingClientRect()
                                  setMenuPosition({
                                    top: rect.bottom + 4,
                                    right: window.innerWidth - rect.right,
                                  })
                                  setOpenMenuId(kw.id)
                                }
                              }}
                              className="icon-btn"
                              style={{ width: 28, height: 28 }}
                            >
                              <Icon.dots />
                            </button>
                          </Hint>
                          {/* Only offer "improve to #1" once we actually have rank
                              data. A keyword still being checked (no position yet)
                              must NOT show "#100+ → #1" — we don't know its rank
                              until the check lands, so it would be a made-up target. */}
                          {(kw.position != null
                            ? kw.position > 1
                            : !!kw.checkedAt && !isActive) && (
                            <Hint
                              text={
                                kw.latestAnalysisId
                                  ? "Open the latest competitor analysis for this keyword"
                                  : kw.position != null
                                    ? `Improve this keyword from #${kw.position} to #1`
                                    : "Improve this keyword from #100+ to #1"
                              }
                            >
                            <button
                              {...(i === 0 ? { "data-tutorial": "improve-ranking-btn" } : {})}
                              onClick={() => {
                                advanceFromStep(4)
                                // Open the most recent analysis result rather than
                                // kicking off a fresh (paid) analysis. Only when no
                                // analysis exists yet do we fall back to creating
                                // the first one. "New Analysis" (row menu) always
                                // starts a new run.
                                router.push(
                                  kw.latestAnalysisId
                                    ? `/dashboard/project/${project.id}/competitor-analysis/results?analysisId=${kw.latestAnalysisId}`
                                    : `/dashboard/project/${project.id}/competitor-analysis?keyword=${encodeURIComponent(kw.keyword)}&keywordId=${kw.id}`
                                )
                              }}
                              className="btn primary sm rank-cta"
                              style={{ whiteSpace: "nowrap", gap: 4 }}
                            >
                              {t("rank")}
                              <span className="tabular" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                {/* Fixed-width slot: "#7", "#29" and "#100+" all
                                    occupy the same space, so every Rank button in
                                    the column ends up identical width. */}
                                <span className="from">{kw.position != null ? `#${kw.position}` : "#100+"}</span>
                                <span className="rank-arrow" style={{ opacity: 0.7, fontSize: "0.9em" }}>→</span>
                                <span style={{ fontWeight: 700 }}>#1</span>
                              </span>
                            </button>
                            </Hint>
                          )}
                          {/* Only shown for #1-ranked keywords — for everything
                              else the "Rank" button above already opens the latest
                              analysis, so this would be a redundant twin. */}
                          {kw.latestAnalysisId && kw.position != null && kw.position <= 1 && (
                            <button
                              onClick={() =>
                                router.push(`/dashboard/project/${project.id}/competitor-analysis/results?analysisId=${kw.latestAnalysisId}`)
                              }
                              className="btn sm"
                              style={{ whiteSpace: "nowrap" }}
                            >
                              {t("viewAnalysis")} <Icon.chevR />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
            )}
          </div>
          )}
        </div>

      {/* Row-action dropdown (rendered outside the table so it can escape
          overflow:hidden and float on top). Closed by the outside-pointerdown
          listener below rather than a click-blocking overlay, so dismissing it
          doesn't swallow the user's click. */}
      {openMenuId && menuPosition && (
        <>
          <div
            data-kw-row-menu
            style={{
              position: "fixed",
              top: `${menuPosition.top}px`,
              right: `${menuPosition.right}px`,
              zIndex: 50,
              width: 160,
              background: "var(--bg-elev)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-md)",
              boxShadow: "var(--shadow-md)",
              padding: 4,
            }}
          >
            <button
              onClick={() => {
                const kw = project.keywords.find((k) => k.id === openMenuId)
                if (kw) router.push(`/dashboard/project/${project.id}/keywords/${kw.id}`)
                setOpenMenuId(null)
                setMenuPosition(null)
              }}
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
              }}
            >
              {t("viewDetails")}
            </button>
            <button
              onClick={() => {
                const kw = project.keywords.find((k) => k.id === openMenuId)
                setOpenMenuId(null)
                setMenuPosition(null)
                if (kw) {
                  advanceFromStep(4)
                  router.push(
                    `/dashboard/project/${project.id}/competitor-analysis?keyword=${encodeURIComponent(kw.keyword)}&keywordId=${kw.id}`
                  )
                }
              }}
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
              }}
            >
              {t("newAnalysis")}
            </button>
            <button
              onClick={async () => {
                const kwId = openMenuId!
                setOpenMenuId(null)
                setMenuPosition(null)
                setHistoryKeywordId(kwId)
                setHistoryItems([])
                setHistoryLoading(true)
                try {
                  // The competitor-analysis list endpoint returns every analysis
                  // for the user; filter to the keyword we're inspecting. (The
                  // older /keywords/:id/analyses path actually returns rank
                  // history, not analyses — kept hitting that was the bug.)
                  const data = await api.get<{ analyses?: typeof historyItems }>(`/api/competitor-analysis`)
                  const all = Array.isArray(data?.analyses) ? data.analyses : []
                  const mine = all.filter((a) => (a as unknown as { keywordId?: string }).keywordId === kwId)
                  setHistoryItems(mine)
                } catch {
                  /* leave history empty on failure */
                } finally {
                  setHistoryLoading(false)
                }
              }}
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
              }}
            >
              {t("analysisHistory")}
            </button>
            <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
            <button
              onClick={() => {
                const id = openMenuId
                setOpenMenuId(null)
                setMenuPosition(null)
                if (id) setConfirmDeleteKwIds([id])
              }}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "8px 10px",
                background: "transparent",
                border: "none",
                borderRadius: 6,
                color: "var(--neg)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {t("delete")}
            </button>
          </div>
        </>
      )}

      {/* Modals */}
      {showAddKw && typeof window !== "undefined" && createPortal(
        <AddKeywordsModal
          projectId={project.id}
          currentCount={project.keywords.length}
          plan={plan}
          domain={project.domain}
          existingKeywords={project.keywords.map((k) => k.keyword)}
          aiSuggestions={aiSuggestions}
          aiStatus={aiPhase}
          onClose={() => { setShowAddKw(false); exitNewProjectFlow() }}
          onAdded={(device) => {
            setShowAddKw(false)
            exitNewProjectFlow()
            setDeviceTab(device)
            void load()
            advanceFromStep(2)
          }}
        />,
        document.body
      )}

      {historyKeywordId && (
        <div className="modal-bg" onClick={() => setHistoryKeywordId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-h">
              <div>
                <div className="eyebrow" style={{ margin: 0, fontSize: 11 }}><span className="spark"><Icon.spark /></span> COMPETITOR ANALYSIS</div>
                <div className="b" style={{ fontSize: 18, marginTop: 4 }}>Analysis history</div>
                <div className="tiny muted" style={{ marginTop: 2 }}>
                  {project.keywords.find((k) => k.id === historyKeywordId)?.keyword}
                </div>
              </div>
              <button onClick={() => setHistoryKeywordId(null)} className="icon-btn" aria-label="Close"><Icon.close /></button>
            </div>
            <div className="modal-b" style={{ maxHeight: "60vh", overflowY: "auto" }}>
              {historyLoading ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>Loading…</div>
              ) : historyItems.length === 0 ? (
                <div className="tiny muted" style={{ padding: 32, textAlign: "center" }}>No analyses found for this keyword.</div>
              ) : (
                <div className="col" style={{ gap: 8 }}>
                  {historyItems.map((item, idx) => (
                    <div key={item.id} className="card tight" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                          {idx === 0 && <span className="chip brand">Latest</span>}
                          <span
                            className={
                              "chip " +
                              (item.status === "COMPLETED" ? "pos" : item.status === "FAILED" ? "neg" : "warn")
                            }
                          >
                            {item.status}
                          </span>
                        </div>
                        <div className="tiny muted">
                          {new Date(item.createdAt).toLocaleString("en-IN", {
                            day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                          })}
                        </div>
                      </div>
                      {item.status === "COMPLETED" && (
                        <button
                          className="btn sm"
                          onClick={() => {
                            setHistoryKeywordId(null)
                            router.push(`/dashboard/project/${project.id}/competitor-analysis/results?analysisId=${item.id}`)
                          }}
                        >
                          View <Icon.chevR />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {scoreKeywordId && (() => {
        const kw = project.keywords.find((k) => k.id === scoreKeywordId)
        const total = scoreInfo?.pageScore ?? kw?.pageScore ?? null
        const grade = scoreInfo?.pageScoreGrade ?? kw?.pageScoreGrade ?? null
        const label = scoreInfo?.pageScoreLabel ?? kw?.pageScoreLabel ?? null
        const bd = scoreInfo?.breakdown ?? null
        const density = bd?.density ?? null
        const densityBand = density == null ? null
          : density < 0.5 ? { label: "Sparse", color: "var(--warn)" }
          : density <= 2.5 ? { label: "Healthy", color: "var(--pos)" }
          : density <= 3.5 ? { label: "High", color: "var(--warn)" }
          : { label: "Stuffed", color: "var(--neg)" }
        const color = total == null ? "var(--text-mute)" : total >= 80 ? "var(--pos)" : total >= 60 ? "var(--warn)" : "var(--neg)"
        const soft = total == null ? "var(--bg-inset)" : total >= 80 ? "var(--pos-soft)" : total >= 60 ? "var(--warn-soft)" : "var(--neg-soft)"
        return (
          <div className="modal-bg" onClick={() => setScoreKeywordId(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
              <div className="modal-h">
                <div>
                  <div className="eyebrow" style={{ margin: 0, fontSize: 11 }}><span className="spark"><Icon.spark /></span> PAGE SCORE</div>
                  <div className="b" style={{ fontSize: 18, marginTop: 4 }}>Keyword score</div>
                  <div className="tiny muted" style={{ marginTop: 2 }}>{kw?.keyword}</div>
                </div>
                <button onClick={() => setScoreKeywordId(null)} className="icon-btn" aria-label="Close"><Icon.close /></button>
              </div>
              <div className="modal-b" style={{ maxHeight: "60vh", overflowY: "auto" }}>
                <div className="row between" style={{ alignItems: "flex-start", gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <span className="tabular" style={{ fontSize: 34, fontWeight: 700, color, lineHeight: 1 }}>{total ?? "—"}</span>
                    <span className="tiny muted" style={{ marginLeft: 6 }}>/ 100</span>
                    {densityBand && (
                      <div className="tiny" style={{ marginTop: 8 }}>
                        <span className="muted">Keyword density </span>
                        <span className="tabular" style={{ fontWeight: 700, color: densityBand.color }}>{density}%</span>
                        <span style={{ color: densityBand.color, fontWeight: 600 }}> · {densityBand.label}</span>
                      </div>
                    )}
                    {scoreInfo?.pageScoreUrl && (
                      <a
                        href={scoreInfo.pageScoreUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="url tiny"
                        style={{ display: "block", marginTop: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        {scoreInfo.pageScoreUrl.replace(/^https?:\/\//, "")}
                      </a>
                    )}
                    {scoreInfo?.pageScoreAt && (
                      <div className="tiny muted" style={{ marginTop: 2 }}>
                        Scored {new Date(scoreInfo.pageScoreAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </div>
                    )}
                  </div>
                  {(grade || label) && (
                    <span className="tabular" style={{ flexShrink: 0, padding: "4px 10px", borderRadius: "var(--r-sm)", background: soft, color, fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>
                      {grade}{grade && label ? " · " : ""}{label}
                    </span>
                  )}
                </div>

                <div style={{ height: 1, background: "var(--border)", margin: "16px 0" }} />

                {scoreLoading ? (
                  <div style={{ padding: 32, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>Loading…</div>
                ) : bd ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {SCORE_CATEGORIES.map(({ key, label: catLabel, max }) => {
                      const val = Number(bd[key] ?? 0)
                      const pct = max > 0 ? Math.max(0, Math.min(1, val / max)) : 0
                      const c = pct >= 0.8 ? "var(--pos)" : pct >= 0.5 ? "var(--warn)" : "var(--neg)"
                      const shown = Number.isInteger(val) ? val : Math.round(val * 10) / 10
                      return (
                        <div key={key} className="row" style={{ gap: 10, alignItems: "center" }}>
                          <span className="tiny muted" style={{ width: 76, flexShrink: 0 }}>{catLabel}</span>
                          <div style={{ flex: 1, height: 6, borderRadius: 999, background: "var(--bg-inset)", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${pct * 100}%`, background: c, borderRadius: 999 }} />
                          </div>
                          <span className="tabular tiny" style={{ width: 46, flexShrink: 0, textAlign: "right", fontWeight: 600, color: c }}>{shown}/{max}</span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="tiny muted" style={{ padding: 24, textAlign: "center" }}>
                    No detailed breakdown is stored for this score. Re-run a competitor analysis for this keyword to compute one.
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {confirmDelete && (
        <div className="modal-bg" onClick={() => setConfirmDelete(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-h">
              <div>
                <div className="eyebrow" style={{ margin: 0, fontSize: 11, color: "var(--neg)" }}>DELETE PROJECT</div>
                <div className="b" style={{ fontSize: 18, marginTop: 4 }}>This can't be undone</div>
              </div>
              <button onClick={() => setConfirmDelete(false)} className="icon-btn" aria-label="Close"><Icon.close /></button>
            </div>
            <div className="modal-b">
              <div className="tiny muted">This will permanently delete</div>
              <div className="b" style={{ fontSize: 16, color: "var(--neg)", marginTop: 2 }}>{project.name}</div>
              <div className="tiny muted" style={{ marginTop: 6 }}>
                and all {project.keywords.length} keyword{project.keywords.length !== 1 ? "s" : ""} and rank history.
              </div>
            </div>
            <div className="modal-f">
              <button className="btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button
                onClick={handleDeleteProject}
                disabled={deleting}
                className="btn"
                style={{ background: "var(--neg)", color: "white", borderColor: "var(--neg)" }}
              >
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keyword delete confirmation — handles both single (from row menu)
          and bulk (from "Delete N" button) flows in one modal. */}
      {confirmDeleteKwIds && confirmDeleteKwIds.length > 0 && (() => {
        const ids = confirmDeleteKwIds
        const isBulk = ids.length > 1
        const firstKw = project.keywords.find((k) => k.id === ids[0])
        return (
          <div className="modal-bg" onClick={() => !bulkDeleting && setConfirmDeleteKwIds(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
              <div className="modal-h">
                <div>
                  <div className="eyebrow" style={{ margin: 0, fontSize: 11, color: "var(--neg)" }}>
                    {isBulk ? `DELETE ${ids.length} KEYWORDS` : "DELETE KEYWORD"}
                  </div>
                  <div className="b" style={{ fontSize: 18, marginTop: 4 }}>This can't be undone</div>
                </div>
                <button onClick={() => setConfirmDeleteKwIds(null)} className="icon-btn" aria-label="Close" disabled={bulkDeleting}><Icon.close /></button>
              </div>
              <div className="modal-b">
                <div className="tiny muted">{isBulk ? "This will permanently remove" : "This will permanently delete"}</div>
                <div className="b" style={{ fontSize: 16, color: "var(--neg)", marginTop: 2, wordBreak: "break-word" }}>
                  {isBulk ? `${ids.length} keywords` : firstKw?.keyword ?? ids[0]}
                </div>
                <div className="tiny muted" style={{ marginTop: 6 }}>and their rank history.</div>
              </div>
              <div className="modal-f">
                <button className="btn" onClick={() => setConfirmDeleteKwIds(null)} disabled={bulkDeleting}>Cancel</button>
                <button
                  onClick={() => handleBulkDeleteKeywords(ids)}
                  disabled={bulkDeleting}
                  className="btn"
                  style={{ background: "var(--neg)", color: "white", borderColor: "var(--neg)" }}
                >
                  {bulkDeleting ? "Deleting…" : isBulk ? `Yes, delete ${ids.length}` : "Yes, delete"}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {showAlerts && <AlertSettingsModal projectId={project.id} onClose={() => setShowAlerts(false)} />}

      {showReport && <ReportModal projectId={project.id} onClose={() => setShowReport(false)} />}

      {/* Public share modal — create / copy / revoke a read-only link to this
          project's live keyword rankings. */}
      {showShare && (
        <div className="modal-bg" onClick={() => setShowShare(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-h">
              <div>
                <div className="eyebrow" style={{ margin: 0, fontSize: 11 }}><span className="spark"><Icon.globe /></span> SHARE RANKINGS</div>
                <div className="b" style={{ fontSize: 18, marginTop: 4 }}>Public link</div>
              </div>
              <button onClick={() => setShowShare(false)} className="icon-btn" aria-label="Close"><Icon.close /></button>
            </div>
            <div className="modal-b">
              {project.shareToken ? (
                <>
                  <div className="tiny muted" style={{ marginBottom: 8 }}>
                    Anyone with this link can view a read-only, live snapshot of this project&apos;s keyword rankings — no login required.
                  </div>
                  <div className="row" style={{ gap: 8, alignItems: "stretch" }}>
                    <input className="input" readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, fontSize: 12 }} />
                    <button type="button" className="btn" onClick={handleCopyShare} style={{ whiteSpace: "nowrap" }}>
                      {shareCopied ? <><Icon.check /> Copied</> : "Copy"}
                    </button>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <a href={shareUrl} target="_blank" rel="noreferrer" className="tiny" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      Open link <Icon.external />
                    </a>
                  </div>
                </>
              ) : (
                <div className="tiny muted">
                  Generate a public link to share a read-only, live view of this project&apos;s keyword rankings. You can disable it any time.
                </div>
              )}
            </div>
            <div className="modal-f">
              {project.shareToken ? (
                <button
                  type="button"
                  className="btn"
                  onClick={handleDisableShare}
                  disabled={shareBusy}
                  style={{ borderColor: "var(--neg)", color: "var(--neg)" }}
                >
                  {shareBusy ? "Disabling…" : "Disable sharing"}
                </button>
              ) : (
                <button type="button" className="btn primary" onClick={handleCreateShare} disabled={shareBusy}>
                  {shareBusy ? "Creating…" : "Create public link"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

// Green/red movement pill under a stat (↑ 6.3). Renders nothing without real
// movement — no fabricated deltas.
function DeltaPill({ value, format }: { value: number | null; format?: (n: number) => string }) {
  if (value == null || value === 0) return null
  const up = value > 0
  const text = format ? format(Math.abs(value)) : Math.abs(value).toLocaleString()
  return (
    <span className={"delta " + (up ? "up" : "down")}>
      {up ? <Icon.arrowUp /> : <Icon.arrowDown />} {text}
    </span>
  )
}

// Competitors card for the insight rail. Competitors can ONLY be added from the
// domains found in the project's own SERP results (the /suggestions endpoint) —
// there's no free-text entry, so users pick from who actually ranks alongside
// them. Add/remove hit the competitor-spy API; the list refreshes after each.
type CompetitorRow = {
  id: string
  domain: string
  sharedCount: number
  gapCount: number
  rankHigherCount: number
  // Their average SERP position across your tracked keywords (1 decimal), or
  // null when they don't appear in any stored SERP yet.
  avgPosition: number | null
}
type CompetitorSuggestion = { domain: string; sharedCount: number }

function CompetitorsCard({ projectId, yourAvg }: { projectId: string; yourAvg: number | null }) {
  const t = useTranslations("projKeywords")
  const [tracked, setTracked] = useState<CompetitorRow[]>([])
  const [suggestions, setSuggestions] = useState<CompetitorSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [ov, sg] = await Promise.all([
        api.get<{ competitors: CompetitorRow[] }>(`/api/projects/${projectId}/competitors`),
        api.get<{ suggestions: CompetitorSuggestion[] }>(`/api/projects/${projectId}/competitors/suggestions`),
      ])
      setTracked(ov.competitors ?? [])
      setSuggestions(sg.suggestions ?? [])
    } catch {
      /* leave empty on failure */
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { void load() }, [load])

  const add = async (domain: string) => {
    if (!domain || busy) return
    setBusy(true)
    try {
      await api.post(`/api/projects/${projectId}/competitors`, { domain })
      await load()
    } catch { /* ignore */ } finally { setBusy(false) }
  }
  const remove = async (id: string) => {
    if (busy) return
    setBusy(true)
    try {
      await api.delete(`/api/projects/${projectId}/competitors/${id}`)
      await load()
    } catch { /* ignore */ } finally { setBusy(false) }
  }

  // Only offer suggestions not already tracked.
  const trackedDomains = new Set(tracked.map((c) => c.domain))
  const available = suggestions.filter((s) => !trackedDomains.has(s.domain))

  return (
    <div className="card">
      <div className="card-h">
        <div className="t">{t("competitors")}</div>
        {tracked.length > 0 && <span className="tiny muted tabular">{tracked.length}</span>}
      </div>
      <Dropdown
        block
        // cmp-add pins the menu to the trigger's own width (left+right:0), so it
        // can't overflow the narrow insight-rail card the way max-content did.
        className="cmp-add"
        menuAlign="left"
        value=""
        placeholder={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            <Icon.plus /> {t("addCompetitor")}
          </span>
        }
        options={available.map((s) => ({
          value: s.domain,
          label: (
            <span style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", minWidth: 0 }}>
              <Favicon domain={s.domain} size={18} fallbackColor="var(--brand)" />
              <span
                className="mono"
                style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12.5 }}
              >
                {s.domain}
              </span>
              <span
                className="tiny muted"
                style={{ flexShrink: 0 }}
                title={t("sharedCountTip", { count: s.sharedCount })}
              >
                {t("sharedCount", { count: s.sharedCount })}
              </span>
            </span>
          ),
        }))}
        onChange={add}
        disabled={busy || available.length === 0}
        ariaLabel={t("addCompetitor")}
      />
      <div style={{ marginTop: 12 }}>
        {loading ? (
          <div className="tiny muted" style={{ padding: "4px 2px" }}>…</div>
        ) : tracked.length === 0 ? (
          <div className="tiny muted" style={{ padding: "4px 2px", lineHeight: 1.5 }}>
            {available.length === 0 ? t("noCompetitorSuggestions") : t("noCompetitors")}
          </div>
        ) : (
          <div>
            {tracked.map((c) => {
              // Their average SERP position across your tracked keywords, colored
              // by comparison with YOUR average: green when you rank better
              // (their number is higher), red when they do, neutral otherwise.
              const theirAvg = c.avgPosition
              const tone =
                theirAvg == null || yourAvg == null ? "gap"
                : yourAvg < theirAvg ? "up"
                : yourAvg > theirAvg ? "down"
                : "gap"
              return (
                <div key={c.id} className="cmp-track">
                  <Link
                    href={`/dashboard/project/${projectId}/competitor-spy?competitor=${c.id}`}
                    className="cmp-track-link"
                    title={t("viewInSpy")}
                  >
                  <Favicon domain={c.domain} size={24} fallbackColor="var(--brand)" />
                  <div className="meta">
                    <span className="mono dom">{c.domain}</span>
                    <span className="cmp-cmp">
                      {theirAvg != null ? (
                        <span
                          className={tone}
                          title={t("cmpAvgPosTip", { yours: yourAvg != null ? `#${yourAvg.toFixed(1)}` : "—" })}
                        >
                          {t("cmpAvgPos", { pos: theirAvg })}
                        </span>
                      ) : (
                        <span className="muted">{t("noOverlapYet")}</span>
                      )}
                    </span>
                  </div>
                  </Link>
                  <button
                    type="button"
                    className="rm"
                    onClick={() => remove(c.id)}
                    disabled={busy}
                    title={t("removeCompetitor")}
                    aria-label={t("removeCompetitor")}
                  >
                    <Icon.close />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// Auto-check schedule control: a switch that shows the live state, and opens a
// small anchored dropdown of cadences when clicked. Picking one applies it
// immediately (including "Off"), so there's no confirmation popup in the way.
function ScheduleToggle({
  enabled,
  frequency,
  busy,
  onPick,
}: {
  enabled: boolean
  frequency: number
  busy: boolean
  onPick: (choice: number | "off") => void
}) {
  const t = useTranslations("projKeywords")
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Close on outside click WITHOUT swallowing it (pointerdown fires before the
  // outside element's click), matching the shared Dropdown's behaviour.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const choose = (choice: number | "off") => { setOpen(false); onPick(choice) }

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-expanded={open}
        className={"auto-toggle" + (enabled ? " on" : "")}
        disabled={busy}
        title={t("freqTitle")}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="track" aria-hidden><span className="knob" /></span>
        <span>{enabled ? freqLabel(frequency, t) : t("freqOff")}</span>
      </button>
      {open && (
        <div className="dd-menu" role="listbox" aria-label={t("freqTitle")} data-lenis-prevent style={{ zIndex: 50 }}>
          <button
            type="button"
            role="option"
            aria-selected={!enabled}
            className="dd-item"
            data-active={!enabled}
            onClick={() => choose("off")}
          >
            {t("freqOff")}
            {!enabled && <Icon.check size={13} />}
          </button>
          {FREQ_CHOICES.map((h) => {
            const active = enabled && frequency === h
            return (
              <button
                key={h}
                type="button"
                role="option"
                aria-selected={active}
                className="dd-item"
                data-active={active}
                onClick={() => choose(h)}
              >
                {freqLabel(h, t)}
                {active && <Icon.check size={13} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * The ⓘ next to a column label.
 *
 * The same InfoHint the stat cards use, so an explanation in the table doesn't
 * arrive in a different-looking box from one above it. It replaced a hand-rolled
 * popover on the Score column — about sixty lines that measured the icon,
 * clamped itself to the viewport, portaled to <body> and wired up its own
 * outside-click, Escape and resize handlers, all of which Radix already does.
 *
 * Generic rather than one component per column: a header explanation is the
 * same thing every time, and the alternative was a ScoreInfoTip beside an
 * AiOverviewInfoTip beside the next one.
 *
 * The wrapper stops the click reaching the header behind it. These sit inside
 * sortable columns and Radix opens on hover, so a click on the icon would
 * otherwise fall through and re-sort the table.
 */
/**
 * Wraps an element so its explanation appears in the app's tooltip.
 *
 * Replaces `title={...}`. A native title is an OS rectangle: it waits a second
 * or two, ignores the app's styling entirely, sits wherever the platform feels
 * like, and never appears for keyboard or touch users. Hovering this table gave
 * you one of those on almost every cell, next to the styled tooltips on the
 * stat cards above it.
 *
 * Renders the child untouched when there's nothing to say, so callers can pass
 * a conditional string without branching.
 */
function Hint({ text, children }: { text?: string | null; children: React.ReactElement }) {
  if (!text) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-60 text-xs">{text}</TooltipContent>
    </Tooltip>
  )
}

function HeaderInfo({ children }: { children: React.ReactNode }) {
  return (
    <span
      // Scaled to 12px: InfoHint's default 14px icon is sized for 13px body
      // text and reads oversized beside an 11.5px uppercase column label.
      className="inline-flex [&_svg]:size-3"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <InfoHint>{children}</InfoHint>
    </span>
  )
}

function SortHeader({
  label,
  k,
  sort,
  onClick,
  width,
  title,
  info,
}: {
  label: string
  k: SortKey
  sort: { key: SortKey; dir: "asc" | "desc" }
  onClick: (k: SortKey) => void
  width?: number | string
  title?: string
  /** Optional trailing node (e.g. an info tip) that must not trigger sorting. */
  info?: React.ReactNode
}) {
  const active = sort.key === k
  return (
    <th
      onClick={() => onClick(k)}
      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", width }}
    >
      {/* A flex row rather than bare inline content: the label, the sort arrow
          and the info icon each used to supply their own margin, so spacing
          depended on which of them happened to be present and the icon sat on
          the text baseline instead of centred against it.

          The description hangs off the label, not the whole <th>, so the ⓘ's
          own tooltip isn't competing with a second one covering the same cell. */}
      <span className="inline-flex items-center gap-1.5 align-middle">
        <Hint text={title}>
          <span>{label}</span>
        </Hint>
        {active && <span style={{ color: "var(--brand)" }}>{sort.dir === "asc" ? "↑" : "↓"}</span>}
        {info}
      </span>
    </th>
  )
}
