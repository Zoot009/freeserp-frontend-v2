"use client"

import { useEffect, useState } from "react"

/**
 * Page-wide scroll progress bar fixed to the very top of the viewport.
 * Tracks progress through the whole document (unlike ReadingProgress,
 * which is scoped to an <article> on blog/post pages).
 */
export function ScrollProgress() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let rafId: number | null = null

    const updateProgress = () => {
      if (rafId) cancelAnimationFrame(rafId)

      rafId = requestAnimationFrame(() => {
        const scrollTop = window.scrollY
        const docHeight =
          document.documentElement.scrollHeight - window.innerHeight
        const scrollPercent = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0
        setProgress(Math.min(100, Math.max(0, scrollPercent)))
      })
    }

    window.addEventListener("scroll", updateProgress, { passive: true })
    window.addEventListener("resize", updateProgress)
    updateProgress()

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      window.removeEventListener("scroll", updateProgress)
      window.removeEventListener("resize", updateProgress)
    }
  }, [])

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 z-[1001] h-[3px] bg-transparent pointer-events-none"
    >
      <div
        className="h-full bg-gradient-to-r from-accent via-accent to-accent/80 shadow-[0_0_12px_rgba(255,107,0,0.5)]"
        style={{
          width: `${progress}%`,
          transform: "translateZ(0)",
          willChange: "width",
        }}
      />
    </div>
  )
}
