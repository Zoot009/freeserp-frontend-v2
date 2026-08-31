// v2 backend supports a curated set of markets via DataForSEO location_code.
// Mapping must stay in sync with backend-v2/src/modules/serp/dataforseo.mapper.ts.
//
// This static list now covers COUNTRIES only. Anything below country level — a
// city, region or postcode — is far too large to ship in a bundle (DataForSEO
// publishes ~197k of them) and is searched through GET /api/locations instead.
// The countries stay here so the picker's default view needs no network at all.

import { api } from "@/lib/api"

export type LocationType = "Country" | "Region" | "City" | "Postal Code"

export type Location = {
  /** What to send as a keyword's location: an ISO2, or a DataForSEO code as a string. */
  code: string
  name: string
  /** ISO2 of the containing country — what the flag needs. Defaults to `code`. */
  countryIso?: string
  type?: LocationType
}

export const POPULAR_LOCATIONS: Location[] = [
  { code: "in", name: "India" },
  { code: "us", name: "United States" },
  { code: "gb", name: "United Kingdom" },
  { code: "au", name: "Australia" },
  { code: "ca", name: "Canada" },
  { code: "sg", name: "Singapore" },
  { code: "ae", name: "United Arab Emirates" },
]

export const ALL_LOCATIONS: Location[] = [
  { code: "us", name: "United States" },
  { code: "gb", name: "United Kingdom" },
  { code: "ca", name: "Canada" },
  { code: "au", name: "Australia" },
  { code: "in", name: "India" },
  { code: "de", name: "Germany" },
  { code: "fr", name: "France" },
  { code: "br", name: "Brazil" },
  { code: "it", name: "Italy" },
  { code: "es", name: "Spain" },
  { code: "nl", name: "Netherlands" },
  { code: "sg", name: "Singapore" },
  { code: "ae", name: "United Arab Emirates" },
  { code: "jp", name: "Japan" },
  { code: "za", name: "South Africa" },
  { code: "mx", name: "Mexico" },
  { code: "se", name: "Sweden" },
  { code: "pl", name: "Poland" },
  { code: "tr", name: "Turkey" },
  { code: "dk", name: "Denmark" },
  { code: "nz", name: "New Zealand" },
  { code: "ie", name: "Ireland" },
  { code: "ch", name: "Switzerland" },
  { code: "be", name: "Belgium" },
  { code: "pt", name: "Portugal" },
  { code: "no", name: "Norway" },
  { code: "fi", name: "Finland" },
  { code: "ar", name: "Argentina" },
  { code: "cl", name: "Chile" },
  { code: "ph", name: "Philippines" },
  // ── Extended markets — keep in sync with backend SUPPORTED_LOCATIONS ────────
  // Europe
  { code: "at", name: "Austria" },
  { code: "bg", name: "Bulgaria" },
  { code: "hr", name: "Croatia" },
  { code: "cz", name: "Czechia" },
  { code: "gr", name: "Greece" },
  { code: "hu", name: "Hungary" },
  { code: "ro", name: "Romania" },
  { code: "sk", name: "Slovakia" },
  { code: "ua", name: "Ukraine" },
  // Asia-Pacific
  { code: "bd", name: "Bangladesh" },
  { code: "hk", name: "Hong Kong" },
  { code: "id", name: "Indonesia" },
  { code: "my", name: "Malaysia" },
  { code: "pk", name: "Pakistan" },
  { code: "kr", name: "South Korea" },
  { code: "lk", name: "Sri Lanka" },
  { code: "tw", name: "Taiwan" },
  { code: "th", name: "Thailand" },
  { code: "vn", name: "Vietnam" },
  // Latin America
  { code: "co", name: "Colombia" },
  { code: "cr", name: "Costa Rica" },
  { code: "do", name: "Dominican Republic" },
  { code: "ec", name: "Ecuador" },
  { code: "gt", name: "Guatemala" },
  { code: "pe", name: "Peru" },
  { code: "uy", name: "Uruguay" },
  { code: "ve", name: "Venezuela" },
  // Middle East & Africa
  { code: "bh", name: "Bahrain" },
  { code: "eg", name: "Egypt" },
  { code: "gh", name: "Ghana" },
  { code: "il", name: "Israel" },
  { code: "jo", name: "Jordan" },
  { code: "ke", name: "Kenya" },
  { code: "kw", name: "Kuwait" },
  { code: "ma", name: "Morocco" },
  { code: "ng", name: "Nigeria" },
  { code: "om", name: "Oman" },
  { code: "qa", name: "Qatar" },
  { code: "sa", name: "Saudi Arabia" },
]

const supported = new Set(ALL_LOCATIONS.map((l) => l.code))

export function isSupportedLocation(code: string): boolean {
  return supported.has(code.toLowerCase())
}

export function locationName(code: string): string {
  return ALL_LOCATIONS.find((l) => l.code === code.toLowerCase())?.name ?? code.toUpperCase()
}

// Lookup map of code → display name, exposed for consumers that prefer a
// keyed object over the array.
export const LOCATION_NAMES: Record<string, string> = Object.freeze(
  ALL_LOCATIONS.reduce<Record<string, string>>((acc, l) => {
    acc[l.code] = l.name
    return acc
  }, {}),
)

/**
 * Emoji flag for an ISO-3166 alpha-2 country code. Returns a globe emoji for
 * unsupported codes so the UI never breaks.
 */
export function flagFor(code: string): string {
  const normalized = code.toLowerCase()
  if (normalized.length !== 2) return "\u{1F30D}"
  const A = 0x41
  const base = 0x1f1e6 // regional indicator A
  const upper = normalized.toUpperCase()
  const first = upper.charCodeAt(0)
  const second = upper.charCodeAt(1)
  if (first < A || first > A + 25 || second < A || second > A + 25) return "\u{1F30D}"
  return String.fromCodePoint(base + (first - A), base + (second - A))
}

/**
 * Search markets below country level.
 *
 * Returns [] for a query shorter than two characters, and [] on any failure —
 * the picker still has its country list, so a search outage degrades to today's
 * behaviour rather than an empty dropdown. Same reason the endpoint returns
 * countries when the catalogue table has never been seeded.
 */
export async function searchLocations(
  q: string,
  opts: { country?: string; signal?: AbortSignal } = {},
): Promise<Location[]> {
  if (q.trim().length < 2) return []
  const params = new URLSearchParams({ q: q.trim(), limit: "25" })
  if (opts.country) params.set("country", opts.country)
  try {
    // Full path including /api — in the browser API_BASE is "" and the Next
    // rewrite proxies /api/* to the backend, so a bare "/locations" 404s.
    const res = await api.get<{ locations: Location[] }>(`/api/locations?${params}`, {
      signal: opts.signal,
    })
    return res.locations ?? []
  } catch (err) {
    // Falling back to [] keeps a search outage from breaking the picker — the
    // country list still works. But swallowing it silently is how a wrong
    // request path presented as "No location found." instead of an error, so
    // the reason is at least visible in development.
    if (process.env.NODE_ENV !== "production") {
      console.warn("[locations] search failed", err)
    }
    return []
  }
}
