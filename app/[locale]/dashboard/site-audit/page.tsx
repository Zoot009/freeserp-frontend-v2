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

export default function SiteAuditPage() {
  return <AuditRunner mode="site" />
}
