"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { useParams } from "next/navigation"
import { ArrowLeft, Download } from "lucide-react"
import { APIProvider } from "@vis.gl/react-google-maps"
import { Link, useRouter } from "@/i18n/navigation"
import { api, ApiError } from "@/lib/api"
import { ScanReport } from "@/components/maps-tracker/scan-report"
import { ScanMap, type MapPinData } from "@/components/maps-tracker/scan-map"
import { ScanProgress } from "@/components/maps-tracker/scan-progress"
import { KeywordChips } from "@/components/maps-tracker/keyword-chips"
import { useCompetitors } from "@/components/maps-tracker/use-competitors"
import { downloadScanCsv } from "@/components/maps-tracker/export-csv"
import type { Scan } from "@/components/maps-tracker/types"

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
const LIST = "/dashboard/google-maps-tracker"
const POLL_MS = 2000
/** How long a finished scan keeps polling for its AI report before leaving it to a reload. */
const AI_WAIT_MS = 5 * 60_000

function isTerminal(status: string): boolean {
  return status === "COMPLETED" || status === "PARTIAL" || status === "FAILED" || status === "CANCELLED"
}

/**
 * A scan, as its report — the ONE place a scan is read.
 *
 * Opening a scan from the list, from the report button, from the overview card
 * or straight after creating one all land here (the old dashboard scan url
 * forwards to it). A clean sheet with the FreeSERP letterhead, no dashboard
 * around it, so it reads and prints as a document. Owner-only: another account
 * gets a 404.
 *
 * The owner's controls sit in a bar above the letterhead — back to the scans,
 * export, scan again — with the keyword chips under the letterhead; both are
 * left out of print. While a scan is still running, the page shows its progress
 * and the map filling in, then becomes the report the moment the last point
 * lands.
 */
