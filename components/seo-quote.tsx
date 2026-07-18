"use client"

import { useMemo } from "react"
import { Icon } from "@/components/dashboard/icons"

// A rotating "SEO quote of the day" — gives the (multi-minute) competitor crawl
// wait some personality and a useful nudge instead of a bare spinner. One entry
// is chosen deterministically per calendar day, so it stays stable across the
// results page's polling re-renders rather than flickering to a new quote.
const SEO_QUOTES: { text: string; author?: string }[] = [
  { text: "Content is king.", author: "Bill Gates" },
  { text: "Google only loves you when everyone else loves you first.", author: "Wendy Piersall" },
  { text: "The best place to hide a dead body is page two of Google.", author: "SEO proverb" },
  { text: "Write for humans first, optimize for search engines second." },
  { text: "The goal isn't more traffic — it's the right traffic that converts." },
  { text: "Every page should answer a question someone is actually searching for." },
  { text: "Backlinks are votes. Earn them, don't buy them." },
  { text: "Page speed is a ranking factor and a conversion factor — fix it once, win twice." },
  { text: "A sharp title tag is the cheapest click-through boost you'll ever get." },
  { text: "Match the search intent and half your SEO work is already done." },
  { text: "Internal links spread authority — point your strong pages at your new ones." },
  { text: "Rankings are rented, not owned. Keep publishing." },
  { text: "The riches are in the niches — long-tail keywords convert." },
  { text: "Good SEO is just good UX that a crawler can read." },
  { text: "You can't optimize what you don't measure." },
]

export function SeoQuoteOfDay() {
  const quote = useMemo(() => {
    const now = new Date()
    const start = new Date(now.getFullYear(), 0, 0)
    const day = Math.floor((now.getTime() - start.getTime()) / 86_400_000)
    return SEO_QUOTES[day % SEO_QUOTES.length]
  }, [])

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 440,
        padding: "16px 18px",
        borderRadius: 14,
        background: "var(--bg-sub)",
        border: "1px solid var(--border)",
      }}
    >
      <div
        className="tiny"
        style={{
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontSize: 10,
          color: "var(--brand)",
          fontWeight: 700,
          marginBottom: 8,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Icon.spark /> SEO quote of the day
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.55, color: "var(--text)", fontStyle: "italic" }}>
        “{quote.text}”
      </div>
      {quote.author && (
        <div className="tiny muted" style={{ marginTop: 8 }}>
          — {quote.author}
        </div>
      )}
    </div>
  )
}
