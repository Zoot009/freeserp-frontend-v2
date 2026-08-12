"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "@/i18n/navigation"
import { api } from "@/lib/api"
import { Loader2, ExternalLink, ArrowUp, ArrowDown, Minus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SeoSummary } from "@/components/dashboard/seo-summary"

// ── Types (subset of the project detail) ──
type Kw = {
  id: string
  keyword: string
  position: number | null
  firstPosition: number | null
  d7: number | null
  url: string | null
  monthlyTraffic: number | null
  searchVolume: number | null
  searchVolumeTrend: { year: number; month: number; searchVolume: number }[] | null
  serpFeatures: Record<string, unknown> | null
}
type ProjectDetail = {
  id: string
  name: string
  domain: string
  domainAuthority: number | null
  domainBacklinks: number | null
  lastScheduledCheck?: string | null
  keywords: Kw[]
}

// CTR-by-position curve → volume-weighted "visibility".
function ctr(pos: number | null): number {
  if (pos == null) return 0
  const c = [0.317, 0.247, 0.187, 0.133, 0.095, 0.068, 0.049, 0.037, 0.029, 0.024]
  if (pos <= 10) return c[Math.ceil(pos) - 1] ?? 0.024
  if (pos <= 20) return 0.012
  if (pos <= 50) return 0.005
  if (pos <= 100) return 0.002
  return 0
}
const nf = (n: number) => n.toLocaleString()
const round1 = (n: number) => Math.round(n * 10) / 10
const SERP_LABELS: Record<string, string> = {
  featuredSnippet: "Featured snippet", peopleAlsoAsk: "People also ask", knowledgeGraph: "Knowledge graph",
  relatedSearches: "Related searches", localPack: "Local pack", imagePack: "Image pack", videoPack: "Video pack", aiOverview: "AI overview",
}

function Delta({ v }: { v: number | null | undefined }) {
  if (v == null || v === 0) return <span className="inline-flex items-center gap-0.5 text-muted-foreground"><Minus className="size-3" /></span>
  return v > 0
    ? <span className="inline-flex items-center gap-0.5 font-medium text-emerald-600"><ArrowUp className="size-3" />{Math.abs(v)}</span>
    : <span className="inline-flex items-center gap-0.5 font-medium text-red-500"><ArrowDown className="size-3" />{Math.abs(v)}</span>
}
function Pos({ p }: { p: number | null }) {
  return p == null
    ? <span className="text-muted-foreground">—</span>
    : <span className="inline-grid min-w-6 place-items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">{p}</span>
}
const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) =>
  <div className={"rounded-xl border bg-card p-4 shadow-sm " + className}>{children}</div>

