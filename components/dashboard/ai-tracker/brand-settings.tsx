"use client"

/**
 * Edit the brand a project scores against — and delete it.
 *
 * The tracker shipped with no way to change any of this. That was worse than a
 * missing form, because the API has always returned `brandTerms.ignored` so the
 * UI could tell a user "these words are too generic to count, add something
 * distinctive" — advice there was then no way to act on. This modal is the other
 * half of that sentence.
 *
 * Editing a scoring field re-scores the brand's whole history against the new
 * configuration, so the numbers on screen stop disagreeing with the settings
 * that produced them. That costs nothing: every answer is already stored, and
 * the recompute never calls an assistant.
 */

import { useMemo, useState } from "react"
import { api } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"

/** Comma or newline separated free text into a deduped, trimmed list. */
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

/**
 * The terms the scorer will actually match on, as the API derives them.
 *
 * `ignored` is the interesting half: terms dropped for being ordinary words that
 * any answer on the topic would contain. Surfacing it is the whole point — a 0%
 * mention rate reads as a bug until you can see WHY a term wasn't counted.
 */
export type BrandTerms = { matched: string[]; ignored: string[] }

export type EditableProject = {
  id: string
  name: string
  brandName: string
  brandDomain: string | null
  brandAliases?: string[]
  competitorNames: string[]
  competitorDomains?: string[]
  brandTerms?: BrandTerms
}

