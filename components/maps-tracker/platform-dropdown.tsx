"use client"

import { useEffect, useRef, useState } from "react"
import { Compass, Sparkles, Bot, MessageCircle, Zap } from "lucide-react"

// Static list — only Google Maps is real. The other six are a visible
// roadmap signal (spec §10.2), same treatment the sidebar gives its own
// "Soon" items: shown, not hidden, not interactive.
const PLATFORMS = [
  { key: "GOOGLE_MAPS", label: "Google Maps", icon: "G", enabled: true },
  { key: "APPLE_MAPS", label: "Apple Maps", icon: "", enabled: false },
  { key: "GOOGLE_AI_OVERVIEWS", label: "Google AI Overviews", icon: "overview", enabled: false },
  { key: "GOOGLE_GEMINI", label: "Google Gemini", icon: "gemini", enabled: false },
  { key: "GOOGLE_AI_MODE", label: "Google AI Mode", icon: "aimode", enabled: false },
  { key: "CHATGPT", label: "ChatGPT", icon: "chatgpt", enabled: false },
  { key: "GROK", label: "Grok", icon: "grok", enabled: false },
] as const

function PlatformIcon({ platformKey }: { platformKey: string }) {
  switch (platformKey) {
    case "GOOGLE_MAPS":
      return <span style={{ fontWeight: 700, color: "#4285F4" }}>G</span>
    case "APPLE_MAPS":
      return <Compass size={14} />
    case "GOOGLE_AI_OVERVIEWS":
    case "GOOGLE_GEMINI":
      return <Sparkles size={14} />
    case "GOOGLE_AI_MODE":
      return <Zap size={14} />
    case "CHATGPT":
      return <Bot size={14} />
    default:
      return <MessageCircle size={14} />
  }
}

export function PlatformDropdown() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-block" }}>
      <button type="button" className="dd-trigger" onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open}>
        <PlatformIcon platformKey="GOOGLE_MAPS" />
        <span className="dd-caret" data-open={open} aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {open && (
        <div className="dd-menu" role="listbox" style={{ zIndex: 50, minWidth: 220 }}>
          {PLATFORMS.map((p) => (
            <div
              key={p.key}
              role="option"
              aria-selected={p.key === "GOOGLE_MAPS"}
              aria-disabled={!p.enabled}
              className="dd-item"
              data-active={p.key === "GOOGLE_MAPS"}
              style={!p.enabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
              onClick={() => p.enabled && setOpen(false)}
            >
              <span className="row" style={{ gap: 8, alignItems: "center" }}>
                <PlatformIcon platformKey={p.key} />
                {p.label}
              </span>
              {!p.enabled && (
                <span className="chip outline" style={{ marginLeft: "auto", fontSize: 10 }}>
                  Soon
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
