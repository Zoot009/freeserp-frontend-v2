"use client"

import { Fragment } from "react"
import { useTranslations } from "next-intl"
import { Link, usePathname } from "@/i18n/navigation"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { useProjectCrumb } from "./crumb-store"

/**
 * Path-derived breadcrumbs for the dashboard header.
 *
 * The derivation is lifted from the old custom topbar (now unused) so deep
 * routes keep behaving: known paths get curated, translated trails; anything
 * deeper falls back to humanised URL segments, skipping database ids.
 */

type CrumbDef = { key: string; href?: string }
type Crumb = { label: string; href?: string }

// Curated trails per route. A crumb without `href` is the leaf for that path.
//
// Every non-leaf crumb carries an href on purpose. The tool routes used to open
// with a bare `{ key: "tools" }` — "Other Tools" is a SIDEBAR GROUP HEADING, not
// a page, so it had nowhere to point and rendered as dead text. With the leaf
// already non-interactive (it's the page you're on), that left trails where
// nothing at all was clickable. Tools now hang off the workspace root instead,
// which is a real destination and matches how every other route reads.
const WORKSPACE: CrumbDef = { key: "workspace", href: "/dashboard" }

const CRUMB_KEYS: Record<string, CrumbDef[]> = {
  "/dashboard": [WORKSPACE, { key: "overview" }],
  "/dashboard/home": [WORKSPACE, { key: "homeDash" }],
  "/dashboard/projects": [WORKSPACE, { key: "projects" }],
  "/dashboard/project": [
    WORKSPACE,
    { key: "projects", href: "/dashboard/projects" },
    { key: "project" },
  ],
  "/dashboard/youtube": [WORKSPACE, { key: "youtube" }],
  "/dashboard/keywords": [WORKSPACE, { key: "keywords" }],
  "/dashboard/favorites": [WORKSPACE, { key: "favorites" }],
  "/dashboard/serp-checker": [WORKSPACE, { key: "quickSerp" }],
  "/dashboard/keyword-magic": [WORKSPACE, { key: "keywordMagic" }],
  "/dashboard/keyword-analysis": [WORKSPACE, { key: "keywordAnalysis" }],
  "/dashboard/onpage-audit": [WORKSPACE, { key: "onPageAudit" }],
  "/dashboard/alerts": [WORKSPACE, { key: "alerts" }],
  "/dashboard/billing": [WORKSPACE, { key: "settings" }],
}

// Path segments that are database ids (uuid/cuid/ObjectId…) shouldn't become
// crumbs — they always contain digits, unlike route words like "keywords" or
// "competitor-analysis".
const isIdSegment = (s: string) => /[0-9]/.test(s) && s.length >= 8

const humanize = (s: string) =>
  s
    .split("-")
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ")

// /dashboard/project/<id>/… → the project id, else null.
function projectIdFrom(pathname: string): string | null {
  const m = pathname.match(/^\/dashboard\/project\/([^/]+)/)
  return m ? m[1]! : null
}

function crumbsFor(
  pathname: string,
  tNav: (k: string) => string,
  projectName?: string | null,
): Crumb[] {
  // "Project" reads as the real project name once the page has provided it.
  const labelFor = (key: string) => (key === "project" && projectName ? projectName : tNav(key))

  const direct = CRUMB_KEYS[pathname]
  if (direct) return direct.map((c) => ({ label: labelFor(c.key), href: c.href }))

  const matched = Object.keys(CRUMB_KEYS)
    .filter((p) => pathname.startsWith(p + "/"))
    .sort((a, b) => b.length - a.length)[0]
  if (!matched) return [{ label: tNav("workspace"), href: "/dashboard" }]

  const base: Crumb[] = CRUMB_KEYS[matched]!.map((c) => ({ label: labelFor(c.key), href: c.href }))
  const tail = pathname.slice(matched.length).split("/").filter(Boolean)

  // On project sub-pages, point the generic "Project" crumb at that project's
  // home (its keywords list) so it's a working link rather than a dead label.
  if (matched === "/dashboard/project" && tail.length > 0) {
    base[base.length - 1]!.href = `/dashboard/project/${tail[0]}/keywords`
  }

  const extra: Crumb[] = []
  let acc = matched
  for (const seg of tail) {
    acc += `/${seg}`
    if (isIdSegment(seg)) continue
    extra.push({ label: humanize(seg), href: acc })
  }

  // A curated trail's leaf has no href — it's written as the end of the line.
  // Once deeper segments push it into the middle it needs one, or the crumb
  // that names the section you're inside can't take you back to it.
  const leaf = base[base.length - 1]!
  if (extra.length > 0 && !leaf.href) leaf.href = matched

  return [...base, ...extra]
}

export function DashboardBreadcrumb({ className }: { className?: string }) {
  // Locale-agnostic, so the route table above needs no per-locale entries.
  const pathname = usePathname() || "/dashboard"
  const tNav = useTranslations("dashboardNav")
  const projectName = useProjectCrumb(projectIdFrom(pathname))
  const crumbs = crumbsFor(pathname, tNav, projectName)

  return (
    <Breadcrumb className={className}>
      <BreadcrumbList>
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1
          return (
            <Fragment key={`${c.label}-${i}`}>
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {/* The leaf is the current page: BreadcrumbPage renders it as
                    aria-current rather than a link to where you already are. */}
                {isLast || !c.href ? (
                  <BreadcrumbPage>{c.label}</BreadcrumbPage>
                ) : (
                  // asChild (Radix Slot) — this install predates the newer
                  // `render` prop, so the next/link child is slotted in.
                  <BreadcrumbLink asChild>
                    <Link href={c.href}>{c.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
