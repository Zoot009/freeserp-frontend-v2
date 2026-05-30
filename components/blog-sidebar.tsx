"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

interface TableOfContentsItem {
  id: string
  text: string
  level: number
}

interface BlogSidebarProps {
  tableOfContents?: TableOfContentsItem[]
  quickLinks?: Array<{ text: string; href: string }>
}

export function BlogSidebar({ tableOfContents = [], quickLinks = [] }: BlogSidebarProps) {
  const [activeId, setActiveId] = useState<string>("")

  useEffect(() => {
    if (tableOfContents.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        })
      },
      { rootMargin: "-20% 0px -80% 0px" }
    )

    tableOfContents.forEach(({ id }) => {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    })

    return () => observer.disconnect()
  }, [tableOfContents])

  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      const offset = 100
      const elementPosition = element.getBoundingClientRect().top
      const offsetPosition = elementPosition + window.pageYOffset - offset

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth"
      })
    }
  }

  return (
    <aside className="sticky top-20 space-y-8">
      {/* Quick Links */}
      {quickLinks.length > 0 && (
        <div className="bg-card/30 border border-border/40 p-6">
          <h3 className="font-mono text-[10px] uppercase tracking-widest text-foreground mb-4">
            Quick links
          </h3>
          <nav className="space-y-2">
            {quickLinks.map((link, index) => (
              <Link
                key={index}
                href={link.href}
                className="block font-mono text-xs text-muted-foreground hover:text-accent transition-colors leading-relaxed"
              >
                {link.text}
              </Link>
            ))}
          </nav>
        </div>
      )}

      {/* Table of Contents */}
      {tableOfContents.length > 0 && (
        <div className="bg-card/30 border border-border/40 p-6">
          <h3 className="font-mono text-[10px] uppercase tracking-widest text-foreground mb-4">
            Table of Contents
          </h3>
          <nav className="space-y-2">
            {tableOfContents.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollToHeading(item.id)}
                className={`block w-full text-left font-mono text-xs transition-colors leading-relaxed ${
                  activeId === item.id
                    ? "text-accent"
                    : "text-muted-foreground hover:text-accent"
                } ${item.level === 3 ? "pl-4" : ""}`}
              >
                {item.text}
              </button>
            ))}
          </nav>
        </div>
      )}

      {/* Categories/Tags */}
      <div className="bg-card/30 border border-border/40 p-6">
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-foreground mb-4">
          Popular Topics
        </h3>
        <div className="flex flex-wrap gap-2">
          {["SEO", "Technical SEO", "Content Strategy", "Digital Marketing", "Link Building"].map((tag) => (
            <Link
              key={tag}
              href={`/blog?category=${tag.toLowerCase().replace(/\s+/g, "-")}`}
              className="px-3 py-1 bg-background border border-border/40 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent hover:border-accent/40 transition-colors"
            >
              {tag}
            </Link>
          ))}
        </div>
      </div>
    </aside>
  )
}
