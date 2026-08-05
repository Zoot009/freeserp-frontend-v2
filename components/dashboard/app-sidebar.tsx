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
  MonitorCheck,
  Settings,
} from "lucide-react"
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

type Item = { title: string; url: string; icon: React.ComponentType<{ className?: string }> }

const WORKSPACE: Item[] = [
  { title: "Overview", url: "/dashboard", icon: LayoutDashboard },
  { title: "Rank Tracker", url: "/dashboard/projects", icon: LineChart },
  { title: "Keywords", url: "/dashboard/keywords", icon: KeyRound },
  { title: "Favorites", url: "/dashboard/favorites", icon: Star },
]
const TOOLS: Item[] = [
  { title: "Quick Serp", url: "/dashboard/serp-checker", icon: Zap },
  { title: "Keyword Magic Tool", url: "/dashboard/keyword-magic", icon: Sparkles },
  { title: "Keyword Score Checker", url: "/dashboard/keyword-analysis", icon: Search },
  { title: "Page Score Checker", url: "/dashboard/onpage-audit", icon: MonitorCheck },
  { title: "Settings", url: "/dashboard/billing", icon: Settings },
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

  const Group = ({ label, items }: { label: string; items: Item[] }) => (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((it) => {
          const Icon = it.icon
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

      <SidebarContent>
        <Group label="Rank Tracker Workspace" items={WORKSPACE} />
        <Group label="Other Tools" items={TOOLS} />
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg">
              <div className="flex aspect-square size-8 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
                {initial}
              </div>
              <div className="flex min-w-0 flex-col leading-none">
                <span className="truncate text-sm font-medium capitalize">{name}</span>
                <span className="text-xs text-muted-foreground">{plan}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
