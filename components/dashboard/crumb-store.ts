"use client"

import { useSyncExternalStore } from "react"

/**
 * Tiny project-id → display-name store so the topbar breadcrumb can show the
 * real project name ("seoptimer.com") instead of the generic "Project".
 * Project pages call `setProjectCrumb` once they've fetched their project;
 * the map is mirrored to sessionStorage so hard refreshes on deep pages keep
 * the name.
 */

const KEY = "fs-crumb-projects"

function load(): Record<string, string> {
  if (typeof window === "undefined") return {}
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "{}")
  } catch {
    return {}
  }
}

let names: Record<string, string> | null = null
const listeners = new Set<() => void>()

export function setProjectCrumb(id: string, name: string) {
  if (!id || !name) return
  if (names === null) names = load()
  if (names[id] === name) return
  names = { ...names, [id]: name }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(names))
  } catch {
    /* storage full/blocked — in-memory copy still works */
  }
  listeners.forEach((l) => l())
}

export function useProjectCrumb(id: string | null): string | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => {
      if (!id) return null
      if (names === null) names = load()
      return names[id] ?? null
    },
    // Server snapshot — no name during SSR; the client fills it in.
    () => null,
  )
}

/**
 * A leaf crumb published by the page, for a view that is not its own route.
 *
 * The Quick SERP result is a different view of the SAME url, so the
 * path-derived trail ends at the tool: it cannot name what you have open, and
 * its last crumb is the page you are on, which by definition goes nowhere. The
 * page publishes the leaf and the way back out of it; the crumb above then
 * stops being the end of the line and becomes that way back.
 *
 * Deliberately NOT mirrored to sessionStorage like the project names above: a
 * view is not a place, and a stale "…/ best running shoes" restored onto a
 * fresh page load would name something that isn't on screen.
 */
export type DetailCrumb = {
  label: string
  /** Leave the view. Not an href — the destination is a state on this url. */
  onBack: () => void
}

let detail: DetailCrumb | null = null
const detailListeners = new Set<() => void>()

export function setDetailCrumb(next: DetailCrumb | null) {
  if (detail === next) return
  detail = next
  detailListeners.forEach((l) => l())
}

export function useDetailCrumb(): DetailCrumb | null {
  return useSyncExternalStore(
    (cb) => {
      detailListeners.add(cb)
      return () => detailListeners.delete(cb)
    },
    () => detail,
    () => null,
  )
}
