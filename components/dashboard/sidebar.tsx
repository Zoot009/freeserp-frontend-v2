"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { useAuth } from "@/lib/auth"
import { Icon } from "./icons"

type NavEntry = {
  href: string
  label: string
  icon: (props: { size?: number }) => React.JSX.Element
  badge?: number | string
}

const WORKSPACE: NavEntry[] = [
  { href: "/dashboard", label: "Overview", icon: Icon.dash },
  { href: "/dashboard/projects", label: "Projects", icon: Icon.folder },
  { href: "/dashboard/keywords", label: "Keywords", icon: Icon.key },
]

const TOOLS: NavEntry[] = [
  { href: "/dashboard/serp-checker", label: "SERP Checker", icon: Icon.zap },
  { href: "/dashboard/reports", label: "Reports", icon: Icon.chart },
  { href: "/dashboard/alerts", label: "Alerts", icon: Icon.bell },
  { href: "/dashboard/billing", label: "Settings", icon: Icon.settings },
]

function NavLink({ entry, active }: { entry: NavEntry; active: boolean }) {
  const I = entry.icon
  return (
    <Link href={entry.href} className={"sb-item " + (active ? "active" : "")}>
      <I />
      {entry.label}
      {entry.badge != null && <span className="badge">{entry.badge}</span>}
    </Link>
  )
}

function isActive(href: string, pathname: string) {
  if (href === "/dashboard") return pathname === "/dashboard"
  return pathname === href || pathname.startsWith(href + "/")
}

export function Sidebar() {
  const pathname = usePathname() || ""
  const router = useRouter()
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [menuOpen])

  const initials = (user?.email || "?")
    .split("@")[0]
    .slice(0, 2)
    .toUpperCase()

  const planLabel = user
    ? user.plan === "pro" ? "Pro plan" : "Free plan"
    : "Guest"

  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <span className="spark"><Icon.spark size={16} /></span>
        FreeSerp
      </div>

      <div className="sb-section">Workspace</div>
      {WORKSPACE.map((n) => (
        <NavLink key={n.href} entry={n} active={isActive(n.href, pathname)} />
      ))}

      <div className="sb-section">Tools</div>
      {TOOLS.map((n) => (
        <NavLink key={n.href} entry={n} active={isActive(n.href, pathname)} />
      ))}

      <div className="sb-spacer" />

      {user?.plan !== "pro" && (
        <div className="sb-upgrade">
          <div className="title"><Icon.spark size={12} /> Upgrade to Pro</div>
          <div className="desc">Unlimited keywords, daily updates, API access.</div>
          <Link href="/pricing"><button>See plans</button></Link>
        </div>
      )}

      <div className="sb-user" ref={menuRef} style={{ position: "relative" }}>
        <div className="avatar">{initials}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="name" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {user?.name || user?.email?.split("@")[0] || "Guest"}
          </div>
          <div className="plan">{planLabel}</div>
        </div>
        <button
          type="button"
          aria-label="Account menu"
          onClick={() => setMenuOpen((o) => !o)}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-mute)",
            padding: 4,
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            borderRadius: 6,
          }}
        >
          <Icon.dots />
        </button>
        {menuOpen && (
          <div
            style={{
              position: "absolute",
              bottom: "calc(100% + 6px)",
              right: 8,
              left: 8,
              background: "var(--bg-elev)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-md)",
              boxShadow: "var(--shadow-md)",
              padding: 4,
              zIndex: 40,
            }}
          >
            <Link href="/dashboard/billing">
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  background: "transparent",
                  border: "none",
                  borderRadius: 6,
                  color: "var(--text)",
                  fontSize: 13,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <Icon.settings /> Settings
              </button>
            </Link>
            {user?.email && (
              <div
                style={{
                  padding: "6px 10px 8px",
                  fontSize: 11,
                  color: "var(--text-mute)",
                  borderBottom: "1px solid var(--border)",
                  marginBottom: 4,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={user.email}
              >
                {user.email}
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                logout()
                router.push("/login")
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                background: "transparent",
                border: "none",
                borderRadius: 6,
                color: "var(--neg)",
                fontSize: 13,
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
