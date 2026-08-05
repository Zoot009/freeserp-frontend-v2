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

      <SidebarInset>
        {/* Same h-14 / border / padding as the real header, so the content below
            starts at an identical offset. */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background px-4">
          <Skeleton className="size-7 rounded-md" />
          <Skeleton className="h-9 w-full max-w-md rounded-md" />
          <div className="ml-auto flex items-center gap-2">
            <Skeleton className="size-9 rounded-md" />
            <Skeleton className="size-9 rounded-md" />
            <Skeleton className="size-9 rounded-full" />
          </div>
        </header>

        <div className="flex-1 space-y-4 p-6">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-80" />
          </div>

          {/* Four stat cards, matching the Overview's top row. */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-3 rounded-xl border p-5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>

          {/* Analytics chart + coverage panel. */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 rounded-xl border p-5 lg:col-span-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-64" />
              <Skeleton className="h-64 w-full rounded-lg" />
            </div>
            <div className="space-y-4 rounded-xl border p-5">
              <Skeleton className="h-4 w-24" />
              <div className="flex justify-center py-6">
                <Skeleton className="size-36 rounded-full" />
              </div>
              <div className="space-y-2.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3.5 w-6" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-xl border p-5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-72" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
