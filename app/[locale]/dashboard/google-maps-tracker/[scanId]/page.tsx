"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft } from "lucide-react"
import { useParams, useSearchParams } from "next/navigation"
import { APIProvider } from "@vis.gl/react-google-maps"
import { Link, useRouter } from "@/i18n/navigation"
import { api, ApiError } from "@/lib/api"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { PositionMapShell, useCompactLayout } from "@/components/maps-tracker/position-map-shell"
import { PositionRail } from "@/components/maps-tracker/position-rail"
import { ScanMap, type MapPinData } from "@/components/maps-tracker/scan-map"
import { MapControls, CompareBanner } from "@/components/maps-tracker/map-controls"
import { ScanDatePill } from "@/components/maps-tracker/scan-date-pill"
import { AiAnalysis } from "@/components/maps-tracker/ai-analysis"
import { ScanProgress } from "@/components/maps-tracker/scan-progress"
import { PointDrawer } from "@/components/maps-tracker/point-drawer"
import { useCompetitors } from "@/components/maps-tracker/use-competitors"
import { useScanHistory } from "@/components/maps-tracker/use-scan-history"
import {
  applyCompetitorFilters,
  EMPTY_FILTERS,
  type CompetitorFilterState,
} from "@/components/maps-tracker/competitor-filters"
import { downloadScanCsv } from "@/components/maps-tracker/export-csv"
import { KM_TO_METERS, MILES_TO_METERS, type RankBandKey } from "@/components/maps-tracker/grid"
import type { CompetitorRow, Scan, ScanHistoryEntry } from "@/components/maps-tracker/types"

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
const LIST = "/dashboard/google-maps-tracker"
const POLL_MS = 2000
// Collapsed handle / half / full, as fractions of viewport height. Collapsed
// still shows the keyword chips and the rank badge, so the sheet is useful
// without being opened at all.
const SHEET_SNAPS = [0.15, 0.5, 0.92]

function isTerminal(status: string): boolean {
  return status === "COMPLETED" || status === "PARTIAL" || status === "FAILED" || status === "CANCELLED"
}

const radiusLabel = (scan: Scan) =>
  `${(scan.radiusMeters / (scan.displayUnit === "IMPERIAL" ? MILES_TO_METERS : KM_TO_METERS)).toFixed(2)} ${
    scan.displayUnit === "IMPERIAL" ? "mi" : "km"
  }`

/**
 * One scan, at its own url — now as a map-first workspace.
 *
 * Both halves of a scan's life still live here: the progress screen while
 * points are landing, and the Position Map once they have. What changed is the
 * frame. The results are no longer a vertical stack of six cards; the map is
 * the canvas and everything else is a docked rail over it, so picking a
 * keyword, reading your rank and scrolling competitors never takes the map off
 * screen.
 *
 * A dynamic segment is never statically rendered, so `useSearchParams` needs no
 * Suspense boundary here — unlike the builder at /new.
 */
