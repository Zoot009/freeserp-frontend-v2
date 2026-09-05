"use client"

import { useEffect, useRef, useState } from "react"
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
  searchLocations,
  type Location,
} from "@/lib/locations"
import { Flag } from "@/components/flag"

type Variant = "mono" | "default" | "dashboard"

interface LocationPickerProps {
  value: string
  /**
   * The second argument carries the full selection, so a caller that needs the
   * containing country (e.g. to localise Google autocomplete, which only accepts
   * a 2-letter `gl`) can read it. Optional and additive — existing callers that
   * take only the code are unaffected.
   */
  onChange: (code: string, loc?: Location) => void
  showFlags?: boolean
  variant?: Variant
  className?: string
  /**
   * Display name for `value` when it is a sub-country market. A city is stored
   * as a bare DataForSEO code ("1026201"), which LOCATION_NAMES cannot name — so
   * a caller rendering an already-saved keyword passes its label here. The
   * picker also remembers whatever the user selects during this session, so the
   * add-keyword flow needs nothing.
   */
  valueLabel?: string | null
  /**
   * Trigger text when `value` is empty — i.e. nothing is selected yet. The
   * add-keyword flow uses this: when we can't place the visitor by IP there is
   * no fallback market, so the picker asks for one outright rather than
   * pretending a country was chosen.
   */
  placeholder?: string
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

function TriggerContents({
  value,
  showFlags,
  label,
  countryIso,
  placeholder,
}: {
  value: string
  showFlags: boolean
  label?: string | null
  countryIso?: string | null
  placeholder?: string
}) {
  // Nothing selected: show the prompt, and no flag — a globe next to "Select a
  // location" reads as a chosen "worldwide" market, which is not a thing here.
  const empty = !value
  // A numeric value is a sub-country code, which has no name of its own here —
  // fall back to the code rather than upper-casing digits into nonsense.
  const selectedName = label ?? LOCATION_NAMES[value] ?? value.toUpperCase()
  return (
    <>
      <span className={cn("truncate", empty && "opacity-60")}>
        {showFlags && !empty && (
          <span className="mr-2 inline-flex align-middle">
            <Flag code={countryIso ?? value} size={15} />
          </span>
        )}
        {empty ? placeholder ?? "Select a location" : selectedName}
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
  onSelect: (loc: Location) => void
  showFlags: boolean
  mobileTouchTargets?: boolean
}) {
  // The query is lifted out of cmdk so the list can change shape while typing:
  // a two-section list is a browsing aid, but once someone searches, "Popular"
  // and "All locations" just split the matches across two headed groups.
  const [query, setQuery] = useState("")
  const searching = query.trim().length > 0

  // Below country level the catalogue is ~197k rows, so it is searched on the
  // server rather than shipped. Countries stay local: they are the default view
  // and the common case, and making them wait on a round trip would be a
  // regression for everyone who just wants "United Kingdom".
  const [remote, setRemote] = useState<Location[]>([])
  const [loading, setLoading] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setRemote([])
      setLoading(false)
      return
    }
    const mine = ++seq.current
    const ctrl = new AbortController()
    setLoading(true)
    // 200ms is below the threshold where typing feels laggy but still collapses
    // a burst of keystrokes into one request.
    const t = setTimeout(async () => {
      const rows = await searchLocations(q, { signal: ctrl.signal })
      // Ignore a slow response that lost the race to a newer query, or the list
      // flickers back to stale results after the user has typed further.
      if (mine === seq.current) {
        setRemote(rows)
        setLoading(false)
      }
    }, 200)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [query])

  // Countries that match locally, so "united" still answers instantly and the
  // server results (cities, postcodes) append underneath.
  const localMatches = searching
    ? ALL_LOCATIONS.filter((l) => l.name.toLowerCase().includes(query.trim().toLowerCase()))
    : []
  const localCodes = new Set(localMatches.map((l) => l.code))
  const remoteMatches = remote.filter((l) => !localCodes.has(l.code))

  const itemClass = cn(
    "font-mono text-sm",
    mobileTouchTargets && "py-3 text-[15px]"
  )
  const renderItem = (l: Location) => (
    <CommandItem
      key={l.code}
      value={`${l.name} ${l.code}`}
      onSelect={() => onSelect(l)}
      className={itemClass}
    >
      {showFlags && (
        <span className="mr-2 inline-flex">
          <Flag code={l.countryIso ?? l.code} size={15} />
        </span>
      )}
      {/* Never truncated. DataForSEO ships no popularity signal, so "London"
          is genuinely ambiguous between England, Ontario and Ohio — the full
          "London,Ohio,United States" is what lets the user tell them apart. */}
      <span className="flex-1">{l.name}</span>
      <Check className={cn("ml-2 h-4 w-4", value === l.code ? "opacity-100" : "opacity-0")} />
    </CommandItem>
  )

  // shouldFilter={false}: this list is already filtered — countries locally,
  // cities and postcodes by the server. Leaving cmdk's own matcher on would
  // re-filter the server's results against its word-boundary scoring and
  // silently drop rows it had already decided were the best matches.
  return (
    <Command shouldFilter={false}>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search country, city or postcode..."
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
        <CommandEmpty>{loading ? "Searching\u2026" : "No location found."}</CommandEmpty>
        {searching ? (
          <>
            {localMatches.length > 0 && (
              <CommandGroup heading="Countries">{localMatches.map(renderItem)}</CommandGroup>
            )}
            {remoteMatches.length > 0 && (
              <CommandGroup heading="Cities & postcodes">{remoteMatches.map(renderItem)}</CommandGroup>
            )}
          </>
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
function LocationPickerPopover({ value, onChange, showFlags = false, variant = "mono", className, valueLabel, placeholder }: LocationPickerProps) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<Location | null>(null)
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
          <TriggerContents
            value={value}
            showFlags={showFlags}
            label={valueLabel ?? (picked?.code === value ? picked.name : null)}
            countryIso={picked?.code === value ? picked.countryIso : null}
            placeholder={placeholder}
          />
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
          onSelect={(loc) => {
            // Remember it so the trigger can name a city: `value` alone is a
            // bare DataForSEO code and nothing local can resolve it.
            setPicked(loc)
            onChange(loc.code, loc)
            setOpen(false)
          }}
          showFlags={showFlags}
        />
      </PopoverContent>
    </Popover>
  )
}

/** Mobile (<768px) — full-width bottom drawer with big tap targets. */
function LocationPickerDrawer({ value, onChange, showFlags = false, variant = "mono", className, valueLabel, placeholder }: LocationPickerProps) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<Location | null>(null)
  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button type="button" role="combobox" aria-expanded={open} className={buildTriggerClass(variant, className)}>
          <TriggerContents
            value={value}
            showFlags={showFlags}
            label={valueLabel ?? (picked?.code === value ? picked.name : null)}
            countryIso={picked?.code === value ? picked.countryIso : null}
            placeholder={placeholder}
          />
        </button>
      </DrawerTrigger>
      <DrawerContent className={cn("z-[10010] max-h-[90vh]", variant === "dashboard" && "fs-location-popover")}>
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border/40">
          <DrawerTitle className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Select location
          </DrawerTitle>
          <DrawerClose className="p-2 -mr-2 text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </DrawerClose>
        </div>
        <div className="overflow-hidden pb-[env(safe-area-inset-bottom,16px)]">
          <LocationCommand
            value={value}
            onSelect={(loc) => {
              setPicked(loc)
              onChange(loc.code, loc)
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
