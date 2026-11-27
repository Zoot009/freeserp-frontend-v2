"use client"

import { useEffect, useId, useState } from "react"
import { Copy, Download, FolderDown, ImagePlus, Loader2, RefreshCw } from "lucide-react"
import type { GbpAuditResponse } from "@/lib/gbp-audit"
import { postImageUrl, type GbpPost } from "@/lib/report-builder"
import { captureCache, capturePng, type CaptureCache } from "@/lib/capture"
import { safeName, saveFolder, type SaveFile } from "@/lib/save-images"

type Business = NonNullable<GbpAuditResponse["facts"]>["business"]

/** What the team can do with the posts; a shared report has none of it. */
export type PostActions = {
  regenerate: (i: number) => void
  retryImages: () => void
  reload: () => void
  busy: boolean
  /** The GMB Post Creator: an AI photo is made only when asked for (it is charged), one post at a time. */
  createImage?: (i: number) => void
}

const card = "rounded-[10px] border border-border bg-card shadow-sm print:shadow-none"

/** One sample Google Post, as Google shows it: the business, its picture, the text and the button. */
export function PostCard({ post, index, business: b, actions }: { post: GbpPost; index: number; business: Business; actions?: PostActions }) {
  const own = post.logo ? postImageUrl(post.logo) : null
  const look = useLogoLook(own)
  const logo = look.src ?? own ?? b.logo ?? b.mainImage
  const ai = post.image === "ready" && !!post.id
  return (
    <div data-post-card={index} className={`${card} flex flex-col overflow-hidden print:break-inside-avoid`}>
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 print:px-3 print:py-2">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- our own API's image, or a Google-hosted photo
          <img src={logo} alt="" referrerPolicy="no-referrer" className="h-9 w-9 shrink-0 rounded-full bg-white object-contain ring-1 ring-border" />
        ) : (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">{b.name.slice(0, 2).toUpperCase()}</span>
        )}
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold">{b.name}</div>
          <div className="truncate text-xs text-muted-foreground">Google Business Profile · Update</div>
        </div>
      </div>
      <div className="relative">
        <PostGraphic post={post} business={b} photo={ai ? postImageUrl(post.id!) : post.photo ? postImageUrl(post.photo) : null} logo={own ? (look.src ?? own) : null} look={look} />
        {(ai || post.image === "pending") && (
          <span className={`absolute right-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white ${ai ? "" : "animate-pulse print:hidden"}`}>
            {ai ? "AI image" : "Creating the AI image…"}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col items-start gap-2 p-4 print:p-3">
        <div className="text-[15px] font-semibold leading-snug print:text-[12px]">{post.headline}</div>
        <p className="whitespace-pre-line text-[13px] leading-relaxed print:text-[10.5px]">{post.body}</p>
        <span className="mt-auto inline-flex h-9 items-center rounded-full bg-brand px-4 text-[13px] font-semibold text-white print:h-7 print:text-[11px]">{post.cta}</span>
      </div>
      {actions && <PostTools post={post} index={index} client={b.name} actions={actions} />}
    </div>
  )
}

// ── The picture ──────────────────────────────────────────────────────────────

const W = 1200
const H = 900
const FONT = "Inter, 'Segoe UI', Helvetica, Arial, sans-serif"
/** The brand colour until the logo has been read, or when it has none. */
const NEUTRAL = "#1f2937"

