"use client"

import { useState } from "react"
import { Icon } from "@/components/dashboard/icons"

export const MAX_KEYWORDS = 10

function normalize(k: string): string {
  return k.trim().toLowerCase().replace(/\s+/g, " ")
}

/**
 * Step 2 — what people type when they look for you.
 *
 * Same rules the old popover had: ten at most, a paste of comma- or
 * newline-separated text commits each line, and a duplicate flashes the chip
 * that already holds it rather than silently doing nothing.
 */
export function KeywordsStep({
  keywords,
  onChange,
}: {
  keywords: string[]
  onChange: (keywords: string[]) => void
}) {
  const [input, setInput] = useState("")
  const [flashIndex, setFlashIndex] = useState<number | null>(null)
  const full = keywords.length >= MAX_KEYWORDS

  function commit(raw: string, list: string[]): string[] {
    const value = raw.trim()
    if (!value || list.length >= MAX_KEYWORDS) return list
    const existingIndex = list.findIndex((k) => normalize(k) === normalize(value))
    if (existingIndex !== -1) {
      setFlashIndex(existingIndex)
      setTimeout(() => setFlashIndex(null), 600)
      return list
    }
    return [...list, value]
  }

  function commitInput() {
    if (!input.trim()) return
    // Paste of newline/comma-separated text commits each line.
    const parts = input.split(/[\n,]/).map((p) => p.trim()).filter(Boolean)
    let next = keywords
    for (const p of parts) next = commit(p, next)
    if (next !== keywords) onChange(next)
    setInput("")
  }

  return (
    <>
      <div className="row" style={{ gap: 6, alignItems: "stretch" }}>
        <input
          className="input"
          style={{ flex: 1 }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              commitInput()
            }
          }}
          placeholder={full ? `${MAX_KEYWORDS} of ${MAX_KEYWORDS} added` : "e.g. dentist near me"}
          aria-label="Add a keyword"
          disabled={full}
        />
        <button type="button" className="btn primary sm" onClick={commitInput} disabled={full} aria-label="Add keyword">
          <Icon.plus />
        </button>
      </div>

      {keywords.length > 0 && (
        <div className="row" style={{ gap: 5, marginTop: 10 }}>
          {keywords.map((k, i) => (
            <span
              key={k}
              className="chip"
              style={{
                gap: 6,
                // A duplicate isn't an error, it's already done — point at the
                // chip that has it instead of showing a message.
                outline: flashIndex === i ? "2px solid var(--brand)" : undefined,
                transition: "outline-color .2s ease",
              }}
            >
              {k}
              <button
                type="button"
                onClick={() => onChange(keywords.filter((_, idx) => idx !== i))}
                aria-label={`Remove ${k}`}
                style={{ border: "none", background: "none", padding: 0, color: "inherit", display: "inline-flex", cursor: "pointer" }}
              >
                <Icon.close />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="mt-step-hint">
        {full
          ? `That's the maximum of ${MAX_KEYWORDS}. Remove one to add another.`
          : `Each keyword is searched from every point on the grid. Up to ${MAX_KEYWORDS}.`}
      </div>
    </>
  )
}
