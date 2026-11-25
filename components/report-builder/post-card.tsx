"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Copy, Download, FolderDown, Loader2, RefreshCw } from "lucide-react"
import type { GbpAuditResponse } from "@/lib/gbp-audit"
import { postImageUrl, type GbpPost } from "@/lib/report-builder"
import { saveImages } from "@/lib/save-images"

type Business = NonNullable<GbpAuditResponse["facts"]>["business"]

/** What the team can do with the posts; a shared report has none of it. */
export type PostActions = { regenerate: (i: number) => void; retryImages: () => void; reload: () => void; busy: boolean }

const card = "rounded-[10px] border border-border bg-card shadow-sm print:shadow-none"

/** One sample Google Post, as Google shows it: the business, its picture, the text and the button. */
export function PostCard({ post, business: b, actions, onRegenerate }: { post: GbpPost; business: Business; actions?: PostActions; onRegenerate?: () => void }) {
  const svg = useRef<SVGSVGElement>(null)
  const logo = (post.logo ? postImageUrl(post.logo) : null) ?? b.logo ?? b.mainImage
  const ai = post.image === "ready" && !!post.id
  return (
    <div className={`${card} flex flex-col overflow-hidden print:break-inside-avoid`}>
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
        <PostGraphic ref={svg} post={post} business={b} photo={ai ? postImageUrl(post.id!) : post.photo ? postImageUrl(post.photo) : null} logo={post.logo ? postImageUrl(post.logo) : null} />
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
      {actions && onRegenerate && <PostTools post={post} svg={svg} business={b} actions={actions} onRegenerate={onRegenerate} />}
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
function PostGraphic({ ref, post, business: b, photo, logo }: { ref: React.Ref<SVGSVGElement>; post: GbpPost; business: Business; photo: string | null; logo: string | null }) {
  const uid = useId().replace(/[^\w-]/g, "")
  const { color, light } = useLogoLook(logo)
  const deep = shade(color)
  const contact = [b.phone, b.website ? hostOf(b.website) : null].filter(Boolean).join("   ·   ")
  // With a photo: logo in the corner, words along the bottom. Without: the logo large over the brand colour.
  const size = photo ? 54 : 62
  const lines = wrap(post.headline, photo ? 36 : 32)
  const badge = photo ? { x: 48, y: 48, w: 210, h: 150 } : { x: W / 2 - 180, y: 130, w: 360, h: 260 }
  const bottom = H - 62
  const lastLine = contact ? bottom - 78 : bottom
  const at = (i: number) => (photo ? lastLine - (lines.length - 1 - i) * (size + 12) : 520 + i * (size + 14))
  return (
    <svg ref={ref} data-post-picture viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${b.name}: ${post.headline}`} className="block aspect-[4/3] w-full" fontFamily={FONT}>
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
          <rect x={badge.x} y={badge.y} width={badge.w} height={badge.h} rx="26" fill={light ? "#111827" : "#ffffff"} fillOpacity="0.96" />
          <image href={logo} x={badge.x + 22} y={badge.y + 20} width={badge.w - 44} height={badge.h - 40} preserveAspectRatio="xMidYMid meet" />
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

/** The logo's main colour, and whether it's a pale logo (drawn for a dark background). */
function useLogoLook(logo: string | null): { color: string; light: boolean } {
  const [look, setLook] = useState({ color: NEUTRAL, light: false })
  useEffect(() => {
    if (!logo) return
    let gone = false
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      try {
        const c = document.createElement("canvas")
        c.width = c.height = 48
        const g = c.getContext("2d", { willReadFrequently: true })!
        g.drawImage(img, 0, 0, 48, 48)
        const d = g.getImageData(0, 0, 48, 48).data
        const votes = new Map<string, { n: number; sum: number[] }>()
        let pale = 0
        let solid = 0
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 128) continue
          const v = [d[i], d[i + 1], d[i + 2]]
          solid++
          if (lum(v) > 0.8) pale++
          if (Math.max(...v) - Math.min(...v) < 45) continue
          const k = v.map((x) => x >> 5).join()
          const e = votes.get(k) ?? { n: 0, sum: [0, 0, 0] }
          votes.set(k, { n: e.n + 1, sum: e.sum.map((x, j) => x + v[j]) })
        }
        const best = [...votes.values()].sort((a, z) => z.n - a.n)[0]
        if (gone) return
        setLook({
          color: best && best.n >= 12 ? hex(best.sum.map((x) => x / best.n)) : NEUTRAL,
          // Nearly all pale, on transparency: white artwork that a white badge would hide.
          light: solid > 0 && solid < 48 * 48 * 0.9 && pale / solid > 0.85,
        })
      } catch {
        // A logo that can't be read keeps the neutral colour.
      }
    }
    img.src = logo
    return () => {
      gone = true
    }
  }, [logo])
  return look
}

// ── The team's tools ─────────────────────────────────────────────────────────

/** The picture as a PNG, as drawn. Its photo and logo are put inside it first: an SVG drawn to a canvas loads nothing. */
async function toPng(svg: SVGSVGElement): Promise<Blob> {
  const copy = svg.cloneNode(true) as SVGSVGElement
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  copy.setAttribute("width", String(W))
  copy.setAttribute("height", String(H))
  await Promise.all(
    [...copy.querySelectorAll("image")].map(async (el) => {
      const res = await fetch(el.getAttribute("href")!)
      // Gone from the server: drawn without it, as it is on the page.
      if (!res.ok) return el.remove()
      const blob = await res.blob()
      el.setAttribute(
        "href",
        await new Promise<string>((ok, no) => {
          const r = new FileReader()
          r.onload = () => ok(String(r.result))
          r.onerror = () => no(r.error)
          r.readAsDataURL(blob)
        }),
      )
    }),
  )
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml" }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const c = document.createElement("canvas")
    c.width = W
    c.height = H
    c.getContext("2d")!.drawImage(img, 0, 0, W, H)
    return await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("no image"))), "image/png"))
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Every post's picture at once. */
export function DownloadAll({ posts, business, within }: { posts: GbpPost[]; business: Business; within: React.RefObject<HTMLElement | null> }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const save = async () => {
    setBusy(true)
    setFailed(false)
    try {
      const pictures = [...(within.current?.querySelectorAll<SVGSVGElement>("svg[data-post-picture]") ?? [])]
      if (!pictures.length) throw new Error("no pictures")
      await saveImages(business.name, await Promise.all(pictures.map(async (svg, i) => ({ title: posts[i]?.headline ?? "Post", png: await toPng(svg) }))))
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 print:hidden">
      <span aria-live="polite" className="text-xs text-red-600 empty:hidden dark:text-red-400">
        {failed ? "The images couldn't be saved. Please try again." : ""}
      </span>
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
        title={`Saves ${posts.length === 1 ? "the image" : `all ${posts.length} images`} in a folder named ${business.name}`}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FolderDown className="h-4 w-4" aria-hidden />} {busy ? "Preparing…" : "Download all"}
      </button>
    </div>
  )
}

/** For publishing the post by hand: its text, its picture, and another version of it. */
function PostTools({ post, svg, business, actions, onRegenerate }: { post: GbpPost; svg: React.RefObject<SVGSVGElement | null>; business: Business; actions: PostActions; onRegenerate: () => void }) {
  const [note, setNote] = useState("")
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
  const save = async () => {
    if (!svg.current) return
    try {
      await saveImages(business.name, [{ title: post.headline, png: await toPng(svg.current) }])
    } catch {
      say("The image couldn't be saved. Please try again.")
    }
  }
  return (
    <div className="space-y-1.5 border-t border-border px-4 py-2.5 text-xs print:hidden">
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        <button type="button" onClick={copy} className={link}>
          <Copy className="h-3.5 w-3.5" aria-hidden /> Copy text
        </button>
        <button type="button" onClick={save} className={link}>
          <Download className="h-3.5 w-3.5" aria-hidden /> Download image
        </button>
        <button type="button" onClick={onRegenerate} disabled={actions.busy} className={link} title="Writes this post again">
          <RefreshCw className={`h-3.5 w-3.5 ${actions.busy ? "animate-spin" : ""}`} aria-hidden /> {actions.busy ? "Writing…" : "Another version"}
        </button>
      </div>
      <div aria-live="polite" className="text-muted-foreground empty:hidden">
        {note}
      </div>
      {post.imageError && (
        <div className="text-muted-foreground">
          Using the business&apos;s own photo. {post.imageError}{" "}
          <button type="button" onClick={actions.retryImages} className="font-medium text-brand hover:underline">
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
