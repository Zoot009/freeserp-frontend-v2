// Keyword Magic page helpers. Pure, so the table's arithmetic is testable
// without rendering the page.

/**
 * The words of a keyword. This is the split the backend counts sidebar groups
 * with (keywordWords in keywordMagic.service.ts): lowercased, NFC-normalised,
 * and cut on anything that isn't a letter, mark or digit in any script.
 *
 * Filtering by a group has to split exactly the way the group was counted. The
 * old /[^a-z0-9]+/ here turned "café" into "caf", so a group like "café" or
 * "диван" matched none of its own keywords.
 */
export function keywordWords(text: string): string[] {
  return text.toLowerCase().normalize("NFC").split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean)
}

export type SortKey = "volume" | "difficulty" | "cpc"
export type SortState = { key: SortKey; dir: "asc" | "desc" } | null

type Metrics = {
  keyword: string
  volume: number | null
  difficulty: number | null
  cpc: number | null
  intent: string | null
}

export interface RowView {
  /** Substring the keyword must contain. */
  text: string
  /** Sidebar group word the keyword must contain. */
  group: string | null
  minVolume: number | null
  maxKd: number | null
  intent: string | null
  sort: SortState
}

/**
 * The rows the table shows: filtered, then sorted.
 *
 * A row with no volume (or no KD) fails a volume (or KD) bound. "At least 1,000
 * searches" can't be promised for an unknown. A row missing the sorted metric
 * goes last in both directions, so flipping the sort doesn't fill the top of
 * the table with dashes.
 */
export function viewRows<R extends Metrics>(rows: R[], v: RowView): R[] {
  const text = v.text.trim().toLowerCase()
  const out = rows.filter((r) => {
    if (v.group && !keywordWords(r.keyword).includes(v.group)) return false
    if (text && !r.keyword.toLowerCase().includes(text)) return false
    if (v.minVolume != null && (r.volume == null || r.volume < v.minVolume)) return false
    if (v.maxKd != null && (r.difficulty == null || r.difficulty > v.maxKd)) return false
    if (v.intent && r.intent !== v.intent) return false
    return true
  })
  if (!v.sort) return out
  const { key, dir } = v.sort
  const sign = dir === "asc" ? 1 : -1
  return out.sort((a, b) => {
    const x = a[key]
    const y = b[key]
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1
    return (x - y) * sign
  })
}

/** Total volume and average KD over the rows on screen, not the whole fetch. */
export function rowStats(rows: Metrics[]): { totalVolume: number; avgDifficulty: number | null } {
  const totalVolume = rows.reduce((s, r) => s + (r.volume ?? 0), 0)
  const kds = rows.flatMap((r) => (r.difficulty == null ? [] : [r.difficulty]))
  const avgDifficulty = kds.length ? Math.round(kds.reduce((s, k) => s + k, 0) / kds.length) : null
  return { totalVolume, avgDifficulty }
}
