"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { APIProvider } from "@vis.gl/react-google-maps"
import { api, ApiError } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"
import { PlatformDropdown } from "@/components/maps-tracker/platform-dropdown"
import { LocationPicker } from "@/components/maps-tracker/location-picker"
import { KeywordPicker } from "@/components/maps-tracker/keyword-picker"
import { GridSizeDropdown, RadiusDropdown, UnitToggle, spacingCaption } from "@/components/maps-tracker/grid-controls"
import { ScanMap, type MapPinData } from "@/components/maps-tracker/scan-map"
import { ScanResults, PointDrawer } from "@/components/maps-tracker/scan-results"
import { ScanHistoryTable, flattenHistoryRows } from "@/components/maps-tracker/scan-history-table"
import { Tooltip } from "@/components/maps-tracker/tooltip"
import { totalPoints, RECOMMENDED_GRID_SIZE, type DistanceUnit } from "@/components/maps-tracker/grid"
import type { MapLocation, Scan, ScanHistoryItem, CreateScanResponse } from "@/components/maps-tracker/types"
import { ToolContext } from "@/components/dashboard/tool-context"

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

const DEFAULT_GRID_SIZE = 3 // matches LocalFalcon's own default; 11 is marked "Recommended" for real use
const DEFAULT_RADIUS = 0.1
const POLL_MS = 2000
// Geographic center of the continental US — just a reasonable starting view
// before any location is picked; the map re-centers via fitBounds once one is.
const DEFAULT_MAP_CENTER = { lat: 39.8283, lng: -98.5795 }

function isTerminal(status: string): boolean {
  return status === "COMPLETED" || status === "PARTIAL" || status === "FAILED" || status === "CANCELLED"
}

