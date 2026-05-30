"use client"

import { useState, useEffect } from "react"

export function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    const consent = localStorage.getItem("cookie-consent")
    if (!consent) {
      setShowBanner(true)
    }
  }, [])

  const acceptCookies = () => {
    localStorage.setItem("cookie-consent", "accepted")
    window.dispatchEvent(new Event("cookie-consent-change"))
    setShowBanner(false)
  }

  const declineCookies = () => {
    localStorage.setItem("cookie-consent", "declined")
    window.dispatchEvent(new Event("cookie-consent-change"))
    setShowBanner(false)
  }

  if (!showBanner) return null

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[100] bg-background border-t border-border shadow-lg"
      role="dialog"
      aria-label="Cookie consent"
      aria-modal="false"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex-1">
            <h3 className="font-[var(--font-bebas)] text-xl sm:text-2xl tracking-tight mb-2">
              Cookie Policy
            </h3>
            <p className="font-mono text-xs sm:text-sm text-muted-foreground leading-relaxed">
              We use cookies to enhance your experience, analyze site traffic, and for marketing purposes.
              By clicking "Accept", you consent to our use of cookies.
            </p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={declineCookies}
              className="flex-1 sm:flex-none border border-border px-4 sm:px-6 py-2 sm:py-3 font-mono text-xs uppercase tracking-widest hover:bg-muted transition-colors"
              aria-label="Decline cookies"
            >
              Decline
            </button>
            <button
              onClick={acceptCookies}
              className="flex-1 sm:flex-none bg-accent text-accent-foreground px-4 sm:px-6 py-2 sm:py-3 font-mono text-xs uppercase tracking-widest hover:bg-accent/90 transition-colors"
              aria-label="Accept cookies"
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
