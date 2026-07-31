"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "@/i18n/navigation"
import { api, getAccessToken } from "@/lib/api"
import { trackEvent } from "@/lib/track"

interface AiAnalyses {
  used: number
  limit: number
  remaining: number | null
  unlimited: boolean
  // Free plans degrade to previews instead of blocking, so a full meter is a
  // nudge, not an error — never paint it red.
  degrades: boolean
}

interface UsageInfo {
  plan: string
  workerCount?: number
  dailyUsed: number
  dailyLimit: number
  dailyRemaining: number
  // One-time, non-recurring free-plan trial state (see /api/usage). Always
  // null/false for paid plans.
  freeCheckTrialEndsAt: string | null
  freeCheckTrialExhausted: boolean
  // Free-trial lifetime ceiling. null on paid, absent on older backends — the
  // trial-total row is skipped rather than shown as 0/0.
  trialLifetimeLimit?: number | null
  trialLifetimeUsed?: number | null
  trialLifetimeRemaining?: number | null
  // Absent on older backends — the AI ring is skipped rather than shown as 0/0.
  aiAnalyses?: AiAnalyses
}

// Daily quotas shown in the navbar: a compact pill of progress rings that opens a
// panel with the exact numbers and a single "buy more" control. Refreshes on a slow
// interval so the counters track quota consumed elsewhere in the app.
const POLL_MS = 60_000

const RING = 30 // px — outer box
const STROKE = 3
const R = (RING - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * R

/**
 * One quota as a progress ring with its used-count inside.
 *
 * The ring carries series identity; the number inside stays in the text token, per
 * the rule that text never wears the data color (a light hue is illegible as text).
 * Identity for a colour-blind reader comes from the panel's written labels, not the
 * hue — the pill is a glance affordance, never the only way to read the number.
 *
 * The track is a tint of the SAME hue rather than a neutral gray, so the filled and
 * unfilled halves read as one meter.
 */
function Ring({ used, limit, color, danger }: { used: number; limit: number; color: string; danger: boolean }) {
  const pct = limit > 0 ? Math.min(1, used / limit) : 0
  const stroke = danger ? "var(--neg)" : color
  return (
    <span style={{ position: "relative", display: "inline-flex", width: RING, height: RING }}>
      <svg width={RING} height={RING} aria-hidden style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={RING / 2} cy={RING / 2} r={R} fill="none" strokeWidth={STROKE}
          stroke={stroke} opacity={0.18}
        />
        <circle
          cx={RING / 2} cy={RING / 2} r={R} fill="none" strokeWidth={STROKE}
          stroke={stroke} strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          // A zero-length dash with a round cap still paints a dot, which reads as
          // "a little used" when nothing is. Collapse it to truly nothing at 0.
          strokeDashoffset={pct === 0 ? CIRCUMFERENCE : CIRCUMFERENCE * (1 - pct)}
          style={{ transition: "stroke-dashoffset .3s ease" }}
        />
      </svg>
      <span
        style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 600, color: "var(--text)",
          // Small enough that proportional digits look uneven against the ring.
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {used > 999 ? `${Math.floor(used / 1000)}k` : used}
      </span>
    </span>
  )
}

/** One labelled row in the panel: name, exact fraction, bar, and what's left. */
function MeterRow({ label, used, limit, color, danger, note }: {
  label: string; used: number; limit: number; color: string; danger: boolean; note: string
}) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const fill = danger ? "var(--neg)" : color
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: "var(--text)" }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
          {used} / {limit}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 3, position: "relative", overflow: "hidden" }}>
        {/* Track: a tint of the SAME hue, not neutral gray, so filled and unfilled
            read as one meter. Its own element rather than a background on the
            parent, so the opacity doesn't cascade onto the fill above it. */}
        <span style={{ position: "absolute", inset: 0, background: fill, opacity: 0.18 }} />
        <span
          style={{
            position: "absolute", insetInlineStart: 0, top: 0, bottom: 0,
            width: `${pct}%`, background: fill,
            // Square at the baseline, 4px round at the data end.
            borderRadius: "0 3px 3px 0",
            transition: "width .3s ease",
          }}
        />
      </div>
      <div className="tiny muted" style={{ marginTop: 5 }}>{note}</div>
    </div>
  )
}

