"use client"

import { useTransition } from "react"
import { useLocale, useTranslations } from "next-intl"
import { usePathname, useRouter } from "@/i18n/navigation"
import { routing } from "@/i18n/routing"
import { Dropdown } from "@/components/dashboard/dropdown"

/**
 * Locale switcher. Navigates to the same page in the chosen locale, preserving
 * the current path. next-intl persists the choice via the NEXT_LOCALE cookie.
 * Rendered with the shared custom Dropdown so it matches every other dropdown.
 */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const t = useTranslations("common")
  const tLang = useTranslations("languages")
  const [isPending, startTransition] = useTransition()

  return (
    <Dropdown
      className={className}
      value={locale}
      options={routing.locales.map((loc) => ({ value: loc, label: tLang(loc) }))}
      onChange={(nextLocale) => {
        startTransition(() => {
          // `pathname` is locale-agnostic; the locale option rewrites the prefix.
          router.replace(pathname, { locale: nextLocale })
        })
      }}
      disabled={isPending}
      ariaLabel={t("language")}
    />
  )
}
