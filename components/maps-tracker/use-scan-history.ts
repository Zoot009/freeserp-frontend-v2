"use client"

import { useEffect, useMemo, useState } from "react"
import { api } from "@/lib/api"
import type { ScanHistoryEntry } from "./types"

export interface ScanDeltas {
  /** Change in ARP against the previous comparable scan. Lower is better. */
  rankDelta: number | null
  /** Change in visibility % against the previous comparable scan. Higher is better. */
  visibilityDelta: number | null
  /** The run being compared against, for the caption. */
  previous: ScanHistoryEntry | null
}

/**
 * Prior runs of this keyword at this location, plus the deltas against the
 * newest COMPARABLE one.
 *
 * Its own request rather than part of the scan payload, for the same reason the
 * leaderboard is: it is a different question with a different lifetime, and a
 * slow or failed history must never stop the map and the headline number
 * rendering. A failure here simply means no date pill and no delta chips.
 */
export function useScanHistory(
  locationId: string | null,
  keyword: string | null,
  currentScanId: string | null,
  enabled: boolean,
) {
  const [entries, setEntries] = useState<ScanHistoryEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled || !locationId || !keyword || !currentScanId) {
      setEntries([])
      return
    }
    let cancelled = false
    setLoading(true)
    const qs = new URLSearchParams({ keyword, compareTo: currentScanId })
    api
      .get<{ scans: ScanHistoryEntry[] }>(`/api/maps-tracker/locations/${locationId}/scans?${qs}`)
      .then((data) => {
        if (!cancelled) setEntries(data.scans)
      })
      .catch(() => {
        // Non-fatal: the rest of the report is still worth reading.
        if (!cancelled) setEntries([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [enabled, locationId, keyword, currentScanId])

  const deltas = useMemo<ScanDeltas>(() => {
    const currentIdx = entries.findIndex((e) => e.scanId === currentScanId)
    if (currentIdx < 0) return { rankDelta: null, visibilityDelta: null, previous: null }
    const current = entries[currentIdx]!

    // Entries are newest-first, so "previous" is the next one down that is
    // actually comparable. A non-comparable run is skipped rather than used:
    // a delta across two different geometries looks like a ranking change and
    // isn't one.
    const previous = entries.slice(currentIdx + 1).find((e) => e.comparable) ?? null
    if (!previous) return { rankDelta: null, visibilityDelta: null, previous: null }

    return {
      rankDelta: current.arp != null && previous.arp != null ? round2(current.arp - previous.arp) : null,
      visibilityDelta:
        current.visibility != null && previous.visibility != null
          ? round2(current.visibility - previous.visibility)
          : null,
      previous,
    }
  }, [entries, currentScanId])

  return { entries, deltas, loading }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
