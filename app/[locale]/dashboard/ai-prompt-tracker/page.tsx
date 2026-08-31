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

// ───── Types (mirror /api/llm-tracker/projects) ─────────────────────────────
type ProjectSummary = {
  id: string
  name: string
  brandName: string
  brandDomain: string | null
  promptCount: number
  createdAt: string
}

export default function LlmPromptsPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [unavailable, setUnavailable] = useState<"" | "missing" | "no-access">("")
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
      else if (err instanceof ApiError && err.status === 403) setUnavailable("no-access")
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
          {unavailable === "no-access"
            ? "AI Prompt Tracker is in early access and your account isn't on the list yet. Contact us and we'll add you."
            : "Prompt tracking isn't available on this API version yet."}
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
        <div
          className="card"
          style={{
            border: "1px dashed var(--border-strong)",
            background: "transparent",
            textAlign: "center",
            padding: 40,
          }}
        >
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
        <div className="grid g-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/dashboard/ai-prompt-tracker/${p.id}`} className="card" style={{ display: "block" }}>
              <div className="card-h">
                <div>
                  <div className="t">{p.name}</div>
                  <div className="tiny muted">
                    {p.brandName}
                    {p.brandDomain ? ` · ${p.brandDomain}` : ""}
                  </div>
                </div>
                <span className="chip outline">
                  {p.promptCount} prompt{p.promptCount === 1 ? "" : "s"}
                </span>
              </div>
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
