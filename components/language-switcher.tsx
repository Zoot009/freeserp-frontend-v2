"use client"

import { useTransition } from "react"
import { useLocale, useTranslations } from "next-intl"
import { usePathname, useRouter } from "@/emails/i18n/navigation"
import { routing } from "@/emails/i18n/routing"

/**
 * Locale switcher. Navigates to the same page in the chosen locale, preserving
 * the current path. next-intl persists the choice via the NEXT_LOCALE cookie.
 */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const t = useTranslations("common")
  const tLang = useTranslations("languages")
  const [isPending, startTransition] = useTransition()

  function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextLocale = event.target.value
    startTransition(() => {
      // `pathname` is locale-agnostic; the locale option rewrites the prefix.
      router.replace(pathname, { locale: nextLocale })
    })
  }

  return (
    <label className={`inline-flex items-center gap-2 ${className}`}>
      <span className="sr-only">{t("language")}</span>
      <select
        value={locale}
        onChange={onChange}
        disabled={isPending}
        aria-label={t("language")}
        className="rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
      >
        {routing.locales.map((loc) => (
          <option key={loc} value={loc}>
            {tLang(loc)}
          </option>
        ))}
      </select>
    </label>
  )
}
