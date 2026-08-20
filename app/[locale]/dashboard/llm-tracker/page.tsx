"use client"

// LLM Tracker — AI brand visibility from DataForSEO's LLM Mentions archive.
//
// Implements the "LLM Tracker.dc.html" design. Two deliberate departures from the
// mock: its app chrome (logo, search, avatar) is dropped because the dashboard
// shell already renders a sidebar and header, and its Google Fonts <link> is
// replaced by next/font in this segment's layout.tsx, matching how the app loads
// every other typeface.
//
// The page is a three-phase machine — idle → loading → report. Idle centres a
// narrow intro so the search is the only thing on screen; running it expands the
// intro to full width and reveals the report beneath. The mock fakes the load
// with timers; here the real request drives the transition and only the step
// LABELS are on timers, since the API gives no progress signal.
//
// The framing is the product decision, not a layout choice. The obvious screen —
// "your brand's AI visibility" — renders an almost empty page for a typical
// customer: measured against the live archive, freeserp.com appears in 5 archived
// AI answers where ahrefs.com appears in 6,494. So the CATEGORY leads ("AI
// recommends these domains, and you are not among them") and the customer's own
// coverage is reported honestly beside it.
//
// NOTE: strings are inline English, matching the rest of this dashboard section.

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api, ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { ToolContext } from "@/components/dashboard/tool-context"

// ───── Types (mirror /api/llm-tracker) ──────────────────────────────────────
type Platform = "google" | "chat_gpt"

type TopDomain = { domain: string; mentions: number; aiSearchVolume: number }

type MentionRow = {
  question: string
  answerChars: number
  sources: { domain: string; url: string; title: string }[]
  aiSearchVolume: number
  firstResponseAt: string | null
  lastResponseAt: string | null
}

type Usage = {
  plan: "free" | "paid"
  enabled: boolean
  limit: number
  used: number
  remaining: number
  monthUsd: number
  monthUsdCap: number
}

type Overview = {
  keyword: string
  domain: string
  platform: Platform
  category: { domains: TopDomain[]; yourRank: number | null; listSize: number }
  coverage: {
    mentions: number
    aiSearchVolume: number
    citedAlongside: { key: string; mentions: number; aiSearchVolume: number }[]
  }
  prompts: { totalCount: number; rows: MentionRow[] }
  cached: boolean
  usage: Usage
}

const PLATFORMS: { key: Platform; label: string; note: string }[] = [
  { key: "google", label: "Google AI Overview", note: "All locations" },
  // The ChatGPT half of the archive is US/English only — say so rather than
  // letting a non-US customer read a thin result as "we have no visibility".
  { key: "chat_gpt", label: "ChatGPT", note: "US · English only" },
]

// ───── Design tokens, lifted from the mock ──────────────────────────────────
const C = {
  ink: "#16181d",
  body: "#3d424b",
  label: "#5c616b",
  muted: "#71757e",
  soft: "#8b8f98",
  faint: "#a0a4ad",
  fainter: "#a8acb4",
  ghost: "#b6bac1",
  line: "#ebebee",
  hair: "#f4f5f7",
  hairline: "#f1f2f4",
  field: "#e2e4e8",
  chip: "#f7f8fa",
  wash: "#fbfbfc",
  page: "#f6f6f7",
  accent: "#2f5bea",
  accentDeep: "#2449c4",
  accentMuted: "#7f9bf2",
  accentSoft: "#c3cdf7",
  accentWash: "#eef2ff",
  warn: "#dc6803",
  pos: "#2fa85d",
}
const MONO = "var(--font-llm-mono), 'IBM Plex Mono', ui-monospace, monospace"
const SANS = "var(--font-llm-sans), 'Instrument Sans', Helvetica, Arial, sans-serif"
const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)"

/** Avatar palette from the design, cycled by row index. */
const PALETTE = [
  "#e8574a", "#f2a63b", "#3f8cff", "#e0413c", "#f26d6d", "#5b7cfa", "#3aa3d9", "#8a6fe0",
  "#e05252", "#2fa85d", "#4c8ff0", "#3b5bdb", "#3aa0a0", "#c94f4f", "#7b8794", "#3f7fe0",
]

const fmt = (n: number) => n.toLocaleString()

