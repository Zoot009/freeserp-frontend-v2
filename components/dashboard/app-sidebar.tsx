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
  Zap,
  Sparkles,
  Search,
  ScanSearch,
  ChevronsUpDown,
  Youtube,
  MapPin,
  Map,
  Navigation,
  Store,
  FileSearch,
  ShoppingCart,
  ShoppingBag,
  Package,
  Tag,
  Users,
  Link2,
} from "lucide-react"
import { UserMenu } from "@/components/dashboard/user-menu"
import {
  ChatGptMarkIcon,
  ClaudeMarkIcon,
  GeminiMarkIcon,
  PerplexityMarkIcon,
} from "@/components/dashboard/platform-marks"
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
  // Key predates the rename. The tracker is engine-neutral now — the engine is
  // chosen per keyword in the add modal — so the LABEL is "Keyword Rank
  // Tracker". Renaming the key would mean coordinated edits across every
  // message file for no user-visible gain, and one miss is a runtime error.
  { key: "googleTracker", url: "/dashboard/projects", icon: LineChart },
  { key: "quickSerp", url: "/dashboard/serp-checker", icon: Zap },
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

// Every prompt you run on ONE platform, across every brand, with that
// platform's own aggregate numbers. These are the only LLM-tracker entries in
// the nav now — the brand-scoped AI Prompt Tracker entry was removed, though
// /dashboard/ai-prompt-tracker still exists and these pages still link into it.
//
// An earlier version of this file argued against exactly this, on the grounds
// that four menu items "would promise four views that do not exist". They exist
// now — each is a real route backed by GET /api/llm-tracker/platforms/:platform.
// Listed alphabetically rather than in the backend's array order: a nav list is
// read, not iterated.
const AI_PLATFORMS: Item[] = [
  { key: "platformChatgpt", url: "/dashboard/ai-platforms/chatgpt", icon: ChatGptMarkIcon },
  { key: "platformClaude", url: "/dashboard/ai-platforms/claude", icon: ClaudeMarkIcon },
  { key: "platformGemini", url: "/dashboard/ai-platforms/gemini", icon: GeminiMarkIcon },
  { key: "platformPerplexity", url: "/dashboard/ai-platforms/perplexity", icon: PerplexityMarkIcon },
]

const AUDIT: Item[] = [
  // Two routes, not one page with a mode toggle. They share a crawler and a
  // report, but each is a tool someone comes here to use by name, with its own
  // URL, title and history.
  { key: "websiteAudit", url: "/dashboard/site-audit", icon: ScanSearch },
  { key: "pageAudit", url: "/dashboard/page-audit", icon: FileSearch },
  { key: "mapsAudit", url: "/dashboard/google-maps-audit", icon: Store, soon: true },
  { key: "competitorAnalysis", url: "/dashboard/competitor-analysis", icon: Users },
  { key: "aiInternalLinking", url: "/dashboard/ai-internal-linking", icon: Link2 },
]

const TOOLS: Item[] = [
  { key: "keywords", url: "/dashboard/keywords", icon: KeyRound },
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
  // An entry may pin itself to a query value; one without a query matches
  // whatever the query happens to be.
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

  // Hairline above every group but the first, drawn as a pseudo-element so it
  // costs no layout and the two states stay pixel-identical. On the rail the
  // label is invisible, so the line slides down into the middle of the gap it
  // leaves and becomes the only thing separating one cluster of icons from the
  // next; expanded, it sits above the label as a section rule. A transform
  // moves it, not a margin, so nothing below it shifts either way.
  const DIVIDER =
    "before:pointer-events-none before:absolute before:inset-x-2 before:top-0 before:h-px before:bg-sidebar-border before:transition-transform before:duration-[260ms] before:ease-[cubic-bezier(0.32,0.72,0,1)] group-data-[collapsible=icon]:before:translate-y-[10px]"

  const Group = ({ labelKey, items }: { labelKey?: string; items: Item[] }) => (
    <SidebarGroup className={labelKey ? DIVIDER : undefined}>
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
        <Group labelKey="aiPlatforms" items={AI_PLATFORMS} />
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
