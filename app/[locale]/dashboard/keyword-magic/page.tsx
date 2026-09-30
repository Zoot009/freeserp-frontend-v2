"use client"

// Keyword Magic Tool — one seed keyword → up to 500 real keywords (broad or
// related) with volume, KD, CPC, intent and SERP features, plus a word-group
// sidebar. Paid-only; the backend (POST /api/keyword-magic) enforces the gate
// and returns a 402 the shared api client already routes to the upsell modal.
//
// NOTE: strings are inline English for this first cut. The rest of the dashboard
// is i18n'd via next-intl; a follow-up should move these into a `dashKeywordMagic`
// message namespace across en/de/es/fr.

import { cloneElement, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useCredits } from "@/lib/credits"
import { useTranslations } from "next-intl"
import { api, ApiError } from "@/lib/api"
import { ALL_LOCATIONS } from "@/lib/locations"
import { Flag } from "@/components/flag"
import { Icon } from "@/components/dashboard/icons"
import { Dropdown } from "@/components/dashboard/dropdown"
import { FeatChip, StatTile } from "@/components/dashboard/primitives"
import { Hint } from "@/components/dashboard/widget"
import { ToolContext } from "@/components/dashboard/tool-context"
import { AddToTrackerModal } from "@/components/dashboard/add-to-tracker-modal"
import { CreditCost } from "@/components/dashboard/credit-cost"
import { CREDIT_ACTION_KEYS } from "@/lib/credits"
import { rowStats, serpChips, viewRows, type SortKey, type SortState } from "@/lib/keyword-magic"

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

// intent → the rank tracker's badge (its AI Overview column's .aio pill): the
// word itself beside a coloured dot. Single letters — I, N, C, T — had to be
// decoded from a tooltip before they meant anything. nameKey also labels the
// intent filter; tipKey says what the intent asks you to build.
const INTENT: Record<string, { nameKey: string; tipKey: string; dot: string }> = {
  informational: { nameKey: "kmIntentInformational", tipKey: "kmIntentTipInformational", dot: "var(--brand)" },
  navigational: { nameKey: "kmIntentNavigational", tipKey: "kmIntentTipNavigational", dot: "var(--text-mute)" },
  commercial: { nameKey: "kmIntentCommercial", tipKey: "kmIntentTipCommercial", dot: "var(--warn)" },
  transactional: { nameKey: "kmIntentTransactional", tipKey: "kmIntentTipTransactional", dot: "var(--pos)" },
}

// Names for the features without a chip, listed in the "+N" chip's tooltip.
// The rest read fine from their type: hotels_pack → "Hotels pack".
const SERP_NAME: Record<string, string> = {
  paid: "Ads",
  faq: "FAQ",
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

/** Difficulty band: the badge's colour, and the word in its tooltip. */
function kdLevel(kd: number): { cls: string; key: string } {
  return kd <= 33 ? { cls: "easy", key: "kmKdEasy" } : kd <= 66 ? { cls: "medium", key: "kmKdMedium" } : { cls: "hard", key: "kmKdHard" }
}

function serpName(t: string): string {
  const words = t.replace(/_/g, " ")
  return SERP_NAME[t] ?? words.charAt(0).toUpperCase() + words.slice(1)
}

/** A number-filter input's value, or null when it's empty or not a number. */
function numOrNull(s: string): number | null {
  const n = Number(s)
  return s.trim() === "" || !Number.isFinite(n) ? null : n
}

/**
 * A sortable metric heading, built like the rank tracker's SortHeader: the
 * whole cell is the click target and the arrow shows only on the active column.
 *
 * No <button> inside. Buttons reset text-transform, so these read "Volume"
 * beside "KEYWORD". The span takes the keyboard stop instead, with the button
 * role on it rather than on the <th>, which has to stay a column header for
 * aria-sort to mean anything.
 */
function SortTh({ label, tip, col, sort, onSort, width }: {
  label: string
  /** What the column measures, on the label — as the tracker's headers do. */
  tip: string
  col: SortKey
  sort: SortState
  onSort: (k: SortKey) => void
  width: number
}) {
  const active = sort?.key === col
  return (
    <th
      onClick={() => onSort(col)}
      aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
      style={{ width, textAlign: "right", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
    >
      <span
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return
          e.preventDefault()
          onSort(col)
        }}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, verticalAlign: "middle" }}
      >
        <Hint text={tip}><span>{label}</span></Hint>
        {active && <span aria-hidden style={{ color: "var(--brand)" }}>{sort!.dir === "asc" ? "↑" : "↓"}</span>}
      </span>
    </th>
  )
}

