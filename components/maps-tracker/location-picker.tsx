"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useMapsLibrary } from "@vis.gl/react-google-maps"
import { MapPin, Search, Hash, Plus, Trash2 } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"
import type { MapLocation } from "./types"

// Resolves places CLIENT-SIDE via the Google Maps JS "Places" library — this
// app has no server-side Google Places credential, and the map is already
// loading this same JS SDK. The backend just validates + persists whatever
// comes back. See the plan's §5.7/§10.3 adaptation note.
//
// Uses the new AutocompleteSuggestion/Place classes, not the legacy
// Autocomplete/PlacesService pair — as of March 2025 those are blocked for
// any API project enabled after that date: suggestions still render, but
// selecting one silently fails to resolve (no error, just nothing happens).
// AutocompleteSuggestion is used instead of the ready-made
// PlaceAutocompleteElement widget because that widget renders through a
// closed Shadow DOM with Google's own default look (dark pill, its own
// icons) that can't be restyled to match this app's `.input`/`.dd-item`
// design — fetching suggestions ourselves keeps full control of the markup.

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

type ResolvedPlace = {
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

function disambiguation(loc: MapLocation, siblings: MapLocation[]): string | null {
  const dupes = siblings.filter((s) => s.id !== loc.id && s.name === loc.name && s.address === loc.address)
  if (dupes.length === 0) return null
  const date = new Date(loc.createdAt).toLocaleDateString("en-US", { day: "numeric", month: "short" })
  return `Added ${date} · ${loc.placeId.slice(-6)}`
}

export function LocationPicker({
  locations,
  current,
  onSelect,
  onCreated,
  onDeleted,
}: {
  locations: MapLocation[]
  current: MapLocation | null
  onSelect: (loc: MapLocation) => void
  onCreated: (loc: MapLocation) => void
  onDeleted: (locationId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<"list" | "search" | "placeId">("list")
  const [filter, setFilter] = useState("")
  const [placeIdInput, setPlaceIdInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<MapLocation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const placesLib = useMapsLibrary("places")
  const [query, setQuery] = useState("")
  const [suggestions, setSuggestions] = useState<google.maps.places.PlacePrediction[]>([])
  const [searching, setSearching] = useState(false)
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  const savePlace = useCallback(
    async (resolved: ResolvedPlace) => {
      setBusy(true)
      setError(null)
      try {
        const { location } = await api.post<{ location: MapLocation }>("/api/maps-tracker/locations", resolved)
        onCreated(location)
        onSelect(location)
        setMode("list")
        setOpen(false)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Couldn't save this location.")
      } finally {
        setBusy(false)
      }
    },
    [onCreated, onSelect],
  )

  const confirmAndDelete = useCallback(async () => {
    if (!confirmDelete) return
    const loc = confirmDelete
    setConfirmDelete(null)
    setDeletingId(loc.id)
    setError(null)
    try {
      await api.delete(`/api/maps-tracker/locations/${loc.id}`)
      onDeleted(loc.id)
    } catch (err) {
      // A location with a scan still in progress can't be removed (409) —
      // surface that reason rather than a generic failure.
      setError(err instanceof ApiError ? err.message : "Couldn't remove this location.")
    } finally {
      setDeletingId(null)
    }
  }, [confirmDelete, onDeleted])

  // Reset the search box whenever it's opened/closed, and end whatever
  // billing session was in progress (a fresh one is created on first
  // keystroke below).
  useEffect(() => {
    if (mode !== "search") {
      setQuery("")
      setSuggestions([])
      sessionTokenRef.current = null
    }
  }, [mode])

  // Debounced query → AutocompleteSuggestion fetch, grouped under one
  // session token per search (ended when a place is selected or the box
  // closes) so Google bills it as a single autocomplete session.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!placesLib || mode !== "search" || !query.trim()) {
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
          setSuggestions(results.map((s) => s.placePrediction).filter((p): p is google.maps.places.PlacePrediction => p !== null))
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
  }, [placesLib, mode, query])

  const selectPrediction = useCallback(
    async (prediction: google.maps.places.PlacePrediction) => {
      setBusy(true)
      setError(null)
      try {
        const place = prediction.toPlace()
        await place.fetchFields({ fields: PLACE_FIELDS })
        const resolved = fromPlace(place)
        if (!resolved) throw new Error("Couldn't resolve that place — try a different search.")
        await savePlace(resolved)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't resolve that place — try a different search.")
      } finally {
        setBusy(false)
        setQuery("")
        setSuggestions([])
        sessionTokenRef.current = null
      }
    },
    [savePlace],
  )

  const resolvePlaceId = useCallback(async () => {
    if (!placesLib || !placeIdInput.trim()) return
    setBusy(true)
    setError(null)
    try {
      const place = new placesLib.Place({ id: placeIdInput.trim() })
      await place.fetchFields({ fields: PLACE_FIELDS })
      const resolved = fromPlace(place)
      if (!resolved) throw new Error("Place ID not found.")
      await savePlace(resolved)
      setPlaceIdInput("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't resolve that Place ID.")
    } finally {
      setBusy(false)
    }
  }, [placesLib, placeIdInput, savePlace])

  const filtered = locations.filter(
    (l) => !filter.trim() || l.name.toLowerCase().includes(filter.toLowerCase()) || l.address.toLowerCase().includes(filter.toLowerCase()),
  )

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-block" }}>
      <button type="button" className="dd-trigger" onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open}>
        <MapPin size={14} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
          {current?.name ?? "Choose a location"}
        </span>
        <span className="dd-caret" data-open={open} aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {open && (
        <div
          className="dd-menu"
          role="listbox"
          data-lenis-prevent
          style={{
            zIndex: 50,
            width: 340,
            padding: 0,
            // Override the shared .dd-menu's own max-height+overflow-y:auto
            // (app/dashboard.css) — that class scrolls its ENTIRE content as
            // one region, which pushed the "Add location" footer below a
            // fixed 320px scroll area along with the list. Here only the
            // location list (below) scrolls; the footer stays pinned.
            maxHeight: "min(70vh, 480px)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {mode === "list" && (
            <>
              <div style={{ padding: 10, borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
                <input
                  className="input sm"
                  placeholder="Filter locations"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  autoFocus
                />
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                {current && (
                  <div style={{ padding: "8px 12px 2px", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: "var(--text-mute)" }}>
                    CURRENT SELECTION
                  </div>
                )}
                {filtered.length === 0 && (
                  <div style={{ padding: "16px 12px", fontSize: 12.5, color: "var(--text-mute)" }}>
                    No saved locations yet. Add one below.
                  </div>
                )}
                {filtered.map((loc) => {
                  const dis = disambiguation(loc, locations)
                  return (
                    <div key={loc.id} className="dd-item" style={{ padding: "4px 4px 4px 10px", gap: 4 }}>
                      <button
                        type="button"
                        style={{
                          flex: 1,
                          minWidth: 0,
                          display: "flex",
                          textAlign: "left",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: "4px 0",
                          color: "inherit",
                          font: "inherit",
                          whiteSpace: "normal",
                        }}
                        onClick={() => {
                          onSelect(loc)
                          setOpen(false)
                        }}
                      >
                        <span className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                          <span style={{ color: current?.id === loc.id ? "var(--brand)" : "var(--text-mute)", marginTop: 2, flexShrink: 0 }}>
                            <MapPin size={14} />
                          </span>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: "block", fontWeight: 600, fontSize: 13 }}>{loc.name}</span>
                            <span className="tiny muted" style={{ display: "block" }}>{loc.address}</span>
                            {dis && <span className="tiny muted" style={{ display: "block" }}>{dis}</span>}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Remove ${loc.name}`}
                        title="Remove this saved location"
                        disabled={deletingId === loc.id}
                        onClick={(e) => {
                          e.stopPropagation() // don't also trigger the row's onSelect
                          setConfirmDelete(loc)
                        }}
                        style={{ flexShrink: 0, color: "var(--neg)" }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )
                })}
              </div>
              <div className="row" style={{ gap: 6, padding: 10, borderTop: "1px solid var(--border)", flexShrink: 0, flexWrap: "wrap" }}>
                <span className="tiny muted" style={{ alignSelf: "center" }}>Add location:</span>
                <button type="button" className="btn sm" onClick={() => setMode("search")}>
                  <Search size={12} /> Search
                </button>
                <button type="button" className="btn sm" onClick={() => setMode("placeId")}>
                  <Hash size={12} /> Place ID
                </button>
                <button type="button" className="btn sm" disabled title="Bulk-import from Google Business Profile — coming soon">
                  <Plus size={12} /> Import
                </button>
              </div>
            </>
          )}

          {mode === "search" && (
            <div style={{ padding: 12 }}>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                <span className="tiny b">Search Google Maps</span>
                <button type="button" className="icon-btn" onClick={() => setMode("list")} aria-label="Back">
                  <Icon.close />
                </button>
              </div>
              <input
                className="input"
                placeholder="Business name or address"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={busy || !placesLib}
                autoFocus
              />
              {!placesLib && <div className="tiny muted" style={{ marginTop: 8 }}>Loading Google Places…</div>}
              {searching && <div className="tiny muted" style={{ marginTop: 8 }}>Searching…</div>}
              {suggestions.length > 0 && (
                <div style={{ marginTop: 8, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                  {suggestions.map((p, i) => (
                    <button
                      key={p.placeId}
                      type="button"
                      disabled={busy}
                      onClick={() => void selectPrediction(p)}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        background: "none",
                        border: "none",
                        borderBottom: i < suggestions.length - 1 ? "1px solid var(--border)" : "none",
                        cursor: "pointer",
                        padding: "8px 10px",
                        color: "inherit",
                        font: "inherit",
                      }}
                    >
                      <span style={{ display: "block", fontWeight: 600, fontSize: 13 }}>
                        {p.mainText?.text ?? p.text.text}
                      </span>
                      {p.secondaryText && (
                        <span className="tiny muted" style={{ display: "block" }}>{p.secondaryText.text}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {mode === "placeId" && (
            <div style={{ padding: 12 }}>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                <span className="tiny b">Add by Place ID</span>
                <button type="button" className="icon-btn" onClick={() => setMode("list")} aria-label="Back">
                  <Icon.close />
                </button>
              </div>
              <input
                className="input"
                placeholder="ChIJ..."
                value={placeIdInput}
                onChange={(e) => setPlaceIdInput(e.target.value)}
                disabled={busy}
              />
              <button
                type="button"
                className="btn primary sm"
                style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
                disabled={busy || !placeIdInput.trim() || !placesLib}
                onClick={() => void resolvePlaceId()}
              >
                {busy ? "Resolving…" : "Add location"}
              </button>
            </div>
          )}

          {error && (
            <div className="tiny" style={{ padding: "8px 12px", color: "var(--neg)" }}>
              {error}
            </div>
          )}
        </div>
      )}

      {confirmDelete && (
        <div className="modal-bg" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-h">
              <div className="b" style={{ fontSize: 16 }}>Remove this location?</div>
              <button onClick={() => setConfirmDelete(null)} className="icon-btn" aria-label="Close"><Icon.close /></button>
            </div>
            <div className="modal-b">
              <div className="tiny muted">
                Remove <strong>{confirmDelete.name}</strong> from your saved locations? Past scans for it are kept.
              </div>
            </div>
            <div className="modal-f">
              <button type="button" className="btn" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button type="button" className="btn primary" onClick={() => void confirmAndDelete()}>
                <Trash2 size={14} /> Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
