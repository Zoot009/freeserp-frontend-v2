// Demo registry: answers every `<tool base>/demo…` request in-process, for
// both HTTP clients (lib/api.ts and lib/axios.ts), so a demo never reaches the
// network. Spec: .claude/skills/demo-report/SKILL.md.

import { rankTrackerDemo } from "./rank-tracker"
import { DEMO_ID, type DemoResult, type DemoTool } from "./shared"

// Every tool with a demo. Adding one: import its DemoTool and append it here —
// the only line of this file a tool's PR touches.
export const DEMO_TOOLS: DemoTool[] = [
  rankTrackerDemo,
]

const READ_ONLY: DemoResult = {
  error: { status: 403, code: "demo_read_only", message: "This is a demo. Try it on your own site to use this." },
}
const NOT_FOUND: DemoResult = { error: { status: 404, code: "not_found", message: "Not found" } }

/**
 * The response for a demo request, or null when `url` is not one. `url` may be
 * a path ("/api/projects/demo?range=7d") or a full URL, as axios callers pass.
 */
export function demoResponse(url: string, method: string): DemoResult | null {
  const u = new URL(url, "http://demo.local")
  for (const tool of DEMO_TOOLS) {
    const prefix = `${tool.base}/${DEMO_ID}`
    if (u.pathname !== prefix && !u.pathname.startsWith(`${prefix}/`)) continue
    if (method.toUpperCase() !== "GET") return READ_ONLY
    const data = tool.get(u.pathname.slice(prefix.length).split("/").filter(Boolean), u.searchParams)
    return data === undefined ? NOT_FOUND : { data }
  }
  return null
}
