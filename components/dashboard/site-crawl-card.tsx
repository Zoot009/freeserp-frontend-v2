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

type AuditPage = {
  url: string
  title: string | null
  statusCode: number | null
  wordCount: number | null
  loadTime: number | null
  lcp: number | null
}

type AuditCategory = {
  category: string
  score: number
  grade?: string
  issueCount?: number
  passingCount?: number
}

type SiteAudit = {
  status: "NONE" | "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED"
  domain: string
  pagesFound?: number
  healthScore?: number | null
  grade?: string | null
  tier?: string | null
  totalIssues?: number
  totalPassing?: number
  issuesHigh?: number
  issuesMedium?: number
  issuesLow?: number
  categories?: AuditCategory[]
  pages?: AuditPage[]
  error?: string | null
}

// The upstream job reports no incremental progress, so this polls for a status
// flip rather than a percentage.
const POLL_MS = 8_000

const severityConfig = {
  high: { label: "High", color: "var(--neg)" },
  medium: { label: "Medium", color: "var(--warn)" },
  low: { label: "Low", color: "var(--border-strong)" },
} satisfies ChartConfig

const categoryConfig = { score: { label: "Score", color: "var(--brand)" } } satisfies ChartConfig

// TECHNICAL -> Technical, ON_PAGE -> On page
const prettyCategory = (c: string) =>
  c.replace(/_/g, " ").toLowerCase().replace(/^\w/, (m) => m.toUpperCase())

/** Health drives the colour: green is a pass, amber a warning, red a problem. */
function healthColor(score: number): string {
  if (score >= 80) return "var(--pos)"
  if (score >= 50) return "var(--warn)"
  return "var(--neg)"
}

