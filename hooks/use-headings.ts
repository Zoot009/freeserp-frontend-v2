"use client"

import { useEffect, useState } from "react"

export interface Heading {
  id: string
  text: string
  level: number
}

export function useHeadings() {
  const [headings, setHeadings] = useState<Heading[]>([])
  const [activeId, setActiveId] = useState<string>("")

  useEffect(() => {
    // Extract all headings from the article
    const article = document.querySelector("article")
    if (!article) return

    const elements = article.querySelectorAll("h2, h3, h4")
    const headingData: Heading[] = Array.from(elements).map((element) => {
      // Generate ID if it doesn't exist
      if (!element.id) {
        const id = element.textContent
          ?.toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "") || ""
        element.id = id
      }

      return {
        id: element.id,
        text: element.textContent || "",
        level: parseInt(element.tagName.substring(1)),
      }
    })

    setHeadings(headingData)

    // Track active heading based on scroll position
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        })
      },
      {
        rootMargin: "-80px 0px -80% 0px",
      }
    )

    elements.forEach((element) => observer.observe(element))

    return () => {
      elements.forEach((element) => observer.unobserve(element))
    }
  }, [])

  return { headings, activeId }
}
