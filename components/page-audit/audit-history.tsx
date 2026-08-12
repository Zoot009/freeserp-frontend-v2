"use client"

/**
 * Audit history — every audit this account has run.
 *
 * Server-side paged and filtered rather than fetching everything and slicing in
 * the browser: an account that audits daily accumulates hundreds of reports, and
 * the row a user wants is almost always found by typing part of the URL.
 *
 * Two views over the same history. "Sites" collapses runs by domain, which is
 * the question someone auditing the same handful of domains repeatedly actually
 * has — three freeserp.com rows scattered down a paginated list are three
 * unconnected numbers, but collapsed they are a trend. "Runs" is the flat log,
 * for when you want a specific audit.
 */

import { useCallback, useEffect, useState } from "react"
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Search,
} from "lucide-react"
import { useRouter } from "@/i18n/navigation"
import { api } from "@/lib/api"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export type AuditListItem = {
  id: string
  url: string
  mode: "SINGLE" | "SITE"
  status: "PROCESSING" | "COMPLETED" | "FAILED"
  overallScore: number | null
  overallGrade: string | null
  pagesAnalyzed: number
  shareToken: string | null
  createdAt: string
  /** Why a FAILED audit failed. Null on anything that didn't fail. */
  errorMessage?: string | null
  /** How much is left to fix. Counted server-side per page of results. */
  issueCount?: number
  criticalCount?: number
}

/** One domain's history, collapsed. */
type SiteGroup = {
  host: string
  audits: number
  latest: AuditListItem
  /** Oldest → newest, scored runs only. */
  series: Array<{ score: number; at: string }>
  /** Latest scored run minus the one before it; null with nothing to compare. */
  trend: number | null
}

const PAGE_SIZE = 10

/**
 * One column template for both views, so the header lines up either way and
 * switching doesn't shift the table under the reader.
 */
const COLS = "grid-cols-[32px_minmax(0,1fr)_72px_116px_52px_80px_28px]"

/** Bands match the report's own colour language, so a 74 reads the same in both. */
function scoreTone(score: number): string {
  if (score >= 80) return "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
  if (score >= 50) return "bg-amber-500/12 text-amber-600 dark:text-amber-400"
  return "bg-red-500/12 text-red-600 dark:text-red-400"
}

function gradeTone(score: number | null): string {
  if (score == null) return "text-muted-foreground"
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400"
  if (score >= 50) return "text-amber-600 dark:text-amber-400"
  return "text-muted-foreground"
}

const hostOf = (raw: string) => {
  try {
    return new URL(raw).hostname.replace(/^www\./, "")
  } catch {
    return raw
  }
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })

/**
 * The site's favicon, over a letter tile.
 *
 * Resolved through a lookup service rather than from the site itself: an icon
 * can live at any of several places (/favicon.ico, a <link rel="icon">, the web
 * manifest), so doing it properly would mean parsing each site from the browser
 * — one request per row, on domains that a failed audit has already shown may
 * serve nothing at all.
 *
 * DuckDuckGo's, not Google's, on measured results against this app's own audit
 * history: Google's s2 service answered 404-plus-generic-globe for several live
 * domains that DuckDuckGo returned the real icon for. It also returns an empty
 * body for a domain with no icon at all, which trips onError below and leaves
 * the letter showing — cleaner than painting a grey globe on every such row.
 *
 * The letter tile sits underneath rather than replacing the image, so a row
 * reads as itself while the icon loads and keeps reading as itself if the icon
 * never arrives. No layout shift either way.
 *
 * Worth knowing: this tells DuckDuckGo which domains an account has audited.
 */
