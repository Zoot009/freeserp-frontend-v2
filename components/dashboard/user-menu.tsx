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
/**
 * Hover/open styling for a menu row.
 *
 * shadcn paints those states with `bg-accent`, which in stock themes is a quiet
 * neutral. This theme deliberately repurposes --accent as the BRAND blue (see
 * the mapping note in globals.css), so every row filled solid blue on hover and
 * the open language row looked selected rather than hovered. --muted is the
 * neutral this theme actually reserves for that, so rows are overridden onto it.
 * Not applied to Sign out — its destructive variant already tints red, which is
 * correct.
 */
const ROW =
  "text-foreground [&_svg]:text-muted-foreground focus:bg-muted focus:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"

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
  const tCommon = useTranslations("common")
  const tLang = useTranslations("languages")
  const [isPending, startTransition] = useTransition()

  const isPaid = user?.plan === "paid"
  const name = user?.name || user?.email?.split("@")[0] || t("guest")

  return (
    // modal={false} so opening the menu doesn't lock body scroll. Radix's modal
    // mode removes the page scrollbar while open, and its width compensation
    // doesn't land here (html/body carry custom scrollbar styling and
    // `overflow-x: clip`), so the whole layout jumped sideways on every open.
    // A menu doesn't need the background inert the way a dialog does; click
    // outside and Escape still close it.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      {/* max-h-none / overflow-visible: the base content caps itself at Radix's
          --radix-dropdown-menu-content-available-height with overflow-y-auto.
          Against the clipping context html/body get from `overflow-x: clip`,
          that height resolved smaller than these few rows, so the menu scrolled
          and showed a scrollbar down its right edge. This menu is five rows at
          most — it never needs to scroll. */}
      <DropdownMenuContent
        side={side}
        align={align}
        sideOffset={4}
        className="min-w-60 max-h-none overflow-visible rounded-lg"
      >
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
            <DropdownMenuItem className={ROW} onClick={() => router.push("/pricing?clicked-buy-button")}>
              <Sparkles />
              {t("upgradeToPro")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem className={ROW} onClick={() => router.push("/dashboard/billing")}>
            <Settings />
            {t("settings")}
          </DropdownMenuItem>

          <DropdownMenuSub>
            {/* "Language: English" — the row states the setting AND its current
                value, so the active locale is readable without opening the
                submenu. */}
            <DropdownMenuSubTrigger className={ROW}>
              <Languages />
              <span>
                {tCommon("language")}: <span className="font-medium">{tLang(locale)}</span>
              </span>
            </DropdownMenuSubTrigger>
            {/* Submenus are always align="start" in Radix (no `align` prop), so
                the list pins its TOP to the trigger and grows downward. That's
                right for the header menu, which opens below the avatar with the
                whole page beneath it. It's wrong for the sidebar menu, which
                opens upward from the footer — there the list ran past the bottom
                of the sidebar, and since it still fit on screen Radix's
                collision flip never corrected it. So the lift applies only when
                the parent opened upward. Derived from the locale count (≈32px a
                row) so adding a language keeps it aligned. */}
            <DropdownMenuSubContent
              alignOffset={side === "top" ? -(routing.locales.length - 1) * 32 : 0}
              className="min-w-40"
            >
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
                  <DropdownMenuRadioItem
                    key={loc}
                    value={loc}
                    disabled={isPending}
                    // Same --accent override as ROW, plus a soft brand fill on
                    // the active locale so "selected" stays distinguishable from
                    // "hovered" once hover is a neutral.
                    className="focus:bg-muted focus:text-foreground data-[state=checked]:bg-brand-soft data-[state=checked]:font-medium data-[state=checked]:text-brand"
                  >
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
