"use client"

import { useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"
import type { CompetitorLeaderboard } from "./types"

/**
 * The competitor leaderboard for one keyword.
 *
 * Its own endpoint rather than part of the scan payload, so a slow leaderboard
 * never holds up the map or the headline number. Cached per keyword because
 * flipping between tabs shouldn't re-ask, and non-fatal on failure: the rest
 * of the results are still worth reading without it.
 */
export function useCompetitors(scanId: string | null, keywordId: string | null, enabled: boolean) {
  const [leaderboard, setLeaderboard] = useState<CompetitorLeaderboard | null>(null)
  const [loading, setLoading] = useState(false)
  const cache = useRef(new Map<string, CompetitorLeaderboard>())

  useEffect(() => {
    if (!enabled || !scanId || !keywordId) {
      setLeaderboard(null)
      return
    }
    const key = `${scanId}:${keywordId}`
    const hit = cache.current.get(key)
    if (hit) {
      setLeaderboard(hit)
      return
    }
    let cancelled = false
    setLoading(true)
    setLeaderboard(null)
    api
      .get<CompetitorLeaderboard>(`/api/maps-tracker/scans/${scanId}/keywords/${keywordId}/competitors`)
      .then((data) => {
        cache.current.set(key, data)
        if (!cancelled) setLeaderboard(data)
      })
      .catch(() => {
        /* non-fatal — the results still render without the leaderboard */
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [scanId, keywordId, enabled])

  return { leaderboard, loading }
}
