"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { Copy, ExternalLink, Link2, Loader2, MapPin, Search, Star } from "lucide-react"
import { BUY_CREDITS_HREF } from "@/lib/credits"
import type { Business } from "@/lib/gbp-audit"

const field =
  "flex h-11 items-center gap-2.5 rounded-xl border border-border bg-background px-3 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20"
const input = "h-full w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"

/** The business by its Maps link, and the keyword the tool works around. */
export function BusinessForm({
  keyword = "required",
  busy,
  busyLabel,
  cta,
  costs,
  onSubmit,
}: {
  keyword?: "required" | "optional" | "none"
  busy: boolean
  busyLabel: string
  cta: string
  /** The price line under the form. */
  costs?: ReactNode
  onSubmit: (v: { url: string; keyword: string }) => void
}) {
  const [url, setUrl] = useState("")
  const [kw, setKw] = useState("")
  const [problem, setProblem] = useState("")
  const submit = () => {
    if (busy) return
    if (!url.trim()) return setProblem("Paste a Google Maps link to a business.")
    if (keyword === "required" && kw.trim().length < 2) return setProblem("Enter the keyword to write around.")
    setProblem("")
    onSubmit({ url: url.trim(), keyword: kw.trim() })
  }
  const onKey = (e: React.KeyboardEvent) => e.key === "Enter" && submit()
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,.04)] sm:p-5">
      <div className={`grid gap-3 lg:items-end ${keyword === "none" ? "lg:grid-cols-[minmax(0,1fr)_auto]" : "lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_auto]"}`}>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Google Maps link</span>
          <span className={field}>
            <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            {/* type="text", not "url": a bare Place ID or "maps.app.goo.gl/…" without a scheme is fine too */}
            <input className={input} placeholder="https://maps.app.goo.gl/…" inputMode="url" autoComplete="off" spellCheck={false} value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={onKey} />
          </span>
        </label>
        {keyword !== "none" && (
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Keyword {keyword === "optional" && <span className="font-normal">(optional)</span>}
            </span>
            <span className={field}>
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <input className={input} placeholder="e.g. emergency plumber" maxLength={80} value={kw} onChange={(e) => setKw(e.target.value)} onKeyDown={onKey} />
            </span>
          </label>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {busy ? busyLabel : cta}
        </button>
      </div>
      {problem && <p className="mt-2 text-xs text-red-600" role="alert">{problem}</p>}
      {costs && <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-xs text-muted-foreground">{costs}</div>}
    </section>
  )
}

/** The business the answer is about, so a wrong link is obvious at once. */
export function BusinessCard({ business: b, children }: { business: Business; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
      {b.logo || b.mainImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- a Google-hosted photo
        <img src={(b.logo ?? b.mainImage)!} alt="" referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded-full bg-white object-cover ring-1 ring-border" />
      ) : (
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">{b.name.slice(0, 2).toUpperCase()}</span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{b.name}</div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {b.category && <span>{b.category}</span>}
          {b.rating != null && (
            <span className="inline-flex items-center gap-1">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden /> {b.rating.toFixed(1)} ({b.reviewCount ?? 0})
            </span>
          )}
          {b.address && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden /> <span className="truncate">{b.address}</span>
            </span>
          )}
        </div>
      </div>
      {children}
      {b.mapsUrl && (
        <a href={b.mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
          Open on Google Maps <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      )}
    </div>
  )
}

export function ErrorBox({ error }: { error: { message: string; credits: boolean } | null }) {
  if (!error) return null
  return (
    <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-xs text-red-600">
      {error.message}{" "}
      {error.credits && (
        <Link href={BUY_CREDITS_HREF} className="underline">
          Buy credits
        </Link>
      )}
    </div>
  )
}

/** Copies `text`, and says so. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [note, setNote] = useState("")
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setNote("Copied")
    } catch {
      setNote("Select and copy by hand")
    }
    setTimeout(() => setNote(""), 2000)
  }
  return (
    <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline">
      <Copy className="h-3.5 w-3.5" aria-hidden /> <span aria-live="polite">{note || label}</span>
    </button>
  )
}

/** While Google's data is fetched the first time. */
export function Waiting({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-4 py-6 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand" aria-hidden />
      <span>{children}</span>
    </div>
  )
}
