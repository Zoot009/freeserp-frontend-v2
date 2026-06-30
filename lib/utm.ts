// First-party marketing-attribution capture. Deliberately does NOT touch GTM or
// any third party — every touch is POSTed to our own backend
// (/api/attribution/touch) and stored in Postgres. See components/utm-capture.tsx
// for when touches fire, and lib/auth.tsx for how the visitor id is linked to a
// user at signup.

import { api } from "@/lib/api"

const VISITOR_ID_KEY = "fs_visitor_id"
const TOUCH_DEDUPE_PREFIX = "fs_touch_"

export interface Utm {
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmContent?: string
  utmTerm?: string
}

// UTM query-param name → our camelCase field.
const UTM_KEYS: Array<[string, keyof Utm]> = [
  ["utm_source", "utmSource"],
  ["utm_medium", "utmMedium"],
  ["utm_campaign", "utmCampaign"],
  ["utm_content", "utmContent"],
  ["utm_term", "utmTerm"],
]

// Read (or lazily create) the anonymous, first-party visitor id. Stable across
// sessions for this browser; regenerated only if localStorage is cleared. When
// storage is unavailable (private mode) it returns a fresh ephemeral id so a touch
// can still be recorded — it just won't link across page loads.
export function getVisitorId(): string {
  if (typeof window === "undefined") return ""
  try {
    const existing = localStorage.getItem(VISITOR_ID_KEY)
    if (existing) return existing
    const id = crypto.randomUUID()
    localStorage.setItem(VISITOR_ID_KEY, id)
    return id
  } catch {
    return crypto.randomUUID()
  }
}

// Pull the five standard UTM params from a URLSearchParams, keeping only keys that
// are actually present and non-empty (so we never send "").
export function readUtm(params: URLSearchParams): Utm {
  const utm: Utm = {}
  for (const [param, field] of UTM_KEYS) {
    const v = params.get(param)?.trim()
    if (v) utm[field] = v
  }
  return utm
}

export function hasAnyUtm(utm: Utm): boolean {
  return Object.keys(utm).length > 0
}

// Fire-and-forget a single touch to the backend. `dedupeKey`, when given, guards
// against duplicate inserts within the same tab session (React re-renders / strict-
// mode double-mount / navigating back to the same URL). Never throws — attribution
// is non-critical, so network/4xx failures are swallowed.
export async function recordTouch(
  payload: Utm & { referrer?: string; landingPath?: string },
  dedupeKey?: string,
): Promise<void> {
  if (typeof window === "undefined") return
  const sessionKey = dedupeKey ? `${TOUCH_DEDUPE_PREFIX}${dedupeKey}` : undefined
  try {
    if (sessionKey && sessionStorage.getItem(sessionKey)) return
  } catch {
    // sessionStorage unavailable — fall through and record (best-effort).
  }
  try {
    await api.post("/api/attribution/touch", { visitorId: getVisitorId(), ...payload })
    if (sessionKey) {
      try {
        sessionStorage.setItem(sessionKey, "1")
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* attribution is non-critical — swallow */
  }
}