export function BrandSettingsModal({
  project,
  onClose,
  onSaved,
  onDeleted,
}: {
  project: EditableProject
  onClose: () => void
  /** `rescoring` is the server's answer to "will the history move?". */
  onSaved: (project: EditableProject, rescoring: boolean) => void
  onDeleted: () => void
}) {
  const [name, setName] = useState(project.name)
  const [brandName, setBrandName] = useState(project.brandName)
  const [brandDomain, setBrandDomain] = useState(project.brandDomain ?? "")
  const [aliasesRaw, setAliasesRaw] = useState((project.brandAliases ?? []).join("\n"))
  const [competitorsRaw, setCompetitorsRaw] = useState((project.competitorNames ?? []).join("\n"))
  const [competitorDomainsRaw, setCompetitorDomainsRaw] = useState(
    (project.competitorDomains ?? []).join("\n"),
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const ignored = project.brandTerms?.ignored ?? []

  /**
   * Only the fields that actually changed.
   *
   * Load-bearing, not an optimisation. The server decides whether to re-score by
   * asking which SCORING fields are present in the request — so a modal that
   * always posts all six would make every save, including a pure rename, look
   * like a scoring change and kick off a rescore that has nothing to do. Sending
   * a real diff is what makes the server's `rescoring` answer honest, and it is
   * what the user sees reflected in the banner.
   */
  const patch = useMemo(() => {
    const sameList = (a: string[], b: string[]) =>
      a.length === b.length && a.every((v, i) => v === b[i])
    const out: Record<string, unknown> = {}
    if (name.trim() !== project.name) out.name = name.trim()
    if (brandName.trim() !== project.brandName) out.brandName = brandName.trim()
    // Empty clears the domain, which is a real instruction — hence null rather
    // than an omitted key.
    if (brandDomain.trim() !== (project.brandDomain ?? "")) {
      out.brandDomain = brandDomain.trim() || null
    }
    const aliases = parseList(aliasesRaw)
    if (!sameList(aliases, project.brandAliases ?? [])) out.brandAliases = aliases
    const competitors = parseList(competitorsRaw)
    if (!sameList(competitors, project.competitorNames ?? [])) out.competitorNames = competitors
    const competitorDomains = parseList(competitorDomainsRaw)
    if (!sameList(competitorDomains, project.competitorDomains ?? [])) {
      out.competitorDomains = competitorDomains
    }
    return out
  }, [
    name,
    brandName,
    brandDomain,
    aliasesRaw,
    competitorsRaw,
    competitorDomainsRaw,
    project,
  ])

  // The server rejects an empty patch ("Nothing to update"), so the button is
  // disabled rather than letting the user press it for a 400.
  const dirty = Object.keys(patch).length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const data = await api.patch<EditableProject & { rescoring: boolean }>(
        `/api/llm-tracker/projects/${project.id}`,
        patch,
      )
      onSaved(data, data.rescoring)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    setError("")
    setLoading(true)
    try {
      await api.delete(`/api/llm-tracker/projects/${project.id}`)
      onDeleted()
    } catch (err: unknown) {
      // The server refuses while runs are in flight, so a credit hold is never
      // stranded. That message is worth showing verbatim.
      setError(err instanceof Error ? err.message : "Failed to delete")
      setConfirmingDelete(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <div className="t">Brand settings</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon.close />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-b" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="tiny muted">
              Changing anything we score against re-checks every answer already
              collected, so your history matches these settings. It costs nothing
              &mdash; we re-read answers you have already paid for.
            </div>

            {ignored.length > 0 && (
              <div
                className="tiny"
                style={{
                  padding: 10,
                  borderRadius: 8,
                  background: "var(--warn-bg, rgba(255,180,0,.08))",
                  border: "1px solid var(--border)",
                }}
              >
                <b>Not counted:</b> {ignored.join(", ")}
                <div className="muted" style={{ marginTop: 4 }}>
                  These are ordinary words that appear in almost any answer on
                  this topic, so finding them would not prove an assistant knows
                  the brand. Add a domain or a distinctive alias below and it will
                  be matched on that instead.
                </div>
              </div>
            )}

            <div className="field">
              <label htmlFor="llm-edit-name">Project name</label>
              <input
                id="llm-edit-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={120}
              />
              <div className="tiny muted" style={{ marginTop: 6 }}>
                Labelling only &mdash; nothing is scored against it, so changing
                it never moves a number.
              </div>
            </div>

            <div className="field">
              <label htmlFor="llm-edit-brand">Brand name</label>
              <input
                id="llm-edit-brand"
                className="input"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                required
                maxLength={120}
              />
            </div>

            <div className="field">
              <label htmlFor="llm-edit-domain">Domain</label>
              <input
                id="llm-edit-domain"
                className="input"
                value={brandDomain}
                onChange={(e) => setBrandDomain(e.target.value)}
                placeholder="freeserp.com"
                maxLength={253}
              />
              <div className="tiny muted" style={{ marginTop: 6 }}>
                Tells a <em>citation</em> (an assistant linked to you) from a plain
                mention. Subdomains count. Leave empty to remove it.
              </div>
            </div>

            <div className="field">
              <label htmlFor="llm-edit-aliases">Other names</label>
              <textarea
                id="llm-edit-aliases"
                className="input"
                rows={2}
                value={aliasesRaw}
                onChange={(e) => setAliasesRaw(e.target.value)}
                placeholder="FreeSERP, Free-SERP"
              />
              <div className="tiny muted" style={{ marginTop: 6 }}>
                One per line or comma separated. A missed alias reads as
                &ldquo;not mentioned&rdquo;.
              </div>
            </div>

            <div className="field">
              <label htmlFor="llm-edit-competitors">Competitors</label>
              <textarea
                id="llm-edit-competitors"
                className="input"
                rows={2}
                value={competitorsRaw}
                onChange={(e) => setCompetitorsRaw(e.target.value)}
                placeholder="Ahrefs, Semrush"
              />
              <div className="tiny muted" style={{ marginTop: 6 }}>
                Scored as share of voice &mdash; who gets named in the same
                answers as you.
              </div>
            </div>

            <div className="field">
              <label htmlFor="llm-edit-competitor-domains">Competitor domains</label>
              <textarea
                id="llm-edit-competitor-domains"
                className="input"
                rows={2}
                value={competitorDomainsRaw}
                onChange={(e) => setCompetitorDomainsRaw(e.target.value)}
                placeholder="ahrefs.com, semrush.com"
              />
              <div className="tiny muted" style={{ marginTop: 6 }}>
                Stored against each rival for citation reporting.
              </div>
            </div>

            {error && <div className="tiny" style={{ color: "var(--neg)" }}>{error}</div>}

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              {confirmingDelete ? (
                <div className="tiny">
                  <b>Delete {project.name}?</b> Every prompt, run and stored answer
                  for this brand goes with it. This cannot be undone.
                  <div className="row" style={{ gap: 8, marginTop: 8 }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setConfirmingDelete(false)}
                      disabled={loading}
                    >
                      Keep it
                    </button>
                    <button
                      type="button"
                      className="btn"
                      style={{ color: "var(--neg)" }}
                      onClick={() => void handleDelete()}
                      disabled={loading}
                    >
                      <Icon.trash /> Delete permanently
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn"
                  style={{ color: "var(--neg)" }}
                  onClick={() => setConfirmingDelete(true)}
                  disabled={loading}
                >
                  <Icon.trash /> Delete brand
                </button>
              )}
            </div>
          </div>
          <div className="modal-f">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn primary"
              disabled={loading || !dirty || !name.trim() || !brandName.trim()}
            >
              {loading ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
