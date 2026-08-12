"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth"

// Standalone report views (e.g. the Quick Scan report opened in a new tab) —
// deliberately does NOT wrap children in DashboardShell/AppSidebar. A report
// is meant to read as a clean document, not another dashboard page. Still
// requires login (same redirect-to-login rule DashboardShell applies), just
// without the sidebar/topbar chrome around it.
//
// The "fs-app" class below is NOT cosmetic — every rule in dashboard.css is
// written as ".fs-app .row" / ".fs-app .card" / ".fs-app .tiny" etc., and
// DashboardShell is the only place that class gets applied (components/
// dashboard/shell.tsx). Dropping DashboardShell to remove the sidebar also
// silently dropped EVERY class-based style on this page — flex layouts fell
// back to plain block stacking, cards lost their look, spacing collapsed.
// Only inline styles (borders, padding set directly in JSX) kept working,
// which is why the page looked "messy" rather than fully unstyled. This one
// class is what the rest of the report's styling was actually depending on.
export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) router.replace("/login")
  }, [user, loading, router])

  if (loading || !user) {
    return (
      <div className="fs-app" style={{ padding: 60, textAlign: "center" }}>
        <span className="tiny muted">Loading…</span>
      </div>
    )
  }

  return <div className="fs-app">{children}</div>
}
