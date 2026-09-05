"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useMapsLibrary } from "@vis.gl/react-google-maps"

/**
 * Resolving a business to a Google listing, client-side.
 *
 * This app has no server-side Google Places credential, and the map is already
 * loading this same JS SDK, so the browser resolves the place and the backend
 * just validates and persists whatever comes back.
 *
 * Uses the new AutocompleteSuggestion/Place classes, not the legacy
 * Autocomplete/PlacesService pair — as of March 2025 those are blocked for any
 * API project enabled after that date: suggestions still render, but selecting
 * one silently fails to resolve (no error, just nothing happens).
 * AutocompleteSuggestion is used instead of the ready-made
 * PlaceAutocompleteElement widget because that widget renders through a closed
 * Shadow DOM with Google's own default look (dark pill, its own icons) that
 * can't be restyled to match this app's design — fetching suggestions
 * ourselves keeps full control of the markup.
 *
 * Extracted from the old location-picker so the redesign could replace the
 * popover around it without touching any of this.
 */

const PLACE_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "rating",
  "userRatingCount",
  "types",
  "nationalPhoneNumber",
  "websiteURI",
]

export type ResolvedPlace = {
  placeId: string
  name: string
  address: string
  latitude: number
  longitude: number
  rating?: number
  reviewCount?: number
  primaryCategory?: string
  phone?: string
  website?: string
}

function fromPlace(place: google.maps.places.Place): ResolvedPlace | null {
  const loc = place.location
  if (!place.id || !loc) return null
  return {
    placeId: place.id,
    name: place.displayName ?? "Unnamed location",
    address: place.formattedAddress ?? "",
    latitude: loc.lat(),
    longitude: loc.lng(),
    rating: place.rating ?? undefined,
    reviewCount: place.userRatingCount ?? undefined,
    primaryCategory: place.types?.[0]?.replace(/_/g, " "),
    phone: place.nationalPhoneNumber ?? undefined,
    website: place.websiteURI ?? undefined,
  }
}

/**
 * The redesign merges "search" and "paste a Place ID" into one field, so the
 * field has to tell them apart. Place IDs are long unbroken URL-safe tokens
 * (ChIJ…, GhIJ…, EicR…); a business someone types has spaces, or is short.
 * Deliberately loose — guessing wrong only costs one failed lookup, and the
 * error says so.
 */
export function looksLikePlaceId(value: string): boolean {
  const v = value.trim()
  return v.length >= 20 && /^[A-Za-z0-9_-]+$/.test(v)
}

export function usePlaceSearch() {
  const placesLib = useMapsLibrary("places")
  const [query, setQuery] = useState("")
  const [suggestions, setSuggestions] = useState<google.maps.places.PlacePrediction[]>([])
  const [searching, setSearching] = useState(false)
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reset = useCallback(() => {
    setQuery("")
    setSuggestions([])
    // Ends the billing session; a fresh one is created on the next keystroke.
    sessionTokenRef.current = null
  }, [])

  // Debounced query → AutocompleteSuggestion fetch, grouped under one session
  // token per search (ended when a place is selected or the field is cleared)
  // so Google bills it as a single autocomplete session.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!placesLib || !query.trim() || looksLikePlaceId(query)) {
      setSuggestions([])
      return
    }
    debounceRef.current = setTimeout(() => {
      void (async () => {
        setSearching(true)
        try {
          if (!sessionTokenRef.current) sessionTokenRef.current = new placesLib.AutocompleteSessionToken()
          const { suggestions: results } = await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: query,
            sessionToken: sessionTokenRef.current,
          })
          setSuggestions(
            results
              .map((s) => s.placePrediction)
              .filter((p): p is google.maps.places.PlacePrediction => p !== null),
          )
        } catch {
          setSuggestions([])
        } finally {
          setSearching(false)
        }
      })()
    }, 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [placesLib, query])

  const resolvePrediction = useCallback(async (prediction: google.maps.places.PlacePrediction): Promise<ResolvedPlace> => {
    const place = prediction.toPlace()
    await place.fetchFields({ fields: PLACE_FIELDS })
    const resolved = fromPlace(place)
    if (!resolved) throw new Error("Couldn't resolve that place — try a different search.")
    return resolved
  }, [])

  const resolvePlaceId = useCallback(
    async (id: string): Promise<ResolvedPlace> => {
      if (!placesLib) throw new Error("Google Places is still loading — try again in a moment.")
      const place = new placesLib.Place({ id: id.trim() })
      await place.fetchFields({ fields: PLACE_FIELDS })
      const resolved = fromPlace(place)
      if (!resolved) throw new Error("Place ID not found.")
      return resolved
    },
    [placesLib],
  )

  return {
    ready: placesLib != null,
    query,
    setQuery,
    suggestions,
    searching,
    resolvePrediction,
    resolvePlaceId,
    reset,
  }
}
