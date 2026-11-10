"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { APIProvider, AdvancedMarker, Map, useMap } from "@vis.gl/react-google-maps"
import { CalendarClock, ExternalLink, MapPin, Navigation, Phone, Send } from "lucide-react"
import type { GbpAuditResponse } from "@/lib/gbp-audit"
import type { AeoReport } from "@/lib/aeo"
import type { GbpPost } from "@/lib/report-builder"
import { ActionPlan, ReportHero } from "@/components/gbp-audit/report"
import { WebsiteScreenshot } from "@/components/page-audit/audit-ui"
import { FixList, Overview } from "@/components/aeo/report"
import { StatCard } from "@/components/dashboard/stat-card"

// The client report's sections, one per deliverable. Each takes the finished
// run it reads (a Maps audit, a site audit, an AEO audit) and says, in the
// client's terms, what was found and what the team will do about it.

/** One deliverable. With `onToggle` it has a tick box: a section ticked off stays on screen, folded, and is left out of the print. */
export function Section({
  n,
  title,
  promise,
  children,
  included = true,
  onToggle,
}: {
  n: number | null
  title: string
  promise: string
  children: ReactNode
  included?: boolean
  onToggle?: () => void
}) {
  return (
    <section className={`space-y-4 print:break-before-page ${included ? "" : "print:hidden"}`}>
      <div className="flex items-start gap-3 border-b border-border pb-3">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-semibold ${included ? "bg-brand text-white" : "bg-muted text-muted-foreground"}`}>{n ?? "–"}</span>
        <div className="min-w-0 flex-1">
          <h2 className={`text-[18px] font-semibold tracking-tight ${included ? "" : "text-muted-foreground"}`}>{title}</h2>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{promise}</p>
        </div>
        {onToggle && (
          <label
            className={`flex shrink-0 cursor-pointer select-none items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors print:hidden ${included ? "border-brand/40 bg-brand/5 text-brand" : "border-border text-muted-foreground hover:bg-muted"}`}
          >
            <input type="checkbox" checked={included} onChange={onToggle} className="h-4 w-4 cursor-pointer accent-brand" />
            {included ? "In the report" : "Left out"}
          </label>
        )}
      </div>
      {included ? children : <p className="text-[13px] text-muted-foreground">Left out of the report and its PDF. Tick it to put it back.</p>}
    </section>
  )
}

const card = "rounded-[10px] border border-border bg-card shadow-sm print:shadow-none"

// ── 1. Citations ─────────────────────────────────────────────────────────────

export function CitationsSection({ data }: { data: GbpAuditResponse }) {
  const facts = data.facts!
  const b = facts.business
  const rows = data.report?.directories ?? []
  // Missing directories, the ones competitors use first; else straight from the business's own check.
  const fromRows = rows.filter((r) => r.you === "missing").map((r) => ({ name: r.name, url: r.url, addUrl: r.addUrl, rivals: r.competitors.length }))
  const fromOwn = (facts.citations?.sites ?? []).filter((s) => s.status === "missing").map((s) => ({ name: s.name, url: s.url, addUrl: s.addUrl, rivals: 0 }))
  const picks = (fromRows.length ? fromRows : fromOwn).slice(0, 3)
  const listed = (facts.citations?.sites ?? []).filter((s) => s.status === "listed").length
  const nap: [string, ReactNode][] = [
    ["Business name", b.name],
    ["Address", b.address ?? "—"],
    ["Phone", b.phone ?? "—"],
    ["Website", b.website ?? "—"],
    ["Category", [b.category, ...b.additionalCategories].filter(Boolean).join(", ") || "—"],
  ]
  if (picks.length === 0) {
    return (
      <div className={`${card} p-4 text-[13px] text-muted-foreground`}>
        {facts.citations
          ? `${b.name} is already listed on every directory we checked (${listed}). We'll keep these listings accurate.`
          : "The local directories couldn't be checked for this business. Run the report again to include them."}
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard compact label="Listed now" hint="Local directories where the business already has a listing." value={listed} caption={`of ${facts.citations?.sites.length ?? 25} checked`} tone="text-foreground" />
        <StatCard compact label="Citations to create" hint="The three we'll publish first." value={picks.length} caption="ready to submit" tone="text-brand" />
        <StatCard compact label="Competitors use" hint="How many of these three the top competitors are already listed on." value={picks.filter((p) => p.rivals > 0).length} caption="of the three" tone="text-foreground" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {picks.map((p, i) => (
          <div key={p.name} className={`${card} flex flex-col p-4`}>
            <div className="text-xs text-muted-foreground">Citation {i + 1}</div>
            <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-[14px] font-semibold hover:underline">
              {p.name}
            </a>
            {p.rivals > 0 && <div className="mt-0.5 text-xs text-muted-foreground">{p.rivals} of your top competitors are listed here</div>}
            <dl className="mt-3 space-y-1.5 text-[13px]">
              {nap.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="break-words">{v}</dd>
                </div>
              ))}
            </dl>
            <a
              href={p.addUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-auto inline-flex items-center gap-1 pt-3 text-[13px] font-medium text-brand hover:underline print:hidden"
            >
              Submission page <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Each listing uses exactly the same name, address and phone as the Google Business Profile, so Google can match them. We&apos;ll publish these and send you the live links.
      </p>
    </div>
  )
}

// ── 2. Maps audit action plan ────────────────────────────────────────────────

export function GbpPlanSection({ data }: { data: GbpAuditResponse }) {
  return (
    <div className="space-y-5">
      <ReportHero data={data} />
      <ActionPlan report={data.report!} planAtEnd />
    </div>
  )
}

// ── 3. AI Google Post ────────────────────────────────────────────────────────

export function AiPostSection({ data, post, onRegenerate, busy }: { data: GbpAuditResponse; post: GbpPost | null; onRegenerate?: () => void; busy?: boolean }) {
  const b = data.facts!.business
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className={`${card} overflow-hidden`}>
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          {b.logo || b.mainImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- Google-hosted photo
            <img src={(b.logo ?? b.mainImage)!} alt="" referrerPolicy="no-referrer" className="h-9 w-9 rounded-full object-cover ring-1 ring-border" />
          ) : (
            <span className="grid h-9 w-9 place-items-center rounded-full bg-muted text-xs font-semibold">{b.name.slice(0, 2).toUpperCase()}</span>
          )}
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold">{b.name}</div>
            <div className="text-xs text-muted-foreground">Google Business Profile · Update</div>
          </div>
        </div>
        {post ? (
          <div className="space-y-2 p-4">
            <div className="text-[15px] font-semibold">{post.headline}</div>
            <p className="whitespace-pre-line text-[13px] leading-relaxed">{post.body}</p>
            <span className="mt-1 inline-flex h-9 items-center rounded-full bg-brand px-4 text-[13px] font-semibold text-white">{post.cta}</span>
          </div>
        ) : (
          <p className="p-4 text-[13px] text-muted-foreground">Writing the post…</p>
        )}
      </div>
      <div className="space-y-3 text-[13px] leading-relaxed">
        <div className={`${card} flex items-start gap-3 p-4`}>
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
          <p>
            <b>We&apos;ll publish a fresh post like this on your Google Business Profile every day</b>: offers, recent jobs, news and tips, each with a photo and a button.
          </p>
        </div>
        <div className={`${card} flex items-start gap-3 p-4`}>
          <Send className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
          <p>Regular posts show Google and searchers the business is active, and give people a reason to call today.</p>
        </div>
        {onRegenerate && (
          <button type="button" onClick={onRegenerate} disabled={busy} className="text-xs font-medium text-brand hover:underline disabled:opacity-60 print:hidden">
            {busy ? "Writing…" : "Write another version"}
          </button>
        )}
      </div>
    </div>
  )
}