export default function ScanPage() {
  const router = useRouter()
  const params = useParams<{ scanId: string }>()
  const searchParams = useSearchParams()
  const scanId = params.scanId
  const compact = useCompactLayout()

  const [scan, setScan] = useState<Scan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [activeKeywordId, setActiveKeywordId] = useState<string | null>(null)
  const [activeBand, setActiveBand] = useState<RankBandKey | null>(null)
  const [openPointId, setOpenPointId] = useState<string | null>(null)
  const [filters, setFilters] = useState<CompetitorFilterState>(EMPTY_FILTERS)
  const [comparing, setComparing] = useState<CompetitorRow | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [sheetSnap, setSheetSnap] = useState<number | string | null>(SHEET_SNAPS[0])
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

  const { entries: historyEntries, deltas } = useScanHistory(
    scan?.location.id ?? null,
    activeKeyword?.keyword ?? null,
    scan?.id ?? null,
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
        // requested) also settles, otherwise the "analysing…" state never
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

  // The keyword comes from the url so a history row can open its own keyword,
  // and so a shared link lands on the reading it was shared for. `k` is the
  // parameter this page has always written; `keyword` is accepted too so links
  // written against the redesign brief's spelling still resolve.
  useEffect(() => {
    if (!scan) return
    const wanted = searchParams.get("k") ?? searchParams.get("keyword")
    const exists = wanted && scan.keywords.some((k) => k.id === wanted)
    setActiveKeywordId(exists ? wanted : scan.keywords[0]?.id ?? null)
  }, [scan, searchParams])

  // Anything scoped to one keyword has to let go when the keyword changes: a
  // competitor comparison from the previous keyword would recolour this
  // keyword's pins with ranks that were never measured for it.
  useEffect(() => {
    setComparing(null)
    setActiveBand(null)
    setOpenPointId(null)
    setFilters(EMPTY_FILTERS)
  }, [activeKeywordId])

  function selectKeyword(id: string) {
    setActiveKeywordId(id)
    // replace, not push: flipping between keywords shouldn't build up history
    // the Back button then has to walk out of.
    router.replace(`${LIST}/${scanId}?k=${id}`, { scroll: false })
  }

  function openHistoricScan(entry: ScanHistoryEntry) {
    // A full route change, not client state, so every historical view is a URL.
    router.push(`${LIST}/${entry.scanId}?k=${entry.keywordId}`)
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

  // Esc unwinds one layer at a time: the drawer, then the comparison, then the
  // band filter. Unchanged in order from before, with compare inserted where it
  // belongs — nearest-first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (openPointId) setOpenPointId(null)
      else if (comparing) setComparing(null)
      else if (activeBand) setActiveBand(null)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [openPointId, comparing, activeBand])

  /**
   * The map's pin array.
   *
   * Memoised on the keyword, and declared up here with the other hooks rather
   * than beside the JSX that uses it — everything below the `if (!scan)` guard
   * runs conditionally, and a hook there would change the hook count as soon as
   * the first poll landed.
   *
   * The memo is not a micro-optimisation: this array feeds the halo layer,
   * which tears down and rebuilds every google.maps.Circle when its identity
   * changes. Built inline it was a new array on every render, so expanding a
   * competitor row rebuilt a few hundred map circles for nothing.
   */
  const pins = useMemo<MapPinData[] | null>(
    () =>
      activeKeyword
        ? activeKeyword.points.map((p) => ({
            row: p.row, col: p.col, lat: p.latitude, lng: p.longitude,
            status: p.status, rank: p.rank, pointId: p.id,
          }))
        : null,
    [activeKeyword],
  )

  const filteredRows = useMemo(
    () => applyCompetitorFilters(leaderboard?.rows ?? [], filters),
    [leaderboard, filters],
  )

  /**
   * "Compare on map": `row:col` -> the compared competitor's rank there.
   *
   * Built from the leaderboard's `points` index space, which is the same space
   * the sparse `ranks` object is keyed against — so a point the competitor was
   * absent from stays absent here and is drawn as a genuine not-found.
   */
  const rankOverride = useMemo(() => {
    if (!comparing || !leaderboard) return null
    const m = new Map<string, number | null>()
    leaderboard.points.forEach((p, idx) => {
      m.set(`${p.row}:${p.col}`, comparing.ranks[idx] ?? null)
    })
    return m
  }, [comparing, leaderboard])

  const backLink = (
    <Link href={LIST} className="mt-pm-back" aria-label="All scans">
      <ArrowLeft size={15} />
    </Link>
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

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="page">
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
      rankOverride={rankOverride}
      onPinClick={(pin) => {
        if (pin.status === "SUCCEEDED" && pin.pointId) setOpenPointId(pin.pointId)
      }}
    />
  )

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

  const reportHref = activeKeyword ? `/reports/maps-tracker/${scan.id}/${activeKeyword.id}` : null

  const rail =
    showResults && activeKeyword ? (
      <>
        {banner}
        <PositionRail
          scan={scan}
          activeKeyword={activeKeyword}
          leaderboard={leaderboard}
          leaderboardLoading={leaderboardLoading}
          filteredRows={filteredRows}
          filters={filters}
          onFiltersChange={setFilters}
          deltas={deltas}
          activeBand={activeBand}
          onBandToggle={(k) => setActiveBand((cur) => (cur === k ? null : k))}
          onKeywordChange={selectKeyword}
          comparingKey={comparing?.key ?? null}
          onCompare={setComparing}
          onOpenAi={() => setAiOpen(true)}
        />
      </>
    ) : (
      <div style={{ padding: 16 }}>
        <ScanProgress
          pointsDone={scan.pointsDone}
          totalPoints={scan.totalPoints}
          onCancel={() => void cancelScan()}
        />
        <div className="tiny muted" style={{ marginTop: 14, lineHeight: 1.55 }}>
          {scan.keywords.length === 1 ? `“${scan.keywords[0]!.keyword}”` : `${scan.keywords.length} keywords`}
          {" · "}{scan.gridSize} × {scan.gridSize}{" · "}{radiusLabel(scan)}
        </div>
      </div>
    )

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
      <PositionMapShell
        back={backLink}
        title={scan.location.name}
        subtitle={
          <>
            {scan.gridSize} × {scan.gridSize} grid · {radiusLabel(scan)} radius
            {running && ` · ${scan.pointsDone} of ${scan.totalPoints} points`}
          </>
        }
        actions={
          showResults ? (
            <Link href={`${LIST}/new?from=${scan.id}`} className="btn primary sm">Scan again</Link>
          ) : null
        }
        rail={rail}
        map={theMap}
        mapOverlay={
          <>
            {showResults && (
              <div className="mt-pm-pill-slot">
                <ScanDatePill
                  currentCreatedAt={scan.createdAt}
                  entries={historyEntries}
                  currentScanId={scan.id}
                  onSelect={openHistoricScan}
                />
              </div>
            )}
            {showResults && activeKeyword && (
              <MapControls
                scan={scan}
                reportHref={reportHref}
                onExport={() => downloadScanCsv(scan, activeKeyword)}
              />
            )}
            {comparing && <CompareBanner name={comparing.name} onClear={() => setComparing(null)} />}
            {error && <div className="mt-pm-floaterr" role="alert">{error}</div>}
          </>
        }
        sheet={
          <Drawer
            open
            // Never dismissible: closing it would leave no way back to the
            // rail, since at this width the rail has no other home.
            dismissible={false}
            modal={false}
            snapPoints={SHEET_SNAPS}
            activeSnapPoint={sheetSnap}
            setActiveSnapPoint={setSheetSnap}
          >
            <DrawerContent className="max-h-[92vh]">
              <DrawerTitle className="sr-only">Scan results</DrawerTitle>
              {/* data-vaul-no-drag: without it vaul treats a drag that starts
                  inside this box as a sheet drag, so the rail cannot be
                  scrolled by touch at any snap point below the top one. */}
              <div className="mt-pm-sheet" data-vaul-no-drag data-lenis-prevent>{rail}</div>
            </DrawerContent>
          </Drawer>
        }
      />

      {/* The AI read, over the rail rather than at the bottom of a scroll. */}
      <Sheet open={aiOpen} onOpenChange={setAiOpen}>
        <SheetContent
          side={compact ? "bottom" : "left"}
          // fs-app: Radix portals this to document.body, outside the app scope
          // wrapper, so every `.fs-app .mt-*` rule would stop matching and the
          // panel would render as unstyled text.
          className="fs-app w-full sm:max-w-[440px] overflow-y-auto"
          data-lenis-prevent
        >
          <SheetHeader>
            <SheetTitle>What this scan means</SheetTitle>
          </SheetHeader>
          <div className="mt-aisheet">
            <AiAnalysis scan={scan} />
          </div>
        </SheetContent>
      </Sheet>

      {openPointId && activeKeyword && (
        <PointDrawer
          scanId={scan.id}
          pointId={openPointId}
          keyword={activeKeyword.keyword}
          unit={scan.displayUnit}
          onClose={() => setOpenPointId(null)}
        />
      )}
    </APIProvider>
  )
}
