"use client"

// Keyword Magic Tool — one seed keyword → up to 500 real keywords (broad or
// related) with volume, KD, CPC, intent and SERP features, plus a word-group
// sidebar. Paid-only; the backend (POST /api/keyword-magic) enforces the gate
// and returns a 402 the shared api client already routes to the upsell modal.
//
// NOTE: strings are inline English for this first cut. The rest of the dashboard
// is i18n'd via next-intl; a follow-up should move these into a `dashKeywordMagic`
// message namespace across en/de/es/fr.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useCredits } from "@/lib/credits"
import { useTranslations } from "next-intl"
import { api, ApiError } from "@/lib/api"
import { ALL_LOCATIONS } from "@/lib/locations"
import { Flag } from "@/components/flag"
import { Icon } from "@/components/dashboard/icons"
import { Dropdown } from "@/components/dashboard/dropdown"
import { StatTile } from "@/components/dashboard/primitives"
import { ToolContext } from "@/components/dashboard/tool-context"
import { AddToTrackerModal } from "@/components/dashboard/add-to-tracker-modal"
import { CreditCost } from "@/components/dashboard/credit-cost"
import { CREDIT_ACTION_KEYS } from "@/lib/credits"
import { rowStats, viewRows, type SortKey, type SortState } from "@/lib/keyword-magic"

type MatchType = "broad" | "related"

// The backend refuses longer seeds (keywordMagic.routes.ts), and a zod 400 only
// says "Validation failed". The input stops here instead, and says why.
const SEED_MAX = 120

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

// Module scope, so no hook can run here: the tabs carry their message KEY and
// the component resolves the label at render.
const MATCH_TABS: { key: MatchType; labelKey: string }[] = [
  { key: "broad", labelKey: "kmBroadMatch" },
  { key: "related", labelKey: "kmRelated" },
]

// intent → compact badge, mirroring how Semrush shows a single letter per row.
// nameKey labels the intent filter.
const INTENT: Record<string, { label: string; nameKey: string; bg: string; fg: string }> = {
  informational: { label: "I", nameKey: "kmIntentInformational", bg: "var(--brand-soft)", fg: "var(--brand)" },
  navigational: { label: "N", nameKey: "kmIntentNavigational", bg: "var(--bg-sub)", fg: "var(--text-soft)" },
  commercial: { label: "C", nameKey: "kmIntentCommercial", bg: "var(--warn-soft)", fg: "var(--warn)" },
  transactional: { label: "T", nameKey: "kmIntentTransactional", bg: "var(--pos-soft)", fg: "var(--pos)" },
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

/** A number-filter input's value, or null when it's empty or not a number. */
function numOrNull(s: string): number | null {
  const n = Number(s)
  return s.trim() === "" || !Number.isFinite(n) ? null : n
}

/** A sortable metric heading. The caret shows only on the active column. */
function SortTh({ label, col, sort, onSort, width }: {
  label: string
  col: SortKey
  sort: SortState
  onSort: (k: SortKey) => void
  width: number
}) {
  const active = sort?.key === col
  return (
    <th
      style={{ width, textAlign: "right" }}
      aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(col)}
        style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
      >
        {label}
        <span aria-hidden style={{ fontSize: 9, opacity: active ? 1 : 0 }}>{active && sort!.dir === "asc" ? "▲" : "▼"}</span>
      </button>
    </th>
  )
}

