"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { ArrowLeft } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { APIProvider } from "@vis.gl/react-google-maps"
import { Link, useRouter } from "@/i18n/navigation"
import { api, ApiError } from "@/lib/api"
import { ToolContext } from "@/components/dashboard/tool-context"
import { CreditCostConfirm } from "@/components/dashboard/credit-cost"
import { CREDIT_ACTION_KEYS } from "@/lib/credits"
import { RailStep, SetupRail, type StepState } from "@/components/maps-tracker/rail"
import { BusinessStep } from "@/components/maps-tracker/step-business"
import { KeywordsStep } from "@/components/maps-tracker/step-keywords"
import { AreaStep } from "@/components/maps-tracker/step-area"
import { MapCard, MapEmptyState } from "@/components/maps-tracker/map-card"
import { ScanMap } from "@/components/maps-tracker/scan-map"
import { spacingCaption } from "@/components/maps-tracker/grid-controls"
import {
  KM_TO_METERS,
  MILES_TO_METERS,
  nearestRadiusStep,
  totalPoints,
  validateArea,
  type DistanceUnit,
} from "@/components/maps-tracker/grid"
import type { MapLocation, Scan, CreateScanResponse } from "@/components/maps-tracker/types"

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
const LIST = "/dashboard/google-maps-tracker"

// A 3 x 3 over 0.1 miles — the old defaults — is nine searches inside one
// block, which tells nobody anything. These are the settings the redesign
// previews, and the ones a first scan should actually be run at.
const DEFAULT_GRID_SIZE = 7
const DEFAULT_RADIUS = 1.5
// Geographic center of the continental US — just a reasonable starting view
// before any location is picked; the map re-centers via fitBounds once one is.
const DEFAULT_MAP_CENTER = { lat: 39.8283, lng: -98.5795 }

