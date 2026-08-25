"use client"

import * as React from "react"
import Image from "next/image"
import { usePathname, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
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
  Map,
  Navigation,
  Store,
  FileSearch,
  ShoppingCart,
  ShoppingBag,
  Package,
  Tag,
  BrainCircuit,
  Users,
  Link2,
} from "lucide-react"
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

type Item = { key: string; url: string; icon: React.ComponentType<{ className?: string }>; soon?: boolean }

// Overview sits above the first group label, on its own — it is the page every
// other item is a drill-down from, so filing it under a category would put the
// root of the product inside one of its branches.
const PRIMARY: Item[] = [{ key: "overview", url: "/dashboard", icon: LayoutDashboard }]

const SEARCH_ENGINE: Item[] = [
  { key: "googleTracker", url: "/dashboard/projects", icon: LineChart },
  { key: "quickSerp", url: "/dashboard/serp-checker", icon: Zap },
  { key: "bingTracker", url: "/dashboard/bing-tracker", icon: Compass, soon: true },
  { key: "yahooTracker", url: "/dashboard/yahoo-tracker", icon: MessageCircle, soon: true },
  // Its own project list, separate from the web projects above — which is also
  // why it isn't a card on the SEO Dashboard: that page is scoped to one web
  // project at a time and a YouTube panel would have nothing to scope to.
  { key: "youtubeTracker", url: "/dashboard/youtube", icon: Youtube },
]

const MAPS: Item[] = [
  { key: "mapsTracker", url: "/dashboard/google-maps-tracker", icon: MapPin },
  { key: "bingMapsTracker", url: "/dashboard/bing-maps-tracker", icon: Map, soon: true },
  { key: "appleMapsTracker", url: "/dashboard/apple-maps-tracker", icon: Navigation, soon: true },
]

// One entry, not one per platform: the tracker is a list of BRANDS, and which
// models answer for a brand is a per-prompt choice inside it. Four menu items
// would promise four views that do not exist.
const AI: Item[] = [{ key: "aiPromptTracker", url: "/dashboard/ai-prompt-tracker", icon: BrainCircuit }]

const AUDIT: Item[] = [
  // Same page, two modes. The mode is a real toggle inside the page, so these
  // deep-link it rather than pretending to be separate routes — see the page's
  // `?mode=` handling, which exists for exactly these two entries.
  { key: "websiteAudit", url: "/dashboard/page-audit?mode=site", icon: ScanSearch },
  { key: "pageAudit", url: "/dashboard/page-audit?mode=single", icon: FileSearch },
  { key: "mapsAudit", url: "/dashboard/google-maps-audit", icon: Store, soon: true },
  { key: "competitorAnalysis", url: "/dashboard/competitor-analysis", icon: Users },
  { key: "aiInternalLinking", url: "/dashboard/ai-internal-linking", icon: Link2 },
]

const TOOLS: Item[] = [
  { key: "keywords", url: "/dashboard/keywords", icon: KeyRound },
  { key: "favorites", url: "/dashboard/favorites", icon: Star },
  { key: "keywordMagic", url: "/dashboard/keyword-magic", icon: Sparkles },
  // Page Score Checker was removed: it scored a single URL from a plain fetch,
  // which the Website Audit above does properly — real browser, 63 rules, and it
  // can crawl the whole site. Two tools measuring the same thing to different
  // depths only raised the question of which number to believe.
  { key: "keywordAnalysis", url: "/dashboard/keyword-analysis", icon: Search },
]

// Nothing here routes anywhere yet. Every item is `soon`, which renders disabled
// with a badge rather than as a link into a 404.
const COMING_SOON: Item[] = [
  { key: "amazon", url: "/dashboard/amazon", icon: ShoppingCart, soon: true },
  { key: "flipkart", url: "/dashboard/flipkart", icon: ShoppingBag, soon: true },
  { key: "temu", url: "/dashboard/temu", icon: Package, soon: true },
  { key: "ebay", url: "/dashboard/ebay", icon: Tag, soon: true },
]

function isActive(url: string, pathname: string | null, search: string | null): boolean {
  if (!pathname) return false
  const p = pathname.replace(/^\/(en|es|fr|de)(?=\/)/, "")
  const [path, query] = url.split("?")
  if (path === "/dashboard") return p === "/dashboard"
  if (!(p === path || p.startsWith(path + "/"))) return false
  // Two entries can share a path and differ only by mode (the audits). Matching
  // on the path alone would light both of them up at once; an entry with no
  // query still matches whatever the query happens to be.
  if (!query) return true
  const [k, v] = query.split("=")
  return new URLSearchParams(search ?? "").get(k!) === v
}

type Props = React.ComponentProps<typeof Sidebar> & {
  name: string
  plan: string
  initial: string
}

export function AppSidebar({ name, plan, initial, ...props }: Props) {
  const t = useTranslations("dashboardNav")
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const search = searchParams.toString()

  // Google Maps Tracker and the AI Prompt Tracker were both allowlisted once,
  // each because it spends DataForSEO money per action with no billing in front
  // of it. Credits are that billing now, so the lists are plain constants and
  // the links are simply links.

  const Group = ({ labelKey, items }: { labelKey?: string; items: Item[] }) => (
    <SidebarGroup>
      {labelKey && <SidebarGroupLabel>{t(labelKey)}</SidebarGroupLabel>}
      <SidebarMenu>
        {items.map((it) => {
          const Icon = it.icon
          if (it.soon) {
            return (
              <SidebarMenuItem key={it.url}>
                <SidebarMenuButton
                  disabled
                  tooltip={`${t(it.key)} (${t("soon")})`}
                  className="cursor-not-allowed opacity-60"
                >
                  <Icon />
                  <span>{t(it.key)}</span>
                  <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
                    {t("soon")}
                  </Badge>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          }
          return (
            <SidebarMenuItem key={it.url}>
              <SidebarMenuButton asChild isActive={isActive(it.url, pathname, search)} tooltip={t(it.key)}>
                <Link href={it.url}>
                  <Icon />
                  <span>{t(it.key)}</span>
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
        <Group items={PRIMARY} />
        <Group labelKey="searchEngine" items={SEARCH_ENGINE} />
        <Group labelKey="maps" items={MAPS} />
        <Group labelKey="ai" items={AI} />
        <Group labelKey="auditAnalysis" items={AUDIT} />
        <Group labelKey="tools" items={TOOLS} />
        <Group labelKey="comingSoon" items={COMING_SOON} />
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
