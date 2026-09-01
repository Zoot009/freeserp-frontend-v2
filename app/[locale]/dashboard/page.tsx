"use client"

/**
 * SEO Dashboard — one project at a time.
 *
 * Layout follows the reference: five headline figures across the top, the setup
 * strip, then two wide/narrow rows — Position Tracking beside Site Audit, and
 * Traffic Analytics beside Keyword Movement.
 *
 * Everything here comes from real endpoints:
 *   • /api/projects              — the project list behind the switcher
 *   • /api/projects/:id          — keywords with their latest check (position,
 *                                  deltas, volume, modelled traffic) plus the
 *                                  domain's authority + backlinks
 *   • /api/overview              — coverage stats and the average-position trend
 *   • /api/projects/:id/overview — estimated traffic + ranking pages over time
 *   • /api/gsc/connection        — whether Search Console is actually linked
 *   • /api/projects/:id/site-crawl — inside the Site Audit card
 *
 * Each card is still a widget: the ✕ on its header removes it, and "Customise
 * dashboard" in the footer opens the panel that puts it back.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "@/i18n/navigation"
import { Plus } from "lucide-react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { HiddenWidgets, WidgetProvider, useWidgets, type WidgetDef } from "@/components/dashboard/widget"
import { DashboardGridSkeleton } from "@/components/dashboard/shell-skeleton"
import { ProjectSwitcher } from "@/components/dashboard/project-switcher"
import { SiteCrawlCard } from "@/components/dashboard/site-crawl-card"
import { KeywordSetupCard } from "@/components/dashboard/cards/keyword-setup-card"
import { StatStrip } from "@/components/dashboard/cards/stat-strip"
import { SetupCard, type GscState } from "@/components/dashboard/cards/setup-card"
import { PositionTrackingCard, type Band, type TopKeyword } from "@/components/dashboard/cards/position-tracking-card"
import { TrafficCard, type TrafficPoint } from "@/components/dashboard/cards/traffic-card"
import { KeywordMovementCard } from "@/components/dashboard/cards/keyword-movement-card"
import { CreateProjectModal } from "@/components/dashboard/create-project-modal"
import { ProjectLimitModal } from "@/components/dashboard/project-limit-modal"
import { useProjectLimit } from "@/hooks/use-project-limit"

// ── Types ────────────────────────────────────────────────────────────────────

type ProjectSummary = { id: string; name: string; domain: string }

type Keyword = {
  id: string
  keyword: string
  /** Market + device this keyword is checked in — set per keyword, not per project. */
  location: string | null
  /** Set on sub-country keywords; `location` is a bare DataForSEO code then. */
  locationLabel?: string | null
  device: string | null
  position: number | null
  firstPosition?: number | null
  d1: number | null
  d7: number | null
  url: string | null
  monthlyTraffic: number | null
  searchVolume: number | null
  serpFeatures: Record<string, unknown> | null
  searchVolumeTrend: { year: number; month: number; searchVolume: number }[] | null
  /** When a rank check last completed. Distinguishes "checked, ranks past 100"
   *  from "never checked" — the two look identical on `position: null`. */
  checkedAt?: string | null
  /** Most recent COMPLETED competitor analysis. Present → the Rank action opens
   *  that report instead of starting a fresh (paid) run. */
  latestAnalysisId?: string | null
}

type ProjectDetail = {
  id: string
  name: string
  domain: string
  domainAuthority: number | null
  domainBacklinks: number | null
  backlinksCheckedAt?: string | null
  lastScheduledCheck?: string | null
  keywords: Keyword[]
}

type Range = "24h" | "7d" | "30d" | "90d"

type OverviewResponse = {
  range: Range
  stats: {
    totalKeywords: number
    ranked: number
    avgPosition: number | null
    inTop3: number
    inTop10: number
    inTop30: number
    outside30: number
  }
  history: { t: string; avgPos: number }[]
}

