// Client case studies (team-only): managed at /dashboard/case-studies, shown on the marketing site.

export const CASE_STUDY_BASE = "https://freeserp.com/team-b4ada0c0962365f0cd6a669c/agency"

export const caseStudyUrl = (agency: string, slug: string) => `${CASE_STUDY_BASE}/${agency}/casestudy/${slug}`

/** "Ci Siamo!" → "ci-siamo": the URL part the server accepts (lowercase letters, numbers, dashes). */
export const slugify = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)

export interface CaseStudyRow {
  id: string
  agency: string
  slug: string
  name: string
  snapshotAt: string | null
  snapshotError: string | null
  updatedAt: string
}

export interface CaseStudyDetails {
  agencyName: string
  address: string
  website: string
  rankBeforeUrl?: string
  rankAfterUrl?: string
  growthReportUrl?: string
  growthBeforeUrl?: string
  citations: string[]
  hiddenSites: string[]
  ownSites: number
  qrUrl?: string
  hideQr?: boolean
}

export interface CaseStudy extends CaseStudyRow {
  details: CaseStudyDetails
}
