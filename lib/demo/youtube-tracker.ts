// Demo project for the YouTube Rank Tracker: generated, read-only sample data.
// Spec: .claude/skills/demo-report/SKILL.md; reference: ./rank-tracker.ts.
//
// lib/demo/index.ts routes every GET /api/youtube/projects/demo… here, so the
// real YouTube pages render a fully populated channel project with no backend
// row, no DataForSEO task and nothing counted against a quota.
//
// Shapes mirror the backend — youtube.service.ts (listProjects, getProject →
// buildKeywordRows, keywordDetail, keywordHistory, checkSnapshot), youtube.repo
// historyForKeyword, youtubeIngest.service persistYoutubeCheck (best/top/owned
// fields), youtube.parse (item types; videoPosition skips ads, shelves and
// playlists) and rankings/deltas.ts (unranked = depth + 1). Keep them in step.
//
// One deviation from the real URLs: the SERP snapshot lives at
// /api/youtube/checks/:checkId/snapshot, outside this tool's base, where the
// registry can't answer it. Demo pages read it from
// /api/youtube/projects/demo/checks/:checkId/snapshot instead — see
// youtubeSnapshotPath, the one place the page gets that URL from.

import { DAY_MS, DEMO_BRAND, DEMO_ID, perAnchor, prng, type DemoTool } from "./shared"

const BASE = "/api/youtube/projects"
/** Where the demo's CTAs lead: the YouTube projects page, create modal open. */
export const YOUTUBE_TRACKER_CREATE_HREF = "/dashboard/youtube?create=1"
const NAME = `${DEMO_BRAND.name} (Demo)`
const HANDLE = DEMO_BRAND.youtube.handle
const CHANNEL = DEMO_BRAND.youtube.channel
const CHANNEL_URL = `https://www.youtube.com/${HANDLE}`
const DEFAULT_DEPTH = 20
const DAYS = 90
/** buildKeywordRows reads 31 days of checks for deltas and the first position. */
const ROW_WINDOW_DAYS = 31

/** The snapshot URL for a check: the demo's in-base stand-in, else the real route. */
export function youtubeSnapshotPath(projectId: string, checkId: string): string {
  return projectId === DEMO_ID
    ? `${BASE}/${DEMO_ID}/checks/${checkId}/snapshot`
    : `/api/youtube/checks/${checkId}/snapshot`
}

// ── Seeds ────────────────────────────────────────────────────────────────────

const MARKETS = {
  us: { locationCode: 2840, locationLabel: "United States", iso2: "us", languageCode: "en" },
  gb: { locationCode: 2826, locationLabel: "United Kingdom", iso2: "gb", languageCode: "en" },
  es: { locationCode: 2724, locationLabel: "Spain", iso2: "es", languageCode: "es" },
} as const
type Market = (typeof MARKETS)[keyof typeof MARKETS]

type Extra = "ad" | "channel" | "playlist" | "shorts"

interface Video {
  title: string
  views: number
  ageDays: number
  seconds: number
}

interface Seed {
  keyword: string
  market?: keyof typeof MARKETS
  /** Per-keyword depth override (YoutubeKeyword.depth); the project default otherwise. */
  depth?: number
  /** Best organic position 90 days ago → today. null = not in the results. */
  from: number | null
  to: number | null
  /** The channel's headline video for this keyword. Absent = no organic placement. */
  video?: Video
  /** Positions the channel's other videos hold while the headline ranks. */
  also?: number[]
  /** Non-video placements the channel also owns: its ad, channel card, a playlist, a Short. */
  extras?: Extra[]
  /** Other advertisers' ads above the results. */
  ads?: number
  /** Added after the project was created: fewer checks, shorter history. */
  addedDaysAgo?: number
}

