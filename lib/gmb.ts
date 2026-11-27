// The GMB tools' client side: POST /api/gmb/* (backend src/modules/gmb-tools).
// Every answer is { status: "pending" } until Google's data for the business is
// in (10–60 s the first time, instant once cached), so the page asks again.

import { useCallback, useEffect, useRef, useState } from "react"
import { api, ApiError } from "@/lib/api"
import type { Business, Check, CompetitorRow, Report, Review } from "@/lib/gbp-audit"
import type { GbpPost } from "@/lib/report-builder"

/** `ref` names the business exactly: sent back as `url`, the share link isn't followed again. */
type Ready<T> = { status: "ready"; ref: string; business: Business } & T
type Answer<T> = { status: "pending" } | Ready<T>

export type Optimized = Ready<{
  keyword: string
  rank: number | null
  competitors: Pick<CompetitorRow, "rank" | "title" | "category" | "rating" | "reviewCount">[]
  checks: Check[]
  suggestions: {
    description: string
    categories: { name: string; count: number; why: string }[]
    services: string[]
    nameWarning: string | null
  }
}>
export type PostSet = Ready<{ keyword: string; posts: GbpPost[]; imagesAvailable: boolean }>
export type ReviewList = Ready<{ reviews: Review[]; stats: Report["reviewStats"] }>
export type Reply = Ready<{ reply: string }>

const POLL_MS = 3_000
/** Past DataForSEO's slowest answer and the server's own 3-minute limit. */
const GIVE_UP_MS = 4 * 60_000

/** POST until the answer is ready. One at a time: the next ask waits for the last answer. */
export async function askUntilReady<T>(path: string, body: Record<string, unknown>, signal?: { cancelled: boolean }): Promise<Ready<T> | null> {
  const until = Date.now() + GIVE_UP_MS
  for (;;) {
    const res = await api.post<Answer<T>>(path, body)
    if (res.status === "ready") return res
    if (signal?.cancelled) return null
    if (Date.now() > until) throw new Error("Google is taking longer than usual. Please try again in a minute.")
    await new Promise((r) => setTimeout(r, POLL_MS))
    if (signal?.cancelled) return null
  }
}

/** One tool run: its answer, whether it's running, and what went wrong (with whether buying credits fixes it). */
export function useGmbRun<T>(path: string) {
  const [data, setData] = useState<Ready<T> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ message: string; credits: boolean } | null>(null)
  const current = useRef<{ cancelled: boolean } | null>(null)
  useEffect(() => () => void (current.current && (current.current.cancelled = true)), [])

  const run = useCallback(
    async (body: Record<string, unknown>) => {
      if (current.current) current.current.cancelled = true
      const signal = { cancelled: false }
      current.current = signal
      setBusy(true)
      setError(null)
      try {
        const res = await askUntilReady<T>(path, body, signal)
        if (res && !signal.cancelled) setData(res)
        return res
      } catch (err) {
        if (!signal.cancelled) setError(errorOf(err))
        return null
      } finally {
        if (!signal.cancelled) setBusy(false)
      }
    },
    [path],
  )
  return { data, setData, busy, error, run }
}

export const errorOf = (err: unknown) => ({
  message: err instanceof Error && err.message ? err.message : "Something went wrong. Please try again.",
  credits: err instanceof ApiError && err.code === "insufficient_credits",
})

/** Where the owner manages the listing: replies to reviews, posts and edits are made there. */
export const GBP_MANAGE_URL = "https://business.google.com/locations"