/** `/api/projects/:id/overview` — the per-project time series and movement. */
type ProjectOverviewResponse = {
  history: TrafficPoint[]
  /**
   * Measured first-check vs last-check movement inside the range. Optional
   * because a backend that predates it simply omits the field; the card then
   * shows its "no comparable checks" state rather than four confident zeroes.
   */
  movement?: { improved: number; declined: number; added: number; lost: number; comparable: number }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Position → click-through rate, so visibility weights a #1 far above a #9. */
function ctr(pos: number | null): number {
  if (pos == null) return 0
  const curve = [0.317, 0.247, 0.187, 0.133, 0.095, 0.068, 0.049, 0.037, 0.029, 0.024]
  if (pos <= 10) return curve[Math.ceil(pos) - 1] ?? 0.024
  if (pos <= 20) return 0.012
  if (pos <= 50) return 0.005
  if (pos <= 100) return 0.002
  return 0
}

const round1 = (n: number) => Math.round(n * 10) / 10
const RANGE_LABEL: Record<Range, string> = { "24h": "Last 24 hours", "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days" }
// Width of each range in days — the domain the charts plot their time axis
// against, so a sample sits at the date it was taken. 24h is a fraction, which
// is fine: it's only ever multiplied by a day in milliseconds.
const RANGE_DAYS: Record<Range, number> = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 }

/** Exclusive ranking bands, so the counts sum to the keywords tracked. */
const BAND_DEFS = [
  { label: "Top 3", lo: 1, hi: 3 },
  { label: "4 – 10", lo: 4, hi: 10 },
  { label: "11 – 20", lo: 11, hi: 20 },
  { label: "21 – 100", lo: 21, hi: 100 },
]

// The catalogue the Hidden Widgets panel restores from — every widget id used
// below has to appear here, or a hidden card would have no way back.
const WIDGETS: WidgetDef[] = [
  { id: "setup", label: "Your tools" },
  { id: "position-tracking", label: "Position Tracking" },
  { id: "site-crawl", label: "Site Audit" },
  { id: "traffic", label: "Traffic Analytics" },
  { id: "keyword-movement", label: "Keyword Movement" },
]

/**
 * The bottom of the dashboard: the Hidden Widgets panel, then the last-refresh
 * line.
 *
 * The panel is always rendered. It used to sit behind a "Customise dashboard"
 * toggle, which meant a card you'd removed with its ✕ had no visible way back
 * until you noticed the link — the panel is the answer to "where did it go?",
 * so it shouldn't need finding.
 */