/** The business's own photo (or the AI's picture of it) with its logo, the headline and how to reach it. An SVG: the same on screen, in the PDF and downloaded. */
function PostGraphic({ post, business: b, photo, logo, look }: { post: GbpPost; business: Business; photo: string | null; logo: string | null; look: LogoLook }) {
  const uid = useId().replace(/[^\w-]/g, "")
  const { color } = look
  const deep = shade(color)
  const contact = [b.phone, b.website ? hostOf(b.website) : null].filter(Boolean).join("   ·   ")
  // With a photo: logo in the corner, words along the bottom. Without: the logo large over the brand colour.
  const size = photo ? 54 : 62
  const lines = wrap(post.headline, photo ? 36 : 32)
  // The badge follows the logo's shape: a long wordmark gets a long badge, not a small logo.
  const [most, high] = photo ? [300, 110] : [460, 190]
  const lw = Math.max(70, Math.min(most, high * look.ratio))
  const lh = lw / look.ratio
  const badge = photo ? { x: 48, y: 48, w: lw + 48, h: lh + 44 } : { x: W / 2 - lw / 2 - 30, y: 250 - lh / 2 - 28, w: lw + 60, h: lh + 56 }
  const bottom = H - 62
  const lastLine = contact ? bottom - 78 : bottom
  const at = (i: number) => (photo ? lastLine - (lines.length - 1 - i) * (size + 12) : 520 + i * (size + 14))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${b.name}: ${post.headline}`} className="block aspect-[4/3] w-full" fontFamily={FONT}>
      <defs>
        <linearGradient id={`${uid}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={deep} stopOpacity="0" />
          <stop offset="0.55" stopColor={deep} stopOpacity="0.82" />
          <stop offset="1" stopColor={deep} stopOpacity="0.97" />
        </linearGradient>
        <linearGradient id={`${uid}b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={color} />
          <stop offset="1" stopColor={deep} />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${uid}b)`} />
      {photo && <image href={photo} width={W} height={H} preserveAspectRatio="xMidYMid slice" />}
      {photo && <rect y={H * 0.42} width={W} height={H * 0.58} fill={`url(#${uid}s)`} />}
      {logo ? (
        <>
          <rect x={badge.x} y={badge.y} width={badge.w} height={badge.h} rx="24" fill={look.fill} stroke="#000000" strokeOpacity="0.1" strokeWidth="2" />
          <image href={logo} x={badge.x + (badge.w - lw) / 2} y={badge.y + (badge.h - lh) / 2} width={lw} height={lh} preserveAspectRatio="xMidYMid meet" />
        </>
      ) : (
        <text x={photo ? 60 : W / 2} y={photo ? 100 : 280} textAnchor={photo ? "start" : "middle"} fontSize={photo ? 40 : 64} fontWeight="700" fill="#fff" stroke={photo ? deep : "none"} strokeWidth="8" paintOrder="stroke">
          {cut(b.name, photo ? 40 : 28)}
        </text>
      )}
      <rect x={photo ? 60 : W / 2 - 60} y={photo ? at(0) - size - 34 : 440} width="120" height="8" rx="4" fill={lift(color)} />
      {lines.map((line, i) => (
        <text key={i} x={photo ? 60 : W / 2} y={at(i)} textAnchor={photo ? "start" : "middle"} fontSize={size} fontWeight="800" fill="#fff">
          {line}
        </text>
      ))}
      {contact && (
        <text x={photo ? 60 : W / 2} y={photo ? bottom : H - 80} textAnchor={photo ? "start" : "middle"} fontSize="32" fontWeight="600" fill="#fff" fillOpacity="0.92">
          {cut(contact, 62)}
        </text>
      )}
    </svg>
  )
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

