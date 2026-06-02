"use client"

import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { Icon } from "./icons"
import { NotificationBell } from "./notification-bell"

// Static path → breadcrumb map. The `crumbsFor` fallback below appends "…"
// for any unrecognised sub-path, so deep routes like
// /dashboard/project/<id>/competitor-analysis/results just need their parent
// prefix registered here.
const CRUMBS: Record<string, string[]> = {
  "/dashboard": ["Workspace", "Overview"],
  "/dashboard/projects": ["Workspace", "Projects"],
  "/dashboard/project": ["Workspace", "Projects", "Project"],
  "/dashboard/keywords": ["Workspace", "Keywords"],
  "/dashboard/serp-checker": ["Tools", "SERP Checker"],
  "/dashboard/reports": ["Tools", "Reports"],
  "/dashboard/alerts": ["Tools", "Alerts"],
  "/dashboard/billing": ["Tools", "Settings"],
}

function crumbsFor(pathname: string): string[] {
  const direct = CRUMBS[pathname]
  if (direct) return direct
  const matched = Object.keys(CRUMBS)
    .filter((p) => pathname.startsWith(p + "/") || pathname === p)
    .sort((a, b) => b.length - a.length)[0]
  if (matched) return [...CRUMBS[matched], "…"]
  return ["Workspace"]
}

export function Topbar() {
  const pathname = usePathname() || "/dashboard"
  const crumbs = crumbsFor(pathname)
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = mounted && (resolvedTheme === "dark" || theme === "dark")

  return (
    <div className="topbar">
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <span key={i} className={i === crumbs.length - 1 ? "here" : ""}>
            {i > 0 && <span className="sep" style={{ marginRight: 6 }}>/</span>}
            {c}
          </span>
        ))}
      </div>
      <div className="search">
        <span className="ic"><Icon.search /></span>
        <input placeholder="Search keywords, projects, competitors…" />
      </div>
      <button
        className="icon-btn"
        title="Toggle theme"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        aria-label="Toggle theme"
      >
        {isDark ? <Icon.sun /> : <Icon.moon />}
      </button>
      <NotificationBell />
    </div>
  )
}
