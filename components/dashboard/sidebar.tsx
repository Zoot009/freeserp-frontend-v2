"use client"

import { useTranslations } from "next-intl"
import Image from "next/image"
import { Link, usePathname, useRouter } from "@/i18n/navigation"
import { useEffect, useRef, useState } from "react"
import { useAuth } from "@/lib/auth"
import { useTrialUsage } from "@/hooks/use-trial-usage"
import { Icon } from "./icons"

type NavEntry = {
  href: string
  labelKey: string
  icon: (props: { size?: number }) => React.JSX.Element
  badge?: number | string
}

const WORKSPACE: NavEntry[] = [
  { href: "/dashboard/home", labelKey: "homeDash", icon: Icon.dash },
  { href: "/dashboard", labelKey: "overview", icon: Icon.dash },
  { href: "/dashboard/projects", labelKey: "projects", icon: Icon.folder },
  { href: "/dashboard/keywords", labelKey: "keywords", icon: Icon.key },
  { href: "/dashboard/youtube", labelKey: "youtube", icon: Icon.video },
  { href: "/dashboard/favorites", labelKey: "favorites", icon: Icon.starFilled },
]

const TOOLS: NavEntry[] = [
  { href: "/dashboard/serp-checker", labelKey: "quickSerp", icon: Icon.zap },
  { href: "/dashboard/keyword-magic", labelKey: "keywordMagic", icon: Icon.key },
  { href: "/dashboard/keyword-analysis", labelKey: "keywordAnalysis", icon: Icon.search },
  { href: "/dashboard/onpage-audit", labelKey: "onPageAudit", icon: Icon.monitor },
  { href: "/dashboard/billing", labelKey: "settings", icon: Icon.settings },
]

function NavLink({ entry, label, active, onNavigate, collapsed }: { entry: NavEntry; label: string; active: boolean; onNavigate?: () => void; collapsed?: boolean }) {
  const I = entry.icon
  return (
    <Link
      href={entry.href}
      className={"sb-item " + (active ? "active" : "")}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
    >
      <I />
      <span className="sb-label">{label}</span>
      {entry.badge != null && <span className="badge">{entry.badge}</span>}
    </Link>
  )
}

function isActive(href: string, pathname: string) {
  if (href === "/dashboard") return pathname === "/dashboard"
  return pathname === href || pathname.startsWith(href + "/")
}

export function Sidebar({
  open = false,
  onClose,
  collapsed = false,
  onToggleCollapse,
}: {
  open?: boolean
  onClose?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}) {
  const pathname = usePathname() || ""
  const router = useRouter()
  const t = useTranslations("dashboardNav")
  const { user, logout } = useAuth()
  const { trial, loading: trialLoading } = useTrialUsage()
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
        {/* The real FreeSERP mark (same asset as the favicon / auth pages) rather
            than a generic sparkle glyph. Decorative: the "FreeSerp" label is
            right next to it, so alt is empty to avoid a duplicate announcement. */}
        <span className="spark sb-logo">
          <Image src="/logo.png" alt="" width={22} height={22} priority />
        </span>
        <span className="sb-label">FreeSerp</span>
        {onToggleCollapse && (
          <button
            type="button"
            className="sb-collapse"
            onClick={onToggleCollapse}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <span style={{ display: "inline-flex", transform: collapsed ? "none" : "rotate(180deg)", transition: "transform .18s ease" }}>
              <Icon.chevR />
            </span>
          </button>
        )}
      </div>

      <div className="sb-section">{t("workspace")}</div>
      {WORKSPACE.map((n) => (
        <NavLink key={n.href} entry={n} label={t(n.labelKey)} active={isActive(n.href, pathname)} onNavigate={onClose} collapsed={collapsed} />
      ))}

      <div className="sb-section">{t("tools")}</div>
      {TOOLS.map((n) => (
        <NavLink key={n.href} entry={n} label={t(n.labelKey)} active={isActive(n.href, pathname)} onNavigate={onClose} collapsed={collapsed} />
      ))}

      <div className="sb-spacer" />

      {!isPaid && (
        <div className="sb-upgrade">
          <div className="title"><Icon.spark size={12} /> {t("upgradeToPro")}</div>
          {/* Hold a skeleton until usage has loaded, so the card never flashes the
              generic pitch and then swaps to the trial line. Once loaded: a live
              trial shows its remaining time + progress; otherwise the pitch. */}
          {trialLoading ? (
            <div className="sb-up-skel" aria-hidden />
          ) : trial ? (
            <>
              <div className={"sb-trial" + (trial.finalDay ? " urgent" : "")}>
                <Icon.clock size={12} />
                {trial.finalDay
                  ? t("trialHoursLeft", { hours: trial.hoursLeft })
                  : t("trialDaysLeft", { days: trial.daysLeft })}
              </div>
              <div className="sb-trial-bar" aria-hidden>
                <i style={{ width: `${Math.min(100, Math.max(4, Math.round(trial.percentElapsed)))}%` }} />
              </div>
            </>
          ) : (
            <div className="desc">{t("upgradeDesc")}</div>
          )}
          <Link href="/pricing?clicked-buy-button"><button>{t("seePlans")}</button></Link>
        </div>
      )}

      <div className="sb-user" ref={menuRef} style={{ position: "relative" }}>
        {/* When collapsed only the avatar remains visible, so it doubles as the
            account-menu trigger. */}
        <div
          className="avatar"
          onClick={() => setMenuOpen((o) => !o)}
          style={{ cursor: "pointer" }}
          title={collapsed ? (user?.name || user?.email || undefined) : undefined}
        >
          {initials}
        </div>
        {!collapsed && (
          <>
            <div className="sb-user-info" style={{ minWidth: 0, flex: 1 }}>
              <div className="name" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {user?.name || user?.email?.split("@")[0] || t("guest")}
              </div>
              <div className="plan">{planLabel}</div>
            </div>
            <button
              type="button"
              className="sb-user-dots"
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
          </>
        )}
        {menuOpen && (
          <div className="sb-user-menu">
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
