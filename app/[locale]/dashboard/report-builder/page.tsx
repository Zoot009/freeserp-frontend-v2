"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, FileStack, Globe, MapPin, Search, Zap } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { api } from "@/lib/api"
import { DELIVERABLES, needsMaps, needsWebsite, reportHref, type Deliverable } from "@/lib/report-builder"

const box =
  "flex h-11 items-center gap-2.5 rounded-xl border border-border bg-background px-3 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20"
const inputCls = "h-full w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
const label = "mb-1.5 block text-xs font-medium text-muted-foreground"

// The AI engines a sample AEO audit asks: the three that cost the least (Claude is ~20x).
const SAMPLE_ENGINES = ["chatgpt", "gemini", "ai-overviews"]

export default function ReportBuilderPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [sel, setSel] = useState<Deliverable[]>([])
  const [mapsUrl, setMapsUrl] = useState("")
  const [keyword, setKeyword] = useState("")
  const [website, setWebsite] = useState("")
  const [starting, setStarting] = useState(false)
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
  const maps = needsMaps(sel)
  const site = needsWebsite(sel)
  // Keep the chosen order the same as the list, whatever order they were ticked in.
  const ordered = DELIVERABLES.map((d) => d.key).filter((k) => sel.includes(k))

  const start = async () => {
    setError("")
    if (!sel.length) return setError("Choose at least one thing for the report.")
    if (maps && !mapsUrl.trim()) return setError("Paste the business's Google Maps link.")
    if (site && !website.trim()) return setError("Enter the business's website.")
    setStarting(true)
    try {
      const [gbp, siteRun, aeo] = await Promise.all([
        maps ? api.post<{ audit: { id: string } }>("/api/gbp-audit", { url: mapsUrl.trim(), keyword: keyword.trim() || null }) : null,
        sel.includes("siteAudit") ? api.post<{ jobId: string }>("/api/page-audit", { url: website.trim(), mode: "site", maxPages: 100 }) : null,
        sel.includes("aeo") ? api.post<{ audit: { id: string } }>("/api/aeo-audit", { url: website.trim(), pages: 10, engines: SAMPLE_ENGINES }) : null,
      ])
      router.push(reportHref({ sel: ordered, gbp: gbp?.audit.id, siteJob: siteRun?.jobId, aeo: aeo?.audit.id }))
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't start the report. Please try again.")
      setStarting(false)
    }
  }

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1 className="flex items-center gap-2">
            <FileStack className="h-6 w-6 text-brand" aria-hidden /> Client Report Builder
          </h1>
          <div className="sub">
            Pick what the client should see, enter the business, and get one combined report with a PDF. For the in-house team only.
          </div>
        </div>
      </div>

      <h2 className="mb-3 text-[15px] font-semibold tracking-tight">1. What goes in the report</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DELIVERABLES.map((d) => {
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
                <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  {d.needs === "maps" ? <MapPin className="h-3 w-3" aria-hidden /> : <Globe className="h-3 w-3" aria-hidden />}
                  Needs the {d.needs === "maps" ? "Google Maps link" : "website"}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <button type="button" className="font-medium text-brand hover:underline" onClick={() => setSel(DELIVERABLES.map((d) => d.key))}>
          Select all
        </button>
        {sel.length > 0 && (
          <button type="button" className="text-muted-foreground hover:underline" onClick={() => setSel([])}>
            Clear
          </button>
        )}
      </div>

      {sel.length > 0 && (
        <>
          <h2 className="mb-3 mt-7 text-[15px] font-semibold tracking-tight">2. About the business</h2>
          <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
            {maps && (
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                <label className="block">
                  <span className={label}>Google Maps link of the business</span>
                  <span className={box}>
                    <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <input className={inputCls} placeholder="https://maps.app.goo.gl/…" value={mapsUrl} onChange={(e) => setMapsUrl(e.target.value)} />
                  </span>
                </label>
                <label className="block">
                  <span className={label}>
                    Main keyword <span className="font-normal">(optional)</span>
                  </span>
                  <span className={box}>
                    <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <input className={inputCls} placeholder="The primary category if blank" maxLength={80} value={keyword} onChange={(e) => setKeyword(e.target.value)} />
                  </span>
                </label>
              </div>
            )}
            {site && (
              <label className="block">
                <span className={label}>Website</span>
                <span className={box}>
                  <Globe className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <input className={inputCls} placeholder="clientbusiness.com" inputMode="url" value={website} onChange={(e) => setWebsite(e.target.value)} />
                </span>
              </label>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">
                {ordered.length} {ordered.length === 1 ? "section" : "sections"}: {ordered.map((k) => DELIVERABLES.find((d) => d.key === k)!.title).join(" · ")}. Takes 2 to 6
                minutes.
              </span>
              <button
                type="button"
                onClick={start}
                disabled={starting}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-deep disabled:opacity-60"
              >
                <Zap className="h-4 w-4" aria-hidden />
                {starting ? "Starting…" : "Build report"}
              </button>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </section>
        </>
      )}
    </div>
  )
}
