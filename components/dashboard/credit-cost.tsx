"use client"

/**
 * "This will use N credits, and you have M."
 *
 * A prepaid balance only lets people plan if they can see the price BEFORE they
 * commit. Without it, credits just disappear and the product feels like a
 * meter running behind glass — the complaint every credit-based tool gets when
 * it prices actions silently.
 *
 * Two levels, matched to the stakes:
 *   • <CreditCost>        an inline label next to a button — for cheap actions
 *   • <CreditCostConfirm> a dialog that must be accepted — for expensive ones
 *
 * Both render nothing for a grandfathered worker subscriber, who spends daily
 * checks rather than credits, and nothing while the rate card is loading, so a
 * price never flickers in after the control it belongs to.
 */

import { useState, type ReactNode } from "react"
import { Coins, AlertTriangle } from "lucide-react"
import { Link } from "@/i18n/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useCreditQuote, formatCredits } from "@/lib/credits"

/** Anything at or above this is worth a confirmation step rather than a label. */
export const CONFIRM_THRESHOLD = 10

export function CreditCost({
  action,
  units = 1,
  variant,
  className,
  /** Show the balance too. Off in tight spots where the cost alone is enough. */
  showBalance = true,
}: {
  action: string
  units?: number
  variant?: string | null
  className?: string
  showBalance?: boolean
}) {
  const { cost, balance, short, applies } = useCreditQuote(action, units, variant)
  if (!applies || cost == null) return null

  // A zero-rated action is one another action pays for. Saying "0 credits"
  // invites the question of why it is listed at all.
  if (cost === 0) return null

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        short ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground",
        className,
      )}
    >
      <Coins className="size-3 shrink-0" />
      <span className="tabular-nums">
        Uses {formatCredits(cost)} credit{cost === 1 ? "" : "s"}
      </span>
      {showBalance && balance != null && (
        <span className="tabular-nums opacity-80">
          {short ? `· only ${formatCredits(balance)} left` : `· ${formatCredits(balance)} left`}
        </span>
      )}
    </span>
  )
}

/**
 * Wraps an expensive action in a confirmation showing the balance before and
 * after. `onConfirm` runs only if the user accepts — and never when the balance
 * cannot cover it, because letting someone confirm a spend that will 402 is
 * just a slower way of failing.
 */
export function CreditCostConfirm({
  action,
  units = 1,
  variant,
  title,
  description,
  confirmLabel = "Run it",
  open,
  onOpenChange,
  onConfirm,
  children,
}: {
  action: string
  units?: number
  variant?: string | null
  title: string
  description?: ReactNode
  confirmLabel?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  children?: ReactNode
}) {
  const { cost, balance, after, short, applies } = useCreditQuote(action, units, variant)
  const [busy, setBusy] = useState(false)

  const run = () => {
    setBusy(true)
    try {
      onConfirm()
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {applies && cost != null && (
          <div className="rounded-lg border bg-muted/40 p-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] text-muted-foreground">This run costs</span>
              <span className="text-[15px] font-bold tabular-nums">
                {formatCredits(cost)} credit{cost === 1 ? "" : "s"}
              </span>
            </div>
            {balance != null && (
              <div className="mt-2 flex items-baseline justify-between gap-3 border-t pt-2">
                <span className="text-[13px] text-muted-foreground">Balance after</span>
                <span className="text-[13px] tabular-nums">
                  <span className="text-muted-foreground">{formatCredits(balance)}</span>
                  <span className="mx-1.5 text-muted-foreground">→</span>
                  <span className={cn("font-semibold", short && "text-amber-600 dark:text-amber-400")}>
                    {formatCredits(Math.max(0, after ?? 0))}
                  </span>
                </span>
              </div>
            )}
            {short && (
              <p className="mt-2.5 flex items-start gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                Not enough credits — you need {formatCredits(cost - (balance ?? 0))} more.
              </p>
            )}
          </div>
        )}

        {children}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {short ? (
            <Button asChild size="sm">
              <Link href="/dashboard/billing">Buy credits</Link>
            </Button>
          ) : (
            <Button size="sm" disabled={busy} onClick={run}>
              {confirmLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
