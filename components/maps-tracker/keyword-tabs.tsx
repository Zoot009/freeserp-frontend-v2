"use client"

import type { ScanKeyword } from "./types"

/** One keyword's worth of data at a time — never a mix. */
export function KeywordTabs({
  keywords,
  activeId,
  onChange,
}: {
  keywords: ScanKeyword[]
  activeId: string | null
  onChange: (id: string) => void
}) {
  if (keywords.length < 2) return null
  return (
    <div className="mt-kwtabs" role="tablist" aria-label="Keyword">
      {keywords.map((k) => (
        <button
          key={k.id}
          type="button"
          role="tab"
          className="mt-kwtab"
          aria-selected={k.id === activeId}
          onClick={() => onChange(k.id)}
        >
          {k.keyword}
          {k.solv != null && <span className="pct"> {k.solv.toFixed(0)}%</span>}
        </button>
      ))}
    </div>
  )
}