export default function GoogleMapsTrackerPage() {
  // Early access gate — the sidebar already hides this link for unlisted
  // accounts, but the route itself must also refuse to render the tool for
  // anyone who navigates straight to the URL. Fails closed: stays "checking"
  // (not "allowed") until the server confirms.
  const [accessChecked, setAccessChecked] = useState(false)
  const [accessAllowed, setAccessAllowed] = useState(false)
  useEffect(() => {
    let cancelled = false
    api
      .get<{ allowed: boolean }>("/api/maps-tracker/access")
      .then(({ allowed }) => {
        if (!cancelled) {
          setAccessAllowed(allowed)
          setAccessChecked(true)
        }
      })
      .catch(() => {
        if (!cancelled) setAccessChecked(true) // accessAllowed stays false
      })
    return () => {
      cancelled = true
    }
  }, [])

  const [locations, setLocations] = useState<MapLocation[]>([])
  const [currentLocation, setCurrentLocation] = useState<MapLocation | null>(null)
  // Lets the user drag the red center pin to preview ranking from a spot
  // other than the business's stored address (matches LocalFalcon). Reset
  // whenever the location itself changes, so switching businesses doesn't
  // carry over a stale drag offset.
  const [centerOverride, setCenterOverride] = useState<{ lat: number; lng: number } | null>(null)
  const [keywords, setKeywords] = useState<string[]>([])
  const [gridSize, setGridSize] = useState(DEFAULT_GRID_SIZE)
  const [radius, setRadius] = useState(DEFAULT_RADIUS)
  const [unit, setUnit] = useState<DistanceUnit>("IMPERIAL")
  const [aiRequested, setAiRequested] = useState(false)

  const [scan, setScan] = useState<Scan | null>(null)
  const [history, setHistory] = useState<ScanHistoryItem[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Shared between the map pins and the results grid — either can open it,
  // and it works while a scan is still RUNNING (points succeed one at a time,
  // well before the scan reaches a terminal status).
  const [openPointId, setOpenPointId] = useState<string | null>(null)
  // Controls the detail modal opened by clicking a row in the history table —
  // separate from `scan` itself, since `scan` also drives the live map and
  // shouldn't force the modal open just because a scan is in flight.
  const [detailOpen, setDetailOpen] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const points = totalPoints(gridSize, keywords.length || 1)
  const running = scan != null && !isTerminal(scan.status)

  // Table rows = history, with the live/just-run `scan` spliced in over its
  // own (possibly stale) history entry — so a running scan shows up
  // immediately as "Scanning…" and a just-finished one reflects fresh
  // metrics without waiting on the next history refresh.
  const historyRows = useMemo(() => {
    const rows = flattenHistoryRows(history)
    if (!scan) return rows
    const scanAsHistoryItem: ScanHistoryItem = {
      id: scan.id,
      status: scan.status,
      totalPoints: scan.totalPoints,
      pointsDone: scan.pointsDone,
      gridSize: scan.gridSize,
      radiusMeters: scan.radiusMeters,
      displayUnit: scan.displayUnit,
      createdAt: scan.createdAt,
      location: { name: scan.location.name, address: scan.location.address },
      keywords: scan.keywords.map((k) => ({
        id: k.id,
        keyword: k.keyword,
        status: k.status,
        arp: k.arp,
        atrp: k.atrp,
        solv: k.solv,
        scoredPoints: k.scoredPoints,
        points: k.points.map((p) => ({ row: p.row, col: p.col, status: p.status, rank: p.rank })),
      })),
    }
    const liveRows = flattenHistoryRows([scanAsHistoryItem])
    return [...liveRows, ...rows.filter((r) => r.scanId !== scan.id)]
  }, [history, scan])

  function openScanDetail(scanId: string) {
    pollScan(scanId)
    setDetailOpen(true)
  }

  useEffect(() => {
    setCenterOverride(null)
  }, [currentLocation?.id])

  const effectiveCenter = centerOverride ?? (currentLocation ? { lat: currentLocation.latitude, lng: currentLocation.longitude } : null)

  const loadLocations = useCallback(async () => {
    try {
      const { locations } = await api.get<{ locations: MapLocation[] }>("/api/maps-tracker/locations")
      setLocations(locations)
      if (!currentLocation && locations[0]) setCurrentLocation(locations[0])
      // eslint-disable-next-line react-hooks/exhaustive-deps
    } catch {
      /* non-fatal — location list stays empty */
    }
  }, [currentLocation])

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
          // otherwise a "Generating…" spinner opened right after the scan
          // completes never notices the report finish behind it.
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }
  }, [])

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
        // Dragging the red pin previews ranking from a spot other than the
        // business's stored address — omit entirely when it hasn't moved, so
        // the backend just uses the location's own coordinates as before.
        ...(centerOverride ? { centerLat: centerOverride.lat, centerLng: centerOverride.lng } : {}),
      })
      pollScan(result.scanId)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start the scan.")
    } finally {
      setSubmitting(false)
    }
  }

  // Wraps setCurrentLocation for USER-initiated picks (search, Place ID,
  // switching in the dropdown) only — not the mount-time auto-select of the
  // first saved location, and not the mount-time resume of an in-flight scan.
  // Without clearing `scan` here, the map and results stayed locked onto the
  // previous business's scan (its centerLat/Lng take priority whenever `scan`
  // is set), so picking a different business silently did nothing until a
  // full page reload.
  function selectLocation(loc: MapLocation) {
    setCurrentLocation(loc)
    stopPolling()
    setScan(null)
    setOpenPointId(null)
    setError(null)
  }

  function removeLocation(locationId: string) {
    setLocations((prev) => prev.filter((l) => l.id !== locationId))
    if (currentLocation?.id === locationId) {
      setCurrentLocation(null)
      stopPolling()
      setScan(null)
      setOpenPointId(null)
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

  const previewPins: MapPinData[] | null = scan
    ? scan.keywords[0]?.points.map((p) => ({ row: p.row, col: p.col, lat: p.latitude, lng: p.longitude, status: p.status, rank: p.rank, pointId: p.id })) ?? null
    : null

  const canRun = currentLocation != null && keywords.length > 0 && !running && !submitting

  if (!accessChecked) {
    return (
      <div className="page">
        <div style={{ padding: 60, textAlign: "center" }} className="tiny muted">Checking access…</div>
      </div>
    )
  }

  if (!accessAllowed) {
    return (
      <div className="page">
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <div className="b" style={{ marginBottom: 6 }}>Google Maps Tracker is in early access</div>
        </div>
      </div>
    )
  }

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

  return (
    // One shared Maps JS context for the whole page — both the location
    // picker's search/Place-ID lookup and the map itself need to be
    // descendants of the SAME <APIProvider>, not each load their own.
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={["places"]}>
    <div className="page">
      <div className="page-h" style={{ marginBottom: 12 }}>
        <div>
          <div className="eyebrow"><span className="spark"><Icon.spark /></span> GOOGLE MAPS TRACKER</div>
          <h1>Quick Scan</h1>
          <div className="sub">See where your business ranks on Google Maps, block by block.</div>
        </div>
      </div>

      <ToolContext id="maps-tracker" />

      {/* Top bar — what to scan */}
      <div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        <PlatformDropdown />
        <LocationPicker
          locations={locations}
          current={currentLocation}
          onSelect={selectLocation}
          onCreated={(loc) => setLocations((prev) => [loc, ...prev])}
          onDeleted={removeLocation}
        />
        <KeywordPicker keywords={keywords} onChange={setKeywords} />
        <Tooltip label={aiRequested ? "AI analysis will run automatically once the scan finishes." : "Generate an AI analysis of the results after this scan finishes."}>
          <button
            type="button"
            className={"icon-btn" + (aiRequested ? " active" : "")}
            onClick={() => setAiRequested((v) => !v)}
            aria-label={aiRequested ? "AI analysis enabled — click to disable" : "Enable AI analysis"}
            style={{
              background: aiRequested ? "var(--brand)" : undefined,
              color: aiRequested ? "#fff" : undefined,
              borderRadius: "var(--r-md)",
              padding: "8px 10px",
            }}
          >
            <Icon.ai />
          </button>
        </Tooltip>
      </div>

      {/* Map canvas — always rendered, even with no location picked yet, so the
          map itself is the surface for finding/adding a business rather than
          a placeholder blocking it. */}
      <div style={{ height: "min(60vh, 560px)", minHeight: 320, borderRadius: "var(--r-lg)", overflow: "hidden", position: "relative" }}>
        <ScanMap
          centerLat={scan ? scan.centerLat : effectiveCenter ? effectiveCenter.lat : DEFAULT_MAP_CENTER.lat}
          centerLng={scan ? scan.centerLng : effectiveCenter ? effectiveCenter.lng : DEFAULT_MAP_CENTER.lng}
          gridSize={scan ? scan.gridSize : gridSize}
          radiusMeters={scan ? scan.radiusMeters : effectiveCenter ? (unit === "IMPERIAL" ? radius * 1609.344 : radius * 1000) : 0}
          pins={previewPins}
          defaultZoom={currentLocation ? 14 : 4}
          showCenterMarker={currentLocation != null}
          // Locked once a scan exists — its center is a fixed record of what
          // was actually scanned, not something to nudge after the fact.
          onCenterChange={!scan ? (lat, lng) => setCenterOverride({ lat, lng }) : undefined}
          onPinClick={(pin) => {
            // Only SUCCEEDED points have a top-results payload to show.
            if (pin.status === "SUCCEEDED" && pin.pointId) setOpenPointId(pin.pointId)
          }}
        />
        {!currentLocation && (
          <div
            className="card"
            style={{
              position: "absolute",
              top: 16,
              left: "50%",
              transform: "translateX(-50%)",
              padding: "10px 16px",
              pointerEvents: "none",
              textAlign: "center",
            }}
          >
            <div className="tiny">Search or paste a Place ID above to add your business — the grid will preview here.</div>
          </div>
        )}
      </div>

      {/* Bottom bar — how to scan it */}
      <div style={{ marginTop: 12 }}>
        <div className="row" style={{ gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <GridSizeDropdown value={gridSize} onChange={setGridSize} />
          <RadiusDropdown value={radius} unit={unit} onChange={setRadius} />
          <UnitToggle value={unit} onChange={setUnit} />
        </div>
        <div className="tiny muted" style={{ textAlign: "center", marginTop: 8 }}>
          {spacingCaption(gridSize, radius, unit)} · {points} points
          {aiRequested && " + AI analysis"}
        </div>
        {(unit === "IMPERIAL" ? radius * 1609.344 : radius * 1000) / ((gridSize - 1) / 2 || 1) > 8000 && (
          <div className="tiny" style={{ textAlign: "center", marginTop: 4, color: "var(--warn)" }}>
            Points are far apart. Consider a larger grid for usable detail.
          </div>
        )}

        {running ? (
          <div style={{ marginTop: 12 }}>
            <div className="row" style={{ justifyContent: "center", gap: 10, alignItems: "center" }}>
              <span className="spin"><Icon.refresh /></span>
              <span className="tiny">{scan!.pointsDone} of {scan!.totalPoints} points</span>
              <button type="button" className="btn sm" onClick={() => void cancelScan()}>Cancel</button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn primary"
            style={{ width: "100%", justifyContent: "center", marginTop: 12 }}
            disabled={!canRun}
            onClick={() => void runScan()}
          >
            {submitting ? <><Icon.refresh /> Starting…</> : <><Icon.zap /> Run scan</>}
          </button>
        )}

        {error && (
          <div className="tiny" style={{ marginTop: 10, padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--neg-soft)", color: "var(--neg)", textAlign: "center" }}>
            {error}
          </div>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <ScanHistoryTable rows={historyRows} onOpenScan={openScanDetail} />
      </div>

      {detailOpen && scan && (
        <div className="modal-bg" onClick={() => setDetailOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900, maxHeight: "85vh", overflowY: "auto" }}>
            <div className="modal-h">
              <div>
                <div className="b" style={{ fontSize: 16 }}>{scan.location.name}</div>
                <div className="tiny muted">{new Date(scan.createdAt).toLocaleString()}</div>
              </div>
              <button onClick={() => setDetailOpen(false)} className="icon-btn" aria-label="Close"><Icon.close /></button>
            </div>
            <div className="modal-b">
              {scan.status === "PARTIAL" && (
                <div className="tiny" style={{ marginBottom: 12, padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--warn-soft, rgba(234,179,8,0.12))", color: "var(--warn)" }}>
                  Scan finished with {scan.pointsDone} of {scan.totalPoints} points. Some points failed and their daily-quota points were refunded.
                </div>
              )}
              {scan.status === "FAILED" && (
                <div className="tiny" style={{ marginBottom: 12, padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--neg-soft)", color: "var(--neg)" }}>
                  Scan couldn&apos;t run. {scan.errorMessage ?? "Your daily-quota points were refunded."}
                </div>
              )}
              {isTerminal(scan.status) ? (
                <ScanResults scan={scan} onOpenPoint={setOpenPointId} />
              ) : (
                <div className="tiny muted" style={{ textAlign: "center", padding: 24 }}>
                  Still scanning — {scan.pointsDone} of {scan.totalPoints} points.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {scan && openPointId && (
        <PointDrawer scanId={scan.id} pointId={openPointId} onClose={() => setOpenPointId(null)} />
      )}
    </div>
    </APIProvider>
  )
}
