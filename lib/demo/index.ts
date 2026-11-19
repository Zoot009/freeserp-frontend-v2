// Demo registry: answers every `<tool prefix>/demo…` request in-process, for
// both HTTP clients (lib/api.ts and lib/axios.ts), so a demo never reaches the
// network. Spec: .claude/skills/demo-report/SKILL.md.

import { DEMO_ID, type DemoResult, type DemoTool } from "./shared"

// Every tool with a demo: API prefix -> its module, loaded on the first request
// to that demo. Loading lazily keeps each tool's sample data out of every page's
// bundle (lib/api.ts is in all of them). Adding a tool is one line here — the
// only line of this file a tool's PR touches.
export const DEMO_TOOLS: Record<string, () => Promise<DemoTool>> = {
  "/api/projects": () => import("./rank-tracker").then((m) => m.rankTrackerDemo),
  "/api/competitor-analysis": () => import("./competitor-analysis").then((m) => m.competitorAnalysisDemo),
  "/api/keyword-analysis": () => import("./keyword-score").then((m) => m.keywordScoreDemo),
}

const READ_ONLY: DemoResult = {
  error: { status: 403, code: "demo_read_only", message: "This is a demo. Try it on your own site to use this." },
}
const NOT_FOUND: DemoResult = { error: { status: 404, code: "not_found", message: "Not found" } }

/**
 * The response for a demo request, or null when `url` is not one. `url` may be
 * a path ("/api/projects/demo?range=7d") or a full URL, as axios callers pass.
 */
export async function demoResponse(url: string, method: string): Promise<DemoResult | null> {
  const u = new URL(url, "http://demo.local")
  for (const [base, load] of Object.entries(DEMO_TOOLS)) {
    const prefix = `${base}/${DEMO_ID}`
    if (u.pathname !== prefix && !u.pathname.startsWith(`${prefix}/`)) continue
    if (method.toUpperCase() !== "GET") return READ_ONLY
    const tool = await load()
    const data = tool.get(u.pathname.slice(prefix.length).split("/").filter(Boolean), u.searchParams)
    return data === undefined ? NOT_FOUND : { data }
  }
  return null
}
