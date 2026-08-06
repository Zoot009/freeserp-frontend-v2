"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { ChevronDown, Plus } from "lucide-react"
import { usePathname, useRouter } from "@/i18n/navigation"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Favicon } from "@/components/favicon"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
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
}: {
  className?: string
  /**
   * Controlled selection. When `onSelect` is supplied the switcher FILTERS in
   * place — it reports the chosen id (null = all projects) and navigates
   * nowhere. Without it, it stays a jump list keyed off the URL.
   */
  value?: string | null
  onSelect?: (projectId: string | null) => void
}) {
  const t = useTranslations("dashboardNav")
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
  }, [])

  const active = projects.find((p) => p.id === activeId) ?? null
  // Render nothing until a real project resolves — covers both "no projects" and
  // the window between the list arriving and a selection settling. Showing a
  // placeholder label here meant every page load flashed it for a frame.
  if (!active) return null

  return (
    <DropdownMenu modal={false}>
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
      <DropdownMenuContent align="start" className="min-w-68 max-h-none overflow-visible p-1.5">
        <DropdownMenuLabel className="px-2 pb-1.5 pt-1 text-xs font-normal text-muted-foreground">
          {t("projects")}
        </DropdownMenuLabel>
        {/* The LIST scrolls, not the menu. max-h-none stays on the content above
            because Radix's own available-height measurement resolves too small
            here (see the account menu) — so the height is bounded explicitly
            instead, and the menu stays the same size at 5 projects or 50.
            "New project" sits outside this box so it never scrolls away. */}
        <DropdownMenuGroup className="max-h-72 overflow-y-auto overscroll-contain">
        {projects.map((p) => {
          const isActive = p.id === activeId
          return (
            <DropdownMenuItem
              key={p.id}
              onClick={() => choose(p.id)}
              // px-2 py-2 rather than the base py-1.5: these rows carry two lines
              // of text, which the default single-line padding left cramped.
              // Active gets the soft brand fill only — tinting the whole row
              // brand blue dragged the domain line with it and killed its
              // contrast, so the weight/colour shift is applied to the name.
              className={cn(
                "items-center gap-2.5 px-2 py-2 focus:bg-muted focus:text-foreground",
                isActive && "bg-brand-soft focus:bg-brand-soft",
              )}
            >
              <span className="flex size-5 shrink-0 items-center justify-center">
                <Favicon domain={p.domain} size={20} bare />
              </span>
              <div className="flex min-w-0 flex-col gap-0.5 leading-none">
                <span
                  className={cn(
                    "truncate text-sm",
                    isActive ? "font-medium text-brand" : "text-foreground",
                  )}
                >
                  {p.name}
                </span>
                <span className="truncate text-xs text-muted-foreground">{p.domain}</span>
              </div>
            </DropdownMenuItem>
          )
        })}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2.5 px-2 py-2 focus:bg-muted focus:text-foreground"
          onClick={() => router.push("/dashboard/projects")}
        >
          {/* Boxed to the same 20px as the favicons above, so the label column
              lines up instead of the plus sitting slightly off. */}
          <span className="flex size-5 shrink-0 items-center justify-center">
            <Plus className="size-4" />
          </span>
          <span className="text-sm">{tProjects("newProject")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
