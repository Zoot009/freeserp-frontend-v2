"use client"

/**
 * The search-engine field in the Add-keywords modal.
 *
 * It used to be a `.pill-toggle` identical to the Device toggle two rows above
 * it, which made the two least-alike decisions in the form look like the same
 * kind of decision. It was also multi-select with Google locked on, so "track
 * this on Bing only" could not be expressed at all.
 *
 * Now: checkboxes on cards, any combination, minimum one. Google is pre-ticked
 * because it is what every project already tracks, but it unticks like anything
 * else.
 *
 * Namespace-coupled to `projKeywords` on purpose — that is where the engine
 * strings already live. A second consumer elsewhere means moving the keys first.
 */

import { useId } from "react"
import { useTranslations } from "next-intl"
import type { Engine } from "@/hooks/use-engines"
import { EngineMark } from "./engine-marks"
import { Icon } from "./icons"

export function EnginePicker({
  engines,
  loading,
  value,
  onChange,
  keywordCount,
  isFree,
  freeDailyChecks,
  device,
}: {
  engines: Engine[]
  loading: boolean
  /** Single source of truth, sent to the API as-is. Never empty on submit. */
  value: string[]
  onChange: (next: string[]) => void
  /** pendingLines.length — drives the expanded-row-count line. */
  keywordCount: number
  isFree: boolean
  freeDailyChecks: number
  /** What the modal will submit; an engine that cannot serve it is disabled. */
  device: "desktop" | "mobile"
}) {
  const t = useTranslations("projKeywords")
  const groupId = useId()

  // One engine means the concept is not worth showing — the modal then looks
  // exactly as it did before multi-engine existed. Gating here rather than at
  // the call site keeps the modal's JSX to a single element.
  if (!loading && engines.length < 2) return null

  // Reserve the height while the engine list is in flight. In practice this is
  // almost never seen (use-engines caches at module scope and the keywords table
  // on the same page has already primed it), but without it the field pops into
  // existence mid-form and shoves everything below it down.
  if (loading) {
    return (
      <div className="field">
        <label style={{ margin: 0 }}>{t("engineLabel")}</label>
        <div className="engine-row" aria-hidden>
          <div className="engine-card skel" />
          <div className="engine-card skel" />
        </div>
      </div>
    )
  }

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])

  return (
    <div className="field">
      <label id={`${groupId}-lbl`} style={{ margin: 0 }}>
        {t("engineLabel")}
      </label>

      <div className="engine-row" role="group" aria-labelledby={`${groupId}-lbl`}>
        {engines.map((e) => {
          const on = value.includes(e.id)
          const noDevice = e.devices.length > 0 && !e.devices.includes(device)
          const down = e.available === false
          const off = noDevice || down
          return (
            <label key={e.id} className={"engine-card" + (on ? " selected" : "") + (off ? " off" : "")}>
              {/* The real control. A native checkbox means the label click
                  target, focus handling and Space activation all come from the
                  browser rather than from key handlers we would have to write,
                  test, and get subtly wrong. */}
              <input
                type="checkbox"
                value={e.id}
                checked={on}
                disabled={off}
                onChange={() => toggle(e.id)}
              />
              <span className="mark" aria-hidden>
                <EngineMark id={e.id} label={e.label} size={20} />
              </span>
              <span className="nm">{e.label}</span>
              {off && <span className="off-note">{down ? t("engineUnavailable") : t("engineNoDevice")}</span>}
              <span className={`engine-box${on ? " on" : ""}`} aria-hidden>
                {on && <Icon.check size={12} />}
              </span>
            </label>
          )
        })}
      </div>

      {value.length > 1 && keywordCount > 0 && (
        <div className="tiny muted">
          {t("engineMultiplier", {
            keywords: keywordCount,
            engines: value.length,
            total: keywordCount * value.length,
          })}
          {isFree ? ` ${t("engineMultiplierFree", { checks: freeDailyChecks })}` : ""}
        </div>
      )}

      {value.length === 0 && (
        <div className="tiny" style={{ color: "var(--neg)" }}>
          {t("engineAtLeastOne")}
        </div>
      )}
    </div>
  )
}
