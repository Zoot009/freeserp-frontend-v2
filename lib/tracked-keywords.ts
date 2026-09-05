// What a project already tracks, for the "add these keywords" flows.
//
// Both the Search Console report and the Keyword Magic tool offer keywords the
// user may already be tracking. The backend's insert is skipDuplicates, so a
// duplicate is never created — but silently adding nothing reads as a failure,
// and pre-marking the rows is what makes the selection honest before submit.

import { api } from "@/lib/api"
import { DEFAULT_ENGINE } from "@/hooks/use-engines"

/** Mirrors keywords.service.normalizeKeyword on the backend. */
export function normalizeKeyword(k: string): string {
  return k.trim().toLowerCase().replace(/\s+/g, " ")
}

/** Key of one tracked row: engine is part of a keyword's identity. */
function rowKey(engine: string, keyword: string): string {
  return `${engine}|${normalizeKeyword(keyword)}`
}

/** engine|keyword pairs a project already tracks. */
export type TrackedSet = Set<string>

type KeywordRow = { keyword: string; engine?: string | null }

// A page is 200 rows (the backend's max). Six of them covers 1,200 keywords —
// past that the set is only used to grey out rows, and the backend still
// refuses the duplicate, so stopping is safe rather than paging forever.
const MAX_PAGES = 6
const PAGE_SIZE = 200

export async function fetchTrackedKeywords(projectId: string): Promise<TrackedSet> {
  const set: TrackedSet = new Set()
  let cursor: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await api.get<{ keywords: KeywordRow[]; nextCursor?: string }>(
      `/api/projects/${projectId}/keywords`,
      { query: { limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) } },
    )
    for (const row of res.keywords ?? []) {
      set.add(rowKey(row.engine ?? DEFAULT_ENGINE, row.keyword))
    }
    if (!res.nextCursor) break
    cursor = res.nextCursor
  }
  return set
}

/**
 * True when the keyword is already tracked on EVERY engine asked for — the only
 * case where adding it would create nothing. Tracked on Google but not on Bing
 * is still a real add, so it must not read as a duplicate.
 */
export function isFullyTracked(set: TrackedSet, keyword: string, engines: string[]): boolean {
  if (engines.length === 0) return false
  return engines.every((e) => set.has(rowKey(e, keyword)))
}
