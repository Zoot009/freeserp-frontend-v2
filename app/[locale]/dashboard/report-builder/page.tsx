"use client"

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Building2, Check, FileStack, Globe, Grid3x3, History, Loader2, MapPin, Search, Sparkles, Tags, Youtube, Zap } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { api } from "@/lib/api"
import { knownGeoCountry } from "@/hooks/use-geo-country"
import { LocationPicker } from "@/components/location-picker"
import { searchLocations } from "@/lib/locations"
import { DEFAULT_SCAN_RADIUS, GRID_SIZES, RADIUS_STEPS, nearestRadiusStep, toMeters, validateArea, type DistanceUnit } from "@/components/maps-tracker/grid"
import { spacingCaption } from "@/components/maps-tracker/grid-controls"
import { DELIVERABLES, GROUPS, def, fieldsFor, runsFor, type Deliverable, type Field, type StoredReport } from "@/lib/report-builder"
import { domainOf, errorMessage } from "@/components/report-builder/runs"

const box =
  "flex h-11 items-center gap-2.5 rounded-xl border border-border bg-background px-3 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20"
const inputCls = "h-full w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
const label = "mb-1.5 block text-xs font-medium text-muted-foreground"

/** What the lookup found from a Maps link or a website. */
type Found = { name: string | null; website: string | null; keyword: string | null; city: string | null; countryCode: string | null; maps: string | null }

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
  // A city's country, for the tools that only take a country (else they'd fall back to the US).
  const [country, setCountry] = useState<string | undefined>(undefined)
  const [svc, setSvc] = useState("")
  const [name, setName] = useState("")
  const [yt, setYt] = useState("")
  const [grid, setGrid] = useState("3")
  // How far the Maps Tracker grid reaches, as in the tracker itself: half a mile unless chosen.
  const [radius, setRadius] = useState(DEFAULT_SCAN_RADIUS.radius)
  const [unit, setUnit] = useState<DistanceUnit>(DEFAULT_SCAN_RADIUS.unit)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  // The city the lookup chose, to name it in the picker; and whether the location was picked by hand.
  const [locLabel, setLocLabel] = useState<string | null>(null)
  const locPicked = useRef(false)
  // "Fill in from link": what it's doing, and what it filled in (so a second lookup may replace those, never what was typed).
  const [look, setLook] = useState<{ busy: boolean; msg: string }>({ busy: false, msg: "" })
  const filled = useRef<Record<string, string>>({})
  const looked = useRef("")

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
    const areaError = sel.includes("mapsTracker") ? validateArea(Number(grid), radius, unit, 1) : null
    if (areaError) return setError(areaError)
    // The tools behind the report take no more than these.
    if (fields.has("keyword") && kw.trim().length > 80) return setError("Keep the main keyword under 80 characters.")
    if (fields.has("name") && name.trim().length > 100) return setError("Keep the business name under 100 characters.")
    setBusy(true)
    try {
      const { report, reused } = await api.post<{ report: StoredReport; reused: boolean }>("/api/report-builder/reports", {
        sel: ordered,
        inputs: {
          maps: maps.trim() || undefined,
          web: web.trim() || undefined,
          kw: kw.trim() || undefined,
          loc: loc || undefined,
          country: (country ?? (/^[a-z]{2}$/i.test(loc) ? loc : undefined))?.toLowerCase(),
          name: name.trim() || undefined,
          yt: yt.trim() || undefined,
          grid: sel.includes("mapsTracker") ? grid : undefined,
          radius: sel.includes("mapsTracker") ? String(radius) : undefined,
          unit: sel.includes("mapsTracker") ? unit : undefined,
          svc: svc
            .split(",")
            .map((s) => s.trim().slice(0, 60))
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

  // Fill in the business from its Maps link (or, without one, its website): name, website, keyword, city.
  // Only empty fields, or ones an earlier lookup filled; the team checks them before building.
  const lookup = async (auto = false) => {
    const input = fields.has("maps") && maps.trim() ? { maps: maps.trim() } : web.trim() ? { web: web.trim() } : null
    if (!input) return auto || setLook({ busy: false, msg: "Paste the Google Maps link or the website first." })
    const key = JSON.stringify(input)
    if (auto && key === looked.current) return
    looked.current = key
    // Against the field's value now, not when the lookup started: typing while it runs wins.
    const put = (k: string, show: boolean, v: string | null, set: Dispatch<SetStateAction<string>>) =>
      show &&
      v &&
      set((cur) => {
        if (cur.trim() && cur !== filled.current[k]) return cur
        filled.current[k] = v
        return v
      })
    const apply = async (f: Found) => {
      put("name", fields.has("name"), f.name, setName)
      put("web", fields.has("website"), f.website, setWeb)
      put("kw", fields.has("keyword") || fields.has("maps"), f.keyword, setKw)
      put("maps", fields.has("maps"), f.maps, setMaps)
      if (!fields.has("location") || locPicked.current || !f.countryCode) return
      // The business's city, as the location picker knows it; else its country.
      const city = f.city ? (await searchLocations(f.city, { country: f.countryCode })).find((l) => l.type === "City") : undefined
      if (locPicked.current) return
      setLoc(city?.code ?? f.countryCode)
      setCountry(f.countryCode)
      setLocLabel(city ? city.name : null)
    }
    setLook({ busy: true, msg: "" })
    try {
      const r = await api.post<{ found: Found; task?: string; note?: string }>("/api/report-builder/lookup", input)
      await apply(r.found)
      // DataForSEO takes 10 to 60 seconds for a listing it hasn't fetched before.
      let task = r.task
      for (const until = Date.now() + 90_000; task && Date.now() < until; ) {
        await new Promise((ok) => setTimeout(ok, 4000))
        const p = await api.get<{ found: Found | null }>(`/api/report-builder/lookup/${encodeURIComponent(task)}`)
        if (p.found) {
          await apply(p.found)
          task = undefined
        }
      }
      setLook({
        busy: false,
        msg: task ? "Google is slow to answer. Fill in the rest by hand, or try again in a minute." : (r.note ?? "Filled in. Check each field before you build the report."),
      })
    } catch (e) {
      looked.current = ""
      setLook({ busy: false, msg: errorMessage(e, "The business couldn't be looked up. Fill it in by hand.") })
    }
  }

  const field = (show: boolean, lbl: string, Icon: typeof Globe, value: string, set: (v: string) => void, placeholder: string, hint?: string, onBlur?: () => void) =>
    show && (
      <label className="block">
        <span className={label}>{lbl}</span>
        <span className={box}>
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <input className={inputCls} placeholder={placeholder} value={value} onChange={(e) => set(e.target.value)} onBlur={onBlur} />
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
              {field(fields.has("maps"), "Google Maps link of the business", MapPin, maps, setMaps, "https://maps.app.goo.gl/…", undefined, () => void lookup(true))}
              {field(fields.has("website"), "Website", Globe, web, setWeb, "clientbusiness.com", undefined, () => void lookup(true))}
              {(fields.has("maps") || fields.has("website")) && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 lg:col-span-2">
                  <button
                    type="button"
                    onClick={() => void lookup()}
                    disabled={look.busy}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-brand/30 bg-brand/5 px-3.5 text-[13px] font-medium text-brand transition-colors hover:bg-brand/10 disabled:opacity-60"
                  >
                    {look.busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
                    {look.busy ? "Looking up the business…" : "Fill in from link"}
                  </button>
                  <span className="text-xs text-muted-foreground" aria-live="polite">
                    {look.msg || `Paste the ${fields.has("maps") ? "Google Maps link or the website" : "website"}: the name, keyword and location fill in for you to check.`}
                  </span>
                </div>
              )}
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
                  <span className="mt-1 block text-[11px] text-muted-foreground">A bigger grid costs more credits.</span>
                </label>
              )}
              {sel.includes("mapsTracker") && (
                <div>
                  <span className={label}>Maps Tracker distance</span>
                  <div className="flex gap-2">
                    <span className={`${box} flex-1`}>
                      <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <select
                        className={`${inputCls} cursor-pointer`}
                        value={String(nearestRadiusStep(radius, unit))}
                        onChange={(e) => setRadius(Number(e.target.value))}
                        aria-label="How far the grid reaches"
                      >
                        {RADIUS_STEPS[unit].map((s) => (
                          <option key={s} value={s}>
                            {s} {unit === "IMPERIAL" ? (s === 1 ? "mile" : "miles") : "km"} from the business
                          </option>
                        ))}
                      </select>
                    </span>
                    <span className="inline-flex h-11 shrink-0 rounded-xl border border-border bg-background p-1" role="group" aria-label="Distance unit">
                      {(["IMPERIAL", "METRIC"] as const).map((u) => (
                        <button
                          key={u}
                          type="button"
                          aria-pressed={unit === u}
                          onClick={() => {
                            if (u === unit) return
                            // The same distance in the other unit, on its nearest step.
                            setRadius(nearestRadiusStep(toMeters(radius, unit) / (u === "IMPERIAL" ? 1609.344 : 1000), u))
                            setUnit(u)
                          }}
                          className={`rounded-lg px-3 text-[13px] font-medium transition-colors ${unit === u ? "bg-brand/10 text-brand" : "text-muted-foreground hover:text-foreground"}`}
                        >
                          {u === "IMPERIAL" ? "Miles" : "Km"}
                        </button>
                      ))}
                    </span>
                  </div>
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {validateArea(Number(grid), radius, unit, 1) ?? `${spacingCaption(Number(grid), radius, unit)}. The Maps Tracker's own default is 0.5 miles.`}
                  </span>
                </div>
              )}
              {fields.has("location") && (
                <div>
                  <span className={label}>Where the business wants customers</span>
                  <LocationPicker
                    value={loc}
                    valueLabel={locLabel}
                    onChange={(code, l) => {
                      setLoc(code)
                      setCountry(l?.countryIso ?? undefined)
                      setLocLabel(null)
                      locPicked.current = true
                    }}
                    variant="dashboard" showFlags placeholder="Search a country or city" />
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

/** The reports built in the last 30 days, newest first; each opens without running anything again. */
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
        <span className="text-xs text-muted-foreground">Kept for 30 days. Opening one shows the saved results without running the tools again.</span>
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
