"use client"

/**
 * Audit history — every audit this account has run.
 *
 * Server-side paged and filtered rather than fetching everything and slicing in
 * the browser: an account that audits daily accumulates hundreds of reports, and
 * the row a user wants is almost always found by typing part of the URL.
 */

import { useCallback, useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, ExternalLink, Search } from "lucide-react"
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
}

const PAGE_SIZE = 10

/** Bands match the report's own colour language, so a 74 reads the same in both. */
function scoreTone(score: number): string {
  if (score >= 80) return "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
  if (score >= 50) return "bg-amber-500/12 text-amber-600 dark:text-amber-400"
  return "bg-red-500/12 text-red-600 dark:text-red-400"
}

const hostOf = (raw: string) => {
  try {
    return new URL(raw).hostname.replace(/^www\./, "")
  } catch {
    return raw
  }
}

export function AuditHistory({ refreshKey = 0 }: { refreshKey?: number }) {
  const router = useRouter()
  const [items, setItems] = useState<AuditListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [q, setQ] = useState("")
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (pageIdx: number, query: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(pageIdx * PAGE_SIZE),
      })
      if (query.trim()) params.set("q", query.trim())
      const data = await api.get<{ items: AuditListItem[]; total: number }>(
        `/api/page-audit/reports?${params.toString()}`,
      )
      setItems(data.items ?? [])
      setTotal(data.total ?? 0)
    } catch {
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounced so typing a URL doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => void load(page, q), q ? 350 : 0)
    return () => clearTimeout(t)
  }, [load, page, q, refreshKey])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1
  const to = Math.min(total, (page + 1) * PAGE_SIZE)

  // Only a finished report has anything to show. Clicking a failed one would
  // land on an empty page, so the row stays inert and says why instead.
  const openable = (r: AuditListItem) => r.status === "COMPLETED"

  return (
    <section className="rounded-lg border bg-card shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b px-4 py-3.5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">History</p>
          <h2 className="mt-0.5 text-[15px] font-semibold leading-tight">
            All audits <span className="font-normal text-muted-foreground">({total})</span>
          </h2>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0) }}
            placeholder="Search by URL"
            className="pl-9"
          />
        </div>
      </div>

      <div className="grid grid-cols-[36px_minmax(0,1fr)_72px_64px_88px_28px] items-center gap-3 border-b px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>#</span>
        <span>Website</span>
        <span className="text-right">Score</span>
        <span className="text-right">Grade</span>
        <span className="text-right">When</span>
        <span />
      </div>

      {loading ? (
        <div className="space-y-px p-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 w-full rounded-md" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">
          {q ? `No audits match "${q}".` : "No audits yet — run one above and it'll appear here."}
        </p>
      ) : (
        items.map((r, i) => (
          <div
            key={r.id}
            role={openable(r) ? "button" : undefined}
            tabIndex={openable(r) ? 0 : undefined}
            onClick={() => openable(r) && router.push(`/dashboard/page-audit/${r.id}`)}
            onKeyDown={(e) => {
              if (openable(r) && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault()
                router.push(`/dashboard/page-audit/${r.id}`)
              }
            }}
            className={cn(
              "grid grid-cols-[36px_minmax(0,1fr)_72px_64px_88px_28px] items-center gap-3 border-b px-4 py-2.5 text-[13px] last:border-0",
              openable(r) ? "cursor-pointer transition-colors hover:bg-muted" : "opacity-70",
            )}
          >
            <span className="tabular-nums text-muted-foreground">{page * PAGE_SIZE + i + 1}</span>
            <div className="min-w-0">
              <div className="truncate font-semibold">{hostOf(r.url)}</div>
              <div className="truncate text-xs text-muted-foreground">{r.url}</div>
            </div>
            <span className="flex justify-end">
              {r.status === "COMPLETED" && r.overallScore != null ? (
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", scoreTone(r.overallScore))}>
                  {Math.round(r.overallScore)}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {r.status === "FAILED" ? "Failed" : "Running"}
                </span>
              )}
            </span>
            <span className={cn("text-right font-semibold", r.overallScore != null && r.overallScore >= 80 ? "text-emerald-600 dark:text-emerald-400" : r.overallScore != null && r.overallScore >= 50 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
              {r.overallGrade ?? "—"}
            </span>
            <span className="text-right text-xs text-muted-foreground">
              {new Date(r.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
            <span className="flex justify-end">
              {openable(r) && <ExternalLink className="size-3.5 text-muted-foreground" />}
            </span>
          </div>
        ))
      )}

      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs text-muted-foreground">
          <span className="tabular-nums">{from}–{to} of {total}</span>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" disabled={page === 0} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="size-3.5" /> Prev
            </Button>
            <span className="tabular-nums">{page + 1} / {pageCount}</span>
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>
              Next <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
