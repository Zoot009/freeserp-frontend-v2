"use client"

import { useTranslations } from "next-intl"
import { Link, usePathname, useRouter } from "@/i18n/navigation"
import { useEffect, useRef, useState } from "react"
import { useAuth } from "@/lib/auth"
import { Icon } from "./icons"

type NavEntry = {
  href: string
  labelKey: string
  icon: (props: { size?: number }) => React.JSX.Element
  badge?: number | string
}

const WORKSPACE: NavEntry[] = [
  { href: "/dashboard", labelKey: "overview", icon: Icon.dash },
  { href: "/dashboard/projects", labelKey: "projects", icon: Icon.folder },
  { href: "/dashboard/keywords", labelKey: "keywords", icon: Icon.key },
  { href: "/dashboard/favorites", labelKey: "favorites", icon: Icon.starFilled },
]

const TOOLS: NavEntry[] = [
  { href: "/dashboard/serp-checker", labelKey: "quickSerp", icon: Icon.zap },
  { href: "/dashboard/alerts", labelKey: "alerts", icon: Icon.bell },
  { href: "/dashboard/billing", labelKey: "settings", icon: Icon.settings },
]

function NavLink({ entry, label, active, onNavigate }: { entry: NavEntry; label: string; active: boolean; onNavigate?: () => void }) {
  const I = entry.icon
  return (
    <Link href={entry.href} className={"sb-item " + (active ? "active" : "")} onClick={onNavigate}>
      <I />
      {label}
      {entry.badge != null && <span className="badge">{entry.badge}</span>}
    </Link>
  )
}

function isActive(href: string, pathname: string) {
  if (href === "/dashboard") return pathname === "/dashboard"
  return pathname === href || pathname.startsWith(href + "/")
}

export function Sidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname() || ""
  const router = useRouter()
  const t = useTranslations("dashboardNav")
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Close the mobile drawer whenever the route changes (covers nav-link clicks,
  // browser back, and programmatic navigation).
  useEffect(() => {
    onClose?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

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

  // Backend plan values are "free" | "paid" (a paid user is shown as "Pro").
  const isPaid = user?.plan === "paid"
  const planLabel = user ? (isPaid ? t("proPlan") : t("freePlan")) : t("guest")

  return (
    <aside className={"sidebar" + (open ? " open" : "")}>
      <div className="sb-brand">
        <span className="spark"><Icon.spark size={16} /></span>
        FreeSerp
      </div>

      <div className="sb-section">{t("workspace")}</div>
      {WORKSPACE.map((n) => (
        <NavLink key={n.href} entry={n} label={t(n.labelKey)} active={isActive(n.href, pathname)} onNavigate={onClose} />
      ))}

      <div className="sb-section">{t("tools")}</div>
      {TOOLS.map((n) => (
        <NavLink key={n.href} entry={n} label={t(n.labelKey)} active={isActive(n.href, pathname)} onNavigate={onClose} />
      ))}

      <div className="sb-spacer" />

      {!isPaid && (
        <div className="sb-upgrade">
          <div className="title"><Icon.spark size={12} /> {t("upgradeToPro")}</div>
          <div className="desc">{t("upgradeDesc")}</div>
          <Link href="/pricing"><button>{t("seePlans")}</button></Link>
        </div>
      )}

      <div className="sb-user" ref={menuRef} style={{ position: "relative" }}>
        <div className="avatar">{initials}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="name" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {user?.name || user?.email?.split("@")[0] || t("guest")}
          </div>
          <div className="plan">{planLabel}</div>
        </div>
        <button
          type="button"
          aria-label={t("accountMenu")}
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
                <Icon.settings /> {t("settings")}
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
              {t("signOut")}
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
