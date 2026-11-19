// Demo report for the Google Maps (Business Profile) Audit: read-only sample data.
// Spec: .claude/skills/demo-report/SKILL.md; reference: ./rank-tracker.ts.
//
// lib/demo/index.ts routes every GET /api/gbp-audit/demo… here, so the real
// report page (/dashboard/google-maps-audit/demo) renders a finished audit of
// the demo store with no backend row, no DataForSEO task and no credits spent.
//
// Unlike the other demos, the data is a fixture rather than generated here:
// the report is 1,300 lines of scoring (backend gbp-audit/report.ts), and a
// second copy in the frontend would drift. scripts/demo-maps-audit.ts builds the
// facts and runs the backend's own buildReport over them; re-run it when
// report.ts or facts.ts changes. The response wrapper mirrors
// gbpAudit.service.ts report().
//
// The fixture's dates are written against its own anchor. Every one is moved by
// the same whole number of days to the current demo anchor, so the demo never
// looks stale — and since the report measures recency from facts.fetchedAt,
// never from the clock, shifting both keeps it exact.

import type { GbpAuditResponse } from "@/lib/gbp-audit"
import fixture from "./maps-audit.fixture.json"
import { DEMO_BRAND, DEMO_ID, perAnchor, type DemoTool } from "./shared"

/** Where the demo's CTAs lead: the audit form, at the top of the tool's page. */
export const MAPS_AUDIT_CREATE_HREF = "/dashboard/google-maps-audit"
/** The demo report itself — what PaidToolGate's sample screen links free users to. */
export const MAPS_AUDIT_DEMO_HREF = `/dashboard/google-maps-audit/${DEMO_ID}`

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/

/** A deep copy with every ISO timestamp moved by `ms`. */
function shiftDates<T>(value: T, ms: number): T {
  if (typeof value === "string") return (ISO.test(value) ? new Date(Date.parse(value) + ms).toISOString() : value) as T
  if (Array.isArray(value)) return value.map((v) => shiftDates(v, ms)) as T
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shiftDates(v, ms)])) as T
  }
  return value
}

const demoData = perAnchor((anchor): GbpAuditResponse => {
  const { facts, report } = shiftDates(fixture, anchor - Date.parse(fixture.anchor)) as unknown as Pick<GbpAuditResponse, "facts" | "report">
  return {
    audit: {
      id: DEMO_ID,
      input: facts!.target.input,
      name: facts!.business.name,
      keyword: facts!.keyword ?? null,
      fromCache: false,
      status: "COMPLETED",
      error: null,
      progress: null,
      score: report!.score,
      createdAt: new Date(Date.parse(facts!.fetchedAt) - 3 * 60_000).toISOString(),
      seconds: 148,
      shareToken: null,
    },
    facts,
    report,
    // No earlier audits: every id a demo links to must open.
    previous: null,
    others: [],
  } as GbpAuditResponse
})

/** The row the audit list pins first (ReportHistory's `demo`). */
export function demoMapsAuditRow() {
  const { audit } = demoData()
  return {
    title: audit.name ?? DEMO_BRAND.store.name,
    subtitle: `Score ${audit.score}/100 · “${audit.keyword}”`,
    domain: "maps.google.com",
    href: MAPS_AUDIT_DEMO_HREF,
  }
}

// ── Routes (GET only; lib/demo/index.ts refuses writes) ─────────────────────

export const mapsAuditDemo: DemoTool = {
  base: "/api/gbp-audit",
  get(rest) {
    return rest.length === 0 ? demoData() : undefined
  },
}
