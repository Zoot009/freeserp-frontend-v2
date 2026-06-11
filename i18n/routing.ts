import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['en', 'es', 'fr', 'de'],
  defaultLocale: 'en',
  // English stays at /dashboard (no /en prefix); other locales get /es/dashboard etc.
  localePrefix: 'as-needed',
})

export type Locale = (typeof routing.locales)[number]
