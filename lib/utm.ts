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
  // Meta (Facebook) ad identifiers. Mirrors freeserp-ui/lib/utm.ts — keep the two
  // in sync. Present here because the marketing site forwards these across the
  // origin hop to app.freeserp.com, so the touch recorded at /signup carries the
  // ad id too. That second touch is what keeps the signup→ad join intact when the
  // anonymous visitorId → userId back-fill misses (cleared cookies, Safari ITP).
  metaCampaignId?: string
  metaAdsetId?: string
  metaAdId?: string
  metaPlacement?: string
  metaSiteSource?: string
  // Meta's own click id. Not a join key (the Marketing API never exposes it) — it
  // exists so we can measure how much Meta traffic arrived with unusable ad ids.
  fbclid?: string
  // Every other query param the URL carried. The fields above are promoted to
  // indexed columns because they drive joins; this keeps the rest so a new ad
  // parameter is recorded the moment it appears, with no code change.
  params?: Record<string, string>
}

// Every Utm field except `params`, which holds a record rather than a string.
// Keeps the lookup tables below assignable now that Utm is no longer all-strings.
type StringUtmKey = Exclude<keyof Utm, "params">

// UTM query-param name → our camelCase field.
const UTM_KEYS: Array<[string, StringUtmKey]> = [
  ["utm_source", "utmSource"],
  ["utm_medium", "utmMedium"],
  ["utm_campaign", "utmCampaign"],
  ["utm_content", "utmContent"],
  ["utm_term", "utmTerm"],
]

// Accepted aliases per field, most specific first. fs_meta_* is what the marketing
// site forwards; the bare Meta names are accepted too so an ad pointed straight at
// the app still attributes. A value failing `pattern` (an unexpanded "{{ad.id}}")
// falls through to the next alias rather than being stored — an id that could never
// match an imported ad row is worse than no id at all.
const META_ID_RE = /^\d{1,25}$/
const FBCLID_RE = /^[A-Za-z0-9_.-]{1,255}$/
// Never stored, whatever the link carries — campaign URLs do pick up auth material
// in practice, and an append-only log is the last place it should come to rest.
const SENSITIVE_KEY_RE =
  /(^|_)(password|passwd|pwd|secret|token|jwt|auth|session|sid|otp|pin|apikey|api|key|signature|sig|email|mail|phone|tel|mobile|card|cvv|iban|ssn)(_|$)/i

// A macro Meta never substituted, e.g. a literal "{{placement}}". The id fields
// reject these via their digits-only pattern; the free-form ones (placement,
// site_source_name) have no pattern, so they need an explicit guard or the
// literal braces end up on display in the admin.
const UNEXPANDED_MACRO_RE = /\{\{.*?\}\}/

// Facebook's link shim (l.facebook.com) re-encodes the destination URL, so the
// "+" that Meta writes for a space when expanding {{campaign.name}} survives one
// decode pass and reaches us literally — "Check+your+web+ranking+camp+image".
// In a query string "+" always means space, and no Meta object name legitimately
// contains one, so restore it on the human-readable fields. Ids and fbclid are
// deliberately excluded: their charsets have no "+", so there is nothing to fix
// and a blanket replace could only corrupt them.
const plusToSpace = (v: string) => (v.includes("+") ? v.replace(/\+/g, " ") : v)

const MAX_PARAMS = 40
const MAX_KEY_LEN = 64
const MAX_VALUE_LEN = 512

// Enough to call a visit "campaign traffic". Pattern-based so a newly invented
// parameter counts without a code change; deliberately excludes app params.
const MARKETING_KEY_RE =
  /^(utm_|fs_meta_)|clid$|^(gclid|ref|referrer|source|campaign|medium|affiliate|partner|promo|coupon|ad_id|adset_id|campaign_id|placement)$/i

