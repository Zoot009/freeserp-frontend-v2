// How the report builder starts each tool once and follows it to the end, through
// the tools' own APIs (the in-house account is paid, so every one is open).
// A run is a start (returns the id the report keeps in its address, so a reload
// carries on rather than starting again) and a poll.

/* eslint-disable @typescript-eslint/no-explicit-any -- tool payloads are read loosely, a few fields each */
import { api, ApiError, isTransient } from "@/lib/api"
import { PLATFORMS } from "@/lib/ai-tracker"
import type { Inputs, RunKey } from "@/lib/report-builder"
import { DEFAULT_SCAN_RADIUS } from "@/components/maps-tracker/grid"

export type Poll = { state: "running" } | { state: "done"; data: any } | { state: "failed"; error: string }
type Deps = Partial<Record<RunKey, any>>

interface RunDef {
  /** A run whose result this one needs before it can start. */
  after?: RunKey
  /** `fresh`: the report was built with "run fresh", so the tool skips its own cache. */
  start(inp: Inputs, deps: Deps, fresh: boolean): Promise<string>
  poll(id: string, inp: Inputs): Promise<Poll>
}

const running: Poll = { state: "running" }
const failed = (error: string): Poll => ({ state: "failed", error })
const msg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback)

export const domainOf = (web?: string) => {
  if (!web) return ""
  try {
    return new URL(/^https?:\/\//i.test(web) ? web : `https://${web}`).hostname.replace(/^www\./, "")
  } catch {
    return web.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/^www\./, "")
  }
}
const fullUrl = (web?: string) => (web && /^https?:\/\//i.test(web) ? web : `https://${domainOf(web)}`)
/** A two-letter country for the tools that take one: a city's own country, else the US. */
export const countryOf = (inp: Pick<Inputs, "loc" | "country">) => {
  const iso = [inp.country, inp.loc].find((c) => c && /^[a-z]{2}$/i.test(c))
  return iso ? iso.toLowerCase() : "us"
}
/**
 * Sites that rank but are nobody's competitor: Google's own pages (Maps, the
 * Business Profile, any country domain) and the platforms a business has a page
 * on. The backend leaves the same ones out of its competitor lists.
 */
const PLATFORM =
  /(^|\.)(google\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})|business\.site|g\.page|youtube\.com|facebook\.com|instagram\.com|linkedin\.com|twitter\.com|x\.com|wikipedia\.org|reddit\.com|quora\.com|pinterest\.com)$/
const isPlatform = (host: string) => PLATFORM.test(host)
/**
 * The report's own rows of a rank-tracking project: its keywords, in its
 * country, on desktop Google. The project can also track the same words
 * elsewhere (an earlier report's location); if nothing matches that closely,
 * the keywords alone decide, so the section can't wait forever.
 */
function ownRows(all: any[], inp: Inputs): any[] {
  const wanted = new Set(trackedKeywords(inp.kw!))
  const mine = all.filter((k) => wanted.has(String(k.keyword ?? "").toLowerCase().replace(/\s+/g, " ")))
  const exact = mine.filter(
    (k) => String(k.location ?? "").toLowerCase() === countryOf(inp) && (k.device ?? "desktop") === "desktop" && (k.engine ?? "google") === "google",
  )
  return exact.length ? exact : mine
}

/** The keywords a rank-tracking project starts with: the main one and how buyers phrase it. */
export const trackedKeywords = (kw: string) => [...new Set([kw, `${kw} near me`, `best ${kw}`].map((k) => k.trim().toLowerCase().replace(/\s+/g, " ")))]

