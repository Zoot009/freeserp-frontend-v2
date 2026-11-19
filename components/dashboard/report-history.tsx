"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Link } from "@/i18n/navigation"
import { api } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"
import { Favicon } from "@/components/favicon"
import { DemoChip } from "@/components/dashboard/demo-banner"
import { DEMO_BRAND } from "@/lib/demo/shared"

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

// Only the latest few: the list is a way back to recent runs, not an archive.
const RECENT_LIMIT = 5

/**
 * A tool's latest reports, newest first, from a list endpoint that returns
 * { analyses } — so a run stays reachable after you leave its results page.
 * Used by the competitor-analysis and internal-link tool pages.
 */
export function ReportHistory<T>({
  path,
  toRow,
  emptyText,
  demo,
}: {
  path: string
  toRow: (item: T) => ReportRow
  emptyText: string
  /** The tool's demo report, pinned first for everyone (.claude/skills/demo-report). */
  demo?: { title: string; subtitle?: string; domain?: string; href: string }
}) {
  const [rows, setRows] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.get<{ analyses?: T[] }>(path, { query: { limit: RECENT_LIMIT } })
      .then((d) => { if (!cancelled) setRows((d.analyses ?? []).slice(0, RECENT_LIMIT).map(toRow)) })
      .catch(() => { if (!cancelled) setFailed(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", marginTop: 18 }}>
      <div className="card-h" style={{ padding: "14px 16px", marginBottom: 0, borderBottom: "1px solid var(--border)" }}>
        <div className="b">Recent reports</div>
      </div>

      {demo && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          <RowLink
            href={demo.href}
            domain={demo.domain ?? DEMO_BRAND.domain}
            title={demo.title}
            subtitle={demo.subtitle}
            aside={<DemoChip />}
          />
        </ul>
      )}

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
            <RowLink
              key={r.id}
              href={r.href}
              domain={r.domain}
              title={r.title}
              subtitle={r.subtitle}
              aside={
                // Status over date, stacked, so the title keeps its width on a phone.
                <>
                  <span className={STATUS[r.status].cls}>{STATUS[r.status].label}</span>
                  <span className="tiny muted tabular">{fmtDate(r.createdAt)}</span>
                </>
              }
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function RowLink({ href, domain, title, subtitle, aside }: {
  href: string
  domain: string
  title: string
  subtitle?: string
  aside: ReactNode
}) {
  return (
    <li>
      <Link
        href={href}
        className="list-row"
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "inherit", textDecoration: "none" }}
      >
        <Favicon domain={domain} size={28} />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span className="b" style={{ fontSize: 13, ...ellipsis }}>{title}</span>
          {subtitle && <span className="tiny muted mono" style={ellipsis}>{subtitle}</span>}
        </span>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          {aside}
        </span>
        <span style={{ flexShrink: 0, color: "var(--text-mute)" }}><Icon.chevR /></span>
      </Link>
    </li>
  )
}