// Picked to exercise every state the pages show: steady #1s, winners, losers,
// several owned results (×N), an owned ad, channel card, playlist and Short,
// a Shorts-only placement (no organic position), a keyword that dropped out of
// the top 20, one never found, a Top 40 keyword, a Spanish-language one, a new
// keyword with a week of history, and one added today ("First check").
const SEEDS: Seed[] = [
  { keyword: "nike commercial", from: 2, to: 1, also: [3, 7], extras: ["channel"], video: { title: "Nike | Just Do It — The Film", views: 48_200_000, ageDays: 410, seconds: 92 } },
  { keyword: "just do it", from: 1, to: 1, also: [5], video: { title: "Just Do It | Nike", views: 12_400_000, ageDays: 900, seconds: 61 } },
  { keyword: "air max day", from: 5, to: 2, video: { title: "Air Max Day: The Story of the Air Max 1 | Nike", views: 2_100_000, ageDays: 240, seconds: 214 } },
  { keyword: "nike running shoes", from: 4, to: 3, extras: ["ad"], ads: 1, video: { title: "Nike Pegasus | Responsive Cushioning, Explained", views: 860_000, ageDays: 150, seconds: 175 } },
  { keyword: "how to lace running shoes", from: 9, to: 4, video: { title: "How to Lace Your Running Shoes | Nike Running", views: 1_350_000, ageDays: 600, seconds: 248 } },
  { keyword: "nike training club workout", from: 3, to: 2, extras: ["playlist"], video: { title: "Nike Training Club: 20-Minute Full-Body Workout", views: 3_900_000, ageDays: 700, seconds: 1_260 } },
  { keyword: "marathon training tips", from: 15, to: 8, video: { title: "Marathon Training: 5 Tips From Nike Run Club Coaches", views: 640_000, ageDays: 300, seconds: 512 } },
  { keyword: "nike tech fleece", from: 6, to: 5, extras: ["shorts"], video: { title: "Nike Tech Fleece | Built for Every Day", views: 420_000, ageDays: 200, seconds: 46 } },
  { keyword: "home workout no equipment", from: 11, to: 14, video: { title: "15-Minute Home Workout, No Equipment | Nike Training Club", views: 2_700_000, ageDays: 800, seconds: 930 } },
  { keyword: "air jordan 1 unboxing", from: 18, to: 12, video: { title: "Air Jordan 1 Retro High OG | Unboxing", views: 310_000, ageDays: 120, seconds: 388 } },
  { keyword: "how to tie shoelaces", from: 3, to: 8, video: { title: "How to Tie Your Shoelaces So They Stay Tied | Nike", views: 980_000, ageDays: 1_000, seconds: 132 } },
  { keyword: "sneaker cleaning hack", from: null, to: null, extras: ["shorts"] },
  { keyword: "workout motivation", from: 13, to: null, video: { title: "Find Your Greatness | Nike", views: 5_600_000, ageDays: 1_400, seconds: 60 } },
  { keyword: "basketball shoes review", from: null, to: null, ads: 2 },
  { keyword: "football boots", market: "gb", depth: 40, from: 31, to: 27, video: { title: "Nike Mercurial | Football Boots Made for Speed", views: 760_000, ageDays: 180, seconds: 95 } },
  { keyword: "zapatillas nike", market: "es", from: 7, to: 6, video: { title: "Zapatillas de running Nike: cómo elegir las tuyas", views: 210_000, ageDays: 260, seconds: 301 } },
  { keyword: "nike air max dn review", addedDaysAgo: 6, from: 9, to: 7, video: { title: "Nike Air Max Dn | First Look", views: 145_000, ageDays: 21, seconds: 167 } },
  { keyword: "nike pegasus review", addedDaysAgo: 0, from: 4, to: 4, video: { title: "Nike Pegasus | Run Easy, Run Far", views: 520_000, ageDays: 90, seconds: 140 } },
]

// The channel's other videos, behind its extra results.
const MORE_NIKE: Video[] = [
  { title: "Behind the Design: Nike Air | Nike", views: 1_800_000, ageDays: 520, seconds: 305 },
  { title: "Nike Run Club: Your First 5K", views: 690_000, ageDays: 340, seconds: 421 },
  { title: "The Making of Air Force 1 | Nike", views: 2_400_000, ageDays: 760, seconds: 268 },
]

