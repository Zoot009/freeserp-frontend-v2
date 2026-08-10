"use client"

import { Skeleton } from "@/components/ui/skeleton"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"

/**
 * Placeholder shown while the session resolves — most visibly on a locale
 * switch, which remounts the provider and briefly flips `loading` back on.
 *
 * It reuses the REAL Sidebar/SidebarInset primitives rather than approximating
 * them with divs, so the sidebar width, the inset panel's margin and rounding,
 * and the 56px header all match the loaded shell exactly. The swap is then a
 * content change, not a layout change — nothing shifts under the cursor.
 *
 * Row counts mirror app-sidebar's real nav (4 workspace, 5 tools) so the sidebar
 * doesn't visibly grow when the real one arrives.
 */

// Varied widths so the nav reads as a list of labels rather than a stack of
// identical bars.
const WORKSPACE_W = ["w-20", "w-24", "w-16", "w-20"]
const TOOLS_W = ["w-20", "w-32", "w-36", "w-32", "w-16"]

function NavGroupSkeleton({ widths }: { widths: string[] }) {
  return (
    <div className="px-2 py-2">
      <Skeleton className="mb-2 ml-2 h-3 w-32" />
      <div className="flex flex-col gap-1">
        {widths.map((w, i) => (
          <div key={i} className="flex items-center gap-2 px-2 py-1.5">
            <Skeleton className="size-4 shrink-0 rounded" />
            <Skeleton className={`h-3.5 ${w}`} />
          </div>
        ))}
      </div>
    </div>
  )
}

function AccountRowSkeleton({ round }: { round?: boolean }) {
  return (
    <div className="flex items-center gap-2 p-2">
      <Skeleton className={`size-8 shrink-0 ${round ? "rounded-full" : "rounded-lg"}`} />
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-2.5 w-16" />
      </div>
    </div>
  )
}

/**
 * A widget's outer chrome: border, radius and the header band with its title
 * bar and ✕. Drawn once here so every placeholder card lines up with the real
 * <Widget>'s px-4/py-3 header.
 */
function CardShell({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col rounded-lg border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="ml-auto size-4 rounded" />
      </div>
      {children}
    </div>
  )
}

/**
 * The SEO widget's six metric tiles as placeholders.
 *
 * Exported because SeoStatsCard renders this same state itself, one stage later
 * — session resolved, overview data still in flight. It used to draw six solid
 * slabs instead, so the tiles the shell had just shown were replaced by a
 * different shape mid-load and the refresh read as two separate skeletons.
 * One component, so the two can't drift apart again.
 *
 * Carries no padding of its own — the real Widget supplies it via bodyClassName,
 * and CardShell's caller wraps it here to match.
 */
export function SeoTilesSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-2.5 rounded-lg border p-3.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-6 w-14" />
          <Skeleton className="h-8 w-full rounded bg-muted/60" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader>
          <AccountRowSkeleton />
        </SidebarHeader>
        <SidebarContent>
          <NavGroupSkeleton widths={WORKSPACE_W} />
          <NavGroupSkeleton widths={TOOLS_W} />
        </SidebarContent>
        <SidebarFooter>
          <AccountRowSkeleton round />
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="bg-card">
        {/* Mirrors the real header: one h-14 row — trigger, breadcrumb, then the
            search field and icons pushed right — so content below starts at an
            identical offset. Same bg-card as the real panel. */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-card px-4">
          <Skeleton className="size-7 rounded-md" />
          <Skeleton className="hidden h-3.5 w-48 sm:block" />
          <Skeleton className="ml-auto h-9 w-full max-w-xs rounded-md lg:max-w-sm" />
          <div className="flex shrink-0 items-center gap-2">
            <Skeleton className="size-9 rounded-md" />
            <Skeleton className="size-9 rounded-md" />
            <Skeleton className="size-9 rounded-full" />
          </div>
        </header>

        <DashboardGridSkeleton withHeader />
      </SidebarInset>
    </SidebarProvider>
  )
}

/**
 * The dashboard's widget grid as placeholders.
 *
 * Shared between the shell (session still resolving) and the page itself (session
 * resolved, project list still in flight). Those two states used to draw
 * different placeholders, so a refresh showed one skeleton, then a SECOND,
 * differently-shaped one, before the content — reading as a double load.
 *
 * `withHeader` adds the title row, which only the shell needs; the page draws
 * its own real header while it waits.
 */
export function DashboardGridSkeleton({ withHeader = false }: { withHeader?: boolean }) {
  return (
        <div className="flex flex-1 flex-col gap-4 px-6 pb-10 pt-5">
          {withHeader && (
            <div className="flex flex-wrap items-center gap-3">
              <Skeleton className="h-8 w-80" />
              <div className="ml-auto flex items-center gap-2.5">
                <Skeleton className="h-9 w-44 rounded-[9px]" />
                <Skeleton className="h-[38px] w-44 rounded-[9px]" />
              </div>
            </div>
          )}

          {/* The five headline figures. */}
          <StatStripSkeleton />

          {/* Finish setup: header band + four numbered columns. */}
          <CardShell>
            <div className="grid gap-5 p-5 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2.5">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-8 w-24 rounded-md" />
                </div>
              ))}
            </div>
          </CardShell>

          {/* The two wide/narrow rows: Position Tracking + Site Audit, then
              Traffic Analytics + Keyword Movement. */}
          {[0, 1].map((row) => (
            <div key={row} className="grid gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
              <CardShell><Skeleton className="m-5 h-56 rounded-[10px] bg-muted/60" /></CardShell>
              <CardShell><Skeleton className="m-5 h-56 rounded-[10px] bg-muted/60" /></CardShell>
            </div>
          ))}
        </div>
  )
}

/**
 * The five headline stat cards as placeholders.
 *
 * Exported because StatStrip renders this same state itself, one stage later —
 * session resolved, project data still in flight. One component, so the shape
 * can't change halfway through a load and read as a second skeleton.
 */
export function StatStripSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[116px] rounded-xl" />)}
    </div>
  )
}
