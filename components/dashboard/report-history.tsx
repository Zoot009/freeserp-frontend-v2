"use client"

import { useEffect, useState } from "react"
import { Link } from "@/i18n/navigation"
import { api } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"
import { Favicon } from "@/components/favicon"

type Status = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"

export interface ReportRow {
  id: string
  title: string
  subtitle?: string
  domain: string
  status: Status
  createdAt: string
  href: string
}

const STATUS: Record<Status, { cls: string; label: string }> = {
  COMPLETED: { cls: "chip pos", label: "Ready" },
  FAILED: { cls: "chip neg", label: "Failed" },
  PROCESSING: { cls: "chip warn", label: "Analyzing" },
  PENDING: { cls: "chip outline", label: "Queued" },
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })

const ellipsis = { display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const

/**
 * A tool's past reports, newest first, from a list endpoint that returns
 * { analyses, nextCursor } — so a run stays reachable after you leave its
 * results page. Used by the competitor-analysis and internal-link tool pages.
 */
export function ReportHistory<T>({
  path,
  toRow,
  emptyText,
}: {
  path: string
  toRow: (item: T) => ReportRow
  emptyText: string
}) {
  const [rows, setRows] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const fetchPage = (cursor?: string) =>
    api.get<{ analyses?: T[]; nextCursor?: string }>(path, cursor ? { query: { cursor } } : undefined)

  useEffect(() => {
    let cancelled = false
    fetchPage()
      .then((d) => {
        if (cancelled) return
        setRows((d.analyses ?? []).map(toRow))
        setNextCursor(d.nextCursor ?? null)
      })
      .catch(() => { if (!cancelled) setFailed(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const d = await fetchPage(nextCursor)
      setRows((prev) => [...prev, ...(d.analyses ?? []).map(toRow)])
      setNextCursor(d.nextCursor ?? null)
    } catch {
      /* leave the button up to try again */
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", marginTop: 18 }}>
      <div className="card-h" style={{ padding: "14px 16px", marginBottom: 0, borderBottom: "1px solid var(--border)" }}>
        <div className="b">Recent reports</div>
      </div>

      {loading ? (
        <div style={{ padding: 36, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
          <span className="spin" style={{ display: "inline-flex", marginRight: 8 }}><Icon.refresh /></span> Loading…
        </div>
      ) : failed ? (
        <div className="tiny muted" style={{ padding: 36, textAlign: "center" }}>
          Couldn&apos;t load your past reports. Refresh the page to try again.
        </div>
      ) : rows.length === 0 ? (
        <div className="tiny muted" style={{ padding: 36, textAlign: "center" }}>{emptyText}</div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={r.href}
                className="list-row"
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "inherit", textDecoration: "none" }}
              >
                <Favicon domain={r.domain} size={28} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className="b" style={{ fontSize: 13, ...ellipsis }}>{r.title}</span>
                  {r.subtitle && <span className="tiny muted mono" style={ellipsis}>{r.subtitle}</span>}
                </span>
                {/* Status over date, stacked, so the title keeps its width on a phone. */}
                <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                  <span className={STATUS[r.status].cls}>{STATUS[r.status].label}</span>
                  <span className="tiny muted tabular">{fmtDate(r.createdAt)}</span>
                </span>
                <span style={{ flexShrink: 0, color: "var(--text-mute)" }}><Icon.chevR /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!loading && nextCursor && (
        <div style={{ padding: 12, display: "flex", justifyContent: "center" }}>
          <button type="button" className="btn sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? <><span className="spin" style={{ display: "inline-flex" }}><Icon.refresh /></span> Loading…</> : "Load more"}
          </button>
        </div>
      )}
    </div>
  )
}
