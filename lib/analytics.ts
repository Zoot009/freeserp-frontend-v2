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
}

let queue: QueuedEvent[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

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

// Queue an event; flushed on a short debounce, at batch size, or on page hide.
export function track(name: string, properties?: Record<string, unknown>): void {
  if (typeof window === "undefined" || !consentGranted()) return
  const referrer = typeof document !== "undefined" ? document.referrer || undefined : undefined
  queue.push({ name, path: window.location.pathname, referrer, properties })
  if (queue.length >= BATCH_SIZE) {
    flush()
    return
  }
  if (!flushTimer) flushTimer = setTimeout(() => flush(), FLUSH_DELAY_MS)
}

// Flush any pending events when the tab is backgrounded/closed (best chance to not
// lose the tail of a session). Registered once, browser-only.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => flush(true))
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush(true)
  })
}
