"use client"

import * as React from "react"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Link } from "@/i18n/navigation"
import {
  LayoutDashboard,
  LineChart,
  KeyRound,
  Star,
  Zap,
  Sparkles,
  Search,
  ScanSearch,
  ChevronsUpDown,
  Youtube,
  Compass,
  MessageCircle,
  MapPin,
  BrainCircuit,
  Users,
  Link2,
} from "lucide-react"
import { api } from "@/lib/api"
import { UserMenu } from "@/components/dashboard/user-menu"
import { Badge } from "@/components/ui/badge"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

type Item = { title: string; url: string; icon: React.ComponentType<{ className?: string }>; soon?: boolean }

const WORKSPACE: Item[] = [
  { title: "Overview", url: "/dashboard", icon: LayoutDashboard },
  { title: "Google Tracker", url: "/dashboard/projects", icon: LineChart },
  // Its own project list, separate from the web projects above — which is also
  // why it isn't a card on the SEO Dashboard: that page is scoped to one web
  // project at a time and a YouTube panel would have nothing to scope to.
  { title: "YouTube Tracker", url: "/dashboard/youtube", icon: Youtube },
  { title: "Bing Tracker", url: "/dashboard/bing-tracker", icon: Compass, soon: true },
  { title: "Yahoo Tracker", url: "/dashboard/yahoo-tracker", icon: MessageCircle, soon: true },
  { title: "Google Maps Tracker", url: "/dashboard/google-maps-tracker", icon: MapPin },
  { title: "LLM Tracker", url: "/dashboard/llm-tracker", icon: BrainCircuit },
]
const TOOLS: Item[] = [
  { title: "Keywords", url: "/dashboard/keywords", icon: KeyRound },
  { title: "Favorites", url: "/dashboard/favorites", icon: Star },
  { title: "Quick Serp", url: "/dashboard/serp-checker", icon: Zap },
  { title: "Keyword Magic Tool", url: "/dashboard/keyword-magic", icon: Sparkles },
  { title: "Keyword Score Checker", url: "/dashboard/keyword-analysis", icon: Search },
  // Page Score Checker was removed: it scored a single URL from a plain fetch,
  // which Website Audit below does properly — real browser, 63 rules, and it
  // can crawl the whole site. Two tools measuring the same thing to different
  // depths only raised the question of which number to believe.
  { title: "Website Audit", url: "/dashboard/page-audit", icon: ScanSearch },
  { title: "Competitor Analysis", url: "/dashboard/competitor-analysis", icon: Users },
  { title: "AI Internal Linking", url: "/dashboard/ai-internal-linking", icon: Link2 },
]

function isActive(url: string, pathname: string | null): boolean {
  if (!pathname) return false
  const p = pathname.replace(/^\/(en|es|fr|de)(?=\/)/, "")
  if (url === "/dashboard") return p === "/dashboard"
  return p === url || p.startsWith(url + "/")
}

type Props = React.ComponentProps<typeof Sidebar> & {
  name: string
  plan: string
  initial: string
}

export function AppSidebar({ name, plan, initial, ...props }: Props) {
  const pathname = usePathname()

  // Google Maps Tracker is in early access — every scan point is real
  // DataForSEO spend and there's no credit system in front of it yet, so
  // access is allowlisted server-side (MAPS_TRACKER_ACCESS_EMAILS). Defaults
  // to "soon" (locked) until the check resolves — fail closed, not open.
  const [mapsTrackerAllowed, setMapsTrackerAllowed] = React.useState(false)
  React.useEffect(() => {
    let cancelled = false
    api
      .get<{ allowed: boolean }>("/api/maps-tracker/access")
      .then(({ allowed }) => {
        if (!cancelled) setMapsTrackerAllowed(allowed)
      })
      .catch(() => {
        /* stays locked on any error — fail closed */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const workspace = WORKSPACE.map((it) =>
    it.title === "Google Maps Tracker" ? { ...it, soon: !mapsTrackerAllowed } : it,
  )

  const Group = ({ label, items }: { label: string; items: Item[] }) => (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((it) => {
          const Icon = it.icon
          if (it.soon) {
            return (
              <SidebarMenuItem key={it.url}>
                <SidebarMenuButton
                  disabled
                  tooltip={`${it.title} (Coming soon)`}
                  className="cursor-not-allowed opacity-60"
                >
                  <Icon />
                  <span>{it.title}</span>
                  <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
                    Soon
                  </Badge>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          }
          return (
            <SidebarMenuItem key={it.url}>
              <SidebarMenuButton asChild isActive={isActive(it.url, pathname)} tooltip={it.title}>
                <Link href={it.url}>
                  <Icon />
                  <span>{it.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <Image src="/logo.png" alt="FreeSERP" width={32} height={32} className="size-8 rounded-lg object-contain" priority />
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">FreeSERP</span>
                  <span className="text-xs text-muted-foreground">Rank Tracker</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="scrollbar-thin overflow-y-auto" data-lenis-prevent>
        <Group label="Rank Tracker Workspace" items={workspace} />
        <Group label="Other Tools" items={TOOLS} />
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            {/* Opens UPWARD, aligned to the row's left edge, so it stays inside
                the sidebar column instead of spilling rightward across the
                content panel. The menu is narrower than the expanded sidebar, so
                it fits; on the icon rail Radix flips it away from the edge. */}
            <UserMenu side="top" align="start">
              <SidebarMenuButton
                size="lg"
                // Neutral while the menu is open, NOT sidebar-accent: that pair
                // is the blue "active nav item" treatment, so the trigger lit up
                // brand blue against an otherwise neutral menu and read as
                // selected rather than open.
                className="data-[state=open]:bg-muted data-[state=open]:text-foreground"
              >
                <div className="flex aspect-square size-8 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
                  {initial}
                </div>
                <div className="flex min-w-0 flex-col leading-none">
                  <span className="truncate text-sm font-medium capitalize">{name}</span>
                  <span className="text-xs text-muted-foreground">{plan}</span>
                </div>
                <ChevronsUpDown className="ml-auto size-4 shrink-0" />
              </SidebarMenuButton>
            </UserMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
