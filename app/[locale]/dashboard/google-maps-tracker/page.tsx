"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { APIProvider } from "@vis.gl/react-google-maps"
import { api, ApiError } from "@/lib/api"
import { ToolContext } from "@/components/dashboard/tool-context"
import { CreditCostConfirm } from "@/components/dashboard/credit-cost"
import { CREDIT_ACTION_KEYS } from "@/lib/credits"
import { RailStep, SetupRail, type StepState } from "@/components/maps-tracker/rail"
import { BusinessStep } from "@/components/maps-tracker/step-business"
import { KeywordsStep } from "@/components/maps-tracker/step-keywords"
import { AreaStep } from "@/components/maps-tracker/step-area"
import { MapCard, MapEmptyState } from "@/components/maps-tracker/map-card"
import { ScanMap, type MapPinData } from "@/components/maps-tracker/scan-map"
import { KeywordTabs } from "@/components/maps-tracker/keyword-tabs"
import { SolvHero, MetricTiles } from "@/components/maps-tracker/results-summary"
import { RankDistributionCard } from "@/components/maps-tracker/rank-distribution"
import { WhereYouStand } from "@/components/maps-tracker/where-you-stand"
import { AiAnalysis } from "@/components/maps-tracker/ai-analysis"
import { ScanProgress, MetricSkeletons } from "@/components/maps-tracker/scan-progress"
import { ScanHistory, flattenHistoryRows } from "@/components/maps-tracker/scan-history"
import { PointDrawer } from "@/components/maps-tracker/point-drawer"
import { spacingCaption } from "@/components/maps-tracker/grid-controls"
import {
  KM_TO_METERS,
  MILES_TO_METERS,
  nearestRadiusStep,
  totalPoints,
  validateArea,
  type DistanceUnit,
  type RankBandKey,
} from "@/components/maps-tracker/grid"
import { useCompetitors } from "@/components/maps-tracker/use-competitors"
import type { MapLocation, Scan, ScanHistoryItem, CreateScanResponse } from "@/components/maps-tracker/types"

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

// A 3 x 3 over 0.1 miles — the old defaults — is nine searches inside one
// block, which tells nobody anything. These are the settings the redesign
// previews, and the ones a first scan should actually be run at.
const DEFAULT_GRID_SIZE = 7
const DEFAULT_RADIUS = 1.5
const POLL_MS = 2000
// Geographic center of the continental US — just a reasonable starting view
// before any location is picked; the map re-centers via fitBounds once one is.
const DEFAULT_MAP_CENTER = { lat: 39.8283, lng: -98.5795 }

function isTerminal(status: string): boolean {
  return status === "COMPLETED" || status === "PARTIAL" || status === "FAILED" || status === "CANCELLED"
}

