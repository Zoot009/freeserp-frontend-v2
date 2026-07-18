"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth"
import { Sidebar } from "./sidebar"
import { Topbar } from "./topbar"

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.push("/login")
    else if (!loading && user && !user.emailVerified) router.push("/verify-email")
    // One-time required onboarding: a verified user who hasn't picked a role yet
    // is sent to the dedicated page until occupationRole is set.
    else if (!loading && user && !user.occupationRole) router.push("/onboarding")
  }, [user, loading, router])

  if (loading || !user) {
    return (
      <div className="fs-app">
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--text-mute)", fontSize: 13 }}>
          Loading…
        </div>
      </div>
    )
  }

  return (
    <div className="fs-app">
      <div className={"app" + (navOpen ? " expanded" : "")}>
        <Sidebar open={navOpen} onClose={() => setNavOpen(false)} onToggle={() => setNavOpen((o) => !o)} />
        <div
          className="sb-overlay"
          data-open={navOpen}
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
        <div className="main">
          <Topbar />
          {children}
        </div>
      </div>
    </div>
  )
}
