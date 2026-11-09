// The in-house client report builder: which deliverables there are, and which
// inputs each needs. A report is one or more deliverables run together.

export type Deliverable = "citations" | "gbpPlan" | "aiPost" | "directions" | "siteAudit" | "aeo"

/** What a deliverable needs from the form: a Google Maps link (the business), or the website. */
type Needs = "maps" | "website"

export const DELIVERABLES: { key: Deliverable; title: string; text: string; needs: Needs }[] = [
  { key: "citations", title: "Create 3 citations", text: "Three ready-to-submit local listings on directories the business is missing from, with its exact name, address and phone.", needs: "maps" },
  { key: "gbpPlan", title: "Google Maps audit action plan", text: "The Google Business Profile audit's overall recommendation, 30-day plan and every fix.", needs: "maps" },
  { key: "aiPost", title: "AI Google Post", text: "A Google Business Profile post written by AI for the business, a sample of the daily posts we'll publish.", needs: "maps" },
  { key: "directions", title: "Driving directions map", text: "A map of driving routes from the top competitors' locations to the business, and how we'll add them.", needs: "maps" },
  { key: "siteAudit", title: "Website audit", text: "A FreeSERP crawl of the website: the score and every issue, which we'll fix.", needs: "website" },
  { key: "aeo", title: "AEO & GEO audit", text: "How AI assistants see the business, with the 'Fix first' list.", needs: "website" },
]

export const needsMaps = (sel: Deliverable[]) => sel.some((d) => DELIVERABLES.find((x) => x.key === d)!.needs === "maps")
export const needsWebsite = (sel: Deliverable[]) => sel.some((d) => DELIVERABLES.find((x) => x.key === d)!.needs === "website")

/** The report page's address: what was chosen, and the runs it reads. */
export type RunIds = { sel: Deliverable[]; gbp?: string; siteJob?: string; aeo?: string }

export function reportHref(ids: RunIds): string {
  const q = new URLSearchParams({ sel: ids.sel.join(",") })
  if (ids.gbp) q.set("gbp", ids.gbp)
  if (ids.siteJob) q.set("site", ids.siteJob)
  if (ids.aeo) q.set("aeo", ids.aeo)
  return `/dashboard/report-builder/report?${q.toString()}`
}

export function readRunIds(search: string): RunIds {
  const q = new URLSearchParams(search)
  const keys = new Set(DELIVERABLES.map((d) => d.key))
  return {
    sel: (q.get("sel") ?? "").split(",").filter((k): k is Deliverable => keys.has(k as Deliverable)),
    gbp: q.get("gbp") ?? undefined,
    siteJob: q.get("site") ?? undefined,
    aeo: q.get("aeo") ?? undefined,
  }
}

export type GbpPost = { headline: string; body: string; cta: string; source: "ai" | "template" }