export default function GoogleMapsTrackerPage() {
  const [locations, setLocations] = useState<MapLocation[]>([])
  const [currentLocation, setCurrentLocation] = useState<MapLocation | null>(null)
  // Lets the user drag the centre pin to preview ranking from a spot other
  // than the business's stored address. Reset whenever the location itself
  // changes, so switching businesses doesn't carry over a stale drag offset.
  const [centerOverride, setCenterOverride] = useState<{ lat: number; lng: number } | null>(null)
  const [keywords, setKeywords] = useState<string[]>([])
  const [gridSize, setGridSize] = useState(DEFAULT_GRID_SIZE)
  const [radius, setRadius] = useState(DEFAULT_RADIUS)
  const [unit, setUnit] = useState<DistanceUnit>("IMPERIAL")
  const [aiRequested, setAiRequested] = useState(true)

  const [scan, setScan] = useState<Scan | null>(null)
  const [history, setHistory] = useState<ScanHistoryItem[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Which step is open. Explicit state, not derived from what's been answered:
  // deriving it collapsed the keyword step the instant the first keyword
  // landed, so you couldn't type a second one without reopening it.
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | null>(1)
  const [activeBand, setActiveBand] = useState<RankBandKey | null>(null)
  const [activeKeywordId, setActiveKeywordId] = useState<string | null>(null)
  const [openPointId, setOpenPointId] = useState<string | null>(null)
  const [confirmScan, setConfirmScan] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const running = scan != null && !isTerminal(scan.status)
  const showResults = scan != null && isTerminal(scan.status)
  const searches = totalPoints(gridSize, keywords.length || 1)

  const activeKeyword = useMemo(
    () => scan?.keywords.find((k) => k.id === activeKeywordId) ?? scan?.keywords[0] ?? null,
    [scan, activeKeywordId],
  )

  const { leaderboard, loading: leaderboardLoading } = useCompetitors(
    scan?.id ?? null,
    activeKeyword?.id ?? null,
    showResults,
  )

  useEffect(() => {
    setCenterOverride(null)
  }, [currentLocation?.id])

  // Move to keywords as soon as there's a business, and back to step 1 if the
  // business goes away. Anything else the user drives with the Edit links.
  useEffect(() => {
    setActiveStep((cur) => (currentLocation == null ? 1 : cur === 1 ? 2 : cur))
  }, [currentLocation])

  // A new scan is a new set of keywords and a new heatmap; carrying over the
  // previous selection would show the wrong tab and a stale filter.
  useEffect(() => {
    setActiveKeywordId(scan?.keywords[0]?.id ?? null)
    setActiveBand(null)
    setOpenPointId(null)
  }, [scan?.id])

  const effectiveCenter =
    centerOverride ?? (currentLocation ? { lat: currentLocation.latitude, lng: currentLocation.longitude } : null)

  const loadLocations = useCallback(async () => {
    try {
      const { locations } = await api.get<{ locations: MapLocation[] }>("/api/maps-tracker/locations")
      setLocations(locations)
      setCurrentLocation((cur) => cur ?? locations[0] ?? null)
    } catch {
      /* non-fatal — location list stays empty */
    }
  }, [])

  const loadHistory = useCallback(async () => {
    try {
      const { scans } = await api.get<{ scans: ScanHistoryItem[] }>("/api/maps-tracker/scans")
      setHistory(scans)
      return scans
    } catch {
      return []
    }
  }, [])

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const pollScan = useCallback(
    (scanId: string) => {
      stopPolling()
      const tick = async () => {
        try {
          const { scan: updated } = await api.get<{ scan: Scan }>(`/api/maps-tracker/scans/${scanId}`)
          setScan(updated)
          // The AI report is generated as a separate step AFTER the scan
          // itself finishes, so a terminal scan status alone doesn't mean
          // there's nothing left to wait for — keep polling until the AI
          // report (if one was requested) also reaches a terminal status,
          // otherwise the "writing up…" state never notices it finish.
          const aiSettled =
            !updated.aiAnalysisRequested ||
            !updated.aiReport ||
            updated.aiReport.status === "COMPLETED" ||
            updated.aiReport.status === "FAILED"
          if (isTerminal(updated.status) && aiSettled) {
            stopPolling()
            void loadHistory()
          }
        } catch {
          /* transient — keep polling */
        }
      }
      void tick()
      pollRef.current = setInterval(() => void tick(), POLL_MS)
    },
    [stopPolling, loadHistory],
  )

  useEffect(() => {
    void loadLocations()
    let cancelled = false
    ;(async () => {
      const scans = await loadHistory()
      if (cancelled) return
      const inFlight = scans.find((s) => !isTerminal(s.status))
      if (inFlight) pollScan(inFlight.id)
    })()
    return () => {
      cancelled = true
      stopPolling()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const historyRows = useMemo(() => flattenHistoryRows(history), [history])

  async function runScan() {
    if (!currentLocation || keywords.length === 0 || running) return
    setError(null)
    setSubmitting(true)
    try {
      const result = await api.post<CreateScanResponse>("/api/maps-tracker/scans", {
        locationId: currentLocation.id,
        platform: "GOOGLE_MAPS",
        keywords,
        gridSize,
        radius,
        unit,
        generateAiAnalysis: aiRequested,
        // Dragging the centre pin previews ranking from a spot other than the
        // business's stored address — omit entirely when it hasn't moved, so
        // the backend just uses the location's own coordinates as before.
        ...(centerOverride ? { centerLat: centerOverride.lat, centerLng: centerOverride.lng } : {}),
      })
      pollScan(result.scanId)
    } catch (err) {
      // Covers the 5-per-minute create limit as well as validation and quota
      // refusals — the message the server sends is the useful one.
      setError(err instanceof ApiError ? err.message : "Couldn't start the scan.")
    } finally {
      setSubmitting(false)
    }
  }

  // Wraps setCurrentLocation for USER-initiated picks only — not the
  // mount-time auto-select of the first saved location, and not the
  // mount-time resume of an in-flight scan. Without clearing `scan` here, the
  // map and results stayed locked onto the previous business's scan.
  function selectLocation(loc: MapLocation) {
    setCurrentLocation(loc)
    stopPolling()
    setScan(null)
    setError(null)
    setActiveStep(null)
  }

  function removeLocation(locationId: string) {
    setLocations((prev) => prev.filter((l) => l.id !== locationId))
    if (currentLocation?.id === locationId) {
      setCurrentLocation(null)
      stopPolling()
      setScan(null)
    }
  }

  async function cancelScan() {
    if (!scan) return
    try {
      await api.post(`/api/maps-tracker/scans/${scan.id}/cancel`)
      const { scan: updated } = await api.get<{ scan: Scan }>(`/api/maps-tracker/scans/${scan.id}`)
      setScan(updated)
      stopPolling()
      void loadHistory()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't cancel the scan.")
    }
  }

  async function openScan(scanId: string) {
    setError(null)
    try {
      const { scan: opened } = await api.get<{ scan: Scan }>(`/api/maps-tracker/scans/${scanId}`)
      setScan(opened)
      // Adopt the opened scan's settings into the rail. Without this, "Re-scan"
      // and "Change setup" would silently act on whatever was last typed rather
      // than on the scan being looked at — the two buttons name the scan on
      // screen, so they have to mean it.
      const openedUnit = opened.displayUnit
      setUnit(openedUnit)
      setGridSize(opened.gridSize)
      setRadius(
        nearestRadiusStep(opened.radiusMeters / (openedUnit === "IMPERIAL" ? MILES_TO_METERS : KM_TO_METERS), openedUnit),
      )
      setKeywords(opened.keywords.map((k) => k.keyword))
      setCurrentLocation((cur) => (cur?.id === opened.location.id ? cur : locations.find((l) => l.id === opened.location.id) ?? cur))
      setActiveStep(null)
      if (!isTerminal(opened.status)) pollScan(scanId)
      window.scrollTo({ top: 0, behavior: "smooth" })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't open that scan.")
    }
  }

  // Esc unwinds one layer at a time: the drawer, then the band filter. The
  // confirm dialog is a Radix Dialog and handles its own Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || confirmScan) return
      if (openPointId) setOpenPointId(null)
      else if (activeBand) setActiveBand(null)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [openPointId, activeBand, confirmScan])

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="page">
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <div className="b" style={{ marginBottom: 6 }}>Add a Google Maps API key</div>
          <div className="tiny muted">
            Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in the frontend&apos;s .env to enable the map, location search, and Place ID lookup.
          </div>
        </div>
      </div>
    )
  }

  // ── Rail ────────────────────────────────────────────────────────────────
  // A step is reachable once the ones before it have an answer. Reachable but
  // not open means it shows its summary; unreachable means it's visible and
  // dimmed, so the shape of what's left is legible without being clickable.
  const unlocked: Record<1 | 2 | 3, boolean> = {
    1: true,
    2: currentLocation != null,
    3: currentLocation != null && keywords.length > 0,
  }
  const stepState = (n: 1 | 2 | 3): StepState =>
    activeStep === n ? "active" : unlocked[n] ? "done" : "locked"

  const areaProblem = validateArea(gridSize, radius, unit, keywords.length || 1)
  const disabledReason =
    !currentLocation ? "Pick a business to continue"
    : keywords.length === 0 ? "Add at least one keyword"
    : areaProblem ?? null

  const rail = (
    <SetupRail
      showAi={currentLocation != null}
      aiRequested={aiRequested}
      onAiChange={setAiRequested}
      searches={searches}
      disabledReason={disabledReason}
      submitting={submitting}
      onRun={() => setConfirmScan(true)}
      steps={
        <>
          <RailStep
            n={1}
            title="Pick your business"
            state={stepState(1)}
            summaryKey="Business"
            summaryValue={currentLocation?.name}
            summarySub={currentLocation?.address}
            onEdit={() => setActiveStep(1)}
          >
            <BusinessStep
              locations={locations}
              current={currentLocation}
              onSelect={selectLocation}
              onCreated={(loc) => setLocations((prev) => [loc, ...prev.filter((l) => l.id !== loc.id)])}
              onDeleted={removeLocation}
            />
          </RailStep>

          <RailStep
            n={2}
            title="Add keywords"
            state={stepState(2)}
            hint={stepState(2) === "locked" ? "What people type when they look for you. Up to 10." : undefined}
            summaryKey={keywords.length > 0 ? `Keywords · ${keywords.length}` : undefined}
            summaryValue={
              <span className="row" style={{ gap: 5, marginTop: 6 }}>
                {keywords.map((k) => <span className="chip" key={k}>{k}</span>)}
              </span>
            }
            onEdit={() => setActiveStep(2)}
          >
            <KeywordsStep keywords={keywords} onChange={setKeywords} />
          </RailStep>

          <RailStep
            n={3}
            title="Set the area"
            state={stepState(3)}
            hint={stepState(3) === "locked" ? "How wide to look, and how fine the grid." : undefined}
            summaryKey="Area"
            summaryValue={`${radius} ${unit === "IMPERIAL" ? "mi" : "km"} radius · ${gridSize} × ${gridSize} grid`}
            summarySub={spacingCaption(gridSize, radius, unit)}
            onEdit={() => setActiveStep(3)}
          >
            <AreaStep
              gridSize={gridSize}
              radius={radius}
              unit={unit}
              keywordCount={keywords.length}
              onGridSize={setGridSize}
              onRadius={setRadius}
              onUnit={setUnit}
            />
          </RailStep>
        </>
      }
    />
  )

  const pins: MapPinData[] | null = activeKeyword
    ? activeKeyword.points.map((p) => ({
        row: p.row, col: p.col, lat: p.latitude, lng: p.longitude,
        status: p.status, rank: p.rank, pointId: p.id,
      }))
    : null

  const theMap = (
    <ScanMap
      centerLat={scan ? scan.centerLat : effectiveCenter?.lat ?? DEFAULT_MAP_CENTER.lat}
      centerLng={scan ? scan.centerLng : effectiveCenter?.lng ?? DEFAULT_MAP_CENTER.lng}
      gridSize={scan ? scan.gridSize : gridSize}
      radiusMeters={
        scan ? scan.radiusMeters : effectiveCenter ? (unit === "IMPERIAL" ? radius * 1609.344 : radius * 1000) : 0
      }
      pins={pins}
      unit={scan?.displayUnit ?? unit}
      defaultZoom={currentLocation ? 14 : 4}
      // Dropped once results are in: the centre point has a scored pin of its
      // own by then, and the marker sat on top of it — hiding the rank at the
      // business's own address, which is the one point people look for first.
      showCenterMarker={!showResults && (currentLocation != null || scan != null)}
      dimBand={activeBand}
      openPointId={openPointId}
      // Locked once a scan exists — its centre is a fixed record of what was
      // actually scanned, not something to nudge after the fact.
      onCenterChange={!scan ? (lat, lng) => setCenterOverride({ lat, lng }) : undefined}
      onPinClick={(pin) => {
        if (pin.status === "SUCCEEDED" && pin.pointId) setOpenPointId(pin.pointId)
      }}
    />
  )

  const banner =
    scan?.status === "PARTIAL" ? (
      <div className="tiny" style={{ padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--warn-soft)", color: "var(--warn)" }}>
        Finished with {scan.pointsDone} of {scan.totalPoints} points. The points that failed were refunded.
      </div>
    ) : scan?.status === "FAILED" ? (
      <div className="tiny" style={{ padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--neg-soft)", color: "var(--neg)" }}>
        This scan couldn&apos;t run. {scan.errorMessage ?? "Your credits were returned."}
      </div>
    ) : scan?.status === "CANCELLED" ? (
      <div className="tiny" style={{ padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--bg-inset)", color: "var(--text-soft)" }}>
        Cancelled after {scan.pointsDone} of {scan.totalPoints} points. Unused credits were returned.
      </div>
    ) : null

  return (
    // One shared Maps JS context for the whole page — both the business step's
    // search/Place-ID lookup and the map itself need to be descendants of the
    // SAME <APIProvider>, not each load their own.
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={["places"]}>
      <div className="page mt-page">
        {running && scan && (
          <ScanProgress pointsDone={scan.pointsDone} totalPoints={scan.totalPoints} onCancel={() => void cancelScan()} />
        )}

        {!showResults && !running && (
          <>
            <div className="mt-intro">
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1>{currentLocation && keywords.length > 0 ? "Ready when you are." : "Where do you rank on the map?"}</h1>
                <p className="mt-lede">
                  Local rank changes street by street. This runs one real Google Maps search from every point on a
                  grid around your business, then shows the shape of your visibility.
                </p>
              </div>
            </div>
            <ToolContext id="maps-tracker" />
          </>
        )}

        {showResults && scan && activeKeyword && (
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{scan.location.name}</div>
              <div className="tiny muted">
                {scan.gridSize} × {scan.gridSize} grid · {(scan.radiusMeters / (scan.displayUnit === "IMPERIAL" ? 1609.344 : 1000)).toFixed(2)}{" "}
                {scan.displayUnit === "IMPERIAL" ? "mi" : "km"} radius · scanned{" "}
                {new Date(scan.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn" onClick={() => { stopPolling(); setScan(null); setActiveStep(3) }}>
                Change setup
              </button>
              <button type="button" className="btn primary" onClick={() => setConfirmScan(true)} disabled={disabledReason != null}>
                Re-scan
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="tiny" style={{ marginBottom: 14, padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--neg-soft)", color: "var(--neg)" }} role="alert">
            {error}
          </div>
        )}

        {/* Setup and running share one two-column shape: choices on the left,
            the grid they describe on the right. */}
        {!showResults && (
          <div className="mt-setup">
            {running && scan ? (
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
                    {" · "}{(scan.radiusMeters / (scan.displayUnit === "IMPERIAL" ? MILES_TO_METERS : KM_TO_METERS)).toFixed(2)}
                    {scan.displayUnit === "IMPERIAL" ? " mi" : " km"}
                  </div>
                </div>
                <MetricSkeletons />
              </div>
            ) : (
              rail
            )}
            <MapCard
              minHeight={running ? 392 : 380}
              emptyState={!currentLocation && !scan ? <MapEmptyState /> : undefined}
              badge={
                running && scan
                  // The promise on this screen is "points appear as they land",
                  // so the map should say how many have.
                  ? `${scan.pointsDone} of ${scan.totalPoints} points searched`
                  : currentLocation
                    ? `${searches} points will be searched`
                    : undefined
              }
            >
              {theMap}
            </MapCard>
          </div>
        )}

        {showResults && scan && activeKeyword && (
          <div className="mt-stack" style={{ gap: 18 }}>
            {banner}
            <KeywordTabs keywords={scan.keywords} activeId={activeKeyword.id} onChange={setActiveKeywordId} />

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
          </div>
        )}

        <div style={{ marginTop: 24 }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Earlier scans</div>
            <div className="tiny muted">One row per keyword</div>
          </div>
          <ScanHistory rows={historyRows} onOpenScan={(id) => void openScan(id)} />
        </div>

        <CreditCostConfirm
          action={CREDIT_ACTION_KEYS.mapsScanPoint}
          units={searches}
          open={confirmScan}
          onOpenChange={setConfirmScan}
          onConfirm={() => void runScan()}
          title="Run this scan?"
          description={`${searches} ${searches === 1 ? "search" : "searches"} — ${gridSize} × ${gridSize} points for each of your ${keywords.length} keyword${keywords.length === 1 ? "" : "s"}${aiRequested ? ", plus an AI analysis when it finishes" : ""}.`}
          confirmLabel="Run scan"
        />

        {scan && openPointId && activeKeyword && (
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
