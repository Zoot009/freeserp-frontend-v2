import { MetadataRoute } from 'next'
import { routing } from '@/emails/i18n/routing'

// Public, indexable pages (paths without locale prefix).
const PUBLIC_PATHS = ['/login', '/signup', '/pricing'] as const

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.freeserp.com'
  const lastModified = new Date()

  // Build a localized URL for a path. The default locale ('as-needed') has no prefix.
  const localizedUrl = (path: string, locale: string) =>
    locale === routing.defaultLocale
      ? `${baseUrl}${path}`
      : `${baseUrl}/${locale}${path}`

  return PUBLIC_PATHS.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: localizedUrl(path, locale),
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
      alternates: {
        languages: Object.fromEntries(
          routing.locales.map((l) => [l, localizedUrl(path, l)]),
        ),
      },
    })),
  )
}
