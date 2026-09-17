"use client"

import { Download, Settings2, Share2, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { MILES_TO_METERS, KM_TO_METERS, formatDistance } from "./grid"
import type { Scan } from "./types"

/**
 * The three pills stacked on the map's right edge, and the compare banner.
 *
 * They float over the canvas rather than sitting in the header because they act
 * on what is drawn, not on the scan as a record — the header's "Scan again" is
 * about the scan, these are about this view of it.
 */
export function MapControls({
  scan,
  reportHref,
  onExport,
}: {
  scan: Scan
  reportHref: string | null
  onExport: () => void
}) {
  return (
    <div className="mt-mapctl">
      {reportHref && (
        <a
          className="mt-mapctl-btn"
          href={reportHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open the shareable report"
          title="Open the shareable report"
        >
          <Share2 size={14} />
        </a>
      )}

      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="mt-mapctl-btn" aria-label="Scan settings" title="Scan settings">
            <Settings2 size={14} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" side="left" className="fs-app w-[240px] p-3">
          <ScanSettings scan={scan} />
        </PopoverContent>
      </Popover>

      <button
        type="button"
        className="mt-mapctl-btn"
        onClick={onExport}
        aria-label="Export this keyword's points as CSV"
        title="Export this keyword's points as CSV"
      >
        <Download size={14} />
      </button>
    </div>
  )
}

/**
 * Read-only. These are a snapshot of what was actually scanned, not controls —
 * changing any of them means running a new scan, which is what the header's
 * "Scan again" is for.
 */
function ScanSettings({ scan }: { scan: Scan }) {
  const divisor = scan.displayUnit === "IMPERIAL" ? MILES_TO_METERS : KM_TO_METERS
  const unit = scan.displayUnit === "IMPERIAL" ? "mi" : "km"
  return (
    <div className="mt-setpop">
      <div className="mt-setpop-h">Scan settings</div>
      <Row k="Grid" v={`${scan.gridSize} × ${scan.gridSize}`} />
      <Row k="Radius" v={`${(scan.radiusMeters / divisor).toFixed(2)} ${unit}`} />
      <Row k="Spacing" v={formatDistance(scan.spacingMeters, scan.displayUnit)} />
      <Row k="Centre" v={`${scan.centerLat.toFixed(5)}, ${scan.centerLng.toFixed(5)}`} />
      <Row k="Points" v={`${scan.totalPoints}`} />
      <Row k="Depth" v={"Top 20"} />
      <div className="mt-setpop-note">
        A snapshot of what ran. Editing any of it means a new scan.
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="mt-setpop-r">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  )
}

/** Names whose ranks the map is currently showing, with one click back to the target. */
export function CompareBanner({ name, onClear }: { name: string; onClear: () => void }) {
  return (
    <div className="mt-comparebar" role="status">
      <span className="t">
        Showing <b>{name}</b>&apos;s ranks
      </span>
      <button type="button" className="x" onClick={onClear} aria-label="Back to your own ranks">
        <X size={13} /> Back to you
      </button>
    </div>
  )
}