// Other channels in the results. Brands and publishers only — no individuals.
const RIVALS: [name: string, handle: string][] = [
  ["adidas", "adidas"], ["Runner's World", "runnersworld"], ["Foot Locker", "footlocker"],
  ["JD Sports", "jdsports"], ["New Balance", "newbalance"], ["PUMA", "puma"], ["Complex", "complex"],
  ["GQ", "gq"], ["Men's Health", "menshealth"], ["Women's Health", "womenshealthmag"],
  ["Hypebeast", "hypebeast"], ["Sneaker News", "sneakernews"], ["REI", "rei"],
  ["Under Armour", "underarmour"], ["lululemon", "lululemon"], ["ASICS", "asics"], ["HOKA", "hoka"],
  ["Brooks Running", "brooksrunning"], ["Finish Line", "finishline"], ["DICK'S Sporting Goods", "dickssportinggoods"],
]

// ── Generation helpers ───────────────────────────────────────────────────────

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())
const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
const fakeId = (rand: () => number, n = 11) =>
  Array.from({ length: n }, () => ID_CHARS[Math.floor(rand() * ID_CHARS.length)]).join("")

function durationTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = String(seconds % 60).padStart(2, "0")
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`
}

/** DataForSEO's relative publication string. */
function relativeAge(days: number): string {
  const unit = (n: number, u: string) => `${n} ${u}${n === 1 ? "" : "s"} ago`
  if (days < 7) return unit(days, "day")
  if (days < 30) return unit(Math.floor(days / 7), "week")
  if (days < 365) return unit(Math.floor(days / 30), "month")
  return unit(Math.floor(days / 365), "year")
}

/** One snapshot item — ytSnapshotItemSchema, every field present. */
interface Item {
  rankAbsolute: number
  rankGroup: number | null
  videoPosition: number | null
  itemType: string
  blockName: string | null
  blockRank: number | null
  videoId: string | null
  playlistId: string | null
  url: string | null
  title: string | null
  channelId: string | null
  channelName: string | null
  channelUrl: string | null
  views: number | null
  publicationDate: string | null
  publishedAt: string | null
  durationSeconds: number | null
  durationTime: string | null
  isLive: boolean
  isShorts: boolean
  isMovie: boolean
}

/** What a result IS, apart from where it sits on a given day. */
type Content = Omit<Item, "rankAbsolute" | "rankGroup" | "videoPosition" | "blockRank"> & {
  /** For views on past days; absent on items with no view count. */
  ageDays?: number
}

function videoContent(
  v: Video,
  channel: { name: string; url: string | null },
  rand: () => number,
  anchor: number,
  kind: { itemType?: string; blockName?: string; isShorts?: boolean } = {},
): Content {
  const videoId = fakeId(rand)
  return {
    itemType: kind.itemType ?? "youtube_video",
    blockName: kind.blockName ?? null,
    videoId,
    playlistId: null,
    url: kind.isShorts ? `https://www.youtube.com/shorts/${videoId}` : `https://www.youtube.com/watch?v=${videoId}`,
    title: v.title,
    channelId: null,
    channelName: channel.name,
    channelUrl: channel.url,
    views: v.views,
    publicationDate: relativeAge(v.ageDays),
    publishedAt: new Date(anchor - v.ageDays * DAY_MS).toISOString(),
    durationSeconds: v.seconds,
    durationTime: durationTime(v.seconds),
    isLive: false,
    isShorts: kind.isShorts ?? false,
    isMovie: false,
    ageDays: v.ageDays,
  }
}

const NIKE = { name: CHANNEL, url: CHANNEL_URL }

/** The content as it read `daysAgo` days ago: view counts only ever climb. */
function asOf(c: Content, daysAgo: number): Content {
  if (c.views == null || c.ageDays == null || daysAgo === 0) return c
  return { ...c, views: Math.round(c.views * Math.max(0.05, (c.ageDays - daysAgo) / c.ageDays) ** 0.7) }
}

