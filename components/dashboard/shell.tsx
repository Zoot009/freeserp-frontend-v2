"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Globe, Moon, Search, Sun } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { useTheme } from "@/components/theme-provider"
import { api, ApiError } from "@/lib/api"
import { toast } from "sonner"
import { AppSidebar } from "@/components/dashboard/app-sidebar"
import { DashboardBreadcrumb } from "@/components/dashboard/breadcrumbs"
import { NotificationBell } from "@/components/dashboard/notification-bell"
import { CreditBalance } from "@/components/dashboard/credit-balance"
import { Separator } from "@/components/ui/separator"
import { DashboardSkeleton } from "@/components/dashboard/shell-skeleton"
import { UserMenu } from "@/components/dashboard/user-menu"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const normalizeDomain = (v: string) =>
  v.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const { resolvedTheme, setTheme } = useTheme()

  const [hasWebsite, setHasWebsite] = useState<boolean | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [website, setWebsite] = useState("")
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.replace("/login")
    else if (!loading && user && !user.emailVerified) router.replace("/verify-email")
    else if (!loading && user && !user.occupationRole) router.replace("/flow")
  }, [user, loading, router])

  useEffect(() => {
    if (loading || !user?.emailVerified || !user?.occupationRole) return
    api
      .get<{ id: string }[]>("/api/projects")
      .then((list) => setHasWebsite((list?.length ?? 0) > 0))
      .catch(() => setHasWebsite(true))
  }, [loading, user?.emailVerified, user?.occupationRole])

  useEffect(() => {
    const open = () => setShowAdd(true)
    const added = () => setHasWebsite(true)
    window.addEventListener("fx:add-website", open)
    window.addEventListener("fx:website-added", added)
    return () => {
      window.removeEventListener("fx:add-website", open)
      window.removeEventListener("fx:website-added", added)
    }
  }, [])

  const redirecting = !user || !user.emailVerified || !user.occupationRole
  if (loading || redirecting) {
    return <DashboardSkeleton />
  }

  const name = (user?.name || user?.email || "You").split("@")[0]
  const initial = name.trim().charAt(0).toUpperCase()
  const isPaid = user?.plan === "paid"
  const isDark = resolvedTheme === "dark"

  const addWebsite = async () => {
    const domain = normalizeDomain(website)
    if (!domain || !domain.includes(".")) { toast.error("Enter a valid website, e.g. example.com"); return }
    setAdding(true)
    try {
      const p = await api.post<{ id?: string }>("/api/projects", { name: domain, domain })
      setHasWebsite(true); setShowAdd(false); setWebsite("")
      toast.success(`Tracking ${domain}`)
      if (p?.id) router.push(`/dashboard`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't add that website — please try again.")
    } finally { setAdding(false) }
  }

  /**
   * A finished audit report is a document, not a dashboard page.
   *
   * It is long, it is the only thing on screen worth reading, and it is what
   * gets shared and exported — so it renders without the sidebar, breadcrumb
   * and global search competing with it. Everything else in /dashboard keeps
   * the full shell.
   *
   * Matched on the report's own route only. The trailing segment is required,
   * so /dashboard/page-audit — the form and history — is untouched, and the
   * pattern is unanchored so the locale prefix (/en/dashboard/…) still matches.
   * The report page carries its own "All audits" link back, so nothing becomes
   * unreachable by dropping the nav.
   */
  const focusMode = /\/dashboard\/page-audit\/[^/]+$/.test(pathname ?? "")
  if (focusMode) {
    return <div className="fs-app min-h-screen bg-card">{children}</div>
  }

  return (
    <SidebarProvider>
      <AppSidebar
        name={name}
        plan={isPaid ? "Pro plan" : "Free plan"}
        initial={initial}
      />
      {/* bg-card, not the default bg-background: --background IS the page canvas
          in this theme (and equals --sidebar in dark), so the panel came out the
          same tone as the gutter it floats on. --card is the elevated surface —
          white on grey in light, #14181f on #0b0d12 in dark. */}
      <SidebarInset className="bg-card">
        {/* One row: trigger, then the breadcrumb trail beside it, with the search
            field pushed hard right (ml-auto) ahead of the icon cluster.
            bg-card matches the panel, so the bar reads as part of it — and it
            gives the outline buttons a surface to contrast against, which
            bg-background did not in dark mode. */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-card px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="hidden !h-4 sm:block" />
            <DashboardBreadcrumb className="hidden sm:flex" />
            <div className="relative ml-auto w-full max-w-xs lg:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search keywords, projects, competitors…" className="pl-9" />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" size="icon" aria-label="Toggle theme" onClick={() => setTheme(isDark ? "light" : "dark")}>
                {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </Button>
              {/* The real bell, with the unread count and the panel. This slot
                  used to hold a bare <Bell/> in a Button with no handler — the
                  working component existed but was only mounted by the old
                  topbar, which this shell replaced. */}
              {/* Renders nothing for grandfathered worker subscribers, who still
                  meter on daily checks rather than a balance. */}
              <CreditBalance />
              <NotificationBell />
              {/* Upgrade and the locale switcher both moved inside this menu, so
                  the account surface is one dropdown instead of three controls.
                  A real <button> so it's keyboard-reachable as a menu trigger. */}
              <UserMenu side="bottom" align="end">
                <button
                  type="button"
                  aria-label={name}
                  className="flex size-9 items-center justify-center rounded-full bg-brand text-sm font-bold text-white"
                >
                  {initial}
                </button>
              </UserMenu>
            </div>
        </header>

        {/* Every dashboard page gets the .fs-app scope so its scoped CSS applies —
            /dashboard is back to the Overview page from main, which is built on
            those classes and renders unstyled without the wrapper. The
            transparent background keeps the shadcn inset panel clean. */}
        <div className="fs-app flex-1" style={{ background: "transparent" }}>{children}</div>
      </SidebarInset>

      {/* Add-website gate popup (shadcn Dialog) */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mb-1 flex size-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
              <Globe className="size-5" />
            </div>
            <DialogTitle className="text-xl">Add your website</DialogTitle>
            <DialogDescription>
              Enter a domain to start tracking its Google rankings. You&apos;ll need a website before you can use the tools.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              autoFocus
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addWebsite()}
              placeholder="yourwebsite.com"
            />
            <Button onClick={addWebsite} disabled={adding} className="bg-brand text-white hover:bg-brand-deep">
              {adding ? "Adding…" : "Add website"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
