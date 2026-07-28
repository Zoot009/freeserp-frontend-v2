// Session-replay recorder (rrweb): captures DOM-diff events for the admin
// "Watch replay" viewer. Gated on the same cookie-consent flag as lib/analytics.ts
// (no second consent prompt) and keyed by the same visitorId/sessionId pair, so a
// recorded session lines up with that visitor's row in the admin Overview table.
"use client"

import type { eventWithTime } from "rrweb"
import { getVisitorId } from "@/lib/utm"
import { getSessionId, consentGranted } from "@/lib/analytics"

const REPLAY_ENDPOINT = "/api/events/replay"
const FLUSH_INTERVAL_MS = 15000
const MAX_BUFFER_SIZE = 300
const RETRY_DELAY_MS = 1000

let stopRecordingFn: (() => void) | null = null
let flushTimer: ReturnType<typeof setInterval> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let buffer: eventWithTime[] = []
let initialized = false

function send(useBeacon: boolean) {
  if (buffer.length === 0) return
  const events = buffer.splice(0, buffer.length)
  const body = JSON.stringify({ visitorId: getVisitorId(), sessionId: getSessionId(), source: "app", events })

  if (useBeacon && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    if (navigator.sendBeacon(REPLAY_ENDPOINT, new Blob([body], { type: "application/json" }))) return
  }
  // `keepalive` caps the request body at ~64 KiB in most browsers — same limit
  // sendBeacon has. The FullSnapshot chunk is routinely several hundred KB, so only
  // the actual page-hide path (useBeacon) sets keepalive; the periodic flush must not.
  fetch(REPLAY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: useBeacon,
    credentials: "include",
  })
    .then(() => {})
    .catch(() => {
      // Network hiccup — put the chunk back and retry soon rather than losing it,
      // since it may be the FullSnapshot without which the whole replay is unplayable.
      buffer.unshift(...events)
      if (!retryTimer) {
        retryTimer = setTimeout(() => {
          retryTimer = null
          send(false)
        }, RETRY_DELAY_MS)
      }
    })
}

async function startRecording() {
  if (stopRecordingFn) return // already running
  const { record, EventType } = await import("rrweb") // dynamic import: keep rrweb out of the initial bundle

  stopRecordingFn =
    record({
      emit: (event) => {
        buffer.push(event as eventWithTime)
        // The FullSnapshot is much bigger than the keepalive-fetch/beacon cap — flush
        // it immediately over a plain, uncapped fetch rather than risk it sitting in
        // the buffer until a quick bounce forces it through the capped unload path.
        if (event.type === EventType.FullSnapshot) send(false)
        else if (buffer.length >= MAX_BUFFER_SIZE) send(false)
      },
      // Blanks every form field's recorded value — any input could be PII.
      maskAllInputs: true,
      sampling: { scroll: 200, mousemoveCallback: 400 },
    }) ?? null

  if (!flushTimer) flushTimer = setInterval(() => send(false), FLUSH_INTERVAL_MS)
}

function stopRecording() {
  stopRecordingFn?.()
  stopRecordingFn = null
  if (flushTimer) {
    clearInterval(flushTimer)
    flushTimer = null
  }
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
  buffer = []
}

export function initSessionReplay(): void {
  if (typeof window === "undefined" || initialized) return
  initialized = true

  if (consentGranted()) void startRecording()

  window.addEventListener("cookie-consent-change", () => {
    if (consentGranted()) void startRecording()
    else stopRecording()
  })

  // Flush on both signals — visibilitychange fires reliably on mobile (pagehide is
  // inconsistent there), pagehide covers desktop back/forward-cache cases. Both use
  // the beacon path since the page may be gone by the time a normal fetch resolves.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") send(true)
  })
  window.addEventListener("pagehide", () => send(true))
}
