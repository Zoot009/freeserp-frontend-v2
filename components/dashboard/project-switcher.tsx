"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Check, ChevronDown, ExternalLink, Plus } from "lucide-react"
import { usePathname, useRouter } from "@/i18n/navigation"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Favicon } from "@/components/favicon"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type ProjectOption = { id: string; name: string; domain: string }

// /dashboard/project/<id>/… → the project id, else null. Same shape the
// breadcrumbs use to resolve the project name.
function projectIdFrom(pathname: string): string | null {
  const m = pathname.match(/^\/dashboard\/project\/([^/]+)/)
  return m ? m[1]! : null
}

/**
 * Switch between tracked projects from anywhere in the dashboard.
 *
 * Rendered in the shell header, so it's reachable on every page rather than
 * only on the projects list. On a project page it shows the current project and
 * jumps to the same kind of page for whichever is picked; elsewhere it reads
 * "All projects" and acts as a jump list.
 */
export function ProjectSwitcher({
  className,
  value,
  onSelect,
  onNewProject,
  refreshKey,
}: {
  className?: string
  /**
   * Controlled selection. When `onSelect` is supplied the switcher FILTERS in
   * place — it reports the chosen id (null = all projects) and navigates
   * nowhere. Without it, it stays a jump list keyed off the URL.
   */
  value?: string | null
  onSelect?: (projectId: string | null) => void
  /**
   * Handle "New project" in place. Without it the item navigates to the Rank
   * Tracker, which is the old behaviour: asking to create a project moved you
   * to another page instead of creating one.
   */
  onNewProject?: () => void
  /** Bump to re-fetch the list — e.g. after the caller creates a project. */
  refreshKey?: number
}) {
  // "New project" already exists under dashProjects in all four locales — reuse
  // it rather than adding a duplicate key that could drift.
  const tProjects = useTranslations("dashProjects")
  const router = useRouter()
  const pathname = usePathname() || ""
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const controlled = typeof onSelect === "function"
  // Controlled: the caller owns the selection. Uncontrolled: derive it from the
  // URL, so a project page shows the project it's already on.
  const activeId = controlled ? (value ?? null) : projectIdFrom(pathname)

  const choose = (id: string | null) => {
    if (onSelect) {
      onSelect(id)
      return
    }
    // Keywords is a project's home — the same target the breadcrumb's "Project"
    // crumb points at.
    if (id) router.push(`/dashboard/project/${id}/keywords`)
  }

  useEffect(() => {
    let cancelled = false
    api
      .get<ProjectOption[]>("/api/projects")
      .then((list) => {
        if (!cancelled) setProjects(list ?? [])
      })
      // Non-fatal: the switcher just stays empty and hides itself.
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const active = projects.find((p) => p.id === activeId) ?? null
  // Render nothing until a real project resolves — covers both "no projects" and
  // the window between the list arriving and a selection settling. Showing a
  // placeholder label here meant every page load flashed it for a frame.
  if (!active) return null

  // gap 6, not 8: the chevron already carries its own optical space on the
  // right, so a wider gap read as the icon drifting away from the domain.
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, maxWidth: "100%" }}>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* A plain button, not the shadcn <Button>: this sits INSIDE the page
            heading, so it inherits the h1's size and weight via `font: inherit`
            and carries no chrome of its own. Only the colour differs — the
            domain reads as the variable half of "Overview: freeserp.com". */}
        <button
          type="button"
          className={cn("proj-switch", className)}
          style={{
            font: "inherit",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: 0,
            border: "none",
            background: "transparent",
            color: "var(--brand)",
            cursor: "pointer",
            maxWidth: "100%",
          }}
        >
          {/* Underline lives on the label, not the button, so the chevron isn't
              dragged into it. See .proj-switch in dashboard.css. */}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {active.domain}
          </span>
          <ChevronDown size={20} strokeWidth={2.5} style={{ flexShrink: 0 }} />
        </button>
      </DropdownMenuTrigger>

      {/* A plain menu, not a search combobox. The combobox that briefly lived
          here scrolled badly: it's portaled inside a non-modal popover, so the
          wheel never reached the list and only the scrollbar thumb worked.
          DropdownMenu is modal — Radix locks the page and routes the wheel into
          the menu itself, so scrolling just works with no handler of our own.

          collisionPadding keeps it off the viewport edge, and the base content
          class already caps height at --radix-dropdown-menu-content-available-height,
          so a long project list scrolls instead of running off the screen. */}
      <DropdownMenuContent align="start" sideOffset={8} collisionPadding={12} className="w-72 p-1.5">
        {projects.map((p) => {
          const isActive = p.id === activeId
          return (
            <DropdownMenuItem
              key={p.id}
              onSelect={() => choose(p.id)}
              // focus:bg-muted, NOT the inherited focus:bg-accent. This theme
              // maps --accent to the BRAND blue (see globals.css), and the rows
              // below set their own text colours, which beat the white
              // accent-foreground — so the stock highlight rendered a solid
              // blue band with dark, near-unreadable text on it.
              className={cn(
                // focus:text-foreground pairs with the bg override — the base
                // style's focus colour is accent-foreground (white here), which
                // only stays invisible because the spans below set their own.
                "items-center gap-2.5 rounded-md px-2 py-2 focus:bg-muted focus:text-foreground",
                isActive && "bg-brand-soft focus:bg-brand-soft",
              )}
            >
              <span className="flex size-5 shrink-0 items-center justify-center">
                <Favicon domain={p.domain} size={20} bare />
              </span>
              {/* Domain only. The project name sat above it as a second line,
                  but for almost every project here the two are the same string,
                  so the row read as the same thing printed twice. */}
              <span className={cn("min-w-0 truncate text-sm", isActive ? "font-medium text-brand" : "text-foreground")}>
                {p.domain}
              </span>
              {isActive && <Check className="ml-auto size-4 shrink-0 text-brand" />}
            </DropdownMenuItem>
          )
        })}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => (onNewProject ? onNewProject() : router.push("/dashboard/projects"))}
          className="justify-between gap-4 rounded-md px-2 py-2 text-brand focus:bg-muted focus:text-brand"
        >
          <span>{tProjects("newProject")}</span>
          <Plus className="size-4 shrink-0" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

      {/* Straight to the live site. Outside the DropdownMenuTrigger on purpose —
          nested inside it, a click would open the menu instead of the link.
          noreferrer alongside noopener so the destination can't see the
          dashboard URL, which carries the project id. */}
      <a
        href={`https://${active.domain}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${active.domain} (opens in a new tab)`}
        title={`https://${active.domain}`}
        className="proj-switch-ext"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          alignSelf: "center",
          color: "var(--text-mute)",
          flexShrink: 0,
          // Sized to the chevron next to it so the two read as one control pair.
          // The glyph's mass sits high (the arrow points up-right), so it optically
          // floats above a row of lowercase text even when the boxes are centred —
          // the 1px nudge corrects that, not the geometry.
          height: 20,
          width: 20,
          transform: "translateY(1px)",
        }}
      >
        <ExternalLink size={18} strokeWidth={2.25} />
      </a>
    </span>
  )
}
