import { redirect } from "@/i18n/navigation"

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  // Locale-aware redirect preserves the active locale prefix (e.g. /es/dashboard).
  redirect({ href: "/dashboard", locale })
}
