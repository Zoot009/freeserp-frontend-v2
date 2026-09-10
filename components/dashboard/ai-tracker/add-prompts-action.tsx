"use client"

/**
 * "Add prompts on <assistant>" — the action the assistant pages were missing.
 *
 * The page had no way to add a prompt once it had any data at all. The rich
 * empty state offered one and the coverage panel offered one, but coverage only
 * renders when you are MISSING prompts and sits below the board — so on a
 * populated page there was nothing, and tracking another question on ChatGPT
 * meant knowing to go back to the tracker, open a brand, and find the button
 * there. Three navigations to reach an action that belongs on this page.
 *
 * The wrinkle is that adding is BRAND-scoped on the backend (prompts hang off a
 * project, whose names and domain every answer is scored against) while this
 * page spans every brand. So:
 *   no brands  → send them to create one
 *   one brand  → straight through, no question to ask
 *   several    → pick, with what each already tracks HERE so the choice is
 *                informed rather than a list of names
 *
 * Every route ends at the existing add-prompts modal via ?new=1&platform=<slug>,
 * which preselects this assistant — so the flow that starts on the ChatGPT page
 * cannot quietly add prompts to Gemini.
 */

import { useState } from "react"
import Link from "next/link"
import { ChevronRight, Plus, X } from "lucide-react"
import type { EngineProfile } from "@/lib/ai-engines"
import type { ProjectRef } from "@/lib/ai-tracker"

/** Two initials, matching the board avatars so a brand looks the same everywhere. */
const initials = (s: string) =>
  s
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase()

const addHref = (engine: EngineProfile, projectId: string) =>
  `/dashboard/ai-prompt-tracker/${projectId}?new=1&platform=${engine.slug}`

export function AddPromptsAction({
  engine,
  projects,
  counts,
  label,
  className = "btn primary",
}: {
  engine: EngineProfile
  /**
   * EVERY brand the account has — not just the ones already tracking this
   * assistant. The brands that do NOT track it are the reason someone is
   * adding here, so leaving them out is how this action ends up offering
   * "New brand" to a user who already has five.
   */
  projects: ProjectRef[]
  /** projectId → prompts already tracked here, shown in the picker. */
  counts?: Map<string, number>
  /** Overrides the button text. The brand resolution below is unchanged. */
  label?: string
  className?: string
}) {
  const [picking, setPicking] = useState(false)
  const text = label ?? `Add prompts on ${engine.label}`

  if (projects.length === 0) {
    return (
      <Link className={className} href="/dashboard/ai-prompt-tracker">
        <Plus aria-hidden /> New brand
      </Link>
    )
  }

  if (projects.length === 1) {
    return (
      <Link className={className} href={addHref(engine, projects[0]!.id)}>
        <Plus aria-hidden /> {text}
      </Link>
    )
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setPicking(true)}>
        <Plus aria-hidden /> {text}
      </button>
      {picking && (
        <div className="modal-bg" onClick={() => setPicking(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">
              <div className="t">Add prompts on {engine.label}</div>
              <button className="icon-btn" onClick={() => setPicking(false)} aria-label="Close">
                <X aria-hidden />
              </button>
            </div>
            <div className="modal-b">
              <div className="tiny muted" style={{ marginBottom: 12 }}>
                Prompts belong to a brand — we score every answer against that brand&rsquo;s names and domain. Pick the
                one these questions are about.
              </div>
              <div className="llm-pick">
                {projects.map((p) => {
                  const n = counts?.get(p.id)
                  return (
                    <Link className="llm-pick-row" href={addHref(engine, p.id)} key={p.id}>
                      <span className="llm-board-avatar" aria-hidden>
                        {initials(p.brandName)}
                      </span>
                      <span className="n">
                        <b>{p.name}</b>
                        <span>{p.brandDomain || p.brandName}</span>
                      </span>
                      <span className="ct">
                        {n ? `${n} prompt${n === 1 ? "" : "s"} here` : "not tracked here yet"}
                      </span>
                      <ChevronRight aria-hidden />
                    </Link>
                  )
                })}
              </div>
              <div className="llm-pick-new">
                Adding a brand we don&rsquo;t track yet?{" "}
                <Link href="/dashboard/ai-prompt-tracker">Create one first</Link>.
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