export function UsageMeter() {
  const t = useTranslations("usageMeter")
  const router = useRouter()
  const [usage, setUsage] = useState<UsageInfo | null>(null)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  // On small screens the pill sits mid-topbar, so a right-anchored 300px panel
  // overflows the left edge. There we pin the panel to the viewport instead,
  // dropped just below the pill (measured, so it clears a trial banner too).
  const [mobileTop, setMobileTop] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!getAccessToken()) return
      try {
        const data = await api.get<UsageInfo>("/api/usage")
        if (!cancelled && data && typeof data.dailyLimit === "number") setUsage(data)
      } catch {
        /* silent — the navbar shouldn't surface transient quota-fetch errors */
      }
    }
    void load()
    const timer = setInterval(() => void load(), POLL_MS)
    // Other pages dispatch this after consuming quota (e.g. the SERP Checker)
    // so the counters update immediately instead of waiting for the next poll.
    const onRefresh = () => void load()
    window.addEventListener("usage:refresh", onRefresh)
    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener("usage:refresh", onRefresh)
    }
  }, [])

  // Dismiss the panel the two ways a popover is expected to close. Bound only
  // while open so the listeners aren't live for every dashboard click.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  // Measure where the panel should sit on phones (≤640px) while it's open.
  useEffect(() => {
    if (!open) { setMobileTop(null); return }
    const compute = () => {
      if (typeof window === "undefined") return
      setMobileTop(
        window.innerWidth <= 640 && wrapRef.current
          ? wrapRef.current.getBoundingClientRect().bottom + 8
          : null,
      )
    }
    compute()
    window.addEventListener("resize", compute)
    return () => window.removeEventListener("resize", compute)
  }, [open])

  if (!usage) return null

  const isPaid = usage.plan === "paid"
  const checksExhausted = usage.dailyRemaining <= 0
  // An unlimited AI allowance has nothing to meter, so the ring is dropped rather
  // than rendered as a fraction with no ceiling.
  const ai = usage.aiAnalyses && !usage.aiAnalyses.unlimited ? usage.aiAnalyses : null
  const aiRemaining = ai?.remaining ?? 0
  // Free plans aren't blocked at the limit, they degrade to previews — so the AI
  // meter never goes red for them, however full it is.
  const aiDanger = ai != null && !ai.degrades && aiRemaining <= 0

  const trialDaysLeft = !isPaid && usage.freeCheckTrialEndsAt
    ? Math.max(0, Math.ceil((new Date(usage.freeCheckTrialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : null

  // The ring meters TODAY on every plan now — free trials get a per-day allowance
  // that resets at UTC midnight, so "left in trial" would misread the number.
  // What's left of the whole trial is a separate row below.
  const checksNote = isPaid
    ? t("leftToday", { n: usage.dailyRemaining })
    : usage.freeCheckTrialExhausted
      ? t("trialEnded")
      : trialDaysLeft != null
        ? `${t("leftToday", { n: usage.dailyRemaining })} · ${t("trialDaysLeft", { days: trialDaysLeft })}`
        : t("leftToday", { n: usage.dailyRemaining })

  const aiNote = ai
    ? ai.degrades
      ? aiRemaining > 0 ? t("aiFullLeft", { n: aiRemaining }) : t("aiPreviewsNow")
      : t("leftToday", { n: aiRemaining })
    : ""

  // The full state in words, so the pill is readable without opening the panel
  // and without relying on the ring colors.
  const chipLabel = ai
    ? t("chipLabelBoth", {
        checksUsed: usage.dailyUsed, checksLimit: usage.dailyLimit,
        aiUsed: ai.used, aiLimit: ai.limit,
      })
    : t("chipLabelChecks", { used: usage.dailyUsed, limit: usage.dailyLimit })

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="usage-pill"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={chipLabel}
        title={chipLabel}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          height: 40,
          padding: "0 8px 0 10px",
          borderRadius: 10,
          border: "1px solid var(--border)",
          background: "var(--bg-inset, transparent)",
          whiteSpace: "nowrap",
          cursor: "pointer",
          font: "inherit",
          color: "inherit",
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            padding: "2px 6px",
            borderRadius: 5,
            color: isPaid ? "var(--brand)" : "var(--text-mute)",
            background: isPaid ? "var(--brand-soft)" : "var(--bg-inset, transparent)",
            border: isPaid ? "none" : "1px solid var(--border)",
          }}
        >
          {isPaid ? t("planPro") : t("planFree")}
        </span>
        <Ring used={usage.dailyUsed} limit={usage.dailyLimit} color="var(--meter-checks)" danger={checksExhausted} />
        {ai && <Ring used={ai.used} limit={ai.limit} color="var(--meter-ai)" danger={aiDanger} />}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden
          style={{ color: "var(--text-mute)", transform: open ? "rotate(180deg)" : undefined, transition: "transform .15s" }}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("todaysUsage")}
          style={{
            // Phone: fixed to the viewport's top-right (below the pill) so a
            // right-anchored panel can't run off the left edge. Desktop: drops
            // right under the pill as before.
            ...(mobileTop != null
              ? { position: "fixed", top: mobileTop, insetInlineEnd: 10, insetInlineStart: "auto", width: "min(320px, calc(100vw - 20px))" }
              : { position: "absolute", top: "calc(100% + 8px)", insetInlineEnd: 0, width: 300 }),
            padding: 16,
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--bg-elev)",
            boxShadow: "0 12px 32px rgba(0,0,0,.18)",
            zIndex: 50,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 14 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{t("todaysUsage")}</span>
            <span className="tiny muted">{t("resetsUtc")}</span>
          </div>

          <MeterRow
            label={t("rankChecks")}
            used={usage.dailyUsed}
            limit={usage.dailyLimit}
            color="var(--meter-checks)"
            danger={checksExhausted}
            note={checksNote}
          />
          {!isPaid && usage.trialLifetimeLimit != null && (
            // The trial's terminal ceiling, separate from today's allowance above.
            // Without this a free user sees "3 / 3" every day with no sense of how
            // much trial is actually left.
            <MeterRow
              label={t("trialChecksTotal")}
              used={usage.trialLifetimeUsed ?? 0}
              limit={usage.trialLifetimeLimit}
              color="var(--meter-checks)"
              danger={(usage.trialLifetimeRemaining ?? 0) <= 0}
              note={t("leftInTrial", { n: usage.trialLifetimeRemaining ?? 0 })}
            />
          )}
          {ai && (
            <MeterRow
              label={t("aiAnalyses")}
              used={ai.used}
              limit={ai.limit}
              color="var(--meter-ai)"
              danger={aiDanger}
              note={aiNote}
            />
          )}

          <button
            type="button"
            className="btn"
            onClick={() => {
              trackEvent("clicked-buy-button")
              setOpen(false)
              router.push("/pricing?clicked-buy-button")
            }}
            style={{
              width: "100%",
              marginTop: 4,
              justifyContent: "center",
              background: "var(--brand)",
              borderColor: "var(--brand)",
              color: "var(--white)",
              fontWeight: 600,
            }}
          >
            {t("upgradeCta")}
          </button>
        </div>
      )}
    </div>
  )
}
