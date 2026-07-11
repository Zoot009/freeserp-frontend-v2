// Shape of the audit `report` blob returned by the external WebsiteAuditTools
// API (see website-audittools-api.md, section 4) and persisted by the FreeSERP
// backend. Only the fields the frontend renders are typed; the rest is tolerated
// via index signatures so an evolving upstream payload doesn't break rendering.

export type ScoreObj = { score: number; grade: string; tier: string }

export type ScoringCategoryKey =
  | "technical"
  | "onPage"
  | "performance"
  | "accessibility"
  | "links"
  | "structuredData"
  | "security"

export type AuditScoring = {
  overall: ScoreObj
  categories: Partial<Record<ScoringCategoryKey, ScoreObj>>
}

export type AuditCheck = {
  id: string
  name: string
  maxScore: number
  priority: number
  section: string // "seo" | "performance" | "ui" | "links" | "technology" | "social" | "geo"
  informational: boolean
  what: string
  why: string
  how: string
  time?: string
  category: string
  passed: boolean | null
  score: number
  shortAnswer: string
  answer: string
  recommendation: string | null
  value: string | number | null
  pageUrl?: string
  data?: Record<string, unknown> | null
}

export type AuditIssue = {
  id: string
  category: string
  type: string
  title: string
  description: string
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO"
  impactScore: number
  pageUrl: string
}

export type AuditPassingCheck = {
  category: string
  code: string
  title: string
  description: string
  pageUrl: string
  goodPractice?: string
}

export type AuditPage = {
  id: string
  url: string
  title: string
  description: string
  statusCode: number
  loadTime: number
  wordCount: number
  imageCount: number
  linkCount: number
  h1Count: number
}

export type AuditReport = {
  id?: string
  url?: string
  status?: string
  pagesAnalyzed?: number
  scoring: AuditScoring
  checks?: AuditCheck[]
  issues?: AuditIssue[]
  passingChecks?: AuditPassingCheck[]
  pages?: AuditPage[]
  createdAt?: string
  completedAt?: string
  [key: string]: unknown
}