export function ProjectDashboard({ projectId }: { projectId: string }) {
  const id = projectId
  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!id) return
    try { setDetail(await api.get<ProjectDetail>(`/api/projects/${id}`)) }
    catch { setDetail(null) }
  }, [id])

  useEffect(() => {
    setLoading(true)
    void load().finally(() => setLoading(false))
  }, [load])

  // A brand-new project's keywords are auto-seeded server-side moments after
  // creation. While the project is still empty, poll briefly so those keywords
  // (and their first rank check) appear here with no manual refresh — then fall
  // back to the "add keywords" prompt if nothing lands (e.g. seeding disabled).
  const [setupExpired, setSetupExpired] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSetupExpired(true), 60_000)
    return () => clearTimeout(t)
  }, [])
  const seeding = !setupExpired && (detail?.keywords.length ?? 0) === 0
  useEffect(() => {
    if (!seeding) return
    const t = setInterval(() => { void load() }, 4000)
    return () => clearInterval(t)
  }, [seeding, load])

  const d = useMemo(() => {
    const kws = detail?.keywords ?? []
    const ranked = kws.filter((k) => k.position != null)
    const positions = ranked.map((k) => k.position as number)
    const totalVol = kws.reduce((s, k) => s + (k.searchVolume ?? 0), 0)
    const visVol = ranked.reduce((s, k) => s + ctr(k.position) * (k.searchVolume ?? 0), 0)
    const visibility = totalVol > 0 ? Math.round((visVol / totalVol) * 1000) / 10 : 0
    // Last-week visibility, reconstructed from the 7-day deltas, for the change badge.
    const visVolPrev = ranked.reduce((s, k) => {
      const prev = k.d7 != null ? (k.position as number) + k.d7 : (k.position as number)
      return s + ctr(prev) * (k.searchVolume ?? 0)
    }, 0)
    const visibilityPrev = totalVol > 0 ? Math.round((visVolPrev / totalVol) * 1000) / 10 : 0
    const inTop = (n: number) => positions.filter((p) => p <= n).length
    const serp: Record<string, number> = {}
    for (const k of kws) {
      const sf = k.serpFeatures
      if (sf && typeof sf === "object") for (const key of Object.keys(SERP_LABELS)) {
        const v = (sf as Record<string, unknown>)[key]
        if (Array.isArray(v) ? v.length > 0 : Boolean(v)) serp[key] = (serp[key] ?? 0) + 1
      }
    }
    const aiOverviewKeywords = kws.filter((k) => {
      const sf = k.serpFeatures
      const v = sf && typeof sf === "object" ? (sf as Record<string, unknown>).aiOverview : null
      return Array.isArray(v) ? v.length > 0 : Boolean(v)
    })
    // Keywords where WE are one of the AI Overview's cited sources. Counted only
    // from an explicit `cited: true`: the verdict is absent when unknown (a check
    // predating AI Overview tracking, or an unresolved async placeholder), and
    // counting absence as "not cited" would understate the number silently.
    const aiOverviewCited = kws.filter((k) => {
      const sf = k.serpFeatures as { aiOverviewCitation?: { cited?: boolean } } | null | undefined
      return sf?.aiOverviewCitation?.cited === true
    }).length
    // Aggregate each keyword's 12-month search-volume history into one monthly
    // total series — a real basis for the Organic Traffic sparkline.
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const monthly = new Map<string, { year: number; month: number; v: number; c: number }>()
    for (const k of kws) {
      for (const t of k.searchVolumeTrend ?? []) {
        const key = `${t.year}-${String(t.month).padStart(2, "0")}`
        const e = monthly.get(key) ?? { year: t.year, month: t.month, v: 0, c: 0 }
        e.v += t.searchVolume ?? 0
        if ((t.searchVolume ?? 0) > 0) e.c += 1
        monthly.set(key, e)
      }
    }
    const monthsSorted = [...monthly.values()].sort((a, b) => a.year - b.year || a.month - b.month).slice(-12)
    const trafficTrend = monthsSorted.map((m) => ({ label: MONTHS[(m.month - 1) % 12] ?? "", v: m.v }))
    const keywordsTrend = monthsSorted.map((m) => ({ label: MONTHS[(m.month - 1) % 12] ?? "", v: m.c }))

    const byPos = [...ranked].sort((a, b) => (a.position as number) - (b.position as number))
    return {
      total: kws.length, ranked: ranked.length, totalVol,
      aiOverview: aiOverviewKeywords.length, aiOverviewCited, aiOverviewKeywords, trafficTrend, keywordsTrend,
      visibility,
      diff: round1(visibility - visibilityPrev),
      estTraffic: kws.reduce((s, k) => s + (k.monthlyTraffic ?? 0), 0),
      avgPos: positions.length ? Math.round((positions.reduce((a, b) => a + b, 0) / positions.length) * 10) / 10 : null,
      top3: inTop(3), top10: inTop(10), top20: inTop(20), top100: inTop(100),
      improved: kws.filter((k) => (k.d7 ?? 0) > 0).length,
      declined: kws.filter((k) => (k.d7 ?? 0) < 0).length,
      newKw: kws.filter((k) => k.position != null && k.firstPosition == null).length,
      lostKw: kws.filter((k) => k.position == null && k.firstPosition != null).length,
      serp,
      topKeywords: byPos.slice(0, 6),
      rankings: byPos,
      da: detail?.domainAuthority ?? null, backlinks: detail?.domainBacklinks ?? null,
    }
  }, [detail])

  if (loading) return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
  if (!detail) return <div className="grid min-h-[60vh] place-items-center text-sm text-muted-foreground">Project not found.</div>

  const kwVisibility = (k: Kw) => d.totalVol > 0 ? round1((ctr(k.position) * (k.searchVolume ?? 0) / d.totalVol) * 100) : 0

  return (
    <div className="px-6 py-6">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            SEO Dashboard: <a href={`https://${detail.domain}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">{detail.domain}</a>
          </h1>
          <div className="mt-1 text-sm text-muted-foreground">United States (Google) · English · Desktop</div>
        </div>
        <Button asChild variant="outline" size="sm"><Link href={`/dashboard/project/${id}/keywords`}>Manage keywords</Link></Button>
      </div>

      {/* Setup / empty state */}
      {d.total === 0 && (seeding ? (
        <Card className="mb-4 flex items-center gap-3 border-primary/30 bg-primary/5">
          <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
          <div>
            <div className="text-sm font-semibold">Setting up your keywords…</div>
            <div className="text-xs text-muted-foreground">We&apos;re picking the best keywords for {detail.domain} with AI and starting their first rank check. This usually takes a few seconds.</div>
          </div>
        </Card>
      ) : (
        <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 border-primary/30 bg-primary/5">
          <div>
            <div className="text-sm font-semibold">No keywords yet</div>
            <div className="text-xs text-muted-foreground">Add keywords to this project and run a check to populate your dashboard.</div>
          </div>
          <Button asChild size="sm"><Link href={`/dashboard/project/${id}/keywords`}>Add keywords</Link></Button>
        </Card>
      ))}

      {/* ── AI Search + SEO summary (shadcn cards, gauges & sparklines) ── */}
      <SeoSummary
        projectId={id}
        da={d.da}
        visibility={d.visibility}
        avgPos={d.avgPos}
        organicKeywords={d.ranked}
        tracked={d.total}
        keywordsDelta={d.newKw - d.lostKw}
        estTraffic={d.estTraffic}
        backlinks={d.backlinks}
        trafficTrend={d.trafficTrend}
        keywordsTrend={d.keywordsTrend}
        aiOverview={d.aiOverview}
        aiOverviewPct={d.total > 0 ? Math.round((d.aiOverview / d.total) * 100) : 0}
        aiOverviewCited={d.aiOverviewCited}
        aiOverviewKeywords={d.aiOverviewKeywords}
      />

      {/* ── Position Tracking widget ── */}
      <Card className="mt-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <div className="text-sm font-semibold">Position Tracking</div>
          <div className="text-xs text-muted-foreground">United States (Google) · English</div>
        </div>
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr_1.3fr]">
          {/* Visibility */}
          <div>
            <div className="text-xs font-medium text-muted-foreground">Visibility</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-primary">{d.visibility}%</span>
              {d.diff !== 0 && (
                <span className={"text-sm font-medium " + (d.diff > 0 ? "text-emerald-600" : "text-red-500")}>
                  {d.diff > 0 ? "+" : ""}{d.diff}%
                </span>
              )}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">CTR-weighted share across your tracked keywords.</div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div><div className="text-xs text-muted-foreground">Avg. position</div><div className="text-lg font-bold">{d.avgPos ?? "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">Est. traffic</div><div className="text-lg font-bold">{nf(d.estTraffic)}</div></div>
            </div>
          </div>

          {/* Keyword distribution */}
          <div>
            <div className="mb-2 text-xs font-medium text-muted-foreground">Keywords</div>
            <div className="grid grid-cols-2 gap-3">
              {([["Top 3", d.top3], ["Top 10", d.top10], ["Top 20", d.top20], ["Top 100", d.top100]] as const).map(([l, v]) => (
                <div key={l} className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">{l}</div>
                  <div className="text-xl font-bold text-primary">{v}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>Improved <b className="text-emerald-600">{d.improved}</b></span>
              <span>Declined <b className="text-red-500">{d.declined}</b></span>
              <span>New <b className="text-foreground">{d.newKw}</b></span>
              <span>Lost <b className="text-foreground">{d.lostKw}</b></span>
            </div>
          </div>

          {/* Top keywords */}
          <div>
            <div className="mb-2 text-xs font-medium text-muted-foreground">Top Keywords</div>
            {d.topKeywords.length === 0 ? (
              <div className="text-xs text-muted-foreground">No ranked keywords yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase text-muted-foreground">
                    <th className="pb-1 font-semibold">Keyword</th>
                    <th className="pb-1 text-right font-semibold">Pos.</th>
                    <th className="pb-1 text-right font-semibold">Vis.</th>
                  </tr>
                </thead>
                <tbody>
                  {d.topKeywords.map((k) => (
                    <tr key={k.id} className="border-t">
                      <td className="max-w-[160px] truncate py-1.5">{k.keyword}</td>
                      <td className="py-1.5 text-right"><Pos p={k.position} /></td>
                      <td className="py-1.5 text-right text-muted-foreground">{kwVisibility(k)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Card>

      {/* ── Keyword rankings table ── */}
      <Card className="mt-4 p-0">
        <div className="flex items-center justify-between border-b p-4">
          <div className="text-sm font-semibold">Keyword rankings</div>
          <div className="text-xs text-muted-foreground">{d.ranked} ranked · {d.total} tracked</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="p-3 font-semibold">Keyword</th>
                <th className="p-3 font-semibold">Position</th>
                <th className="p-3 font-semibold">Change</th>
                <th className="p-3 text-right font-semibold">Volume</th>
                <th className="p-3 text-right font-semibold">Est. traffic</th>
                <th className="p-3 font-semibold">URL</th>
              </tr>
            </thead>
            <tbody>
              {d.rankings.length === 0 ? (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No ranked keywords yet — checks run automatically once keywords are added.</td></tr>
              ) : (
                d.rankings.map((k) => (
                  <tr key={k.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="p-3 font-medium">{k.keyword}</td>
                    <td className="p-3"><Pos p={k.position} /></td>
                    <td className="p-3"><Delta v={k.d7} /></td>
                    <td className="p-3 text-right">{k.searchVolume != null ? nf(k.searchVolume) : "—"}</td>
                    <td className="p-3 text-right">{k.monthlyTraffic != null ? nf(k.monthlyTraffic) : "—"}</td>
                    <td className="max-w-[220px] truncate p-3">
                      {k.url ? (
                        <a href={k.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                          {k.url.replace(/^https?:\/\//, "")}<ExternalLink className="size-3" />
                        </a>
                      ) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
