// First-party behavioural event tracking. Batches events and POSTs them to our own
// backend (/api/events) — no GTM/third party. Shares the anonymous visitor id with
// the attribution system (lib/utm.ts), so events stitch to the same user at signup.
// Gated on cookie consent, matching UtmCapture.

import { getVisitorId } from "@/lib/utm"

const SESSION_ID_KEY = "fs_session_id"
const BATCH_SIZE = 10
const FLUSH_DELAY_MS = 2000

interface QueuedEvent {
  name: string
  path?: string
  referrer?: string
  properties?: Record<string, unknown>
  // Carried only on the page_engagement event; promoted to dedicated columns server-side.
  durationMs?: number
  maxScrollPct?: number
}

let queue: QueuedEvent[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

const HEATMAP_BATCH_SIZE = 20
const ENGAGEMENT_MIN_MS = 1000

interface HeatmapPoint {
  path: string
  type: "click"
  xRatio: number
  yRatio: number
  pageW: number
  pageH: number
  elementSelector?: string
}

let heatmapQueue: HeatmapPoint[] = []
let heatmapInited = false

// Page-engagement (dwell + scroll) state for the page currently in view.
let pageEnterTs = Date.now()
let pageMaxScrollPct = 0
let engagementPath = typeof window !== "undefined" ? window.location.pathname : ""
let scrollTicking = false

// Per-tab session id (groups a single visit). New id per tab/session.
function getSessionId(): string {
  if (typeof window === "undefined") return ""
  try {
    let id = sessionStorage.getItem(SESSION_ID_KEY)
    if (!id) {
      id = crypto.randomUUID()
      sessionStorage.setItem(SESSION_ID_KEY, id)
    }
    return id
  } catch {
    return ""
  }
}

function consentGranted(): boolean {
  try {
    return localStorage.getItem("cookie-consent") === "accepted"
  } catch {
    return false
  }
}

function send(body: string, useBeacon: boolean) {
  const url = "/api/events"
  if (useBeacon && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }))
      return
    } catch {
      /* fall through to fetch */
    }
  }
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
    credentials: "include",
  }).catch(() => {})
}

// Flush the queue in one batched request. `useBeacon` for page-hide (fetch may be
// cancelled as the page unloads). Never throws — analytics is non-critical.
export function flush(useBeacon = false): void {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (queue.length === 0) return
  const events = queue
  queue = []
  send(JSON.stringify({ visitorId: getVisitorId(), sessionId: getSessionId(), source: "app", events }), useBeacon)
}

// Query params that carry a search term. Only these keys are ever read — the rest
// of the query string is never stored, so tokens/emails in unrelated params can't
// leak into analytics. The keyword rides in `properties`, not `path`, so path stays
// the grouping key for dwell/heatmap aggregation.
const KEYWORD_PARAMS = ["keyword", "kw", "q", "query", "search", "term"]
const KEYWORD_MAX_LEN = 120

// The search term on the current URL, if any. Exported for tests.
export function keywordFromQuery(search: string): string | undefined {
  const params = new URLSearchParams(search)
  for (const key of KEYWORD_PARAMS) {
    const raw = params.get(key)?.trim()
    if (raw) return raw.slice(0, KEYWORD_MAX_LEN)
  }
  return undefined
}

// Queue an event; flushed on a short debounce, at batch size, or on page hide.
export function track(name: string, properties?: Record<string, unknown>): void {
  if (typeof window === "undefined" || !consentGranted()) return
  const referrer = typeof document !== "undefined" ? document.referrer || undefined : undefined
  // Attach the landing search term to page views, unless the caller set one.
  const keyword = name === "$pageview" ? keywordFromQuery(window.location.search) : undefined
  if (keyword && properties?.keyword == null) properties = { ...properties, keyword }
  queue.push({ name, path: window.location.pathname, referrer, properties })
  if (queue.length >= BATCH_SIZE) {
    flush()
    return
  }
  if (!flushTimer) flushTimer = setTimeout(() => flush(), FLUSH_DELAY_MS)
}

// ── Page engagement: time-on-page + max scroll depth ───────────────────────

