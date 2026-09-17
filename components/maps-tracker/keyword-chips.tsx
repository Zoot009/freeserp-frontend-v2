"use client"

import type { ScanKeyword } from "./types"

/**
 * One keyword's worth of data at a time — never a mix.
 *
 * Replaces the tab strip. Tabs imply a small fixed set on one line; a scan can
 * carry ten keywords, and at 380px of rail they have to wrap. Chips wrap
 * honestly, tabs would either overflow or shrink the text to nothing.
 *
 * Unlike the old tab strip this renders for a single keyword too. With tabs, a
 * lone tab was noise; as a chip it is the label that tells you which keyword
 * every number below belongs to, which the rail otherwise never says.
 */
export function KeywordChips({
  keywords,
  activeId,
  onChange,
}: {
  keywords: ScanKeyword[]
  activeId: string | null
  onChange: (id: string) => void
}) {
  if (keywords.length === 0) return null

  return (
    <div className="mt-kwchips" role="tablist" aria-label="Keyword">
      {keywords.map((k) => {
        const selected = k.id === activeId
        return (
          <button
            key={k.id}
            type="button"
            role="tab"
            className="mt-kwchip"
            aria-selected={selected}
            // A lone chip is a label, not a control — nothing to switch to.
            disabled={keywords.length === 1}
            onClick={() => onChange(k.id)}
          >
            <span className="kw">{k.keyword}</span>
            {k.solv != null && <span className="pct">{k.solv.toFixed(0)}%</span>}
          </button>
        )
      })}
    </div>
  )
}
