"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft } from "lucide-react"
import { useParams, useSearchParams } from "next/navigation"
import { APIProvider } from "@vis.gl/react-google-maps"
import { Link, useRouter } from "@/i18n/navigation"
import { api, ApiError } from "@/lib/api"
import { MapCard } from "@/components/maps-tracker/map-card"
import { ScanMap, type MapPinData } from "@/components/maps-tracker/scan-map"
import { KeywordTabs } from "@/components/maps-tracker/keyword-tabs"
import { SolvHero, MetricTiles } from "@/components/maps-tracker/results-summary"
import { RankDistributionCard } from "@/components/maps-tracker/rank-distribution"
import { WhereYouStand } from "@/components/maps-tracker/where-you-stand"
import { AiAnalysis } from "@/components/maps-tracker/ai-analysis"
import { ScanProgress, MetricSkeletons } from "@/components/maps-tracker/scan-progress"
import { PointDrawer } from "@/components/maps-tracker/point-drawer"
import { useCompetitors } from "@/components/maps-tracker/use-competitors"
import { KM_TO_METERS, MILES_TO_METERS, type RankBandKey } from "@/components/maps-tracker/grid"
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
 * One scan, at its own url.
 *
 * Both halves of a scan's life live here: the progress screen while points are
 * landing, and the results once they have. Putting them on the scan's own route
 * is what makes a running scan survive a refresh — it used to exist only in the
 * builder's state, so reloading lost track of it until the history table
 * refreshed.
 *
 * A dynamic segment is never statically rendered, so `useSearchParams` needs no
 * Suspense boundary here — unlike the builder at /new.
 */
