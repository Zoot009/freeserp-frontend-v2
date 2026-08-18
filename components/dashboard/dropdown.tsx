"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

export type DropdownOption = {
  value: string
  label: React.ReactNode
  /** Shown on the trigger instead of `label`. For options whose menu row carries
   *  a note ("· default in United States") that only makes sense while choosing —
   *  on the closed trigger it is just a longer string to truncate. */
  triggerLabel?: React.ReactNode
  disabled?: boolean
}

/** Space kept between the trigger and its menu, and between the menu and the
 *  edge of the viewport it would otherwise touch. */
const MENU_GAP = 6
const VIEWPORT_MARGIN = 8
const MENU_MAX_HEIGHT = 320
/** Under this much room below the trigger, opening downwards isn't worth it. */
const MIN_USABLE_HEIGHT = 200
/** How much MORE room the other side must offer before the menu flips there.
 *  Without a margin, a trigger sitting near the middle of the viewport picks its
 *  side on a few pixels, so two adjacent fields open in opposite directions. */
const FLIP_ADVANTAGE = 80

// useLayoutEffect warns when a client component is server-rendered, which every
// page here does. The measurement it guards only exists in the browser anyway.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect

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
  portal = false,
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
  /**
   * Escape the nearest scrolling ancestor by rendering the menu in a portal,
   * positioned against the trigger. Needed inside a modal body, a `.tbl-scroll`
   * wrapper, or anything else with `overflow` set — an absolutely positioned
   * menu is clipped by those, so the options below the fold are unreachable.
   */
  portal?: boolean
  menuAlign?: "left" | "right"
  className?: string
  style?: React.CSSProperties
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value)

  // Close on outside click WITHOUT swallowing it — a blocking overlay would
  // force users to click twice (once to dismiss, once for their real target).
  // pointerdown fires before the outside element's click, so the menu is gone
  // by the time that click lands.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      // The portaled menu is not inside rootRef, so it has to be tested
      // separately — otherwise pointerdown on an option unmounts the menu
      // before its own click can fire, and choosing anything is impossible.
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
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

  // Portal target: the nearest `.fs-app`, not <body>. The dashboard's colour
  // tokens and text utilities are scoped to that class, so a menu portaled past
  // it renders in the light palette on a dark page. Fixed positioning still
  // escapes the scroll container from there.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const [portalStyle, setPortalStyle] = useState<React.CSSProperties | null>(null)

  useIsomorphicLayoutEffect(() => {
    if (!portal || !open) {
      setPortalStyle(null)
      return
    }
    setPortalTarget(rootRef.current?.closest<HTMLElement>(".fs-app") ?? document.body)

    // The side is chosen once, when the menu opens, and held until it closes.
    // Recomputing it on every scroll event made an open menu jump from below the
    // trigger to above it mid-scroll, which reads as the UI misbehaving rather
    // than as the menu staying in view.
    let side: "top" | "bottom" | null = null

    const place = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const r = trigger.getBoundingClientRect()
      const below = window.innerHeight - r.bottom - MENU_GAP - VIEWPORT_MARGIN
      const above = r.top - MENU_GAP - VIEWPORT_MARGIN
      // Down is the default; the menu only goes up when down is genuinely too
      // cramped AND up is clearly better. Otherwise it stays down and shortens.
      side ??= below < MIN_USABLE_HEIGHT && above > below + FLIP_ADVANTAGE ? "top" : "bottom"
      const flip = side === "top"
      setPortalStyle({
        position: "fixed",
        left: r.left,
        width: r.width,
        // .dd-menu carries `min-width: 100%` for the non-portaled case. Once the
        // menu is `position: fixed`, that 100% resolves against the VIEWPORT, and
        // min-width outranks width — so the menu stretched across the whole page
        // no matter what width we asked for. Pin the minimum to the trigger too.
        minWidth: r.width,
        maxHeight: Math.min(MENU_MAX_HEIGHT, Math.max(flip ? above : below, MIN_USABLE_HEIGHT)),
        ...(flip
          ? { bottom: window.innerHeight - r.top + MENU_GAP, top: "auto" }
          : { top: r.bottom + MENU_GAP, bottom: "auto" }),
        zIndex: 10010,
      })
    }
    place()
    // Capture phase: the trigger's scrolling ancestor is a div, and a scroll on
    // it doesn't bubble to window.
    window.addEventListener("scroll", place, true)
    window.addEventListener("resize", place)
    return () => {
      window.removeEventListener("scroll", place, true)
      window.removeEventListener("resize", place)
    }
  }, [portal, open])

  // A menu of 25 languages opens wherever the browser left it. Bring the current
  // one into view, the way a native select does.
  //
  // `portalStyle` is in the deps because a portaled menu does not exist on the
  // render that opens it — it waits for the layout effect to measure the trigger,
  // so menuRef is still null the first time through. The ref keeps it to one
  // scroll per open, since portalStyle also changes on every reposition.
  const scrolledRef = useRef(false)
  useEffect(() => {
    if (!open) {
      scrolledRef.current = false
      return
    }
    if (scrolledRef.current) return
    const active = menuRef.current?.querySelector<HTMLElement>('[data-active="true"]')
    if (!active) return
    scrolledRef.current = true
    active.scrollIntoView({ block: "nearest" })
  }, [open, portalStyle])

  const menu = (
    <div
      ref={menuRef}
      className="dd-menu"
      role="listbox"
      aria-label={ariaLabel}
      // Lenis (the site-wide smooth-scroll wrapper) hijacks wheel events,
      // which would leave this inner list unscrollable without this opt-out.
      data-lenis-prevent
      style={
        portalStyle ?? {
          zIndex: 50,
          ...(menuAlign === "left" ? { left: 0, right: "auto" } : null),
        }
      }
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
  )

  return (
    <div
      ref={rootRef}
      className={className}
      style={{ position: "relative", display: block ? "block" : "inline-block", ...style }}
    >
      <button
        ref={triggerRef}
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
          {current?.triggerLabel ?? current?.label ?? placeholder ?? value}
        </span>
        <span className="dd-caret" data-open={open} aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {/* Placement runs in a layout effect, so the portaled menu waits one pass
          for its coordinates rather than flashing at the top-left corner. */}
      {open && (portal ? portalTarget && portalStyle && createPortal(menu, portalTarget) : menu)}
    </div>
  )
}