// ── 4. Driving directions map ────────────────────────────────────────────────

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID"

const directionsUrl = (from: string, to: string) =>
  `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}&travelmode=driving`

/** Straight route lines from each competitor to the business, and the view fitted to them all. */
function RouteLines({ to, from }: { to: google.maps.LatLngLiteral; from: google.maps.LatLngLiteral[] }) {
  const map = useMap()
  useEffect(() => {
    if (!map) return
    const lines = from.map(
      (f) =>
        new google.maps.Polyline({
          map,
          path: [f, to],
          strokeColor: "#2d5bff",
          strokeOpacity: 0,
          icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 0.9, scale: 3 }, offset: "0", repeat: "14px" }],
        }),
    )
    const bounds = new google.maps.LatLngBounds(to)
    from.forEach((f) => bounds.extend(f))
    if (from.length) map.fitBounds(bounds, 60)
    return () => lines.forEach((l) => l.setMap(null))
  }, [map, to, from])
  return null
}

export function DirectionsSection({ data }: { data: GbpAuditResponse }) {
  const facts = data.facts!
  const b = facts.business
  const destination = b.address ?? b.name
  const rivals = useMemo(
    () =>
      (facts.competitorProfiles?.length ? facts.competitorProfiles : (facts.visibility?.results ?? []).filter((r) => !r.isTarget).slice(0, 3)).map((r) => ({
        title: r.title,
        address: ("address" in r ? r.address : null) ?? r.title,
        pos: "lat" in r && r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null,
      })),
    [facts],
  )
  const here = b.latitude != null && b.longitude != null ? { lat: b.latitude, lng: b.longitude } : null
  const pins = rivals.flatMap((r) => (r.pos ? [r.pos] : []))
  return (
    <div className="space-y-4">
      {here && MAPS_KEY ? (
        <div className={`${card} h-[380px] overflow-hidden`}>
          <APIProvider apiKey={MAPS_KEY}>
            <Map mapId={MAP_ID} defaultCenter={here} defaultZoom={13} gestureHandling="cooperative" disableDefaultUI>
              <AdvancedMarker position={here} title={b.name}>
                <span className="flex items-center gap-1 rounded-full bg-brand px-2.5 py-1 text-xs font-semibold text-white shadow">
                  <MapPin className="h-3.5 w-3.5" aria-hidden /> {b.name}
                </span>
              </AdvancedMarker>
              {rivals.map((r, i) =>
                r.pos ? (
                  <AdvancedMarker key={i} position={r.pos} title={r.title}>
                    <span className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-semibold text-white shadow">{r.title}</span>
                  </AdvancedMarker>
                ) : null,
              )}
              <RouteLines to={here} from={pins} />
            </Map>
          </APIProvider>
        </div>
      ) : (
        <div className={`${card} p-4 text-[13px] text-muted-foreground`}>The map needs the business&apos;s pin and a Google Maps key; the routes are listed below.</div>
      )}
      <div className={`${card} divide-y divide-border`}>
        {rivals.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px]">
            <span className="flex min-w-0 items-center gap-2">
              <Navigation className="h-4 w-4 shrink-0 text-brand" aria-hidden />
              <span className="min-w-0">
                From <b className="font-medium">{r.title}</b> to <b className="font-medium">{b.name}</b>
                <span className="block truncate text-xs text-muted-foreground">{r.address}</span>
              </span>
            </span>
            <a href={directionsUrl(r.address, destination)} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 font-medium text-brand hover:underline">
              Driving directions <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </div>
        ))}
        {rivals.length === 0 && <p className="px-4 py-3 text-[13px] text-muted-foreground">No competitors were found around the business.</p>}
      </div>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        We&apos;ll build driving-direction routes from your competitors&apos; locations (and nearby landmarks) to your business, and add them to your website and profiles, so people searching
        around your competitors are shown the way to you.
      </p>
    </div>
  )
}

