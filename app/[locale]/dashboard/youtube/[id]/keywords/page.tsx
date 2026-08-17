"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { Link, useRouter } from "@/i18n/navigation"
import { useAuth } from "@/lib/auth"
import { api, ApiError } from "@/lib/api"
import { Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Icon } from "@/components/dashboard/icons"
import { DeltaCell } from "@/components/dashboard/primitives"
import { LocationPicker } from "@/components/location-picker"
import { Flag } from "@/components/flag"
import {
  BlockChip,
  OwnedCountBadge,
  VideoMetaCell,
  VolatilityNote,
  YtPosCell,
  thumbnailFor,
  type YtKeywordRow,
} from "@/components/dashboard/youtube"

interface YtProject {
  id: string
  name: string
  targetType: "CHANNEL" | "VIDEO"
  targetRaw: string
  targetLabel: string | null
  targetChannelId: string | null
  targetVideoId: string | null
  targetMatchStrategy: string | null
  defaultDepth: number
  autoCheckEnabled: boolean
  isPaused: boolean
  checkFrequency: number
  nextScheduledCheck: string | null
  keywords: YtKeywordRow[]
}

interface LocationsResponse {
  locations: { code: number; name: string; iso2: string; defaultLanguage: string }[]
  languages: string[]
  depths: number[]
}

type SortKey = "kw" | "pos" | "abs" | "d1" | "views" | "checkedAt"

const FREQ_CHOICES = [24, 168, 360, 720]
const ACTIVE_STATUSES = new Set(["PENDING", "PROCESSING"])

function freqLabel(hours: number): string {
  if (hours === 24) return "Daily"
  if (hours === 168) return "Weekly"
  if (hours === 360) return "Every 15 days"
  if (hours === 720) return "Monthly"
  return `Every ${hours}h`
}

function SortHeader({
  label,
  k,
  sort,
  onClick,
  width,
  title,
}: {
  label: string
  k: SortKey
  sort: { key: SortKey; dir: "asc" | "desc" }
  onClick: (k: SortKey) => void
  width?: number
  title?: string
}) {
  const active = sort.key === k
  return (
    <th onClick={() => onClick(k)} title={title} style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", width }}>
      {label}
      {active && <span style={{ color: "var(--brand)", marginLeft: 4 }}>{sort.dir === "asc" ? "↑" : "↓"}</span>}
    </th>
  )
}

// ───── Add keywords modal ──────────────────────────────────────────────────

