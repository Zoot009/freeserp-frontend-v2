"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth"
import { Sidebar } from "./sidebar"
import { Topbar } from "./topbar"

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) router.push("/login")
    if (!loading && user && !user.emailVerified) router.push("/verify-email")
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
      <div className="app">
        <Sidebar />
        <div className="main">
          <Topbar />
          {children}
        </div>
      </div>
    </div>
  )
}
