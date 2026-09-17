"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

/**
 * The Position Map frame: a header strip, a docked rail, and a map that owns
 * everything else.
 *
 * This exists to stop the results page being a vertical stack of six cards
 * competing for the same space. The map is no longer a card among others — it
 * is the canvas, edge to edge, with no border, radius or padding of its own,
 * and the rail floats over its left boundary. Only the rail scrolls; the map
 * never moves out of view, which is the whole point of the layout.
 *
 * Below `lg` the rail becomes a bottom sheet over a full-height map — see
 * `sheet`, which the caller supplies already wrapped in vaul. The rail markup
 * itself is identical in both cases, so there is one source of rail content,
 * not two.
 */
export function PositionMapShell({
  title,
  subtitle,
  back,
  actions,
  rail,
  map,
  mapOverlay,
  sheet,
}: {
  title: ReactNode
  subtitle?: ReactNode
  back?: ReactNode
  actions?: ReactNode
  rail: ReactNode
  map: ReactNode
  /** Floating controls positioned over the canvas — date pill, map buttons. */
  mapOverlay?: ReactNode
  /** The below-lg bottom sheet. Rendered only at narrow widths. */
  sheet?: ReactNode
}) {
  const compact = useCompactLayout()
  const ref = useRef<HTMLDivElement | null>(null)
  const top = useViewportOffset(ref)

  return (
    <div
      className="mt-pm"
      ref={ref}
      // A custom property, not an inline `height`: the stylesheet owns the
      // height calculation and carries a sane fallback, so the page is still
      // laid out and scrollable if this measurement never arrives.
      style={top != null ? ({ "--mt-pm-top": `${top}px` } as React.CSSProperties) : undefined}
    >
      <header className="mt-pm-head">
        <div className="mt-pm-head-l">
          {back}
          <div style={{ minWidth: 0 }}>
            <div className="mt-pm-title">{title}</div>
            {subtitle && <div className="mt-pm-sub">{subtitle}</div>}
          </div>
        </div>
        {actions && <div className="mt-pm-head-r">{actions}</div>}
      </header>

      <div className="mt-pm-body" data-compact={compact || undefined}>
        {/* Rendered only when it is the real rail. At narrow widths the same
            content is inside `sheet`, and mounting both would run every
            data-fetching hook in the rail twice. */}
        {/* data-lenis-prevent: SmoothScroll wraps the whole app with Lenis and
            smoothWheel swallows wheel events, so a scrollable box that does not
            opt out can only be moved by dragging its scrollbar. Same convention
            the dropdown menus and modal bodies use. */}
        {!compact && (
          <aside className="mt-pm-rail" data-lenis-prevent>
            {rail}
          </aside>
        )}

        <div className="mt-pm-canvas">
          {/* An explicit wrapper rather than styling `> :first-child`: what the
              map renders into is the library's business, and a structural
              selector reaching into it would break silently the day that
              changes. */}
          <div className="mt-pm-mapwrap">{map}</div>
          {mapOverlay}
        </div>
      </div>

      {compact && sheet}
    </div>
  )
}

/**
 * Distance from the top of the viewport to this element, in px.
 *
 * Feeds --mt-pm-top so the shell can be exactly as tall as the space below the
 * dashboard's sticky header. Measured rather than hard-coded so it stays right
 * if that header ever changes height or gains a banner.
 *
 * `rect.top + scrollY` is the element's DOCUMENT offset, which is stable
 * whatever the current scroll position — `rect.top` alone would shrink as the
 * user scrolled and feed back into a height that grew every frame.
 */
function useViewportOffset(ref: React.RefObject<HTMLElement | null>): number | null {
  const [top, setTop] = useState<number | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const offset = el.getBoundingClientRect().top + window.scrollY
      setTop(Math.max(0, Math.round(offset)))
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [ref])

  return top
}

/**
 * True below the `lg` breakpoint (1024px).
 *
 * A media query rather than a container query, unlike the setup page: this
 * screen is a full-viewport workspace with no sidebar-driven width change to
 * account for, and the bottom sheet is positioned against the viewport.
 *
 * Starts false and corrects after mount so the server render and the first
 * client render agree — reading matchMedia during render would hydrate-mismatch
 * on any narrow device.
 */
export function useCompactLayout(): boolean {
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023.98px)")
    const sync = () => setCompact(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  return compact
}

/** A titled block inside the rail. The rail's only structural primitive. */
export function RailSection({
  title,
  aside,
  children,
  flush = false,
}: {
  title?: ReactNode
  aside?: ReactNode
  children: ReactNode
  /** Drops the horizontal padding — for lists that draw their own row dividers edge to edge. */
  flush?: boolean
}) {
  return (
    <section className={flush ? "mt-pm-sec flush" : "mt-pm-sec"}>
      {(title || aside) && (
        <div className="mt-pm-sec-h">
          <span className="mt-pm-sec-t">{title}</span>
          {aside}
        </div>
      )}
      {children}
    </section>
  )
}
