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
  // Kept with the key it answers, so switching keyword can never show the
  // last keyword's list for a render.
  const [result, setResult] = useState<{ key: string; data: CompetitorLeaderboard } | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const cache = useRef(new Map<string, CompetitorLeaderboard>())
  const key = enabled && scanId && keywordId ? `${scanId}:${keywordId}` : null

  useEffect(() => {
    if (!key) return
    const hit = cache.current.get(key)
    if (hit) {
      setResult({ key, data: hit })
      return
    }
    let cancelled = false
    api
      .get<CompetitorLeaderboard>(`/api/maps-tracker/scans/${scanId}/keywords/${keywordId}/competitors`)
      .then((data) => {
        cache.current.set(key, data)
        if (!cancelled) setResult({ key, data })
      })
      .catch(() => {
        // Non-fatal — the results still render without the leaderboard.
        if (!cancelled) setFailedKey(key)
      })
    return () => {
      cancelled = true
    }
  }, [key, scanId, keywordId])

  const leaderboard = key && result?.key === key ? result.data : null
  // Derived rather than a flag set inside the effect: on the render the results
  // first arrived in, that flag was still false, and the list read "no
  // leaderboard, not loading" as a failure — a flash of "Couldn't load".
  const loading = key != null && leaderboard == null && failedKey !== key
  return { leaderboard, loading }
}
