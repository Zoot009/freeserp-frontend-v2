"use client"

// One AI platform, across every brand.
//
// The project pages answer "how is this brand doing?". This answers the other
// question, which nothing could serve before because every query in the feature
// was scoped to a single project: "how am I doing on Claude?".
//
// Read-only by design. Running is project-scoped on the backend, so a run button
// here would have to fan out across projects and quietly multiply spend; the row
// action goes to the brand instead.
//
// NOTE: strings are inline English, matching the rest of this dashboard section.

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { api, ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { Icon } from "@/components/dashboard/icons"
import { StatTile } from "@/components/dashboard/primitives"
import { PlatformMark } from "@/components/dashboard/platform-marks"
import { RateCell, RunStateCell, CitedCell } from "@/components/dashboard/ai-tracker/run-state-cell"
import {
  deriveRunState,
  pct,
  PLATFORM_LABEL,
  SLUG_TO_PLATFORM,
  type Platform,
  type RunSummary,
} from "@/lib/ai-tracker"

type ProjectRef = { id: string; name: string; brandName: string; brandDomain: string | null }

type PlatformPrompt = {
  id: string
  projectId: string
  prompt: string
  samplesPerRun: number
  runs: RunSummary[]
}

type PlatformView = {
  platform: Platform
  label: string
  projects: ProjectRef[]
  prompts: PlatformPrompt[]
  summary: {
    tracked: number
    measured: number
    mentioned: number
    avgMentionRate: number
    cited: number
  } | null
}

export default function PlatformPage() {
  const params = useParams<{ platform: string }>()
  const slug = params.platform
  const platform = SLUG_TO_PLATFORM[slug]
  const { loading: authLoading } = useAuth()

  const [data, setData] = useState<PlatformView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    if (!platform) return
    setLoading(true)
    setError("")
    try {
      setData(await api.get<PlatformView>(`/api/llm-tracker/platforms/${platform}`))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load this platform.")
    } finally {
      setLoading(false)
    }
  }, [platform])

  useEffect(() => {
    void load()
  }, [load])

  const byProject = useMemo(() => {
    const m = new Map<string, PlatformPrompt[]>()
    for (const p of data?.prompts ?? []) {
      m.set(p.projectId, [...(m.get(p.projectId) ?? []), p])
    }
    return m
  }, [data])

  // An unknown slug is a wrong URL, not an empty account — say so rather than
  // rendering a convincingly empty dashboard.
  if (!platform) {
    return (
      <div className="page">
        <div className="llm-empty">
          <div className="b">No such AI platform</div>
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

  if (authLoading || loading) {
    return (
      <div className="page">
        <div className="page-h">
          <div className="skeleton" style={{ height: 30, width: 220 }} />
        </div>
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
      <div className="page">
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

  const label = data?.label ?? PLATFORM_LABEL[platform]
  const s = data?.summary

  return (
    <div className="page">
      <div className="page-h">
        <div className="row" style={{ gap: 12 }}>
          <PlatformMark id={platform} size={30} />
          <div>
            <div className="tiny muted">
              <Link href="/dashboard/ai-prompt-tracker">AI Prompt Tracker</Link> · Platform
            </div>
            <h1>{label}</h1>
          </div>
        </div>
      </div>

      {!data || data.prompts.length === 0 ? (
        <div className="llm-empty">
          <div className="eyebrow" style={{ justifyContent: "center" }}>
            <span className="spark">
              <Icon.spark />
            </span>{" "}
            Nothing on {label} yet
          </div>
          <div className="b" style={{ margin: "8px 0 6px" }}>
            No prompts are tracked on {label}.
          </div>
          <div className="tiny muted" style={{ marginBottom: 14 }}>
            Add {label} to a prompt in any brand and its results will collect here.
          </div>
          <Link href="/dashboard/ai-prompt-tracker" className="btn primary">
            Open AI Prompt Tracker
          </Link>
        </div>
      ) : (
        <>
          <div className="grid g-4" style={{ marginBottom: 14 }}>
            <StatTile lbl="Prompts tracked" val={s ? s.tracked : data.prompts.length} />
            <StatTile
              lbl="You appear in"
              val={s ? `${s.mentioned} of ${s.measured}` : "—"}
              tip="prompts where at least one answer named you"
            />
            <StatTile
              lbl="Average mention rate"
              val={s ? pct(s.avgMentionRate) : "—"}
              tip={`across completed ${label} runs`}
            />
            <StatTile lbl="Cited as a source" val={s ? s.cited : "—"} tip="prompts where the AI linked to you" />
          </div>

          {data.projects.map((project) => {
            const rows = byProject.get(project.id) ?? []
            if (rows.length === 0) return null
            return (
              <div className="card" style={{ padding: 0, marginBottom: 14 }} key={project.id}>
                <div className="card-h" style={{ padding: "14px 16px" }}>
                  <div>
                    <div className="t">
                      <Link href={`/dashboard/ai-prompt-tracker/${project.id}`}>{project.name}</Link>
                    </div>
                    <div className="tiny muted">
                      {project.brandName}
                      {project.brandDomain ? ` · ${project.brandDomain}` : ""}
                    </div>
                  </div>
                  <span className="chip outline">
                    {rows.length} prompt{rows.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="tbl-scroll">
                  <table className="tbl" style={{ minWidth: 760 }}>
                    <thead>
                      <tr>
                        <th>Prompt</th>
                        <th style={{ width: 190 }}>Status</th>
                        <th style={{ textAlign: "right", width: 130 }}>Mention rate</th>
                        <th style={{ textAlign: "right", width: 110 }}>Cited</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const run = row.runs[0]
                        const state = deriveRunState(run)
                        return (
                          <tr key={row.id}>
                            <td>
                              <Link
                                href={`/dashboard/ai-prompt-tracker/${row.projectId}/${row.id}?platform=${platform}`}
                                className="llm-prompt"
                              >
                                <span className="txt">{row.prompt}</span>
                                <span className="sub">{row.samplesPerRun} samples per run</span>
                              </Link>
                            </td>
                            <td>
                              <RunStateCell state={state} />
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <RateCell rate={run?.mentionRate ?? null} change={run?.change ?? null} />
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <CitedCell state={state} rate={run?.citationRate ?? null} />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
