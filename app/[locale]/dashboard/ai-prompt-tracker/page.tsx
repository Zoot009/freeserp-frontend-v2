"use client"

// LLM prompt tracker — project list.
//
// A project is a brand plus the aliases and competitors we score answers against.
// Prompts hang off it; runs hang off prompts.
//
// NOTE: strings are inline English, matching the rest of this dashboard section.

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api, ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { Icon } from "@/components/dashboard/icons"
import { ToolContext } from "@/components/dashboard/tool-context"
import { BrandEngines } from "@/components/dashboard/ai-tracker/brand-engines"
import { OnboardingWizard } from "@/components/dashboard/ai-tracker/onboarding-wizard"
import type { Platform } from "@/lib/ai-tracker"

// ───── Types (mirror /api/llm-tracker/projects) ─────────────────────────────
type ProjectSummary = {
  id: string
  name: string
  brandName: string
  brandDomain: string | null
  promptCount: number
  /**
   * Average mention rate per assistant this brand is tracked on.
   *
   * A KEY that is absent means "not tracked on that assistant"; a key whose
   * value is null means "tracked, nothing has completed yet". Those are
   * different findings and the card draws them differently. Optional so a
   * frontend deployed ahead of the backend still typechecks.
   */
  platformRates?: Partial<Record<Platform, number | null>>
  createdAt: string
}

export default function LlmPromptsPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [unavailable, setUnavailable] = useState<"" | "missing" | "unverified">("")
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) router.push("/login")
  }, [authLoading, user, router])

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ projects: ProjectSummary[] }>("/api/llm-tracker/projects")
      setProjects(data.projects)
    } catch (err: unknown) {
      // 404 = the feature flag is off on this backend. 403 = the caller isn't on
      // the early-access allowlist. Both are states, not failures, so neither
      // belongs in the red error card — and now that this is the headline nav
      // item, the 403 is what most users will hit.
      if (err instanceof ApiError && err.status === 404) setUnavailable("missing")
      else if (err instanceof ApiError && err.status === 403) setUnavailable("unverified")
      else setError(err instanceof Error ? err.message : "Failed to load projects")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user) void load()
  }, [user, load])

  if (authLoading || loading) {
    return (
      <div className="page" style={{ color: "var(--text-mute)", fontSize: 13, padding: 60, textAlign: "center" }}>
        Loading…
      </div>
    )
  }

  if (unavailable) {
    return (
      <div className="page">
        <div className="page-h">
          <h1>AI Prompt Tracker</h1>
        </div>
        <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
          {unavailable === "unverified" ? (
            <>
              {/* Reachable only if the shell's redirect hasn't run — it sends
                  every unverified user to /verify-email before any dashboard
                  page renders. Kept as a backstop, pointing at that same page,
                  which is where the working resend control lives. Settings has
                  no such control; an earlier draft of this string said it did. */}
              Confirm your email address to start tracking.{" "}
              <Link href="/verify-email">Resend the confirmation link</Link>.
            </>
          ) : (
            "Prompt tracking isn't available on this API version yet."
          )}
        </div>
      </div>
    )
  }

  // With nothing tracked, setup IS the page. The old first screen was an empty
  // state whose only action opened a modal -- one click and one dialog between
  // a new account and the thing it came here for, and the empty state said
  // nothing the wizard's own first step does not say better.
  const firstRun = projects.length === 0
  const setupOpen = firstRun || showAdd

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>AI Prompt Tracker</h1>
          <div className="tiny muted">
            {setupOpen
              ? "Four steps: your brand, your market, the questions, then who we ask."
              : "Ask the AI platforms what your buyers ask, and track whether you get named."}
          </div>
        </div>
        {!setupOpen && (
          <button className="btn primary" onClick={() => setShowAdd(true)}>
            <Icon.plus /> New brand
          </button>
        )}
      </div>

      {/* Not while setting up: the wizard explains the tool a step at a time, and
          a second explainer above it competes with the step the reader is on. */}
      {!setupOpen && <ToolContext id="ai-prompt-tracker" />}

      {error && (
        <div className="card" style={{ padding: 16, marginBottom: 16, color: "var(--neg)", fontSize: 13 }}>
          {error}
        </div>
      )}

      {setupOpen ? (
        // No Cancel on a first run -- there is nothing behind it to go back to.
        <OnboardingWizard onCancel={firstRun ? undefined : () => setShowAdd(false)} />
      ) : (
        // Rows, not a three-column card grid. Most accounts track one or two
        // brands, and a fixed three-track grid gave a single brand a card a
        // third of the page wide with two empty thirds beside it -- the card
        // looked stranded because it WAS stranded. A row fills the width at
        // any count, and the assistant strip lines up down the list so four
        // brands compare on ChatGPT by reading straight down.
        <div className="llm-brands">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/dashboard/ai-prompt-tracker/${p.id}`}
              className="llm-brand-row"
            >
              <span className="llm-brand-id">
                <span className="llm-brand-name">{p.name}</span>
                <span className="tiny muted llm-brand-sub">
                  {p.brandName}
                  {p.brandDomain ? ` · ${p.brandDomain}` : ""}
                </span>
              </span>

              {/* How this brand scores on each assistant, so the difference
                  between them is visible before you open anything. */}
              <BrandEngines rates={p.platformRates ?? {}} />

              <span className="chip outline llm-brand-count">
                {p.promptCount} prompt{p.promptCount === 1 ? "" : "s"}
              </span>
              <Icon.chevR />
            </Link>
          ))}
        </div>
      )}

    </div>
  )
}