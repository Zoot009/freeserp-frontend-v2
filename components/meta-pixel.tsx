"use client"

import Script from "next/script"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
  }
}

// Meta (Facebook) Pixel — the browser half of the Conversions API pair. Its id is
// the same value as the backend's META_DATASET_ID, so events sent from the browser
// and from the server deduplicate against one dataset.
//
// Consent-gated like ClarityAnalytics: this is advertising tracking, so it stays
// off until the visitor accepts cookies, and reacts to a later change of mind.
export function MetaPixel() {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID
  const [consentGranted, setConsentGranted] = useState(false)
  const pathname = usePathname()
  const trackedPath = useRef<string | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return

    const checkConsent = () => {
      setConsentGranted(localStorage.getItem("cookie-consent") === "accepted")
    }

    checkConsent()

    const onConsentChange = () => checkConsent()
    window.addEventListener("cookie-consent-change", onConsentChange)
    window.addEventListener("storage", onConsentChange)

    return () => {
      window.removeEventListener("cookie-consent-change", onConsentChange)
      window.removeEventListener("storage", onConsentChange)
    }
  }, [])

  // Meta's stock snippet fires PageView once, on document load. Next.js then routes
  // client-side without another load, so without this the pixel would only ever see
  // the page a visitor landed on and nothing they navigated to afterwards.
  useEffect(() => {
    if (!pixelId || !consentGranted) return

    // The first pass is the page the init snippet already counted — recording it
    // here rather than tracking it keeps that landing page from counting twice.
    if (trackedPath.current === null) {
      trackedPath.current = pathname
      return
    }
    if (trackedPath.current === pathname) return

    trackedPath.current = pathname
    window.fbq?.("track", "PageView")
  }, [pathname, pixelId, consentGranted])

  if (!pixelId || !consentGranted) return null

  // afterInteractive for the same reason as the GTM tag above it in the layout:
  // next/script injects it imperatively, so React 19 doesn't warn about a rendered
  // inline <script>.
  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window,document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', '${pixelId}');
        fbq('track', 'PageView');
      `}
    </Script>
  )
}
