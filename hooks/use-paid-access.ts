"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"

// Whether the signed-in account is on a paid plan (or has bought credits), from
// /api/usage: the same answer the server's paid-tool gate uses, so a tool is
// never shown unlocked here and refused there. One request per user per page
// load, shared by every caller.

let cache: { userId: string; promise: Promise<boolean | null> } | null = null

function load(userId: string): Promise<boolean | null> {
  if (cache?.userId !== userId) {
    cache = {
      userId,
      // null when /api/usage can't be read: the page then opens normally and the
      // server, which enforces the gate, decides.
      promise: api
        .get<{ plan?: string | null }>("/api/usage")
        .then((u) => u.plan === "paid")
        .catch(() => null),
    }
  }
  return cache.promise
}

/** true = paid, false = free, null = still checking (or unknown). */
export function usePaidAccess(userId: string | null | undefined): { paid: boolean | null; checking: boolean } {
  const [state, setState] = useState<{ paid: boolean | null; checking: boolean }>({ paid: null, checking: !!userId })
  useEffect(() => {
    if (!userId) {
      setState({ paid: null, checking: false })
      return
    }
    let live = true
    setState((s) => ({ ...s, checking: true }))
    load(userId).then((paid) => live && setState({ paid, checking: false }))
    return () => {
      live = false
    }
  }, [userId])
  return state
}
