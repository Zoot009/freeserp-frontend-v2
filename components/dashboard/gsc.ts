/**
 * Search Console state, and whether a linked property actually covers the
 * project it is linked to.
 *
 * These lived in the overview's setup card until that card was removed — the
 * six tool prompts beside Position Tracking say the same things with less
 * ceremony. Two consumers outlast it (the Traffic card and the Search Console
 * page), so the check moves here rather than staying behind in a file named
 * for a component that no longer exists.
 *
 * The pairing is checked on the CLIENT because the backend does not validate
 * it on link: /api/gsc/connection answers "is a Google account connected"
 * account-wide, and /api/gsc/projects/:id/site answers "which property feeds
 * this project" — neither asks whether that property has anything to do with
 * this project's domain. A project pointed at somebody else's property reports
 * somebody else's clicks, with nothing anywhere saying so.
 */

export type GscState = {
  /** Account-level grant. null while the check is in flight. */
  connected: boolean | null
  /** Property linked to THIS project, e.g. "sc-domain:example.com". */
  siteUrl: string | null
  projectDomain: string | null
}

/**
 * Search Console property → the bare host it covers.
 * Domain properties arrive as "sc-domain:example.com"; URL-prefix properties as
 * "https://www.example.com/".
 */
function propertyHost(siteUrl: string): string | null {
  const s = siteUrl.trim()
  if (s.startsWith("sc-domain:")) return s.slice("sc-domain:".length).toLowerCase() || null
  try {
    return new URL(s).hostname.toLowerCase().replace(/^www\./, "") || null
  } catch {
    return null
  }
}

/**
 * Does this property actually cover the project's domain?
 *
 * Deliberately lenient about subdomains in both directions — a domain property
 * on example.com legitimately covers blog.example.com, and a project tracking
 * blog.example.com is correctly served by either. Anything else is a mismatch
 * worth surfacing, because it silently reports another site's numbers.
 */
export function propertyCoversDomain(siteUrl: string, projectDomain: string): boolean {
  const host = propertyHost(siteUrl)
  const domain = projectDomain.trim().toLowerCase().replace(/^www\./, "")
  if (!host || !domain) return false
  return host === domain || host.endsWith(`.${domain}`) || domain.endsWith(`.${host}`)
}
