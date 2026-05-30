"use client"

import { useEffect, useState } from "react"

export function ReadingProgress() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let rafId: number | null = null

    const updateProgress = () => {
      // Cancel any pending animation frame
      if (rafId) {
        cancelAnimationFrame(rafId)
      }

      // Use requestAnimationFrame for smooth updates
      rafId = requestAnimationFrame(() => {
        // Get the article element for more accurate progress tracking
        const article = document.querySelector("article")
        if (!article) {
          // Fallback to full document if article not found
          const scrollTop = window.scrollY
          const docHeight = document.documentElement.scrollHeight - window.innerHeight
          const scrollPercent = (scrollTop / docHeight) * 100
          setProgress(scrollPercent)
          return
        }

        // Calculate progress based on article position
        const articleTop = article.offsetTop
        const articleHeight = article.offsetHeight
        const scrollTop = window.scrollY
        const windowHeight = window.innerHeight

        // Calculate how far into the article we've scrolled
        const articleStart = articleTop - windowHeight * 0.2 // Start counting when article is 20% visible
        const articleEnd = articleTop + articleHeight

        if (scrollTop < articleStart) {
          setProgress(0)
        } else if (scrollTop > articleEnd) {
          setProgress(100)
        } else {
          const scrolledIntoArticle = scrollTop - articleStart
          const totalArticleScroll = articleEnd - articleStart
          const scrollPercent = (scrolledIntoArticle / totalArticleScroll) * 100
          setProgress(Math.min(100, Math.max(0, scrollPercent)))
        }
      })
    }

    // Update on scroll - passive listener for better performance
    window.addEventListener("scroll", updateProgress, { passive: true })
    // Update on mount and resize
    updateProgress()
    window.addEventListener("resize", updateProgress)

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId)
      }
      window.removeEventListener("scroll", updateProgress)
      window.removeEventListener("resize", updateProgress)
    }
  }, [])

  return (
    <div className="fixed top-14 left-0 right-0 z-50 h-[3px] bg-background/50">
      <div
        className="h-full bg-gradient-to-r from-accent via-accent to-accent/80 shadow-[0_0_12px_rgba(255,107,0,0.5)]"
        style={{ 
          width: `${progress}%`,
          transform: 'translateZ(0)', // Force GPU acceleration for smoother animation
          willChange: 'width'
        }}
      />
    </div>
  )
}
