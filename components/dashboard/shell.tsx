"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth"
import { Sidebar } from "./sidebar"
import { Topbar } from "./topbar"
import { TrialCountdownBanner } from "./trial-countdown-banner"
import { TrialEndedGate } from "./trial-ended-gate"

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [navOpen, setNavOpen] = useState(false)
  // Desktop sidebar collapse (icon-only rail). Persisted per browser; read in
  // an effect so SSR and the first client render agree (expanded).
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    setCollapsed(localStorage.getItem("fs-sb-collapsed") === "1")
  }, [])
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      localStorage.setItem("fs-sb-collapsed", c ? "0" : "1")
      return !c
    })

  useEffect(() => {
    if (!loading && !user) router.replace("/login")
    else if (!loading && user && !user.emailVerified) router.replace("/verify-email")
    // One-time required onboarding: a verified user who hasn't picked a role yet
    // is sent to the dedicated page until occupationRole is set.
    else if (!loading && user && !user.occupationRole) router.replace("/onboarding")
  }, [user, loading, router])

  // A redirect above is pending whenever the user isn't fully onboarded — not
  // signed in, email unverified, or hasn't picked a role yet. Show the loader,
  // NOT the dashboard, so a brand-new account goes loading → onboarding instead
  // of flashing the dashboard for a frame before the effect bounces it away.
  const redirecting = !user || !user.emailVerified || !user.occupationRole

  if (loading || redirecting) {
    return (
      <div className="fs-app" translate="no">
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--text-mute)", fontSize: 13 }}>
          Loading…
        </div>
      </div>
    )
  }

  return (
    <div className="fs-app" translate="no">
      {/* The gate wraps the ENTIRE app — sidebar and topbar included — because it
          blurs what it covers, and a blur that stopped at the content area would
          leave a sharp sidebar floating over a frosted page. */}
      <TrialEndedGate>
        <div className={"app" + (collapsed ? " sb-collapsed" : "")}>
          {/* Spans the whole grid as its own row, so the promo bar sits above the
              sidebar and topbar rather than only over the content column. */}
          <TrialCountdownBanner />
          <Sidebar
            open={navOpen}
            onClose={() => setNavOpen(false)}
            collapsed={collapsed}
            onToggleCollapse={toggleCollapsed}
          />
          <div
            className="sb-overlay"
            data-open={navOpen}
            onClick={() => setNavOpen(false)}
            aria-hidden="true"
          />
          <div className="main">
            <Topbar onMenuClick={() => setNavOpen(true)} />
            {children}
          </div>
        </div>
      </TrialEndedGate>
    </div>
  )
}
