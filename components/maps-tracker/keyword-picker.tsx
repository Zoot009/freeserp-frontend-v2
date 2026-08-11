"use client"

import { useEffect, useRef, useState } from "react"
import { Search as SearchIcon } from "lucide-react"
import { Icon } from "@/components/dashboard/icons"

const MAX_KEYWORDS = 10

function normalize(k: string): string {
  return k.trim().toLowerCase().replace(/\s+/g, " ")
}

export function KeywordPicker({ keywords, onChange }: { keywords: string[]; onChange: (keywords: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState("")
  const [flashIndex, setFlashIndex] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  function commit(raw: string) {
    const value = raw.trim()
    if (!value || keywords.length >= MAX_KEYWORDS) return
    const existingIndex = keywords.findIndex((k) => normalize(k) === normalize(value))
    if (existingIndex !== -1) {
      setFlashIndex(existingIndex)
      setTimeout(() => setFlashIndex(null), 600)
      return
    }
    onChange([...keywords, value])
  }

  function commitInput() {
    if (!input.trim()) return
    // Paste of newline/comma-separated text commits each line.
    const parts = input.split(/[\n,]/).map((p) => p.trim()).filter(Boolean)
    for (const p of parts) commit(p)
    setInput("")
  }

  function remove(index: number) {
    onChange(keywords.filter((_, i) => i !== index))
  }

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-block" }}>
      <button type="button" className="dd-trigger" onClick={() => setOpen((v) => !v)} aria-haspopup="dialog" aria-expanded={open}>
        <SearchIcon size={14} />
        <span>{keywords.length === 0 ? "No keywords" : `${keywords.length} keyword${keywords.length === 1 ? "" : "s"}`}</span>
        <span className="dd-caret" data-open={open} aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="dd-menu" role="dialog" data-lenis-prevent style={{ zIndex: 50, width: 360, padding: 12 }}>
          <div className="row" style={{ gap: 6, marginBottom: 8 }}>
            <input
              className="input"
              style={{ flex: 1 }}
              placeholder="Enter keywords"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault()
                  commitInput()
                }
              }}
              disabled={keywords.length >= MAX_KEYWORDS}
              autoFocus
            />
            <button type="button" className="btn primary sm" onClick={commitInput} disabled={!input.trim() || keywords.length >= MAX_KEYWORDS} aria-label="Add keyword">
              <Icon.plus />
            </button>
          </div>

          {keywords.length >= MAX_KEYWORDS && (
            <div className="tiny muted" style={{ marginBottom: 8 }}>{MAX_KEYWORDS} of {MAX_KEYWORDS} keywords</div>
          )}

          {keywords.length === 0 ? (
            <div className="tiny muted" style={{ padding: "12px 0" }}>
              No keywords yet. Add one to run a scan.
            </div>
          ) : (
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {keywords.map((k, i) => (
                <span
                  key={`${k}-${i}`}
                  className="chip"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    background: flashIndex === i ? "var(--warn-soft, rgba(234,179,8,0.15))" : undefined,
                    transition: "background 0.2s",
                  }}
                >
                  {k}
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    aria-label={`Remove ${k}`}
                    style={{ display: "inline-flex", background: "none", border: "none", cursor: "pointer", padding: 0, color: "inherit" }}
                  >
                    <Icon.close />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
