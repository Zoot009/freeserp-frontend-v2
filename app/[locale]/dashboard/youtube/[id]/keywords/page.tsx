"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { Link, useRouter } from "@/i18n/navigation"
import { useAuth } from "@/lib/auth"
import { api, ApiError } from "@/lib/api"
import { Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dropdown } from "@/components/dashboard/dropdown"
import { Icon } from "@/components/dashboard/icons"
import { DeltaCell } from "@/components/dashboard/primitives"
import { LocationPicker } from "@/components/location-picker"
import { Flag } from "@/components/flag"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { InfoHint } from "@/components/dashboard/widget"
import {
  BlockChip,
  OwnedCountBadge,
  VideoMetaCell,
  VideoThumb,
  VolatilityNote,
  YtPosCell,
  type YtKeywordRow,
} from "@/components/dashboard/youtube"
import { CreditCost } from "@/components/dashboard/credit-cost"
import { CREDIT_ACTION_KEYS } from "@/lib/credits"

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

/**
 * Styled tooltip wrapper, matching the Google tracker. Native `title=` popups
 * arrive after a long delay in the OS font, and this table has an explanation
 * on nearly every column — a page-wide mix of the two treatments reads as two
 * different products. Renders the child untouched when there is nothing to say,
 * so callers can pass a conditional string without branching.
 */
function Hint({ text, children }: { text?: string | null; children: React.ReactElement }) {
  if (!text) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-60 text-xs">{text}</TooltipContent>
    </Tooltip>
  )
}

/** Column-header info icon. Scaled to 12px: the default 14px is sized for 13px
 *  body text and reads oversized next to an 11.5px uppercase label. */
function HeaderInfo({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex [&_svg]:size-3"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <InfoHint>{children}</InfoHint>
    </span>
  )
}

/** Run state as a colour only — the label lives in the tooltip, so the column
 *  stays a date column rather than a date-plus-status-word column. */
function StatusDot({ status }: { status: string | null }) {
  const colorMap: Record<string, string> = {
    COMPLETED: "var(--pos)",
    PENDING: "var(--warn)",
    PROCESSING: "var(--brand)",
    FAILED: "var(--neg)",
  }
  const color = colorMap[status ?? ""] ?? "var(--text-mute)"
  const pulse = status === "PENDING" || status === "PROCESSING"
  return (
    <Hint text={status ?? "Never checked"}>
      <span
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
          animation: pulse ? "shim 1.4s ease-in-out infinite" : undefined,
        }}
      />
    </Hint>
  )
}

function SortHeader({
  label,
  k,
  sort,
  onClick,
  width,
  title,
  info,
}: {
  label: string
  k: SortKey
  sort: { key: SortKey; dir: "asc" | "desc" }
  onClick: (k: SortKey) => void
  width?: number | string
  title?: string
  /** Optional trailing node (e.g. an info tip) that must not trigger sorting. */
  info?: React.ReactNode
}) {
  const active = sort.key === k
  return (
    <th
      onClick={() => onClick(k)}
      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", width }}
    >
      {/* A flex row rather than bare inline content: label, sort arrow and info
          icon each used to supply their own margin, so spacing depended on which
          of them happened to be present and the icon sat on the text baseline
          instead of centred against it. The description hangs off the label, not
          the whole th, so the info tooltip is not competing with a second one
          covering the same cell. */}
      <span className="inline-flex items-center gap-1.5 align-middle">
        <Hint text={title}>
          <span>{label}</span>
        </Hint>
        {active && <span style={{ color: "var(--brand)" }}>{sort.dir === "asc" ? "↑" : "↓"}</span>}
        {info}
      </span>
    </th>
  )
}

// ───── Add keywords modal ──────────────────────────────────────────────────

// Interface-language labels. The API hands back bare ISO codes — "da", "el",
// "fi" — which are only legible to someone who already knows them. Intl derives
// the names from the platform, so there is no table here to drift out of sync
// with whatever the backend supports next.
const languageNamer =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "language" })
    : null