/**
 * Hint, mounted when the pointer first reaches the element; until then the
 * child renders as it is. A row carries several (intent, KD, SERP chips) and
 * a paid search returns 1,000 rows. Thousands of Radix tooltips took seconds
 * to render, and every tick of a checkbox re-rendered them all. FeatChip's
 * `lazy` does the same for the SERP chips.
 *
 * It opens on the pointer's next move, like any Hint. Forcing it open on
 * arrival would strand it open whenever the pointer had left by the time it
 * mounted.
 */
function LazyHint({ text, children }: { text: string; children: React.ReactElement<React.HTMLAttributes<HTMLElement>> }) {
  const [armed, setArmed] = useState(false)
  if (armed) return <Hint text={text}>{children}</Hint>
  return cloneElement(children, { onPointerEnter: () => setArmed(true) })
}

/** Leading icon inside a text input, as on the SERP checker. */
const FIELD_ICON: React.CSSProperties = {
  position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)",
  color: "var(--text-mute)", display: "inline-flex", pointerEvents: "none",
}

/**
 * A labelled field, drawn as the SERP checker draws its form. `group` makes it
 * a div rather than a <label>: a label passes a click on its text to the first
 * button inside, and here that button can start a search.
 */
function Field({ label, group = false, style, children }: {
  label: string
  group?: boolean
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  const Tag = group ? "div" : "label"
  return (
    <Tag className="col" style={{ gap: 6, minWidth: 0, ...style }} {...(group ? { role: "group", "aria-label": label } : {})}>
      <span className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>
        {label}
      </span>
      {children}
    </Tag>
  )
}

/**
 * m:ss since `since`. It ticks in its own component, so the clock re-renders
 * itself each second rather than the page and its thousand rows.
 */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const s = Math.max(0, Math.floor((now - since) / 1000))
  return <span className="tabular">{Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}</span>
}

