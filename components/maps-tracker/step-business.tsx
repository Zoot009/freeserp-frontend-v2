"use client"

import { useCallback, useState } from "react"
import { MapPin, Search, Trash2 } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"
import { looksLikePlaceId, usePlaceSearch, type ResolvedPlace } from "./use-place-search"
import type { MapLocation } from "./types"

/** Two saved listings can share a name and address; tell them apart by when
 *  they were added and the tail of the Place ID. */
function disambiguation(loc: MapLocation, siblings: MapLocation[]): string | null {
  const dupes = siblings.filter((s) => s.id !== loc.id && s.name === loc.name && s.address === loc.address)
  if (dupes.length === 0) return null
  const date = new Date(loc.createdAt).toLocaleDateString("en-US", { day: "numeric", month: "short" })
  return `Added ${date} · ${loc.placeId.slice(-6)}`
}

/**
 * Step 1 — pick your business.
 *
 * One field does both jobs the old picker split across two modes: type a name
 * and you get Google's suggestions, paste a Place ID and it resolves directly.
 */
export function BusinessStep({
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
  const places = usePlaceSearch()
  const [busy, setBusy] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<MapLocation | null>(null)
  const [error, setError] = useState<string | null>(null)

  const savePlace = useCallback(
    async (resolved: ResolvedPlace) => {
      setBusy(true)
      setError(null)
      try {
        const { location } = await api.post<{ location: MapLocation }>("/api/maps-tracker/locations", resolved)
        onCreated(location)
        onSelect(location)
        places.reset()
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Couldn't save this location.")
      } finally {
        setBusy(false)
      }
    },
    [onCreated, onSelect, places],
  )

  const pickSuggestion = useCallback(
    async (prediction: google.maps.places.PlacePrediction) => {
      setBusy(true)
      setError(null)
      try {
        await savePlace(await places.resolvePrediction(prediction))
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't resolve that place — try a different search.")
        setBusy(false)
      }
    },
    [places, savePlace],
  )

  const pickPlaceId = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await savePlace(await places.resolvePlaceId(places.query))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't resolve that Place ID.")
      setBusy(false)
    }
  }, [places, savePlace])

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

  const isId = looksLikePlaceId(places.query)

  return (
    <>
      <div className="row" style={{ gap: 6, alignItems: "stretch" }}>
        <input
          className="input"
          style={{ flex: 1 }}
          value={places.query}
          onChange={(e) => places.setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && isId && !busy) {
              e.preventDefault()
              void pickPlaceId()
            }
          }}
          placeholder="Search a business, or paste a Place ID"
          aria-label="Search a business, or paste a Place ID"
          disabled={busy}
        />
        {isId && (
          <button type="button" className="btn primary sm" onClick={() => void pickPlaceId()} disabled={busy}>
            Add
          </button>
        )}
      </div>

      {!places.ready && <div className="mt-step-hint">Loading Google Places…</div>}
      {places.ready && places.searching && <div className="mt-step-hint">Searching…</div>}

      {places.suggestions.length > 0 && (
        <div
          style={{
            marginTop: 8, border: "1px solid var(--border)", borderRadius: "var(--r-md)",
            overflow: "hidden", background: "var(--bg-elev)",
          }}
        >
          {places.suggestions.map((s) => (
            <button
              key={s.placeId}
              type="button"
              className="dd-item"
              style={{ width: "100%", textAlign: "left" }}
              onClick={() => void pickSuggestion(s)}
              disabled={busy}
            >
              <span className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                <Search size={13} style={{ marginTop: 2, flexShrink: 0, opacity: 0.6 }} />
                <span style={{ minWidth: 0 }}>{s.text?.toString() ?? "Unnamed place"}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {locations.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="mt-summary-k" style={{ marginBottom: 6 }}>Saved</div>
          <div className="col" style={{ gap: 2 }}>
            {locations.map((l) => {
              const sub = disambiguation(l, locations)
              return (
                <div key={l.id} className="row" style={{ gap: 4 }}>
                  <button
                    type="button"
                    className="dd-item"
                    data-active={l.id === current?.id}
                    style={{ flex: 1, textAlign: "left", minWidth: 0 }}
                    onClick={() => onSelect(l)}
                  >
                    <span style={{ display: "block", minWidth: 0 }}>
                      <span style={{ display: "block", fontWeight: 500 }}>{l.name}</span>
                      <span className="tiny muted" style={{ display: "block" }}>{sub ?? l.address}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="icon-btn danger"
                    aria-label={`Remove ${l.name}`}
                    disabled={deletingId === l.id}
                    onClick={() => setConfirmDelete(l)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {locations.length === 0 && !places.query && (
        <div className="mt-step-hint">
          Nothing saved yet. Search the name you use on Google, then choose the matching listing.
        </div>
      )}

      {error && (
        <div className="tiny" style={{ marginTop: 10, color: "var(--neg)" }} role="alert">{error}</div>
      )}

      {confirmDelete && (
        <div className="modal-bg" onClick={() => setConfirmDelete(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">
              <div className="b" style={{ fontSize: 15 }}>
                <MapPin size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
                Remove this business?
              </div>
              <button className="icon-btn" onClick={() => setConfirmDelete(null)} aria-label="Close">
                <Icon.close />
              </button>
            </div>
            <div className="modal-b">
              <div className="b">{confirmDelete.name}</div>
              <div className="tiny muted">{confirmDelete.address}</div>
              <p className="tiny muted" style={{ marginTop: 10, lineHeight: 1.55 }}>
                Scans already run for it stay in your history. You can add it again at any time.
              </p>
            </div>
            <div className="modal-f">
              <button type="button" className="btn" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button type="button" className="btn primary" onClick={() => void confirmAndDelete()}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
