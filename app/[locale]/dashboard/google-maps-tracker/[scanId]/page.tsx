"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, Download, ExternalLink } from "lucide-react"
import { useParams, useSearchParams } from "next/navigation"
import { APIProvider } from "@vis.gl/react-google-maps"
import { Link, useRouter } from "@/i18n/navigation"
import { api, ApiError } from "@/lib/api"
import { ScanReport } from "@/components/maps-tracker/scan-report"
import { ScanMap, type MapPinData } from "@/components/maps-tracker/scan-map"
import { ScanProgress } from "@/components/maps-tracker/scan-progress"
import { KeywordChips } from "@/components/maps-tracker/keyword-chips"
import { useCompetitors } from "@/components/maps-tracker/use-competitors"
import { downloadScanCsv } from "@/components/maps-tracker/export-csv"
import { KM_TO_METERS, MILES_TO_METERS } from "@/components/maps-tracker/grid"
import type { Scan } from "@/components/maps-tracker/types"

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
const LIST = "/dashboard/google-maps-tracker"
const POLL_MS = 2000

function isTerminal(status: string): boolean {
  return status === "COMPLETED" || status === "PARTIAL" || status === "FAILED" || status === "CANCELLED"
}

const radiusLabel = (scan: Scan) =>
  `${(scan.radiusMeters / (scan.displayUnit === "IMPERIAL" ? MILES_TO_METERS : KM_TO_METERS)).toFixed(2)} ${
    scan.displayUnit === "IMPERIAL" ? "mi" : "km"
  }`

/**
 * One scan, at its own url, read as a report.
 *
 * Opening a scan used to land in a map-first workspace — a docked rail of
 * cards over a full-screen map. It is now the report itself (ScanReport, the
 * same document the shareable link shows), with the dashboard's actions above
 * it: back to the list, switch keyword, open the shareable report, export,
 * scan again.
 *
 * Both halves of a scan's life still live here: while points are landing it
 * shows the progress and the map filling in; once they have, the report.
 *
 * A dynamic segment is never statically rendered, so `useSearchParams` needs
 * no Suspense boundary here — unlike the builder at /new.
 */