export default function ScanReportPage() {
  const router = useRouter()
  const params = useParams<{ scanId: string; keywordId: string }>()
  const [scan, setScan] = useState<Scan | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Apart from `error`, which every good poll clears: a failed Cancel must stay
  // on screen while the scan it didn't stop carries on.
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    // One request at a time: a slow one no longer stacks ten more behind it.
    let inFlight = false
    let terminalSince: number | null = null

    const tick = async (first = false) => {
      if (inFlight) return
      inFlight = true
      try {
        const { scan: updated } = await api.get<{ scan: Scan }>(`/api/maps-tracker/scans/${params.scanId}`)
        if (cancelled) return
        // Never back from finished to running: that is only ever a slow,
        // older answer landing after the newer one.
        setScan((prev) => (prev && isTerminal(prev.status) && !isTerminal(updated.status) ? prev : updated))
        setError(null)
        if (!isTerminal(updated.status)) return
        terminalSince ??= Date.now()
        // The AI report comes AFTER the scan finishes: its job is queued once
        // the status is final, and the report only exists once a worker picks
        // that up. So a finished scan with no report yet is still waiting on
        // it — treating that as settled stopped the polling for good and left
        // "Writing up…" spinning until a reload. Only a failed or cancelled
        // scan never gets one.
        const aiSettled =
          !updated.aiAnalysisRequested ||
          updated.status === "FAILED" ||
          updated.status === "CANCELLED" ||
          updated.aiReport?.status === "COMPLETED" ||
          updated.aiReport?.status === "FAILED"
        if (aiSettled || Date.now() - terminalSince > AI_WAIT_MS) stopPolling()
      } catch (err) {
        if (cancelled) return
        // Only the first fetch can say "this scan isn't here"; after that a
        // failed poll is transient and good data is already on screen.
        if (first) {
          if (err instanceof ApiError && err.status === 404) setNotFound(true)
          else setError(err instanceof ApiError ? err.message : "Couldn't load this report.")
          stopPolling()
        }
      } finally {
        inFlight = false
      }
    }

    void tick(true)
    pollRef.current = setInterval(() => void tick(), POLL_MS)
    return () => {
      cancelled = true
      stopPolling()
    }
  }, [params.scanId, stopPolling])

  const keyword = scan?.keywords.find((k) => k.id === params.keywordId) ?? null
  const running = scan != null && !isTerminal(scan.status)
  // Not CANCELLED: a cancelled scan is never finalised, so its keywords carry
  // no figures — as a report it read "0 searches" beside a map full of ranks.
  // It shows the points it reached instead, like a scan still running.
  const hasResults = scan?.status === "COMPLETED" || scan?.status === "PARTIAL"
  const isCancelled = scan?.status === "CANCELLED"

  // Its own fetch: the leaderboard is computed on demand, so a slow one never
  // holds up the rest of the report, and a failed one still leaves it readable.
  const { leaderboard, loading } = useCompetitors(params.scanId, params.keywordId, hasResults)

  // The map while points are landing — above the early returns, so the hook
  // count never changes between renders.
  const livePins = useMemo<MapPinData[] | null>(
    () =>
      keyword
        ? keyword.points.map((p) => ({
            row: p.row, col: p.col, lat: p.latitude, lng: p.longitude,
            status: p.status, rank: p.rank, pointId: p.id,
          }))
        : null,
    [keyword],
  )

  async function cancelScan() {
    if (!scan) return
    try {
      await api.post(`/api/maps-tracker/scans/${scan.id}/cancel`)
      stopPolling()
      router.push(LIST)
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : "Couldn't cancel the scan.")
    }
  }

  const message = (text: string) => (
    <div className="mt-page mt-report">
      <div className="mt-sheet" style={{ textAlign: "center" }}>
        <div className="tiny muted" style={{ padding: "40px 0 16px" }}>{text}</div>
        <Link href={LIST} className="btn sm">All scans</Link>
      </div>
    </div>
  )

  if (notFound) return message("That scan isn't here. It may have been removed, or it belongs to another account.")
  if (!scan) {
    return error ? message(error) : <div style={{ padding: 60, textAlign: "center" }} className="tiny muted">Loading report…</div>
  }
  if (!keyword) return message("This keyword isn't part of this scan.")

  // Counted from the points: pointsDone counts every point that finished,
  // failed ones included, so a partial scan read "49 of 49".
  const failedPoints = scan.keywords.reduce((n, k) => n + k.points.filter((p) => p.status === "FAILED").length, 0)

  const banner =
    scan.status === "PARTIAL" ? (
      <div className="mt-pm-banner" data-tone="warn">
        Finished with {scan.totalPoints - failedPoints} of {scan.totalPoints} points. The {failedPoints} that
        failed {failedPoints === 1 ? "was" : "were"} refunded.
      </div>
    ) : scan.status === "FAILED" ? (
      <div className="mt-pm-banner" data-tone="neg">
        This scan couldn&apos;t run. {scan.errorMessage ?? "Your credits were returned."}
      </div>
    ) : scan.status === "CANCELLED" ? (
      <div className="mt-pm-banner" data-tone="mute">
        Cancelled after {scan.pointsDone} of {scan.totalPoints} points. Unused credits were returned.
      </div>
    ) : null

  return (
    <div className="mt-page mt-report">
      <div className="mt-sheet">
        {/* The owner's controls. Never printed: a printed report is the
            document, not the tool that made it. */}
        <div className="mt-rbar">
          <Link href={LIST} className="mt-rbar-back">
            <ArrowLeft size={15} /> All scans
          </Link>
          <div className="mt-rbar-acts">
            {hasResults && (
              <button
                type="button"
                className="btn sm"
                onClick={() => downloadScanCsv(scan, keyword)}
                title="Every point's rank for this keyword, as a CSV"
              >
                <Download size={13} /> Export CSV
              </button>
            )}
            {isTerminal(scan.status) && (
              <Link href={`${LIST}/new?from=${scan.id}`} className="btn primary sm">Scan again</Link>
            )}
          </div>
        </div>

        <div className="row" style={{ justifyContent: "space-between", marginBottom: 40 }}>
          <div className="row" style={{ gap: 9 }}>
            {/* Same mark and wordmark as the dashboard sidebar. */}
            <Image src="/logo.png" alt="FreeSERP" width={32} height={32} className="mt-mark" priority />
            <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>FreeSERP</span>
          </div>
          <div className="tiny muted tabular">
            {new Date(scan.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }).toUpperCase()}
          </div>
        </div>

        {/* One report per keyword; a multi-keyword run switches between them. */}
        {scan.keywords.length > 1 && (
          <div className="mt-rbar-kws">
            <KeywordChips
              keywords={scan.keywords}
              activeId={keyword.id}
              onChange={(id) => router.replace(`/reports/maps-tracker/${scan.id}/${id}`, { scroll: false })}
            />
          </div>
        )}

        {banner && <div className="mt-rbanner">{banner}</div>}
        {(cancelError ?? error) && (
          <div className="mt-pm-banner mt-rbanner" data-tone="neg" role="alert">{cancelError ?? error}</div>
        )}

        {running || isCancelled ? (
          // Still scanning, or stopped part-way: the map with the points that
          // landed. Only a running scan has progress to show.
          <>
            <div style={{ maxWidth: 680, marginBottom: 24 }}>
              <div className="mt-eyebrow" style={{ marginBottom: 10 }}>Google Maps · &ldquo;{keyword.keyword}&rdquo;</div>
              <h2>{running ? "Scanning the neighbourhood…" : "Where it ranked before the scan was cancelled"}</h2>
            </div>
            {running && (
              <ScanProgress pointsDone={scan.pointsDone} totalPoints={scan.totalPoints} onCancel={() => void cancelScan()} />
            )}
            {GOOGLE_MAPS_API_KEY && livePins && (
              <div className="mt-rmap">
                <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
                  <ScanMap
                    centerLat={scan.centerLat}
                    centerLng={scan.centerLng}
                    gridSize={scan.gridSize}
                    radiusMeters={scan.radiusMeters}
                    pins={livePins}
                    unit={scan.displayUnit}
                    interactive={false}
                    zoomable
                    framePadding={0.045}
                    pinBoost={1.3}
                  />
                </APIProvider>
              </div>
            )}
          </>
        ) : hasResults ? (
          <>
            <ScanReport scan={scan} keyword={keyword} leaderboard={leaderboard} leaderboardLoading={loading} />
            <div className="tiny muted" style={{ marginTop: 40, paddingTop: 18, borderTop: "1px solid var(--border)" }}>
              Prepared by FreeSERP · every figure measured from the {keyword.scoredPoints} searches above
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
