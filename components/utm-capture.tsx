"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { hasAnyUtm, readUtm, recordTouch, type Utm } from "@/lib/utm"
import { track, flushPageEngagement, markPage, initHeatmap } from "@/lib/analytics"

// Marks that this browser session's entry touch has been recorded, so the
// direct/organic origin (referrer + landing path) is logged once per session
// rather than on every navigation. An attributed (utm) entry also sets it.
const SESSION_STARTED_KEY = "fs_session_started"

function sessionStarted(): boolean {
  try {
    return sessionStorage.getItem(SESSION_STARTED_KEY) === "1"
  } catch {
    // sessionStorage unavailable — treat as started so we don't loop on origin.
    return true
  }
}
function markSessionStarted() {
  try {
    sessionStorage.setItem(SESSION_STARTED_KEY, "1")
  } catch {
    /* ignore */
  }
}

function dedupeKey(prefix: string, path: string, utm: Utm) {
  return [prefix, path, utm.utmSource, utm.utmMedium, utm.utmCampaign, utm.utmContent, utm.utmTerm]
    .map((p) => p ?? "")
    .join("|")
}

// Records first-party marketing touches to our own backend (no GTM/third party).
// Gated on cookie consent for parity with ClarityAnalytics. Renders nothing.
//
// Robustness: campaign links often land on "/", which server-redirects to the
// dashboard (the query string is forwarded — see app/[locale]/page.tsx), and the
// dashboard may then client-redirect (e.g. an unauthenticated bounce to /login).
// So we SNAPSHOT the UTMs from the very first client render and flush them once
// consent resolves — a later redirect or a slow consent check can't drop them.
export function UtmCapture() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [consentGranted, setConsentGranted] = useState(false)

  // Captured during the first render (before any effect/redirect runs).
  const [entry] = useState<{ utm: Utm; landingPath: string; referrer?: string }>(() => {
    if (typeof window === "undefined") return { utm: {}, landingPath: "/" }
    return {
      utm: readUtm(new URLSearchParams(window.location.search)),
      landingPath: window.location.pathname,
      referrer: document.referrer || undefined,
    }
  })
  const entryHandled = useRef(false)

  // Mirror ClarityAnalytics: read consent and react to later changes so a touch
  // can be captured the moment the user accepts, without needing a navigation.
  useEffect(() => {
    if (typeof window === "undefined") return
    const check = () => setConsentGranted(localStorage.getItem("cookie-consent") === "accepted")
    check()
    window.addEventListener("cookie-consent-change", check)
    window.addEventListener("storage", check)
    return () => {
      window.removeEventListener("cookie-consent-change", check)
      window.removeEventListener("storage", check)
    }
  }, [])

  useEffect(() => {
    if (!consentGranted) return

    // 1) Entry touch — once per page load, from the redirect-proof snapshot.
    if (!entryHandled.current) {
      entryHandled.current = true
      if (hasAnyUtm(entry.utm)) {
        markSessionStarted() // an attributed entry IS the session origin
        void recordTouch(
          { ...entry.utm, referrer: entry.referrer, landingPath: entry.landingPath },
          dedupeKey("entry", entry.landingPath, entry.utm),
        )
        return
      }
      // No UTMs on entry → fall through to record the session origin below.
    }

    // 2) UTMs picked up on a later client-side navigation.
    const utm = readUtm(searchParams)
    const referrer = typeof document !== "undefined" ? document.referrer || undefined : undefined
    if (hasAnyUtm(utm)) {
      void recordTouch({ ...utm, referrer, landingPath: pathname }, dedupeKey("nav", pathname, utm))
      return
    }

    // 3) First landing of the session with no UTMs → record the origin once.
    if (!sessionStarted()) {
      markSessionStarted()
      void recordTouch({ referrer, landingPath: pathname })
    }
  }, [consentGranted, pathname, searchParams, entry])

  // Register the click-heatmap listener once (the handler re-checks consent).
  useEffect(() => {
    initHeatmap()
  }, [])

  // Behavioural page-view tracking, deduped on consecutive identical paths. track()
  // gates on consent itself; the effect just fires it on each real navigation. On
  // each navigation, flush the engagement (dwell + scroll) of the page just left and
  // start measuring the new one (both consent-gated internally).
  const lastPagePath = useRef<string | null>(null)
  useEffect(() => {
    if (!consentGranted || lastPagePath.current === pathname) return
    flushPageEngagement()
    markPage(pathname)
    lastPagePath.current = pathname
    track("$pageview")
  }, [consentGranted, pathname])

  return null
}
