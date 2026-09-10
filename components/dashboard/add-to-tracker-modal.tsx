"use client"

/**
 * "Add to rank tracker" — the shared destination for keywords discovered
 * somewhere else in the dashboard.
 *
 * Search Console and the Keyword Magic tool both end with a table of keywords
 * the user wants to start tracking, and both used to end there: the only way
 * across was to copy the terms out, open the project's Add-keywords modal, and
 * paste them back in. This is that hop, done in place.
 *
 * It deliberately does NOT reimplement the project page's Add-keywords modal.
 * That one is about COMPOSING a list (a textarea, autocomplete chips, AI
 * suggestions); this one is about CONFIRMING one that already exists — which
 * keywords, into which project, for which market — so its body is a checklist
 * rather than a text field.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { track } from "@/lib/analytics"
import { Icon } from "@/components/dashboard/icons"
import { Dropdown } from "@/components/dashboard/dropdown"
import { EnginePicker } from "@/components/dashboard/engine-picker"
import { LocationPicker } from "@/components/location-picker"
import { useEngines, DEFAULT_ENGINE } from "@/hooks/use-engines"
import { knownGeoCountry, useGeoCountry } from "@/hooks/use-geo-country"
import {
  fetchTrackedKeywords,
  isFullyTracked,
  normalizeKeyword,
  type TrackedSet,
} from "@/lib/tracked-keywords"

// Backend limits on POST /api/projects/:id/keywords: 100 keywords per request,
// and 200 rows after keyword x engine expansion. A 400-keyword selection is a
// normal thing to have here (Search Console returns hundreds), so the submit
// chunks rather than asking the user to trim to fit an API detail.
const MAX_KEYWORDS_PER_REQUEST = 100
const MAX_ROWS_PER_REQUEST = 200

// Same figure the project page quotes. Only feeds the engine picker's hint.
const FREE_DAILY_CHECKS = 3

type ProjectOption = { id: string; name: string; domain: string }

export type AddToTrackerSource = "search-console" | "keyword-magic"

export function AddToTrackerModal({
  keywords,
  projectId: fixedProjectId,
  projectLabel,
  source,
  defaultLocation,
  plan,
  onClose,
  onAdded,
}: {
  /** Candidate keywords, in the order the user saw them. All start ticked. */
  keywords: string[]
  /** Set when opened from inside a project — the picker is then not rendered. */
  projectId?: string
  /** Domain/name shown in place of the picker, when the project is fixed. */
  projectLabel?: string
  source: AddToTrackerSource
  /** Market the keywords came from (GSC country, Magic search country). */
  defaultLocation?: string
  /** "free" enables the engine picker's free-plan hint. */
  plan?: string
  onClose: () => void
  /** Fired after a successful add, with how many rows were actually created. */
  onAdded?: (added: number) => void
}) {
  const { engines: availableEngines, loading: enginesLoading } = useEngines()

  // ── project ────────────────────────────────────────────────────────────────
  const [projects, setProjects] = useState<ProjectOption[] | null>(null)
  const [chosenProject, setChosenProject] = useState<string>(fixedProjectId ?? "")
  useEffect(() => {
    if (fixedProjectId) return
    let cancelled = false
    api
      .get<ProjectOption[]>("/api/projects")
      .then((list) => {
        if (cancelled) return
        const rows = list ?? []
        setProjects(rows)
        // One project is not a choice — preselect it so the form is submittable
        // on open, which is the common case for a single-site account.
        if (rows.length > 0) setChosenProject((cur) => cur || rows[0]!.id)
      })
      .catch(() => {
        if (!cancelled) setProjects([])
      })
    return () => {
      cancelled = true
    }
  }, [fixedProjectId])
  const projectId = fixedProjectId ?? chosenProject

  // ── market / device / engines ──────────────────────────────────────────────
  // The keywords came from a market the user already chose once — Search
  // Console's property, or the Magic search's country — so that is the default
  // rather than the visitor's IP. Their own country is only the fallback.
  const { country: geoCountry, pending: geoPending } = useGeoCountry()
  const [location, setLocation] = useState(() => defaultLocation || knownGeoCountry() || "")
  const locationTouchedRef = useRef(false)
  useEffect(() => {
    if (!geoCountry || locationTouchedRef.current || location) return
    setLocation(geoCountry)
  }, [geoCountry, location])

  const [device, setDevice] = useState<"desktop" | "mobile">("desktop")
  const [selectedEngines, setSelectedEngines] = useState<string[]>([DEFAULT_ENGINE])

  // ── what the chosen project already tracks ─────────────────────────────────
  const [tracked, setTracked] = useState<TrackedSet | null>(null)
  useEffect(() => {
    if (!projectId) {
      setTracked(null)
      return
    }
    let cancelled = false
    setTracked(null)
    fetchTrackedKeywords(projectId)
      .then((set) => {
        if (!cancelled) setTracked(set)
      })
      // Non-fatal: without the set nothing is pre-marked, and the backend still
      // refuses duplicates. Better than blocking the add on a side lookup.
      .catch(() => {
        if (!cancelled) setTracked(new Set())
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  // De-duplicate the incoming list itself — "seo tools" and "SEO Tools" are one
  // keyword to the backend, and showing both invites ticking both.
  const candidates = useMemo(() => {
    const seen = new Set<string>()
    return keywords
      .map((k) => k.trim())
      .filter((k) => {
        if (!k) return false
        const n = normalizeKeyword(k)
        if (seen.has(n)) return false
        seen.add(n)
        return true
      })
  }, [keywords])

  const alreadyTracked = useCallback(
    (kw: string) => tracked != null && isFullyTracked(tracked, kw, selectedEngines),
    [tracked, selectedEngines],
  )

  // ── selection ──────────────────────────────────────────────────────────────
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  // Everything ticked on open. Rows the project already tracks are excluded at
  // submit time rather than here, so ticking one back on stays possible when the
  // engine choice changes what "already tracked" means.
  const selected = useMemo(
    () => candidates.filter((k) => !excluded.has(k) && !alreadyTracked(k)),
    [candidates, excluded, alreadyTracked],
  )
  const trackedCount = useMemo(() => candidates.filter(alreadyTracked).length, [candidates, alreadyTracked])

  const toggle = (kw: string) =>
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(kw)) next.delete(kw)
      else next.add(kw)
      return next
    })
  const selectAll = () => setExcluded(new Set())
  const clearAll = () => setExcluded(new Set(candidates))

  // ── submit ─────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const rowsPerKeyword = Math.max(1, selectedEngines.length)
  const totalRows = selected.length * rowsPerKeyword
  const chunkSize = Math.max(1, Math.min(MAX_KEYWORDS_PER_REQUEST, Math.floor(MAX_ROWS_PER_REQUEST / rowsPerKeyword)))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId) {
      setError("Choose a project to track these keywords in.")
      return
    }
    if (selected.length === 0) {
      setError("Pick at least one keyword.")
      return
    }
    if (!location) {
      setError("Pick a search location — we couldn't detect yours.")
      return
    }
    setError("")
    setLoading(true)
    // Declared outside the try: a batch that fails halfway has still created
    // rows, and both the error message and the caller's refresh need the count.
    let added = 0
    try {
      // Sequential, not Promise.all: each request is checked against the plan's
      // keyword cap and the daily add budget, and firing twenty at once would
      // race those counters into either a false rejection or an overshoot.
      for (let i = 0; i < selected.length; i += chunkSize) {
        const batch = selected.slice(i, i + chunkSize)
        const res = await api.post<{ added?: number }>(`/api/projects/${projectId}/keywords`, {
          keywords: batch.map((keyword) => ({ keyword, location, device, engines: selectedEngines })),
        })
        added += res?.added ?? 0
      }
      if (added === 0) {
        toast.info("Those keywords are already tracked on the engines you picked.")
      } else if (added < totalRows) {
        toast.success(`Added ${added} — the rest were already tracked.`)
      } else {
        toast.success(`Added ${added} keyword${added === 1 ? "" : "s"} to the rank tracker.`)
      }
      track("keywords_added", { projectId, count: selected.length, source })
      onAdded?.(added)
      onClose()
    } catch (err: unknown) {
      // A 402 (plan cap / daily add budget) has already opened the global upsell
      // modal via the api client; the message still belongs here, because a
      // partial run needs to say how far it got.
      // Stopping at batch four of six with no mention of the first three would
      // leave the user re-adding keywords that are already tracked.
      const message = err instanceof Error ? err.message : "Failed to add keywords"
      setError(added > 0 ? `${message} (${added} added before this stopped.)` : message)
      // Tell the caller anyway, so what did land is reflected on the page behind
      // the modal — the rows now tracked should come back marked.
      if (added > 0) onAdded?.(added)
    } finally {
      setLoading(false)
    }
  }

  const noProjects = !fixedProjectId && projects != null && projects.length === 0

  return (
    <div className="fs-app">
      <div className="modal-bg" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
          <div className="modal-h">
            <div>
              <div className="eyebrow" style={{ margin: 0, fontSize: 11 }}>
                <span className="spark"><Icon.spark /></span> TRACK KEYWORDS
              </div>
              <div className="b" style={{ fontSize: 18, marginTop: 4 }}>Add to rank tracker</div>
            </div>
            <button type="button" onClick={onClose} className="icon-btn" aria-label="Close"><Icon.close /></button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="modal-b" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Project — only when the caller isn't already inside one. */}
              {!fixedProjectId && (
                <div className="field">
                  <label>Project</label>
                  {noProjects ? (
                    <p className="tiny muted" style={{ margin: 0 }}>
                      You don&rsquo;t have a project yet.{" "}
                      <Link href="/dashboard/projects" style={{ color: "var(--brand)" }}>
                        Create one
                      </Link>{" "}
                      to start tracking these keywords.
                    </p>
                  ) : (
                    <Dropdown
                      block
                      portal
                      menuAlign="left"
                      value={chosenProject}
                      placeholder={projects == null ? "Loading projects…" : "Select a project…"}
                      options={(projects ?? []).map((p) => ({ value: p.id, label: p.domain || p.name }))}
                      onChange={setChosenProject}
                      disabled={loading || projects == null}
                      ariaLabel="Project"
                    />
                  )}
                </div>
              )}
              {fixedProjectId && projectLabel && (
                <div className="field">
                  <label>Project</label>
                  <span className="sm mono">{projectLabel}</span>
                </div>
              )}

              <EnginePicker
                engines={availableEngines}
                loading={enginesLoading}
                value={selectedEngines}
                onChange={setSelectedEngines}
                keywordCount={selected.length}
                isFree={plan === "free"}
                freeDailyChecks={FREE_DAILY_CHECKS}
                device={device}
              />

              {/* The checklist. Capped in height and scrolled: a Search Console
                  selection can run to hundreds of rows, and the market/device
                  fields below it must stay reachable without scrolling past all
                  of them. */}
              <div className="field">
                <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <label style={{ margin: 0 }}>
                    Keywords{" "}
                    <span className="muted" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
                      ({selected.length} of {candidates.length} selected)
                    </span>
                  </label>
                  <span className="row" style={{ gap: 8 }}>
                    <button
                      type="button"
                      className="tiny"
                      onClick={selectAll}
                      style={{ background: "none", border: "none", padding: 0, color: "var(--brand)", cursor: "pointer", fontWeight: 500 }}
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      className="tiny"
                      onClick={clearAll}
                      style={{ background: "none", border: "none", padding: 0, color: "var(--text-mute)", cursor: "pointer", fontWeight: 500 }}
                    >
                      Clear
                    </button>
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 6,
                    maxHeight: 220,
                    overflowY: "auto",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: 8,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  {candidates.map((kw) => {
                    const dupe = alreadyTracked(kw)
                    return (
                      <label
                        key={kw}
                        title={dupe ? "Already tracked in this project" : kw}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "4px 6px",
                          borderRadius: 6,
                          fontSize: 13,
                          cursor: dupe ? "default" : "pointer",
                          opacity: dupe ? 0.55 : 1,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={!dupe && !excluded.has(kw)}
                          disabled={dupe}
                          onChange={() => toggle(kw)}
                        />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{kw}</span>
                        {dupe && <span className="tag" style={{ marginLeft: "auto", flexShrink: 0 }}>Tracked</span>}
                      </label>
                    )
                  })}
                </div>
                {trackedCount > 0 && (
                  <span className="tiny muted" style={{ marginTop: 6 }}>
                    {trackedCount} already tracked here — those are skipped.
                  </span>
                )}
                {totalRows > MAX_KEYWORDS_PER_REQUEST && (
                  <span className="tiny muted" style={{ marginTop: 4 }}>
                    Added in batches of {chunkSize}; this may take a few seconds.
                  </span>
                )}
              </div>

              <div className="field">
                <label>Search location{!location && " *"}</label>
                <LocationPicker
                  value={location}
                  onChange={(code) => {
                    locationTouchedRef.current = true
                    setLocation(code)
                  }}
                  variant="dashboard"
                  showFlags
                  placeholder={geoPending ? "Detecting your location…" : "Select a location"}
                />
                <span className="tiny muted" style={{ marginTop: 6 }}>
                  Rankings are checked against this market — a keyword keeps the location it was added with.
                </span>
              </div>

              <div className="field">
                <label>Device</label>
                <div className="pill-toggle" style={{ width: "fit-content" }}>
                  {(["desktop", "mobile"] as const).map((d) => (
                    <button key={d} type="button" onClick={() => setDevice(d)} className={device === d ? "active" : ""}>
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Outside .modal-b, so a failed submit is never scrolled out of
                sight on a short viewport — same reasoning as the project page's
                Add-keywords modal. */}
            {error && (
              <div
                role="alert"
                style={{
                  flexShrink: 0,
                  padding: "10px 22px",
                  borderTop: "1px solid var(--neg)",
                  background: "var(--neg-soft)",
                  color: "var(--neg)",
                  fontSize: 12,
                }}
              >
                {error}
              </div>
            )}

            <div className="modal-f">
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
              <button
                type="submit"
                className="btn primary"
                disabled={loading || !projectId || selected.length === 0 || selectedEngines.length === 0 || !location}
                title={!location ? "Pick a search location first" : undefined}
              >
                {loading
                  ? "Adding…"
                  : selected.length > 0
                    ? `Add ${selected.length} keyword${selected.length === 1 ? "" : "s"}`
                    : "Add keywords"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
