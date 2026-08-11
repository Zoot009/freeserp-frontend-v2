"use client"

import { useState } from "react"

/**
 * Small hover/focus tooltip matching this app's own design tokens, instead
 * of the native browser title="" tooltip (slow delay, OS-styled, easy to
 * miss). No new UI dependency — this page already uses plain inline styles
 * throughout rather than shadcn, so this stays consistent with that.
 */
export function Tooltip({
  label,
  children,
  side = "bottom",
}: {
  label: string
  children: React.ReactNode
  side?: "top" | "bottom"
}) {
  const [visible, setVisible] = useState(false)

  return (
    <span
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            [side === "bottom" ? "top" : "bottom"]: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--text, #0B0D12)",
            color: "var(--bg, #FFFFFF)",
            fontSize: 12,
            lineHeight: 1.4,
            padding: "7px 11px",
            borderRadius: "var(--r-sm, 6px)",
            maxWidth: 240,
            width: "max-content",
            whiteSpace: "normal",
            textAlign: "center",
            boxShadow: "var(--shadow-md, 0 6px 24px -8px rgba(11,13,18,0.25))",
            zIndex: 60,
            pointerEvents: "none",
          }}
        >
          {label}
        </span>
      )}
    </span>
  )
}
