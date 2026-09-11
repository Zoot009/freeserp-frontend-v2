"use client"

/**
 * "Your free checks are back."
 *
 * A free plan gets three rank checks a day, and when they run out the tracker
 * shows a countdown to the UTC reset. Nothing ever announced the reset — the
 * user had to remember to come back and look at a timer, so the checks they had
 * been waiting for went unused until they happened to open the right page.
 *
 * This fires anywhere in the dashboard, not just the rank tracker: the reset is
 * about the account, and somebody reading the Overview is exactly as able to act
 * on it.
 *
 * It never appears for an account that tracks nothing. A new user landing on
 * "Add your first website" was being told their three checks were back —
 * about an allowance they had never spent, for keywords that did not exist,
 * over the top of the one thing the screen was asking them to do.
 *
 * It only ever appears for someone who ACTUALLY RAN OUT. Firing on a full
 * allowance alone would greet every free user with a popup every morning,
 * including people who have never hit the limit and were not waiting for
 * anything — a notification about a problem they do not have. So running out is
 * recorded when it happens, and the marker is what unlocks the announcement.
 */

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "@/i18n/navigation"
import { api } from "@/lib/api"
import { Icon } from "./icons"

type Usage = {
  plan: "free" | "paid"
  dailyUsed: number
  dailyLimit: number
  dailyRemaining: number
  /** Keywords tracked across every project. Absent on an older API. */
  trackedKeywords?: number
}

/** Set the moment a free account hits zero. Cleared once the news is delivered. */
const KEY_RAN_OUT = "fs.checks.ranOut"
/** UTC date the announcement was last shown, so it lands once per reset. */
const KEY_ANNOUNCED = "fs.checks.announcedOn"

function utcToday(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Storage is a convenience here, never a requirement — a blocked read just means no popup. */
function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* private mode, blocked storage — the feature simply doesn't run */
  }
}

export function ChecksBackModal() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [limit, setLimit] = useState(3)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      let usage: Usage
      try {
        usage = await api.get<Usage>("/api/usage")
      } catch {
        // Not signed in yet, offline, or the endpoint is unhappy. Silence is
        // the right failure for something whose entire job is good news.
        return
      }
      if (cancelled) return

      // Paid accounts have no daily reset to announce. Clear the markers so a
      // downgrade later starts from a clean slate rather than firing instantly.
      if (usage.plan !== "free") {
        write(KEY_RAN_OUT, null)
        write(KEY_ANNOUNCED, null)
        return
      }

      // Nothing tracked yet, so there is no allowance to miss and nothing the
      // news would let them do. Checked before the ran-out marker is written:
      // an empty account must not bank a claim it can collect later either.
      // Undefined means an older API that cannot say, and silence is the safe
      // reading of that.
      if ((usage.trackedKeywords ?? 0) <= 0) return

      // Out right now. Remember it — this is what earns the announcement when
      // the allowance comes back.
      if (usage.dailyRemaining <= 0) {
        write(KEY_RAN_OUT, "1")
        return
      }

      // Checks available, and they were waiting for them.
      if (read(KEY_RAN_OUT) !== "1") return
      if (read(KEY_ANNOUNCED) === utcToday()) return

      // Written BEFORE opening, so a refresh mid-dialog doesn't show it twice.
      write(KEY_ANNOUNCED, utcToday())
      write(KEY_RAN_OUT, null)
      setLimit(usage.dailyRemaining)
      setOpen(true)
    })()
    return () => { cancelled = true }
  }, [])

  const close = useCallback(() => setOpen(false), [])

  if (!open) return null

  return (
    <div className="fs-app">
      <div className="modal-bg" onClick={close}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 430 }}>
          <div className="modal-h">
            <div>
              <div className="eyebrow" style={{ margin: 0, fontSize: 11 }}>
                <span className="spark"><Icon.spark /></span> CHECKS RESET
              </div>
              <div className="b" style={{ fontSize: 18, marginTop: 4 }}>
                {limit === 1 ? "You have 1 free check today" : `You have ${limit} free checks today`}
              </div>
            </div>
            <button type="button" onClick={close} className="icon-btn" aria-label="Close">
              <Icon.close />
            </button>
          </div>

          <div className="modal-b">
            <div className="tiny muted" style={{ lineHeight: 1.6 }}>
              Your daily allowance is back. Run a rank check to see where your keywords
              sit in Google today — {limit === 1 ? "it costs 1 credit" : `${limit} checks, 1 credit each`}.
            </div>
            {/* Said plainly, because the alternative is finding out at midnight:
                unused checks are not banked. */}
            <div className="tiny muted" style={{ marginTop: 8, opacity: 0.75 }}>
              They don&apos;t roll over — tomorrow starts at {limit} again.
            </div>
          </div>

          <div className="modal-f">
            <button type="button" className="btn" onClick={close}>Not now</button>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                close()
                router.push("/dashboard/projects")
              }}
            >
              Check my rankings
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
