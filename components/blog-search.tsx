"use client"

import { useState } from "react"
import { Search } from "lucide-react"

interface BlogSearchProps {
  onSearch?: (query: string) => void
  placeholder?: string
}

export function BlogSearch({ onSearch, placeholder = "Search articles..." }: BlogSearchProps) {
  const [query, setQuery] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (onSearch) {
      onSearch(query)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-10 pr-4 py-2.5 bg-background border border-border/40 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/20 font-mono text-xs text-foreground placeholder:text-muted-foreground/60 transition-colors"
        />
      </div>
    </form>
  )
}