// ── The results page ─────────────────────────────────────────────────────────

type Slot =
  | { kind: "ad"; own: boolean }
  | { kind: "channel" }
  | { kind: "playlist" }
  | { kind: "video"; p: number }
  | { kind: "short"; own: boolean }

/**
 * The page's layout, the same every day: ads, the channel card, then the
 * organic videos with a playlist after #2 and a three-item Shorts shelf after
 * #4. rankAbsolute is a slot's index + 1, so every check of a keyword agrees
 * on where each kind of result sits.
 */
function slotsFor(s: Seed, depth: number): Slot[] {
  const extras = new Set(s.extras)
  const out: Slot[] = []
  if (extras.has("ad")) out.push({ kind: "ad", own: true })
  for (let i = 0; i < (s.ads ?? 0); i++) out.push({ kind: "ad", own: false })
  if (extras.has("channel")) out.push({ kind: "channel" })
  for (let p = 1; p <= depth; p++) {
    out.push({ kind: "video", p })
    if (p === 2 && extras.has("playlist")) out.push({ kind: "playlist" })
    if (p === 4) for (let i = 0; i < 3; i++) out.push({ kind: "short", own: i === 1 && extras.has("shorts") })
  }
  return out
}

const EXTRA_SLOT: Record<Extra, (s: Slot) => boolean> = {
  ad: (s) => s.kind === "ad" && s.own,
  channel: (s) => s.kind === "channel",
  playlist: (s) => s.kind === "playlist",
  shorts: (s) => s.kind === "short" && s.own,
}

/** One owned result on one day (a YoutubeCheckResult row, before ids). */
interface Owned {
  rankAbsolute: number
  videoPosition: number | null
  content: Content
  /** Playlist cards carry no handle in their channel link, so they match by name — the UI flags that. */
  strategy: "channel_handle" | "channel_name"
}

interface DemoCheck {
  id: string
  checkedAt: string
  /** Best organic position the walk gave this day. */
  position: number | null
  owned: Owned[]
}

interface DemoKeyword {
  seed: Seed
  id: string
  market: Market
  depth: number
  addedAt: string
  checkUrl: string
  /** Newest first, like the backend's history. */
  checks: DemoCheck[]
  /** The full results page of the latest check. */
  snapshot: Item[]
}

/** Best organic position per day, oldest → newest: the rank tracker's eased walk, bounded by the depth. */
function walk(s: Seed, depth: number, n: number, rand: () => number): (number | null)[] {
  if (s.from == null && s.to == null) return Array.from({ length: n }, () => null)
  const enter = s.from == null ? Math.round(n * 0.66) : 0
  const exit = s.to == null ? n - 5 : n // dropped out five checks ago
  const start = s.from ?? depth
  const end = s.to ?? depth
  const amp = start === end ? 0 : Math.max(1, (start + end) / 10)
  const span = Math.max(1, exit - 1 - enter)
  let drift = 0
  return Array.from({ length: n }, (_, i) => {
    if (i < enter || i >= exit) return null
    if (i === n - 1) return end
    drift = 0.7 * drift + (rand() - 0.5) * amp
    const t = ((i - enter) / span) ** 3
    return Math.min(depth, Math.max(1, Math.round(start + (end - start) * t + drift)))
  })
}