const hostOf = (url: string) => {
  try {
    return new URL(/^https?:/i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

/** A headline in lines of about `n` characters, three at most. */
function wrap(text: string, n: number): string[] {
  const lines: string[] = []
  for (const word of text.split(/\s+/)) {
    const last = lines[lines.length - 1]
    if (last !== undefined && `${last} ${word}`.length <= n) lines[lines.length - 1] = `${last} ${word}`
    else lines.push(word)
  }
  return lines.length > 3 ? [...lines.slice(0, 2), cut(lines.slice(2).join(" "), n)] : lines
}

// ── Colour ───────────────────────────────────────────────────────────────────

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const hex = (c: number[]) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`
const lum = ([r, g, b]: number[]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
/** Dark enough for white words on top, whatever the brand's colour. */
const shade = (c: string) => {
  const v = rgb(c)
  const k = Math.min(0.55, 0.16 / Math.max(0.01, lum(v)))
  return hex(v.map((x) => x * k))
}
/** Bright enough to stand out on that. */
const lift = (c: string) => {
  const v = rgb(c)
  const k = lum(v) < 0.4 ? 0.45 : 0
  return hex(v.map((x) => x + (255 - x) * k))
}

/** How a logo is shown: its main colour, the background it's made for, and itself without the empty space around it. */
interface LogoLook {
  color: string
  fill: string
  /** Trimmed; null until it's been read, or when it can't be. */
  src: string | null
  /** Width over height. */
  ratio: number
}

function useLogoLook(logo: string | null): LogoLook {
  const [look, setLook] = useState<LogoLook>({ color: NEUTRAL, fill: "#ffffff", src: null, ratio: 1.4 })
  useEffect(() => {
    if (!logo) return
    let gone = false
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      try {
        const read = readLogo(img)
        if (!gone) setLook(read)
      } catch {
        // A logo that can't be read is shown as it is.
      }
    }
    img.src = logo
    return () => {
      gone = true
    }
  }, [logo])
  return look
}

function readLogo(img: HTMLImageElement): LogoLook {
  const k = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * k))
  const h = Math.max(1, Math.round(img.naturalHeight * k))
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  const g = c.getContext("2d", { willReadFrequently: true })!
  g.drawImage(img, 0, 0, w, h)
  const d = g.getImageData(0, 0, w, h).data
  const at = (x: number, y: number) => [...d.subarray((y * w + x) * 4, (y * w + x) * 4 + 4)]
  const far = (a: number[], b: number[]) => Math.max(...[0, 1, 2].map((i) => Math.abs(a[i] - b[i])))

  // What's behind it: nothing (however far into the corners the artwork goes), one colour all round, or a picture of its own.
  const corners = [at(1, 1), at(w - 2, 1), at(1, h - 2), at(w - 2, h - 2)]
  let empty = 0
  for (let i = 3; i < d.length; i += 4) if (d[i] < 16) empty++
  const clear = empty > w * h * 0.02
  const plain = !clear && corners.every((p) => p[3] > 240 && far(p, corners[0]) < 24)
  const behind = (p: number[]) => p[3] < 16 || (plain && far(p, corners[0]) < 26)

  let [left, top, right, bottom] = [w, h, -1, -1]
  let [art, pale] = [0, 0]
  const votes = new Map<string, { n: number; sum: number[] }>()
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = at(x, y)
      if (behind(p)) continue
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
      art++
      if (lum(p) > 0.8) pale++
      if (Math.max(p[0], p[1], p[2]) - Math.min(p[0], p[1], p[2]) < 45) continue
      const key = p.slice(0, 3).map((v) => v >> 5).join()
      const e = votes.get(key) ?? { n: 0, sum: [0, 0, 0] }
      votes.set(key, { n: e.n + 1, sum: e.sum.map((v, i) => v + p[i]) })
    }
  }
  const best = [...votes.values()].sort((a, z) => z.n - a.n)[0]
  const color = best && best.n >= art * 0.005 ? hex(best.sum.map((v) => v / best.n)) : NEUTRAL
  // Pale artwork on nothing was made for a dark background; on a colour, it keeps that colour.
  const fill = plain ? hex(corners[0].slice(0, 3)) : clear && art && pale / art > 0.85 ? "#111827" : "#ffffff"
  if ((!clear && !plain) || right < left) return { color, fill, src: null, ratio: w / h }

  const tw = right - left + 1
  const th = bottom - top + 1
  const cut = document.createElement("canvas")
  cut.width = tw
  cut.height = th
  cut.getContext("2d")!.drawImage(c, left, top, tw, th, 0, 0, tw, th)
  return { color, fill, src: cut.toDataURL("image/png"), ratio: tw / th }
}

// ── The team's tools ─────────────────────────────────────────────────────────

/** The posts on the page, with the card each is shown in. */
export const postItems = (posts: GbpPost[]) =>
  posts.flatMap((post, i) => {
    const card = document.querySelector<HTMLElement>(`[data-post-card="${i}"]`)
    return card ? [{ post, card, n: i + 1 }] : []
  })

/** Each whole post, picture and written text, as a PNG. */
export async function postFiles(items: ReturnType<typeof postItems>, cache: CaptureCache = captureCache()): Promise<SaveFile[]> {
  const files: SaveFile[] = []
  for (const { post, card, n } of items) {
    files.push({ path: `${n} - ${safeName(post.headline, "Post")}.png`, blob: await capturePng(card, { pad: 24, cache }) })
  }
  if (!files.length) throw new Error("no posts on the page")
  return files
}

/** Every post at once: for the section's header. */
export function DownloadAll({ posts, client }: { posts: GbpPost[]; client: string }) {
  const [state, setState] = useState<"" | "busy" | "failed">("")
  const save = async () => {
    setState("busy")
    try {
      await saveFolder(client, await postFiles(postItems(posts)))
      setState("")
    } catch (e) {
      console.warn("[report] posts not saved", e)
      setState("failed")
    }
  }
  return (
    <button
      type="button"
      onClick={save}
      disabled={state === "busy"}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-60 print:hidden"
      title={`Saves every post as a PNG, in a folder named ${client}`}
    >
      {state === "busy" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FolderDown className="h-4 w-4" aria-hidden />}
      <span aria-live="polite">{state === "busy" ? "Preparing…" : state === "failed" ? "Couldn't save. Try again" : "Download all"}</span>
    </button>
  )
}

/** For publishing the post by hand: its text, all of it as a picture, and another version of it. */
function PostTools({ post, index, client, actions }: { post: GbpPost; index: number; client: string; actions: PostActions }) {
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const say = (s: string) => {
    setNote(s)
    setTimeout(() => setNote(""), 2500)
  }
  const link = "inline-flex items-center gap-1.5 font-medium text-brand hover:underline disabled:opacity-60"
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${post.headline}\n\n${post.body}`)
      say("Copied")
    } catch {
      say("Select the text and copy it by hand.")
    }
  }
  const save = async (card: HTMLElement | null) => {
    if (!card) return
    setSaving(true)
    try {
      await saveFolder(client, await postFiles([{ post, card, n: index + 1 }]), `${client} - Post ${index + 1}`)
    } catch (e) {
      console.warn("[report] post not saved", e)
      say("The post couldn't be saved. Please try again.")
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="space-y-1.5 border-t border-border px-4 py-2.5 text-xs print:hidden">
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        <button type="button" onClick={copy} className={link}>
          <Copy className="h-3.5 w-3.5" aria-hidden /> Copy text
        </button>
        <button type="button" onClick={(e) => save(e.currentTarget.closest<HTMLElement>("[data-post-card]"))} disabled={saving} className={link} title="The whole post as a PNG, in a ZIP">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Download className="h-3.5 w-3.5" aria-hidden />} {saving ? "Preparing…" : "Download"}
        </button>
        <button type="button" onClick={() => actions.regenerate(index)} disabled={actions.busy} className={link} title="Writes this post again">
          <RefreshCw className={`h-3.5 w-3.5 ${actions.busy ? "animate-spin" : ""}`} aria-hidden /> {actions.busy ? "Writing…" : "Another version"}
        </button>
        {actions.createImage && !post.image && !post.imageError && (
          <button type="button" onClick={() => actions.createImage!(index)} disabled={actions.busy} className={link} title="An AI photo in the style of the business's own">
            <ImagePlus className="h-3.5 w-3.5" aria-hidden /> Create AI photo
          </button>
        )}
      </div>
      <div aria-live="polite" className="text-muted-foreground empty:hidden">
        {note}
      </div>
      {post.imageError && (
        <div className="text-muted-foreground">
          Using the business&apos;s own photo. {post.imageError}{" "}
          <button type="button" onClick={() => (actions.createImage ? actions.createImage(index) : actions.retryImages())} className="font-medium text-brand hover:underline">
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