/** Host comparison that treats subdomains as the same site. */
function sameHost(a: string, b: string): boolean {
  const norm = (s: string) =>
    s.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")
  const x = norm(a)
  const y = norm(b)
  return !!y && (x === y || x.endsWith(`.${y}`))
}

/**
 * Keyframes the design relies on. Scoped here rather than in globals.css because
 * nothing outside this page uses them.
 */
const KEYFRAMES = `
@keyframes om-spin { to { transform: rotate(360deg); } }
@keyframes om-shimmer { 0% { background-position: -420px 0; } 100% { background-position: 420px 0; } }
@keyframes om-pulse { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }
`

export default function LlmTrackerPage() {
  const t = useTranslations("tools")
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const [keyword, setKeyword] = useState("")
  const [domain, setDomain] = useState("")
  const [platform, setPlatform] = useState<Platform>("google")

  const [usage, setUsage] = useState<Usage | null>(null)
  const [data, setData] = useState<Overview | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Distinct from `error`. 404 = the feature does not exist on this API version
  // (flag off / older backend). 403 = it exists but this account is not on the
  // early-access list. Both are plain messages, not failures.
  const [unavailable, setUnavailable] = useState<false | "missing" | "no-access">(false)
  // Drives the report's fade/slide entrance: mount first, animate one frame later.
  const [reportIn, setReportIn] = useState(false)
  const [step, setStep] = useState(0)

  const phase: "idle" | "loading" | "report" = running ? "loading" : data ? "report" : "idle"

  useEffect(() => {
    if (!authLoading && !user) router.push("/login")
  }, [authLoading, user, router])

  const loadUsage = useCallback(async () => {
    try {
      setUsage(await api.get<Usage>("/api/llm-tracker/usage"))
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setUnavailable("missing")
      else if (err instanceof ApiError && err.status === 403) setUnavailable("no-access")
    }
  }, [])

  useEffect(() => {
    if (user) void loadUsage()
  }, [user, loadUsage])

  // Step labels advance on timers. They are illustrative — the archive exposes no
  // progress — so they never claim a count we haven't received yet.
  useEffect(() => {
    if (!running) return
    setStep(0)
    const t1 = setTimeout(() => setStep(1), 700)
    const t2 = setTimeout(() => setStep(2), 1300)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [running])

  // Mount the report at opacity 0, then flip on the next frame so the transition
  // actually runs (setting both in one commit would skip it).
  const raf = useRef<number | null>(null)
  useEffect(() => {
    if (!data) {
      setReportIn(false)
      return
    }
    raf.current = requestAnimationFrame(() => setReportIn(true))
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current)
    }
  }, [data])

  const run = useCallback(async () => {
    if (!keyword.trim() || !domain.trim() || running) return
    setRunning(true)
    setError(null)
    setReportIn(false)
    setData(null)
    try {
      // api.post takes the body as the SECOND POSITIONAL argument.
      const res = await api.post<Overview>("/api/llm-tracker/overview", {
        keyword: keyword.trim(),
        domain: domain.trim(),
        platform,
      })
      setData(res)
      setUsage(res.usage)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setUnavailable("missing")
      else if (err instanceof ApiError && err.status === 403) setUnavailable("no-access")
      // 402s are swallowed here on purpose — the global quota modal owns them.
      else if (!(err instanceof ApiError && err.status === 402)) {
        setError(err instanceof Error ? err.message : "Lookup failed")
      }
    } finally {
      setRunning(false)
    }
  }, [keyword, domain, platform, running])

  const reset = useCallback(() => {
    setData(null)
    setReportIn(false)
    setError(null)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [])

  if (authLoading || !user) {
    return <Centered>{t("loading")}</Centered>
  }

  if (unavailable) {
    return (
      <Page>
        <style>{KEYFRAMES}</style>
        <Intro phase="idle">
          <Header phase="idle" onReset={reset} />
        </Intro>
        <Card style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 13.5 }}>
          {unavailable === "no-access" ? (
            <>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.ink, marginBottom: 6 }}>
                {t("llmEarlyAccess")}
              </div>
              {t("llmNotOnList")}
            </>
          ) : (
            <>{t("llmNotAvailable")}</>
          )}
        </Card>
      </Page>
    )
  }

  const canRun = !!keyword.trim() && !!domain.trim()
  const platformNote = PLATFORMS.find((p) => p.key === platform)?.note

  return (
    <Page>
      <style>{KEYFRAMES}</style>

      {/* ── Intro: header + search. Centred and narrow at idle, full width once
             a report exists, so the search owns the screen until it has an answer. */}
      <Intro phase={phase}>
        <Header phase={phase} onReset={reset} />

        <ToolContext id="llm-tracker" />

        {usage && !usage.enabled && <AddOnTeaser />}

        <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Platform tabs */}
          <div style={{ display: "flex", alignItems: "center", gap: 26, paddingLeft: 4, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 22, alignItems: "center" }}>
              {PLATFORMS.map((p) => {
                const active = platform === p.key
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPlatform(p.key)}
                    title={p.note}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 7,
                      background: "none",
                      border: 0,
                      padding: 0,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13.5,
                        fontWeight: active ? 600 : 400,
                        color: active ? C.ink : C.muted,
                      }}
                    >
                      {p.label}
                    </span>
                    <span
                      style={{
                        height: 2,
                        borderRadius: 2,
                        background: active ? C.accent : "transparent",
                        transition: "background 200ms ease",
                      }}
                    />
                  </button>
                )
              })}
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.06em", color: C.faint }}>
              {platformNote}
            </div>
          </div>

          {/* The unified search bar */}
          <div
            style={{
              display: "flex",
              alignItems: "stretch",
              background: "#fff",
              border: `1px solid ${C.field}`,
              borderRadius: 14,
              boxShadow: "0 1px 2px rgba(20,22,26,0.04), 0 8px 24px -18px rgba(20,22,26,0.22)",
              overflow: "hidden",
              flexWrap: "wrap",
            }}
          >
            <BarField
              label="Category keyword"
              value={keyword}
              onChange={setKeyword}
              onEnter={run}
              placeholder="free serp checker"
              style={{ flex: "1.35 1 200px" }}
            />
            <div style={{ width: 1, background: "#eceef1", margin: "10px 0" }} />
            <BarField
              label="Your domain"
              value={domain}
              onChange={setDomain}
              onEnter={run}
              placeholder="freeserp.com"
              style={{ flex: "1 1 170px" }}
            />
            <div style={{ padding: 8, display: "flex" }}>
              <button
                type="button"
                onClick={() => void run()}
                disabled={!canRun || running}
                style={{
                  padding: "0 24px",
                  borderRadius: 9,
                  border: 0,
                  background: running ? C.accentMuted : canRun ? C.accent : C.accentSoft,
                  color: "#fff",
                  fontFamily: "inherit",
                  fontSize: 13.5,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  cursor: canRun && !running ? "pointer" : "default",
                  userSelect: "none",
                  whiteSpace: "nowrap",
                  transition: "background 200ms ease",
                  minHeight: 40,
                }}
              >
                {running && (
                  <span
                    style={{
                      width: 13,
                      height: 13,
                      borderRadius: "50%",
                      border: "2px solid rgba(255,255,255,0.35)",
                      borderTopColor: "#fff",
                      animation: "om-spin 700ms linear infinite",
                    }}
                  />
                )}
                <span>{running ? "Checking…" : data ? "Check again" : "Check visibility"}</span>
              </button>
            </div>
          </div>

          {/* Allowance line */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              paddingLeft: 4,
              fontFamily: MONO,
              fontSize: 11,
              color: C.faint,
              flexWrap: "wrap",
            }}
          >
            {usage && (
              <>
                <span>
                  {usage.remaining} / {usage.limit} lookups left today
                </span>
                <Dot />
                <span>
                  ${usage.monthUsd.toFixed(2)} of ${usage.monthUsdCap.toFixed(2)} data budget
                </span>
              </>
            )}
            {data?.cached && (
              <>
                <Dot />
                <span style={{ color: C.pos }}>cached · free</span>
              </>
            )}
          </div>
        </section>
      </Intro>

      {error && (
        <Card style={{ padding: "18px 26px", color: "#c0392b", fontSize: 13.5 }}>{error}</Card>
      )}

      {phase === "loading" && <LoadingSkeleton step={step} platform={platform} />}

      {phase === "report" && data && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 28,
            opacity: reportIn ? 1 : 0,
            transform: reportIn ? "translateY(0px)" : "translateY(18px)",
            transition: `opacity 520ms ease 90ms, transform 520ms ${EASE} 90ms`,
          }}
        >
          <Results data={data} />
        </div>
      )}
    </Page>
  )
}

