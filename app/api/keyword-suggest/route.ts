import { NextResponse } from "next/server"

// Related-keyword suggestions for the Add-Keywords modal.
//
// Proxies Google's free autocomplete. A SERVER proxy is required because
// suggestqueries.google.com sends no CORS headers, so the browser can't call it
// directly. Returns keyword-idea strings only (no search volume).
//
// This is a LOCAL Next route: because NEXT_PUBLIC_API_URL points the browser's
// `api` client straight at the backend, the client must reach this via a
// same-origin `fetch("/api/keyword-suggest?...")`, NOT via lib/api. A filesystem
// route handler under /api/ takes precedence over the /api/:path* rewrite in
// next.config.mjs, so this path is served here rather than proxied to the backend.
//
// Relevance: querying the bare prefix (e.g. "serp") returns whatever is globally
// popular ("serpent", "serpico") — useless on a niche site. We instead query a
// few smarter variants (trailing-space + a niche-combined term) and drop results
// that share no whole word with the seed/niche, which removes "serpent" while
// keeping "serp api". Niche tokens come from the project (domain + tracked
// keywords) via the `ctx` param.

const GOOGLE_SUGGEST = "https://suggestqueries.google.com/complete/search"
const TIMEOUT_MS = 4000
const MAX_SUGGESTIONS = 8
const MIN_KEEP = 4 // backfill below this so a valid seed never shows an empty strip

const wordsOf = (s: string): string[] => s.toLowerCase().match(/[a-z0-9]+/g) ?? []

// One Google autocomplete call → array of suggestion strings ([] on any failure).
async function fetchVariant(query: string, gl: string, signal: AbortSignal): Promise<string[]> {
  const url = new URL(GOOGLE_SUGGEST)
  url.searchParams.set("client", "firefox") // returns clean JSON: [query, [suggestions...]]
  url.searchParams.set("hl", "en")
  if (/^[a-z]{2}$/.test(gl)) url.searchParams.set("gl", gl)
  url.searchParams.set("q", query)
  try {
    const res = await fetch(url, { signal, headers: { "User-Agent": "Mozilla/5.0" } })
    if (!res.ok) return []
    // Parse the text ourselves — Google serves this as text/javascript, which can
    // trip up res.json(); the try/catch handles any malformed body.
    const data = JSON.parse(await res.text())
    return Array.isArray(data) && Array.isArray(data[1])
      ? data[1].filter((s: unknown): s is string => typeof s === "string" && s.trim().length > 0)
      : []
  } catch {
    return []
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get("q") ?? "").trim()
  const gl = (searchParams.get("gl") ?? "").trim().toLowerCase()
  const ctx = (searchParams.get("ctx") ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 3)
    .slice(0, 5)

  // Google returns nothing useful for one character; skip the round-trip.
  if (q.length < 2 || q.length > 120) return NextResponse.json({ suggestions: [] })

  // The seed's own words, and whether the seed is itself on-niche (shares a word
  // with the project context). Only an on-niche seed gets niche-combined variants
  // and the domain-specific ranking boost — otherwise an off-niche seed like
  // "coffee" would get nonsense such as "coffee serp" forced to the top.
  const seedWords = new Set(wordsOf(q))
  const seedIsNiche = [...seedWords].some((w) => ctx.includes(w))
  const combineTokens = seedIsNiche ? ctx.filter((t) => !seedWords.has(t)).slice(0, 2) : []

  // Query variants, highest-relevance first. Trailing space forces topical
  // "next-word" completions; niche-combined terms surface domain-specific phrases
  // ("serp checker"); the raw query keeps mid-word seeds working ("seo au" →
  // "seo audit").
  const variants = Array.from(
    new Set([`${q} `, ...combineTokens.map((t) => `${q} ${t}`), q]),
  )

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  let merged: string[]
  try {
    const results = await Promise.allSettled(variants.map((v) => fetchVariant(v, gl, ctrl.signal)))
    // Merge preserving variant priority order; dedupe case-insensitive; drop the
    // exact seed echo Google returns first.
    const seen = new Set<string>([q.toLowerCase()])
    merged = []
    for (const r of results) {
      if (r.status !== "fulfilled") continue
      for (const s of r.value) {
        const key = s.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        merged.push(s)
      }
    }
  } finally {
    clearTimeout(timer)
  }

  // Relevance: keep suggestions that share a whole word with the seed or niche
  // (so "serpent" ≠ "serp" is dropped, "serp api" is kept). When the seed is
  // on-niche, rank those carrying a niche token beyond the seed first (more
  // domain-specific, e.g. "serp checker").
  const nicheWords = new Set([...seedWords, ...ctx])
  const scored = merged.map((s) => {
    const w = wordsOf(s)
    return {
      s,
      onNiche: w.some((x) => nicheWords.has(x)),
      domainSpecific: seedIsNiche && w.some((x) => ctx.includes(x) && !seedWords.has(x)),
    }
  })

  const kept = scored.filter((x) => x.onNiche)
  kept.sort((a, b) => Number(b.domainSpecific) - Number(a.domainSpecific))
  let out = kept.map((x) => x.s)
  // Backfill from the filtered-out remainder if the niche filter was too strict.
  if (out.length < MIN_KEEP) {
    for (const x of scored) {
      if (out.length >= MIN_KEEP) break
      if (!x.onNiche) out.push(x.s)
    }
  }

  return NextResponse.json(
    { suggestions: out.slice(0, MAX_SUGGESTIONS) },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  )
}
