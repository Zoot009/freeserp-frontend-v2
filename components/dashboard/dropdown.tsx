"use client"

import { useEffect, useRef, useState } from "react"

export type DropdownOption = {
  value: string
  label: React.ReactNode
  disabled?: boolean
}

/**
 * Custom dropdown — a styled replacement for native <select>, whose open menu
 * can't be themed with CSS. Visuals come from the `.dd-*` classes in
 * app/dashboard.css (globally scoped, with light-theme fallbacks, so it works
 * on auth/marketing pages too). Used by the language switcher, the
 * schedule-frequency picker, and every other dropdown so they all match.
 */
export function Dropdown({
  value,
  options,
  onChange,
  disabled,
  title,
  ariaLabel,
  placeholder,
  block,
  menuAlign = "right",
  className = "",
  style,
}: {
  value: string
  options: DropdownOption[]
  onChange: (value: string) => void
  disabled?: boolean
  title?: string
  ariaLabel?: string
  /** Trigger text when `value` matches no option (e.g. nothing chosen yet). */
  placeholder?: React.ReactNode
  /** Full-width trigger, for use as a form field. */
  block?: boolean
  menuAlign?: "left" | "right"
  className?: string
  style?: React.CSSProperties
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value)

  // Close on outside click WITHOUT swallowing it — a blocking overlay would
  // force users to click twice (once to dismiss, once for their real target).
  // pointerdown fires before the outside element's click, so the menu is gone
  // by the time that click lands.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  return (
    <div
      ref={rootRef}
      className={className}
      style={{ position: "relative", display: block ? "block" : "inline-block", ...style }}
    >
      <button
        type="button"
        className="dd-trigger"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={block ? { width: "100%", justifyContent: "space-between" } : undefined}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {current?.label ?? placeholder ?? value}
        </span>
        <span className="dd-caret" data-open={open} aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {open && (
        <div
          className="dd-menu"
          role="listbox"
          aria-label={ariaLabel}
          // Lenis (the site-wide smooth-scroll wrapper) hijacks wheel events,
          // which would leave this inner list unscrollable without this opt-out.
          data-lenis-prevent
          style={{ zIndex: 50, ...(menuAlign === "left" ? { left: 0, right: "auto" } : null) }}
        >
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={opt.value === value}
                className="dd-item"
                data-active={opt.value === value}
                disabled={opt.disabled}
                onClick={() => {
                  setOpen(false)
                  if (opt.value !== value) onChange(opt.value)
                }}
              >
                {opt.label}
                {opt.value === value && (
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