// How far down the page the bottom of the viewport has reached (0..100). A page
// that fits on screen counts as fully seen (100).
function computeScrollPct(): number {
  if (typeof window === "undefined") return 0
  const height = document.documentElement.scrollHeight
  if (height <= 0) return 0
  const scrollTop = window.scrollY || document.documentElement.scrollTop || 0
  const pct = Math.round(((scrollTop + window.innerHeight) / height) * 100)
  return Math.min(100, Math.max(0, pct))
}

function onScroll(): void {
  if (scrollTicking) return
  scrollTicking = true
  requestAnimationFrame(() => {
    pageMaxScrollPct = Math.max(pageMaxScrollPct, computeScrollPct())
    scrollTicking = false
  })
}

// Emit a page_engagement event for the page currently being measured, then reset
// the timer/scroll so a second call (e.g. a later visibilitychange) can't double
// count. Gated on consent, like track(). Called on route change and page hide.
export function flushPageEngagement(): void {
  if (typeof window === "undefined") return
  pageMaxScrollPct = Math.max(pageMaxScrollPct, computeScrollPct())
  const durationMs = Date.now() - pageEnterTs
  if (engagementPath && durationMs >= ENGAGEMENT_MIN_MS && consentGranted()) {
    queue.push({ name: "page_engagement", path: engagementPath, durationMs, maxScrollPct: pageMaxScrollPct })
    if (!flushTimer) flushTimer = setTimeout(() => flush(), FLUSH_DELAY_MS)
  }
  pageEnterTs = Date.now()
  pageMaxScrollPct = computeScrollPct()
}

// Start measuring a newly-entered page. Call after flushPageEngagement() on nav.
export function markPage(path: string): void {
  engagementPath = path
  pageEnterTs = Date.now()
  pageMaxScrollPct = 0
}

// ── Click heatmap capture ──────────────────────────────────────────────────

function elementSelector(el: Element | null): string | undefined {
  if (!el || !el.tagName) return undefined
  const tag = el.tagName.toLowerCase()
  if (el.id) return `${tag}#${el.id}`.slice(0, 256)
  const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/)[0] : ""
  return (cls ? `${tag}.${cls}` : tag).slice(0, 256)
}

function onHeatmapClick(e: MouseEvent): void {
  if (!consentGranted()) return
  try {
    const doc = document.documentElement
    const w = doc.scrollWidth || window.innerWidth
    const h = doc.scrollHeight || window.innerHeight
    if (w <= 0 || h <= 0) return
    heatmapQueue.push({
      path: window.location.pathname,
      type: "click",
      xRatio: Math.min(1, Math.max(0, e.pageX / w)),
      yRatio: Math.min(1, Math.max(0, e.pageY / h)),
      pageW: w,
      pageH: h,
      elementSelector: elementSelector(e.target as Element),
    })
    if (heatmapQueue.length >= HEATMAP_BATCH_SIZE) flushHeatmap()
  } catch {
    /* analytics is non-critical */
  }
}

// Register the click listener once. Idempotent, browser-only. The click handler
// itself re-checks consent so late-granted consent is honoured.
export function initHeatmap(): void {
  if (typeof window === "undefined" || heatmapInited) return
  heatmapInited = true
  document.addEventListener("click", onHeatmapClick, { passive: true, capture: true })
}

function sendHeatmap(body: string, useBeacon: boolean): void {
  const url = "/api/events/heatmap"
  if (useBeacon && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }))
      return
    } catch {
      /* fall through to fetch */
    }
  }
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
    credentials: "include",
  }).catch(() => {})
}

export function flushHeatmap(useBeacon = false): void {
  if (heatmapQueue.length === 0) return
  const points = heatmapQueue
  heatmapQueue = []
  sendHeatmap(
    JSON.stringify({ visitorId: getVisitorId(), sessionId: getSessionId(), source: "app", points }),
    useBeacon,
  )
}

// Flush any pending events when the tab is backgrounded/closed (best chance to not
// lose the tail of a session). Registered once, browser-only.
if (typeof window !== "undefined") {
  const onHide = () => {
    flushPageEngagement()
    flushHeatmap(true)
    flush(true)
  }
  window.addEventListener("pagehide", onHide)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") onHide()
  })
  window.addEventListener("scroll", onScroll, { passive: true })
}
