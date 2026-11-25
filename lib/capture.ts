// A part of the page as a PNG, as the browser itself draws it: the part is copied
// into an SVG with the page's own styles, fonts and pictures inside it, and that
// SVG is drawn to a canvas. The browser loads nothing for a picture, so whatever
// it needs goes in first. Chrome, Edge and Brave; Firefox as far as it goes.

const BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
/** The longest side a browser will draw. */
const MAX_SIDE = 16_000
const XHTML = "http://www.w3.org/1999/xhtml"

/** What a save of several parts can share: the page's styles and the files already read. */
export type CaptureCache = { css?: string; files: Map<string, Promise<string | null>> }
export const captureCache = (): CaptureCache => ({ files: new Map() })

/**
 * `el` as a PNG with `pad` around it, twice the screen's size where that fits.
 * While it's drawn it carries `data-capturing` (see addCaptureStyle).
 */
export async function capturePng(el: HTMLElement, { pad = 32, cache = captureCache() }: { pad?: number; cache?: CaptureCache } = {}): Promise<Blob> {
  addCaptureStyle()
  const top = document.scrollingElement?.scrollTop ?? 0
  el.setAttribute("data-capturing", "")
  try {
    await settled(el)
    const box = el.getBoundingClientRect()
    const width = Math.ceil(box.width) + pad * 2
    const height = Math.ceil(box.height) + pad * 2
    cache.css ??= await pageCss(cache)
    const svg = await toSvg(el, box.width, width, height, pad, cache)
    return await draw(svg, width, height, Math.min(2, MAX_SIDE / Math.max(width, height)), pageColor(el))
  } finally {
    el.removeAttribute("data-capturing")
    document.scrollingElement?.scrollTo({ top, behavior: "instant" })
  }
}

/** What the print leaves out (the team's own controls) and a map's zoom buttons stay out; a card in a row is only as tall as it needs. */
function addCaptureStyle() {
  if (document.getElementById("capture-style")) return
  const style = document.createElement("style")
  style.id = "capture-style"
  style.textContent = "[data-capturing] .print\\:hidden,[data-capturing] .gm-bundled-control{display:none!important}[data-capturing]{align-self:start}"
  document.head.append(style)
}

let keeping = false
/**
 * Google draws its maps with WebGL, whose picture the browser throws away once
 * it's on screen: read later, it's blank. Canvases made after this keep theirs,
 * so call it before a map that's to be captured loads.
 */
export function keepMapPictures() {
  if (keeping || typeof HTMLCanvasElement === "undefined") return
  keeping = true
  const getContext = HTMLCanvasElement.prototype.getContext as (this: HTMLCanvasElement, type: string, options?: unknown) => RenderingContext | null
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, options?: unknown) {
    return getContext.call(this, type, type.startsWith("webgl") ? { ...(options as object | undefined), preserveDrawingBuffer: true } : options)
  } as typeof HTMLCanvasElement.prototype.getContext
}

/** Photos loaded, and a map drawn: both wait to be on screen. Six seconds at most. */
async function settled(el: HTMLElement) {
  const until = Date.now() + 6000
  const wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms))
  el.scrollIntoView({ block: "start", behavior: "instant" })
  for (const img of el.querySelectorAll("img")) img.loading = "eager"
  if (el.querySelector('[data-testid="map"], .gm-style')) {
    while (Date.now() < until && !el.querySelector(".gm-style")) await wait(150)
    await wait(2500)
  } else await wait(150)
  while (Date.now() < until && [...el.querySelectorAll("img")].some((i) => i.src && !i.complete)) await wait(150)
}

/** The colour behind it: the nearest one that isn't see-through. */
function pageColor(el: HTMLElement): string {
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    const c = getComputedStyle(n).backgroundColor
    if (c && c !== "transparent" && !/[,/]\s*0\)$/.test(c)) return c
  }
  return "#ffffff"
}

// ── The copy ─────────────────────────────────────────────────────────────────

