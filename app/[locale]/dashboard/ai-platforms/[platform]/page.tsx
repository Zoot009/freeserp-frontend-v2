"use client"

// One AI assistant, across every brand.
//
// The project pages answer "how is this brand doing?". This answers the other
// question, which nothing could serve before because every query in the feature
// was scoped to a single project: "how am I doing on Claude?".
//
// ONE component still serves all four routes — but it is now driven by
// ENGINES[id] in lib/ai-engines.ts, which decides the accent, the capability
// facts, which numbers lead, which columns the board carries and, the
// substantive part, the ORDER OF THE SECTIONS. Before this the only per-engine
// branch was a label and an icon, which is why four sidebar entries read as four
// links to the same page.
//
// Read-only by design. Running is project-scoped on the backend, so a run button
// here would have to fan out across projects and quietly multiply spend; the row
// action goes to the brand instead. For the same reason there is NO POLLER: a
// running row shows its progress bar and the header offers a manual refresh.
//
// NOTE: strings are inline English, matching the rest of this dashboard section.

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { StatTile } from "@/components/dashboard/primitives"
import { EngineCaps, EngineHero, SectionHead } from "@/components/dashboard/ai-tracker/engine-hero"
import { EngineTrend } from "@/components/dashboard/ai-tracker/engine-charts"
import { PromptBoard } from "@/components/dashboard/ai-tracker/prompt-board"
import {
  Coverage,
  EngineCost,
  FanOut,
  ShareOfVoice,
  SourcesLeaderboard,
  sourceCountsFor,
} from "@/components/dashboard/ai-tracker/engine-panels"
import { CrossEngineRail } from "@/components/dashboard/ai-tracker/cross-engine-rail"
import { EngineEmpty } from "@/components/dashboard/ai-tracker/engine-empty"
import { AddPromptsAction } from "@/components/dashboard/ai-tracker/add-prompts-action"
import { ENGINES } from "@/lib/ai-engines"
import type { MetricKey, SectionKey } from "@/lib/ai-engines"
import {
  pct,
  rateHistory,
  SLUG_TO_PLATFORM,
  type AnswersDetail,
  type Platform,
  type PlatformIndex,
  type PlatformStats,
  type PlatformView,
} from "@/lib/ai-tracker"

