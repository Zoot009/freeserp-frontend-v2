"use client"

/**
 * How a whole-site audit is meant to be read.
 *
 * The imported report renders one row per issue. That is fine for a single page
 * (~10 rows) and unusable for a site: the analyzer emits one row per page per
 * failing rule, so a 64-page crawl produced 267 rows for 23 distinct problems —
 * "Missing lang attribute" repeated 64 times — and a 500-page crawl would
 * produce thousands. Rendered flat that was a 28,000px wall.
 *
 * Two views instead:
 *
 *   By issue  one row per PROBLEM, with how many pages it affects. Expand to see
 *             which. 23 rows instead of 267.
 *   By page   every crawled page with its issue count, filterable by URL.
 *
 * Pagination sits in the header beside the tabs, matching the Search Console
 * table on the dashboard, so both tables in the product are read the same way.
 */

import { useCallback, useEffect, useState } from "react"
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Search } from "lucide-react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type Group = {
  type: string
  title: string
  description: string
  category: string
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  occurrences: number
  affectedPages: number
}

type AffectedPage = { id: string; pageUrl: string | null; description: string; elementSelector: string | null }
type PageRow = {
  id: string
  url: string
  title: string | null
  statusCode: number
  loadTime: number
  wordCount: number | null
  issueCount: number
}

const SEVERITY: Record<Group["severity"], { label: string; cls: string }> = {
  CRITICAL: { label: "Critical", cls: "bg-red-500/12 text-red-600 dark:text-red-400" },
  HIGH: { label: "High", cls: "bg-red-500/12 text-red-600 dark:text-red-400" },
  MEDIUM: { label: "Medium", cls: "bg-amber-500/12 text-amber-600 dark:text-amber-400" },
  LOW: { label: "Low", cls: "bg-slate-500/12 text-muted-foreground" },
}

/** Ten, as in the Search Console table this mirrors. */
const PAGE_SIZE = 10
/** The expanded "which pages" list can be long; give it more room per fetch. */
const NESTED_PAGE_SIZE = 20

const shortPath = (raw: string) => {
  try {
    const u = new URL(raw)
    return u.pathname === "/" ? "/" : `${u.pathname}${u.search}`
  } catch {
    return raw
  }
}

/** "1–10 of 23  ‹ ›" — the exact control the Search Console table uses. */
function Pager({
  page, total, pageSize, onPage,
}: {
  page: number
  total: number
  pageSize: number
  onPage: (p: number) => void
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="tabular-nums">
        {page * pageSize + 1}–{Math.min(total, (page + 1) * pageSize)} of {total}
      </span>
      <Button variant="outline" size="icon" className="size-7" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous page">
        <ChevronLeft className="size-3.5" />
      </Button>
      <Button variant="outline" size="icon" className="size-7" disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)} aria-label="Next page">
        <ChevronRight className="size-3.5" />
      </Button>
    </div>
  )
}

// ── Issues, grouped by problem ───────────────────────────────────────────────

/** The pages one problem affects — fetched only when its row is expanded. */
function AffectedPages({ reportId, type }: { reportId: string; type: string }) {
  const [items, setItems] = useState<AffectedPage[] | null>(null)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    let cancelled = false
    setItems(null)
    api
      .get<{ items: AffectedPage[]; total: number }>(
        `/api/page-audit/reports/${reportId}/issues/${encodeURIComponent(type)}/pages?limit=${NESTED_PAGE_SIZE}&offset=${page * NESTED_PAGE_SIZE}`,
      )
      .then((d) => { if (!cancelled) { setItems(d.items ?? []); setTotal(d.total ?? 0) } })
      .catch(() => { if (!cancelled) setItems([]) })
    return () => { cancelled = true }
  }, [reportId, type, page])

  return (
    <div className="bg-bg-inset px-4 pb-3 pl-11">
      {!items ? (
        <div className="space-y-1.5 py-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6 w-full rounded" />)}</div>
      ) : (
        <>
          <ul className="py-2">
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-2 border-b py-1.5 text-xs last:border-0">
                {i.pageUrl ? (
                  <a href={i.pageUrl} target="_blank" rel="noopener noreferrer" title={i.pageUrl} className="truncate text-primary hover:underline">
                    {shortPath(i.pageUrl)}
                  </a>
                ) : (
                  <span className="truncate text-muted-foreground">Site-wide</span>
                )}
                {i.elementSelector && <code className="ml-auto shrink-0 truncate text-[11px] text-muted-foreground">{i.elementSelector}</code>}
              </li>
            ))}
          </ul>
          <div className="flex justify-end pb-1">
            <Pager page={page} total={total} pageSize={NESTED_PAGE_SIZE} onPage={setPage} />
          </div>
        </>
      )}
    </div>
  )
}

// ── Shell ────────────────────────────────────────────────────────────────────

