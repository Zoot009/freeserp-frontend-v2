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
