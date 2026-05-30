"use client"

import Script from "next/script"
import { useEffect, useState } from "react"

export function ClarityAnalytics() {
  const projectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID
  const [consentGranted, setConsentGranted] = useState(false)

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

  if (!projectId || !consentGranted) return null

  return (
    <Script id="ms-clarity" strategy="afterInteractive">
      {`
        (function(c,l,a,r,i,t,y){
          c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
          t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
          y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
        })(window, document, "clarity", "script", "${projectId}");
      `}
    </Script>
  )
}