const META_KEYS: Array<[readonly string[], StringUtmKey, RegExp | null]> = [
  [["fs_meta_campaign_id", "campaign_id"], "metaCampaignId", META_ID_RE],
  [["fs_meta_adset_id", "adset_id"], "metaAdsetId", META_ID_RE],
  [["fs_meta_ad_id", "ad_id"], "metaAdId", META_ID_RE],
  [["fs_meta_placement", "placement"], "metaPlacement", null],
  [["fs_meta_source", "site_source_name"], "metaSiteSource", null],
  [["fbclid"], "fbclid", FBCLID_RE],
]

// Cookie attributes for the shared visitor id. Scoped to ".freeserp.com" in prod
// so the marketing site (freeserp.com) and the app (app.freeserp.com) — separate
// origins — read the SAME id and the journey stitches across the domain boundary
// (localStorage is per-origin and can't). On localhost/IP we omit the domain →
// host-only, which is still shared across ports (cookies ignore port).
function visitorCookieAttrs(): string {
  const https = typeof location !== "undefined" && location.protocol === "https:"
  const host = typeof location !== "undefined" ? location.hostname : ""
  const domain = host.endsWith("freeserp.com") ? "; domain=.freeserp.com" : ""
  return `; path=/; max-age=31536000; SameSite=Lax${https ? "; Secure" : ""}${domain}`
}

function readVisitorCookie(): string | null {
  if (typeof document === "undefined") return null
  const m = document.cookie.match(/(?:^|;\s*)fs_visitor_id=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

// Read (or lazily create) the anonymous, first-party visitor id, held in a cookie
// shared across *.freeserp.com (see visitorCookieAttrs) so the cross-domain journey
// links up. Migrates any pre-existing localStorage id so current app visitors keep
// their id (and already-recorded touches). Falls back to an ephemeral id when both
// cookies and storage are unavailable (private mode) so a touch can still fire.
export function getVisitorId(): string {
  if (typeof window === "undefined") return ""
  const fromCookie = readVisitorCookie()
  if (fromCookie) return fromCookie

  let id: string | null = null
  try {
    id = localStorage.getItem(VISITOR_ID_KEY)
  } catch {
    /* localStorage unavailable */
  }
  if (!id) id = crypto.randomUUID()

  try {
    document.cookie = `${VISITOR_ID_KEY}=${encodeURIComponent(id)}${visitorCookieAttrs()}`
  } catch {
    /* ignore */
  }
  // Keep a localStorage mirror as a fallback if the cookie is later cleared.
  try {
    localStorage.setItem(VISITOR_ID_KEY, id)
  } catch {
    /* ignore */
  }
  return id
}

// Pull the five standard UTM params plus the Meta ad params from a URLSearchParams,
// keeping only keys that are actually present and non-empty (so we never send "").
export function readUtm(params: URLSearchParams): Utm {
  const utm: Utm = {}
  for (const [param, field] of UTM_KEYS) {
    const v = params.get(param)?.trim()
    if (v) utm[field] = plusToSpace(v)
  }
  for (const [aliases, field, pattern] of META_KEYS) {
    for (const param of aliases) {
      const v = params.get(param)?.trim()
      if (!v) continue
      if (pattern && !pattern.test(v)) continue // unusable — try the next alias
      if (!pattern && UNEXPANDED_MACRO_RE.test(v)) continue // macro never expanded
      utm[field] = pattern ? v : plusToSpace(v).slice(0, 200)
      break
    }
  }

  const extra: Record<string, string> = {}
  let count = 0
  for (const [rawKey, rawValue] of params) {
    if (count >= MAX_PARAMS) break
    const key = rawKey.trim().slice(0, MAX_KEY_LEN)
    const value = rawValue.trim()
    if (!key || !value) continue
    if (SENSITIVE_KEY_RE.test(key)) continue
    if (key in extra) continue
    extra[key] = value.slice(0, MAX_VALUE_LEN)
    count += 1
  }
  if (count > 0) utm.params = extra

  return utm
}

// Promoted fields first, then pattern-match the raw params — which is what lets a
// brand-new parameter register as marketing traffic without editing this file.
export function hasAnyUtm(utm: Utm): boolean {
  for (const k of Object.keys(utm)) {
    if (k !== "params") return true
  }
  return Object.keys(utm.params ?? {}).some((k) => MARKETING_KEY_RE.test(k))
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
