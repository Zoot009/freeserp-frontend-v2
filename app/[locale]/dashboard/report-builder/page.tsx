"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Building2, Check, FileStack, Globe, MapPin, Search, Tags, Youtube, Zap } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { knownGeoCountry } from "@/hooks/use-geo-country"
import { LocationPicker } from "@/components/location-picker"
import { DELIVERABLES, GROUPS, fieldsFor, reportHref, type Deliverable, type Field } from "@/lib/report-builder"

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
  const [error, setError] = useState("")

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

  const start = () => {
    setError("")
    if (!ordered.length) return setError("Choose at least one thing for the report.")
    const missing: string[] = []
    if (fields.has("maps") && !maps.trim()) missing.push("the Google Maps link")
    if (fields.has("website") && !web.trim()) missing.push("the website")
    if (fields.has("keyword") && !kw.trim()) missing.push("the main keyword")
    if (fields.has("name") && !name.trim()) missing.push("the business name")
    if (fields.has("youtube") && !yt.trim()) missing.push("the YouTube channel")
    if (missing.length) return setError(`Add ${missing.join(", ")}.`)
    router.push(
      reportHref(ordered, {
        maps: maps.trim() || undefined,
        web: web.trim() || undefined,
        kw: kw.trim() || undefined,
        loc: loc || undefined,
        name: name.trim() || undefined,
        yt: yt.trim() || undefined,
        svc: svc
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length >= 2)
          .slice(0, 10),
      }),
    )
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
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-deep"
              >
                <Zap className="h-4 w-4" aria-hidden /> Build report
              </button>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </section>
        </>
      )}
    </div>
  )
}
