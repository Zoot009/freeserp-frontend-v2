"use client"

// Dashboard-wide countdown for a free trial that is still running: how much is
// left, and a route to the plans. Shown to every free user on every dashboard
// route while the trial lives.
//
// Once the trial ends this yields entirely to TrialEndedGate, which replaces the
// page body with a blocking paywall.

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Link, usePathname } from "@/i18n/navigation"
import { useTrialUsage } from "@/hooks/use-trial-usage"
import { Icon } from "@/components/dashboard/icons"

const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

// Dismissal persists for the whole trial: once the user closes the banner it
// stays closed and does not nag again. Keyed by the trial's end date, so the ONLY
// thing that brings it back is a genuinely different trial window — e.g. redeeming
// an extension bumps freeCheckTrialEndsAt, which is worth re-surfacing once.
const dismissKey = (endsAt: string | null) =>
  `trialCountdown:dismissed:${endsAt?.slice(0, 10) ?? "none"}`

/** Live remaining time, re-rendered once a second. */
function useCountdown(endsAtMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), SECOND_MS)
    return () => window.clearInterval(id)
  }, [])
  const ms = Math.max(0, endsAtMs - now)
  return {
    days: Math.floor(ms / DAY_MS),
    hours: Math.floor((ms % DAY_MS) / HOUR_MS),
    mins: Math.floor((ms % HOUR_MS) / MINUTE_MS),
    secs: Math.floor((ms % MINUTE_MS) / SECOND_MS),
  }
}

/** One zero-padded unit tile with its label underneath. */
function Unit({ value, label }: { value: number; label: string }) {
  return (
    <div className="tb-unit">
      <span className="tb-tile">{String(value).padStart(2, "0")}</span>
      <span className="tb-unit-label">{label}</span>
    </div>
  )
}

export function TrialCountdownBanner() {
  const t = useTranslations("trialCountdown")
  const pathname = usePathname()
  const { usage, trial } = useTrialUsage()
  const [dismissed, setDismissed] = useState(true) // assume hidden until we've checked storage
  // Callback ref rather than useRef: the banner mounts long after this component
  // first renders (usage has to arrive), and only a state ref re-runs the effect.
  const [node, setNode] = useState<HTMLDivElement | null>(null)

  // The sidebar is `position: sticky; height: 100vh`. Sitting a banner above it
  // in the same grid would push that 100vh past the fold and clip the bottom of
  // the sidebar, so publish our height and let the sidebar subtract it.
  useEffect(() => {
    if (!node) return
    const root = document.documentElement
    const publish = () => root.style.setProperty("--tb-h", `${node.offsetHeight}px`)
    publish()
    // Re-measure on wrap: the bar grows a row at the responsive breakpoints.
    const ro = new ResizeObserver(publish)
    ro.observe(node)
    return () => {
      ro.disconnect()
      root.style.removeProperty("--tb-h")
    }
  }, [node])

  // Re-read dismissal whenever the trial end date changes (including the bump from
  // redeeming an extension, which should un-dismiss the fresh countdown).
  useEffect(() => {
    if (!usage) return
    try {
      setDismissed(window.localStorage.getItem(dismissKey(usage.freeCheckTrialEndsAt)) === "1")
    } catch {
      setDismissed(false) // storage blocked (private mode) — showing is the safer default
    }
  }, [usage])

  // Hooks must run unconditionally, so the countdown ticks against a harmless 0
  // on the renders where there is no trial to show.
  const left = useCountdown(trial?.endsAtMs ?? 0)

  const dismiss = () => {
    setDismissed(true)
    if (!usage) return
    try {
      window.localStorage.setItem(dismissKey(usage.freeCheckTrialEndsAt), "1")
    } catch {
      // Non-persistent dismissal is fine — it still hides for this page view.
    }
  }

  // The hook returns a trial only while one is genuinely running (free plan, not
  // exhausted, end date still ahead), so that null covers every hide-me case
  // except dismissal and the pages that sell the plans themselves.
  if (!trial || dismissed) return null
  if (pathname.startsWith("/pricing")) return null

  // `tb-bar`, not `trial-banner` — the pricing page already owns that class for
  // its own callout, and its stylesheet loads after this one.
  return (
    <div ref={setNode} className={"tb-bar" + (trial.finalDay ? " urgent" : "")} role="status">
      <div className="tb-lead">
        <span className="tb-eyebrow">{t("eyebrow")}</span>
        <span className="tb-lead-word">{trial.finalDay ? t("leadUrgent") : t("lead")}</span>
      </div>

      <p className="tb-message">
        {t.rich("message", {
          hl: (chunks) => <span className="tb-hl">{chunks}</span>,
        })}
        {usage && (
          // The window is only half the story — the daily allowance is what
          // actually gates the next check, so state both.
          <span className="tb-hl" style={{ marginLeft: 6 }}>
            {t("checksToday", { n: usage.dailyRemaining, limit: usage.dailyLimit })}
          </span>
        )}
      </p>

      {/* aria-hidden: the per-second tick would spam a screen reader, and the
          same deadline is already stated in the message above. */}
      <div className="tb-countdown" aria-hidden="true">
        <Unit value={left.days} label={t("unitDays")} />
        <span className="tb-sep">:</span>
        <Unit value={left.hours} label={t("unitHours")} />
        <span className="tb-sep">:</span>
        <Unit value={left.mins} label={t("unitMins")} />
        <span className="tb-sep">:</span>
        <Unit value={left.secs} label={t("unitSecs")} />
      </div>

      <Link href="/pricing?clicked-buy-button" className="tb-cta">
        <button type="button">{t("cta")}</button>
      </Link>

      <button type="button" className="tb-close" onClick={dismiss} aria-label={t("dismiss")}>
        <Icon.close />
      </button>
    </div>
  )
}