// ── 5. Website audit ─────────────────────────────────────────────────────────

export type SiteReport = { id: string; url: string; overallScore: number; totals?: { pages: number; issues: number }; screenshots?: { desktop?: string | null; mobile?: string | null } | null }
export type IssueGroup = { type: string; title: string; description: string; category: string; severity: string; affectedPages: number }

const SEVERITY_TONE: Record<string, string> = { CRITICAL: "text-red-500", HIGH: "text-red-500", WARNING: "text-amber-600 dark:text-amber-400", MEDIUM: "text-amber-600 dark:text-amber-400" }

export function SiteAuditSection({ report, groups }: { report: SiteReport; groups: IssueGroup[] }) {
  const score = Math.round(report.overallScore)
  const critical = groups.filter((g) => /CRITICAL|HIGH/i.test(g.severity)).length
  return (
    <div className="space-y-4">
      {/* The site as a visitor sees it, on a desktop and on a phone, beside the headline numbers. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className={`${card} p-4`}>
          <WebsiteScreenshot url={report.url} auditReportId={report.id} initial={report.screenshots} />
        </div>
        <div className="grid gap-3">
          <StatCard compact label="Website score" hint="FreeSERP's site audit score, out of 100." value={`${score}/100`} caption={report.url} tone="text-foreground" />
          <StatCard compact label="Pages crawled" hint="Pages the audit read." value={report.totals?.pages ?? "—"} caption="by FreeSERP's crawler" tone="text-foreground" />
          <StatCard compact label="Issues to fix" hint="Distinct problems, each affecting one or more pages." value={groups.length} caption={`${critical} critical`} tone={critical ? "text-red-500" : "text-foreground"} />
        </div>
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full min-w-[560px] border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="border-b border-border px-4 py-2.5 font-medium">Issue</th>
              <th className="w-28 border-b border-border px-3 py-2.5 font-medium">Severity</th>
              <th className="w-24 border-b border-border px-4 py-2.5 text-right font-medium">Pages</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {groups.slice(0, 15).map((g) => (
              <tr key={g.type} className="align-top">
                <td className="px-4 py-2.5">
                  <div className="font-medium">{g.title}</div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{g.description}</div>
                </td>
                <td className={`px-3 py-2.5 capitalize ${SEVERITY_TONE[g.severity.toUpperCase()] ?? "text-muted-foreground"}`}>{g.severity.toLowerCase()}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{g.affectedPages || "Site-wide"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {groups.length > 15 && <p className="text-xs text-muted-foreground">And {groups.length - 15} more issues in the full audit.</p>}
      <div className={`${card} flex items-start gap-3 p-4 text-[13px]`}>
        <Phone className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
        <p>
          <b>We&apos;ll fix all {groups.length} of these</b>, critical ones first, and re-run the audit to show the improvement.
        </p>
      </div>
    </div>
  )
}

// ── 6. AEO & GEO audit ───────────────────────────────────────────────────────

export function AeoSection({ report }: { report: AeoReport }) {
  return (
    <div className="space-y-4">
      {report.breakdown && <Overview report={report as AeoReport & { breakdown: NonNullable<AeoReport["breakdown"]> }} />}
      <FixList fixes={report.fixes} origin={report.origin} />
      {report.fixes.length === 0 && <p className="text-[13px] text-muted-foreground">Nothing to fix first: the site is in good shape for AI assistants.</p>}
    </div>
  )
}

/** Fill-in while a run is still going. */
export function Pending({ what, detail }: { what: string; detail?: string }) {
  const [dots, setDots] = useState("")
  useEffect(() => {
    const t = setInterval(() => setDots((d) => (d.length >= 3 ? "" : `${d}.`)), 500)
    return () => clearInterval(t)
  }, [])
  return (
    <div className={`${card} p-4 text-[13px] text-muted-foreground print:hidden`}>
      {what}
      {dots}
      {detail && <span className="block text-xs">{detail}</span>}
    </div>
  )
}
