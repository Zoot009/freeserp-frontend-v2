// v2 backend supports a curated set of 30 markets via DataForSEO location_code.
// Mapping must stay in sync with backend-v2/src/modules/serp/dataforseo.mapper.ts.

export type Location = { code: string; name: string }

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
