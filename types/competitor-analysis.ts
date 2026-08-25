// v2 backend ships competitor-analysis without internal-page crawl. The
// internalPages*, internalCrawlStatus, link-graph and AnalysisStages.internal
// fields are kept here OPTIONAL for back-compat with views that read legacy
// rows in the shared DB; v2 never populates them.

export interface CrawlData {
  urlInfo: { url: string; protocol: string; hostname: string; pathname: string; isHttps: boolean }
  metaTags: { title: string; titleLength: number; description: string; descriptionLength: number; canonical: string; language: string; robots: string }
  openGraph: Record<string, string>
  twitterCard: Record<string, string>
  headings: { h1: string[]; h2: string[]; h3: string[]; h4: string[]; h5: string[]; h6: string[] }
  headingStructure: Array<{ level: number; text: string; section: string }>
  content: { wordCount: number; uniqueWords: number; paragraphs: number; readingTime: number; readability: { fleschScore: number; gradeLevel: number; avgWordsPerSentence: number; sentenceCount: number }; firstWords: string; contentText?: string }
  keywordAnalysis: { targetKeyword: string; occurrences: number; density: string; inTitle: boolean; inH1: boolean; inMetaDescription: boolean; inFirst100Words: boolean; inUrl: boolean; bySection: Record<string, { occurrences: number; density: string; wordCount: number }>; topPhrases: { oneWord?: Array<{ phrase: string; count: number }>; twoWord: Array<{ phrase: string; count: number }>; threeWord: Array<{ phrase: string; count: number }> } }
  pageSections: Record<string, { wordCount: number; headings: Record<string, number>; links: { internal: number; external: number }; images: number; text: string }>
  imageAnalysis: { total: number; withAlt: number; withoutAlt: number; lazyLoaded: number; images: Array<{ src: string; alt: string; hasAlt: boolean; isLazy: boolean; width?: string; height?: string }> }
  linkAnalysis: { total: number; internal: number; external: number; nofollow: number; selfReferences: number; externalDomains: string[]; bySection: Record<string, { internal: number; external: number }>; internalLinks: Array<{ text: string; url: string; section: string }>; externalLinks: Array<{ text: string; url: string; section: string; isNofollow: boolean }> }
  structuredData: { schemas: Array<{ type: string; data: Record<string, unknown> }>; totalSchemas: number }
  technical: { hasFavicon: boolean; hasViewport: boolean; scripts: number; stylesheets: number; inlineStyles: number; metaRobots: string; xRobotsTag: string }
  trustSignals: { hasPrivacyPolicy: boolean; hasTermsOfService: boolean; hasContactInfo: boolean; hasSocialLinks: boolean }
  contentStructure: { hasTableOfContents: boolean; hasFaqSection: boolean; hasVideo: boolean; hasBreadcrumb: boolean; lists: number; bulletPoints: number }
  httpStatus: number
  redirected: boolean
  performance: { ttfb: number; domInteractive: number; domContentLoaded: number; webVitals: { fcp: number; lcp: number; cls: number } }
  psiData?: {
    strategy: string
    scores: { performance: number; seo: number; accessibility: number; bestPractices: number }
    vitals: { ttfb: number; fcp: number; lcp: number; tbt: number; cls: number; si: number; tti: number }
  } | null
  // Off-page authority (DA/PA), embedded by the backend crawl worker. Absent on
  // pre-DA/PA rows and when the provider is OFF — the scorer then stays on-page.
  authority?: { da: number | null; pa: number | null; source: string } | null
  // Off-page backlink counts (domain-wide + this exact page) from DataForSEO.
  // Absent / null when BACKLINKS_ENABLED is off. Folded into the off-page score.
  backlinks?: { domain: number | null; page: number | null; source: string } | null
  crawlMethod: string
  crawlTime: number
  crawledAt: string
}

export interface CompetitorResult {
  domain: string
  position: number | null
  url: string | null
  title: string | null
  snippet: string | null
  wordCount: number | null
  imageCount: number | null
  linkCount: number | null
  internalLinks: number | null
  externalLinks: number | null
  h1Count: number
  h2Count: number
  h3Count: number
  h1Tags: string | null
  h2Tags: string | null
  h3Tags: string | null
  crawledAt: string | null
  // ── legacy v1 internal-page fields (optional; v2 never populates) ──
  internalPagesCrawled?: number
  totalInternalWordCount?: number
  avgWordsPerPage?: number
  totalH1Tags?: number
  totalH2Tags?: number
  internalPages?: Array<{
    url: string
    wordCount: number
    h1Count: number
    h2Count: number
    h1Tags: string[]
    h2Tags: string[]
  }>
  fullCrawlData: CrawlData | null
  offPage?: OffPageMetrics | null
  crawlMethod?: string | null
  crawlError?: CrawlError | null
  internalCrawlStatus?: 'pending' | 'crawling' | 'done' | 'failed' | 'locked'
}