function SiteFavicon({ host, lookUp = true }: { host: string; lookUp?: boolean }) {
  const [failed, setFailed] = useState(false)

  return (
    <span
      className="relative flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-muted/50 font-mono text-[11px] font-bold text-foreground/60"
      aria-hidden
    >
      {host.charAt(0).toUpperCase()}
      {lookUp && !failed && (
        // eslint-disable-next-line @next/next/no-img-element -- a 28px icon gains
        // nothing from the image optimizer, and next/image would need the favicon
        // host allow-listed in next.config.
        <img
          src={`https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full bg-background object-contain p-1"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  )
}

/**
 * Score history as a single glyph.
 *
 * Scaled to the series' own min/max, not 0-100: the interesting movement is
 * usually a few points, and against a fixed 0-100 axis every site would draw
 * the same flat line. The tradeoff is that height is only comparable within one
 * row, which is why the number and the delta sit next to it.
 */
function Sparkline({ points, trend }: { points: number[]; trend: number | null }) {
  if (points.length < 2) return null

  const w = 54
  const h = 16
  const pad = 2
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const step = (w - pad * 2) / (points.length - 1)
  const d = points
    .map((p, i) => `${pad + i * step},${pad + (h - pad * 2) * (1 - (p - min) / span)}`)
    .join(" ")

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden
      className={cn(
        "shrink-0",
        trend == null || trend === 0
          ? "text-muted-foreground/50"
          : trend > 0
            ? "text-emerald-500"
            : "text-red-500",
      )}
    >
      <polyline
        points={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** "+8" / "-3", or nothing when there is no earlier run to compare against. */
function TrendTag({ trend }: { trend: number | null }) {
  if (trend == null || trend === 0) return null
  return (
    <span
      className={cn(
        "shrink-0 text-[11px] font-semibold tabular-nums",
        trend > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
      )}
      title={`${trend > 0 ? "Up" : "Down"} ${Math.abs(trend)} since the previous audit`}
    >
      {trend > 0 ? `+${trend}` : trend}
    </span>
  )
}

/**
 * How much is left to fix.
 *
 * The score says how bad, this says how much work — the two are not the same,
 * and without it the only way to find out was to open the report. Tinted when
 * any of them are critical, because thirty trivial issues and three critical
 * ones are not the same afternoon.
 */
function IssuesCell({ r }: { r: AuditListItem }) {
  if (r.status !== "COMPLETED" || r.issueCount == null) {
    return <span className="text-right text-xs text-muted-foreground/50">—</span>
  }
  const critical = r.criticalCount ?? 0
  return (
    <span
      className={cn(
        "text-right text-xs tabular-nums",
        critical > 0 ? "font-semibold text-red-600 dark:text-red-400" : "text-muted-foreground",
      )}
      title={
        critical > 0
          ? `${r.issueCount} issues, ${critical} critical`
          : `${r.issueCount} issues`
      }
    >
      {r.issueCount}
    </span>
  )
}

/**
 * How much of the site a score covers, as a page count.
 *
 * A count rather than a "Single page" / "Whole site" badge: the badge said
 * "Single page" on nine rows out of ten, a label repeated so often it stops
 * carrying information while still taking the space of something that does.
 * The number is the part that differs — and it is what makes two scores
 * comparable, since a 76 across 64 pages means something a 76 across one page
 * does not.
 *
 * Null when there is nothing to state: a failed run analysed no pages, and "0
 * pages" next to "No such domain" is just noise.
 */
function pagesLabel(r: AuditListItem): string | null {
  if (r.status === "FAILED" || r.pagesAnalyzed < 1) return null
  return r.pagesAnalyzed === 1 ? "1 page" : `${r.pagesAnalyzed} pages`
}

/**
 * A failure, in two or three words.
 *
 * "Failed" on its own tells the reader nothing they can act on, and the full
 * message is a sentence too long for a table cell — so the cell gets the short
 * form and the full text stays in the tooltip.
 *
 * Matches the raw net:: codes as well as the sentences the worker now writes,
 * because reports audited before that change stored the unformatted Chromium
 * error and should still read correctly here.
 */
function failureLabel(msg?: string | null): string {
  if (!msg) return "Failed"
  if (/no domain named|ERR_NAME_NOT_RESOLVED|ERR_NAME_RESOLUTION_FAILED|ENOTFOUND/i.test(msg)) {
    return "No such domain"
  }
  if (/refused the connection|ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ECONNREFUSED/i.test(msg)) {
    return "Unreachable"
  }
  if (/didn't respond in time|ERR_CONNECTION_TIMED_OUT|ETIMEDOUT|Timeout/i.test(msg)) {
    return "Timed out"
  }
  if (/invalid HTTPS certificate|ERR_CERT_|ERR_SSL_/i.test(msg)) return "Bad certificate"
  return "Failed"
}

/** Score badge, or why there isn't one. Shared by both views. */
function ScoreCell({ r }: { r: AuditListItem }) {
  if (r.status === "COMPLETED" && r.overallScore != null) {
    return (
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
          scoreTone(r.overallScore),
        )}
      >
        {Math.round(r.overallScore)}
      </span>
    )
  }
  return (
    <span
      className="whitespace-nowrap text-xs text-muted-foreground"
      title={r.status === "FAILED" ? r.errorMessage ?? undefined : undefined}
    >
      {r.status === "FAILED" ? failureLabel(r.errorMessage) : "Running"}
    </span>
  )
}

export function AuditHistory({
  refreshKey = 0,
  mode,
}: {
  refreshKey?: number
  /**
   * Which tab the page is on. The history shows that kind of audit only —
   * a single-page score and a whole-site score answer different questions, and
   * interleaving them in one list made the table impossible to read down.
   */
  mode?: "single" | "site"
}) {
  const router = useRouter()
  const [view, setView] = useState<"sites" | "runs">("sites")
  const [items, setItems] = useState<AuditListItem[]>([])
  const [groups, setGroups] = useState<SiteGroup[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [q, setQ] = useState("")
  const [loading, setLoading] = useState(true)

  // Runs belonging to an expanded site, keyed by host. Fetched on demand: a
  // grouped list of 7 sites should not pay for every run behind all of them.
  const [openHost, setOpenHost] = useState<string | null>(null)
  const [runsByHost, setRunsByHost] = useState<Record<string, AuditListItem[]>>({})

  const load = useCallback(
    async (pageIdx: number, query: string, kind: "single" | "site" | undefined, grouped: boolean) => {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(pageIdx * PAGE_SIZE),
        })
        if (query.trim()) params.set("q", query.trim())
        if (kind) params.set("mode", kind)

        if (grouped) {
          const data = await api.get<{ items: SiteGroup[]; total: number }>(
            `/api/page-audit/reports/grouped?${params.toString()}`,
          )
          setGroups(data.items ?? [])
          setTotal(data.total ?? 0)
        } else {
          const data = await api.get<{ items: AuditListItem[]; total: number }>(
            `/api/page-audit/reports?${params.toString()}`,
          )
          setItems(data.items ?? [])
          setTotal(data.total ?? 0)
        }
      } catch {
        setGroups([])
        setItems([])
        setTotal(0)
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  // Switching tabs or views re-filters from the top. Staying on page 3 after
  // switching would ask for an offset the shorter list may not reach, and
  // answer with an empty table.
  useEffect(() => {
    setPage(0)
    setOpenHost(null)
  }, [mode, view])

  // Debounced so typing a URL doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => void load(page, q, mode, view === "sites"), q ? 350 : 0)
    return () => clearTimeout(t)
  }, [load, page, q, mode, view, refreshKey])

  /**
   * A site's individual runs, on expand.
   *
   * Reuses the flat endpoint with the host as the URL filter rather than adding
   * a per-site route — `q` is already a substring match on the audited URL,
   * which is exactly this query.
   */
  const toggleHost = useCallback(
    async (host: string) => {
      if (openHost === host) {
        setOpenHost(null)
        return
      }
      setOpenHost(host)
      if (runsByHost[host]) return
      try {
        const params = new URLSearchParams({ limit: "50", offset: "0", q: host })
        if (mode) params.set("mode", mode)
        const data = await api.get<{ items: AuditListItem[] }>(
          `/api/page-audit/reports?${params.toString()}`,
        )
        // `q` is a substring match on the URL, so it narrows but doesn't pin:
        // expanding "serp.com" would otherwise also pull in freeserp.com's runs.
        // Match the host exactly, the same way the group was keyed.
        const exact = (data.items ?? []).filter((r) => hostOf(r.url) === host)
        setRunsByHost((prev) => ({ ...prev, [host]: exact }))
      } catch {
        setRunsByHost((prev) => ({ ...prev, [host]: [] }))
      }
    },
    [openHost, runsByHost, mode],
  )

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1
  const to = Math.min(total, (page + 1) * PAGE_SIZE)

  // Only a finished report has anything to show. Clicking a failed one would
  // land on an empty page, so the row stays inert and says why instead.
  const openable = (r: AuditListItem) => r.status === "COMPLETED"
  const open = (r: AuditListItem) => router.push(`/dashboard/page-audit/${r.id}`)

  const heading =
    view === "sites"
      ? "Sites audited"
      : mode === "site"
        ? "Whole-site audits"
        : mode === "single"
          ? "Single-page audits"
          : "All audits"

  return (
    <section className="rounded-lg border bg-card shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b px-4 py-3.5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            History
          </p>
          <h2 className="mt-0.5 text-[15px] font-semibold leading-tight">
            {/* Named for what is actually on screen. "All audits (3)" over a
                filtered or grouped list misreports how much history exists. */}
            {heading} <span className="font-normal text-muted-foreground">({total})</span>
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-[7px] bg-muted p-0.5">
            {(["sites", "runs"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  "rounded-[5px] px-2.5 py-1 text-xs transition-colors",
                  view === v
                    ? "bg-background font-semibold text-foreground shadow-sm"
                    : "font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                {v === "sites" ? "By site" : "Every run"}
              </button>
            ))}
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setPage(0)
              }}
              placeholder="Search by URL"
              className="pl-9"
            />
          </div>
        </div>
      </div>

      <div
        className={cn(
          "grid items-center gap-3 border-b px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
          COLS,
        )}
      >
        <span>#</span>
        <span>{view === "sites" ? "Site" : "Website"}</span>
        <span className="text-right">Issues</span>
        <span className="text-right">Score</span>
        <span className="text-right">Grade</span>
        <span className="text-right">{view === "sites" ? "Last run" : "When"}</span>
        <span />
      </div>

      {loading ? (
        <div className="space-y-px p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-md" />
          ))}
        </div>
      ) : (view === "sites" ? groups.length : items.length) === 0 ? (
        <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">
          {q
            ? `No audits match "${q}".`
            : mode === "site"
              ? "No whole-site audits yet — run one above and it'll appear here."
              : mode === "single"
                ? "No single-page audits yet — run one above and it'll appear here."
                : "No audits yet — run one above and it'll appear here."}
        </p>
      ) : view === "sites" ? (
        groups.map((g, i) => {
          const expanded = openHost === g.host
          const runs = runsByHost[g.host]
          return (
            <div key={g.host} className="border-b last:border-0">
              <div
                role="button"
                tabIndex={0}
                onClick={() => void toggleHost(g.host)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    void toggleHost(g.host)
                  }
                }}
                className={cn(
                  "grid cursor-pointer items-center gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-muted",
                  COLS,
                )}
              >
                <span className="tabular-nums text-muted-foreground">
                  {page * PAGE_SIZE + i + 1}
                </span>
                <div className="flex min-w-0 items-center gap-2.5">
                  <SiteFavicon host={g.host} lookUp={g.latest.status !== "FAILED"} />
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate font-semibold">{g.host}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {g.audits === 1 ? "1 audit" : `${g.audits} audits`}
                      </span>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{g.latest.url}</div>
                  </div>
                  <Sparkline points={g.series.map((p) => p.score)} trend={g.trend} />
                </div>
                <IssuesCell r={g.latest} />
                <span className="flex items-center justify-end gap-1.5">
                  <TrendTag trend={g.trend} />
                  <ScoreCell r={g.latest} />
                </span>
                <span className={cn("text-right font-semibold", gradeTone(g.latest.overallScore))}>
                  {g.latest.overallGrade ?? "—"}
                </span>
                <span className="text-right text-xs text-muted-foreground">
                  {shortDate(g.latest.createdAt)}
                </span>
                <span className="flex justify-end">
                  <ChevronDown
                    className={cn(
                      "size-4 text-muted-foreground transition-transform",
                      expanded && "rotate-180",
                    )}
                  />
                </span>
              </div>

              {expanded && (
                <div className="bg-muted/30 px-4 pb-2">
                  {!runs ? (
                    <div className="space-y-1 py-2">
                      <Skeleton className="h-8 w-full rounded-md" />
                      <Skeleton className="h-8 w-full rounded-md" />
                    </div>
                  ) : runs.length === 0 ? (
                    <p className="py-3 text-center text-xs text-muted-foreground">
                      Couldn&apos;t load this site&apos;s runs.
                    </p>
                  ) : (
                    runs.map((r) => (
                      <div
                        key={r.id}
                        role={openable(r) ? "button" : undefined}
                        tabIndex={openable(r) ? 0 : undefined}
                        onClick={() => openable(r) && open(r)}
                        onKeyDown={(e) => {
                          if (openable(r) && (e.key === "Enter" || e.key === " ")) {
                            e.preventDefault()
                            open(r)
                          }
                        }}
                        className={cn(
                          "grid items-center gap-3 rounded-md py-1.5 text-[13px]",
                          COLS,
                          openable(r)
                            ? "cursor-pointer transition-colors hover:bg-background"
                            : "opacity-70",
                        )}
                      >
                        <span />
                        <div className="flex min-w-0 items-baseline gap-2 pl-9">
                          <span className="truncate text-xs text-muted-foreground">
                            {shortDate(r.createdAt)}
                          </span>
                          {pagesLabel(r) && (
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground/70">
                              {pagesLabel(r)}
                            </span>
                          )}
                        </div>
                        <IssuesCell r={r} />
                        <span className="flex justify-end">
                          <ScoreCell r={r} />
                        </span>
                        <span
                          className={cn("text-right font-semibold", gradeTone(r.overallScore))}
                        >
                          {r.overallGrade ?? "—"}
                        </span>
                        <span />
                        <span className="flex justify-end">
                          {openable(r) && (
                            <ExternalLink className="size-3.5 text-muted-foreground" />
                          )}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )
        })
      ) : (
        items.map((r, i) => (
          <div
            key={r.id}
            role={openable(r) ? "button" : undefined}
            tabIndex={openable(r) ? 0 : undefined}
            onClick={() => openable(r) && open(r)}
            onKeyDown={(e) => {
              if (openable(r) && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault()
                open(r)
              }
            }}
            className={cn(
              "grid items-center gap-3 border-b px-4 py-2.5 text-[13px] last:border-0",
              COLS,
              openable(r) ? "cursor-pointer transition-colors hover:bg-muted" : "opacity-70",
            )}
          >
            <span className="tabular-nums text-muted-foreground">
              {page * PAGE_SIZE + i + 1}
            </span>
            {/* Favicon inside the website cell, not as its own grid column, so
                the header row's alignment is untouched. */}
            <div className="flex min-w-0 items-center gap-2.5">
              {/* No icon lookup for a failed audit. The lookup service answers a
                  generic globe for a domain it can't resolve, which on a row that
                  failed BECAUSE the domain doesn't exist reads as though the site
                  is fine. The letter tile alone is honest. */}
              <SiteFavicon host={hostOf(r.url)} lookUp={r.status !== "FAILED"} />
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="truncate font-semibold">{hostOf(r.url)}</span>
                  {pagesLabel(r) && (
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {pagesLabel(r)}
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">{r.url}</div>
              </div>
            </div>
            <IssuesCell r={r} />
            <span className="flex justify-end">
              <ScoreCell r={r} />
            </span>
            <span className={cn("text-right font-semibold", gradeTone(r.overallScore))}>
              {r.overallGrade ?? "—"}
            </span>
            <span className="text-right text-xs text-muted-foreground">
              {shortDate(r.createdAt)}
            </span>
            <span className="flex justify-end">
              {openable(r) && <ExternalLink className="size-3.5 text-muted-foreground" />}
            </span>
          </div>
        ))
      )}

      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {from}–{to} of {total}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="size-3.5" /> Prev
            </Button>
            <span className="tabular-nums">
              {page + 1} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              disabled={page >= pageCount - 1}
              onClick={() => setPage(page + 1)}
            >
              Next <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
