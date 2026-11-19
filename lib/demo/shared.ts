// The contract every tool's demo implements, and the helpers they share.
//
// Spec: .claude/skills/demo-report/SKILL.md. This file is shared by every
// tool's demo — change it in its own coordinated PR, never inside one tool's.

/** The id every demo uses, in whatever slot its tool keeps ids. */
export const DEMO_ID = "demo"

/** The one subject every demo is about, so the demos read as one story. */
export const DEMO_BRAND = {
  name: "Nike",
  domain: "nike.com",
  url: "https://www.nike.com",
  country: "US",
  /** For the Maps tools. */
  store: { name: "Nike Portland", city: "Portland, OR", lat: 45.5191, lng: -122.6787 },
  youtube: { channel: "Nike", handle: "@nike" },
  /** The rivals the demos track (the rank tracker's Competitor Spy). */
  competitors: ["adidas.com", "footlocker.com", "runnersworld.com"],
} as const

/**
 * One tool's demo. lib/demo/index.ts maps an API prefix to it and routes
 * `<prefix>/demo…` here: GETs call `get`, every other method is refused there
 * (403 demo_read_only), so a tool never handles writes or routing itself.
 */
export interface DemoTool {
  /** `rest` = path segments after "<prefix>/demo". Return undefined for a 404. */
  get(rest: string[], query: URLSearchParams): unknown
}

export type DemoResult =
  | { data: unknown; error?: undefined }
  | { error: { status: number; code: string; message: string }; data?: undefined }

export const DAY_MS = 86_400_000

/** mulberry32 — tiny deterministic PRNG. Seed it per item so data never shifts. */
export function prng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The demo's "latest run": 06:00 UTC today, or yesterday's before that hour.
 * Generate every date backwards from it, so a demo never looks stale.
 */
export function demoAnchor(now = Date.now()): number {
  const anchor = Math.floor(now / DAY_MS) * DAY_MS + 6 * 3_600_000
  return anchor > now ? anchor - DAY_MS : anchor
}

/**
 * Memoise a demo's data per anchor. Pages poll, and every poll must get the
 * same data back — a different random number each time reads as a live change.
 */
export function perAnchor<T>(build: (anchor: number) => T): () => T {
  let cache: { anchor: number; value: T } | null = null
  return () => {
    const anchor = demoAnchor()
    if (cache?.anchor !== anchor) cache = { anchor, value: build(anchor) }
    return cache.value
  }
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/

/**
 * Every ISO timestamp in `value`, moved by `ms`. Generated demo data is stamped
 * at a fixed time; this moves all of it to "now" in one pass.
 */
export function shiftDates<T>(value: T, ms: number): T {
  const walk = (v: unknown): unknown =>
    typeof v === "string" ? (ISO.test(v) ? new Date(Date.parse(v) + ms).toISOString() : v)
    : Array.isArray(v) ? v.map(walk)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
    : v
  return walk(value) as T
}
