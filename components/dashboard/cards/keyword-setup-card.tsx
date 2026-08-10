"use client"

/**
 * Keyword setup state for a project with no keywords yet.
 *
 * Mirrors the Site Audit card's running state — an indeterminate striped bar
 * and a plain description of what's happening — because the two are the same
 * kind of wait: a background job with no percentage to report.
 *
 * It reads the REAL run (GET …/keyword-suggestions) rather than assuming one is
 * in flight, so each state says something true:
 *   • no run yet   → offer to start it (and say what it will do)
 *   • PENDING/RUNNING → collecting data, with the stripe
 *   • COMPLETED    → suggestions are ready to pick from
 *   • FAILED       → what went wrong, plus add-by-hand and retry
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { Link } from "@/i18n/navigation"
import { Sparkles } from "lucide-react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

type RunStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED"
type Run = { id: string; status: RunStatus; error: string | null; completedAt: string | null }

const POLL_MS = 4_000

/** Indeterminate progress — the job reports no percentage, so this reports none. */
function Stripe() {
  return (
    <div
      aria-hidden
      className="h-2 overflow-hidden rounded-full"
      style={{
        background: "var(--bg-inset)",
        backgroundImage: "repeating-linear-gradient(45deg, var(--border) 0 10px, var(--bg-inset) 10px 20px)",
        backgroundSize: "28px 28px",
        animation: "fs-crawl-stripe 1s linear infinite",
      }}
    />
  )
}

export function KeywordSetupCard({
  projectId, domain, autoStart = false,
}: {
  projectId: string
  domain: string
  /** Kick the analysis off on mount when the project has never had one. */
  autoStart?: boolean
}) {
  const [run, setRun] = useState<Run | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const statusRef = useRef<RunStatus | null>(null)
  // Guards the POST across StrictMode's mount → unmount → remount in dev, so a
  // single project can't enqueue two analyses.
  const startedRef = useRef(false)

  const load = useCallback(async () => {
    try {
      const { run: r } = await api.get<{ run: Run | null }>(`/api/projects/${projectId}/keyword-suggestions`)
      setRun(r)
      statusRef.current = r?.status ?? null
      return r
    } catch {
      return null
    }
  }, [projectId])

  const start = useCallback(async () => {
    if (startedRef.current) return
    startedRef.current = true
    setStarting(true)
    try {
      await api.post(`/api/projects/${projectId}/keyword-suggestions`, {})
      await load()
    } catch {
      // Leave the run as-is; the poll below will pick it up if it did start.
    } finally {
      setStarting(false)
    }
  }, [projectId, load])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void load().then((r) => {
      if (cancelled) return
      setLoading(false)
      if (autoStart && !r) void start()
    })
    return () => { cancelled = true }
  }, [load, start, autoStart])

  // Poll only while there's something to wait for.
  useEffect(() => {
    const t = setInterval(() => {
      if (statusRef.current === "PENDING" || statusRef.current === "RUNNING") void load()
    }, POLL_MS)
    return () => clearInterval(t)
  }, [load])

  if (loading) return <Skeleton className="h-24 w-full rounded-lg" />

  const working = starting || run?.status === "PENDING" || run?.status === "RUNNING"

  return (
    <section className="rounded-lg border bg-card p-4 shadow-sm">
      {working ? (
        <>
          <div className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold">
            <Sparkles className="size-4 text-primary" /> Collecting keyword data…
          </div>
          <Stripe />
          <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
            We&apos;re reading <span className="font-medium text-foreground">{domain}</span>, picking the keywords it
            should rank for, and checking where it stands today. This usually takes a minute or two — you can leave
            this page, it keeps running in the background.
          </p>
        </>
      ) : run?.status === "COMPLETED" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold">Your keywords are ready to pick</div>
            <p className="mt-1 text-xs text-muted-foreground">
              We analysed {domain} and shortlisted the keywords worth tracking. Choose the ones you want and we&apos;ll
              start checking their rank.
            </p>
          </div>
          <Button asChild size="sm" className="h-8 text-xs">
            <Link href={`/dashboard/project/${projectId}/keywords`}>Choose keywords</Link>
          </Button>
        </div>
      ) : run?.status === "FAILED" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold">We couldn&apos;t analyse {domain}</div>
            <p className="mt-1 max-w-xl text-xs text-muted-foreground">
              {run.error || "The site blocked our crawler, or it was unreachable."} You can add keywords by hand instead.
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { startedRef.current = false; void start() }}>Try again</Button>
            <Button asChild size="sm" className="h-8 text-xs"><Link href={`/dashboard/project/${projectId}/keywords`}>Add keywords</Link></Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold">No keywords yet</div>
            <p className="mt-1 max-w-xl text-xs text-muted-foreground">
              Let AI read {domain} and suggest the keywords it should rank for — or add your own and we&apos;ll start
              tracking them right away.
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={starting} onClick={() => void start()}>
              <Sparkles className="size-3.5" /> Analyse with AI
            </Button>
            <Button asChild size="sm" variant="outline" className="h-8 text-xs">
              <Link href={`/dashboard/project/${projectId}/keywords`}>Add manually</Link>
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