export default function ScanPage() {
  const router = useRouter()
  const params = useParams<{ scanId: string }>()
  const searchParams = useSearchParams()
  const scanId = params.scanId

  const [scan, setScan] = useState<Scan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [activeKeywordId, setActiveKeywordId] = useState<string | null>(null)
  const [activeBand, setActiveBand] = useState<RankBandKey | null>(null)
  const [openPointId, setOpenPointId] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const running = scan != null && !isTerminal(scan.status)
  const showResults = scan != null && isTerminal(scan.status)

  const activeKeyword = useMemo(
    () => scan?.keywords.find((k) => k.id === activeKeywordId) ?? scan?.keywords[0] ?? null,
    [scan, activeKeywordId],
  )

  const { leaderboard, loading: leaderboardLoading } = useCompetitors(
    scan?.id ?? null,
    activeKeyword?.id ?? null,
    showResults,
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
        // The AI report is generated as a separate step AFTER the scan itself
        // finishes, so a terminal scan status alone doesn't mean there's nothing
        // left to wait for — keep polling until the AI report (if one was
        // requested) also settles, otherwise the "writing up…" state never
        // notices it finish.
        const aiSettled =
          !updated.aiAnalysisRequested ||
          !updated.aiReport ||
          updated.aiReport.status === "COMPLETED" ||
          updated.aiReport.status === "FAILED"
        if (isTerminal(updated.status) && aiSettled) stopPolling()
      } catch (err) {
        if (cancelled) return
        // Only the very first fetch can say "this scan isn't here". After that
        // we have good data on screen and a failed poll is just transient.
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

  // The tab comes from the url so a history row can open its own keyword, and
  // so a shared link lands on the reading it was shared for.
  useEffect(() => {
    if (!scan) return
    const wanted = searchParams.get("k")
    const exists = wanted && scan.keywords.some((k) => k.id === wanted)
    setActiveKeywordId(exists ? wanted : scan.keywords[0]?.id ?? null)
  }, [scan, searchParams])

  function selectKeyword(id: string) {
    setActiveKeywordId(id)
    setActiveBand(null)
    setOpenPointId(null)
    // replace, not push: flipping between tabs shouldn't build up history the
    // Back button then has to walk out of.
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

  // Esc unwinds one layer at a time: the drawer, then the band filter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (openPointId) setOpenPointId(null)
      else if (activeBand) setActiveBand(null)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [openPointId, activeBand])

  const backLink = (
    <div className="tiny muted" style={{ marginBottom: 10 }}>
      <Link href={LIST} className="row" style={{ gap: 4, display: "inline-flex" }}>
        <ArrowLeft size={13} /> All scans
      </Link>
    </div>
  )

  if (notFound) {
    return (
      <div className="page">
        {backLink}
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <div className="b" style={{ marginBottom: 6 }}>That scan isn&apos;t here</div>
          <div className="tiny muted">It may have been removed, or it belongs to another account.</div>
        </div>
      </div>
    )
  }

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="page">
        {backLink}
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <div className="b" style={{ marginBottom: 6 }}>Add a Google Maps API key</div>
          <div className="tiny muted">
            Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in the frontend&apos;s .env to render the scan map.
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

  const pins: MapPinData[] | null = activeKeyword
    ? activeKeyword.points.map((p) => ({
        row: p.row, col: p.col, lat: p.latitude, lng: p.longitude,
        status: p.status, rank: p.rank, pointId: p.id,
      }))
    : null

  const theMap = (
    <ScanMap
      centerLat={scan.centerLat}
      centerLng={scan.centerLng}
      gridSize={scan.gridSize}
      radiusMeters={scan.radiusMeters}
      pins={pins}
      unit={scan.displayUnit}
      // Dropped once results are in: the centre point has a scored pin of its
      // own by then, and the marker sat on top of it — hiding the rank at the
      // business's own address, which is the one point people look for first.
      showCenterMarker={!showResults}
      dimBand={activeBand}
      openPointId={openPointId}
      onPinClick={(pin) => {
        if (pin.status === "SUCCEEDED" && pin.pointId) setOpenPointId(pin.pointId)
      }}
    />
  )

  const banner =
    scan.status === "PARTIAL" ? (
      <div className="tiny" style={{ padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--warn-soft)", color: "var(--warn)" }}>
        Finished with {scan.pointsDone} of {scan.totalPoints} points. The points that failed were refunded.
      </div>
    ) : scan.status === "FAILED" ? (
      <div className="tiny" style={{ padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--neg-soft)", color: "var(--neg)" }}>
        This scan couldn&apos;t run. {scan.errorMessage ?? "Your credits were returned."}
      </div>
    ) : scan.status === "CANCELLED" ? (
      <div className="tiny" style={{ padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--bg-inset)", color: "var(--text-soft)" }}>
        Cancelled after {scan.pointsDone} of {scan.totalPoints} points. Unused credits were returned.
      </div>
    ) : null

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
      <div className="page mt-page">
        {running && (
          <ScanProgress pointsDone={scan.pointsDone} totalPoints={scan.totalPoints} onCancel={() => void cancelScan()} />
        )}

        {!running && backLink}

        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{scan.location.name}</div>
            <div className="tiny muted">
              {scan.gridSize} × {scan.gridSize} grid · {radiusLabel(scan)} radius · scanned{" "}
              {new Date(scan.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </div>
          </div>
          {/* One button, not the reference's separate "Change setup" and
              "Re-scan": now that the builder is its own route, both would be
              the same link. It carries this scan's settings across rather than
              starting from defaults, so you land on them, adjust if you want,
              and the credit confirm is still the last step. */}
          {showResults && (
            <Link href={`${LIST}/new?from=${scan.id}`} className="btn primary">Scan again</Link>
          )}
        </div>

        {error && (
          <div
            className="tiny"
            style={{
              marginBottom: 14, padding: "10px 12px", borderRadius: "var(--r-md)",
              background: "var(--neg-soft)", color: "var(--neg)",
            }}
            role="alert"
          >
            {error}
          </div>
        )}

        {running && (
          <div className="mt-setup">
            <div className="mt-stack">
              <div className="card" style={{ padding: 20 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{scan.location.name}</div>
                <div className="tiny muted">
                  {/* Naming only the first of several keywords would misstate
                      what is actually being searched. */}
                  {scan.keywords.length === 1
                    ? `“${scan.keywords[0]!.keyword}”`
                    : `${scan.keywords.length} keywords`}
                  {" · "}{scan.gridSize} × {scan.gridSize}
                  {" · "}{radiusLabel(scan)}
                </div>
              </div>
              <MetricSkeletons />
            </div>
            <MapCard
              minHeight={392}
              // The promise on this screen is "points appear as they land", so
              // the map should say how many have.
              badge={`${scan.pointsDone} of ${scan.totalPoints} points searched`}
            >
              {theMap}
            </MapCard>
          </div>
        )}

        {showResults && activeKeyword && (
          <div className="mt-stack" style={{ gap: 18 }}>
            {banner}
            <KeywordTabs keywords={scan.keywords} activeId={activeKeyword.id} onChange={selectKeyword} />

            <div className="mt-results">
              <MapCard
                minHeight={404}
                note="Each pin is one real search run from that coordinate — click one to see the results it returned."
              >
                {theMap}
              </MapCard>
              <div className="mt-stack">
                <SolvHero
                  solv={activeKeyword.solv}
                  scoredPoints={activeKeyword.scoredPoints}
                  leaderSolv={leaderboard?.insights.topSolv ?? null}
                />
                <MetricTiles arp={activeKeyword.arp} atrp={activeKeyword.atrp} />
                <RankDistributionCard
                  points={activeKeyword.points}
                  bestRank={activeKeyword.bestRank}
                  worstRank={activeKeyword.worstRank}
                  activeBand={activeBand}
                  onBandToggle={(k) => setActiveBand((cur) => (cur === k ? null : k))}
                />
                <WhereYouStand
                  leaderboard={leaderboard}
                  loading={leaderboardLoading}
                  bestRank={activeKeyword.bestRank}
                  worstRank={activeKeyword.worstRank}
                  unit={scan.displayUnit}
                />
              </div>
            </div>

            <AiAnalysis scan={scan} />

            <div className="tiny muted" style={{ textAlign: "center", paddingTop: 4 }}>
              <Link href={`/reports/maps-tracker/${scan.id}/${activeKeyword.id}`} target="_blank">
                Open the shareable report for “{activeKeyword.keyword}”
              </Link>
            </div>
          </div>
        )}

        {openPointId && activeKeyword && (
          <PointDrawer
            scanId={scan.id}
            pointId={openPointId}
            keyword={activeKeyword.keyword}
            unit={scan.displayUnit}
            onClose={() => setOpenPointId(null)}
          />
        )}
      </div>
    </APIProvider>
  )
}