function NewScanBuilder() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const from = searchParams.get("from")

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

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmScan, setConfirmScan] = useState(false)

  // Steps 2 and 3 are simply open once there's a business — no accordion. The
  // only thing that collapses is the business picker, because it is a search
  // UI with one definite answer; keywords and area are settings you keep
  // adjusting right up until you press Run, and making people click to reveal
  // them was pure friction.
  const [editingBusiness, setEditingBusiness] = useState(false)

  const searches = totalPoints(gridSize, keywords.length || 1)

  useEffect(() => {
    setCenterOverride(null)
  }, [currentLocation?.id])

  const loadLocations = useCallback(async () => {
    try {
      const { locations } = await api.get<{ locations: MapLocation[] }>("/api/maps-tracker/locations")
      setLocations(locations)
      setCurrentLocation((cur) => cur ?? locations[0] ?? null)
      return locations
    } catch {
      /* non-fatal — location list stays empty */
      return [] as MapLocation[]
    }
  }, [])

  // `?from=<scanId>` — Re-scan and Change setup both land here, and both name a
  // scan on the button, so the rail has to come up holding that scan's settings
  // rather than whatever the defaults are.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const locs = await loadLocations()
      if (cancelled || !from) return
      try {
        const { scan } = await api.get<{ scan: Scan }>(`/api/maps-tracker/scans/${from}`)
        if (cancelled) return
        const scanUnit = scan.displayUnit
        setUnit(scanUnit)
        setGridSize(scan.gridSize)
        setRadius(
          nearestRadiusStep(
            scan.radiusMeters / (scanUnit === "IMPERIAL" ? MILES_TO_METERS : KM_TO_METERS),
            scanUnit,
          ),
        )
        setKeywords(scan.keywords.map((k) => k.keyword))
        const match = locs.find((l) => l.id === scan.location.id)
        if (match) setCurrentLocation(match)
        // Everything is answered — the picker stays collapsed.
        setEditingBusiness(false)
      } catch {
        // A missing or foreign scan just means no prefill; the builder still works.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [from, loadLocations])

  async function runScan() {
    if (!currentLocation || keywords.length === 0 || submitting) return
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
      // The scan is now a place of its own: watching it, refreshing it and
      // linking to it all happen at its own url rather than in this form's state.
      router.push(`${LIST}/${result.scanId}`)
    } catch (err) {
      // Covers the 5-per-minute create limit as well as validation and quota
      // refusals — the message the server sends is the useful one.
      setError(err instanceof ApiError ? err.message : "Couldn't start the scan.")
      setSubmitting(false)
    }
  }

  // Wraps setCurrentLocation for USER-initiated picks only — not the mount-time
  // auto-select of the first saved location.
  function selectLocation(loc: MapLocation) {
    setCurrentLocation(loc)
    setError(null)
    // Collapse the picker back to its summary; keywords and area are already
    // open underneath, so the next thing to type is on screen straight away.
    setEditingBusiness(false)
  }

  function removeLocation(locationId: string) {
    setLocations((prev) => prev.filter((l) => l.id !== locationId))
    if (currentLocation?.id === locationId) setCurrentLocation(null)
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

  // Everything a business unlocks is shown expanded. Before there is one,
  // steps 2 and 3 stay visible but dimmed, so the shape of what's coming is
  // legible without being reachable.
  const hasLocation = currentLocation != null
  const stepState = (n: 1 | 2 | 3): StepState => {
    if (n === 1) return !hasLocation || editingBusiness ? "active" : "done"
    return hasLocation ? "active" : "locked"
  }

  const areaProblem = validateArea(gridSize, radius, unit, keywords.length || 1)
  const disabledReason =
    !currentLocation ? "Pick a business to continue"
    : keywords.length === 0 ? "Add at least one keyword"
    : areaProblem ?? null

  const effectiveCenter =
    centerOverride ?? (currentLocation ? { lat: currentLocation.latitude, lng: currentLocation.longitude } : null)

  return (
    // One shared Maps JS context — both the business step's search/Place-ID
    // lookup and the map itself need to be descendants of the SAME
    // <APIProvider>, not each load their own.
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={["places"]}>
      <div className="page mt-page">
        <div className="tiny muted" style={{ marginBottom: 10 }}>
          <Link href={LIST} className="row" style={{ gap: 4, display: "inline-flex" }}>
            <ArrowLeft size={13} /> All scans
          </Link>
        </div>

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

        {error && (
          <div
            className="tiny"
            style={{
              margin: "14px 0", padding: "10px 12px", borderRadius: "var(--r-md)",
              background: "var(--neg-soft)", color: "var(--neg)",
            }}
            role="alert"
          >
            {error}
          </div>
        )}

        <div className="mt-setup" style={{ marginTop: 16 }}>
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
                  summaryKey={currentLocation ? "Business" : undefined}
                  summaryValue={currentLocation?.name}
                  summarySub={currentLocation?.address}
                  onEdit={() => setEditingBusiness(true)}
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
                  hint={!hasLocation ? "What people type when they look for you. Up to 10." : undefined}
                  // No summaryValue: this step stays open, so it never renders
                  // one. The key is what marks it answered — the chips live in
                  // the step body, next to the input that adds them.
                  summaryKey={keywords.length > 0 ? `Keywords · ${keywords.length}` : undefined}
                >
                  <KeywordsStep keywords={keywords} onChange={setKeywords} />
                </RailStep>

                <RailStep
                  n={3}
                  title="Set the area"
                  state={stepState(3)}
                  hint={!hasLocation ? "How wide to look, and how fine the grid." : undefined}
                  summaryKey="Area"
                  summaryValue={`${radius} ${unit === "IMPERIAL" ? "mi" : "km"} radius · ${gridSize} × ${gridSize} grid`}
                  summarySub={spacingCaption(gridSize, radius, unit)}
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

          <MapCard
            minHeight={380}
            emptyState={!currentLocation ? <MapEmptyState /> : undefined}
            badge={currentLocation ? `${searches} points will be searched` : undefined}
          >
            <ScanMap
              centerLat={effectiveCenter?.lat ?? DEFAULT_MAP_CENTER.lat}
              centerLng={effectiveCenter?.lng ?? DEFAULT_MAP_CENTER.lng}
              gridSize={gridSize}
              radiusMeters={effectiveCenter ? (unit === "IMPERIAL" ? radius * MILES_TO_METERS : radius * KM_TO_METERS) : 0}
              pins={null}
              unit={unit}
              defaultZoom={currentLocation ? 14 : 4}
              showCenterMarker={currentLocation != null}
              onCenterChange={(lat, lng) => setCenterOverride({ lat, lng })}
            />
          </MapCard>
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
      </div>
    </APIProvider>
  )
}

// `useSearchParams` forces a Suspense boundary in a statically-renderable
// route — same shape the keyword-analysis pages use.
export default function NewScanPage() {
  return (
    <Suspense
      fallback={
        <div className="page" style={{ color: "var(--text-mute)", fontSize: 13, padding: 60, textAlign: "center" }}>
          Loading…
        </div>
      }
    >
      <NewScanBuilder />
    </Suspense>
  )
}