export default function ScanPage() {
  const router = useRouter()
  const params = useParams<{ scanId: string }>()
  const searchParams = useSearchParams()
  const scanId = params.scanId

  const [scan, setScan] = useState<Scan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const running = scan != null && !isTerminal(scan.status)
  const hasResults = scan != null && isTerminal(scan.status) && scan.status !== "FAILED"

  // The keyword comes from the url, so a list card opens its own keyword and a
  // shared link lands on the reading it was shared for. `keyword` is accepted
  // alongside `k` so links written against the older spelling still resolve.
  const activeKeyword = useMemo(() => {
    if (!scan) return null
    const wanted = searchParams.get("k") ?? searchParams.get("keyword")
    return scan.keywords.find((k) => k.id === wanted) ?? scan.keywords[0] ?? null
  }, [scan, searchParams])

  const { leaderboard, loading: leaderboardLoading } = useCompetitors(
    scan?.id ?? null,
    activeKeyword?.id ?? null,
    hasResults,
  )

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const tick = async (first = false) => {
      try {
        const { scan: updated } = await api.get<{ scan: Scan }>(`/api/maps-tracker/scans/${scanId}`)
        if (cancelled) return
        setScan(updated)
        setError(null)
        // The AI report is generated AFTER the scan finishes, so a terminal
        // status alone isn't the end — keep polling until a requested AI
        // report settles too, or its section never notices it finish.
        const aiSettled =
          !updated.aiAnalysisRequested ||
          !updated.aiReport ||
          updated.aiReport.status === "COMPLETED" ||
          updated.aiReport.status === "FAILED"
        if (isTerminal(updated.status) && aiSettled) stopPolling()
      } catch (err) {
        if (cancelled) return
        // Only the first fetch can say "this scan isn't here"; after that a
        // failed poll is transient and good data is already on screen.
        if (first) {
          if (err instanceof ApiError && err.status === 404) setNotFound(true)
          else setError(err instanceof ApiError ? err.message : "Couldn't load this scan.")
          stopPolling()
        }
      }
    }

    void tick(true)
    pollRef.current = setInterval(() => void tick(), POLL_MS)
    return () => {
      cancelled = true
      stopPolling()
    }
  }, [scanId, stopPolling])

  function selectKeyword(id: string) {
    // replace, not push: flipping keywords shouldn't build history the Back
    // button then has to walk out of.
    router.replace(`${LIST}/${scanId}?k=${id}`, { scroll: false })
  }

  async function cancelScan() {
    if (!scan) return
    try {
      await api.post(`/api/maps-tracker/scans/${scan.id}/cancel`)
      stopPolling()
      router.push(LIST)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't cancel the scan.")
    }
  }

  // The map while points are landing — declared with the other hooks, above
  // the early returns, so the hook count never changes between renders.
  const livePins = useMemo<MapPinData[] | null>(
    () =>
      activeKeyword
        ? activeKeyword.points.map((p) => ({
            row: p.row, col: p.col, lat: p.latitude, lng: p.longitude,
            status: p.status, rank: p.rank, pointId: p.id,
          }))
        : null,
    [activeKeyword],
  )

  if (notFound) {
    return (
      <div className="page">
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <div className="b" style={{ marginBottom: 6 }}>That scan isn&apos;t here</div>
          <div className="tiny muted">It may have been removed, or it belongs to another account.</div>
          <div style={{ marginTop: 14 }}>
            <Link href={LIST} className="btn">All scans</Link>
          </div>
        </div>
      </div>
    )
  }

  if (!scan) {
    return (
      <div className="page" style={{ color: "var(--text-mute)", fontSize: 13, padding: 60, textAlign: "center" }}>
        {error ?? "Loading scan…"}
      </div>
    )
  }

  const banner =
    scan.status === "PARTIAL" ? (
      <div className="mt-pm-banner" data-tone="warn">
        Finished with {scan.pointsDone} of {scan.totalPoints} points. The points that failed were refunded.
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
    // mt-page: the maps-tracker scope — its own line colour and container
    // queries, which the competitor list and banners draw on.
    <div className="page mt-page">
      <div className="mt-sheet in-app">
        <header className="mt-rhead">
          <Link href={LIST} className="mt-rhead-back" aria-label="All scans">
            <ArrowLeft size={16} />
          </Link>
          <div className="mt-rhead-id">
            <div className="t">{scan.location.name}</div>
            <div className="s">
              {scan.gridSize} × {scan.gridSize} grid · {radiusLabel(scan)} radius ·{" "}
              {new Date(scan.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            </div>
          </div>
          <div className="mt-rhead-acts">
            {hasResults && activeKeyword && (
              <>
                <Link
                  className="btn sm"
                  href={`/reports/maps-tracker/${scan.id}/${activeKeyword.id}`}
                  target="_blank"
                  title="The same report on a clean page, for sharing or printing"
                >
                  <ExternalLink size={13} /> Open report
                </Link>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => downloadScanCsv(scan, activeKeyword)}
                  title="Every point's rank for this keyword, as a CSV"
                >
                  <Download size={13} /> Export CSV
                </button>
              </>
            )}
            {isTerminal(scan.status) && (
              <Link href={`${LIST}/new?from=${scan.id}`} className="btn primary sm">Scan again</Link>
            )}
          </div>
        </header>

        {/* One report per keyword; a multi-keyword run switches between them. */}
        {scan.keywords.length > 1 && (
          <div style={{ marginBottom: 24 }}>
            <KeywordChips keywords={scan.keywords} activeId={activeKeyword?.id ?? null} onChange={selectKeyword} />
          </div>
        )}

        {banner && <div className="mt-rbanner">{banner}</div>}
        {error && <div className="mt-pm-banner" data-tone="neg" role="alert" style={{ marginBottom: 20 }}>{error}</div>}

        {running ? (
          // Still scanning: the progress, and the map filling in as points land.
          <div className="mt-rlive">
            <ScanProgress pointsDone={scan.pointsDone} totalPoints={scan.totalPoints} onCancel={() => void cancelScan()} />
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
          </div>
        ) : hasResults && activeKeyword ? (
          <ScanReport
            scan={scan}
            keyword={activeKeyword}
            leaderboard={leaderboard}
            leaderboardLoading={leaderboardLoading}
          />
        ) : null}
      </div>
    </div>
  )
}
