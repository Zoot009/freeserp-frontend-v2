"use client"

import type * as React from "react"
import { useTransition } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Languages, LogOut, Settings, Sparkles } from "lucide-react"
import { usePathname, useRouter } from "@/i18n/navigation"
import { routing } from "@/i18n/routing"
import { useAuth } from "@/lib/auth"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/**
 * The single account menu, shared by the sidebar footer row and the header
 * avatar so the two can never drift apart. `children` is the trigger — pass a
 * button-ish element; it's rendered `asChild`.
 *
 * Upgrade lives in here rather than as a standalone header button, and the
 * locale switcher is a submenu (replacing the separate topbar dropdown), so the
 * whole account surface is one shadcn menu.
 */
export function UserMenu({
  children,
  side = "bottom",
  align = "end",
}: {
  children: React.ReactNode
  side?: "top" | "right" | "bottom" | "left"
  align?: "start" | "center" | "end"
}) {
  const { user, logout } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const locale = useLocale()
  const t = useTranslations("dashboardNav")
  const tLang = useTranslations("languages")
  const [isPending, startTransition] = useTransition()

  const isPaid = user?.plan === "paid"
  const name = user?.name || user?.email?.split("@")[0] || t("guest")

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent side={side} align={align} sideOffset={4} className="min-w-60 rounded-lg">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
            <span className="truncate text-sm font-medium capitalize">{name}</span>
            {user?.email && (
              <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          {!isPaid && (
            <DropdownMenuItem onClick={() => router.push("/pricing?clicked-buy-button")}>
              <Sparkles />
              {t("upgradeToPro")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => router.push("/dashboard/billing")}>
            <Settings />
            {t("settings")}
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Languages />
              {tLang(locale)}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-40">
              {/* Radio rather than plain items so the active locale is marked —
                  the menu doubles as the indicator the old standalone switcher
                  was. `pathname` from @/i18n/navigation is locale-agnostic, so
                  replacing it with a new locale just rewrites the prefix. */}
              <DropdownMenuRadioGroup
                value={locale}
                onValueChange={(next) =>
                  startTransition(() => router.replace(pathname, { locale: next as typeof locale }))
                }
              >
                {routing.locales.map((loc) => (
                  <DropdownMenuRadioItem key={loc} value={loc} disabled={isPending}>
                    {tLang(loc)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            logout()
            router.push("/login")
          }}
        >
          <LogOut />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
