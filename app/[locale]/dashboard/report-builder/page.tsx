"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Building2, Check, FileStack, Globe, Grid3x3, History, Loader2, MapPin, Search, Tags, Youtube, Zap } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { api } from "@/lib/api"
import { knownGeoCountry } from "@/hooks/use-geo-country"
import { LocationPicker } from "@/components/location-picker"
import { GRID_SIZES } from "@/components/maps-tracker/grid"
import { DELIVERABLES, GROUPS, def, fieldsFor, runsFor, type Deliverable, type Field, type StoredReport } from "@/lib/report-builder"
import { domainOf, errorMessage } from "@/components/report-builder/runs"

const box =
  "flex h-11 items-center gap-2.5 rounded-xl border border-border bg-background px-3 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20"
const inputCls = "h-full w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
const label = "mb-1.5 block text-xs font-medium text-muted-foreground"

const NEEDS_LABEL: Record<Field, string> = {
  maps: "Google Maps link",
  website: "website",
  keyword: "keyword",
  location: "location",
  services: "services",
  name: "business name",
  youtube: "YouTube channel",
}

export default function ReportBuilderPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [sel, setSel] = useState<Deliverable[]>([])
  const [maps, setMaps] = useState("")
  const [web, setWeb] = useState("")
  const [kw, setKw] = useState("")
  const [loc, setLoc] = useState(() => knownGeoCountry() ?? "us")
  const [svc, setSvc] = useState("")
  const [name, setName] = useState("")
  const [yt, setYt] = useState("")
  const [grid, setGrid] = useState("3")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  if (loading) return null
  if (!user?.inhouse) {
    return (
      <div className="page">
        <p className="text-[13px] text-muted-foreground">This page isn&apos;t available for this account.</p>
      </div>
    )
  }

  const toggle = (d: Deliverable) => setSel((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))
  const fields = fieldsFor(sel)
  // The report follows the list's order, whatever order things were ticked in.
  const ordered = DELIVERABLES.map((d) => d.key).filter((k) => sel.includes(k))

  const start = async () => {
    setError("")
    if (!ordered.length) return setError("Choose at least one thing for the report.")
    const missing: string[] = []
    if (fields.has("maps") && !maps.trim()) missing.push("the Google Maps link")
    if (fields.has("website") && !web.trim()) missing.push("the website")
    if (fields.has("keyword") && !kw.trim()) missing.push("the main keyword")
    if (fields.has("name") && !name.trim()) missing.push("the business name")
    if (fields.has("youtube") && !yt.trim()) missing.push("the YouTube channel")
    if (missing.length) return setError(`Add ${missing.join(", ")}.`)
    setBusy(true)
    try {
      const { report, reused } = await api.post<{ report: StoredReport; reused: boolean }>("/api/report-builder/reports", {
        sel: ordered,
        inputs: {
          maps: maps.trim() || undefined,
          web: web.trim() || undefined,
          kw: kw.trim() || undefined,
          loc: loc || undefined,
          name: name.trim() || undefined,
          yt: yt.trim() || undefined,
          grid: sel.includes("mapsTracker") ? grid : undefined,
          svc: svc
            .split(",")
            .map((s) => s.trim().slice(0, 100))
            .filter((s) => s.length >= 2)
            .slice(0, 10),
        },
      })
      router.push(`/dashboard/report-builder/report?id=${report.id}${reused ? "&cached=1" : ""}`)
    } catch (e) {
      setError(errorMessage(e, "The report couldn't be started."))
      setBusy(false)
    }
  }

  const field = (show: boolean, lbl: string, Icon: typeof Globe, value: string, set: (v: string) => void, placeholder: string, hint?: string) =>
    show && (
      <label className="block">
        <span className={label}>{lbl}</span>
        <span className={box}>
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <input className={inputCls} placeholder={placeholder} value={value} onChange={(e) => set(e.target.value)} />
        </span>
        {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
      </label>
    )

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1 className="flex items-center gap-2">
            <FileStack className="h-6 w-6 text-brand" aria-hidden /> Client Report Builder
          </h1>
          <div className="sub">Pick any of FreeSERP&apos;s tools, enter the business once, and get one combined client report with a PDF. For the in-house team only.</div>
        </div>
      </div>

      <ReportHistory />

      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold tracking-tight">1. What goes in the report</h2>
        <span className="flex gap-3 text-xs">
          <button type="button" className="font-medium text-brand hover:underline" onClick={() => setSel(DELIVERABLES.map((d) => d.key))}>
            Select all
          </button>
          {sel.length > 0 && (
            <button type="button" className="text-muted-foreground hover:underline" onClick={() => setSel([])}>
              Clear ({sel.length})
            </button>
          )}
        </span>
      </div>
      <div className="space-y-5">
        {GROUPS.map((g) => (
          <div key={g}>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g}</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {DELIVERABLES.filter((d) => d.group === g).map((d) => {
                const on = sel.includes(d.key)
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => toggle(d.key)}
                    aria-pressed={on}
                    className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition-colors ${on ? "border-brand bg-brand/5" : "border-border bg-card hover:bg-muted/50"}`}
                  >
                    <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border ${on ? "border-brand bg-brand text-white" : "border-border"}`}>
                      {on && <Check className="h-3.5 w-3.5" aria-hidden />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold">{d.title}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{d.text}</span>
                      <span className="mt-1.5 block text-[11px] text-muted-foreground">Needs: {d.needs.map((n) => NEEDS_LABEL[n]).join(", ")}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {sel.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-[15px] font-semibold tracking-tight">2. About the business</h2>
          <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
            <div className="grid gap-3 lg:grid-cols-2">
              {field(fields.has("maps"), "Google Maps link of the business", MapPin, maps, setMaps, "https://maps.app.goo.gl/…")}
              {field(fields.has("website"), "Website", Globe, web, setWeb, "clientbusiness.com")}
              {field(
                fields.has("keyword") || fields.has("maps"),
                fields.has("keyword") ? "Main keyword" : "Main keyword (optional)",
                Search,
                kw,
                setKw,
                "e.g. emergency plumber",
                fields.has("maps") ? "The Maps audit uses the primary category if blank." : undefined,
              )}
              {field(fields.has("name"), "Business name", Building2, name, setName, "As customers know it", "What the AI assistants are checked for.")}
              {field(fields.has("services"), "Services to advertise (optional)", Tags, svc, setSvc, "drain cleaning, water heater repair", "Comma separated. The main keyword if blank.")}
              {field(fields.has("youtube"), "YouTube channel", Youtube, yt, setYt, "https://youtube.com/@channel")}
              {sel.includes("mapsTracker") && (
                <label className="block">
                  <span className={label}>Maps Tracker grid</span>
                  <span className={box}>
                    <Grid3x3 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <select className={`${inputCls} cursor-pointer`} value={grid} onChange={(e) => setGrid(e.target.value)}>
                      {GRID_SIZES.map((n) => (
                        <option key={n} value={n}>
                          {n}×{n} ({n * n} points){n === 3 ? ", default" : ""}
                        </option>
                      ))}
                    </select>
                  </span>
                  <span className="mt-1 block text-[11px] text-muted-foreground">Points spread over 3 km around the business. A bigger grid costs more credits.</span>
                </label>
              )}
              {fields.has("location") && (
                <div>
                  <span className={label}>Where the business wants customers</span>
                  <LocationPicker value={loc} onChange={setLoc} variant="dashboard" showFlags placeholder="Search a country or city" />
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">
                {ordered.length} {ordered.length === 1 ? "section" : "sections"}. The report fills in as each tool finishes, usually 2 to 8 minutes.
              </span>
              <button
                type="button"
                onClick={start}
                disabled={busy}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-deep disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Zap className="h-4 w-4" aria-hidden />} Build report
              </button>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </section>
        </>
      )}
    </div>
  )
}

const TH = "border-b border-border px-3 py-2 text-left text-xs font-medium text-muted-foreground"
const TD = "px-3 py-2.5 align-top"
const short = (iso: string) => new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short" })

/** The reports built in the last 10 days, newest first; each opens without running anything again. */
function ReportHistory() {
  const [reports, setReports] = useState<StoredReport[] | null>(null)
  const [all, setAll] = useState(false)
  useEffect(() => {
    api.get<{ reports: StoredReport[] }>("/api/report-builder/reports").then(
      (r) => setReports(r.reports),
      () => setReports([]),
    )
  }, [])
  if (!reports) return null
  const shown = all ? reports : reports.slice(0, 5)
  return (
    <section className="mb-8 rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <History className="h-4 w-4 text-brand" aria-hidden /> Report history
        </h2>
        <span className="text-xs text-muted-foreground">Kept for 10 days. Opening one shows the saved results without running the tools again.</span>
      </div>
      {reports.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-muted-foreground">No reports yet. Every report you build is listed here with its ID.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
            <thead>
              <tr>
                <th className={TH}>Report ID</th>
                <th className={TH}>Business</th>
                <th className={TH}>Sections</th>
                <th className={TH}>Status</th>
                <th className={TH}>Built</th>
                <th className={TH}>Kept until</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((r) => {
                const total = runsFor(r.sel).length
                const done = runsFor(r.sel).filter((k) => r.status[k]).length
                const failed = runsFor(r.sel).filter((k) => r.status[k] === "failed").length
                // The sections going to the client: the ones ticked off on the report are left out.
                const titles = r.sel.filter((d) => !(r.hidden ?? []).includes(d)).map((d) => def(d)?.title).filter(Boolean)
                const href = `/dashboard/report-builder/report?id=${r.id}`
                return (
                  <tr key={r.id}>
                    <td className={`${TD} font-mono text-xs font-semibold`}>{r.id.toUpperCase()}</td>
                    <td className={TD}>
                      <div className="font-medium">{r.business ?? r.inputs.name ?? (domainOf(r.inputs.web) || "Google Maps listing")}</div>
                      {r.inputs.kw && <div className="text-xs text-muted-foreground">{r.inputs.kw}</div>}
                    </td>
                    <td className={TD} title={titles.join(", ")}>
                      {titles.slice(0, 2).join(", ")}
                      {titles.length > 2 && <span className="text-muted-foreground"> +{titles.length - 2} more</span>}
                    </td>
                    <td className={TD}>
                      {done === total ? (
                        <span className="text-green-600 dark:text-green-400">Ready{failed ? `, ${failed} failed` : ""}</span>
                      ) : (
                        <span className="text-muted-foreground">
                          {done} of {total} ready
                        </span>
                      )}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-muted-foreground`}>{short(r.createdAt)}</td>
                    <td className={`${TD} whitespace-nowrap text-muted-foreground`}>{short(r.expiresAt)}</td>
                    <td className={`${TD} text-right`}>
                      <Link href={href} className="font-medium text-brand hover:underline">
                        Open
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {reports.length > 5 && (
        <div className="border-t border-border px-4 py-2">
          <button type="button" className="text-xs font-medium text-brand hover:underline" onClick={() => setAll((v) => !v)}>
            {all ? "Show fewer" : `Show all ${reports.length}`}
          </button>
        </div>
      )}
    </section>
  )
}
