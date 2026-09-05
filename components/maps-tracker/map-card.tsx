"use client"

import type { ReactNode } from "react"

/**
 * The map's frame: a card with the map filling it, an optional corner badge
 * and a caption underneath.
 *
 * `emptyState` renders INSTEAD of the map, not over it. Veiling a live map
 * would pay for a map load and show the cooperative-scroll hint on a map
 * nobody can use, before a business has been picked.
 */
export function MapCard({
  children,
  emptyState,
  badge,
  note,
  minHeight = 400,
}: {
  children?: ReactNode
  emptyState?: ReactNode
  badge?: ReactNode
  note?: ReactNode
  minHeight?: number
}) {
  return (
    <div className="mt-mapcard">
      <div className="mt-map" style={{ minHeight }}>
        {emptyState ?? children}
        {badge && !emptyState && <div className="mt-map-badge">{badge}</div>}
      </div>
      {note && <div className="mt-mapnote">{note}</div>}
    </div>
  )
}

/** Shown before a business exists. */
export function MapEmptyState() {
  return (
    <div className="mt-map-empty">
      <div style={{ maxWidth: 300 }}>
        <div className="ring" aria-hidden />
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Your grid previews here</div>
        <div className="tiny" style={{ color: "var(--text-soft)", lineHeight: 1.5 }}>
          Once you pick a business we drop a pin and preview every point we would search.
        </div>
      </div>
    </div>
  )
}