// ───── Layout primitives ────────────────────────────────────────────────────

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: C.page, minHeight: "100%", fontFamily: SANS, color: C.ink }}>
      <div
        style={{
          padding: "40px 32px 72px",
          maxWidth: 1360,
          width: "100%",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 28,
          minHeight: "calc(100vh - 56px)",
        }}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * The intro block. At idle it is narrow and pushed down the page so the search is
 * the only thing to look at; once there is a report it widens to full bleed and
 * rises to the top. Both properties are transitioned, so the change reads as the
 * page reorganising itself rather than a jump cut.
 */
function Intro({ phase, children }: { phase: "idle" | "loading" | "report"; children: React.ReactNode }) {
  const idle = phase === "idle"
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 28,
        width: "100%",
        maxWidth: idle ? 820 : "100%",
        margin: `${idle ? "14vh" : "0px"} auto 0`,
        transition: `margin-top 620ms ${EASE}, max-width 620ms ${EASE}`,
      }}
    >
      {children}
    </div>
  )
}

function Header({
  phase,
  onReset,
}: {
  phase: "idle" | "loading" | "report"
  onReset: () => void
}) {
  const t = useTranslations("tools")
  const idle = phase === "idle"
  return (
    <div
      style={{
        display: "flex",
        flexDirection: idle ? "column" : "row",
        alignItems: idle ? "flex-start" : "flex-end",
        justifyContent: "space-between",
        gap: idle ? 14 : 40,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 10.5,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: C.faint,
          }}
        >
          {t("llmEyebrow")}
        </div>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 600, letterSpacing: "-0.025em" }}>{t("llmTitle")}</h1>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 18, maxWidth: "100%", flexWrap: "wrap" }}>
        <p
          style={{
            margin: "0 0 4px",
            fontSize: 13.5,
            color: C.muted,
            maxWidth: 440,
            textAlign: idle ? "left" : "right",
            textWrap: "pretty",
          }}
        >
          {t("llmIntro")}
        </p>
        {phase === "report" && (
          <button
            type="button"
            onClick={onReset}
            style={{
              height: 36,
              padding: "0 15px",
              border: `1px solid ${C.field}`,
              borderRadius: 9,
              display: "flex",
              alignItems: "center",
              fontSize: 13,
              fontFamily: "inherit",
              color: C.body,
              background: "#fff",
              cursor: "pointer",
              whiteSpace: "nowrap",
              marginBottom: 4,
            }}
          >
            {t("llmNewSearch")}
          </button>
        )}
        {idle && (
          <Link
            href="/dashboard/llm-tracker/prompts"
            style={{
              marginBottom: 4,
              height: 36,
              padding: "0 15px",
              display: "inline-flex",
              alignItems: "center",
              border: `1px solid ${C.field}`,
              borderRadius: 9,
              fontSize: 13,
              color: C.body,
              background: "#fff",
              whiteSpace: "nowrap",
            }}
          >
            {t("llmMyPrompts")}
          </Link>
        )}
      </div>
    </div>
  )
}

