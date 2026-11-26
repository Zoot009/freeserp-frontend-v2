"use client"
// A Google map that can't take its page down. When Google rejects the key
// (InvalidKeyMapError, a referrer restriction, billing off) or the library throws,
// the map's box shows `fallback` and the rest of the page carries on.

import { Component, useEffect, useState, type ReactNode } from "react"

/**
 * Catches what the map throws. It has to stay mounted while the map goes: on a
 * rejected key the markers throw as they're removed, and an error thrown during a
 * removal goes to the nearest boundary still on the page. When the boundary was
 * removed along with the map, that was the dashboard's, and the whole page broke.
 */
class MapBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.warn("[maps] the map failed:", error)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

// Google reports a rejected key through a global rather than by throwing. Once it
// has, every map on the page (and any opened after) is refused too.
let authFailed = false
const listeners = new Set<() => void>()
let installed = false
function listenForAuthFailure() {
  if (installed) return
  installed = true
  const w = window as Window & { gm_authFailure?: () => void }
  const previous = w.gm_authFailure
  w.gm_authFailure = () => {
    authFailed = true
    listeners.forEach((l) => l())
    previous?.()
  }
}

function useMapRefused(): boolean {
  const [refused, setRefused] = useState(authFailed)
  useEffect(() => {
    listenForAuthFailure()
    if (authFailed) setRefused(true)
    const l = () => setRefused(true)
    listeners.add(l)
    return () => void listeners.delete(l)
  }, [])
  return refused
}

/** The map (`children`, its APIProvider included), or `fallback` once Google refuses it or it throws. */
export function SafeMap({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  const refused = useMapRefused()
  return <MapBoundary fallback={fallback}>{refused ? fallback : children}</MapBoundary>
}
