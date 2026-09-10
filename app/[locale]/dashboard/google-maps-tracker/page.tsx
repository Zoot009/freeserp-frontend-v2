"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Plus } from "lucide-react"
import { useRouter } from "@/i18n/navigation"
import { api } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"
import { ToolContext } from "@/components/dashboard/tool-context"
import { ScanHistory } from "@/components/maps-tracker/scan-history"
import type { ScanHistoryItem } from "@/components/maps-tracker/types"

const NEW_SCAN = "/dashboard/google-maps-tracker/new"
// Only while something is still running — a settled list doesn't change on its
// own, and this page is somewhere people leave open.
const POLL_MS = 5000

function isTerminal(status: string): boolean {
  return status === "COMPLETED" || status === "PARTIAL" || status === "FAILED" || status === "CANCELLED"
}

/**
 * Every scan this account has run, newest first.
 *
 * One row per keyword rather than per scan: a three-keyword scan produces three
 * separate readings, each with its own heatmap and its own top-3 number, and
 * they're read one at a time. That also lines up with the report URL, which is
 * already per keyword.
 *
 * An account that has never scanned is sent straight to the builder — a list
 * with nothing in it teaches nobody anything, and the thing they came to do is
 * one screen further on.
 */
export default function GoogleMapsTrackerPage() {
  const router = useRouter()
  const [history, setHistory] = useState<ScanHistoryItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const redirected = useRef(false)

  const load = useCallback(async () => {
    try {
      const { scans } = await api.get<{ scans: ScanHistoryItem[] }>("/api/maps-tracker/scans")
      setHistory(scans)
      setFailed(false)
      return scans
    } catch {
      // An API error is not "you have no scans" — leaving `history` null keeps
      // the first-run redirect below from firing on a failed request.
      setFailed(true)
      return null
    }
  }, [])

  useEffect(() => {
    void load()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [load])

  // Keep the list honest while a scan is in flight, and stop as soon as
  // everything has settled.
  const hasRunning = history != null && history.some((s) => !isTerminal(s.status))
  useEffect(() => {
    if (!hasRunning) {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      return
    }
    if (pollRef.current) return
    pollRef.current = setInterval(() => void load(), POLL_MS)
  }, [hasRunning, load])

  // First visit: nothing to list, so go where the work happens. `replace`, not
  // `push`, so Back doesn't bounce them straight into the empty list again.
  useEffect(() => {
    if (history != null && history.length === 0 && !redirected.current) {
      redirected.current = true
      router.replace(NEW_SCAN)
    }
  }, [history, router])

  const scans = history ?? []
  // Reports, not scans: a run of three keywords is three readings, and that is
  // the number worth stating.
  const reportCount = useMemo(
    () => scans.reduce((n, s) => n + s.keywords.length, 0),
    [scans],
  )

  if (history == null && !failed) {
    return (
      <div className="page" style={{ color: "var(--text-mute)", fontSize: 13, padding: 60, textAlign: "center" }}>
        Loading…
      </div>
    )
  }

  return (
    <div className="page mt-page">
      <div className="page-h">
        <div>
          <h1>Google Maps Rank Tracker</h1>
          <div className="sub">
            Every grid scan you&apos;ve run. Open one to see where you ranked, block by block.
          </div>
        </div>
        <button type="button" className="btn primary" onClick={() => router.push(NEW_SCAN)}>
          <Plus size={14} /> New scan
        </button>
      </div>

      <ToolContext id="maps-tracker" />

      {failed && (
        <div
          className="tiny"
          style={{
            margin: "16px 0", padding: "10px 12px", borderRadius: "var(--r-md)",
            background: "var(--neg-soft)", color: "var(--neg)",
          }}
          role="alert"
        >
          Couldn&apos;t load your scans. Refresh to try again.
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>
            {reportCount} {reportCount === 1 ? "report" : "reports"}
            {scans.length > 0 && (
              <span className="tiny muted" style={{ fontWeight: 400 }}>
                {" "}from {scans.length} {scans.length === 1 ? "scan" : "scans"}
              </span>
            )}
          </div>
        </div>

        {failed && history == null ? (
          // The fetch never landed. Saying "nothing scanned yet" here would be
          // a guess dressed up as a fact.
          <div className="card" style={{ padding: 32, textAlign: "center" }}>
            <div className="tiny muted">Your scans couldn&apos;t be loaded just now.</div>
          </div>
        ) : scans.length === 0 && !failed ? (
          // Normally unreachable — an empty account is redirected to the
          // builder above. This is what's left if that redirect is blocked.
          <div
            className="card"
            style={{
              border: "1px dashed var(--border-strong)", background: "transparent",
              textAlign: "center", padding: 40,
            }}
          >
            <div className="eyebrow"><span className="spark"><Icon.spark /></span> Nothing scanned yet</div>
            <div className="b" style={{ margin: "8px 0 14px" }}>
              Pick a business and a keyword, and we&apos;ll search from every point on a grid around it.
            </div>
            <button type="button" className="btn primary" onClick={() => router.push(NEW_SCAN)}>
              <Plus size={14} /> New scan
            </button>
          </div>
        ) : (
          <ScanHistory
            scans={scans}
            onOpen={(scanId, keywordId) =>
              router.push(`/dashboard/google-maps-tracker/${scanId}?k=${keywordId}`)
            }
          />
        )}
      </div>
    </div>
  )
}
