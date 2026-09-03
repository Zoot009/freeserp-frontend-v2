"use client"

/**
 * Which assistants a brand is tracked on, and how it scores on each.
 *
 * The other half of the "four nav entries, one page" fix. From the brand list
 * you can now see that ChatGPT names you and Gemini does not, and click straight
 * into the one you want — rather than opening a brand, opening a prompt, and
 * inferring it.
 *
 * An assistant the brand is NOT tracked on is drawn dimmed rather than omitted:
 * the gap is the useful part. A brand with nothing on Perplexity is a brand
 * whose owner has never seen what Perplexity says about them.
 *
 * Each pill carries its own `data-engine`, so it takes that assistant's accent
 * from the AI ENGINE PAGES block in dashboard.css.
 *
 * The pills are SPANS, not links. The whole brand card is already an anchor, and
 * an anchor inside an anchor is invalid HTML with no defined click behaviour —
 * so these read, and the sidebar and the cross-assistant rail navigate.
 */

import { PlatformMark } from "@/components/dashboard/platform-marks"
import { pct, type Platform } from "@/lib/ai-tracker"
import { ENGINES, ENGINE_ORDER } from "@/lib/ai-engines"

export function BrandEngines({ rates }: { rates: Partial<Record<Platform, number | null>> }) {
  return (
    <div className="llm-brand-eng">
      {ENGINE_ORDER.map((id) => {
        const e = ENGINES[id]
        const v = rates[id]
        const tracked = v !== undefined
        return (
          <span
            key={id}
            className={`llm-eng ${tracked ? "" : "off"}`}
            data-engine={id}
            title={
              !tracked
                ? `${e.label}: not tracked for this brand`
                : v == null
                  ? `${e.label}: tracked, not measured yet`
                  : `${e.label}: ${pct(v)} average mention rate`
            }
          >
            <PlatformMark id={id} size={14} />
            {/* Three states, not two: not tracked, tracked but never run, and a
                real rate. The middle one used to be indistinguishable from 0%. */}
            <b>{!tracked ? "—" : v == null ? "·" : pct(v)}</b>
          </span>
        )
      })}
    </div>
  )
}
