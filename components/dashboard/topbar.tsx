"use client"

import { useTranslations } from "next-intl"
import { Link, usePathname } from "@/i18n/navigation"
import { useTheme } from "@/components/theme-provider"
import { useEffect, useState } from "react"
import { LanguageSwitcher } from "@/components/language-switcher"
import { Icon } from "./icons"
import { useProjectCrumb } from "./crumb-store"
import { NotificationBell } from "./notification-bell"
import { UsageMeter } from "./usage-meter"

// Static path → breadcrumb map, keyed by translation-key tuples (each with an
// optional href so parent crumbs are clickable). For unrecognised sub-paths the
// `crumbsFor` fallback derives readable crumbs from the remaining URL segments
// (skipping id-like ones), so deep routes like
// /dashboard/project/<id>/competitor-analysis/results render as
// "… / Project / Competitor Analysis / Results" — each level linkable.
// `usePathname` from @/i18n/navigation is locale-agnostic, so these keys match
// regardless of the active locale prefix.
type CrumbDef = { key: string; href?: string }
type Crumb = { label: string; href?: string }

const CRUMB_KEYS: Record<string, CrumbDef[]> = {
  "/dashboard": [{ key: "workspace", href: "/dashboard" }, { key: "overview" }],
  "/dashboard/projects": [{ key: "workspace", href: "/dashboard" }, { key: "projects" }],
  "/dashboard/project": [
    { key: "workspace", href: "/dashboard" },
    { key: "projects", href: "/dashboard/projects" },
    { key: "project" },
  ],
  "/dashboard/keywords": [{ key: "workspace", href: "/dashboard" }, { key: "keywords" }],
  "/dashboard/serp-checker": [{ key: "tools" }, { key: "quickSerp" }],
  "/dashboard/keyword-analysis": [{ key: "tools" }, { key: "keywordAnalysis" }],
  "/dashboard/alerts": [{ key: "tools" }, { key: "alerts" }],
  "/dashboard/billing": [{ key: "tools" }, { key: "settings" }],
}

// Path segments that are database ids (uuid/cuid/ObjectId…) shouldn't become
// crumbs — they always contain digits, unlike route words like "keywords" or
// "competitor-analysis".
const isIdSegment = (s: string) => /[0-9]/.test(s) && s.length >= 8

const humanize = (s: string) =>
  s
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")

// /dashboard/project/<id>/… → the project id, else null.
function projectIdFrom(pathname: string): string | null {
  const m = pathname.match(/^\/dashboard\/project\/([^/]+)/)
  return m ? m[1] : null
}

function crumbsFor(pathname: string, tNav: (k: string) => string, projectName?: string | null): Crumb[] {
  // "Project" reads as the real project name once the page has provided it.
  const labelFor = (key: string) => (key === "project" && projectName ? projectName : tNav(key))

  const direct = CRUMB_KEYS[pathname]
  if (direct) return direct.map((c) => ({ label: labelFor(c.key), href: c.href }))

  const matched = Object.keys(CRUMB_KEYS)
    .filter((p) => pathname.startsWith(p + "/"))
    .sort((a, b) => b.length - a.length)[0]
  if (!matched) return [{ label: tNav("workspace"), href: "/dashboard" }]

  const base: Crumb[] = CRUMB_KEYS[matched].map((c) => ({ label: labelFor(c.key), href: c.href }))
  const tail = pathname.slice(matched.length).split("/").filter(Boolean)

  // On project sub-pages, point the generic "Project" crumb at that project's
  // home (its keywords list) so it's a working link.
  if (matched === "/dashboard/project" && tail.length > 0) {
    base[base.length - 1].href = `/dashboard/project/${tail[0]}/keywords`
  }

  const extra: Crumb[] = []
  let acc = matched
  for (const seg of tail) {
    acc += `/${seg}`
    if (isIdSegment(seg)) continue
    extra.push({ label: humanize(seg), href: acc })
  }
  return [...base, ...extra]
}

export function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname() || "/dashboard"
  const tNav = useTranslations("dashboardNav")
  const t = useTranslations("topbar")
  const projectName = useProjectCrumb(projectIdFrom(pathname))
  const crumbs = crumbsFor(pathname, tNav, projectName)
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
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1
          return (
            <span key={i} className={isLast ? "here" : ""}>
              {i > 0 && <span className="sep"><Icon.chevR /></span>}
              {c.href && !isLast ? (
                <Link href={c.href} className="crumb-link">{c.label}</Link>
              ) : (
                <span className="crumb-cur">{c.label}</span>
              )}
            </span>
          )
        })}
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
