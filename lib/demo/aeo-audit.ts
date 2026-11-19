// Demo report for the AEO & GEO Audit tool: how ready nike.com is for AI answer
// engines. Spec: .claude/skills/demo-report/SKILL.md.
//
// lib/demo/index.ts routes GET /api/aeo-audit/demo here; the response is
// aeo-audit/aeo.service.ts `report()`. The audit itself — findings, scores,
// engine readiness, fixes, strengths, the comparison with a previous run — is
// AEO_DEMO, produced by the backend's own AEO engine on a synthetic nike.com
// crawl (scripts/demo/aeo-audit.gen.ts; change the crawl there and regenerate).
// This file only adds what moves: dates, ids and the history around it.

import { AEO_DEMO } from "./aeo-audit-data"
import { DAY_MS, DEMO_BRAND, DEMO_ID, perAnchor, type DemoTool } from "./shared"

/** Where the demo's CTAs lead: the audit form. */
export const AEO_AUDIT_CREATE_HREF = "/dashboard/aeo-audit"
/** The demo report, for PaidToolGate's "Explore the live demo". */
export const AEO_AUDIT_DEMO_HREF = `/dashboard/aeo-audit/${DEMO_ID}`

const { breakdown, site, pages, findings, fixes, strengths, previous } = AEO_DEMO

const demoData = perAnchor((anchor) => {
  const createdAt = new Date(anchor - 2 * 3_600_000).toISOString()
  return {
    report: {
      audit: {
        id: DEMO_ID,
        origin: DEMO_BRAND.url,
        status: "COMPLETED",
        error: null,
        attempts: 1,
        maxPages: 5, // the homepage plus five more
        progress: { pages: [pages.length, pages.length], answers: [30, 30] },
        aeoScore: breakdown.aeo,
        geoScore: breakdown.geo,
        createdAt,
      },
      site,
      breakdown: { ...breakdown, measured: breakdown.measured.map((m) => ({ ...m, checkedAt: createdAt })) },
      origin: site.finalOrigin,
      host: new URL(DEMO_BRAND.url).hostname,
      pages,
      findings,
      // Stored as indexes into `findings` to keep the data file small; served whole, as the API does.
      fixes: fixes.map((f) => ({ ...f, failing: f.failing.map((i) => findings[i]) })),
      strengths,
      // The demo has no other audits to open, so the comparison renders without its link.
      previous: { id: `${DEMO_ID}-previous`, createdAt: new Date(anchor - 35 * DAY_MS).toISOString(), ...previous },
      others: [],
      history: { aeo: [previous.aeoScore, breakdown.aeo], geo: [previous.geoScore, breakdown.geo] },
      seconds: 214,
      maxAttempts: 3,
    },
  }
})

/** The ReportHistory pin for this demo, as the history's own rows read. */
export function aeoAuditDemoRow() {
  return {
    title: new URL(DEMO_BRAND.url).hostname.replace(/^www\./, ""),
    subtitle: `AEO ${breakdown.aeo} · GEO ${breakdown.geo}`,
    href: AEO_AUDIT_DEMO_HREF,
  }
}

export const aeoAuditDemo: DemoTool = {
  get(rest) {
    return rest.length === 0 ? demoData() : undefined
  },
}
