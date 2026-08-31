"use client"

// "Can this account add another project?" — asked in one place, answered from
// the server.
//
// The Rank Tracker page carried this as a hard-coded FREE_PROJECTS_LIMIT while
// the Overview had no notion of a cap at all, so the same click opened the
// create-project modal on one page and the upgrade popup on the other — and the
// user who was already at their limit found out by filling in a domain and
// getting a red 402 box back. /api/usage already reports `projectsLimit` (the
// resolved plan limit, per-user overrides included), so read it rather than
// duplicating the number in the client.
//
// Refetches on the app-wide "usage:refresh" event, same as the other usage
// readers, so upgrading in another tab lifts the gate without a reload.

import { useCallback, useEffect, useState } from "react"
import { api, getAccessToken } from "@/lib/api"

/**
 * Used only until /api/usage answers (or if it never does). The server enforces
 * the real cap on POST /api/projects either way, so being wrong here delays a
 * message — it can't let anyone past the limit.
 */
export const FREE_PROJECTS_LIMIT = 1

interface UsageShape {
  plan?: string
  projectsLimit?: number
}

export interface ProjectLimitState {
  /** "free" | "paid", or null while usage is still in flight. */
  plan: string | null
  /** Projects this account may own. */
  limit: number
  /** True once /api/usage has answered — call sites can hold a gate until then. */
  resolved: boolean
  /**
   * Whether owning `count` projects means the account cannot create another.
   *
   * Free plans only, deliberately. A paid account at its (much higher) cap is
   * rare enough that the server's 402 and the global QuotaUpsellModal are the
   * right surface for it; gating the button on an unresolved plan would show a
   * paid user an upgrade popup for a limit they don't have.
   */
  atLimit: (count: number) => boolean
}

export function useProjectLimit(): ProjectLimitState {
  const [plan, setPlan] = useState<string | null>(null)
  const [limit, setLimit] = useState<number | null>(null)

  const load = useCallback(async () => {
    if (!getAccessToken()) return
    try {
      const u = await api.get<UsageShape>("/api/usage")
      if (!u) return
      setPlan(u.plan ?? null)
      if (typeof u.projectsLimit === "number") setLimit(u.projectsLimit)
    } catch {
      // Advisory only — never surface a usage hiccup as an error.
    }
  }, [])

  useEffect(() => {
    void load()
    const onRefresh = () => void load()
    window.addEventListener("usage:refresh", onRefresh)
    return () => window.removeEventListener("usage:refresh", onRefresh)
  }, [load])

  const effectiveLimit = limit ?? FREE_PROJECTS_LIMIT

  const atLimit = useCallback(
    (count: number) => plan === "free" && count >= effectiveLimit,
    [plan, effectiveLimit],
  )

  return { plan, limit: effectiveLimit, resolved: plan !== null, atLimit }
}
