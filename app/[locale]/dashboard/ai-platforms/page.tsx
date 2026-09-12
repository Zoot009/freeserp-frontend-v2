/**
 * /dashboard/ai-platforms has no index of its own — the four assistant pages
 * live under it, and the section they belong to is the AI Prompt Tracker.
 *
 * It still needs to answer, though: the breadcrumb on an assistant page used to
 * point here (the trail was derived from URL segments, so it invented a link to
 * a directory that was never a page) and anyone who followed it got a 404, as
 * does anyone who trims the url back by hand. Send them to the section instead.
 */

import { redirect } from "@/i18n/navigation"

export default async function AiPlatformsIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  redirect({ href: "/dashboard/ai-prompt-tracker", locale })
}
