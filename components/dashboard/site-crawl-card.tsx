"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Bar, BarChart, Cell, Pie, PieChart, XAxis, YAxis } from "recharts"
import { api } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

type CrawledPage = {
  url: string
  title: string | null
  depth: number
  inbound: number
  outbound: number
  isOrphan: boolean
  isHub: boolean
  isAuthority: boolean
}

type SiteCrawl = {
  status: "NONE" | "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED"
  domain: string
  pagesFound?: number
  totalLinks?: number
  orphanPages?: number
  maxDepth?: number
  pages?: CrawledPage[]
  error?: string | null
}

// While the crawl runs the upstream job reports no incremental progress, so the
// card polls for a status flip rather than a percentage.
const POLL_MS = 5_000

const chartConfig = {
  pages: { label: "Pages" },
  hub: { label: "Hub", color: "var(--brand)" },
  authority: { label: "Authority", color: "var(--pos)" },
  orphan: { label: "Orphan", color: "var(--warn)" },
  normal: { label: "Standard", color: "var(--border-strong)" },
} satisfies ChartConfig

export function SiteCrawlCard({ projectId }: { projectId: string }) {
  const [crawl, setCrawl] = useState<SiteCrawl | null>(null)
  const [loading, setLoading] = useState(true)
  // Kept in a ref so the polling interval can read the latest status without
  // being torn down and recreated on every tick.
  const statusRef = useRef<SiteCrawl["status"] | null>(null)

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    setLoading(true)
    setCrawl(null)

    const load = async () => {
      try {
        const data = await api.get<SiteCrawl>(`/api/projects/${projectId}/site-crawl`)
        if (cancelled) return
        setCrawl(data)
        statusRef.current = data.status
      } catch {
        if (!cancelled) setCrawl(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    // Poll only while there's something to wait for; stop once terminal.
    const timer = setInterval(() => {
      if (statusRef.current === "QUEUED" || statusRef.current === "RUNNING") void load()
    }, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [projectId])

  const pages = useMemo(() => crawl?.pages ?? [], [crawl])

  // Composition: each page counted once, most specific role first, so the slices
  // sum to the page total instead of double-counting a hub that's also an
  // authority.
  const composition = useMemo(() => {
    let hub = 0, authority = 0, orphan = 0, normal = 0
    for (const p of pages) {
      if (p.isOrphan) orphan++
      else if (p.isHub) hub++
      else if (p.isAuthority) authority++
      else normal++
    }
    return [
      { key: "hub", label: "Hub", value: hub, fill: "var(--brand)" },
      { key: "authority", label: "Authority", value: authority, fill: "var(--pos)" },
      { key: "orphan", label: "Orphan", value: orphan, fill: "var(--warn)" },
      { key: "normal", label: "Standard", value: normal, fill: "var(--border-strong)" },
    ].filter((s) => s.value > 0)
  }, [pages])

  const byDepth = useMemo(() => {
    const counts = new Map<number, number>()
    for (const p of pages) counts.set(p.depth, (counts.get(p.depth) ?? 0) + 1)
    return [...counts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([depth, count]) => ({ depth: depth === 0 ? "Home" : `L${depth}`, pages: count }))
  }, [pages])

  if (loading) {
    return (
      <div className="card">
        <div className="card-h"><div className="t">Site crawl</div></div>
        <Skeleton className="h-48 w-full rounded-lg bg-muted/60" />
      </div>
    )
  }

  // No row at all (project predates the feature, or no API key configured) —
  // render nothing rather than an empty card promising data that isn't coming.
  if (!crawl || crawl.status === "NONE") return null

  const running = crawl.status === "QUEUED" || crawl.status === "RUNNING"

  return (
    <div className="card">
      <div className="card-h">
        <div>
          <div className="t">Site crawl</div>
          <div className="tiny muted" style={{ marginTop: 2 }}>
            {running
              ? "Collecting pages from your site"
              : crawl.status === "FAILED"
                ? "We couldn't finish crawling this site"
                : `${crawl.pagesFound ?? 0} pages · ${crawl.totalLinks ?? 0} internal links`}
          </div>
        </div>
      </div>

      {running ? (
        <div style={{ padding: "8px 0 4px" }}>
          <div className="tiny" style={{ marginBottom: 10, fontWeight: 500 }}>Crawling pages…</div>
          {/* Indeterminate bar: the upstream crawler doesn't report a percentage,
              so a moving stripe is honest where a progress bar would be a lie. */}
          <div
            aria-hidden
            style={{
              height: 8,
              borderRadius: 999,
              overflow: "hidden",
              background: "var(--bg-inset)",
              backgroundImage:
                "repeating-linear-gradient(45deg, var(--border) 0 10px, var(--bg-inset) 10px 20px)",
              backgroundSize: "28px 28px",
              animation: "fs-crawl-stripe 1s linear infinite",
            }}
          />
          <div className="tiny muted" style={{ marginTop: 10, lineHeight: 1.5 }}>
            This usually takes a few minutes. You can leave this page — we&apos;ll keep
            crawling in the background, and the full site data will be here when you
            come back.
          </div>

          {/* Pages discovered so far, faded so they read as provisional. Empty
              until the upstream job returns, which is why this is conditional
              rather than a fixed-height list of blanks. */}
          {pages.length > 0 && (
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
              {pages.slice(0, 6).map((p) => (
                <div
                  key={p.url}
                  className="tiny"
                  style={{
                    color: "var(--text-mute)",
                    opacity: 0.75,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={p.url}
                >
                  {p.title || p.url}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : crawl.status === "FAILED" ? (
        <div className="tiny muted" style={{ padding: "18px 0" }}>
          {crawl.error || "The crawl didn't complete. It'll retry on the next project update."}
        </div>
      ) : (
        <>
          <div className="grid g-2" style={{ gap: 16, alignItems: "center" }}>
            <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[200px]">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent nameKey="label" hideLabel />} />
                <Pie data={composition} dataKey="value" nameKey="label" innerRadius={52} strokeWidth={3}>
                  {composition.map((s) => (
                    <Cell key={s.key} fill={s.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>

            <ChartContainer config={chartConfig} className="max-h-[200px] w-full">
              <BarChart data={byDepth} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <XAxis dataKey="depth" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} width={32} fontSize={11} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Bar dataKey="pages" fill="var(--brand)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </div>

          <div className="row" style={{ gap: 14, flexWrap: "wrap", marginTop: 4 }}>
            {composition.map((s) => (
              <span key={s.key} className="row tiny muted" style={{ gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.fill }} />
                {s.label} <b style={{ color: "var(--text)" }}>{s.value}</b>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
