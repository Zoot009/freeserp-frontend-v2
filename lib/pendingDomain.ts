"use client"

// Reads the domain a visitor previewed on the marketing site's landing page, so
// their first project is already named after it instead of being an empty
// dashboard.
//
// Written by freeserp-v2/lib/landing/pendingDomain.ts. The cookie NAME and the
// localhost/production domain-scoping rules must stay in sync between the two
// files — they are separate deployments and cannot share a module.
//
// The value is UNTRUSTED: it is a cookie, editable by anyone. It is re-validated
// here before use, and the backend validates again on create.

const COOKIE = "fs_pending_domain"

/** Query-string fallback for visitors who block cookies (the signup CTA carries it). */
const QUERY_PARAM = "domain"

/**
 * Same normalization the landing page applies, repeated because the two apps are
 * separate deployments. Returns null for anything that isn't a plausible host,
 * so a tampered or stale cookie is ignored rather than creating a junk project.
 */
export function normalizeDomain(raw: string): string | null {
  let s = raw.trim().toLowerCase()
  if (!s) return null

  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
  s = s.replace(/^[^@/]*@/, "")
  s = s.split(/[/?#]/)[0] ?? ""
  s = s.split(":")[0] ?? ""
  s = s.replace(/^www\./, "")
  s = s.replace(/\.+$/, "")

  if (s.length > 253) return null
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(s)) return null
  return s
}

function readCookie(): string | null {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]*)`))
    return match?.[1] ? decodeURIComponent(match[1]) : null
  } catch {
    return null
  }
}

/**
 * The pending domain, from the cookie or (if cookies are blocked) the `?domain=`
 * the landing page's signup CTA appends. Null when there's nothing usable.
 */
export function readPendingDomain(): string | null {
  if (typeof document === "undefined") return null

  const fromCookie = readCookie()
  if (fromCookie) {
    const normalized = normalizeDomain(fromCookie)
    if (normalized) return normalized
  }

  try {
    const fromQuery = new URLSearchParams(window.location.search).get(QUERY_PARAM)
    if (fromQuery) return normalizeDomain(fromQuery)
  } catch {
    /* ignore */
  }
  return null
}

/**
 * Expire the cookie. Cleared on BOTH scopes because we can't know which one the
 * landing page used — production writes it on `.freeserp.com`, local dev writes
 * it host-only, and deleting a cookie requires matching its domain attribute.
 * Clearing the wrong one is a no-op, so doing both is safe.
 */
export function clearPendingDomain(): void {
  if (typeof document === "undefined") return
  try {
    const expire = `${COOKIE}=; path=/; max-age=0; samesite=lax`
    document.cookie = expire
    const host = window.location.hostname
    if (host === "freeserp.com" || host.endsWith(".freeserp.com")) {
      document.cookie = `${expire}; domain=.freeserp.com`
    }
  } catch {
    /* ignore */
  }
}

/**
 * Re-write the pending domain as a cookie on THIS origin.
 *
 * Called from the signup page when it arrives with `?domain=`. Without this the
 * query-string channel is dead: signup navigates to /dashboard/projects without
 * carrying its query along, so the reader there would never see it. Persisting
 * it as a cookie hands it to the existing reader unchanged.
 *
 * Host-only (no `domain=` attribute) — this is the app's own origin and the
 * value never needs to travel back to the marketing site.
 */
export function persistPendingDomain(raw: string): void {
  if (typeof document === "undefined") return
  const domain = normalizeDomain(raw)
  if (!domain) return
  try {
    const parts = [
      `${COOKIE}=${encodeURIComponent(domain)}`,
      "path=/",
      `max-age=${30 * 24 * 60 * 60}`,
      "samesite=lax",
    ]
    if (window.location.protocol === "https:") parts.push("secure")
    document.cookie = parts.join("; ")
  } catch {
    /* ignore */
  }
}

/** Project name derived from a domain: "seoptimer.com" -> "seoptimer". */
export function projectNameFor(domain: string): string {
  return domain.split(".")[0] || domain
}
