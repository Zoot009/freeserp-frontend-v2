"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { ChevronDown, Plus } from "lucide-react"
import { usePathname, useRouter } from "@/i18n/navigation"
import { api } from "@/lib/api"
import { Favicon } from "@/components/favicon"
import {
  DropdownMenu,
  DropdownMenuContent,
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
  allLabel,
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
   * Trigger text before a project is resolved — the brief window while the list
   * loads, or a project page whose id isn't in the list. The menu itself lists
   * only real projects; there is no "all projects" entry.
   */
  allLabel?: string
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

  // Nothing to switch between — don't take up header space.
  if (projects.length === 0) return null

  const active = projects.find((p) => p.id === activeId) ?? null

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {/* A plain button, not the shadcn <Button>: this sits INSIDE the page
            heading, so it inherits the h1's size and weight via `font: inherit`
            and carries no chrome of its own. Only the colour differs — the
            domain reads as the variable half of "Overview: freeserp.com". */}
        <button
          type="button"
          className={className}
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
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {active ? active.domain : allLabel ?? t("projects")}
          </span>
          <ChevronDown size={20} strokeWidth={2.5} style={{ flexShrink: 0 }} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-64 max-h-none overflow-visible">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {t("projects")}
        </DropdownMenuLabel>
        {projects.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onClick={() => choose(p.id)}
            className={
              "gap-2 focus:bg-muted focus:text-foreground" +
              (p.id === activeId ? " bg-brand-soft text-brand focus:bg-brand-soft focus:text-brand" : "")
            }
          >
            <Favicon domain={p.domain} size={18} bare />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm">{p.name}</span>
              <span className="truncate text-xs text-muted-foreground">{p.domain}</span>
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="focus:bg-muted focus:text-foreground"
          onClick={() => router.push("/dashboard/projects")}
        >
          <Plus />
          {tProjects("newProject")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
