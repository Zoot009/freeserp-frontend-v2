"use client"

// Which search engines this deployment tracks.
//
// Fetched, never hardcoded. `GET /api/engines` returns only the engines the
// BACKEND has enabled (its MULTI_ENGINE_IDS), so every engine control in the UI
// self-gates: with one engine the pickers and tabs hide themselves entirely, and
// they appear the moment an operator widens that variable — no frontend deploy.
//
// A static list in the style of lib/locations.ts would break exactly that: it
// would offer Bing while the API still rejected it, and the user would get a 400
// from a control we drew for them.
//
// Cached at module scope because the answer changes about once a quarter, and
// both the add-keyword modal and the keywords table ask for it on the same page.

import { useEffect, useState } from "react"
import { api } from "@/lib/api"

export interface Engine {
  id: string
  label: string
  devices: string[]
  maxDepth: number
  /**
   * Whether the synchronous DataForSEO /live/ endpoint serves this engine.
   *
   * Not a statement about the per-keyword "Check now" button, which is async and
   * works everywhere — so do NOT render this as "instant checks unavailable".
   * It exists for the standalone SERP Checker.
   */
  supportsLive: boolean
  /** Google: pre-selected in the picker. Selectable-away, unlike before. */
  isDefault: boolean
  /**
   * Cadence floor WE impose, in hours. 0 = follow the project's own frequency;
   * 168 (the default for every non-Google engine) = at most weekly.
   *
   * Served by the API but not currently rendered — the picker deliberately shows
   * only a logo and a name. Kept because the difference is real and invisible
   * everywhere else in the product: someone tracking on Bing gets weekly checks
   * and nothing tells them so. Optional, since an older backend omits it.
   */
  minHoursBetweenChecks?: number
  /**
   * False once consecutive failures have sidelined the engine. Optional for the
   * same reason — an older backend never disables anything.
   */
  available?: boolean
}

/** Legacy rows predate the column; treat them as Google, as `device` does null. */
export const DEFAULT_ENGINE = "google"

/** The engine of a keyword row, tolerating older rows and older API responses. */
export function engineOf(row: { engine?: string | null }): string {
  return row.engine ?? DEFAULT_ENGINE
}

// Shared across every consumer on the page, and survives remounts.
let cache: Engine[] | null = null
let inFlight: Promise<Engine[]> | null = null

async function load(): Promise<Engine[]> {
  if (cache) return cache
  if (!inFlight) {
    inFlight = api
      .get<{ engines: Engine[] }>("/api/engines")
      .then((res) => {
        cache = res?.engines ?? []
        return cache
      })
      .catch(() => {
        // An older backend has no /api/engines. Fall back to Google alone rather
        // than rendering nothing — the dashboard must not depend on this call.
        // Every value here is true of Google specifically, so the degraded path
        // states nothing false — it just knows about one engine.
        cache = [
          {
            id: DEFAULT_ENGINE,
            label: "Google",
            devices: ["desktop", "mobile"],
            maxDepth: 100,
            supportsLive: true,
            isDefault: true,
            minHoursBetweenChecks: 0,
            available: true,
          },
        ]
        return cache
      })
      .finally(() => {
        inFlight = null
      })
  }
  return inFlight
}

export function useEngines() {
  const [engines, setEngines] = useState<Engine[]>(cache ?? [])
  const [loading, setLoading] = useState(!cache)

  useEffect(() => {
    let alive = true
    if (cache) return
    load().then((list) => {
      if (!alive) return
      setEngines(list)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [])

  return {
    engines,
    loading,
    /**
     * The gate every engine control checks. One engine means the concept is not
     * worth showing: no picker, no tabs, no badges — the dashboard looks exactly
     * as it did before multi-engine existed.
     */
    multiEngine: engines.length > 1,
  }
}
