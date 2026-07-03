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

const GOOGLE_SUGGEST = "https://suggestqueries.google.com/complete/search"
const TIMEOUT_MS = 4000
const MAX_SUGGESTIONS = 8

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get("q") ?? "").trim()
  const gl = (searchParams.get("gl") ?? "").trim().toLowerCase()

  // Google returns nothing useful for one character; skip the round-trip.
  if (q.length < 2 || q.length > 120) return NextResponse.json({ suggestions: [] })

  const url = new URL(GOOGLE_SUGGEST)
  url.searchParams.set("client", "firefox") // returns clean JSON: [query, [suggestions...]]
  url.searchParams.set("hl", "en")
  if (/^[a-z]{2}$/.test(gl)) url.searchParams.set("gl", gl)
  url.searchParams.set("q", q)

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0" },
    })
    if (!res.ok) return NextResponse.json({ suggestions: [] })
    // Parse the text ourselves so a non-JSON content-type header can't trip up
    // res.json(); the outer catch handles any malformed body.
    const data = JSON.parse(await res.text())
    const list: unknown[] = Array.isArray(data) && Array.isArray(data[1]) ? data[1] : []
    const suggestions = list
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .slice(0, MAX_SUGGESTIONS)
    return NextResponse.json(
      { suggestions },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    )
  } catch {
    // Timeout, network error, or malformed body — degrade to no suggestions.
    return NextResponse.json({ suggestions: [] })
  } finally {
    clearTimeout(timer)
  }
}