export default function KeywordMagicPage() {
  const { credits: creditSummary } = useCredits()
  const creditsMode = creditSummary?.mode
  const t = useTranslations("tools")
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
  const [minVolume, setMinVolume] = useState("")
  const [maxKd, setMaxKd] = useState("")
  const [intent, setIntent] = useState("")
  const [sort, setSort] = useState<SortState>(null)

  // Keywords ticked for the rank tracker. Keyed by the keyword itself so the
  // selection survives filtering and group-switching — narrow the list, tick a
  // few, widen it again, and the earlier ticks are still there.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showAddModal, setShowAddModal] = useState(false)

  // Today's search allowance — fetched on load, then kept fresh from every
  // search response (and from a quota 402's details).
  const [usage, setUsage] = useState<Usage | null>(null)
  useEffect(() => {
    void api.get<Usage>("/api/keyword-magic/usage").then(setUsage).catch(() => {})
  }, [])
  const outOfSearches = usage != null && usage.remaining <= 0

  // The search in flight, if any. Only the newest may touch the page. Switching
  // tab mid-search used to start a second charged search, and whichever answer
  // landed LAST won, so the Related tab could end up showing Broad rows. An older
  // search is aborted now, and the backend doesn't charge a request whose
  // browser stopped waiting.
  const inflight = useRef<{ ctrl: AbortController; match: MatchType } | null>(null)

  const run = useCallback(
    async (match: MatchType) => {
      const q = seed.trim()
      if (!q) return
      inflight.current?.ctrl.abort()
      const ctrl = new AbortController()
      inflight.current = { ctrl, match }
      setLoading(true)
      setError(null)
      setPaywalled(false)
      setActiveGroup(null)
      setFilter("")
      try {
        const res = await api.post<MagicResponse>(
          "/api/keyword-magic",
          { seed: q, matchType: match, country },
          { signal: ctrl.signal },
        )
        if (inflight.current?.ctrl !== ctrl) return
        setResult(res)
        setUsage(res.usage)
        setMatchType(match)
        setSelected(new Set())
      } catch (err) {
        // Aborted or superseded: the newer search owns the page now.
        if (inflight.current?.ctrl !== ctrl) return
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
        if (inflight.current?.ctrl === ctrl) {
          inflight.current = null
          setLoading(false)
        }
      }
    },
    [seed, country],
  )

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void run(matchType)
  }

  // Switching tab re-runs the search for that match type (a distinct dataset +
  // a separate cache entry on the backend), but only when there's a seed. It
  // never re-runs a tab whose answer is already on screen or already on its way.
  const switchTab = (key: MatchType) => {
    if (inflight.current?.match === key) return
    setMatchType(key)
    if (result?.matchType === key) {
      // Back to the answer on screen: drop the other tab's search.
      inflight.current?.ctrl.abort()
      inflight.current = null
      setLoading(false)
      return
    }
    if (seed.trim() && (result || loading)) void run(key)
  }

  const rows = useMemo(
    () =>
      result
        ? viewRows(result.keywords, {
            text: filter,
            group: activeGroup,
            minVolume: numOrNull(minVolume),
            maxKd: numOrNull(maxKd),
            intent: intent || null,
            sort,
          })
        : [],
    [result, filter, activeGroup, minVolume, maxKd, intent, sort],
  )
  // The tiles say "shown rows", so they total the rows shown, filters included.
  const stats = useMemo(() => rowStats(rows), [rows])

  // First click: biggest first. Second: smallest first. Third: back to the
  // database's own order (by volume).
  const onSort = (key: SortKey) =>
    setSort((s) => (s?.key !== key ? { key, dir: "desc" } : s.dir === "desc" ? { key, dir: "asc" } : null))

  const toggle = (keyword: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(keyword)) next.delete(keyword)
      else next.add(keyword)
      return next
    })

  // The header box acts on the VISIBLE rows only: with a group or a filter
  // applied, "select all" meaning all 500 fetched keywords would be a trap.
  const visibleKeywords = rows.map((r) => r.keyword)
  const allVisibleSelected = visibleKeywords.length > 0 && visibleKeywords.every((k) => selected.has(k))
  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const k of visibleKeywords) {
        if (allVisibleSelected) next.delete(k)
        else next.add(k)
      }
      return next
    })

  return (
    <div className="page">
      <div className="page-h">
        <div style={{ minWidth: 0 }}>
          <h1>{t("kmTitle")}</h1>
          <div className="sub">
            {t("kmIntro")}
          </div>
        </div>

        {/* Daily allowance pill */}
        {/* The daily-search pill is WORKER-model accounting. A credits account
            has no daily searches — it has a balance, already shown by the
            CreditCost label under the search box — and rendering both put two
            different currencies on one screen. Shown only once the account is
            KNOWN to be worker: `!== "credits"` also passed when the credits
            request failed, putting "3 of 3 searches left" in front of credits
            users. */}
        {usage && creditsMode === "worker" && (
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

      <ToolContext id="keyword-magic" />

      {/* Limit-reached banner — only when results are on screen (the empty state
          shows its own, fuller out-of-searches card, so we don't double up). */}
      {outOfSearches && usage && result && (
        <div
          className="card"
          style={{ marginBottom: 16, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", borderColor: "var(--neg)", background: "var(--neg-soft)" }}
        >
          <span style={{ fontSize: 13.5, color: "var(--neg)", fontWeight: 500 }}>
            You've used all {usage.limit} of today's Keyword Magic searches. They reset daily.
          </span>
          {usage.plan === "free" && (
            <a className="btn primary sm" href="/dashboard/billing" style={{ flexShrink: 0 }}>
              <Icon.zap /> {t("kmUpgradeForMore")}
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
              placeholder={t("kmSeedPlaceholder")}
              value={seed}
              maxLength={SEED_MAX}
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
            {loading ? <><Icon.refresh /> {t("kmSearching")}</> : <><Icon.search /> {t("kmSearch")}</>}
          </button>
        </div>

        {/* At the limit the input simply stops typing. Say so, or a pasted
            seed just looks cut off. */}
        {seed.length >= SEED_MAX && (
          <div className="tiny" style={{ marginTop: 8, color: "var(--warn)" }}>
            {t("kmSeedTooLong", { max: SEED_MAX })}
          </div>
        )}

        {/* The price, before the search runs. The variant matters: a free
            search pulls 100 rows, a paid one 1,000, and they cost 3 and 15
            credits respectively. It waits for the usage answer that says
            which. Guessing "paid" when that request failed quoted free users
            15 credits for a 3-credit search. */}
        {usage && (
          <div style={{ marginTop: 8 }}>
            <CreditCost action={CREDIT_ACTION_KEYS.keywordMagicSearch} variant={usage.plan} />
          </div>
        )}

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
                className={(matchType === tab.key ? "active" : "") + (locked ? " km-lock-tab" : "")}
                onClick={() => {
                  if (locked) {
                    // Fire the global upsell modal; leave the current results intact.
                    window.dispatchEvent(new CustomEvent("billing:quota", {
                      detail: { code: "plan_upgrade_required", message: t("kmRelatedPaidOnly") },
                    }))
                    return
                  }
                  switchTab(tab.key)
                }}
                style={locked ? { display: "inline-flex", alignItems: "center", gap: 5, position: "relative" } : undefined}
              >
                {locked && <Icon.lock />}{t(tab.labelKey)}
                {locked && (
                  // Hover reveal: a small "Pro — Upgrade" popover. The whole tab is
                  // the click target (fires the upsell), so these are spans, not a
                  // nested button/link (invalid inside a <button>).
                  <span className="km-lock-pop">
                    <span>{t("kmProFeature")}</span>
                    <span className="km-lock-up">{t("kmUpgrade")}</span>
                  </span>
                )}
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
          <h2 style={{ margin: "0 0 6px", fontSize: 18 }}>{t("kmUpgradeToUnlock")}</h2>
          <div className="sub" style={{ marginBottom: 16 }}>
            {error ?? "This is available on paid plans — upgrade for more keywords per search, more searches per day, and the Related view."}
          </div>
          <a className="btn primary" href="/dashboard/billing" style={{ display: "inline-flex" }}>
            <Icon.zap /> {t("kmSeePlans")}
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
            <StatTile lbl="Total volume" val={fmtNum(stats.totalVolume)} tip="Monthly searches, shown rows" icon={<Icon.chart />} />
            <StatTile lbl="Average KD" val={stats.avgDifficulty != null ? `${stats.avgDifficulty}%` : "—"} tip="Keyword difficulty, shown rows" icon={<Icon.shield />} />
            {/* The answer's own match type: while another tab loads, the tab
                strip has already moved on but these rows haven't. */}
            <StatTile lbl="Match" val={result.matchType === "broad" ? "Broad" : "Related"} tip={`Market: ${result.location.toUpperCase()}`} icon={<Icon.filter />} />
          </div>

          <div className="km-layout">
            {/* Word-group sidebar */}
            <div className="card" style={{ padding: 12 }}>
              <div className="tiny muted" style={{ padding: "4px 8px 8px", fontWeight: 600 }}>{t("kmByKeyword")}</div>
              <button
                className="km-group"
                data-active={activeGroup == null}
                onClick={() => setActiveGroup(null)}
              >
                <span>{t("kmAllKeywords")}</span>
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
              <div className="row" style={{ padding: "12px 14px", gap: 10, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}>
                <div style={{ position: "relative", flex: "1 1 200px", minWidth: 0 }}>
                  <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-mute)", display: "inline-flex" }}>
                    <Icon.search />
                  </span>
                  <input
                    className="input"
                    style={{ paddingLeft: 32, width: "100%" }}
                    placeholder={t("kmFilterPlaceholder")}
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                </div>
                {/* The volume, difficulty and intent filters the tool's card promises. */}
                <input
                  className="input"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  style={{ width: 120 }}
                  placeholder={t("kmMinVolume")}
                  aria-label={t("kmMinVolume")}
                  value={minVolume}
                  onChange={(e) => setMinVolume(e.target.value)}
                />
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={100}
                  inputMode="numeric"
                  style={{ width: 100 }}
                  placeholder={t("kmMaxKd")}
                  aria-label={t("kmMaxKd")}
                  value={maxKd}
                  onChange={(e) => setMaxKd(e.target.value)}
                />
                <Dropdown
                  value={intent}
                  options={[
                    { value: "", label: t("kmAllIntents") },
                    ...Object.entries(INTENT).map(([value, i]) => ({ value, label: t(i.nameKey) })),
                  ]}
                  onChange={setIntent}
                  ariaLabel={t("kmIntent")}
                  style={{ flex: "0 0 150px" }}
                />
                {activeGroup && (
                  <button className="chip" onClick={() => setActiveGroup(null)} title={t("kmClearGroupFilter")}>
                    {activeGroup} <Icon.close />
                  </button>
                )}
                <span className="tiny muted" style={{ whiteSpace: "nowrap" }}>{rows.length.toLocaleString()} shown</span>
                <button
                  type="button"
                  className="btn primary"
                  style={{ fontSize: 12, whiteSpace: "nowrap" }}
                  disabled={selected.size === 0}
                  onClick={() => setShowAddModal(true)}
                  title={selected.size === 0 ? "Tick the keywords you want to track" : undefined}
                >
                  {selected.size > 0 ? `Add ${selected.size} to rank tracker` : "Add to rank tracker"}
                </button>
              </div>

              <div className="tbl-scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th style={{ width: 32 }}>
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          disabled={visibleKeywords.length === 0}
                          onChange={toggleAllVisible}
                          aria-label="Select all shown keywords"
                          title="Select all shown keywords"
                        />
                      </th>
                      <th>{t("kmKeyword")}</th>
                      <th style={{ width: 60, textAlign: "center" }}>{t("kmIntent")}</th>
                      <SortTh label={t("kmVolume")} col="volume" sort={sort} onSort={onSort} width={110} />
                      <SortTh label="KD %" col="difficulty" sort={sort} onSort={onSort} width={80} />
                      <SortTh label="CPC" col="cpc" sort={sort} onSort={onSort} width={90} />
                      <th style={{ width: 220 }}>{t("kmSerpFeatures")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const intent = r.intent ? INTENT[r.intent] : null
                      const feats = r.serpFeatures.slice(0, 4)
                      const extra = r.serpFeatures.length - feats.length
                      return (
                        <tr key={r.keyword}>
                          <td style={{ width: 32 }}>
                            <input
                              type="checkbox"
                              checked={selected.has(r.keyword)}
                              onChange={() => toggle(r.keyword)}
                              aria-label={r.keyword}
                            />
                          </td>
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
                              {extra > 0 && <span className="tag" title={t("kmMoreFeatures")}>+{extra}</span>}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ textAlign: "center", padding: 40, color: "var(--text-mute)" }}>
                          {/* No rows at all is the database's answer, not the filter's. */}
                          {result.keywords.length === 0 ? t("kmNoData") : t("kmNoMatch")}
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

      {/* Empty state — out of searches gets a prominent upsell; otherwise the
          generic "enter a keyword" prompt. */}
      {!result && !loading && !error && (
        outOfSearches && usage ? (
          <div className="card" style={{ padding: 48, textAlign: "center" }}>
            <div className="spark" style={{ margin: "0 auto 14px", width: 48, height: 48, background: "var(--neg-soft)", color: "var(--neg)" }}>
              <Icon.lock />
            </div>
            <h2 style={{ margin: "0 0 6px", fontSize: 19 }}>{t("kmOutOfSearches")}</h2>
            <div className="sub" style={{ marginBottom: 18, maxWidth: 440, marginInline: "auto" }}>
              Your {usage.plan === "paid" ? "" : "free "}plan includes {usage.limit} Keyword Magic {usage.limit === 1 ? "search" : "searches"} per day, each returning up to {usage.keywordLimit.toLocaleString()} keywords. They reset daily.
            </div>
            {usage.plan === "free" && (
              <a className="btn primary" href="/dashboard/billing" style={{ display: "inline-flex" }}>
                <Icon.zap /> {t("kmUpgradeForMoreSearches")}
              </a>
            )}
          </div>
        ) : (
          <div className="card" style={{ padding: 60, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
            <div className="spark" style={{ margin: "0 auto 12px", width: 40, height: 40 }}><Icon.key /></div>
            {t("kmEmptyState")}
          </div>
        )
      )}

      {showAddModal && result && (
        <AddToTrackerModal
          keywords={[...selected]}
          source="keyword-magic"
          // The market the search itself ran in — tracking these keywords
          // anywhere else would measure a different SERP than the volume, KD and
          // CPC figures on screen.
          defaultLocation={result.location}
          plan={usage?.plan}
          onClose={() => setShowAddModal(false)}
          onAdded={() => setSelected(new Set())}
        />
      )}

      <style jsx>{`
        /* Locked "Related" tab: a hover popover with an Upgrade pill. */
        .km-lock-tab { position: relative; }
        .km-lock-pop {
          position: absolute;
          bottom: calc(100% + 10px);
          left: 50%;
          transform: translateX(-50%) translateY(4px);
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 10px;
          background: var(--bg-elev);
          color: var(--text);
          border: 1px solid var(--border);
          font-size: 12px;
          font-weight: 500;
          white-space: nowrap;
          box-shadow: 0 12px 30px -12px rgba(0, 0, 0, 0.35);
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transition: opacity 0.15s ease, transform 0.15s ease;
          z-index: 30;
        }
        .km-lock-pop::after {
          content: "";
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          border: 6px solid transparent;
          border-top-color: var(--bg-elev);
        }
        .km-lock-tab:hover .km-lock-pop,
        .km-lock-tab:focus-visible .km-lock-pop {
          opacity: 1;
          visibility: visible;
          transform: translateX(-50%) translateY(0);
        }
        .km-lock-up {
          background: var(--brand);
          color: #fff;
          padding: 3px 9px;
          border-radius: 6px;
          font-weight: 700;
          font-size: 11px;
        }

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
