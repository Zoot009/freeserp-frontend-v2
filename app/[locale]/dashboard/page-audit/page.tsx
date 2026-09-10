/**
 * Page Audit — crawl one URL with a real browser and run 63 SEO rules over it.
 *
 * The whole-site version is its own route now (/dashboard/site-audit). Both are
 * the same form and the same job endpoint, so everything lives in AuditRunner
 * and this page only says which mode it is.
 */

import { redirect } from "@/i18n/navigation"
import { AuditRunner } from "@/components/page-audit/audit-runner"

export default async function PageAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ mode?: string; url?: string; fresh?: string }>
}) {
  // ?mode=site used to be how the sidebar's "Full Website Audit" entry landed on
  // the site tab of this page, so old links and bookmarks carry it. Send them to
  // the route that tab became rather than quietly showing them the wrong tool.
  const { mode, url, fresh } = await searchParams
  if (mode === "site") {
    const { locale } = await params
    redirect({ href: "/dashboard/site-audit", locale })
  }

  // ?url=&fresh=1 comes from "Run fresh" on a report: prefill the target and
  // start it immediately, past the two-week reuse window.
  return <AuditRunner mode="single" initialUrl={url ?? ""} autoFresh={fresh === "1"} />
}