async function toSvg(el: HTMLElement, inner: number, width: number, height: number, pad: number, cache: CaptureCache): Promise<string> {
  const copy = el.cloneNode(true) as HTMLElement
  await putPicturesIn(el, copy, cache)
  // Its place among its neighbours is not part of it.
  copy.style.setProperty("margin", "0", "important")
  copy.style.setProperty("width", `${inner}px`, "important")

  // The same wrappers it has on the page, so styles that depend on them still apply, but as plain boxes of its width.
  let wrapped: Element = copy
  for (let up = el.parentElement; up && up !== document.documentElement; up = up.parentElement) {
    const shell = up.cloneNode(false) as HTMLElement
    for (const [k, v] of Object.entries(SHELL)) shell.style.setProperty(k, v, "important")
    shell.style.setProperty("width", `${inner}px`, "important")
    shell.setAttribute("data-shell", "")
    shell.append(wrapped)
    wrapped = shell
  }

  const doc = document.implementation.createDocument("http://www.w3.org/2000/svg", "svg", null)
  const svg = doc.documentElement
  // <html>'s classes and theme, on what is now the root. As wide as the window, so the same breakpoints apply.
  for (const a of document.documentElement.attributes) if (a.name !== "xmlns") svg.setAttribute(a.name, a.value)
  const w = Math.max(width, window.innerWidth)
  svg.setAttribute("width", String(w))
  svg.setAttribute("height", String(height))
  svg.setAttribute("style", `${document.documentElement.getAttribute("style") ?? ""};width:${w}px!important;height:${height}px!important;margin:0;padding:0;overflow:hidden`)
  const style = document.createElementNS(XHTML, "style")
  // Animations would start again, at their first frame.
  style.textContent = `${cache.css}\n*,*::before,*::after{animation:none!important;transition:none!important}\n[data-shell]::before,[data-shell]::after{display:none!important}`
  const holder = doc.createElementNS("http://www.w3.org/2000/svg", "foreignObject")
  holder.setAttribute("x", String(pad))
  holder.setAttribute("y", String(pad))
  holder.setAttribute("width", String(Math.ceil(inner)))
  holder.setAttribute("height", String(height - pad))
  holder.append(doc.adoptNode(style), doc.adoptNode(wrapped))
  svg.append(holder)
  // Characters XML doesn't allow would make the whole picture unreadable.
  // eslint-disable-next-line no-control-regex
  return new XMLSerializer().serializeToString(svg).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "")
}

/** A wrapper's own look and size don't come along; what it passes down (colour, font, variables) does. */
const SHELL: Record<string, string> = {
  display: "block", position: "static", float: "none", margin: "0", padding: "0", border: "0", height: "auto", "min-height": "0", "max-height": "none",
  "min-width": "0", "max-width": "none", transform: "none", filter: "none", opacity: "1", overflow: "visible", background: "none", "box-shadow": "none", inset: "auto",
}