/** One field inside the unified search bar: micro-label above a borderless input. */
function BarField({
  label,
  value,
  onChange,
  onEnter,
  placeholder,
  style,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onEnter: () => void
  placeholder: string
  style?: React.CSSProperties
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 3,
        padding: "13px 20px",
        cursor: "text",
        minWidth: 0,
        ...style,
      }}
    >
      <span
        style={{
          fontFamily: MONO,
          fontSize: 9.5,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: C.faint,
        }}
      >
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter()}
        placeholder={placeholder}
        style={{
          border: 0,
          outline: "none",
          padding: 0,
          background: "transparent",
          fontFamily: "inherit",
          fontSize: 15,
          letterSpacing: "-0.005em",
          color: C.ink,
          width: "100%",
          minWidth: 0,
        }}
      />
    </label>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 60, textAlign: "center", color: C.muted, fontSize: 13.5, fontFamily: SANS }}>
      {children}
    </div>
  )
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <section style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, ...style }}>
      {children}
    </section>
  )
}

function Dot() {
  return <span style={{ color: "#dcdee2" }}>·</span>
}

function AddOnTeaser() {
  const t = useTranslations("tools")
  return (
    <Card style={{ padding: "18px 26px", borderColor: "#cfd6f6", background: C.accentWash }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{t("llmAddOn")}</div>
      <div style={{ fontSize: 13.5, color: C.muted }}>
        Track which sites ChatGPT and Google AI Overview recommend in your category, with 12 months of
        history.{" "}
        <a href="/pricing?clicked-buy-button" style={{ color: C.accent }}>
          {t("kmSeePlans")}
        </a>
      </div>
    </Card>
  )
}

// ───── Loading ──────────────────────────────────────────────────────────────

const SHIMMER: React.CSSProperties = {
  borderRadius: 16,
  border: `1px solid ${C.line}`,
  background: "linear-gradient(100deg, #fff 30%, #f4f5f7 50%, #fff 70%)",
  backgroundSize: "840px 100%",
  animation: "om-shimmer 1.5s linear infinite",
}

function LoadingSkeleton({ step, platform }: { step: number; platform: Platform }) {
  const label = PLATFORMS.find((p) => p.key === platform)?.label ?? "AI"
  // Deliberately no counts here: the archive reports totals only in the response,
  // so a number in this copy would be invented.
  const steps = [
    "Collecting the questions buyers ask AI in this category…",
    `Reading archived ${label} answers…`,
    "Ranking the domains AI recommends…",
  ]
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, fontSize: 13, color: C.label }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: C.accent,
            animation: "om-pulse 1.1s ease-in-out infinite",
          }}
        />
        <span>{steps[Math.min(step, steps.length - 1)]}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 20 }}>
        <div style={{ ...SHIMMER, height: 176 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ ...SHIMMER, flex: 1, minHeight: 78 }} />
          <div style={{ ...SHIMMER, flex: 1, minHeight: 78 }} />
        </div>
      </div>
      <div style={{ ...SHIMMER, height: 320 }} />
    </div>
  )
}

