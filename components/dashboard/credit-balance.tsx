"use client"

/**
 * The credit balance, in the dashboard's top bar.
 *
 * There was no balance indicator anywhere in the app before this: the old
 * usage meter lived in `topbar.tsx`, which the sidebar shell replaced, so both
 * have been orphaned and unrendered. A prepaid balance that a user cannot see
 * without opening the billing page is a balance they will run out of by
 * surprise, so this goes in the chrome.
 *
 * A grandfathered worker subscriber gets the daily-checks meter in this spot
 * instead — they meter on daily checks, and showing them a balance of zero
 * credits they never bought would read as something being broken. Showing them
 * nothing at all left them no way to see how many checks were left today.
 */

import { useTranslations } from "next-intl"
import { Coins } from "lucide-react"
import { Link } from "@/i18n/navigation"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { UsageMeter } from "@/components/dashboard/usage-meter"
import { useCredits, formatCredits } from "@/lib/credits"

/** Below this share of the monthly allowance, the pill starts warning. */
const LOW_RATIO = 0.15

export function CreditBalance({ className }: { className?: string }) {
  const t = useTranslations("credits")
  const { credits, loading } = useCredits()

  // The meter's colours and sizes are dashboard tokens scoped to .fs-app, which
  // the top bar sits outside of.
  if (credits?.mode === "worker") {
    return (
      <div className="fs-app" style={{ background: "transparent" }}>
        <UsageMeter />
      </div>
    )
  }

  // Nothing to say yet.
  if (loading || !credits || credits.mode !== "credits") return null

  const allowance = credits.monthlyAllowance || 0
  const low = allowance > 0 ? credits.balance <= allowance * LOW_RATIO : credits.balance <= 20
  const empty = credits.balance <= 0

  const refill = credits.nextRefillAt
    ? new Date(credits.nextRefillAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })
    : null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href="/dashboard/billing"
          aria-label={t("balanceAria", { count: credits.balance, n: formatCredits(credits.balance) })}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-semibold tabular-nums transition-colors",
            empty
              ? "border-red-500/30 bg-red-500/10 text-red-600 hover:bg-red-500/15 dark:text-red-400"
              : low
                ? "border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-400"
                : "hover:bg-muted",
            className,
          )}
        >
          <Coins className={cn("size-3.5", !low && !empty && "text-muted-foreground")} />
          {formatCredits(credits.balance)}
        </Link>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-xs">
        <div className="font-semibold">
          {empty
            ? t("balanceEmpty")
            : t("balanceLeft", { count: credits.balance, n: formatCredits(credits.balance) })}
        </div>
        {/* TooltipContent is inverted (bg-foreground / text-background), so the
            secondary line has to dim its OWN text colour. text-muted-foreground
            is computed against the page, not this surface — in dark mode that
            put light grey on the tooltip's light background and the line all
            but disappeared. */}
        <div className="mt-1 text-background/70">
          {/* Monthly credits expire when the next month's arrive, so the
              balance goes back TO the allowance on that date — it does not
              grow by it. "100 more on 1 Nov" read as a top-up that was never
              coming. */}
          {allowance > 0 && refill
            ? credits.planSlug === "free"
              ? t("balanceResets", { n: formatCredits(allowance), date: refill })
              : t("balanceRenews", { n: formatCredits(allowance), date: refill })
            : t("balanceTopUp")}
          {credits.expiringSoon > 0 && (
            <> {t("balanceExpiring", { n: formatCredits(credits.expiringSoon) })}</>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
