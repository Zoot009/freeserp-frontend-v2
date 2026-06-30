import { redirect } from "@/i18n/navigation"

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale } = await params
  const sp = await searchParams

  // Forward the inbound query string (notably utm_* campaign params) through the
  // redirect. A server redirect otherwise drops the query entirely, so a campaign
  // landing on "/" would lose its attribution before any client code runs. Use
  // next-intl's { pathname, query } form so the params are preserved + localized.
  const query: Record<string, string | string[]> = {}
  for (const [k, v] of Object.entries(sp)) {
    if (v !== undefined) query[k] = v
  }

  // Locale-aware redirect preserves the active locale prefix (e.g. /es/dashboard/projects).
  // The app root (app.freeserp.com) lands on the projects page.
  redirect({ href: { pathname: "/dashboard/projects", query }, locale })
}
