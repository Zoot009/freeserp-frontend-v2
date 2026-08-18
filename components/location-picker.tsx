"use client"

import { useState } from "react"
import { Check, ChevronsUpDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Drawer, DrawerContent, DrawerTrigger, DrawerTitle, DrawerClose } from "@/components/ui/drawer"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  POPULAR_LOCATIONS,
  ALL_LOCATIONS,
  LOCATION_NAMES,
  type Location,
} from "@/lib/locations"
import { Flag } from "@/components/flag"

type Variant = "mono" | "default" | "dashboard"

interface LocationPickerProps {
  value: string
  onChange: (code: string) => void
  showFlags?: boolean
  variant?: Variant
  className?: string
}

export function LocationPicker(props: LocationPickerProps) {
  const isMobile = useIsMobile()
  // Render the drawer variant on mobile and the popover variant on desktop.
  // Both share the same list rendering — only the container differs.
  return isMobile ? <LocationPickerDrawer {...props} /> : <LocationPickerPopover {...props} />
}

function buildTriggerClass(variant: Variant, className?: string) {
  // The `dashboard` variant uses the dashboard's `.input` class (scoped to
  // `.fs-app`) so the trigger inherits the same tokens as nearby inputs in
  // the project modals — no Tailwind theme leak from the legacy editorial
  // palette.
  if (variant === "dashboard") {
    return cn("fs-location-trigger", className)
  }
  const base =
    variant === "mono"
      ? "w-full bg-card border border-border/50 px-4 py-3 font-mono text-sm text-foreground focus:outline-none focus:border-accent transition-colors flex items-center justify-between"
      : "w-full h-10 px-3 font-mono text-sm bg-background border border-input text-foreground focus:outline-none focus:ring-1 focus:ring-accent flex items-center justify-between"
  return cn(base, className)
}

function TriggerContents({ value, showFlags }: { value: string; showFlags: boolean }) {
  const selectedName = LOCATION_NAMES[value] ?? value.toUpperCase()
  return (
    <>
      <span className="truncate">
        {showFlags && <span className="mr-2 inline-flex align-middle"><Flag code={value} size={15} /></span>}
        {selectedName}
      </span>
      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </>
  )
}

// "All locations" used to repeat the seven markets from "Popular" verbatim, so
// the same country appeared twice in one list and a selected one drew two check
// marks. Popular stays a shortcut to the top of the list; everything else sorts
// alphabetically, which is the only order a 60-item country list can be scanned in
// (the source array is grouped by region, which reads as no order at all here).
const POPULAR_CODES = new Set(POPULAR_LOCATIONS.map((l) => l.code))
const OTHER_LOCATIONS: Location[] = ALL_LOCATIONS.filter((l) => !POPULAR_CODES.has(l.code)).sort((a, b) =>
  a.name.localeCompare(b.name),
)

/**
 * Renders the searchable country list. Same markup in both variants.
 * `mobileTouchTargets` bumps row heights so options are easy to tap on a
 * phone (each row is ~44px tall, matching iOS/Android tap-target guidance).
 */
function LocationCommand({
  value,
  onSelect,
  showFlags,
  mobileTouchTargets = false,
}: {
  value: string
  onSelect: (code: string) => void
  showFlags: boolean
  mobileTouchTargets?: boolean
}) {
  // The query is lifted out of cmdk so the list can change shape while typing:
  // a two-section list is a browsing aid, but once someone searches, "Popular"
  // and "All locations" just split the matches across two headed groups.
  const [query, setQuery] = useState("")
  const searching = query.trim().length > 0

  const itemClass = cn(
    "font-mono text-sm",
    mobileTouchTargets && "py-3 text-[15px]"
  )
  const renderItem = (l: Location) => (
    <CommandItem
      key={l.code}
      value={`${l.name} ${l.code}`}
      onSelect={() => onSelect(l.code)}
      className={itemClass}
    >
      {showFlags && <span className="mr-2 inline-flex"><Flag code={l.code} size={15} /></span>}
      <span className="flex-1">{l.name}</span>
      <Check className={cn("ml-2 h-4 w-4", value === l.code ? "opacity-100" : "opacity-0")} />
    </CommandItem>
  )

  return (
    <Command>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search country..."
        className={cn("font-mono text-sm", mobileTouchTargets && "h-12 text-[15px]")}
      />
      {/* A fixed cap rather than 50vh: on a desktop this list opens inside a
          modal, and half the viewport was tall enough that the popover flipped
          above its trigger and covered the field it belongs to. */}
      <CommandList
        className={cn(
          "overscroll-contain",
          mobileTouchTargets ? "max-h-[70vh]" : "max-h-[264px]"
        )}
      >
        <CommandEmpty>No location found.</CommandEmpty>
        {searching ? (
          <CommandGroup>{ALL_LOCATIONS.map(renderItem)}</CommandGroup>
        ) : (
          <>
            <CommandGroup heading="Popular">{POPULAR_LOCATIONS.map(renderItem)}</CommandGroup>
            <CommandGroup heading="All locations">{OTHER_LOCATIONS.map(renderItem)}</CommandGroup>
          </>
        )}
      </CommandList>
    </Command>
  )
}
/** Desktop / tablet (≥768px) — anchored popover under the trigger. */
function LocationPickerPopover({ value, onChange, showFlags = false, variant = "mono", className }: LocationPickerProps) {
  const [open, setOpen] = useState(false)
  // Forward a marker class to the portaled popover when we're in the dashboard
  // theme — the popover lives outside the .fs-app scope, so we re-skin it
  // through `.fs-location-popover` in dashboard.css.
  const popoverClass = cn(
    "p-0 w-[var(--radix-popover-trigger-width)] max-h-[60vh] z-[10010]",
    variant === "dashboard" && "fs-location-popover",
  )
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" role="combobox" aria-expanded={open} className={buildTriggerClass(variant, className)}>
          <TriggerContents value={value} showFlags={showFlags} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className={popoverClass}
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <LocationCommand
          value={value}
          onSelect={(code) => {
            onChange(code)
            setOpen(false)
          }}
          showFlags={showFlags}
        />
      </PopoverContent>
    </Popover>
  )
}

/** Mobile (<768px) — full-width bottom drawer with big tap targets. */
function LocationPickerDrawer({ value, onChange, showFlags = false, variant = "mono", className }: LocationPickerProps) {
  const [open, setOpen] = useState(false)
  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button type="button" role="combobox" aria-expanded={open} className={buildTriggerClass(variant, className)}>
          <TriggerContents value={value} showFlags={showFlags} />
        </button>
      </DrawerTrigger>
      <DrawerContent className={cn("z-[10010] max-h-[90vh]", variant === "dashboard" && "fs-location-popover")}>
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border/40">
          <DrawerTitle className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Select country
          </DrawerTitle>
          <DrawerClose className="p-2 -mr-2 text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </DrawerClose>
        </div>
        <div className="overflow-hidden pb-[env(safe-area-inset-bottom,16px)]">
          <LocationCommand
            value={value}
            onSelect={(code) => {
              onChange(code)
              setOpen(false)
            }}
            showFlags={showFlags}
            mobileTouchTargets
          />
        </div>
      </DrawerContent>
    </Drawer>
  )
}
