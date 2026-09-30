import { describe, expect, it } from "vitest"
import { exportCsvRows, exportFileName, kdBand, keywordWords, rowStats, serpChips, viewRows, type RowView } from "./keyword-magic"

/**
 * The Keyword Magic table. Group filtering split words with /[^a-z0-9]+/, so a
 * "café" group matched nothing. The tiles said "shown rows" but summed every
 * row regardless of the filter. And the page promised filtering by volume,
 * difficulty and intent with no way to do it.
 */
const row = (keyword: string, volume: number | null, difficulty: number | null, cpc: number | null = null, intent: string | null = null) =>
  ({ keyword, volume, difficulty, cpc, intent })

const rows = [
  row("café crème", 900, 40, 1.2, "informational"),
  row("café noir", 300, 10, 0.4, "commercial"),
  row("thé vert", null, 5, 2.5, "informational"),
  row("thé noir", 1200, null, null, "transactional"),
]

const view = (over: Partial<RowView> = {}): RowView =>
  ({ text: "", group: null, minVolume: null, maxKd: null, intent: null, sort: null, ...over })

describe("keywordWords", () => {
  it("keeps accented and non-Latin words whole, like the backend", () => {
    expect(keywordWords("Café Größe")).toEqual(["café", "größe"])
    expect(keywordWords("Café")).toEqual(["café"])
    expect(keywordWords("купить диван")).toEqual(["купить", "диван"])
    expect(keywordWords("हिन्दी गाने")).toEqual(["हिन्दी", "गाने"])
  })
})

describe("viewRows", () => {
  it("filters by an accented group", () => {
    expect(viewRows(rows, view({ group: "café" })).map((r) => r.keyword)).toEqual(["café crème", "café noir"])
  })

  it("applies min volume, max KD and intent, dropping unknowns from a bound", () => {
    expect(viewRows(rows, view({ minVolume: 500 })).map((r) => r.keyword)).toEqual(["café crème", "thé noir"])
    expect(viewRows(rows, view({ maxKd: 20 })).map((r) => r.keyword)).toEqual(["café noir", "thé vert"])
    expect(viewRows(rows, view({ intent: "informational" })).map((r) => r.keyword)).toEqual(["café crème", "thé vert"])
  })

  it("sorts either way with missing values last", () => {
    const by = (key: "volume" | "difficulty" | "cpc", dir: "asc" | "desc") =>
      viewRows(rows, view({ sort: { key, dir } })).map((r) => r.keyword)
    expect(by("volume", "desc")).toEqual(["thé noir", "café crème", "café noir", "thé vert"])
    expect(by("volume", "asc")).toEqual(["café noir", "café crème", "thé noir", "thé vert"])
    expect(by("cpc", "asc")).toEqual(["café noir", "café crème", "thé vert", "thé noir"])
  })
})

describe("rowStats", () => {
  it("totals only the rows it is given", () => {
    expect(rowStats(viewRows(rows, view({ group: "café" })))).toEqual({ totalVolume: 1200, avgDifficulty: 25 })
    expect(rowStats([])).toEqual({ totalVolume: 0, avgDifficulty: null })
  })
})

describe("serpChips", () => {
  it("maps DataForSEO types to the tracker's chips, once each, in its order", () => {
    expect(serpChips(["people_also_ask", "organic", "video", "youtube", "ai_overview", "answer_box"]))
      .toEqual({ chips: ["AI", "FS", "PAA", "VID"], other: [] })
  })

  it("keeps chipless features for the +N, and drops ones on every results page", () => {
    expect(serpChips(["paid", "related_searches", "hotels_pack", "paid", "people_also_search"]))
      .toEqual({ chips: [], other: ["paid", "hotels_pack"] })
  })
})

describe("exports", () => {
  it("writes the header, then bare numbers a spreadsheet can sum", () => {
    const r = { keyword: "café crème", intent: "Commercial", intentKey: "commercial", volume: 1900, difficulty: 22, cpc: 0.3, features: ["AI Overview", "Ads"] }
    expect(exportCsvRows([r, { ...r, intent: null, volume: null, features: [] }], ["K", "I", "V", "KD", "CPC", "S"])).toEqual([
      ["K", "I", "V", "KD", "CPC", "S"],
      ["café crème", "Commercial", 1900, 22, 0.3, "AI Overview; Ads"],
      ["café crème", null, null, 22, 0.3, ""],
    ])
  })

  it("names the file after the search, without characters a file system refuses", () => {
    expect(exportFileName("  Free SERP: v2?  ", "broad", "us")).toBe("keyword-magic-free-serp-v2-broad-us")
    expect(exportFileName("диван", "related", "ru")).toBe("keyword-magic-диван-related-ru")
    expect(exportFileName("???", "broad", "us")).toBe("keyword-magic-keywords-broad-us")
  })

  it("bands difficulty as the badge does", () => {
    expect([0, 33, 34, 66, 67, 100].map(kdBand)).toEqual(["easy", "easy", "medium", "medium", "hard", "hard"])
  })
})
