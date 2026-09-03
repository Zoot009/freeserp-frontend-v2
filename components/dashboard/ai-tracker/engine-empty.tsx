"use client"

/**
 * What an assistant page shows when it has nothing to show.
 *
 * This is the state most users see. Most accounts run one assistant, so three of
 * these four pages are empty for them — which is precisely why all four felt
 * like the same page: they all rendered one dashed box whose only exit was a
 * button back to the page you were trying to leave.
 *
 * Two states, not one. The old page gave a brand-new account and an account with
 * thirty prompts on other assistants the identical "Nothing tracked yet" panel,
 * which is wrong in the second case and useless in both.
 */

import Link from "next/link"
import { Icon } from "@/components/dashboard/icons"
import { PlatformMark } from "@/components/dashboard/platform-marks"
import { AddPromptsAction } from "@/components/dashboard/ai-tracker/add-prompts-action"
import type { EngineProfile } from "@/lib/ai-engines"
import type { ProjectRef } from "@/lib/ai-tracker"

export function EngineEmpty({
  engine,
  variant,
  totalPrompts,
  projects,
}: {
  engine: EngineProfile
  /** `new-account`: nothing anywhere. `none-here`: plenty, none on this one. */
  variant: "new-account" | "none-here"
  totalPrompts: number
  /** Every brand the account has — see AddPromptsAction on why not just these. */
  projects: ProjectRef[]
}) {
  const fresh = variant === "new-account"
  return (
    <div className="llm-empty rich">
      <div className="llm-empty-art" aria-hidden>
        <PlatformMark id={engine.id} size={200} />
      </div>
      <div className="llm-empty-in">
        <div className="eyebrow">
          <span className="spark">
            <Icon.spark />
          </span>{" "}
          {fresh ? "Nothing tracked yet" : `Nothing on ${engine.label} yet`}
        </div>
        <div className="b" style={{ margin: "9px 0 4px" }}>
          {fresh
            ? `Ask ${engine.label} what your buyers ask, and find out whether it names you.`
            : `You track ${totalPrompts} prompt${totalPrompts === 1 ? "" : "s"} — none of them on ${engine.label}.`}
        </div>
        <div className="tiny muted" style={{ maxWidth: "60ch" }}>
          {fresh
            ? `${engine.label} is one of four assistants we can ask. Each answers differently, so each is tracked separately.`
            : `The other assistants can't tell you what ${engine.label} says. Add it to a prompt and its answers start collecting here.`}
        </div>
        <ol className="llm-empty-steps">
          <li>
            {fresh
              ? "Add the brand you want measured, with the domain that proves a citation."
              : "Open a brand you already track."}
          </li>
          <li>
            {fresh
              ? "Add the questions a real customer would type — questions, not keywords."
              : `Add ${engine.label} to the prompts that matter most.`}
          </li>
          <li>Run them, and read which brands {engine.label} names in your place.</li>
        </ol>
        <div className="llm-empty-cta">
          {/* The same resolution the header action uses, so a multi-brand
              account is asked which brand rather than having one chosen for it.
              It adds prompts ON THIS ASSISTANT, deep-linked so the modal opens
              with it already selected. */}
          <AddPromptsAction engine={engine} projects={projects} />
          {!fresh && (
            <Link className="btn" href="/dashboard/ai-prompt-tracker">
              All brands
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
