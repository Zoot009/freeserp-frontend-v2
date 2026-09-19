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

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>AI Prompt Tracker</h1>
          <div className="tiny muted">
            Ask the AI platforms what your buyers ask, and track whether you get named.
          </div>
        </div>
        <button className="btn primary" onClick={() => setShowAdd(true)}>
          <Icon.plus /> New brand
        </button>
      </div>

      <ToolContext id="ai-prompt-tracker" />

      {error && (
        <div className="card" style={{ padding: 16, marginBottom: 16, color: "var(--neg)", fontSize: 13 }}>
          {error}
        </div>
      )}

      {projects.length === 0 ? (
        <div className="llm-empty">
          <div className="eyebrow">
            <span className="spark">
              <Icon.spark />
            </span>{" "}
            Nothing tracked yet
          </div>
          <div className="b" style={{ margin: "8px 0 14px" }}>
            Add a brand, then the questions your buyers actually ask AI.
          </div>
          <button className="btn primary" onClick={() => setShowAdd(true)}>
            <Icon.plus /> New brand
          </button>
        </div>
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

      {showAdd && (
        <AddProjectModal
          onClose={() => setShowAdd(false)}
          onCreated={(p) => {
            setShowAdd(false)
            // ?new=1 opens the add-prompts modal straight away — a brand with no
            // prompts does nothing, so don't make them find the button.
            router.push(`/dashboard/ai-prompt-tracker/${p.id}?new=1`)
          }}
        />
      )}
    </div>
  )
}

/** Comma or newline separated free text → a deduped, trimmed list. */
function parseList(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  )
}

function AddProjectModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (p: ProjectSummary) => void
}) {
  const [name, setName] = useState("")
  const [brandName, setBrandName] = useState("")
  const [brandDomain, setBrandDomain] = useState("")
  const [aliasesRaw, setAliasesRaw] = useState("")
  const [competitorsRaw, setCompetitorsRaw] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const data = await api.post<ProjectSummary>("/api/llm-tracker/projects", {
        name: name.trim(),
        brandName: brandName.trim(),
        ...(brandDomain.trim() ? { brandDomain: brandDomain.trim() } : {}),
        brandAliases: parseList(aliasesRaw),
        competitorNames: parseList(competitorsRaw),
      })
      onCreated(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create brand")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <div className="t">New brand</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon.close />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-b" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="field">
              <label htmlFor="llm-name">Project name</label>
              <input
                id="llm-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My brand"
                required
                maxLength={120}
              />
            </div>
            <div className="field">
              <label htmlFor="llm-brand">Brand name</label>
              <input
                id="llm-brand"
                className="input"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="FreeSERP"
                required
                maxLength={120}
              />
              <div className="tiny muted" style={{ marginTop: 6 }}>
                Exactly how the brand is written. We match it as a whole word, so
                punctuation and casing are handled for you. A name made only of
                ordinary words (&ldquo;Free SERP&rdquo;) can&rsquo;t be told apart
                from an answer that just uses those words &mdash; add the domain
                below and we&rsquo;ll match on that instead.
              </div>
            </div>
            <div className="field">
              <label htmlFor="llm-domain">Domain (optional)</label>
              <input
                id="llm-domain"
                className="input"
                value={brandDomain}
                onChange={(e) => setBrandDomain(e.target.value)}
                placeholder="freeserp.com"
                maxLength={253}
              />
              <div className="tiny muted" style={{ marginTop: 6 }}>
                Used to tell a <em>citation</em> (AI linked to you) from a plain
                mention, and matched in the answer text too &mdash; a domain is the
                one name nobody else can use by accident. Subdomains count.
              </div>
            </div>
            <div className="field">
              <label htmlFor="llm-aliases">Other names (optional)</label>
              <textarea
                id="llm-aliases"
                className="input"
                rows={2}
                value={aliasesRaw}
                onChange={(e) => setAliasesRaw(e.target.value)}
                placeholder="FreeSERP, Free-SERP"
              />
              <div className="tiny muted" style={{ marginTop: 6 }}>
                One per line or comma separated. Add spellings the AI might use — a
                missed alias reads as &ldquo;not mentioned&rdquo;. Aliases that are
                just common words are ignored, for the same reason as above.
              </div>
            </div>
            <div className="field">
              <label htmlFor="llm-competitors">Competitors (optional)</label>
              <textarea
                id="llm-competitors"
                className="input"
                rows={2}
                value={competitorsRaw}
                onChange={(e) => setCompetitorsRaw(e.target.value)}
                placeholder="Ahrefs, Semrush, Nightwatch"
              />
              <div className="tiny muted" style={{ marginTop: 6 }}>
                Scored as share of voice — who gets named in the same answers.
              </div>
            </div>
            {error && <div className="tiny" style={{ color: "var(--neg)" }}>{error}</div>}
          </div>
          <div className="modal-f">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={loading || !name.trim() || !brandName.trim()}>
              {loading ? "Creating…" : "Create brand"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
