"use client"

// The visitor's country, resolved from their IP by the backend.
//
// `GET /api/geo` is public and cheap: it reads a CDN geo header (cf-ipcountry)
// when there is one and otherwise does a local geoip-lite lookup of the client
// IP — no third-party round-trip, no key. It answers `{ country: "IN" | null }`,
// and null means "don't know", never an error.
//
// Used to pick the default market in the add-keyword flow, which was hardcoded
// to India for everyone. A guess is all this is: VPNs, travel and agencies
// tracking a foreign market all make it wrong, so it only ever seeds a control
// the user can still change, and a manual pick always wins.
//
// When it comes back null there is deliberately NO fallback market. Silently
// guessing a country the visitor never chose is how keywords end up tracked
// against the wrong SERP — the caller asks the user instead.
//
// Cached at module scope AND in sessionStorage: the answer cannot change while
// the tab is open, the add-keyword modal mounts fresh on every open, and reading
// it back synchronously is what stops the picker visibly flipping from India to
// the real country a moment after it appears.

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { isSupportedLocation } from "@/lib/locations"

const STORAGE_KEY = "freeserp:geo_country"

// `resolved` is separate from `cached` because null is a real answer ("we
// looked, we don't know") and must not trigger a second lookup.
let cached: string | null = null
let resolved = false
let inFlight: Promise<string | null> | null = null

function readStored(): boolean {
  if (typeof window === "undefined") return false
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY)
    if (!stored) return false
    // "-" is how a resolved-but-unknown answer is persisted, so a visitor whose
    // IP we can't place doesn't re-ask on every navigation.
    cached = stored === "-" || !isSupportedLocation(stored) ? null : stored
    resolved = true
    return true
  } catch {
    // Private mode / storage disabled — fall through to the network.
    return false
  }
}

function store(country: string | null) {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(STORAGE_KEY, country ?? "-")
  } catch {
    // Non-fatal: the module-scope cache still covers this page view.
  }
}

/**
 * The country if it is already known this session, else null. Synchronous — for
 * seeding a `useState` initializer without a flash of the wrong default.
 */
export function knownGeoCountry(): string | null {
  if (!resolved) readStored()
  return cached
}

/**
 * Resolve the country, at most once per session. Safe to call eagerly to warm
 * the cache before a modal that needs it opens.
 */
export function prefetchGeoCountry(): Promise<string | null> {
  if (resolved || readStored()) return Promise.resolve(cached)
  if (!inFlight) {
    inFlight = api
      .get<{ country: string | null }>("/api/geo")
      .then((res) => {
        const iso = res?.country?.toLowerCase() ?? ""
        // A country we don't track is the same as no answer: seeding the picker
        // with a market the backend would reject is worse than the fallback.
        cached = iso.length === 2 && isSupportedLocation(iso) ? iso : null
        resolved = true
        store(cached)
        return cached
      })
      .catch(() => {
        // An older backend has no /api/geo, and the lookup is optional anyway.
        // Deliberately NOT marked resolved and NOT persisted — a transient
        // failure shouldn't pin the fallback for the rest of the session.
        return null
      })
      .finally(() => {
        inFlight = null
      })
  }
  return inFlight
}

/**
 * The visitor's country as a lowercase ISO2 we support, plus whether the lookup
 * is still running. Starts it on mount if nothing has yet.
 *
 * `country: null, pending: false` is the settled "we don't know" answer, and is
 * distinct from `pending: true` — a caller that has to ask the user for a
 * location should say so only once the lookup has actually given up.
 */
export function useGeoCountry(): { country: string | null; pending: boolean } {
  const [country, setCountry] = useState<string | null>(() => knownGeoCountry())
  const [pending, setPending] = useState(() => !resolved && !readStored())

  useEffect(() => {
    if (!pending) return
    let alive = true
    void prefetchGeoCountry().then((iso) => {
      if (!alive) return
      if (iso) setCountry(iso)
      setPending(false)
    })
    return () => {
      alive = false
    }
  }, [pending])

  return { country, pending }
}
