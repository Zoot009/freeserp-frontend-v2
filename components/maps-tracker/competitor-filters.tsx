"use client"

import { SlidersHorizontal, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { CompetitorRow } from "./types"

export interface CompetitorFilterState {
  minRating: number | null
  minReviews: number | null
  website: "any" | "has" | "none"
  minPercentOfResults: number | null
}

export const EMPTY_FILTERS: CompetitorFilterState = {
  minRating: null,
  minReviews: null,
  website: "any",
  minPercentOfResults: null,
}

export function filtersActive(f: CompetitorFilterState): boolean {
  return f.minRating != null || f.minReviews != null || f.website !== "any" || f.minPercentOfResults != null
}

/**
 * Applied client-side over the already-fetched leaderboard — no new request.
 * The whole dataset is in memory and complete, so a filter is a pure narrowing
 * of it; a round-trip would only add latency and a loading state.
 *
 * The target is never filtered out. Hiding your own business because it has
 * fewer reviews than the threshold you just set would be answering a question
 * nobody asked — "where do I sit among these" needs you in the list.
 */
export function applyCompetitorFilters(rows: CompetitorRow[], f: CompetitorFilterState): CompetitorRow[] {
  if (!filtersActive(f)) return rows
  return rows.filter((r) => {
    if (r.isTarget) return true
    // A null value fails a threshold rather than passing it: "at least 4 stars"
    // must not be satisfied by a business whose rating we never captured.
    if (f.minRating != null && (r.rating == null || r.rating < f.minRating)) return false
    if (f.minReviews != null && (r.reviewCount == null || r.reviewCount < f.minReviews)) return false
    if (f.website === "has" && !r.website) return false
    if (f.website === "none" && r.website) return false
    if (f.minPercentOfResults != null && r.percentOfResults < f.minPercentOfResults) return false
    return true
  })
}

/**
 * Whether the captured data can answer a given filter at all.
 *
 * `website` was not stored before the Position Map's provider mapper shipped,
 * so on an older scan every row would have `website: null` and the filter would
 * silently hide the entire list. Hiding the control is honest; offering one
 * that always returns nothing is not.
 */
export function availableFilters(rows: CompetitorRow[]) {
  const others = rows.filter((r) => !r.isTarget)
  return {
    rating: others.some((r) => r.rating != null),
    reviews: others.some((r) => r.reviewCount != null),
    website: others.some((r) => r.website != null),
  }
}

const RATINGS = [3, 3.5, 4, 4.5]
const REVIEWS = [10, 50, 100, 500]
const COVERAGE = [10, 25, 50, 75]

export function CompetitorFilters({
  value,
  onChange,
  rows,
}: {
  value: CompetitorFilterState
  onChange: (next: CompetitorFilterState) => void
  rows: CompetitorRow[]
}) {
  const can = availableFilters(rows)
  const active = filtersActive(value)

  function set<K extends keyof CompetitorFilterState>(key: K, v: CompetitorFilterState[K]) {
    onChange({ ...value, [key]: v })
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="mt-filterbtn" data-active={active || undefined} aria-label="Filter competitors">
          <SlidersHorizontal size={13} />
          {active && <i className="dot" aria-hidden />}
        </button>
      </PopoverTrigger>
      {/* fs-app: portalled out of the app scope — see the note on the AI sheet. */}
      <PopoverContent align="end" className="fs-app w-[260px] p-3">
        <div className="mt-filt">
          <div className="mt-filt-h">
            <span>Filter</span>
            {active && (
              <button type="button" className="mt-link" onClick={() => onChange(EMPTY_FILTERS)}>
                <X size={11} style={{ verticalAlign: -1 }} /> Clear
              </button>
            )}
          </div>

          {can.rating && (
            <Group label="Minimum rating">
              <Choice selected={value.minRating == null} onClick={() => set("minRating", null)}>Any</Choice>
              {RATINGS.map((r) => (
                <Choice key={r} selected={value.minRating === r} onClick={() => set("minRating", r)}>
                  {r}★
                </Choice>
              ))}
            </Group>
          )}

          {can.reviews && (
            <Group label="Minimum reviews">
              <Choice selected={value.minReviews == null} onClick={() => set("minReviews", null)}>Any</Choice>
              {REVIEWS.map((n) => (
                <Choice key={n} selected={value.minReviews === n} onClick={() => set("minReviews", n)}>
                  {n}+
                </Choice>
              ))}
            </Group>
          )}

          {can.website && (
            <Group label="Website">
              <Choice selected={value.website === "any"} onClick={() => set("website", "any")}>Any</Choice>
              <Choice selected={value.website === "has"} onClick={() => set("website", "has")}>Has one</Choice>
              <Choice selected={value.website === "none"} onClick={() => set("website", "none")}>None</Choice>
            </Group>
          )}

          <Group label="Appeared at least at">
            <Choice selected={value.minPercentOfResults == null} onClick={() => set("minPercentOfResults", null)}>
              Any
            </Choice>
            {COVERAGE.map((p) => (
              <Choice
                key={p}
                selected={value.minPercentOfResults === p}
                onClick={() => set("minPercentOfResults", p)}
              >
                {p}% of points
              </Choice>
            ))}
          </Group>

          {!can.rating && !can.reviews && !can.website && (
            <div className="tiny muted" style={{ lineHeight: 1.5, marginTop: 6 }}>
              This scan captured no ratings or websites, so only coverage can be filtered on.
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-filt-g">
      <div className="mt-filt-l">{label}</div>
      <div className="mt-filt-opts">{children}</div>
    </div>
  )
}

function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button type="button" className="mt-filt-opt" aria-pressed={selected} onClick={onClick}>
      {children}
    </button>
  )
}
