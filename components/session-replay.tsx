"use client"

import { useEffect } from "react"
import { initSessionReplay } from "@/lib/replay"

// Mounts the rrweb session-replay recorder once, globally. Renders nothing —
// initSessionReplay itself gates on cookie consent and reacts to later changes.
export function SessionReplay() {
  useEffect(() => {
    initSessionReplay()
  }, [])

  return null
}