export default function PlatformPage() {
  const params = useParams<{ platform: string }>()
  const slug = params.platform
  const platform = SLUG_TO_PLATFORM[slug]
  const { loading: authLoading } = useAuth()

  const [data, setData] = useState<PlatformView | null>(null)
  const [detail, setDetail] = useState<AnswersDetail | null>(null)
  const [index, setIndex] = useState<PlatformIndex | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")

  const load = useCallback(
    async (quiet = false) => {
      if (!platform) return
      if (quiet) setRefreshing(true)
      else setLoading(true)
      setError("")
      try {
        // The main view is the only one that may fail loudly. The other two
        // enrich the page — a backend that predates them 404s, and a page that
        // rendered a red error card because a sparkline was unavailable would be
        // worse than one that quietly omits the sparkline.
        const view = await api.get<PlatformView>(`/api/llm-tracker/platforms/${platform}`)
        setData(view)
        const [idx, det] = await Promise.allSettled([
          api.get<PlatformIndex>("/api/llm-tracker/platforms"),
          api.get<AnswersDetail>(`/api/llm-tracker/platforms/${platform}/answers-detail`),
        ])
        setIndex(idx.status === "fulfilled" ? idx.value : null)
        setDetail(det.status === "fulfilled" ? det.value : null)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Couldn't load this assistant.")
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [platform],
  )

  useEffect(() => {
    void load()
  }, [load])

  const byProject = useMemo(() => {
    const m = new Map<string, PlatformView["prompts"]>()
    for (const p of data?.prompts ?? []) m.set(p.projectId, [...(m.get(p.projectId) ?? []), p])
    return m
  }, [data])

  /**
   * The assistant's own average over its recent runs.
   *
   * Averaged per RUN POSITION rather than per date: the runs across prompts are
   * not synchronised, so there is no shared timeline to plot against. "Your
   * average over the last N rounds of checking" is the honest reading, and it is
   * the one the axis label claims.
   */
  const trend = useMemo(() => {
    const series = (data?.prompts ?? []).map((p) => rateHistory(p.runs)).filter((h) => h.length > 1)
    if (series.length === 0) return []
    const depth = Math.min(8, Math.max(...series.map((s) => s.length)))
    const out: number[] = []
    for (let i = 0; i < depth; i++) {
      // Read from the END so the newest run of every prompt lines up, however
      // many times each has been checked.
      const vals = series.map((s) => s[s.length - depth + i]).filter((v): v is number => v != null)
      if (vals.length) out.push(vals.reduce((a, b) => a + b, 0) / vals.length)
    }
    return out
  }, [data])

  const stats = useMemo(() => {
    const m: Partial<Record<Platform, PlatformStats>> = {}
    for (const p of index?.platforms ?? []) if (p.stats) m[p.id] = p.stats
    return m
  }, [index])

  const sourceCounts = useMemo(() => sourceCountsFor(detail), [detail])

  /** projectId → prompts tracked on this assistant, for the brand picker. */
  const promptCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of data?.prompts ?? []) m.set(p.projectId, (m.get(p.projectId) ?? 0) + 1)
    return m
  }, [data])

  // An unknown slug is a wrong URL, not an empty account — say so rather than
  // rendering a convincingly empty dashboard.
  if (!platform) {
    return (
      <div className="page">
        <div className="llm-empty">
          <div className="b">No such AI assistant</div>
          <div className="tiny muted" style={{ margin: "6px 0 14px" }}>
            &ldquo;{slug}&rdquo; isn&rsquo;t one we track.
          </div>
          <Link href="/dashboard/ai-prompt-tracker" className="btn primary">
            Go to AI Prompt Tracker
          </Link>
        </div>
      </div>
    )
  }

  const engine = ENGINES[platform]

  if (authLoading || loading) {
    return (
      <div className="page llm-eng" data-engine={platform}>
        {/* The hero is static — it comes from the profile, not the API — so it
            paints immediately and only the data below it is a skeleton. */}
        <EngineHero engine={engine} brands={0} prompts={0} />
        <div className="grid g-4" style={{ marginBottom: 14 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card">
              <div className="skeleton" style={{ height: 12, width: 90 }} />
              <div className="skeleton" style={{ height: 26, width: 60, marginTop: 10 }} />
            </div>
          ))}
        </div>
        <div className="card" style={{ height: 220 }} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="page llm-eng" data-engine={platform}>
        <EngineHero engine={engine} brands={0} prompts={0} />
        <div className="card" style={{ padding: 24, color: "var(--neg)", fontSize: 13 }}>
          {error}
          <div style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={() => void load()}>
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }

  const summary = data?.summary ?? null
  const totalPrompts = index?.totalPrompts ?? 0
  // Every brand, not just the ones already tracking here — the add flow exists
  // precisely for the brands that do not.
  const allProjects = data?.availableProjects ?? data?.projects ?? []
  const empty = !data || data.prompts.length === 0

  // ── The metric tiles ──────────────────────────────────────────────────────
  // The same four numbers on every assistant; the ORDER is the engine's claim
  // about which one matters. Perplexity leads on citations because on a product
  // that always retrieves, a mention nobody sourced is the anomaly.
  const metric = (k: MetricKey) => {
    if (!summary) return null
    switch (k) {
      case "tracked":
        return <StatTile key={k} lbl="Prompts tracked" val={summary.tracked} />
      case "appear":
        return (
          <StatTile
            key={k}
            lbl="You appear in"
            val={`${summary.mentioned} of ${summary.measured}`}
            tip="prompts where at least one answer named you"
          />
        )
      case "rate":
        return (
          <StatTile
            key={k}
            lbl="Average mention rate"
            val={pct(summary.avgMentionRate)}
            tip={`across completed ${engine.label} runs`}
          />
        )
      case "cited":
        return (
          <StatTile key={k} lbl="Cited as a source" val={summary.cited} tip="prompts where the assistant linked to you" />
        )
      case "position": {
        // Averaged over the prompts that HAVE a position. A prompt nobody named
        // has no position, and counting it as zero would say your first mention
        // lands in the first character.
        const vals = (data?.prompts ?? [])
          .map((p) => (p.runs[0]?.status === "COMPLETED" ? p.runs[0]?.avgProminence : null))
          .filter((v): v is number => v != null)
        const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
        return (
          <StatTile
            key={k}
            lbl="Average position in answer"
            val={avg == null ? "—" : pct(avg)}
            tip="how far in your first mention lands — lower is better"
          />
        )
      }
    }
  }

  // ── The section registry ──────────────────────────────────────────────────
  // Nothing here knows which assistant it is; `engine.sections` decides which
  // panels appear and in what order. A panel with nothing to say returns null,
  // so the page never draws an empty card.
  const section = (k: SectionKey) => {
    switch (k) {
      case "metrics":
        return (
          <div key={k}>
            <div className="grid g-4" style={{ marginBottom: 14 }}>
              {engine.metrics.map(metric)}
            </div>
            {trend.length > 1 && (
              <div className="card" style={{ padding: "14px 15px 6px" }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                  <div className="t" style={{ fontSize: 13, fontWeight: 600 }}>
                    Average mention rate on {engine.label}
                  </div>
                  <div className="tiny muted">last {trend.length} runs</div>
                </div>
                <EngineTrend data={trend} />
              </div>
            )}
          </div>
        )
      case "caps":
        return <EngineCaps engine={engine} key={k} />
      case "board":
        return (
          <div key={k}>
            <SectionHead
              title={`Your prompts on ${engine.label}`}
              why={`${data!.projects.length} brand${data!.projects.length === 1 ? "" : "s"}, newest run for each`}
            />
            {data!.projects.map((project) => {
              const rows = byProject.get(project.id) ?? []
              if (rows.length === 0) return null
              return (
                <PromptBoard
                  key={project.id}
                  engine={engine}
                  project={project}
                  prompts={rows}
                  sourceCounts={sourceCounts}
                />
              )
            })}
          </div>
        )
      case "sources":
        return <SourcesLeaderboard engine={engine} sources={detail?.sources ?? []} key={k} />
      case "competitors":
        return <ShareOfVoice engine={engine} competitors={detail?.competitors ?? []} key={k} />
      case "fanout":
        return <FanOut engine={engine} fanOut={detail?.fanOut ?? null} key={k} />
      case "cost":
        return <EngineCost engine={engine} view={data!} key={k} />
      case "coverage":
        return (
          <Coverage
            key={k}
            engine={engine}
            here={summary?.tracked ?? data!.prompts.length}
            total={totalPrompts}
            projects={allProjects}
          />
        )
      case "cross":
        return <CrossEngineRail current={platform} stats={stats} key={k} />
    }
  }

  return (
    <div className="page llm-eng" data-engine={platform}>
      <EngineHero
        engine={engine}
        brands={data?.projects.length ?? 0}
        prompts={summary?.tracked ?? 0}
        actions={
          <>
            {/* The page's primary action, and the one it was missing: adding a
                prompt used to mean leaving for the tracker and finding the
                button on a brand page. */}
            <AddPromptsAction engine={engine} projects={allProjects} counts={promptCounts} />
            {/* No poller here (see the file header), so refreshing is explicit. */}
            <button type="button" className="btn" onClick={() => void load(true)} disabled={refreshing}>
              <RefreshCw aria-hidden /> {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </>
        }
      />

      {empty ? (
        <>
          {/* The capability strip renders here too. It is what the page is
              ABOUT, and it is what makes an empty ChatGPT page and an empty
              Gemini page two different pages rather than two dashed boxes. */}
          <EngineCaps engine={engine} />
          <div style={{ height: 14 }} />
          <EngineEmpty
            engine={engine}
            variant={totalPrompts > 0 ? "none-here" : "new-account"}
            totalPrompts={totalPrompts}
            projects={allProjects}
          />
          <div style={{ height: 22 }} />
          <CrossEngineRail current={platform} stats={stats} />
        </>
      ) : (
        engine.sections.map(section)
      )}
    </div>
  )
}
