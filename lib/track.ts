// Lightweight Google-funnel milestone tracking. GTM is loaded app-wide (see
// app/[locale]/layout.tsx); these helpers append a bare marker flag to the URL
// — so a GTM History-Change / "URL contains" trigger fires — and also push a
// matching dataLayer event for GTM custom-event triggers.

import { api } from "@/lib/api"

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[]
  }
}

// Append `flag` as a bare query param to the current URL (no-op if already
// present) and push a { event: flag } entry to the dataLayer. The pushState
// keeps the user on the same page while still firing GTM's History listener.
export function trackEvent(flag: string): void {
  if (typeof window === "undefined") return
  const { pathname, search, hash } = window.location
  if (!search.split(/[?&]/).includes(flag)) {
    window.history.pushState(null, "", `${pathname}${search}${search ? "&" : "?"}${flag}${hash}`)
  }
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push({ event: flag })
}

// Fire trackEvent at most once per browser, guarded by localStorage. Use for
// the "first time" funnel milestones.
export function trackOnce(flag: string): void {
  if (typeof window === "undefined") return
  const key = `fs_tracked_${flag}`
  try {
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, "1")
  } catch {
    // localStorage unavailable (private mode / blocked) — still fire once now.
  }
  trackEvent(flag)
}

// Account-level once: the backend atomically records the milestone and reports
// whether THIS call was the first to reach it, so we fire the GTM conversion
// exactly once per account. Unlike trackOnce (per-browser localStorage), this is
// correct across devices and never re-fires after the user deletes and recreates
// the underlying project/keywords. `flag` must be a milestone key the
// /api/me/milestones endpoint whitelists.
export async function trackMilestone(flag: string): Promise<void> {
  if (typeof window === "undefined") return
  try {
    const { firstTime } = await api.post<{ firstTime: boolean }>("/api/me/milestones", { key: flag })
    if (firstTime) trackEvent(flag)
  } catch {
    // Backend unreachable / not yet migrated — degrade to a per-browser guard so
    // a genuine first milestone still has a chance to register rather than being
    // lost entirely.
    trackOnce(flag)
  }
}