export function SiteIssues({
  reportId,
  pagesAnalyzed,
  totalIssues,
}: {
  reportId: string
  pagesAnalyzed: number
  totalIssues: number
}) {
  const [tab, setTab] = useState<"issues" | "pages">("issues")

  // Issues: the whole rollup is small (one row per problem, ~23), so it's
  // fetched once and paged in the browser. Paging this server-side would cost a
  // request per click for data already in hand.
  const [groups, setGroups] = useState<Group[] | null>(null)
  const [issuePage, setIssuePage] = useState(0)
  const [openType, setOpenType] = useState<string | null>(null)

  // Pages: server-paged and filtered — this one really is 500 rows.
  const [pages, setPages] = useState<PageRow[] | null>(null)
  const [pageTotal, setPageTotal] = useState(0)
  const [pagePage, setPagePage] = useState(0)
  const [q, setQ] = useState("")

  useEffect(() => {
    let cancelled = false
    api
      .get<{ groups: Group[] }>(`/api/page-audit/reports/${reportId}/issue-groups`)
      .then((d) => { if (!cancelled) setGroups(d.groups ?? []) })
      .catch(() => { if (!cancelled) setGroups([]) })
    return () => { cancelled = true }
  }, [reportId])

  const loadPages = useCallback(async (p: number, query: string) => {
    setPages(null)
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(p * PAGE_SIZE) })
    if (query.trim()) params.set("q", query.trim())
    try {
      const d = await api.get<{ items: PageRow[]; total: number }>(
        `/api/page-audit/reports/${reportId}/pages?${params.toString()}`,
      )
      setPages(d.items ?? [])
      setPageTotal(d.total ?? 0)
    } catch {
      setPages([])
      setPageTotal(0)
    }
  }, [reportId])

  useEffect(() => {
    if (tab !== "pages") return
    const t = setTimeout(() => void loadPages(pagePage, q), q ? 350 : 0)
    return () => clearTimeout(t)
  }, [tab, loadPages, pagePage, q])

  const groupSlice = (groups ?? []).slice(issuePage * PAGE_SIZE, issuePage * PAGE_SIZE + PAGE_SIZE)
  const GRID = "grid grid-cols-[minmax(0,1fr)_64px_72px_72px] items-center gap-3"

  return (
    <section id="sec-rec" className="scroll-mt-32 overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="border-b px-4 py-3">
        <h2 className="text-[15px] font-semibold leading-tight">Site audit</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {pagesAnalyzed.toLocaleString()} pages crawled · {totalIssues.toLocaleString()} issues found
        </p>
      </div>

      {/* Tabs left with their counts, pager right — the Search Console layout. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="inline-flex gap-0.5 rounded-[9px] bg-muted p-[3px]">
          <button
            type="button"
            onClick={() => setTab("issues")}
            className={cn(
              "rounded-[7px] px-2.5 py-[5px] text-[13px] transition-colors",
              tab === "issues" ? "bg-card font-semibold shadow-sm" : "font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            By issue <span className="tabular-nums opacity-60">{groups?.length ?? 0}</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("pages")}
            className={cn(
              "rounded-[7px] px-2.5 py-[5px] text-[13px] transition-colors",
              tab === "pages" ? "bg-card font-semibold shadow-sm" : "font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            By page <span className="tabular-nums opacity-60">{pagesAnalyzed}</span>
          </button>
        </div>

        {tab === "issues" ? (
          <Pager page={issuePage} total={groups?.length ?? 0} pageSize={PAGE_SIZE} onPage={(p) => { setIssuePage(p); setOpenType(null) }} />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-[13rem]">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => { setQ(e.target.value); setPagePage(0) }} placeholder="Filter by URL" className="h-8 pl-9 text-[13px]" />
            </div>
            <Pager page={pagePage} total={pageTotal} pageSize={PAGE_SIZE} onPage={setPagePage} />
          </div>
        )}
      </div>

      {tab === "issues" ? (
        !groups ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}</div>
        ) : groups.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">No issues found across this site.</p>
        ) : (
          groupSlice.map((g) => {
            const sev = SEVERITY[g.severity] ?? SEVERITY.LOW
            const isOpen = openType === g.type
            return (
              <div key={g.type} className="border-b last:border-0">
                <button
                  type="button"
                  onClick={() => setOpenType(isOpen ? null : g.type)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted"
                >
                  <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", sev.cls)}>{sev.label}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{g.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{g.description}</span>
                  </span>
                  {/* The number that makes this view worth having: one problem, N pages. */}
                  <span className="shrink-0 text-right">
                    <span className="block text-[13px] font-semibold tabular-nums">{g.affectedPages.toLocaleString()}</span>
                    <span className="block text-[11px] text-muted-foreground">{g.affectedPages === 1 ? "page" : "pages"}</span>
                  </span>
                </button>
                {isOpen && <AffectedPages reportId={reportId} type={g.type} />}
              </div>
            )
          })
        )
      ) : (
        <>
          <div className={cn(GRID, "border-b px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground")}>
            <span>Page</span>
            <span className="text-right">Status</span>
            <span className="text-right">Issues</span>
            <span className="text-right">Words</span>
          </div>
          {!pages ? (
            <div className="space-y-1.5 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full rounded" />)}</div>
          ) : pages.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">
              {q ? `No pages match "${q}".` : "No pages recorded."}
            </p>
          ) : (
            pages.map((p) => (
              <div key={p.id} className={cn(GRID, "border-b px-4 py-2 text-[13px] last:border-0")}>
                <div className="min-w-0">
                  <a href={p.url} target="_blank" rel="noopener noreferrer" title={p.url} className="flex items-center gap-1 truncate font-medium text-primary hover:underline">
                    {shortPath(p.url)} <ExternalLink className="size-3 shrink-0" />
                  </a>
                  {p.title && <span className="block truncate text-xs text-muted-foreground">{p.title}</span>}
                </div>
                <span className={cn("text-right tabular-nums", p.statusCode >= 400 ? "font-semibold text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                  {p.statusCode}
                </span>
                <span className={cn("text-right font-semibold tabular-nums", p.issueCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                  {p.issueCount}
                </span>
                <span className="text-right tabular-nums text-muted-foreground">{p.wordCount?.toLocaleString() ?? "—"}</span>
              </div>
            ))
          )}
        </>
      )}
    </section>
  )
}