function buildKeyword(s: Seed, i: number, anchor: number, createdAt: number): DemoKeyword {
  const rand = prng(1000 + i)
  const id = `demo-kw-${i + 1}`
  const market = MARKETS[s.market ?? "us"]
  const depth = s.depth ?? DEFAULT_DEPTH
  const slots = slotsFor(s, depth)
  const rankOf = (pred: (x: Slot) => boolean) => slots.findIndex(pred) + 1

  // The channel's own items for this keyword, built once so ids never shift.
  const main = s.video && videoContent(s.video, NIKE, rand, anchor)
  const also = (s.also ?? []).map((_, j) => videoContent(MORE_NIKE[j % MORE_NIKE.length], NIKE, rand, anchor))
  const playlistId = `PL${fakeId(rand, 32)}`
  const extra: Record<Extra, Content> = {
    ad: { ...videoContent({ title: `${titleCase(s.keyword)} | Shop at Nike.com`, views: 0, ageDays: 30, seconds: 30 }, NIKE, rand, anchor, { itemType: "youtube_video_paid" }), views: null, publicationDate: null, publishedAt: null, ageDays: undefined },
    channel: {
      itemType: "youtube_channel", blockName: null, videoId: null, playlistId: null, url: CHANNEL_URL, title: CHANNEL,
      channelId: null, channelName: CHANNEL, channelUrl: CHANNEL_URL, views: null, publicationDate: null,
      publishedAt: null, durationSeconds: null, durationTime: null, isLive: false, isShorts: false, isMovie: false,
    },
    playlist: {
      itemType: "youtube_playlist", blockName: null, videoId: null, playlistId,
      url: `https://www.youtube.com/playlist?list=${playlistId}`, title: "Nike Training Club Workouts",
      channelId: null, channelName: CHANNEL, channelUrl: null, views: null, publicationDate: null,
      publishedAt: null, durationSeconds: null, durationTime: null, isLive: false, isShorts: false, isMovie: false,
    },
    shorts: videoContent({ title: `${titleCase(s.keyword)} in 30 Seconds #shorts`, views: 1_150_000, ageDays: 45, seconds: 31 }, NIKE, rand, anchor, { blockName: "Shorts", isShorts: true }),
  }

  /** Everything the channel owns on a day, in findOwnedResults' order: best organic first. */
  const ownedOn = (position: number | null, daysAgo: number): Owned[] => {
    const out: Owned[] = []
    if (position != null && main) {
      out.push({ rankAbsolute: rankOf((x) => x.kind === "video" && x.p === position), videoPosition: position, content: asOf(main, daysAgo), strategy: "channel_handle" })
      ;(s.also ?? []).forEach((p, j) => {
        if (p !== position) out.push({ rankAbsolute: rankOf((x) => x.kind === "video" && x.p === p), videoPosition: p, content: asOf(also[j], daysAgo), strategy: "channel_handle" })
      })
    }
    for (const e of s.extras ?? []) {
      out.push({ rankAbsolute: rankOf(EXTRA_SLOT[e]), videoPosition: null, content: asOf(extra[e], daysAgo), strategy: e === "playlist" ? "channel_name" : "channel_handle" })
    }
    return out.sort((a, b) => (a.videoPosition ?? Infinity) - (b.videoPosition ?? Infinity) || a.rankAbsolute - b.rankAbsolute)
  }

  const n = Math.min(DAYS, (s.addedDaysAgo ?? DAYS - 1) + 1)
  const positions = walk(s, depth, n, rand)
  const checks = positions
    .map((position, d): DemoCheck => {
      const daysAgo = n - 1 - d
      return { id: `${id}-c${daysAgo}`, checkedAt: new Date(anchor - daysAgo * DAY_MS).toISOString(), position, owned: ownedOn(position, daysAgo) }
    })
    .reverse()

  // Everyone else on today's page, filling the slots the channel doesn't hold.
  const K = titleCase(s.keyword)
  const rival = () => {
    const [name, handle] = RIVALS[Math.floor(rand() * RIVALS.length)]
    return { name, url: `https://www.youtube.com/@${handle}` }
  }
  const TEMPLATES = [
    (c: string) => `${K} | ${c}`,
    () => `${K}: Tested and Reviewed`,
    () => `${K} — Everything You Need to Know`,
    () => `Top 5 ${K}`,
    () => `${K} (Explained)`,
    () => `We Tried ${K} for 30 Days`,
  ]
  const ownedContent = new Map(checks[0].owned.map((o) => [o.rankAbsolute, o.content]))
  const counters = new Map<string, number>()
  const snapshot = slots.map((slot, idx): Item => {
    const rankAbsolute = idx + 1
    let content = ownedContent.get(rankAbsolute)
    if (!content) {
      const ch = rival()
      if (slot.kind === "ad") {
        content = { ...videoContent({ title: `${K} — Shop ${ch.name}`, views: 0, ageDays: 14, seconds: 30 }, ch, rand, anchor, { itemType: "youtube_video_paid" }), views: null, publicationDate: null, publishedAt: null }
      } else {
        const ageDays = 3 + Math.floor(rand() ** 2 * 1_500)
        const shortsShelf = slot.kind === "short"
        content = videoContent(
          {
            title: shortsShelf ? `${K} #shorts` : TEMPLATES[Math.floor(rand() * TEMPLATES.length)](ch.name),
            views: Math.round(10 ** (3.5 + rand() * 3.5)),
            ageDays,
            seconds: shortsShelf ? 15 + Math.floor(rand() * 45) : 60 + Math.floor(rand() * 1_400),
          },
          ch,
          rand,
          anchor,
          shortsShelf ? { blockName: "Shorts", isShorts: true } : {},
        )
      }
    }
    const { ageDays: _ageDays, ...item } = content
    const group = (counters.get(item.itemType) ?? 0) + 1
    counters.set(item.itemType, group)
    return {
      ...item,
      rankAbsolute,
      rankGroup: group,
      videoPosition: slot.kind === "video" ? slot.p : null,
      blockRank: slot.kind === "short" ? slots.slice(0, idx + 1).filter((x) => x.kind === "short").length : null,
    }
  })
  const gl = market.iso2.toUpperCase()
  return {
    seed: s,
    id,
    market,
    depth,
    addedAt: new Date(s.addedDaysAgo != null ? anchor - s.addedDaysAgo * DAY_MS - 3_600_000 : createdAt).toISOString(),
    checkUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(s.keyword).replace(/%20/g, "+")}&gl=${gl}&hl=${market.languageCode}`,
    checks,
    snapshot,
  }
}

interface DemoData {
  anchor: number
  createdAt: string
  keywords: DemoKeyword[]
}

/** Every demo fact for "now". Memoised per daily check, so polls agree. */
const demoData = perAnchor((anchor): DemoData => {
  const createdAt = anchor - (DAYS - 1) * DAY_MS - 3_600_000
  return {
    anchor,
    createdAt: new Date(createdAt).toISOString(),
    keywords: SEEDS.map((s, i) => buildKeyword(s, i, anchor, createdAt)),
  }
})

// ── Response shapes ──────────────────────────────────────────────────────────

/** Best organic position among a check's owned results (bestVideoPosition). */
function bestOf(c: DemoCheck): number | null {
  const positions = c.owned.map((o) => o.videoPosition).filter((p): p is number => p != null)
  return positions.length ? Math.min(...positions) : null
}

/** A check's headline fields — what persistYoutubeCheck derives from its owned results. */
function headline(k: DemoKeyword, c: DemoCheck, prev: DemoCheck | undefined) {
  const best = bestOf(c)
  const prevBest = prev ? bestOf(prev) : null
  const top = c.owned[0]?.content ?? null
  return {
    id: c.id,
    depth: k.depth,
    notInTop: c.owned.length === 0,
    bestVideoPosition: best,
    bestRankAbsolute: c.owned.length ? Math.min(...c.owned.map((o) => o.rankAbsolute)) : null,
    ownedCount: c.owned.length,
    previousPos: prevBest,
    change: best != null && prevBest != null ? prevBest - best : null,
    topVideoId: top?.videoId ?? null,
    topVideoUrl: top?.url ?? null,
    topVideoTitle: top?.title ?? null,
    topChannelName: top?.channelName ?? null,
    topBlockName: top?.blockName ?? null,
    topItemType: top?.itemType ?? null,
    topViews: top?.views ?? null,
    topPublishedAt: top?.publishedAt ?? null,
    topDurationSeconds: top?.durationSeconds ?? null,
    adsCount: k.snapshot.filter((x) => x.itemType === "youtube_video_paid").length,
    checkUrl: k.checkUrl,
    status: "COMPLETED",
    checkedAt: c.checkedAt,
  }
}

/** historyForKeyword's rows, newest first. */
const history = (k: DemoKeyword) => k.checks.map((c, i) => headline(k, c, k.checks[i + 1]))

/** rankings/deltas.ts computeDeltas + classifyTrend, with YouTube's unranked = depth + 1. */
function deltas(k: DemoKeyword, anchor: number) {
  const recent = k.checks.filter((c) => Date.parse(c.checkedAt) >= anchor - ROW_WINDOW_DAYS * DAY_MS)
  const pos = (c: DemoCheck) => bestOf(c) ?? k.depth + 1
  const latest = recent[0]
  const window = (days: number) => {
    const threshold = Date.parse(latest.checkedAt) - days * DAY_MS
    const baseline = recent.find((c) => Date.parse(c.checkedAt) <= threshold)
    return baseline ? pos(baseline) - pos(latest) : null
  }
  const run = recent.slice(0, 5).reverse().map(pos)
  let trend5: "winning" | "losing" | "neutral" = "neutral"
  if (run.length === 5) {
    const better = run.some((p, i) => i > 0 && p < run[i - 1])
    const worse = run.some((p, i) => i > 0 && p > run[i - 1])
    const net = run[4] - run[0]
    if (!worse && net < 0) trend5 = "winning"
    else if (!better && net > 0) trend5 = "losing"
  }
  return { d1: window(1), d7: window(7), d30: window(30), trend5, first: recent[recent.length - 1] }
}

function projectFields(d: DemoData) {
  const latest = new Date(d.anchor).toISOString()
  return {
    id: DEMO_ID,
    name: NAME,
    targetType: "CHANNEL" as const,
    targetRaw: CHANNEL_URL,
    // DEMO_BRAND carries no channel id, so the demo is a channel tracked by its
    // handle: no id link in the header, matches by handle.
    targetChannelId: null,
    targetChannelHandle: HANDLE.replace(/^@/, "").toLowerCase(),
    targetChannelSlug: null,
    targetChannelName: null,
    targetVideoId: null,
    targetLabel: HANDLE,
    targetResolvedAt: null,
    targetMatchStrategy: null,
    targetAvatarUrl: null,
    defaultDepth: DEFAULT_DEPTH,
    isActive: true,
    isPaused: false,
    autoCheckEnabled: true,
    checkFrequency: 24,
    lastScheduledCheck: latest,
    nextScheduledCheck: new Date(d.anchor + DAY_MS).toISOString(),
    createdAt: d.createdAt,
    updatedAt: latest,
  }
}

/** buildKeywordRows' row for one keyword. */
function keywordRow(k: DemoKeyword, anchor: number) {
  const latest = headline(k, k.checks[0], k.checks[1])
  const dl = deltas(k, anchor)
  return {
    id: k.id,
    keyword: k.seed.keyword,
    locationCode: k.market.locationCode,
    locationLabel: k.market.locationLabel,
    locationIso2: k.market.iso2,
    languageCode: k.market.languageCode,
    device: "desktop",
    depth: k.seed.depth ?? null,
    addedAt: k.addedAt,
    latestCheckId: latest.id,
    checkedDepth: latest.depth,
    notInTop: latest.notInTop,
    bestVideoPosition: latest.bestVideoPosition,
    bestRankAbsolute: latest.bestRankAbsolute,
    ownedCount: latest.ownedCount,
    change: latest.change,
    previousPos: latest.previousPos,
    topVideoId: latest.topVideoId,
    topVideoUrl: latest.topVideoUrl,
    topVideoTitle: latest.topVideoTitle,
    topChannelName: latest.topChannelName,
    topBlockName: latest.topBlockName,
    topItemType: latest.topItemType,
    topViews: latest.topViews,
    topPublishedAt: latest.topPublishedAt,
    topDurationSeconds: latest.topDurationSeconds,
    adsCount: latest.adsCount,
    checkUrl: latest.checkUrl,
    firstPosition: bestOf(dl.first),
    d1: dl.d1,
    d7: dl.d7,
    d30: dl.d30,
    trend5: dl.trend5,
    status: "COMPLETED",
    checkedAt: latest.checkedAt,
  }
}

function keywordDetail(d: DemoData, k: DemoKeyword) {
  const latest = k.checks[0]
  const rows = history(k)
  return {
    keyword: {
      id: k.id,
      keyword: k.seed.keyword,
      locationCode: k.market.locationCode,
      locationLabel: k.market.locationLabel,
      languageCode: k.market.languageCode,
      device: "desktop",
      depth: k.depth,
      addedAt: k.addedAt,
      lastCheckedAt: latest.checkedAt,
    },
    project: projectFields(d),
    status: "COMPLETED",
    // The full check row, as findFirst returns it (snapshot included).
    latestCheck: {
      ...rows[0],
      keywordId: k.id,
      projectId: DEMO_ID,
      topChannelId: null,
      itemTypes: [...new Set(k.snapshot.map((x) => x.itemType))],
      snapshot: k.snapshot,
      snapshotVersion: 1,
      snapshotTruncated: false,
      dataforseoTaskId: null,
      error: null,
      results: latest.owned.map((o, i) => {
        const { ageDays: _ageDays, ...c } = o.content
        return {
          ...c,
          id: `${latest.id}-r${i + 1}`,
          checkId: latest.id,
          keywordId: k.id,
          projectId: DEMO_ID,
          rankAbsolute: o.rankAbsolute,
          videoPosition: o.videoPosition,
          blockRank: k.snapshot[o.rankAbsolute - 1].blockRank,
          badges: null,
          matchStrategy: o.strategy,
          checkedAt: latest.checkedAt,
        }
      }),
    },
    history: rows,
  }
}

function snapshot(k: DemoKeyword) {
  const latest = k.checks[0]
  return {
    checkId: latest.id,
    keyword: k.seed.keyword,
    locationLabel: k.market.locationLabel,
    languageCode: k.market.languageCode,
    checkedAt: latest.checkedAt,
    depth: k.depth,
    notInTop: latest.owned.length === 0,
    adsCount: k.snapshot.filter((x) => x.itemType === "youtube_video_paid").length,
    checkUrl: k.checkUrl,
    itemTypes: [...new Set(k.snapshot.map((x) => x.itemType))],
    truncated: false,
    ownedRanks: latest.owned.map((o) => o.rankAbsolute),
    items: k.snapshot,
  }
}

/** The card the YouTube projects list pins first (listProjects' row shape). */
export function demoYoutubeProjectSummary() {
  const d = demoData()
  return { ...projectFields(d), keywordCount: d.keywords.length }
}

// ── Routes (GET only; lib/demo/index.ts refuses writes) ─────────────────────

export const youtubeTrackerDemo: DemoTool = {
  base: BASE,
  get([a, b, c, ...rest]) {
    if (rest.length) return undefined
    const d = demoData()
    if (a === undefined) {
      // buildKeywordRows' order: newest added first, then id descending.
      const rows = [...d.keywords].sort((x, y) => y.addedAt.localeCompare(x.addedAt) || y.id.localeCompare(x.id))
      return { ...projectFields(d), keywords: rows.map((k) => keywordRow(k, d.anchor)) }
    }
    if (a === "keywords") {
      const k = d.keywords.find((x) => x.id === b)
      if (k && c === "detail") return keywordDetail(d, k)
      if (k && c === "history") return { history: history(k) }
      return undefined
    }
    if (a === "checks" && c === "snapshot") {
      const k = d.keywords.find((x) => x.checks[0].id === b)
      return k && snapshot(k)
    }
    return undefined
  },
}