function AddKeywordsModal({
  projectId,
  defaultDepth,
  onClose,
  onAdded,
}: {
  projectId: string
  defaultDepth: number
  onClose: () => void
  onAdded: () => void
}) {
  const [text, setText] = useState("")
  const [locationCode, setLocationCode] = useState(2840)
  const [languageCode, setLanguageCode] = useState("en")
  const [depth, setDepth] = useState<number | "">("")
  const [meta, setMeta] = useState<LocationsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    api
      .get<LocationsResponse>("/api/youtube/locations")
      .then(setMeta)
      .catch(() => setMeta(null))
  }, [])

  const keywords = useMemo(
    () =>
      Array.from(
        new Set(
          text
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean),
        ),
      ),
    [text],
  )
  const effectiveDepth = depth === "" ? defaultDepth : depth

  // Location and language are chosen INDEPENDENTLY here, unlike the Google side
  // where language is derived from the market. Default the language to the
  // market's primary one so the common case is one click.
  const onLocationChange = (iso2: string) => {
    const match = meta?.locations.find((l) => l.iso2 === iso2)
    if (match) {
      setLocationCode(match.code)
      setLanguageCode(match.defaultLanguage)
    }
  }
  const currentIso = meta?.locations.find((l) => l.code === locationCode)?.iso2 ?? "us"

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      await api.post(`/api/youtube/projects/${projectId}/keywords`, {
        keywords,
        locationCode,
        languageCode,
        device: "desktop",
        ...(depth === "" ? {} : { depth }),
      })
      onAdded()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add keywords")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <div className="t">Add keywords</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon.close />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-b">
            <div className="field">
              <label htmlFor="yt-kws">Keywords (one per line, up to 100)</label>
              <textarea
                id="yt-kws"
                className="input"
                rows={7}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={"how to tie a tie\nbest running shoes review"}
                required
              />
            </div>

            <div className="grid g-2">
              <div className="field">
                <label>Search location</label>
                <LocationPicker value={currentIso} onChange={onLocationChange} variant="dashboard" showFlags />
              </div>
              <div className="field">
                <label htmlFor="yt-lang">Language</label>
                <select
                  id="yt-lang"
                  className="input"
                  value={languageCode}
                  onChange={(e) => setLanguageCode(e.target.value)}
                >
                  {(meta?.languages ?? ["en"]).map((l) => (
                    <option key={l} value={l}>
                      {l.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="yt-kw-depth">Results to check</label>
              <select
                id="yt-kw-depth"
                className="input"
                value={depth}
                onChange={(e) => setDepth(e.target.value === "" ? "" : Number(e.target.value))}
              >
                <option value="">Use project default (Top {defaultDepth})</option>
                {(meta?.depths ?? [20, 40, 60]).map((d) => (
                  <option key={d} value={d}>
                    Top {d}
                  </option>
                ))}
              </select>
            </div>

            {keywords.length > 0 && (
              <div className="tiny muted">
                {keywords.length} keyword{keywords.length === 1 ? "" : "s"} × Top {effectiveDepth} ≈ {keywords.length}{" "}
                check{keywords.length === 1 ? "" : "s"} from today&apos;s allowance.
              </div>
            )}
            {error && (
              <div className="tiny" style={{ color: "var(--neg)" }}>
                {error}
              </div>
            )}
          </div>
          <div className="modal-f">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={loading || keywords.length === 0}>
              {loading ? "Adding…" : `Add ${keywords.length || ""}`.trim()}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ───── Page ────────────────────────────────────────────────────────────────

export default function YoutubeKeywordsPage() {
  const params = useParams<{ id: string }>()
  const projectId = params.id
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const [project, setProject] = useState<YtProject | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [filter, setFilter] = useState("")
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "pos", dir: "asc" })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showAddKw, setShowAddKw] = useState(false)
  const [lockedKwIds, setLockedKwIds] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const openedNew = useRef(false)

  useEffect(() => {
    if (!authLoading && !user) router.push("/login")
  }, [user, authLoading, router])

  const load = useCallback(
    async (silent = false): Promise<YtProject | null> => {
      if (!silent) setLoading(true)
      try {
        const data = await api.get<YtProject>(`/api/youtube/projects/${projectId}`)
        setProject(data)
        return data
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 404) {
          router.replace("/dashboard/youtube")
          return null
        }
        // Background polls must never surface an error banner over good data.
        if (!silent) setError(err instanceof Error ? err.message : "Failed to load project")
        return null
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [projectId, router],
  )

  useEffect(() => {
    void load()
  }, [load])

  // ?new=1 from the create flow — open the add-keywords modal once.
  useEffect(() => {
    if (searchParams.get("new") === "1" && !openedNew.current && project) {
      openedNew.current = true
      if (project.keywords.length === 0) setShowAddKw(true)
    }
  }, [searchParams, project])

  // Poll while any check is in flight. Same 3s cadence as the Google table.
  const hasActive = (project?.keywords ?? []).some((k) => k.status && ACTIVE_STATUSES.has(k.status))
  useEffect(() => {
    if (!hasActive) return
    const id = setInterval(() => void load(true), 3000)
    return () => clearInterval(id)
  }, [hasActive, load])

  const rows = useMemo(() => {
    let list = project?.keywords ?? []
    if (filter.trim()) {
      const needle = filter.toLowerCase()
      list = list.filter(
        (r) => r.keyword.toLowerCase().includes(needle) || (r.topVideoTitle ?? "").toLowerCase().includes(needle),
      )
    }
    const dir = sort.dir === "asc" ? 1 : -1
    const value: Record<Exclude<SortKey, "kw" | "checkedAt">, (r: YtKeywordRow) => number> = {
      // Unranked sorts last regardless of direction intent — a missing position
      // is not "position 0".
      pos: (r) => r.bestVideoPosition ?? 9999,
      abs: (r) => r.bestRankAbsolute ?? 9999,
      d1: (r) => r.d1 ?? 0,
      views: (r) => r.topViews ?? -1,
    }
    return [...list].sort((a, b) => {
      if (sort.key === "kw") return a.keyword.localeCompare(b.keyword) * dir
      if (sort.key === "checkedAt") {
        return ((a.checkedAt ? Date.parse(a.checkedAt) : 0) - (b.checkedAt ? Date.parse(b.checkedAt) : 0)) * dir
      }
      return (value[sort.key](a) - value[sort.key](b)) * dir
    })
  }, [project, filter, sort])

  const clickSort = (k: SortKey) =>
    setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === "asc" ? "desc" : "asc") : k === "kw" ? "asc" : "desc" }))

  const runCheck = async (keywordIds?: string[]) => {
    setBusy(true)
    try {
      const res = await api.post<{ scheduled: number; skippedKeywordIds?: string[] }>(
        `/api/youtube/projects/${projectId}/check`,
        keywordIds ? { keywordIds } : {},
      )
      // A partial run comes back with the keywords the quota couldn't cover —
      // mark them locked rather than pretending they were checked.
      setLockedKwIds(new Set(res?.skippedKeywordIds ?? []))
      setSelected(new Set())
      setTimeout(() => void load(true), 1500)
    } catch (err: unknown) {
      // 402 is handled globally by the quota upsell modal via the api client.
      if (!(err instanceof ApiError && err.status === 402)) {
        setError(err instanceof Error ? err.message : "Failed to start check")
      }
    } finally {
      setBusy(false)
    }
  }

  const updateFrequency = async (choice: number | "off") => {
    try {
      const body = choice === "off" ? { autoCheckEnabled: false } : { autoCheckEnabled: true, checkFrequency: choice }
      const data = await api.patch<Partial<YtProject>>(`/api/youtube/projects/${projectId}/frequency`, body)
      setProject((prev) => (prev ? { ...prev, ...data } : prev))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update schedule")
    }
  }

  const deleteKeyword = async (kwId: string) => {
    setProject((prev) => (prev ? { ...prev, keywords: prev.keywords.filter((k) => k.id !== kwId) } : prev))
    try {
      await api.delete(`/api/youtube/projects/${projectId}/keywords/${kwId}`)
    } finally {
      void load(true)
    }
  }

  if (authLoading || (loading && !project)) {
    return (
      <div className="page" style={{ color: "var(--text-mute)", fontSize: 13, padding: 60, textAlign: "center" }}>
        Loading project…
      </div>
    )
  }
  if (!project) {
    return (
      <div className="page" style={{ color: "var(--neg)", fontSize: 13, padding: 60, textAlign: "center" }}>
        {error || "Project not found"}
      </div>
    )
  }

  const targetHref =
    project.targetType === "VIDEO" && project.targetVideoId
      ? `https://www.youtube.com/watch?v=${project.targetVideoId}`
      : project.targetChannelId
        ? `https://www.youtube.com/channel/${project.targetChannelId}`
        : null

  return (
    <div className="page">
      {/* Headed like the Google project page: 26px title, the target on one
          muted line beneath it, actions right. It was a 14px .t with the target
          scattered across chips and links, so the project name read smaller
          than the table headings under it. */}
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="truncate text-[26px] font-bold leading-tight tracking-[-0.02em]">
            {project.name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
            <span>{project.targetType === "CHANNEL" ? "Channel" : "Video"}</span>
            <span aria-hidden>·</span>
            {targetHref ? (
              <a
                href={targetHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
              >
                {project.targetLabel ?? project.targetRaw}
                <Icon.external size={11} />
              </a>
            ) : (
              <span>{project.targetLabel ?? project.targetRaw}</span>
            )}
            {/* Kept prominent: a name-only match means the numbers may belong to
                a different channel with a similar name, which matters more than
                anything else on this page. */}
            {project.targetMatchStrategy === "channel_name" && (
              <span
                className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400"
                title="Matched by channel name until a check resolves the channel ID."
              >
                Fuzzy match
              </span>
            )}
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setShowAddKw(true)}
            className="h-[38px] gap-1.5 rounded-[9px] text-sm font-semibold"
          >
            <Icon.plus /> Add keywords
          </Button>
          <Button
            disabled={busy || project.keywords.length === 0}
            onClick={() => runCheck(selected.size > 0 ? [...selected] : undefined)}
            className="h-[38px] gap-1.5 rounded-[9px] text-sm font-semibold"
          >
            <Icon.refresh /> {selected.size > 0 ? `Check ${selected.size}` : "Run check"}
          </Button>
        </div>
      </div>

      <div className="mb-3 rounded-xl border bg-card p-3.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filter keywords…"
              aria-label="Filter keywords"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-9 w-52 rounded-lg pl-8 pr-8 text-[13px] sm:w-60"
            />
            {/* A filter you can't see the edge of is one people forget is on,
                then read the shortened table as missing keywords. */}
            {filter && (
              <button
                type="button"
                onClick={() => setFilter("")}
                aria-label="Clear filter"
                className="absolute right-2 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Native select kept — this sets the check schedule, and a real select
              gets the platform's own picker on mobile. Styled to match Input. */}
          <select
            aria-label="Check frequency"
            value={project.autoCheckEnabled ? project.checkFrequency : "off"}
            onChange={(e) => updateFrequency(e.target.value === "off" ? "off" : Number(e.target.value))}
            className="h-9 rounded-lg border border-input bg-background px-2.5 text-[13px] shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="off">Manual checks only</option>
            {FREQ_CHOICES.map((h) => (
              <option key={h} value={h}>
                {freqLabel(h)}
              </option>
            ))}
          </select>

          <span
            className="ml-auto rounded-md border border-border/60 bg-muted/60 px-2 py-1 text-xs text-muted-foreground"
            title={`New keywords check the top ${project.defaultDepth} results unless set otherwise`}
          >
            Top {project.defaultDepth} by default
          </span>
        </div>
        {/* Disclaimer #1 of 3 — persistent, right above the numbers it qualifies. */}
        <VolatilityNote compact />
      </div>

      {error && (
        <div className="card tight" style={{ color: "var(--neg)", fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {rows.length === 0 ? (
          <div style={{ padding: "40px 32px", textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
            {filter.trim() ? `No keywords match “${filter}”.` : "No keywords yet — add some to start tracking."}
          </div>
        ) : (
          <div className="tbl-scroll">
            <table className="tbl" style={{ minWidth: 1180 }}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      checked={selected.size > 0 && selected.size === rows.length}
                      onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                      aria-label="Select all"
                    />
                  </th>
                  <SortHeader label="Keyword" k="kw" sort={sort} onClick={clickSort} />
                  <SortHeader
                    label="Position"
                    k="pos"
                    sort={sort}
                    onClick={clickSort}
                    width={150}
                    title="Rank among standalone organic videos — ads, Shorts shelves, playlist and channel blocks are excluded."
                  />
                  <SortHeader
                    label="Abs."
                    k="abs"
                    sort={sort}
                    onClick={clickSort}
                    width={70}
                    title="Position in the full result list, including ads and shelves."
                  />
                  <th style={{ width: 90 }}>Block</th>
                  <th style={{ width: "24%" }}>Ranking video</th>
                  <SortHeader label="Video stats" k="views" sort={sort} onClick={clickSort} width={180} />
                  <th style={{ width: 90 }} title="How deep this keyword was checked">
                    Depth
                  </th>
                  <SortHeader label="Last checked" k="checkedAt" sort={sort} onClick={clickSort} width={130} />
                  <th style={{ width: 110 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((k) => {
                  const isActive = k.status != null && ACTIVE_STATUSES.has(k.status)
                  const thumb = thumbnailFor(k.topVideoId)
                  return (
                    <tr key={k.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(k.id)}
                          onChange={(e) =>
                            setSelected((prev) => {
                              const next = new Set(prev)
                              if (e.target.checked) next.add(k.id)
                              else next.delete(k.id)
                              return next
                            })
                          }
                          aria-label={`Select ${k.keyword}`}
                        />
                      </td>
                      <td>
                        <Link href={`/dashboard/youtube/${projectId}/keywords/${k.id}`}>{k.keyword}</Link>
                        <div className="row tiny muted" style={{ gap: 5, alignItems: "center", marginTop: 2 }}>
                          {/* Location AND language must both be visible — two rows
                              with the same keyword and market can differ only by
                              language, which is legal here and not on Google. */}
                          <Flag code={k.locationIso2} />
                          <span>{k.locationLabel}</span>
                          <span className="chip outline">{k.languageCode.toUpperCase()}</span>
                        </div>
                      </td>
                      <td>
                        {lockedKwIds.has(k.id) ? (
                          <Link href="/pricing?clicked-buy-button" className="chip warn">
                            <Icon.lock size={11} /> Locked
                          </Link>
                        ) : (
                          <div className="row" style={{ gap: 6, alignItems: "center" }}>
                            <YtPosCell
                              position={k.bestVideoPosition}
                              notInTop={k.notInTop}
                              depth={k.checkedDepth}
                              processing={isActive}
                              checked={!!k.checkedAt}
                            />
                            {k.bestVideoPosition != null && k.d1 != null && k.d1 !== 0 && (
                              <DeltaCell from={k.bestVideoPosition + k.d1} to={k.bestVideoPosition} />
                            )}
                            <OwnedCountBadge count={k.ownedCount} />
                          </div>
                        )}
                      </td>
                      <td className="tabular muted tiny">{k.bestRankAbsolute ?? "—"}</td>
                      <td>
                        <BlockChip blockName={k.topBlockName} itemType={k.topItemType} />
                      </td>
                      <td>
                        {k.topVideoUrl ? (
                          <div className="row" style={{ gap: 8, alignItems: "center" }}>
                            {thumb && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={thumb}
                                alt=""
                                width={48}
                                height={27}
                                loading="lazy"
                                style={{ borderRadius: 3, objectFit: "cover", flexShrink: 0 }}
                              />
                            )}
                            <a
                              href={k.topVideoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="tiny"
                              title={k.topVideoTitle ?? undefined}
                            >
                              {k.topVideoTitle ?? k.topVideoUrl}
                            </a>
                          </div>
                        ) : (
                          <span className="tiny muted">—</span>
                        )}
                      </td>
                      <td>
                        <VideoMetaCell
                          views={k.topViews}
                          publishedAt={k.topPublishedAt}
                          durationSeconds={k.topDurationSeconds}
                        />
                      </td>
                      <td>
                        <span className="chip outline tiny">Top {k.checkedDepth ?? k.depth ?? project.defaultDepth}</span>
                      </td>
                      <td className="tiny muted">
                        {k.checkedAt ? new Date(k.checkedAt).toLocaleDateString() : "—"}
                      </td>
                      <td>
                        <div className="row" style={{ gap: 4 }}>
                          <button
                            className="icon-btn"
                            title="Check now"
                            disabled={busy || isActive}
                            onClick={() => runCheck([k.id])}
                          >
                            <Icon.refresh />
                          </button>
                          {k.latestCheckId && (
                            <Link
                              href={`/dashboard/youtube/${projectId}/keywords/${k.id}?tab=serp`}
                              className="icon-btn"
                              title="SERP snapshot"
                            >
                              <Icon.search size={13} />
                            </Link>
                          )}
                          <button className="icon-btn" title="Remove" onClick={() => deleteKeyword(k.id)}>
                            <Icon.trash size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddKw && (
        <AddKeywordsModal
          projectId={projectId}
          defaultDepth={project.defaultDepth}
          onClose={() => setShowAddKw(false)}
          onAdded={() => {
            setShowAddKw(false)
            void load(true)
          }}
        />
      )}
    </div>
  )
}
