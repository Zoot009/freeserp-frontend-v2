"use client"

import { useState } from "react"
import { api } from "@/lib/api"
import { Icon } from "./icons"

export type FavoriteEntityType = "keyword" | "competitor_analysis" | "project"

export function FavoriteButton({
  entityType,
  entityId,
  initial = false,
  size = 16,
  title,
  onChange,
  style,
}: {
  entityType: FavoriteEntityType
  entityId: string
  initial?: boolean
  size?: number
  // Optional override for the button's tooltip/aria-label.
  title?: { add: string; remove: string }
  // Fires with the new favorited state after an optimistic toggle (and again on
  // rollback if the request fails), so parents can update local lists in place.
  onChange?: (favorited: boolean) => void
  // Optional style overrides merged onto the button (e.g. to match sibling
  // icon-button sizing).
  style?: React.CSSProperties
}) {
  const [fav, setFav] = useState(initial)
  const [busy, setBusy] = useState(false)

  const toggle = async (e: React.MouseEvent) => {
    // Rows/cards are click-to-navigate — don't let the toggle bubble into them.
    e.stopPropagation()
    e.preventDefault()
    if (busy) return
    const next = !fav
    setFav(next)
    setBusy(true)
    onChange?.(next)
    try {
      if (next) await api.post("/api/favorites", { entityType, entityId })
      else await api.delete("/api/favorites", { body: { entityType, entityId } })
    } catch {
      // Roll back the optimistic flip on failure.
      setFav(!next)
      onChange?.(!next)
    } finally {
      setBusy(false)
    }
  }

  const label = fav
    ? title?.remove ?? "Remove from favorites"
    : title?.add ?? "Add to favorites"

  return (
    <button
      type="button"
      className="icon-btn"
      aria-pressed={fav}
      aria-label={label}
      title={label}
      onClick={toggle}
      style={{ color: fav ? "var(--brand)" : "var(--text-mute)", ...style }}
    >
      {fav ? <Icon.starFilled size={size} /> : <Icon.star size={size} />}
    </button>
  )
}