const pageAuditRun = (mode: "site" | "single"): RunDef => ({
  async start(inp, _deps, fresh) {
    const forceRecrawl = fresh || undefined
    const r = await api.post<{ jobId: string }>("/api/page-audit", mode === "site" ? { url: inp.web, mode, maxPages: 100, forceRecrawl } : { url: fullUrl(inp.web), mode, forceRecrawl })
    return r.jobId
  },
  async poll(id) {
    const job = await api.get<any>(`/api/page-audit/jobs/${id}`)
    if (job.state === "failed" || job.status === "FAILED") return failed(job.error ?? "The audit failed.")
    if (!(job.state === "completed" || job.status === "COMPLETED") || !job.reportId) return running
    const [report, issues] = await Promise.all([api.get<any>(`/api/page-audit/reports/${job.reportId}`), api.get<any>(`/api/page-audit/reports/${job.reportId}/issue-groups`)])
    // Only what the section shows: the report also carries every crawled page and
    // raw issue, megabytes on a 100-page site, which made sharing the report fail.
    const { url, overallScore, totals, screenshots } = report
    return { state: "done", data: { report: { id: report.id, url, overallScore, totals, screenshots }, groups: issues.groups ?? [] } }
  },
})

export const RUNS: Record<RunKey, RunDef> = {
  gbp: {
    async start(inp, _deps, fresh) {
      const r = await api.post<any>("/api/gbp-audit", { url: inp.maps, keyword: inp.kw || null, fresh: fresh || undefined })
      return r.audit.id
    },
    async poll(id) {
      const d = await api.get<any>(`/api/gbp-audit/${id}`)
      const s = d.audit.status
      if (s === "QUEUED" || s === "RUNNING") return running
      if (s === "FAILED" || !d.facts) return failed(d.audit.error ?? "The Google Maps audit failed.")
      return { state: "done", data: d }
    },
  },
  site: pageAuditRun("site"),
  page: pageAuditRun("single"),
  aeo: {
    async start(inp) {
      const r = await api.post<any>("/api/aeo-audit", { url: inp.web, pages: 10, engines: ["chatgpt", "gemini", "ai-overviews"] })
      return r.audit.id
    },
    async poll(id) {
      const { report } = await api.get<any>(`/api/aeo-audit/${id}`)
      const s = report.audit.status
      if (s === "FAILED") return failed(report.audit.error ?? "The AEO audit failed.")
      return s === "COMPLETED" ? { state: "done", data: report } : running
    },
  },
  serp: {
    async start(inp) {
      const r = await api.post<any>("/api/serp-check", { keyword: inp.kw, domain: domainOf(inp.web) || undefined, country: countryOf(inp), device: "desktop" })
      return r.id
    },
    async poll(id, inp) {
      const r = await api.get<any>(`/api/serp-check/${id}`)
      const c = r.check ?? r
      if (c.status === "FAILED") return failed(c.error ?? "The Google search check failed.")
      return c.status === "COMPLETED" && c.result ? { state: "done", data: { ...c.result, keyword: inp.kw } } : running
    },
  },
  rank: {
    async start(inp, _deps, fresh) {
      const domain = domainOf(inp.web)
      let projectId: string
      try {
        const r = await api.post<any>("/api/projects", { name: domain, domain, checkFrequency: 24, autoKeywords: false })
        projectId = r.project?.id ?? r.id
      } catch (e) {
        // Already tracked on this account: keep using that project.
        const existing = e instanceof ApiError ? (e.details as { projectId?: string } | undefined)?.projectId : undefined
        if (!existing) throw e
        projectId = existing
      }
      await api.post(`/api/projects/${projectId}/keywords`, { keywords: trackedKeywords(inp.kw!), location: countryOf(inp), device: "desktop", engines: ["google"] }).catch((e) => {
        // Keywords already on the project are fine; anything else is a real failure.
        if (!(e instanceof ApiError && e.status === 409)) throw e
      })
      if (fresh) {
        // Keywords already tracked keep their last check: ask Google again.
        const r = await api.get<any>(`/api/projects/${projectId}`)
        const wanted = new Set(trackedKeywords(inp.kw!))
        const keywordIds = ownRows(r.keywords ?? r.project?.keywords ?? [], inp).map((k) => k.id)
        if (keywordIds.length) await api.post(`/api/projects/${projectId}/check`, { keywordIds })
      }
      return projectId
    },
    async poll(id, inp) {
      const r = await api.get<any>(`/api/projects/${id}`)
      const rows = ownRows(r.keywords ?? r.project?.keywords ?? [], inp)
      if (!rows.length) return running
      if (rows.some((k) => k.status === "PENDING" || k.status === "PROCESSING")) return running
      return { state: "done", data: { rows } }
    },
  },
  maps: {
    after: "gbp",
    async start(inp, deps) {
      const b = deps.gbp.facts.business
      if (!b.placeId || b.latitude == null || b.longitude == null) throw new Error("This listing has no Place ID or pin, which the Maps Tracker needs.")
      const list = await api.get<any>("/api/maps-tracker/locations")
      const locations: any[] = Array.isArray(list) ? list : (list.locations ?? [])
      let location = locations.find((l) => l.placeId === b.placeId)
      if (!location) {
        const r = await api.post<any>("/api/maps-tracker/locations", {
          placeId: b.placeId,
          cid: b.cid ?? undefined,
          name: b.name,
          address: b.address ?? b.name,
          latitude: b.latitude,
          longitude: b.longitude,
          primaryCategory: b.category ?? undefined,
          phone: b.phone ?? undefined,
          website: b.website ?? undefined,
          rating: b.rating ?? undefined,
          reviewCount: b.reviewCount ?? undefined,
        })
        location = r.location ?? r
      }
      const keyword = inp.kw || deps.gbp.facts.keyword || b.category?.toLowerCase()
      const scan = await api.post<any>("/api/maps-tracker/scans", { locationId: location.id, keywords: [keyword], gridSize: Number(inp.grid) || 3, ...DEFAULT_SCAN_RADIUS, generateAiAnalysis: false })
      return scan.scanId ?? scan.id
    },
    async poll(id) {
      const r = await api.get<any>(`/api/maps-tracker/scans/${id}`)
      const scan = r.scan ?? r
      if (scan.status === "FAILED" || scan.status === "CANCELLED") return failed("The Maps Tracker scan didn't finish.")
      return scan.status === "COMPLETED" || scan.status === "PARTIAL" ? { state: "done", data: scan } : running
    },
  },
  llm: {
    async start(inp) {
      const domain = domainOf(inp.web)
      const kw = inp.kw!
      const p = await api.post<any>("/api/llm-tracker/projects", { name: `${inp.name} (client report)`.slice(0, 120), brandName: inp.name?.slice(0, 120), brandDomain: domain || undefined })
      const projectId = p.project?.id ?? p.id
      const prompts = [`What is the best ${kw} near me?`, `Which ${kw} would you recommend, and why?`, `Who are the most trusted ${kw} businesses?`]
      await api.post(`/api/llm-tracker/projects/${projectId}/prompts`, { prompts, platforms: [...PLATFORMS], samplesPerRun: 1, countryIso: countryOf(inp), checkFrequency: null })
      await api.post(`/api/llm-tracker/projects/${projectId}/run`, {})
      return projectId
    },
    async poll(id) {
      const r = await api.get<any>(`/api/llm-tracker/projects/${id}`)
      const prompts: any[] = r.prompts ?? r.project?.prompts ?? []
      const runs = prompts.flatMap((p) => p.runs ?? [])
      if (!runs.length || runs.some((x) => x.status === "PENDING" || x.status === "PROCESSING")) return running
      // Who was named, per assistant: not the assistants' full answers.
      const slim = prompts.map((p) => ({ id: p.id, prompt: p.prompt, runs: (p.runs ?? []).map((x: any) => ({ platform: x.platform, status: x.status, mentionRate: x.mentionRate })) }))
      return { state: "done", data: { prompts: slim } }
    },
  },
  ads: {
    async start(inp) {
      const r = await api.post<any>("/api/ads-analysis", { url: inp.web, location: inp.loc || "us", services: inp.svc.length ? inp.svc : [inp.kw] })
      return r.analysis.id
    },
    async poll(id) {
      const d = await api.get<any>(`/api/ads-analysis/${id}`)
      const s = d.analysis.status
      if (s === "QUEUED" || s === "RUNNING") return running
      return s === "FAILED" ? failed(d.analysis.error ?? "The Google Ads analysis failed.") : { state: "done", data: d }
    },
  },
  comp: {
    after: "serp",
    async start(inp, deps) {
      const own = domainOf(inp.web)
      const isOwn = (host: string) => !!own && (host === own || host.endsWith(`.${own}`))
      const urls = ((deps.serp.results ?? []) as any[])
        .map((r) => r.url as string)
        .filter((u) => u && !isOwn(domainOf(u)) && !isPlatform(domainOf(u)))
        .slice(0, 5)
      if (!urls.length) throw new Error("No competing pages were found on Google for this keyword.")
      const r = await api.post<any>("/api/competitor-analysis", { keyword: inp.kw, yourDomain: own, competitorUrls: urls })
      return r.analysis.id
    },
    async poll(id) {
      const r = await api.get<any>(`/api/competitor-analysis/${id}`)
      const a = r.analysis ?? r
      if (a.status === "FAILED") return failed(a.error ?? "The competitor analysis failed.")
      return a.status === "COMPLETED" ? { state: "done", data: a } : running
    },
  },
  links: {
    async start(inp) {
      const r = await api.post<any>("/api/internal-link-analysis", { domain: domainOf(inp.web) })
      return r.analysis.id
    },
    async poll(id) {
      const r = await api.get<any>(`/api/internal-link-analysis/${id}`)
      const a = r.analysis ?? r
      if (a.status === "FAILED") return failed(a.error ?? "The internal links analysis failed.")
      return a.status === "COMPLETED" ? { state: "done", data: a } : running
    },
  },
  // Answers in the request itself; repeated within the cache window it costs nothing.
  magic: {
    async start() {
      return "now"
    },
    async poll(_id, inp) {
      try {
        const r = await api.post<any>("/api/keyword-magic", { seed: inp.kw, matchType: "broad", country: countryOf(inp) })
        return { state: "done", data: r }
      } catch (e) {
        if (isTransient(e)) throw e
        return failed(msg(e, "Keyword research failed."))
      }
    },
  },
  score: {
    async start(inp, _deps, fresh) {
      // /open reuses a recent analysis of the same page and keyword; a fresh report scores it again.
      const r = await api.post<any>(fresh ? "/api/keyword-analysis" : "/api/keyword-analysis/open", { keyword: inp.kw, url: fullUrl(inp.web) })
      return r.analysis?.id ?? r.id
    },
    async poll(id) {
      const r = await api.get<any>(`/api/keyword-analysis/${id}`)
      const a = r.analysis ?? r
      if (a.status === "FAILED") return failed(a.error ?? "The keyword score check failed.")
      return a.status === "COMPLETED" ? { state: "done", data: a } : running
    },
  },
  yt: {
    async start(inp) {
      try {
        // The channel's project from an earlier report: a new one each time would reach the plan's project cap.
        const list = await api.get<any>("/api/youtube/projects")
        const projects: any[] = Array.isArray(list) ? list : (list.projects ?? [])
        const same = (p: any) => String(p.targetRaw ?? "").trim().toLowerCase() === inp.yt!.trim().toLowerCase()
        const projectId =
          projects.find(same)?.id ??
          (await api.post<any>("/api/youtube/projects", { name: `${inp.yt} (client report)`.slice(0, 120), targetType: "channel", target: inp.yt, defaultDepth: 20 }).then((p) => p.project?.id ?? p.id))
        await api.post(`/api/youtube/projects/${projectId}/keywords`, { keywords: [inp.kw], locationCode: 2840, languageCode: "en", device: "desktop" }).catch((e) => {
          // Already tracked on that project is fine.
          if (!(e instanceof ApiError && e.status === 409)) throw e
        })
        return projectId
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) throw new Error("YouTube rank tracking isn't switched on for this server.")
        throw e
      }
    },
    async poll(id) {
      const r = await api.get<any>(`/api/youtube/projects/${id}`)
      const rows: any[] = r.keywords ?? r.project?.keywords ?? []
      if (!rows.length || rows.some((k) => k.status === "PENDING" || k.status === "PROCESSING")) return running
      return { state: "done", data: { rows } }
    },
  },
}

export { msg as errorMessage }
