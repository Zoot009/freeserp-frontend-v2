"use client"

import { useTranslations } from "next-intl"
import { usePathname } from "@/emails/i18n/navigation"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { LanguageSwitcher } from "@/components/language-switcher"
import { Icon } from "./icons"
import { NotificationBell } from "./notification-bell"
import { UsageMeter } from "./usage-meter"

// Static path → breadcrumb map, keyed by translation-key tuples. The `crumbsFor`
// fallback below appends "…" for any unrecognised sub-path, so deep routes like
// /dashboard/project/<id>/competitor-analysis/results just need their parent
// prefix registered here. `usePathname` from @/i18n/navigation is locale-agnostic,
// so these keys match regardless of the active locale prefix.
const CRUMB_KEYS: Record<string, string[]> = {
  "/dashboard": ["workspace", "overview"],
  "/dashboard/projects": ["workspace", "projects"],
  "/dashboard/project": ["workspace", "projects", "project"],
  "/dashboard/keywords": ["workspace", "keywords"],
  "/dashboard/serp-checker": ["tools", "quickSerp"],
  "/dashboard/alerts": ["tools", "alerts"],
  "/dashboard/billing": ["tools", "settings"],
}

function crumbKeysFor(pathname: string): { keys: string[]; ellipsis: boolean } {
  const direct = CRUMB_KEYS[pathname]
  if (direct) return { keys: direct, ellipsis: false }
  const matched = Object.keys(CRUMB_KEYS)
    .filter((p) => pathname.startsWith(p + "/") || pathname === p)
    .sort((a, b) => b.length - a.length)[0]
  if (matched) return { keys: CRUMB_KEYS[matched], ellipsis: true }
  return { keys: ["workspace"], ellipsis: false }
}

export function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname() || "/dashboard"
  const tNav = useTranslations("dashboardNav")
  const t = useTranslations("topbar")
  const { keys, ellipsis } = crumbKeysFor(pathname)
  const crumbs = [...keys.map((k) => tNav(k)), ...(ellipsis ? ["…"] : [])]
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = mounted && (resolvedTheme === "dark" || theme === "dark")

  return (
    <div className="topbar">
      <button
        className="icon-btn topbar-hamburger"
        onClick={onMenuClick}
        aria-label={t("openNav")}
      >
        <Icon.menu />
      </button>
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
        <input placeholder={t("searchPlaceholder")} />
      </div>
      <UsageMeter />
      <button
        className="icon-btn"
        title={t("toggleTheme")}
        onClick={() => setTheme(isDark ? "light" : "dark")}
        aria-label={t("toggleTheme")}
      >
        {isDark ? <Icon.sun /> : <Icon.moon />}
      </button>
      <LanguageSwitcher />
      <NotificationBell />
    </div>
  )
}