/**
 * Off-page authority as served by the API, read from the dedicated DB columns
 * rather than derived from the crawl blob.
 *
 * Two reasons it exists separately from the score breakdown:
 *  - a page whose crawl was blocked still has valid DA/PA (the provider is keyed
 *    on the URL, not on our ability to fetch the page), and
 *  - `status` distinguishes "the provider has nothing for this URL" from "the
 *    call failed", which previously both rendered as a bare "—".
 */
export interface OffPageMetrics {
  da: number | null
  pa: number | null
  domainBacklinks: number | null
  pageBacklinks: number | null
  status: 'ok' | 'no-data' | 'unavailable' | 'off' | 'unknown'
  checkedAt: string | null
}

export type CrawlErrorCode =
  | 'BOT_PROTECTION'
  | 'HTTP_ERROR'
  | 'TIMEOUT'
  | 'UNREACHABLE'
  | 'THIN_CONTENT'
  | 'UNKNOWN'

// Present only when the crawl bottomed out with no usable data.
export interface CrawlError {
  code: CrawlErrorCode
  httpStatus?: number | null
}

export interface PageProgress {
  domain: string
  url: string
  status: 'pending' | 'completed' | 'failed'
  method?: string
  internalCrawlStatus?: 'pending' | 'crawling' | 'done' | 'failed' | 'locked'
}

export interface AnalysisProgress {
  total: number
  crawled: number
  failed: number
  currentPages: PageProgress[]
}

export interface AnalysisStages {
  main: {
    ready: boolean
    completedAt: string | null
  }
  internal?: {
    ready: boolean
    total: number
    done: number
    failed: number
    crawling: number
    pending: number
    perDomain: Array<{ domain: string; status: 'pending' | 'crawling' | 'done' | 'failed' | 'locked' }>
  }
}

export interface AiTask {
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  recommendation: string
  details: string
  impact?: string
}

export interface AiCategory {
  id: string
  name: string
  icon: string
  taskCount: number
  tasks: AiTask[]
}

export interface AiPlan {
  summary: string
  strengths?: string[]
  categories: AiCategory[]
  free?: boolean
  lockedCategories?: Array<{ id: string; name: string; taskCount: number }>
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface ChatSessionSummary {
  id: string
  title: string | null
  category: string | null
  problemTitle: string | null
  messageCount: number
  createdAt: string
  updatedAt: string
}

export interface ChatSessionsResponse {
  sessions: ChatSessionSummary[]
  tokensUsed: number
  tokensCap: number
}

export interface ChatSessionResponse {
  session: ChatSessionSummary
  messages: ChatMessage[]
  tokensUsed: number
  tokensCap: number
}

export interface ChatMessagePostResponse {
  userMessage: ChatMessage
  message: ChatMessage
  tokensUsed: number
  tokensCap: number
  sessionTitle: string | null
}

export interface AnalysisData {
  id: string
  status: string
  keyword: string
  yourDomain: string
  yourPosition: number | null
  yourUrl: string | null
  yourWordCount: number | null
  yourImageCount: number | null
  yourLinkCount: number | null
  yourInternalLinks: number | null
  yourExternalLinks: number | null
  yourH1Count: number
  yourH2Count: number
  yourH3Count: number
  // ── legacy v1 internal-page fields (optional; v2 never populates) ──
  yourInternalPagesCrawled?: number
  yourTotalInternalWordCount?: number
  yourAvgWordsPerPage?: number
  yourTotalH1Tags?: number
  yourTotalH2Tags?: number
  yourInternalPages?: Array<{
    url: string
    wordCount: number
    h1Count: number
    h2Count: number
    h1Tags: string[]
    h2Tags: string[]
  }>
  yourFullCrawlData: CrawlData | null
  yourOffPage?: OffPageMetrics | null
  yourInternalCrawlStatus?: 'pending' | 'crawling' | 'done' | 'failed'
  competitors: CompetitorResult[]
  createdAt: string
  mainCrawlCompletedAt: string | null
  completedAt: string | null
  stages?: AnalysisStages
  progress?: AnalysisProgress
  aiPlan?: AiPlan | null
  access?: {
    plan: 'free' | 'paid' | string
    partial?: boolean
    chatEnabled: boolean
    aiPlanRestricted: boolean
    lockedCategoryIds: string[]
    internalLinksRestricted?: boolean
  }
}
