"use client"

/**
 * Auto-check schedule control: a switch showing the live state, which opens a
 * small anchored menu of cadences when clicked. Picking one applies immediately
 * (including "Off"), so there is no confirmation popup in the way.
 *
 * Lifted out of the Google project page so the YouTube tracker uses the SAME
 * control rather than a second one. YouTube had a plain Dropdown, which put the
 * schedule in the same visual class as a keyword filter — and a copy of this
 * would have been two schedule controls drifting apart the moment either was
 * touched, which is how the trackers diverged in the first place.
 *
 * The labels are props. The two pages name their cadences from different
 * translation namespaces, and the component has no business choosing between
 * them.
 */

import { useEffect, useRef, useState } from "react"
import { Icon } from "@/components/dashboard/icons"

export function ScheduleToggle({
  enabled,
  frequency,
  busy,
  choices,
  labelFor,
  offLabel,
  title,
  onPick,
}: {
  enabled: boolean
  frequency: number
  busy: boolean
  /** Cadences offered when switching the schedule on, in the order listed. */
  choices: number[]
  labelFor: (hours: number) => string
  offLabel: string
  title: string
  onPick: (choice: number | "off") => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Close on outside click WITHOUT swallowing it (pointerdown fires before the
  // outside element's click), matching the shared Dropdown's behaviour.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const choose = (choice: number | "off") => {
    setOpen(false)
    onPick(choice)
  }

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-expanded={open}
        className={"auto-toggle" + (enabled ? " on" : "")}
        disabled={busy}
        title={title}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="track" aria-hidden><span className="knob" /></span>
        <span>{enabled ? labelFor(frequency) : offLabel}</span>
      </button>
      {open && (
        <div className="dd-menu" role="listbox" aria-label={title} data-lenis-prevent style={{ zIndex: 50 }}>
          <button
            type="button"
            role="option"
            aria-selected={!enabled}
            className="dd-item"
            data-active={!enabled}
            onClick={() => choose("off")}
          >
            {offLabel}
            {!enabled && <Icon.check size={13} />}
          </button>
          {choices.map((h) => {
            const active = enabled && frequency === h
            return (
              <button
                key={h}
                type="button"
                role="option"
                aria-selected={active}
                className="dd-item"
                data-active={active}
                onClick={() => choose(h)}
              >
                {labelFor(h)}
                {active && <Icon.check size={13} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
