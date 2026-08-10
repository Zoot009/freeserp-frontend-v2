"use client"

/**
 * Keyword Movement — how many tracked keywords gained, lost, entered or left the
 * top 100 over the range.
 *
 * The bars are scaled against the largest of the four counts rather than the
 * keyword total: with 2 improved out of 200 tracked, every bar would otherwise
 * be a sliver and the panel would read as empty when it isn't.
 *
 * The keyword LIST used to live here too. It moved to Position Tracking's
 * Winners/Losers tabs, which is the wide column — this panel couldn't fit a real
 * "Rank #100+ → #1" button beside three data columns, and a list of keywords sat
 * oddly under a set of movement counters anyway.
 */

import { Link } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Widget } from "@/components/dashboard/widget"
import { cn } from "@/lib/utils"

export type Movements = {
  improved: number
  declined: number
  added: number
  lost: number
  /**
   * Keywords with two or more completed checks in the range — the only ones
   * that COULD have moved.
   *
   * Without it, "0 improved" is indistinguishable from "we have nothing to
   * compare against yet", and the card confidently reported no movement for
   * projects whose first check had barely finished.
   */
  comparable: number
}

const ROWS = [
  { key: "improved", label: "Improved", tone: "bg-emerald-500" },
  { key: "declined", label: "Declined", tone: "bg-red-500" },
  { key: "added", label: "New", tone: "bg-primary" },
  { key: "lost", label: "Lost", tone: "bg-amber-500" },
] as const

export type KeywordMovementProps = {
  projectId: string
  loading: boolean
  movements: Movements
  /** Tracked-keyword count. Only used to tell "nothing has moved" apart from
   *  "there is nothing to move", which read identically as four zeroes. */
  tracked: number
  rangeLabel: string
  className?: string
}

export function KeywordMovementCard(p: KeywordMovementProps) {
  const counts = ROWS.map((r) => p.movements[r.key])
  // `comparable` is what makes the four numbers mean anything, so it's named in
  // the header rather than buried in the note below.
  const peak = Math.max(1, ...counts)
  const noMovement = counts.every((n) => n === 0)

  return (
    <Widget
      id="keyword-movement"
      title="Keyword Movement"
      hint="Each keyword's first check in this range compared against its latest. Improved and Declined are moves within the top 100; New entered it, Lost dropped out. A keyword checked only once can't be compared, so it isn't counted."
      meta={<span>{p.rangeLabel}</span>}
      className={p.className}
      bodyClassName="p-5"
    >
      {p.loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}</div>
      ) : (
        <div className="flex flex-col gap-3">
          {ROWS.map((r) => {
            const n = p.movements[r.key]
            return (
              <div key={r.key} className="flex items-center gap-3">
                <span className="w-[66px] shrink-0 text-[13px] text-muted-foreground">{r.label}</span>
                <div className="h-[5px] flex-1 overflow-hidden rounded-[3px] bg-muted">
                  {n > 0 && <div className={cn("h-full rounded-[3px]", r.tone)} style={{ width: `${(n / peak) * 100}%` }} />}
                </div>
                <span className={cn("w-5 shrink-0 text-right text-sm font-semibold tabular-nums", n ? "text-foreground" : "text-muted-foreground/50")}>
                  {n}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Four zeroes are ambiguous on their own — say which kind of nothing this
          is, and offer the way out when there's nothing tracked at all. */}
      {!p.loading && noMovement && (
        <div className="mt-5 border-t pt-4">
          {p.tracked === 0 ? (
            <>
              <p className="mb-3.5 text-[13px] leading-relaxed text-muted-foreground/80">
                No keywords tracked yet. Add the terms you actually want to win — five is enough to start.
              </p>
              <Button asChild variant="outline" size="sm" className="h-[34px] w-full text-[13px] font-semibold">
                <Link href={`/dashboard/project/${p.projectId}/keywords?add=1`}>Add keywords</Link>
              </Button>
            </>
          ) : p.movements.comparable === 0 ? (
            /* The important case, and the one this card used to get wrong.
               Movement is a comparison, so it needs two checks of the SAME
               keyword inside the range. With one check there is nothing to
               compare, and reporting "nothing moved" claims a measurement that
               was never taken. */
            <p className="text-[13px] leading-relaxed text-muted-foreground/80">
              Nothing to compare yet — movement needs two checks of the same keyword inside this range. Your{" "}
              {p.tracked} tracked keyword{p.tracked === 1 ? " has" : "s have"} been checked once so far.
            </p>
          ) : (
            <p className="text-[13px] leading-relaxed text-muted-foreground/80">
              None of the {p.movements.comparable} keyword{p.movements.comparable === 1 ? "" : "s"} checked twice in
              this range changed position.
            </p>
          )}
        </div>
      )}
    </Widget>
  )
}
