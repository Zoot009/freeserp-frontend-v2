/**
 * Full Website Audit — crawl outward from one URL with a real browser and audit
 * every page reached, up to the plan's page budget.
 *
 * The single-page version is /dashboard/page-audit. Both are the same form and
 * the same job endpoint, so everything lives in AuditRunner and this page only
 * says which mode it is. Finished reports of either kind render at
 * /dashboard/page-audit/<reportId>.
 */

import { AuditRunner } from "@/components/page-audit/audit-runner"

export default async function SiteAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; fresh?: string }>
}) {
  // ?url=&fresh=1 comes from "Run fresh" on a report: prefill the target and
  // start it immediately, past the two-week reuse window.
  const { url, fresh } = await searchParams
  return <AuditRunner mode="site" initialUrl={url ?? ""} autoFresh={fresh === "1"} />
}
