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

/**
 * A search's SERP features as the rank tracker's chips (FeatChip codes), in
 * the tracker's order.
 *
 * Organic results and related searches are on nearly every results page, so
 * they aren't a feature worth a chip. Anything else without a chip of its own
 * comes back in `other`, for a "+N" that names them.
 */
const SERP_CHIP: Record<string, string> = {
  ai_overview: "AI",
  featured_snippet: "FS",
  answer_box: "FS",
  people_also_ask: "PAA",
  video: "VID",
  youtube: "VID",
  short_videos: "VID",
  images: "IMG",
  image: "IMG",
  local_pack: "LOCAL",
  map: "LOCAL",
  knowledge_graph: "KG",
  shopping: "SHOP",
  popular_products: "SHOP",
  top_stories: "NEWS",
}
const CHIP_ORDER = ["AI", "FS", "PAA", "VID", "IMG", "LOCAL", "KG", "SHOP", "NEWS"]
const NOT_A_FEATURE = new Set(["organic", "related_searches", "people_also_search"])

export function serpChips(features: string[]): { chips: string[]; other: string[] } {
  const chips = new Set<string>()
  const other: string[] = []
  for (const f of features) {
    const code = SERP_CHIP[f]
    if (code) chips.add(code)
    else if (!NOT_A_FEATURE.has(f) && !other.includes(f)) other.push(f)
  }
  return { chips: CHIP_ORDER.filter((c) => chips.has(c)), other }
}

/** Keyword difficulty's band: the table's badge colour, and the PDF's. */
export function kdBand(kd: number): "easy" | "medium" | "hard" {
  return kd <= 33 ? "easy" : kd <= 66 ? "medium" : "hard"
}

/** A row as the exports write it: the table's columns, words already in the reader's language. */
export type ExportRow = {
  keyword: string
  /** The intent's word ("Commercial"), and its key for the PDF's coloured dot. */
  intent: string | null
  intentKey: string | null
  volume: number | null
  difficulty: number | null
  cpc: number | null
  /** SERP feature names. */
  features: string[]
}

/**
 * The CSV: a header, then a line per row. Numbers stay bare, with no "$" or
 * thousands separators, so a spreadsheet can sum and sort them.
 */
export function exportCsvRows(rows: ExportRow[], head: string[]): (string | number | null)[][] {
  return [head, ...rows.map((r) => [r.keyword, r.intent, r.volume, r.difficulty, r.cpc, r.features.join("; ")])]
}

/** "keyword-magic-free-serp-broad-us": the search, as a file name without its extension. */
export function exportFileName(seed: string, match: string, country: string): string {
  const slug = seed.trim().toLowerCase().replace(/[\\/:*?"<>|.]+/g, "").replace(/\s+/g, "-").slice(0, 60)
  return `keyword-magic-${slug || "keywords"}-${match}-${country}`
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