export default function KeywordMagicPage() {
  const { credits: creditSummary } = useCredits()
  const creditsMode = creditSummary?.mode
  const t = useTranslations("tools")
  const tf = useTranslations("dashPrimitives")
  const [seed, setSeed] = useState("")
  const [country, setCountry] = useState("us")
  const [matchType, setMatchType] = useState<MatchType>("broad")

  const [result, setResult] = useState<MagicResponse | null>(null)
  // The search on its way, for the progress banner: what was asked, and when.
  // The seed is the one submitted, not the box, which can change meanwhile.
  const [pending, setPending] = useState<{ seed: string; match: MatchType; country: string; startedAt: number } | null>(null)
  const loading = pending != null
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
      setPending({ seed: q, match, country, startedAt: Date.now() })
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
          setPending(null)
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
      setPending(null)
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
          <Hint text={`${usage.plan === "paid" ? "Paid" : "Free"} plan · ${usage.keywordLimit} keywords per search`}>
            <div
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0,
                padding: "7px 13px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap",
                border: "1px solid " + (outOfSearches ? "var(--neg)" : "var(--border)"),
                background: outOfSearches ? "var(--neg-soft)" : "var(--brand-soft)",
                color: outOfSearches ? "var(--neg)" : "var(--brand)",
              }}
            >
              {outOfSearches ? <Icon.lock /> : <Icon.zap />}
              {outOfSearches
                ? `${usage.limit} of ${usage.limit} searches used`
                : `${usage.remaining} of ${usage.limit} searches left today`}
            </div>
          </Hint>
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

      {/* Search form, laid out as the SERP checker's: the query on top, the
          settings under it with the button at the end of their line, the price
          below. It was the seed, the country and Search on one line with a gap
          before the button, and the match tabs alone on a third line. */}
      <form className="card" onSubmit={onSubmit} style={{ marginBottom: 16 }}>
        <Field label={t("kmSeedLabel")}>
          <div style={{ position: "relative" }}>
            <span style={FIELD_ICON}><Icon.search /></span>
            <input
              className="input lg"
              style={{ paddingLeft: 38 }}
              placeholder={t("kmSeedPlaceholder")}
              value={seed}
              maxLength={SEED_MAX}
              onChange={(e) => setSeed(e.target.value)}
              autoFocus
            />
          </div>
        </Field>

        {/* At the limit the input simply stops typing. Say so, or a pasted
            seed just looks cut off. */}
        {seed.length >= SEED_MAX && (
          <div className="tiny" style={{ marginTop: 8, color: "var(--warn)" }}>
            {t("kmSeedTooLong", { max: SEED_MAX })}
          </div>
        )}

        <div className="km-settings">
          <Field label={t("kmCountryLabel")} group>
            <Dropdown
              block
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
              ariaLabel={t("kmCountryLabel")}
            />
          </Field>
          <Field label={t("kmMatchLabel")} group>
            <div className="pill-toggle km-match">
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
          </Field>
          <button type="submit" className="btn primary km-go" disabled={loading || !seed.trim() || outOfSearches}>
            {loading
              ? <><span className="spin" style={{ display: "inline-flex" }}><Icon.refresh /></span> {t("kmSearching")}</>
              : <><Icon.search /> {t("kmFindKeywords")}</>}
          </button>
        </div>

        {/* The price, before the search runs. The variant matters: a free
            search pulls 100 rows, a paid one 1,000, and they cost 3 and 15
            credits respectively. It waits for the usage answer that says
            which. Guessing "paid" when that request failed quoted free users
            15 credits for a 3-credit search. */}
        {usage && (
          <div style={{ marginTop: 12 }}>
            <CreditCost action={CREDIT_ACTION_KEYS.keywordMagicSearch} variant={usage.plan} />
          </div>
        )}
      </form>

      {/* A search on its way: the rank tracker's "checking" strip, with what
          was asked and a running clock, so a slow answer never looks like a
          frozen page. It shows over results already on screen too, which dim
          until the new ones land; before, only the button said anything. */}
      {pending && (
        <div className="card tight check-banner" style={{ marginBottom: 16 }}>
          <div className="row" style={{ gap: 12, alignItems: "center" }}>
            <span
              className="spin"
              aria-hidden
              style={{
                width: 18, height: 18, borderRadius: "50%", flexShrink: 0, boxSizing: "border-box",
                border: "2.5px solid color-mix(in srgb, var(--brand) 25%, transparent)", borderTopColor: "var(--brand)",
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="b" role="status" style={{ fontSize: 13, color: "var(--brand)", overflowWrap: "anywhere" }}>
                {t("kmFinding", { seed: pending.seed })}
              </div>
              <div className="tiny" style={{ color: "var(--brand)", opacity: 0.75, marginTop: 1 }}>
                {t(pending.match === "related" ? "kmRelated" : "kmBroadMatch")}
                {" · "}
                {ALL_LOCATIONS.find((l) => l.code === pending.country)?.name ?? pending.country.toUpperCase()}
                {" · "}
                <span aria-hidden><Elapsed since={pending.startedAt} /></span>
              </div>
            </div>
          </div>
          <div className="check-bar" aria-hidden><span /></div>
        </div>
      )}

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

      {/* First search: the shape of the answer in placeholders, under the
          progress strip, rather than one line of text in an empty card. */}
      {loading && !result && (
        <div aria-busy="true">
          <div className="grid g-4 km-stats" style={{ marginBottom: 16 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="card" style={{ padding: 16 }}>
                <div className="skeleton" style={{ height: 12, width: 90 }} />
                <div className="skeleton" style={{ height: 26, width: 72, marginTop: 12 }} />
                <div className="skeleton" style={{ height: 10, width: 130, marginTop: 10 }} />
              </div>
            ))}
          </div>
          <div className="card" style={{ padding: 0 }}>
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="km-skel-row" style={{ borderBottom: i < 7 ? "1px solid var(--border)" : 0 }}>
                <span className="skeleton" style={{ width: 14, height: 14, borderRadius: 4 }} />
                <span className="skeleton" style={{ height: 12, width: `${34 + ((i * 17) % 30)}%` }} />
                <span className="skeleton" style={{ height: 20, width: 96, borderRadius: 999, marginLeft: "auto" }} />
                <span className="skeleton" style={{ height: 12, width: 44 }} />
                <span className="skeleton" style={{ height: 26, width: 30, borderRadius: 8 }} />
                <span className="skeleton km-hide-sm" style={{ height: 12, width: 44 }} />
                <span className="skeleton km-hide-sm" style={{ height: 24, width: 84, borderRadius: 6 }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results. Dimmed while a newer search runs: they answer the last
          question, not the one on its way. */}
      {result && (
        <div className={loading ? "km-stale" : undefined} aria-busy={loading || undefined}>
          <div className="grid g-4 km-stats" style={{ marginBottom: 16 }}>
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
            {/* Word-group sidebar. A strip of chips on narrow screens (see the
                style block). */}
            <div className="card" style={{ padding: 12 }}>
              <div className="km-group-h tiny muted">{t("kmByKeyword")}</div>
              <div className="km-group-list fs-quiet-scroll">
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
            </div>

            {/* Results table */}
            <div className="card" style={{ padding: 0 }}>
              {/* The controls' sizes live in the style block, not inline, so the
                  phone layout there can re-flow them. */}
              <div className="row km-bar" style={{ padding: "12px 14px", gap: 10, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}>
                <div className="km-bar-q">
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
                  className="input km-bar-min"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder={t("kmMinVolume")}
                  aria-label={t("kmMinVolume")}
                  value={minVolume}
                  onChange={(e) => setMinVolume(e.target.value)}
                />
                <input
                  className="input km-bar-kd"
                  type="number"
                  min={0}
                  max={100}
                  inputMode="numeric"
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
                  className="km-bar-intent"
                />
                {activeGroup && (
                  <Hint text={t("kmClearGroupFilter")}>
                    <button className="chip" onClick={() => setActiveGroup(null)}>
                      {activeGroup} <Icon.close />
                    </button>
                  </Hint>
                )}
                <span className="tiny muted" style={{ whiteSpace: "nowrap" }}>{rows.length.toLocaleString()} shown</span>
                <Hint text={selected.size === 0 ? "Tick the keywords you want to track" : null}>
                  <button
                    type="button"
                    className="btn primary km-bar-add"
                    style={{ fontSize: 12, whiteSpace: "nowrap" }}
                    disabled={selected.size === 0}
                    onClick={() => setShowAddModal(true)}
                  >
                    {selected.size > 0 ? `Add ${selected.size} to rank tracker` : "Add to rank tracker"}
                  </button>
                </Hint>
              </div>

              <div className="tbl-scroll">
                {/* The tracker's trick for phones: a floor on the table's width,
                    so the keyword keeps ~220px and the table scrolls sideways,
                    rather than the fixed columns squeezing it to "coffee n…". */}
                <table className="tbl flush km-table" style={{ minWidth: 860 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          disabled={visibleKeywords.length === 0}
                          onChange={toggleAllVisible}
                          aria-label="Select all shown keywords"
                        />
                      </th>
                      <th>{t("kmKeyword")}</th>
                      <th style={{ width: 150 }}>
                        <Hint text={t("kmTipIntent")}><span>{t("kmIntent")}</span></Hint>
                      </th>
                      <SortTh label={t("kmVolume")} tip={t("kmTipVolume")} col="volume" sort={sort} onSort={onSort} width={104} />
                      <SortTh label="KD" tip={t("kmTipKd")} col="difficulty" sort={sort} onSort={onSort} width={76} />
                      <SortTh label="CPC" tip={t("kmTipCpc")} col="cpc" sort={sort} onSort={onSort} width={86} />
                      <th style={{ width: 176 }}>
                        <Hint text={t("kmTipSerp")}><span>{t("kmSerpFeatures")}</span></Hint>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const intent = r.intent ? INTENT[r.intent] : null
                      const kd = r.difficulty != null ? kdLevel(r.difficulty) : null
                      // Four chips fit the column on one line; the rest go in a
                      // "+N" that names them, so every row keeps one height.
                      const { chips, other } = serpChips(r.serpFeatures)
                      const shown = chips.slice(0, 4)
                      const more = [...chips.slice(4).map((c) => tf(`feat.${c}`)), ...other.map(serpName)]
                      return (
                        <tr key={r.keyword} className={selected.has(r.keyword) ? "km-sel" : undefined}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selected.has(r.keyword)}
                              onChange={() => toggle(r.keyword)}
                              aria-label={r.keyword}
                            />
                          </td>
                          {/* The tracker's keyword cell: one line, ellipsis, the
                              full text on hover. Still opens the live results. */}
                          <td style={{ maxWidth: 0 }}>
                            <a
                              className="kw km-kw"
                              title={r.keyword}
                              href={`https://www.google.com/search?q=${encodeURIComponent(r.keyword)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {r.keyword}
                            </a>
                          </td>
                          <td>
                            {intent ? (
                              <LazyHint text={t(intent.tipKey)}>
                                <span className="aio km-intent">
                                  <span className="dot" style={{ background: intent.dot }} />
                                  {t(intent.nameKey)}
                                </span>
                              </LazyHint>
                            ) : (
                              <span className="tiny muted">—</span>
                            )}
                          </td>
                          {/* Whole figures, the way the rank tracker prints volume.
                              fmtNum put "301k" above "8,100" in one column. */}
                          <td className="tabular" style={{ textAlign: "right" }}>{r.volume != null ? r.volume.toLocaleString() : "—"}</td>
                          <td style={{ textAlign: "right" }}>
                            {kd ? (
                              <LazyHint text={t("kmKdTip", { kd: r.difficulty!, level: t(kd.key) })}>
                                <span className={`km-kd ${kd.cls}`}>{r.difficulty}</span>
                              </LazyHint>
                            ) : (
                              <span className="tiny muted">—</span>
                            )}
                          </td>
                          <td className="tabular" style={{ textAlign: "right" }}>{fmtCpc(r.cpc)}</td>
                          <td>
                            {shown.length > 0 || more.length > 0 ? (
                              <span className="km-feats">
                                {shown.map((f) => <FeatChip key={f} f={f} lazy />)}
                                {more.length > 0 && (
                                  <LazyHint text={more.join(", ")}>
                                    <span className="chip feat km-more">+{more.length}</span>
                                  </LazyHint>
                                )}
                              </span>
                            ) : (
                              <span className="tiny muted">—</span>
                            )}
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
        </div>
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

        /* Results table, in the rank tracker's terms. */
        .km-table :global(.km-kw) { text-decoration: none; }
        .km-table :global(.km-kw:hover) { color: var(--brand); text-decoration: underline; text-underline-offset: 3px; }
        .km-table tr.km-sel td { background: var(--brand-soft); }
        .km-intent { cursor: default; }
        /* Difficulty: the tracker's position badge, coloured by band. */
        .km-kd {
          display: inline-grid;
          place-items: center;
          min-width: 32px;
          height: 26px;
          padding: 0 7px;
          border-radius: 8px;
          font-size: 12.5px;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
          cursor: default;
        }
        .km-kd.easy { background: var(--pos-soft); color: var(--pos); }
        .km-kd.medium { background: var(--warn-soft); color: var(--warn); }
        .km-kd.hard { background: var(--neg-soft); color: var(--neg); }
        .km-feats { display: inline-flex; align-items: center; gap: 3px; flex-wrap: wrap; }
        .km-more { font-size: 11px; font-weight: 600; line-height: 16px; padding: 3px 6px; cursor: default; }

        /* Loading placeholders, laid out like a row of the answer. */
        .km-skel-row { display: flex; align-items: center; gap: 18px; padding: 14px 16px; }

        /* The form's settings line: country, match type, and the button pushed
           to the end. Bottoms aligned, so the labels line up above. Sizes
           here, not inline, so phones can re-flow it. The toggle's padding is
           the SERP checker's device toggle, which stands as tall as the
           dropdown beside it. */
        .km-settings { display: flex; gap: 12px; margin-top: 14px; flex-wrap: wrap; align-items: flex-end; }
        .km-settings > :global(.col:first-child) { flex: 0 1 240px; }
        .km-settings :global(.dd-trigger) { height: 38px; }
        .km-match button { padding: 7px 14px; }
        .km-go { margin-left: auto; min-width: 180px; height: 38px; justify-content: center; }

        /* The last answer, while a newer search runs. */
        .km-stale { opacity: 0.45; pointer-events: none; transition: opacity 0.2s ease; }

        .km-layout {
          display: grid;
          grid-template-columns: 230px minmax(0, 1fr);
          gap: 16px;
          align-items: start;
        }
        .km-group-h {
          padding: 4px 8px 8px;
          font-weight: 600;
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

        /* Filter bar. The search box takes the slack, so on one line the add
           button's auto margin is zero; it only counts once the bar wraps, and
           keeps the button at the right edge there. */
        .km-bar-q {
          position: relative;
          flex: 1 1 200px;
          min-width: 0;
        }
        /* input.… to outrank the shared .fs-app .input { width: 100% }. */
        input.km-bar-min { width: 120px; }
        input.km-bar-kd { width: 100px; }
        .km-bar :global(.km-bar-intent) { flex: 0 0 150px; }
        .km-bar-add { margin-left: auto; }

        /* Narrow screens put the groups above the table. minmax(0, …), not 1fr:
           a bare 1fr can't shrink below the table's 680px min-width, which ran
           both cards ~700px wide on a phone. The table scrolls in .tbl-scroll
           instead. And as a list, up to 21 groups pushed the table a screen
           down, so here they are one row of chips that swipes sideways. */
        @media (max-width: 860px) {
          .km-layout { grid-template-columns: minmax(0, 1fr); }
          .km-group-h { padding: 0 0 8px; }
          .km-group-list {
            display: flex;
            gap: 6px;
            overflow-x: auto;
            /* Out to the card's edges, so chips scroll away under its border
               rather than vanishing 12px short of it. */
            margin: 0 -12px;
            padding: 0 12px 4px;
          }
          .km-group {
            width: auto;
            flex: none;
            padding: 6px 12px;
            border: 1px solid var(--border);
            border-radius: 999px;
          }
          .km-group[data-active="true"] { border-color: var(--brand); }
        }

        /* Phones. The form stacks: country, then the match toggle split
           evenly across the width, then the button full width. Two tiles a
           row rather than the shared
           single column, where the four filled the first screen before any
           keyword (.grid outranks .fs-app .g-4). The filter bar goes to rows:
           search, the two number filters, intent (three abreast cut their
           labels off at 360px), then the count and the add button. */
        @media (max-width: 640px) {
          .km-settings > :global(.col),
          .km-settings > :global(.col:first-child) { flex: 1 1 100%; }
          /* .km-settings too, to outrank .fs-app .pill-toggle's inline-flex. */
          .km-settings .km-match { display: flex; width: 100%; }
          .km-match button { flex: 1 1 0; justify-content: center; }
          .km-go { flex: 1 1 100%; margin-left: 0; }
          .km-bar :global(.km-bar-intent .dd-trigger) { width: 100%; justify-content: space-between; }
          .grid.km-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .km-bar-q { flex-basis: 100%; }
          input.km-bar-min,
          input.km-bar-kd { flex: 1 1 0; min-width: 0; }
          .km-bar :global(.km-bar-intent) { flex: 1 1 100%; }
          .km-skel-row { gap: 12px; }
          .km-skel-row :global(.km-hide-sm) { display: none; }
        }
      `}</style>
    </div>
  )
}
