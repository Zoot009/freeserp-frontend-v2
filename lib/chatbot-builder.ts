// The in-house Chatbot Builder: client chatbots built and hosted by the chatbot CRM, listed and added from here through
// /api/chatbot-builder (the backend forwards to the CRM with its secret; see the backend's chatbotBuilder.client.ts).

export type ChatbotStatus = "new" | "crawling" | "processing" | "training" | "testing" | "ready" | "published" | "failed"

export type ClientRow = {
  id: string
  name: string
  website: string
  category: string
  status: ChatbotStatus
  statusLabel: string
  suspended: boolean
  demoEnabled: boolean
  demoUrl: string | null
  crmUrl: string
  createdAt: string
  archivedAt: string | null
}

export type ClientDetail = {
  client: {
    id: string
    name: string
    website: string
    category: string
    description: string | null
    country: string | null
    language: string
    contactEmail: string | null
    contactPhone: string | null
    createdAt: string
    archivedAt: string | null
  }
  chatbot: {
    id: string
    status: ChatbotStatus
    statusLabel: string
    suspended: boolean
    suspendedReason: string | null
    demoEnabled: boolean
    demoUrl: string | null
    lastTrainedAt: string | null
  }
  crawl: {
    latest: {
      kind: string
      status: string
      stage: string
      discovered: number
      processed: number
      succeeded: number
      failed: number
      skipped: number
      lastError: string | null
      startedAt: string | null
      finishedAt: string | null
    } | null
    pages: { total: number; fetched: number; failed: number; skipped: number; excluded: number; pending: number; last_fetched: string | null }
  }
  quality: { status: string; score: number | null; threshold: number; total: number; passed: number; failed: number; error: string | null; finishedAt: string | null } | null
  crmUrl: string
}

export type Category = { key: string; label: string }

/** Still being built: the page checks back by itself until it settles. */
export const BUILDING: ChatbotStatus[] = ["crawling", "processing", "training", "testing"]

export const STATUS_TONE: Record<ChatbotStatus, string> = {
  new: "bg-muted text-muted-foreground",
  crawling: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  processing: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  training: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  testing: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  ready: "bg-brand/10 text-brand",
  published: "bg-green-500/10 text-green-700 dark:text-green-400",
  failed: "bg-red-500/10 text-red-600 dark:text-red-400",
}

/** Languages the chatbot can answer in (the CRM accepts more; these cover the clients so far). */
export const LANGUAGES: [string, string][] = [
  ["en", "English"],
  ["hi", "Hindi"],
  ["mr", "Marathi"],
  ["gu", "Gujarati"],
  ["ta", "Tamil"],
  ["te", "Telugu"],
  ["kn", "Kannada"],
  ["bn", "Bengali"],
  ["ar", "Arabic"],
  ["es", "Spanish"],
  ["fr", "French"],
  ["de", "German"],
]

export const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—")
export const host = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "")
