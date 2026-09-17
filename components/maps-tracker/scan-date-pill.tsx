"use client"

import { CalendarClock, Check, ChevronDown } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { MILES_TO_METERS, KM_TO_METERS } from "./grid"
import type { IncomparableReason, ScanHistoryEntry } from "./types"

const FULL: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
}

/** "5 × 5 over 1 mi" — how a run's geometry reads in a sentence. */
function geometryLabel(e: ScanHistoryEntry): string {
  const divisor = e.displayUnit === "IMPERIAL" ? MILES_TO_METERS : KM_TO_METERS
  const radius = e.radiusMeters / divisor
  const unit = e.displayUnit === "IMPERIAL" ? "mi" : "km"
  return `${e.gridSize} × ${e.gridSize} over ${radius.toFixed(radius < 1 ? 2 : 1)} ${unit}`
}

function incomparableCopy(e: ScanHistoryEntry, reason: IncomparableReason): string {
  switch (reason) {
    case "GRID_SIZE":
    case "RADIUS":
      return `Different area: ${geometryLabel(e)}`
    case "CENTER":
      return "Scanned from a different centre point"
  }
}

/**
 * The scan's date, and a way back to earlier runs of the same keyword.
 *
 * Selecting a run is a full route change, not client state, so every historical
 * view is a URL somebody can share or bookmark — the same reasoning that put
 * the running scan at its own address.
 *
 * Runs whose geometry differs are listed but not selectable for comparison
 * framing: they are shown greyed with the reason, because pretending a 3 × 3
 * and a 21 × 21 are the same measurement is how a tool reports a ranking
 * change that never happened.
 */
export function ScanDatePill({
  currentCreatedAt,
  entries,
  currentScanId,
  onSelect,
}: {
  currentCreatedAt: string
  entries: ScanHistoryEntry[]
  currentScanId: string
  onSelect: (entry: ScanHistoryEntry) => void
}) {
  const label = new Date(currentCreatedAt).toLocaleString(undefined, FULL)
  const others = entries.filter((e) => e.scanId !== currentScanId)

  if (others.length === 0) {
    return (
      <div className="mt-datepill" data-static>
        <CalendarClock size={12} aria-hidden />
        {label}
      </div>
    )
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="mt-datepill" aria-label="Choose a scan to view">
          <CalendarClock size={12} aria-hidden />
          {label}
          <ChevronDown size={12} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="fs-app w-[300px] p-1.5">
        <div className="mt-runs">
          <div className="mt-runs-h">Runs of this keyword here</div>
          {entries.map((e) => {
            const isCurrent = e.scanId === currentScanId
            return (
              <button
                key={e.scanId}
                type="button"
                className="mt-run-item"
                data-current={isCurrent || undefined}
                data-incomparable={!e.comparable || undefined}
                title={e.comparable ? geometryLabel(e) : incomparableCopy(e, e.incomparableReason!)}
                onClick={() => !isCurrent && onSelect(e)}
              >
                <span className="d">
                  {new Date(e.createdAt).toLocaleString(undefined, FULL)}
                  {!e.comparable && (
                    <span className="warn">{incomparableCopy(e, e.incomparableReason!)}</span>
                  )}
                </span>
                <span className="v">{e.visibility != null ? `${Math.round(e.visibility)}%` : "—"}</span>
                {isCurrent && <Check size={12} className="ck" aria-hidden />}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
