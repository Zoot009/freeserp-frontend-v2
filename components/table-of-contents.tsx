"use client"

import { useHeadings } from "@/hooks/use-headings"

export function TableOfContents() {
  const { headings, activeId } = useHeadings()

  if (headings.length === 0) {
    return null
  }

  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      const offset = 100 // Account for fixed header + some breathing room
      const elementPosition = element.getBoundingClientRect().top
      const offsetPosition = elementPosition + window.pageYOffset - offset

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      })
    }
  }

  return (
    <aside className="hidden xl:block fixed left-8 top-24 w-80 max-h-[calc(100vh-8rem)]">
      <div className="bg-background border border-border/40 rounded-sm shadow-lg overflow-hidden flex flex-col max-h-full">
        {/* Sidebar Header */}
        <div className="bg-card/50 border-b border-border/30 px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1 h-4 bg-accent rounded-full"></div>
            <h2 className="font-[var(--font-bebas)] text-xl tracking-tight uppercase text-foreground">
              Quick Links
            </h2>
          </div>
          <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70 ml-3">
            Jump to section
          </p>
        </div>

        {/* Sidebar Content */}
        <nav className="overflow-y-auto px-4 py-4 flex-1 scrollbar-thin scrollbar-thumb-border/50 scrollbar-track-transparent">
          <ul className="space-y-1">
            {headings.map((heading) => (
              <li key={heading.id}>
                <button
                  onClick={() => scrollToHeading(heading.id)}
                  className={`
                    w-full text-left py-2.5 px-3 font-mono text-[10px] uppercase tracking-widest transition-all duration-200 rounded-sm
                    ${heading.level === 2 ? "" : heading.level === 3 ? "pl-5" : heading.level === 4 ? "pl-7" : "pl-9"}
                    ${
                      activeId === heading.id
                        ? "text-accent border-l-2 border-accent bg-accent/10 shadow-sm"
                        : "text-muted-foreground hover:text-foreground border-l-2 border-transparent hover:border-accent/30 hover:bg-card/50"
                    }
                  `}
                >
                  <span className="block break-words leading-relaxed">{heading.text}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Sidebar Footer */}
        <div className="bg-card/30 border-t border-border/30 px-6 py-3 flex-shrink-0">
          <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/50 text-center">
            {headings.length} Section{headings.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
    </aside>
  )
}
