import { describe, expect, it } from "vitest"
// AI-tracker specifics only; read-only/404/matching is the contract test (index.test.ts).
import { PLATFORMS, type PromptRow } from "@/lib/ai-tracker"
import { demoResponse } from "./index"
import { demoAiTrackerProject } from "./ai-prompt-tracker"

type Sample = { status: string; responseText: string | null; mentioned: boolean; mentionOffset: number | null; cited: boolean }
type Detail = { runs: { id: string; platform: string; mentionRate: number | null; citationRate: number | null; status: string }[]; latestRunId: string | null; samples: Sample[] }

const get = <T,>(path: string) => {
  const r = demoResponse(path, "GET")
  if (!r || r.error) throw new Error(`expected data for ${path}`)
  return r.data as T
}

describe("demo ai prompt tracker", () => {
  const { project, prompts } = get<{ project: { brandTerms: { matched: string[] } }; prompts: PromptRow[] }>("/api/llm-tracker/projects/demo")

  it("every run is finished, so nothing polls", () => {
    for (const p of prompts) expect(p.runs.every((r) => r.status === "COMPLETED" || r.status === "FAILED")).toBe(true)
  })

  it("each platform's rates are what its answers score, and the table shows the same run", () => {
    const matched = new RegExp(`(?<![\p{L}\p{N}])(${project.brandTerms.matched.map((t) => t.replace(/\./g, "\.")).join("|")})(?![\p{L}\p{N}])`, "iu")
    for (const p of prompts) {
      for (const platform of p.platforms) {
        const d = get<Detail>(`/api/llm-tracker/projects/demo/prompts/${p.id}?platform=${platform}`)
        const run = d.runs.find((r) => r.id === d.latestRunId)!
        expect(run.platform).toBe(platform)
        expect(p.runs.find((r) => r.platform === platform)?.id).toBe(run.id)
        const ok = d.samples.filter((s) => s.status === "COMPLETED")
        if (!ok.length) {
          expect(run.mentionRate).toBeNull()
          continue
        }
        for (const s of ok) expect(s.mentioned).toBe(matched.test(s.responseText!))
        expect(run.mentionRate).toBeCloseTo(ok.filter((s) => s.mentioned).length / ok.length)
        expect(run.citationRate).toBeCloseTo(ok.filter((s) => s.cited).length / ok.length)
      }
    }
  })

  it("covers every assistant, a 0% prompt, a 100% prompt and a failed run", () => {
    const latest = prompts.flatMap((p) => p.platforms.map((pl) => p.runs.find((r) => r.platform === pl)!))
    expect(new Set(prompts.flatMap((p) => p.platforms))).toEqual(new Set(PLATFORMS))
    expect(latest.some((r) => r.mentionRate === 0)).toBe(true)
    expect(latest.some((r) => r.mentionRate === 1)).toBe(true)
    expect(latest.some((r) => r.status === "FAILED")).toBe(true)
  })

  it("is stable, summarises for the list, and 404s what isn't there", () => {
    expect(get("/api/llm-tracker/projects/demo")).toEqual({ project, prompts })
    expect(demoAiTrackerProject().promptCount).toBe(prompts.length)
    expect(demoResponse("/api/llm-tracker/projects/demo/prompts/missing", "GET")).toMatchObject({ error: { status: 404 } })
    expect(demoResponse(`/api/llm-tracker/projects/demo/prompts/${prompts[0].id}?platform=bard`, "GET")).toMatchObject({ error: { status: 404 } })
  })
})
