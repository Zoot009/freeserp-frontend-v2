import { redirect } from "@/emails/i18n/navigation"

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  // Locale-aware redirect preserves the active locale prefix (e.g. /es/dashboard/projects).
  // The app root (app.freeserp.com) lands on the projects page.
  redirect({ href: "/dashboard/projects", locale })
}