/** Every picture in the copy, by its contents. One that can't be had is left blank. */
async function putPicturesIn(el: HTMLElement, copy: HTMLElement, cache: CaptureCache) {
  const from = [el, ...el.querySelectorAll<HTMLElement>("*")]
  const to = [copy, ...copy.querySelectorAll<HTMLElement>("*")]
  await Promise.all(
    from.map(async (a, i) => {
      const b = to[i]
      if (a instanceof HTMLImageElement) {
        const src = a.currentSrc || a.src
        for (const n of ["srcset", "sizes", "loading", "crossorigin"]) b.removeAttribute(n)
        b.setAttribute("src", src ? ((await asData(src, cache)) ?? BLANK) : BLANK)
      } else if (a instanceof SVGImageElement) {
        const src = a.href.baseVal
        b.setAttribute("href", (src && (await asData(new URL(src, location.href).href, cache))) || BLANK)
      } else if (a instanceof HTMLCanvasElement) {
        const img = document.createElement("img")
        try {
          img.src = a.toDataURL()
        } catch {
          img.src = BLANK
        }
        img.setAttribute("class", a.className)
        img.setAttribute("style", a.style.cssText)
        if (!a.style.width) img.style.width = `${a.clientWidth}px`
        if (!a.style.height) img.style.height = `${a.clientHeight}px`
        b.replaceWith(img)
      } else if (a instanceof HTMLInputElement) {
        b.toggleAttribute("checked", a.checked)
        if (a.type !== "file") b.setAttribute("value", a.value)
      } else if (a instanceof HTMLElement && /url\(\s*["']?(?!data:)/.test(a.style.backgroundImage)) {
        const src = /url\(\s*["']?([^"')]+)/.exec(a.style.backgroundImage)![1]
        b.style.backgroundImage = `url("${(await asData(new URL(src, location.href).href, cache)) ?? BLANK}")`
      }
    }),
  )
}

function asData(url: string, cache: CaptureCache): Promise<string | null> {
  if (url.startsWith("data:")) return Promise.resolve(url)
  const had = cache.files.get(url)
  if (had) return had
  const got = (async () => {
    try {
      const res = await fetch(url, { mode: "cors", credentials: "omit", signal: AbortSignal.timeout(8000) })
      if (!res.ok) return null
      const blob = await res.blob()
      return await new Promise<string>((ok, no) => {
        const r = new FileReader()
        r.onload = () => ok(String(r.result))
        r.onerror = () => no(r.error)
        r.readAsDataURL(blob)
      })
    } catch {
      return null
    }
  })()
  cache.files.set(url, got)
  return got
}

// ── The page's styles ────────────────────────────────────────────────────────

async function pageCss(cache: CaptureCache): Promise<string> {
  const out: string[] = []
  const fonts: { rule: CSSFontFaceRule; base: string }[] = []
  const read = (sheet: CSSStyleSheet) => {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      return // Another site's: not readable.
    }
    for (const rule of rules) {
      if (rule instanceof CSSImportRule) {
        if (rule.styleSheet) read(rule.styleSheet)
      } else if (rule instanceof CSSFontFaceRule) fonts.push({ rule, base: sheet.href ?? location.href })
      else out.push(rule.cssText)
    }
  }
  for (const sheet of [...document.styleSheets, ...document.adoptedStyleSheets]) read(sheet)
  // Only the fonts the page has had to load.
  const loaded = new Set([...document.fonts].filter((f) => f.status === "loaded").map((f) => `${plain(f.family)}|${f.unicodeRange}`))
  const faces = await Promise.all(
    fonts.map(async ({ rule, base }) => {
      const s = rule.style
      const family = plain(s.getPropertyValue("font-family"))
      const range = s.getPropertyValue("unicode-range")
      if (![...loaded].some((k) => k.startsWith(`${family}|`) && (!range || sameRange(k.slice(family.length + 1), range)))) return ""
      const src = /url\(\s*["']?([^"')]+)/.exec(s.getPropertyValue("src"))?.[1]
      const data = src && (await asData(new URL(src, base).href, cache))
      if (!data) return ""
      const keep = ["font-style", "font-weight", "font-stretch", "unicode-range", "size-adjust", "ascent-override", "descent-override"]
        .map((p) => [p, s.getPropertyValue(p)])
        .filter(([, v]) => v)
        .map(([p, v]) => `${p}:${v}`)
      return `@font-face{font-family:"${family}";src:url("${data}");${keep.join(";")}}`
    }),
  )
  return [...faces, ...out].join("\n")
}

const plain = (family: string) => family.trim().replace(/^["']|["']$/g, "")
const sameRange = (a: string, b: string) => a.replace(/\s/g, "").toLowerCase() === b.replace(/\s/g, "").toLowerCase()

// ── The picture ──────────────────────────────────────────────────────────────

async function draw(svg: string, width: number, height: number, scale: number, background: string): Promise<Blob> {
  const img = new Image()
  // A data: address, not a blob: one, which would mark the canvas as another site's.
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await img.decode()
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const g = canvas.getContext("2d")!
  const paint = () => {
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.fillStyle = background
    g.fillRect(0, 0, canvas.width, canvas.height)
    g.setTransform(scale, 0, 0, scale, 0, 0)
    g.drawImage(img, 0, 0)
  }
  // Twice: fonts inside an SVG can arrive just after it's first drawn.
  paint()
  await new Promise((ok) => setTimeout(ok, 120))
  paint()
  return new Promise<Blob>((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("no image"))), "image/png"))
}