function DashboardFooter({ refreshed }: { refreshed: string | null }) {
  const { hidden, ready, showAll } = useWidgets()
  const count = ready ? hidden.length : 0

  return (
    <>
      <HiddenWidgets />
      {(refreshed || count > 0) && (
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
          {refreshed && <span>Last full refresh {refreshed}</span>}
          {count > 0 && (
            <>
              {refreshed && <span aria-hidden>·</span>}
              {/* Duplicates the panel's own "Show all", on purpose: the panel
                  can be a scroll away once the dashboard is full, and this line
                  is where the eye lands last. */}
              <button
                type="button"
                onClick={showAll}
                className="font-semibold text-primary transition-opacity hover:opacity-80"
              >
                Show all {count} hidden widget{count === 1 ? "" : "s"}
              </button>
            </>
          )}
        </div>
      )}
    </>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SeoDashboardPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [projectId, setProjectId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const [overview, setOverview] = useState<OverviewResponse | null>(null)
  const [history, setHistory] = useState<TrafficPoint[]>([])
  // Measured movement from the backend. Null = the endpoint didn't report any,
  // which the card shows as "nothing comparable yet" rather than as four zeroes.
  const [movement, setMovement] = useState<ProjectOverviewResponse["movement"] | null>(null)
  const [range, setRange] = useState<Range>("30d")
  const [loadedProjects, setLoadedProjects] = useState(false)
  // null until the request settles — the setup card distinguishes "not
  // connected" from "we don't know yet" and shouldn't claim either early.
  const [gscConnected, setGscConnected] = useState<boolean | null>(null)
  // The Search Console GRANT is account-wide, but the property is linked per
  // project — so "connected" alone said nothing about whether THIS project has
  // data behind it, and every project claimed to be set up off one connection.
  const [gscSite, setGscSite] = useState<{ siteUrl: string | null; projectDomain: string } | null>(null)
  // A failed list request must not read as "you have no projects" — the two
  // states look identical otherwise, and the API does fail (quota, network).
  const [projectsError, setProjectsError] = useState<string | null>(null)
  const [rowsLoading, setRowsLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  // Creating a project no longer means leaving this page for the Rank Tracker.
  // The modal opens here, and the new project becomes the one on screen.
  const [showCreate, setShowCreate] = useState(false)
  // …unless the plan is already full. The Rank Tracker has always checked this
  // before opening the form; the Overview didn't, so its three entry points
  // walked a free user through naming a domain only to answer with the server's
  // 402 in a red box. Same check here, same upgrade popup.
  const [showLimit, setShowLimit] = useState(false)
  const { limit: projectLimit, atLimit } = useProjectLimit()
  // ProjectSwitcher fetches its own list, so it needs telling that the list
  // changed underneath it.
  const [switcherKey, setSwitcherKey] = useState(0)
  // Reported by the Site Audit card below, so the setup card can say "Crawling…"
  // without a second poller on the same endpoint.
  const [auditStatus, setAuditStatus] = useState<string | null>(null)
  // Creating a project auto-starts a keyword analysis server-side, so the
  // dashboard has to be able to say so rather than asking for keywords that are
  // already being found.
  const [keywordsAnalysing, setKeywordsAnalysing] = useState(false)

  // Every "Create SEO Project" affordance on this page routes through here, so
  // the header button, the empty state and the switcher's "New project" item
  // can't drift apart on which one checks the cap.
  const startCreate = useCallback(() => {
    if (atLimit(projects.length)) setShowLimit(true)
    else setShowCreate(true)
  }, [atLimit, projects.length])

  // Project list — fetched once; the switcher only changes which id we scope to.
  useEffect(() => {
    let cancelled = false
    api.get<ProjectSummary[]>("/api/projects")
      .then((list) => { if (!cancelled) { setProjects(list ?? []); setProjectsError(null) } })
      .catch((e: unknown) => {
        if (cancelled) return
        setProjects([])
        setProjectsError(e instanceof Error ? e.message : "Couldn't load your projects.")
      })
      .finally(() => { if (!cancelled) setLoadedProjects(true) })
    return () => { cancelled = true }
  }, [])

  // Whether Search Console is linked. Account-wide, so it's fetched once rather
  // than per project. A failure leaves it null: unknown, not disconnected.
  useEffect(() => {
    let cancelled = false
    api.get<{ connected: boolean }>("/api/gsc/connection")
      .then((r) => { if (!cancelled) setGscConnected(!!r?.connected) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  // Which Search Console property this project is pointed at, if any. Scoped to
  // the project, so switching projects re-asks rather than carrying the last
  // one's answer over.
  useEffect(() => {
    if (!projectId) { setGscSite(null); return }
    let cancelled = false
    setGscSite(null)
    api.get<{ siteUrl: string | null; projectDomain: string }>(`/api/gsc/projects/${projectId}/site`)
      .then((r) => { if (!cancelled && r) setGscSite(r) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [projectId])

  useEffect(() => {
    if (projectId === null && projects.length > 0) setProjectId(projects[0]!.id)
  }, [projects, projectId])

  const loadDetail = useCallback(async (id: string) => {
    try { return await api.get<ProjectDetail>(`/api/projects/${id}`) } catch { return null }
  }, [])

  // Keywords + domain metrics for the selected project.
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    setRowsLoading(true)
    void loadDetail(projectId).then((d) => {
      if (cancelled) return
      setDetail(d)
      setRowsLoading(false)
    })
    return () => { cancelled = true }
  }, [projectId, loadDetail])

  // No keywords yet. The setup card below owns the explanation (and the
  // analysis run); this page just keeps refetching so the moment keywords land
  // the dashboard fills in without a manual reload.
  const noKeywords = !!detail && detail.keywords.length === 0
  useEffect(() => {
    if (!noKeywords || !projectId) return
    const t = setInterval(() => { void loadDetail(projectId).then((d) => d && setDetail(d)) }, 5000)
    // Five minutes: an AI analysis plus its first rank checks routinely outlasts
    // the old 60s window, which stranded the page on stale zeroes.
    const stop = setTimeout(() => clearInterval(t), 5 * 60_000)
    return () => { clearInterval(t); clearTimeout(stop) }
  }, [noKeywords, projectId, loadDetail])

  // Bumped to force a refetch of everything on demand — after "Run a check"
  // queues a job, say — without duplicating the fetch logic.
  const [refreshTick, setRefreshTick] = useState(0)
  const refresh = useCallback(() => {
    setRefreshTick((n) => n + 1)
    if (projectId) void loadDetail(projectId).then((d) => d && setDetail(d))
  }, [projectId, loadDetail])

  // Coverage stats + the two time series, re-fetched whenever the range changes.
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    setStatsLoading(true)
    const scope = `projectId=${encodeURIComponent(projectId)}`
    void Promise.all([
      api.get<OverviewResponse>(`/api/overview?range=${range}&${scope}`).catch(() => null),
      api.get<ProjectOverviewResponse>(`/api/projects/${projectId}/overview?range=${range}`).catch(() => null),
    ]).then(([ov, proj]) => {
      if (cancelled) return
      setOverview(ov)
      setHistory(proj?.history ?? [])
      setMovement(proj?.movement ?? null)
      setStatsLoading(false)
    })
    return () => { cancelled = true }
  }, [projectId, range, refreshTick])

  // ── Derived metrics ───────────────────────────────────────────────────────
  const m = useMemo(() => {
    const kws = detail?.keywords ?? []
    const ranked = kws.filter((k) => k.position != null)
    const positions = ranked.map((k) => k.position as number)
    const totalVol = kws.reduce((s, k) => s + (k.searchVolume ?? 0), 0)

    const visNow = ranked.reduce((s, k) => s + ctr(k.position) * (k.searchVolume ?? 0), 0)
    // Unrounded on purpose — the card decides how to show it. Rounding to one
    // decimal here turned a real 0.0013% into a flat "0%", which sat next to an
    // average position of 2.5 and read as a broken number rather than a tiny one.
    const visibility = totalVol > 0 ? (visNow / totalVol) * 100 : 0

    // Where each keyword stood 7 days ago, reconstructed from its delta — the
    // basis for every "new"/"lost" figure below. A keyword whose reconstructed
    // position lands past 100 was outside the results then, which is how a band
    // can gain a keyword that has no earlier ranking at all.
    const prevPos = (k: Keyword): number | null =>
      k.position == null ? null : k.d7 != null ? (k.position as number) + k.d7 : (k.position as number)

    const inBand = (p: number | null, lo: number, hi: number) => p != null && p >= lo && p <= hi
    const movement = (lo: number, hi: number) => {
      const nowIds = new Set(kws.filter((k) => inBand(k.position, lo, hi)).map((k) => k.id))
      const beforeIds = new Set(kws.filter((k) => inBand(prevPos(k), lo, hi)).map((k) => k.id))
      let added = 0, lost = 0
      for (const id of nowIds) if (!beforeIds.has(id)) added++
      for (const id of beforeIds) if (!nowIds.has(id)) lost++
      return { count: nowIds.size, added, lost }
    }

    const share = (n: number) => (kws.length ? Math.round((n / kws.length) * 100) : 0)
    const bands: Band[] = BAND_DEFS.map((d) => {
      const mv = movement(d.lo, d.hi)
      return { label: d.label, count: mv.count, added: mv.added, lost: mv.lost, share: share(mv.count) }
    })
    // The remainder. Nothing "enters" or "leaves" it in the band sense — it's
    // everything the other four rows didn't claim — so its movement cells stay
    // blank rather than printing a zero that means something different.
    const unranked = kws.length - ranked.length
    bands.push({ label: "Unranked", count: unranked, added: null, lost: null, share: share(unranked), highlight: unranked > 0 })

    const kwVis = (k: Keyword) => (totalVol > 0 ? round1((ctr(k.position) * (k.searchVolume ?? 0) / totalVol) * 100) : 0)
    const toTop = (k: Keyword): TopKeyword => ({
      id: k.id,
      keyword: k.keyword,
      position: k.position,
      delta: k.d7,
      visibility: kwVis(k),
      volume: k.searchVolume,
      checked: !!k.checkedAt,
      latestAnalysisId: k.latestAnalysisId ?? null,
      // Same gate the keywords page applies to its "Rank #100+ → #1" button: a
      // keyword still being checked has no rank yet, so offering to take it "to
      // #1" would be promising against a number we haven't measured.
      canRank: k.position != null ? k.position > 1 : !!k.checkedAt,
    })
    // EVERY tracked keyword, not a top-N slice: Position Tracking splits these
    // into Winners/Losers tabs and shows a count on each, so a cap here would
    // make those counts lie. The list scrolls instead.
    //
    // Ranked first by the visibility each contributes, then the unranked by
    // search volume. Unranked used to be dropped entirely, so a project whose
    // keywords all sit past #100 showed "no ranked keywords yet" and hid every
    // keyword it was tracking.
    const topKeywords: TopKeyword[] = [
      ...ranked.sort((a, b) => kwVis(b) - kwVis(a) || (a.position ?? 999) - (b.position ?? 999)),
      ...kws.filter((k) => k.position == null).sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0)),
    ].map(toTop)

    // The SERP these positions actually came from. Location and device are per
    // keyword, so the card reports the dominant pair rather than asserting a
    // hardcoded market — and flags when the project spans several.
    const tally = (vals: (string | null)[], fallback: string) => {
      const counts = new Map<string, number>()
      for (const v of vals) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
      const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
      return {
        top: sorted[0]?.[0] ?? fallback,
        distinct: sorted.length,
        // Every distinct value, busiest first — the scope line names them all
        // rather than reporting a count nobody can expand.
        all: sorted.length ? sorted.map(([code]) => code) : [fallback],
      }
    }
    // Tally on a DISPLAY name, not the raw market key: below country level
    // `location` is a DataForSEO code ("1026201") and the scope pill would name
    // the market as that. The city segment alone is enough here — the full
    // "Austin,Texas,United States" is shown on the keyword itself.
    const loc = tally(
      kws.map((k) => (k.locationLabel ? k.locationLabel.split(",")[0] : k.location)),
      "us",
    )
    const dev = tally(kws.map((k) => k.device), "desktop")
    // How many markets are actually in play, not just whether it's >1: the scope
    // line says "+2 more" rather than silently naming the dominant one, which
    // read as a claim that every keyword was checked there.
    const locationCount = Math.max(1, loc.distinct)
    const deviceCount = Math.max(1, dev.distinct)

    return {
      scope: {
        location: loc.top,
        device: dev.top,
        mixed: loc.distinct > 1 || dev.distinct > 1,
        locationCount,
        deviceCount,
        locations: loc.all,
        devices: dev.all,
      },
      tracked: kws.length,
      ranked: ranked.length,
      estTraffic: kws.reduce((s, k) => s + (k.monthlyTraffic ?? 0), 0),
      avgPos: positions.length ? round1(positions.reduce((a, b) => a + b, 0) / positions.length) : null,
      visibility,
      bands,
      topKeywords,
      // Movement is NOT derived here any more — it comes measured from the
      // overview endpoint. Reconstructing it from each keyword's 7-day delta
      // could never see a keyword entering or leaving the top 100, because the
      // delta is null whenever either end was unranked: New and Lost could only
      // ever be 0. The band table above still uses the reconstruction, which is
      // sound there — it only compares ranked positions against each other.
    }
  }, [detail])

  const pagesNow = history.length ? history[history.length - 1]!.pages : 0
  const domain = detail?.domain ?? projects.find((p) => p.id === projectId)?.domain ?? ""
  // Account grant + this project's property, as one value. The two are fetched
  // separately because they answer different questions, but every consumer needs
  // both to say anything true about Search Console for THIS project.
  const gscState: GscState = {
    connected: gscConnected,
    siteUrl: gscSite?.siteUrl ?? null,
    projectDomain: gscSite?.projectDomain ?? domain ?? null,
  }
  const noProjects = loadedProjects && projects.length === 0 && !projectsError
  const refreshed = detail?.lastScheduledCheck
    ? new Date(detail.lastScheduledCheck).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : null

  return (
    <WidgetProvider defs={WIDGETS}>
      <div className="flex flex-col gap-4 px-6 pb-10 pt-5">
        {/* ── Header ──
            No breadcrumb here: the shell's top bar already carries one, and two
            stacked trails read as a mistake. The switcher supplies its own
            chevron AND its own open-in-new-tab link, so the heading adds
            neither — it only names the page. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <h1 className="flex min-w-0 items-center gap-2 text-[26px] font-bold leading-tight tracking-[-0.02em]">
            <span className="shrink-0">SEO Dashboard{domain ? ":" : ""}</span>
            <ProjectSwitcher
              value={projectId}
              onSelect={setProjectId}
              onNewProject={startCreate}
              refreshKey={switcherKey}
            />
          </h1>

          <div className="ml-auto flex shrink-0 items-center gap-2.5">
            <div className="inline-flex gap-0.5 rounded-[9px] bg-muted p-[3px]">
              {(["24h", "7d", "30d", "90d"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={
                    "rounded-[7px] px-2.5 py-[5px] text-[13px] transition-colors " +
                    (r === range
                      ? "bg-primary font-semibold text-primary-foreground"
                      : "font-medium text-muted-foreground hover:bg-border/60 hover:text-foreground")
                  }
                >
                  {r}
                </button>
              ))}
            </div>
            <Button
              className="h-[38px] gap-1.5 rounded-[9px] text-sm font-semibold"
              onClick={startCreate}
            >
              <Plus className="size-4" /> Create SEO Project
            </Button>
          </div>
        </div>

        {projectsError && loadedProjects && projects.length === 0 ? (
          <div className="grid place-items-center rounded-lg border border-destructive/30 bg-destructive/5 py-16 text-center">
            <div className="max-w-md px-4">
              <h2 className="text-base font-bold">Couldn&apos;t load your projects</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{projectsError}</p>
              <Button size="sm" variant="outline" className="mt-4" onClick={() => window.location.reload()}>Try again</Button>
            </div>
          </div>
        ) : noProjects ? (
          <div className="grid place-items-center rounded-lg border border-dashed py-20 text-center">
            <div className="max-w-sm">
              <h2 className="text-base font-bold">Add your first website</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">Create a project and FreeSERP starts tracking its keywords, crawling its pages and watching its AI-search visibility.</p>
              <Button size="sm" className="mt-4" onClick={startCreate}>Create SEO Project</Button>
            </div>
          </div>
        ) : !projectId ? (
          // The SAME placeholder grid the shell draws, so the hand-off from
          // "session loading" to "projects loading" is invisible. Two different
          // shapes here made one refresh look like two separate loads.
          <DashboardGridSkeleton />
        ) : (
          <>
            {/* Reports the REAL analysis run rather than asserting one exists —
                the old banner promised "this page fills in on its own" while
                nothing was actually running. */}
            {/* No autoStart: the analysis costs an AI credit and now announces
                itself in a dialog, so it asks before spending one rather than
                firing on page load and reporting it afterwards. */}
            {noKeywords && (
              <KeywordSetupCard projectId={projectId} domain={domain} onStatus={setKeywordsAnalysing} />
            )}

            {/* ── The five headline figures ── */}
            <StatStrip
              loading={rowsLoading}
              da={detail?.domainAuthority ?? null}
              backlinks={detail?.domainBacklinks ?? null}
              tracked={m.tracked}
              organicKeywords={m.ranked}
              estTraffic={m.estTraffic}
            />

            {/*
              ── The four main cards, in two independently-flowing columns ──

              These were two separate grid ROWS (Position Tracking | Site Audit,
              then Traffic Analytics | Keyword Movement). A row is only as short
              as its tallest card, so Position Tracking — with its keyword table
              and pagination — set a height the Site Audit card came nowhere near,
              and the second row couldn't start until that row ended. The result
              was hundreds of pixels of blank page under the audit before Keyword
              Movement appeared.

              One grid, two columns, each stacking its own cards: the wide column
              runs Position Tracking → Traffic Analytics, the narrow one runs
              Site Audit → Keyword Movement directly under it. The two sides no
              longer line up card-for-card, which is the point — nothing waits on
              a neighbour it has no relationship to.
            */}
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
              {/* Wide column. */}
              <div className="flex min-w-0 flex-col gap-4">
                <PositionTrackingCard
                  projectId={projectId}
                  loading={rowsLoading || statsLoading}
                  visibility={m.visibility}
                  avgPos={m.avgPos}
                  history={overview?.history ?? []}
                  bands={m.bands}
                  tracked={m.tracked}
                  ranked={m.ranked}
                  rangeLabel={RANGE_LABEL[range]}
                  rangeDays={RANGE_DAYS[range]}
                  // `history` (traffic) carries EVERY check day; overview.history
                  // only the days something ranked. The gap between the two is
                  // what the empty state needs to explain itself.
                  checkDays={history.length}
                  scope={m.scope}
                  keywords={m.topKeywords}
                />
              </div>

              {/* Narrow column. Both cards render their own <Widget>, so hiding
                  one just drops it out of the stack and the other moves up. */}
              <div className="flex min-w-0 flex-col gap-4">
                <SiteCrawlCard projectId={projectId} onStatus={setAuditStatus} />
                <KeywordMovementCard
                  projectId={projectId}
                  loading={statsLoading || rowsLoading}
                  // Straight from the backend's first-vs-last comparison. Falling
                  // back to zeroes-with-zero-comparable makes the card say "no
                  // basis to compare" rather than "nothing moved".
                  movements={movement ?? { improved: 0, declined: 0, added: 0, lost: 0, comparable: 0 }}
                  tracked={m.tracked}
                  rangeLabel={RANGE_LABEL[range]}
                />
              </div>
            </div>

            {/* Full width, below both columns. A time series is the one thing on
                this page that gets genuinely better with horizontal room: in the
                narrow column, 30 days of daily samples were compressed into a
                few hundred pixels and individual days were unreadable. It also
                has no partner card to sit beside, so pinning it to one column
                left the other half of the row blank. */}
            <TrafficCard
              projectId={projectId}
              loading={statsLoading}
              history={history}
              estTraffic={m.estTraffic}
              pages={pagesNow}
              domain={domain}
              rangeLabel={RANGE_LABEL[range]}
              rangeDays={RANGE_DAYS[range]}
              gsc={gscState}
            />

            {/* Last, under the data.
                This sat directly beneath the stat strip, which put a menu of
                twelve things to go and do between the five headline figures and
                the panels that explain them — the project's own numbers started
                below the fold on a laptop, behind an advert for the rest of the
                product. Somebody opening their dashboard came for the data.
                It keeps every word of its copy: down here it has the room to
                say what each tool is for, which is the point of promoting them
                at all, and it is the natural next thing to read once the
                numbers have been read. */}
            <SetupCard
              projectId={projectId}
              gsc={gscState}
              keywords={
                overview ? { total: overview.stats.totalKeywords, ranked: overview.stats.ranked } : null
              }
              auditRunning={auditStatus === "QUEUED" || auditStatus === "RUNNING"}
              keywordsAnalysing={keywordsAnalysing}
            />

            <DashboardFooter refreshed={refreshed} />
          </>
        )}

        {/* Created here, stays here: the new project is prepended to the list
            and selected, so the dashboard behind the modal is already showing it
            when the modal closes. It reaches the Rank Tracker by virtue of being
            the same /api/projects list. */}
        {showCreate && (
          <CreateProjectModal<ProjectSummary>
            onClose={() => setShowCreate(false)}
            onCreated={(p) => {
              setProjects((prev) => [p, ...prev])
              setProjectId(p.id)
              setSwitcherKey((k) => k + 1)
              setShowCreate(false)
            }}
            // The server owns the cap, so it can still refuse after the client
            // let the click through (usage hadn't resolved, or another tab
            // created a project first). Close the form — the 402 already fired
            // `billing:quota`, so the global QuotaUpsellModal is coming up with
            // the project-limit copy and shouldn't land on top of a half-filled
            // form showing the same message in red.
            onPlanLimit={() => setShowCreate(false)}
          />
        )}

        {showLimit && (
          <ProjectLimitModal
            limit={projectLimit}
            used={projects.length}
            onClose={() => setShowLimit(false)}
          />
        )}
      </div>
    </WidgetProvider>
  )
}
