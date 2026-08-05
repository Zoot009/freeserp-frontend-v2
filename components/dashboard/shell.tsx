"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Link } from "@/i18n/navigation"
import { Bell, Globe, Moon, Search, Sun } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { useTheme } from "@/components/theme-provider"
import { api, ApiError } from "@/lib/api"
import { toast } from "sonner"
import { AppSidebar } from "@/components/dashboard/app-sidebar"
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
    return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Loading…</div>
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

  return (
    <SidebarProvider>
      <AppSidebar
        name={name}
        plan={isPaid ? "Pro plan" : "Free plan"}
        initial={initial}
      />
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background px-4">
          <SidebarTrigger />
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search keywords, projects, competitors…" className="pl-9" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {!isPaid && (
              <Button asChild size="sm">
                <Link href="/pricing">Upgrade</Link>
              </Button>
            )}
            <Button variant="outline" size="icon" aria-label="Toggle theme" onClick={() => setTheme(isDark ? "light" : "dark")}>
              {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <Button variant="outline" size="icon" aria-label="Notifications">
              <Bell className="size-4" />
            </Button>
            <div className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {initial}
            </div>
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
            <div className="mb-1 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
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
            <Button onClick={addWebsite} disabled={adding}>{adding ? "Adding…" : "Add website"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