// ───── Results ──────────────────────────────────────────────────────────────

function Results({ data }: { data: Overview }) {
  const t = useTranslations("tools")
  const { category, coverage, prompts } = data
  const own = data.domain
  const leader = category.domains[0] ?? null
  const maxMentions = leader?.mentions ?? 0
  const gap = leader ? leader.mentions - coverage.mentions : 0

  return (
    <>
      {/* ── Headline + stats ── */}
      <section style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 20 }}>
        <Card style={{ padding: "28px 30px", display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: category.yourRank ? C.pos : C.warn,
              }}
            />
            <span style={{ fontSize: 12.5, fontWeight: 500, color: C.label }}>
              Your visibility for “{data.keyword}” on{" "}
              {PLATFORMS.find((p) => p.key === data.platform)?.label}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
            {/* "Not in top N" is a REAL finding and the one most customers get.
                It must never render as a dash, a zero or an empty state. */}
            <div style={{ fontSize: 46, fontWeight: 600, letterSpacing: "-0.035em", lineHeight: 1 }}>
              {category.yourRank ? `#${category.yourRank}` : `Not in top ${category.listSize}`}
            </div>
            <div style={{ fontSize: 13.5, color: C.muted }}>
              {own} was mentioned in {fmt(coverage.mentions)} of {fmt(prompts.totalCount)} answers
            </div>
          </div>

          {leader && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
                padding: "16px 18px",
                background: C.wash,
                border: `1px solid ${C.hairline}`,
                borderRadius: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: C.faint,
                  }}
                >
                  {t("llmCategoryLeader")}
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>{leader.domain}</div>
              </div>
              <div style={{ flex: 1, height: 1, background: "#eceef1", minWidth: 20 }} />
              <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 600,
                    letterSpacing: "-0.02em",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {fmt(leader.mentions)}
                </div>
                <div style={{ fontSize: 12.5, color: C.muted }}>
                  mentions vs your {fmt(coverage.mentions)}
                  {gap > 0 ? ` — a ${fmt(gap)}-mention gap` : ""}
                </div>
              </div>
            </div>
          )}
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Stat
            label="AI answers mentioning you"
            hint={`out of ${fmt(prompts.totalCount)} archived answers`}
            value={fmt(coverage.mentions)}
          />
          <Stat
            label="Questions asked in this category"
            hint="archived since Aug 2025"
            value={fmt(prompts.totalCount)}
          />
        </div>
      </section>

      {/* ── Leaderboard ── */}
      <Card style={{ overflow: "hidden" }}>
        <SectionHead
          title={`Who AI recommends for “${data.keyword}”`}
          aside={
            category.yourRank
              ? `${own} ranks #${category.yourRank}`
              : `${own} is not in the top ${category.listSize}`
          }
        />
        {category.domains.length === 0 ? (
          <Empty>{t("llmNoAnswers")}</Empty>
        ) : (
          <>
            <Row header>
              <div>#</div>
              <div>{t("llmDomain")}</div>
              <div>{t("llmMentions")}</div>
              <div style={{ textAlign: "right" }}>{t("llmAiVolume")}</div>
            </Row>
            {category.domains.map((d, i) => {
              const isOwn = sameHost(d.domain, own)
              const bare = d.domain.replace(/^www\./, "")
              return (
                <Row key={d.domain} highlight={isOwn}>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.fainter }}>{i + 1}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 5,
                        flex: "0 0 20px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10,
                        fontWeight: 600,
                        color: "#fff",
                        background: isOwn ? C.accent : PALETTE[i % PALETTE.length],
                      }}
                    >
                      {(bare[0] ?? "?").toUpperCase()}
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontWeight: isOwn ? 600 : 400,
                      }}
                    >
                      {d.domain}
                    </div>
                    {isOwn && (
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 600,
                          color: C.accent,
                          background: C.accentWash,
                          borderRadius: 5,
                          padding: "2px 6px",
                        }}
                      >
                        {t("llmYou")}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        flex: 1,
                        height: 5,
                        borderRadius: 3,
                        background: C.hairline,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: 5,
                          borderRadius: 3,
                          background: isOwn || d.mentions >= maxMentions * 0.66 ? C.accent : C.accentSoft,
                          width: `${maxMentions > 0 ? Math.max(3, (d.mentions / maxMentions) * 100) : 3}%`,
                        }}
                      />
                    </div>
                    <div
                      style={{
                        width: 34,
                        textAlign: "right",
                        fontSize: 13,
                        fontVariantNumeric: "tabular-nums",
                        color: C.body,
                      }}
                    >
                      {fmt(d.mentions)}
                    </div>
                  </div>
                  <div
                    style={{
                      textAlign: "right",
                      fontSize: 13,
                      fontVariantNumeric: "tabular-nums",
                      color: C.body,
                    }}
                  >
                    {fmt(d.aiSearchVolume)}
                  </div>
                </Row>
              )
            })}
            {/* Pinned footer: when the customer is unranked they never appear in
                the rows above, and a leaderboard they are absent from is exactly
                the moment they most need to see their own number. */}
            {!category.yourRank && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "16px 30px",
                  borderTop: `1px solid ${C.line}`,
                  background: C.wash,
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 5,
                    background: C.accent,
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                >
                  {(own.replace(/^www\./, "")[0] ?? "?").toUpperCase()}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{own}</div>
                <div style={{ flex: 1 }} />
                <div style={{ fontSize: 12.5, color: C.muted }}>
                  Unranked · {fmt(coverage.mentions)} mention{coverage.mentions === 1 ? "" : "s"} across
                  archived answers
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* ── Questions ── */}
      <Card style={{ overflow: "hidden" }}>
        <SectionHead
          title="What people actually ask AI"
          aside={`${fmt(prompts.totalCount)} archived questions · showing ${prompts.rows.length}`}
        />
        {prompts.rows.length === 0 ? (
          <Empty>{t("llmNoQuestions")}</Empty>
        ) : (
          <>
            <QRow header>
              <div>{t("llmQuestion")}</div>
              <div style={{ textAlign: "right" }}>{t("llmAiVolume")}</div>
              <div>{t("llmCitedSources")}</div>
            </QRow>
            {prompts.rows.map((q, i) => {
              const shown = q.sources.slice(0, 5)
              const more = q.sources.length - shown.length
              return (
                <QRow key={`${q.question}-${i}`}>
                  <div style={{ fontSize: 14 }}>{q.question}</div>
                  <div
                    style={{
                      textAlign: "right",
                      fontSize: 13,
                      fontVariantNumeric: "tabular-nums",
                      color: C.body,
                    }}
                  >
                    {fmt(q.aiSearchVolume)}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                    {shown.map((s, j) => {
                      const isOwn = sameHost(s.domain, own)
                      return (
                        <span
                          key={`${s.domain}-${j}`}
                          title={s.title || s.domain}
                          style={{
                            fontSize: 11.5,
                            color: isOwn ? C.accent : C.label,
                            background: isOwn ? C.accentWash : C.chip,
                            borderRadius: 6,
                            padding: "4px 8px",
                            whiteSpace: "nowrap",
                            fontWeight: isOwn ? 600 : 400,
                          }}
                        >
                          {s.domain}
                        </span>
                      )
                    })}
                    {more > 0 && (
                      <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.faint, padding: "4px 2px" }}>
                        +{more}
                      </span>
                    )}
                    {q.sources.length === 0 && (
                      <span style={{ fontSize: 11.5, color: C.ghost }}>no sources cited</span>
                    )}
                  </div>
                </QRow>
              )
            })}
          </>
        )}
      </Card>

      {/* ── Cited alongside ── */}
      {coverage.citedAlongside.length > 0 && (
        <Card style={{ padding: "24px 30px 26px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: "-0.015em" }}>
              Cited alongside {own}
            </h2>
            <div style={{ fontSize: 12, color: C.faint }}>{t("llmCoCited")}</div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 20 }}>
            {coverage.citedAlongside.map((a) => {
              const isOwn = sameHost(a.key, own)
              return (
                <div
                  key={a.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    border: `1px solid ${isOwn ? "#cfd6f6" : C.field}`,
                    background: isOwn ? C.accentWash : "#fff",
                    borderRadius: 8,
                    padding: "7px 11px",
                    fontSize: 12.5,
                    color: isOwn ? C.accent : C.body,
                    fontWeight: isOwn ? 600 : 400,
                  }}
                >
                  <span>{a.key}</span>
                  <span style={{ fontFamily: MONO, fontSize: 10.5, color: isOwn ? C.accent : C.faint }}>
                    {fmt(a.mentions)}
                  </span>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </>
  )
}

function Stat({ label, hint, value }: { label: string; hint: string; value: string }) {
  return (
    <Card
      style={{
        padding: "22px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flex: 1,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: C.label }}>{label}</div>
        <div style={{ fontSize: 11.5, color: C.faint }}>{hint}</div>
      </div>
      <div
        style={{
          fontSize: 34,
          fontWeight: 600,
          letterSpacing: "-0.03em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </Card>
  )
}

function SectionHead({ title, aside }: { title: string; aside: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 24,
        padding: "24px 30px 18px",
        flexWrap: "wrap",
      }}
    >
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: "-0.015em" }}>{title}</h2>
      <div style={{ fontSize: 12, color: C.faint }}>{aside}</div>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "40px 30px", textAlign: "center", color: C.muted, fontSize: 13.5 }}>
      {children}
    </div>
  )
}

const GRID = "44px minmax(0,1fr) 200px 130px"
const QGRID = "1.1fr 130px 2fr"

function Row({
  children,
  header,
  highlight,
}: {
  children: React.ReactNode
  header?: boolean
  highlight?: boolean
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: GRID,
        gap: 20,
        alignItems: "center",
        padding: header ? "0 30px 10px" : "17px 30px",
        borderTop: header ? undefined : `1px solid ${C.hair}`,
        background: highlight ? C.accentWash : undefined,
        ...(header
          ? {
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: "0.1em",
              textTransform: "uppercase" as const,
              color: C.faint,
            }
          : {}),
      }}
    >
      {children}
    </div>
  )
}

function QRow({ children, header }: { children: React.ReactNode; header?: boolean }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: QGRID,
        gap: 24,
        alignItems: "center",
        padding: header ? "0 30px 10px" : "14px 30px",
        borderTop: header ? undefined : `1px solid ${C.hair}`,
        ...(header
          ? {
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: "0.1em",
              textTransform: "uppercase" as const,
              color: C.faint,
            }
          : {}),
      }}
    >
      {children}
    </div>
  )
}