function languageLabel(code: string): string {
  try {
    const name = languageNamer?.of(code)
    // Intl echoes the input back for codes it doesn't know; that is not a label.
    if (name && name.toLowerCase() !== code.toLowerCase()) return name
  } catch {
    /* malformed code — fall through to the raw value */
  }
  return code.toUpperCase()
}

/** One row of the depth menu: the choice, then a muted note about it. The note
 *  is what separates the two options that would otherwise both read "Top 20". */
function DepthOption({ label, note }: { label: string; note?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      {note && <span className="tiny muted">{note}</span>}
    </span>
  )
}

// Hard cap the textarea announces. Enforced here rather than only server-side:
// a modal that says "up to 100" and then fails on submit wastes the whole entry.
const MAX_KEYWORDS_PER_ADD = 100
/** Mirrors KEYWORD_MAX_LENGTH in the backend's request schema. */
const KEYWORD_MAX_LENGTH = 255

function AddKeywordsModal({
  projectId,
  defaultDepth,
  existing,
  onClose,
  onAdded,
}: {
  projectId: string
  defaultDepth: number
  /** Already-tracked rows, so a paste can be checked against them before it is
   *  sent. The backend skips duplicates silently, which turns "I added 40" into
   *  32 new rows with nothing on screen explaining the other 8. */
  existing: YtKeywordRow[]
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
  const [step, setStep] = useState<1 | 2>(1)

  useEffect(() => {
    api
      .get<LocationsResponse>("/api/youtube/locations")
      .then(setMeta)
      .catch(() => setMeta(null))
  }, [])

  // Escape closes, as the backdrop click already does. Without it the only way
  // out of a full-screen overlay is a mouse, which is the one modal convention
  // people reach for without thinking.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

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
  // Named and alphabetised: the raw API order is neither, so scanning for
  // Spanish meant reading every two-letter code in the menu.
  const market = meta?.locations.find((l) => l.code === locationCode)
  // Every language we support is offered for every market — the backend accepts
  // any supported pair — but only one of them is the country's own. Floating it
  // to the top and naming it is the difference between an informed choice and a
  // 25-item list where every option looks equally plausible.
  const languageOptions = useMemo(
    () =>
      (meta?.languages ?? ["en"])
        .map((l) => ({ code: l, name: languageLabel(l), isMarketDefault: l === market?.defaultLanguage }))
        .sort((a, b) =>
          a.isMarketDefault === b.isMarketDefault ? a.name.localeCompare(b.name) : a.isMarketDefault ? -1 : 1,
        )
        .map(({ code, name, isMarketDefault }) => ({
          value: code,
          label: (
            <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
              <span className="tiny muted" style={{ fontFamily: "var(--font-mono)" }}>
                {code.toUpperCase()}
              </span>
              {isMarketDefault && market && <span className="tiny muted">· default in {market.name}</span>}
            </span>
          ),
          // The "default in X" note earns its place while choosing and nowhere
          // else — on the closed trigger it just crowds out the language name.
          triggerLabel: (
            <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
              <span className="tiny muted" style={{ fontFamily: "var(--font-mono)" }}>
                {code.toUpperCase()}
              </span>
            </span>
          ),
        })),
    [meta, market],
  )
  const effectiveDepth = depth === "" ? defaultDepth : depth
  const overCap = keywords.length > MAX_KEYWORDS_PER_ADD
  // Lines that survived trimming, before the Set collapsed repeats — the gap
  // between the two is what the step-1 status line reports.
  const rawLineCount = useMemo(() => text.split("\n").filter((l) => l.trim()).length, [text])
  const repeatedLines = rawLineCount - keywords.length
  const tooLong = useMemo(() => keywords.filter((k) => k.length > KEYWORD_MAX_LENGTH), [keywords])

  // Identity matches the backend's uniqueness key: keyword + location + language.
  // Device is fixed to desktop on this form, so it is not part of the comparison.
  const trackedKeys = useMemo(
    () => new Set(existing.map((k) => `${k.keyword.toLowerCase()}|${k.locationCode}|${k.languageCode}`)),
    [existing],
  )
  const alreadyTracked = useMemo(
    () => keywords.filter((k) => trackedKeys.has(`${k.toLowerCase()}|${locationCode}|${languageCode}`)).length,
    [keywords, trackedKeys, locationCode, languageCode],
  )
  const newCount = keywords.length - alreadyTracked
  const nothingNew = keywords.length > 0 && newCount === 0

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
  const currentIso = market?.iso2 ?? "us"

  // Step 1 collects the keywords, step 2 the market they are checked in. The
  // two fit in one form either way — splitting them is what keeps each screen
  // short enough that neither the body nor a dropdown menu has to scroll.
  const blocked = overCap || tooLong.length > 0
  const canContinue = keywords.length > 0 && !blocked

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Enter inside the textarea inserts a newline, so this only fires from the
    // footer button — on step 1 that button advances rather than submits.
    if (step === 1) {
      if (canContinue) {
        setError("")
        setStep(2)
      }
      return
    }
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
    // A backdrop click closes an empty form, but not one with keywords in it:
    // this modal takes a hundred pasted lines, and a misclick beside it should
    // not be what throws them away. Escape and Cancel still close either way.
    <div className="modal-bg" onClick={() => { if (!text.trim()) onClose() }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        {/* Same header as the Google tracker's add-keywords modal: an eyebrow
            naming the job above the title, rather than a bare label. */}
        <div className="modal-h">
          <div>
            <div className="eyebrow" style={{ margin: 0, fontSize: 11 }}>
              <span className="spark">
                <Icon.spark />
              </span>{" "}
              TRACK KEYWORDS
            </div>
            <div className="b" style={{ fontSize: 18, marginTop: 4 }}>
              {step === 1 ? "Add keywords" : "Where to check them"}
            </div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <span className="tiny muted" style={{ whiteSpace: "nowrap" }}>
              Step {step} of 2
            </span>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon.close />
            </button>
          </div>
        </div>
        {/* Two segments rather than a percentage bar: the count is 2, and a bar
            that fills to "50%" implies a progress that isn't being measured. */}
        <div style={{ display: "flex", gap: 4, padding: "0 22px", flexShrink: 0 }} aria-hidden>
          <span style={{ flex: 1, height: 2, borderRadius: 2, background: "var(--brand)" }} />
          <span
            style={{
              flex: 1,
              height: 2,
              borderRadius: 2,
              background: step === 2 ? "var(--brand)" : "var(--border)",
              transition: "background .15s",
            }}
          />
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-b" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {step === 1 ? (
              <div className="field">
                {/* Label and live count on one baseline. "up to 100" used to be
                    part of the uppercase label, which made the hint shout as loudly
                    as the field name and still left the user counting lines. */}
                <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                  <label htmlFor="yt-kws" style={{ margin: 0 }}>
                    Keywords{" "}
                    <span className="muted" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
                      (one per line)
                    </span>
                  </label>
                  <span
                    className="tiny"
                    style={{
                      color: overCap ? "var(--neg)" : "var(--text-mute)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {keywords.length}/{MAX_KEYWORDS_PER_ADD}
                  </span>
                </div>
                <textarea
                  id="yt-kws"
                  className="input"
                  autoFocus
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={"how to tie a tie\nbest running shoes review"}
                  required
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 13,
                    resize: "vertical",
                    minHeight: 200,
                    lineHeight: 1.5,
                  }}
                />
                {/* One status line that reports what the box currently holds,
                    rather than a fixed sentence about what the parser does. Blank
                    lines and repeats are handled silently; the counts say so. */}
                <span className="tiny" style={{ color: blocked ? "var(--neg)" : "var(--text-mute)" }}>
                  {overCap
                    ? `${keywords.length} keywords — remove ${keywords.length - MAX_KEYWORDS_PER_ADD} to get under the ${MAX_KEYWORDS_PER_ADD} per-batch limit.`
                    : tooLong.length > 0
                      ? `${tooLong.length} line${tooLong.length === 1 ? " is" : "s are"} longer than ${KEYWORD_MAX_LENGTH} characters — YouTube will not accept ${tooLong.length === 1 ? "it" : "them"}.`
                      : keywords.length === 0
                        ? "One keyword per line. Blank lines and repeats are ignored."
                        : `${keywords.length} keyword${keywords.length === 1 ? "" : "s"}${repeatedLines > 0 ? ` · ${repeatedLines} repeated line${repeatedLines === 1 ? "" : "s"} ignored` : ""}`}
                </span>
              </div>
            ) : (
              <>
                {/* What step 1 collected, so the settings are being chosen for
                    something visible rather than from memory. */}
                <div className="tiny muted">
                  {keywords.length} keyword{keywords.length === 1 ? "" : "s"} ready:{" "}
                  <span style={{ color: "var(--text)" }}>
                    {keywords.slice(0, 3).join(", ")}
                    {keywords.length > 3 ? ` +${keywords.length - 3} more` : ""}
                  </span>
                </div>

                {/* Settings rows, not form fields. Three stacked .field groups —
                    uppercase label, control, paragraph of help — read as a form to
                    fill in, and this screen is a set of defaults to confirm. Label
                    left, control right, explanations behind the ⓘ so the screen
                    stays short enough that nothing has to scroll. */}
                <div className="set-list">
                  <div className="set-row">
                    <span className="set-lbl">Search location</span>
                    <div className="set-ctl">
                      <LocationPicker value={currentIso} onChange={onLocationChange} variant="dashboard" showFlags />
                    </div>
                  </div>
                  <div className="set-row">
                    <span className="set-lbl">
                      Language
                      <InfoHint>
                        Language is sent to YouTube with the search, so it changes the results. The same
                        keyword in two languages is two rows, checked and billed separately. It follows the
                        country unless you change it.
                      </InfoHint>
                    </span>
                    <div className="set-ctl">
                      {/* Dropdown, not a native <select>: the OPEN menu of a native
                          select is drawn by the OS, so it arrived with system fonts and
                          the platform highlight next to a fully styled location picker. */}
                      <Dropdown
                        block
                        portal
                        ariaLabel="Interface language"
                        value={languageCode}
                        onChange={setLanguageCode}
                        options={languageOptions}
                      />
                    </div>
                  </div>
                  <div className="set-row">
                    <span className="set-lbl">
                      Results to check
                      <InfoHint>
                        How far down the results a check looks. A deeper scan can place videos that a Top{" "}
                        {defaultDepth} scan reports as unranked; it still counts as one check per keyword.
                      </InfoHint>
                    </span>
                    <div className="set-ctl">
                      {/* "Use project default (Top 20)" sat directly above a "Top 20" that
                          looked like the same choice twice. The two differ in what happens
                          LATER — the default follows the project if it changes, the explicit
                          one is pinned to this keyword — so each option carries the note
                          that tells them apart instead of repeating the number. */}
                      <Dropdown
                        block
                        portal
                        ariaLabel="Results to check"
                        value={depth === "" ? "" : String(depth)}
                        onChange={(v) => setDepth(v === "" ? "" : Number(v))}
                        options={[
                          { value: "", label: <DepthOption label="Project default" note={`Top ${defaultDepth}`} /> },
                          ...(meta?.depths ?? [20, 40, 60]).map((d) => ({
                            value: String(d),
                            label: (
                              <DepthOption label={`Top ${d}`} note={d === defaultDepth ? "same as default" : undefined} />
                            ),
                          })),
                        ]}
                      />
                    </div>
                  </div>
                </div>

                {/* The market decides how many of these lines are actually new, so
                    the duplicate count belongs on THIS step, not on the keyword box
                    where no country has been chosen yet.

                    Also: this said the add would cost N checks "from today's
                    allowance", which is not what happens — addKeywords only inserts
                    rows, and nothing reaches DataForSEO until a check is run. */}
                {nothingNew ? (
                  <div
                    className="card tight"
                    style={{
                      borderColor: "var(--warn)",
                      background: "var(--warn-soft)",
                      color: "var(--text)",
                      fontSize: 12,
                      padding: "9px 12px",
                    }}
                  >
                    {keywords.length === 1 ? "This keyword is" : `All ${keywords.length} of these are`} already
                    tracked in {market?.name ?? "this market"} ({languageLabel(languageCode)}). Pick another
                    country or language, or go back and edit the list.
                  </div>
                ) : (
                  <div
                    className="card tight tiny muted"
                    style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 12px" }}
                  >
                    <span style={{ flexShrink: 0, marginTop: 1 }}>
                      <Icon.info size={13} />
                    </span>
                    <span>
                      Adds {alreadyTracked > 0 ? `${newCount} of ${keywords.length}` : newCount} keyword
                      {newCount === 1 ? "" : "s"} in {market?.name ?? "this market"} ({languageLabel(languageCode)}),
                      set to Top {effectiveDepth}.
                      {alreadyTracked > 0 &&
                        ` ${alreadyTracked} ${alreadyTracked === 1 ? "is" : "are"} already tracked here and will be skipped.`}{" "}
                      Nothing is checked until you run a check — that is when the allowance is spent.
                    </span>
                  </div>
                )}

                {/* What that later check will cost, so the size of the batch is
                    a decision made here rather than a surprise afterwards. */}
                {newCount > 0 && !nothingNew && (
                  <CreditCost action={CREDIT_ACTION_KEYS.youtubeCheck} units={newCount} />
                )}
              </>
            )}

            {error && (
              <div
                className="card tight"
                style={{ borderColor: "var(--neg)", background: "var(--neg-soft)", color: "var(--neg)", fontSize: 12 }}
              >
                {error}
              </div>
            )}
          </div>
          <div className="modal-f">
            {step === 1 ? (
              <>
                <button type="button" className="btn" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={!canContinue}>
                  Next
                </button>
              </>
            ) : (
              <>
                {/* Back, not Cancel: the close button and Escape already cover
                    leaving, and losing a typed list to a misread button is the
                    expensive mistake on this screen. */}
                <button type="button" className="btn" onClick={() => setStep(1)} disabled={loading}>
                  Back
                </button>
                <button type="submit" className="btn primary" disabled={loading || nothingNew}>
                  {loading
                    ? "Adding…"
                    : `Add ${newCount} keyword${newCount === 1 ? "" : "s"}`}
                </button>
              </>
            )}
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

          {/* The app's own Dropdown, not a native select and not shadcn's.
              A native <select> can be styled down to the box but not the OPEN
              MENU — that is drawn by the OS, so it arrived with system fonts,
              square corners and the platform's blue highlight in the middle of an
              otherwise styled page. A styled trigger over an unstyled menu is the
              worst of the options, because it looks deliberate until you open it.

              Dropdown is what the rest of the app uses for exactly this, the
              Google project's own frequency picker included — so this control now
              matches its sibling instead of introducing a third dropdown. */}
          <Dropdown
            ariaLabel="Check frequency"
            value={project.autoCheckEnabled ? String(project.checkFrequency) : "off"}
            onChange={(v) => updateFrequency(v === "off" ? "off" : Number(v))}
            options={[
              { value: "off", label: "Manual checks only" },
              ...FREQ_CHOICES.map((h) => ({ value: String(h), label: freqLabel(h) })),
            ]}
          />

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
                    <Hint text="Select every keyword in view">
                      <input
                        type="checkbox"
                        checked={selected.size > 0 && selected.size === rows.length}
                        onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                        aria-label="Select all"
                      />
                    </Hint>
                  </th>
                  <SortHeader
                    label="Keyword"
                    k="kw"
                    sort={sort}
                    onClick={clickSort}
                    width={240}
                    title="The tracked search term, with the market and interface language it is checked in."
                  />
                  <SortHeader
                    label="Position"
                    k="pos"
                    sort={sort}
                    onClick={clickSort}
                    width={132}
                    title="Rank among standalone organic videos — ads, Shorts shelves, playlist and channel blocks are excluded."
                  />
                  {/* "Abs." carries an info icon rather than a hover-only hint:
                      the abbreviation means nothing on its own, so the column
                      needs to advertise that an explanation exists. */}
                  <SortHeader
                    label="Abs."
                    k="abs"
                    sort={sort}
                    onClick={clickSort}
                    width={84}
                    info={
                      <HeaderInfo>
                        Absolute position — where the video sits in the full result list, counting ads,
                        Shorts shelves and other blocks that the organic position skips.
                      </HeaderInfo>
                    }
                  />
                  <th style={{ width: 96 }}>
                    <Hint text="Which result block the ranking video came from — an organic video, a Shorts shelf, a playlist, a channel card or an ad.">
                      <span>Block</span>
                    </Hint>
                  </th>
                  <th style={{ width: "26%" }}>
                    <Hint text="The best-placed video from this target for the keyword.">
                      <span>Ranking video</span>
                    </Hint>
                  </th>
                  <SortHeader
                    label="Video stats"
                    k="views"
                    sort={sort}
                    onClick={clickSort}
                    width={172}
                    title="Views, age and duration of the ranking video — the context that makes a movement explainable."
                  />
                  <th style={{ width: 92, whiteSpace: "nowrap" }}>
                    <Hint text="How deep this keyword was checked">
                      <span>Depth</span>
                    </Hint>
                  </th>
                  <SortHeader
                    label="Last checked"
                    k="checkedAt"
                    sort={sort}
                    onClick={clickSort}
                    width={132}
                    title="When this keyword was last run, and the state of that run."
                  />
                  <th style={{ width: 116, whiteSpace: "nowrap" }}>
                    <Hint text="Re-check, open the SERP snapshot, or remove the keyword.">
                      <span>Actions</span>
                    </Hint>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((k) => {
                  const isActive = k.status != null && ACTIVE_STATUSES.has(k.status)
                  const isSelected = selected.has(k.id)
                  // Same row-state colours as the Google tracker: a run in flight
                  // outranks a selection, because it is the state that changes on
                  // its own while the user is looking at it.
                  const rowStyle: React.CSSProperties = { cursor: "pointer" }
                  if (isActive) rowStyle.background = "var(--warn-soft)"
                  else if (isSelected) rowStyle.background = "var(--brand-soft)"
                  return (
                    <tr
                      key={k.id}
                      style={rowStyle}
                      onClick={() => router.push(`/dashboard/youtube/${projectId}/keywords/${k.id}`)}
                      title="View keyword details"
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
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
                      {/* One line, like the Google tracker: flag, keyword, language.
                          The keyword used to sit above a second line carrying the
                          flag, country name and language chip, which doubled the row
                          height and left every other cell floating in a band of
                          empty space. Location now rides the flag tooltip; language
                          stays visible because two rows here can differ by language
                          alone — legal on YouTube, impossible on Google.

                          minWidth:0 is what lets the .kw ellipsis engage: without it
                          the flex child sizes to its content and never truncates. */}
                      <td>
                        <span className="row" style={{ gap: 8, alignItems: "center", minWidth: 0 }}>
                          <Flag code={k.locationIso2} title={k.locationLabel} />
                          {/* Still an anchor, not the plain label the row click would
                              allow: it keeps the keyword reachable by keyboard and
                              openable in a new tab. .kw makes it read as text — the
                              row is the affordance, the link is the fallback. */}
                          <Link
                            href={`/dashboard/youtube/${projectId}/keywords/${k.id}`}
                            className="kw"
                            title={`${k.keyword} · ${k.locationLabel}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {k.keyword}
                          </Link>
                          <span
                            className="chip outline"
                            style={{ flexShrink: 0, fontSize: 10, padding: "1px 5px", lineHeight: "15px" }}
                            title={`Interface language: ${k.languageCode.toUpperCase()}`}
                          >
                            {k.languageCode.toUpperCase()}
                          </span>
                        </span>
                      </td>
                      <td>
                        {lockedKwIds.has(k.id) ? (
                          <Link
                            href="/pricing?clicked-buy-button"
                            className="chip warn"
                            onClick={(e) => e.stopPropagation()}
                          >
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
                      {/* maxWidth is what makes the title truncate: under the table
                          auto layout the column would otherwise stretch to fit the
                          full title and wrap it across two lines. */}
                      <td style={{ maxWidth: 320 }}>
                        {k.topVideoUrl ? (
                          <div className="row" style={{ gap: 8, alignItems: "center", minWidth: 0 }}>
                            <VideoThumb
                              videoId={k.topVideoId}
                              durationSeconds={k.topDurationSeconds}
                              width={52}
                            />
                            <a
                              href={k.topVideoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="tiny"
                              title={k.topVideoTitle ?? undefined}
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                minWidth: 0,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {k.topVideoTitle ?? k.topVideoUrl}
                            </a>
                          </div>
                        ) : (
                          <span className="tiny muted">—</span>
                        )}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <VideoMetaCell views={k.topViews} publishedAt={k.topPublishedAt} />
                      </td>
                      <td>
                        <span className="chip outline tiny">
                          Top {k.checkedDepth ?? k.depth ?? project.defaultDepth}
                        </span>
                      </td>
                      {/* Date plus the state of the run, in the Google tracker
                          format — "08 Aug 2026" rather than 8/8/2026, which reads as
                          day-first or month-first depending on who is looking. */}
                      <td className="tiny muted" style={{ whiteSpace: "nowrap" }}>
                        <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                          <span>
                            {k.checkedAt
                              ? new Date(k.checkedAt).toLocaleDateString("en-IN", {
                                  day: "2-digit", month: "short", year: "numeric",
                                })
                              : "Never"}
                          </span>
                          <StatusDot status={k.status} />
                        </span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="row" style={{ gap: 6 }}>
                          <Hint text="Check this keyword now">
                            <button
                              className="icon-btn"
                              style={{ width: 28, height: 28 }}
                              disabled={busy || isActive}
                              onClick={() => runCheck([k.id])}
                              aria-label={`Check ${k.keyword} now`}
                            >
                              <Icon.refresh />
                            </button>
                          </Hint>
                          {k.latestCheckId && (
                            <Hint text="Open the SERP snapshot">
                              <Link
                                href={`/dashboard/youtube/${projectId}/keywords/${k.id}?tab=serp`}
                                className="icon-btn"
                                style={{ width: 28, height: 28 }}
                                aria-label={`SERP snapshot for ${k.keyword}`}
                              >
                                <Icon.search size={13} />
                              </Link>
                            </Hint>
                          )}
                          <Hint text="Remove this keyword">
                            <button
                              className="icon-btn danger"
                              style={{ width: 28, height: 28 }}
                              onClick={() => deleteKeyword(k.id)}
                              aria-label={`Remove ${k.keyword}`}
                            >
                              <Icon.trash size={13} />
                            </button>
                          </Hint>
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
          existing={project.keywords}
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
