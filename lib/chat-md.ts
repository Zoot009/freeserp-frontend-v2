/**
 * Tiny markdown -> HTML renderer for chat messages.
 *
 * Supports: bold, italic (via `_..._`), inline code, fenced code blocks,
 * bullet lists, numbered lists, and paragraphs. Always escapes input first.
 *
 * Mirrors the `md()` function in the design HTML so chat output renders
 * the same way as the prototype.
 */

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string))
}

// Unicode Private Use Area sentinels — won't collide with real text.
const SENTINEL_OPEN = ""
const SENTINEL_CLOSE = ""

export function renderChatMarkdown(text: string): string {
  const blocks: string[] = []
  let t = text.replace(/```([\s\S]*?)```/g, (_m, c: string) => {
    blocks.push(c)
    return `${SENTINEL_OPEN}${blocks.length - 1}${SENTINEL_CLOSE}`
  })

  t = escapeHtml(t)

  const blockRe = new RegExp(SENTINEL_OPEN + "(\\d+)" + SENTINEL_CLOSE, "g")
  t = t.replace(blockRe, (_m, i: string) => `<pre><code>${escapeHtml(blocks[Number(i)])}</code></pre>`)
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>")
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  t = t.replace(/(^|\W)_([^_]+)_(?=\W|$)/g, "$1<em>$2</em>")

  t = t.replace(/(^|\n)((?:- [^\n]+\n?)+)/g, (_m, pre: string, list: string) => {
    const items = list
      .trim()
      .split("\n")
      .map((l) => l.replace(/^- /, ""))
      .map((li) => `<li>${li}</li>`)
      .join("")
    return `${pre}<ul>${items}</ul>`
  })
  t = t.replace(/(^|\n)((?:\d+\. [^\n]+\n?)+)/g, (_m, pre: string, list: string) => {
    const items = list
      .trim()
      .split("\n")
      .map((l) => l.replace(/^\d+\.\s/, ""))
      .map((li) => `<li>${li}</li>`)
      .join("")
    return `${pre}<ol>${items}</ol>`
  })

  t = t
    .split(/\n{2,}/)
    .map((p) => {
      if (/^<(ul|ol|pre)/.test(p.trim())) return p
      return `<p>${p.replace(/\n/g, "<br/>")}</p>`
    })
    .join("")

  return t
}
