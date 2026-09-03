"use client"

/**
 * One brand's prompts on one assistant.
 *
 * Replaces the `card` + `tbl` pair the old page drew, which was a box inside a
 * box and gave the eye nothing to land on. The board carries the brand's average
 * in its header — the number you came for, without reading the table — and an
 * accent stripe down its left edge that repeats the assistant's identity all the
 * way down a long page.
 *
 * WHICH COLUMNS is the engine's decision, not this component's: ChatGPT shows
 * position and a link back to the live answer, Perplexity shows sources, Claude
 * shows what the run costs. That is real differentiation rather than a relabel,
 * and it lives in `engine.columns`.
 *
 * RunStateCell / RateCell / CitedCell are used unchanged. They were written to
 * keep queued, running, failed and partially-failed apart, and a redesign that
 * quietly collapsed those states would be a regression dressed as a facelift.
 */

import Link from "next/link"
import { ExternalLink, Plus } from "lucide-react"
import { CitedCell, RateCell, RunStateCell } from "@/components/dashboard/ai-tracker/run-state-cell"
import { RateSparkline } from "@/components/dashboard/ai-tracker/engine-charts"
import { deriveRunState, pct, rateHistory, type PlatformPrompt, type ProjectRef } from "@/lib/ai-tracker"
import type { ColumnKey, EngineProfile } from "@/lib/ai-engines"

const HEAD: Record<ColumnKey, { label: string; width?: number; right?: boolean }> = {
  prompt: { label: "Prompt" },
  trend: { label: "Trend", width: 80 },
  status: { label: "Status", width: 180 },
  rate: { label: "Mention rate", width: 120, right: true },
  position: { label: "Position", width: 130, right: true },
  cited: { label: "Cited", width: 105, right: true },
  sources: { label: "Sources", width: 110 },
  credits: { label: "Credits/run", width: 95, right: true },
  verify: { label: "Answer", width: 90 },
}

/** Two initials, so a board is identifiable before you read its title. */
const initials = (s: string) =>
  s
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase()

export function PromptBoard({
  engine,
  project,
  prompts,
  sourceCounts,
}: {
  engine: EngineProfile
  project: ProjectRef
  prompts: PlatformPrompt[]
  /** promptId → distinct domains cited in its newest run. Absent until the
   *  answers-detail call resolves, which is why every cell tolerates undefined. */
  sourceCounts?: Map<string, number>
}) {
  const completed = prompts.filter((p) => p.runs[0]?.status === "COMPLETED" && p.runs[0]?.mentionRate != null)
  const avg = completed.length
    ? completed.reduce((n, p) => n + (p.runs[0]!.mentionRate as number), 0) / completed.length
    : null
  // The board's strongest prompt gets the accent stripe. Meaningless with one
  // result, so it only appears once there is something to be strongest among.
  const hot =
    completed.length > 1
      ? completed.reduce((a, b) => ((b.runs[0]!.mentionRate as number) > (a.runs[0]!.mentionRate as number) ? b : a)).id
      : null

  const cell = (key: ColumnKey, p: PlatformPrompt) => {
    const run = p.runs[0]
    const state = deriveRunState(run)
    switch (key) {
      case "prompt":
        return (
          <Link
            className="llm-prompt"
            href={`/dashboard/ai-prompt-tracker/${p.projectId}/${p.id}?platform=${engine.id}`}
          >
            <span className="txt">{p.prompt}</span>
            <span className="sub">{p.samplesPerRun} answers per run</span>
          </Link>
        )
      case "trend":
        return <RateSparkline data={rateHistory(p.runs)} />
      case "status":
        return <RunStateCell state={state} />
      case "rate":
        return <RateCell rate={run?.mentionRate ?? null} change={run?.change ?? null} />
      case "position": {
        // Prominence is "how far into the answer the first mention lands", so a
        // SHORT bar is good. The word beside it carries that, because a bar
        // alone is read the usual way round.
        const v = state.kind === "completed" ? (run?.avgProminence ?? null) : null
        if (v == null) return <span className="tiny muted">—</span>
        return (
          <span className="llm-pos" title={`First mention lands ${pct(v)} of the way into the answer`}>
            <span className="bar">
              <span style={{ width: `${Math.round(v * 100)}%` }} />
            </span>
            <b>{v < 0.34 ? "early" : v < 0.67 ? "mid" : "late"}</b>
          </span>
        )
      }
      case "cited":
        return <CitedCell state={state} rate={run?.citationRate ?? null} />
      case "sources": {
        const n = sourceCounts?.get(p.id)
        if (!n) return <span className="tiny muted">—</span>
        return (
          <span className="llm-srcs" title={`${n} distinct source${n === 1 ? "" : "s"} cited`}>
            {Array.from({ length: Math.min(3, n) }, (_, i) => (
              <span className="f" key={i} aria-hidden />
            ))}
            <span className="more">{n}</span>
          </span>
        )
      }
      case "credits":
        return <span className="llm-cred">{p.samplesPerRun * engine.creditsPerAnswer}</span>
      case "verify":
        // Only ChatGPT returns a check_url, and it lives on the sample rather
        // than the run — so the link goes to the prompt, where the samples are.
        return state.kind === "completed" ? (
          <Link
            className="llm-verify"
            href={`/dashboard/ai-prompt-tracker/${p.projectId}/${p.id}?platform=${engine.id}`}
          >
            <ExternalLink aria-hidden /> Open
          </Link>
        ) : (
          <span className="tiny muted">—</span>
        )
    }
  }

  return (
    <section className="llm-board">
      <header className="llm-board-h">
        <span className="llm-board-avatar" aria-hidden>
          {initials(project.brandName)}
        </span>
        <div>
          <div className="t">
            <Link href={`/dashboard/ai-prompt-tracker/${project.id}`}>{project.name}</Link>
          </div>
          <div className="tiny muted">
            {project.brandName}
            {project.brandDomain ? ` · ${project.brandDomain}` : ""}
          </div>
        </div>
        <span className="sp" />
        {avg != null && (
          <span className="llm-board-rate" title={`Average mention rate for this brand on ${engine.label}`}>
            {pct(avg)}
            <i>avg</i>
          </span>
        )}
        <span className="chip outline">
          {prompts.length} prompt{prompts.length === 1 ? "" : "s"}
        </span>
        {/* The same action as the header's, but already scoped to the brand you
            are reading — so there is nothing to disambiguate and it sits where
            the question "can I track another one of these?" occurs. */}
        <Link
          className="btn primary"
          href={`/dashboard/ai-prompt-tracker/${project.id}?new=1&platform=${engine.slug}`}
          title={`Add prompts for ${project.name} on ${engine.label}`}
        >
          <Plus aria-hidden /> Add prompts
        </Link>
      </header>
      <div className="tbl-scroll">
        <table className="tbl flush llm-tbl" style={{ minWidth: 820 }}>
          <thead>
            <tr>
              {engine.columns.map((k) => (
                <th
                  key={k}
                  style={{ width: HEAD[k].width, textAlign: HEAD[k].right ? "right" : undefined }}
                >
                  {HEAD[k].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {prompts.map((p) => (
              <tr key={p.id} className={p.id === hot ? "hot" : undefined}>
                {engine.columns.map((k) => (
                  <td key={k} style={{ textAlign: HEAD[k].right ? "right" : undefined }}>
                    {cell(k, p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