export function SiteCrawlCard({ projectId }: { projectId: string }) {
  const [audit, setAudit] = useState<SiteAudit | null>(null)
  const [loading, setLoading] = useState(true)
  // In a ref so the interval reads the latest status without being torn down
  // and recreated every tick.
  const statusRef = useRef<SiteAudit["status"] | null>(null)

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    setLoading(true)
    setAudit(null)

    const load = async () => {
      try {
        const data = await api.get<SiteAudit>(`/api/projects/${projectId}/site-crawl`)
        if (cancelled) return
        setAudit(data)
        statusRef.current = data.status
      } catch {
        if (!cancelled) setAudit(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    const timer = setInterval(() => {
      if (statusRef.current === "QUEUED" || statusRef.current === "RUNNING") void load()
    }, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [projectId])

  const severity = useMemo(
    () =>
      [
        { key: "high", label: "High", value: audit?.issuesHigh ?? 0, fill: "var(--neg)" },
        { key: "medium", label: "Medium", value: audit?.issuesMedium ?? 0, fill: "var(--warn)" },
        { key: "low", label: "Low", value: audit?.issuesLow ?? 0, fill: "var(--border-strong)" },
      ].filter((s) => s.value > 0),
    [audit],
  )

  const categories = useMemo(
    () =>
      (audit?.categories ?? [])
        // Categories the audit couldn't assess come back as 0 — charting them
        // reads as "you scored zero" rather than "not measured".
        .filter((c) => c.score > 0)
        .map((c) => ({ name: prettyCategory(c.category), score: Math.round(c.score) })),
    [audit],
  )

  const brokenPages = useMemo(
    () => (audit?.pages ?? []).filter((p) => p.statusCode != null && p.statusCode >= 400),
    [audit],
  )

  if (loading) {
    return (
      <div className="card">
        <div className="card-h"><div className="t">Site audit</div></div>
        <Skeleton className="h-48 w-full rounded-lg bg-muted/60" />
      </div>
    )
  }

  // No row at all (project predates the feature, or no API key) — render nothing
  // rather than an empty card promising data that isn't coming.
  if (!audit || audit.status === "NONE") return null

  const running = audit.status === "QUEUED" || audit.status === "RUNNING"
  const health = audit.healthScore ?? null
  // Degraded: the audit couldn't run (site blocked it, or it timed out) and we
  // fell back to crawling for structure only. A COMPLETED row with no health
  // score means exactly that — the backend also leaves a reason in `error`.
  const degraded = audit.status === "COMPLETED" && health == null

  return (
    <div className="card">
      <div className="card-h">
        <div>
          <div className="t">Site audit</div>
          <div className="tiny muted" style={{ marginTop: 2 }}>
            {running
              ? "Auditing your site"
              : audit.status === "FAILED"
                ? "We couldn't crawl this website"
                : degraded
                  ? `${audit.pagesFound ?? 0} pages found · full audit unavailable`
                  : `${audit.pagesFound ?? 0} pages · ${audit.totalIssues ?? 0} issues · ${audit.totalPassing ?? 0} passing`}
          </div>
        </div>
      </div>

      {running ? (
        <div style={{ padding: "8px 0 4px" }}>
          <div className="tiny" style={{ marginBottom: 10, fontWeight: 500 }}>Crawling and auditing pages…</div>
          {/* Indeterminate: the upstream audit reports no percentage, so a moving
              stripe is honest where a progress bar would be a fiction. */}
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
            auditing in the background, and the full site report will be here when
            you come back.
          </div>
        </div>
      ) : audit.status === "FAILED" ? (
        <div className="tiny muted" style={{ padding: "18px 0", lineHeight: 1.5 }}>
          {audit.error ||
            "We couldn't crawl your website — it's blocking automated access, or the site is unreachable."}
        </div>
      ) : degraded ? (
        // Structure only: we reached the pages but couldn't score them, so the
        // page list is shown and the charts are omitted rather than drawn empty.
        <div style={{ padding: "4px 0" }}>
          <div className="tiny muted" style={{ marginBottom: 12, lineHeight: 1.5 }}>
            We reached your site but couldn&apos;t complete a full SEO audit — it may be
            blocking automated access. These are the pages we found.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(audit.pages ?? []).slice(0, 8).map((p) => (
              <div
                key={p.url}
                className="tiny"
                style={{ color: "var(--text-mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                title={p.url}
              >
                {p.title || p.url}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="grid g-2" style={{ gap: 16, alignItems: "center" }}>
            {/* Site health — the headline number, coloured by band. */}
            <div style={{ display: "grid", placeItems: "center", padding: "8px 0" }}>
              <div style={{ position: "relative", display: "grid", placeItems: "center" }}>
                <ChartContainer config={severityConfig} className="aspect-square h-[168px]">
                  <PieChart>
                    <Pie
                      data={[
                        { k: "score", v: health ?? 0, fill: health != null ? healthColor(health) : "var(--border)" },
                        { k: "rest", v: Math.max(0, 100 - (health ?? 0)), fill: "var(--bg-inset)" },
                      ]}
                      dataKey="v"
                      nameKey="k"
                      innerRadius={58}
                      outerRadius={78}
                      startAngle={90}
                      endAngle={-270}
                      strokeWidth={0}
                    >
                      <Cell fill={health != null ? healthColor(health) : "var(--border)"} />
                      <Cell fill="var(--bg-inset)" />
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div style={{ position: "absolute", textAlign: "center", pointerEvents: "none" }}>
                  <div style={{ fontSize: 26, fontWeight: 600, lineHeight: 1 }}>
                    {health != null ? Math.round(health) : "—"}
                    {health != null && <span style={{ fontSize: 14, opacity: 0.6 }}>%</span>}
                  </div>
                  <div className="tiny muted" style={{ marginTop: 4 }}>
                    Site health{audit.grade ? ` · ${audit.grade}` : ""}
                  </div>
                </div>
              </div>
            </div>

            {/* Issues by severity */}
            {severity.length > 0 ? (
              <ChartContainer config={severityConfig} className="mx-auto aspect-square max-h-[168px]">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent nameKey="label" hideLabel />} />
                  <Pie data={severity} dataKey="value" nameKey="label" innerRadius={46} strokeWidth={3}>
                    {severity.map((s) => (
                      <Cell key={s.key} fill={s.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            ) : (
              <div className="tiny muted" style={{ display: "grid", placeItems: "center", height: 168 }}>
                No issues found
              </div>
            )}
          </div>

          <div className="row" style={{ gap: 14, flexWrap: "wrap", marginTop: 2, marginBottom: 10 }}>
            {severity.map((s) => (
              <span key={s.key} className="row tiny muted" style={{ gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.fill }} />
                {s.label} <b style={{ color: "var(--text)" }}>{s.value}</b>
              </span>
            ))}
            {brokenPages.length > 0 && (
              <span className="row tiny" style={{ gap: 6, color: "var(--neg)" }}>
                <b>{brokenPages.length}</b> broken page{brokenPages.length === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {/* Score per audit category */}
          {categories.length > 0 && (
            <ChartContainer config={categoryConfig} className="max-h-[190px] w-full">
              <BarChart data={categories} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} interval={0} />
                <YAxis tickLine={false} axisLine={false} width={32} fontSize={11} domain={[0, 100]} />
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                  {categories.map((c) => (
                    <Cell key={c.name} fill={healthColor(c.score)} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </>
      )}
    </div>
  )
}
