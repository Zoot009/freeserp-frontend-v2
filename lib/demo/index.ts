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
  "/api/youtube/projects": () => import("./youtube-tracker").then((m) => m.youtubeTrackerDemo),
  "/api/maps-tracker/scans": () => import("./maps-tracker").then((m) => m.mapsTrackerDemo),
  "/api/gbp-audit": () => import("./maps-audit").then((m) => m.mapsAuditDemo),
  "/api/llm-tracker/projects": () => import("./ai-prompt-tracker").then((m) => m.aiPromptTrackerDemo),
  "/api/serp-check": () => import("./serp-checker").then((m) => m.serpCheckerDemo),
  "/api/keyword-magic": () => import("./keyword-magic").then((m) => m.keywordMagicDemo),
  "/api/page-audit/reports": () => import("./page-audit").then((m) => m.pageAuditDemo),
  "/api/ads-analysis": () => import("./ads-analysis").then((m) => m.adsAnalysisDemo),
  "/api/competitor-analysis": () => import("./competitor-analysis").then((m) => m.competitorAnalysisDemo),
  "/api/keyword-analysis": () => import("./keyword-score").then((m) => m.keywordScoreDemo),
  "/api/aeo-audit": () => import("./aeo-audit").then((m) => m.aeoAuditDemo),
  "/api/internal-link-analysis": () => import("./internal-links").then((m) => m.internalLinksDemo),
}

const READ_ONLY: DemoResult = {
  error: { status: 403, code: "demo_read_only", message: "This is a demo. Try it on your own site to use this." },
}
const NOT_FOUND: DemoResult = { error: { status: 404, code: "not_found", message: "Not found" } }

const under = (pathname: string, prefix: string) =>
  pathname === `${prefix}/${DEMO_ID}` || pathname.startsWith(`${prefix}/${DEMO_ID}/`)

/**
 * One tool's routing, once its module is loaded: null when `url` isn't under
 * `<prefix>/demo`, 403 for any write, the tool's GET answer or a 404. Tests call
 * it with a tool directly; the app goes through demoResponse.
 */
export function routeDemo(prefix: string, tool: DemoTool, url: string, method: string): DemoResult | null {
  const u = new URL(url, "http://demo.local")
  if (!under(u.pathname, prefix)) return null
  if (method.toUpperCase() !== "GET") return READ_ONLY
  const data = tool.get(u.pathname.slice(`${prefix}/${DEMO_ID}`.length).split("/").filter(Boolean), u.searchParams)
  return data === undefined ? NOT_FOUND : { data }
}

/**
 * The response for a demo request, or null when `url` is not one. `url` may be
 * a path ("/api/projects/demo?range=7d") or a full URL, as axios callers pass.
 */
export async function demoResponse(url: string, method: string): Promise<DemoResult | null> {
  const { pathname } = new URL(url, "http://demo.local")
  for (const [prefix, load] of Object.entries(DEMO_TOOLS)) {
    if (under(pathname, prefix)) return routeDemo(prefix, await load(), url, method)
  }
  return null
}
