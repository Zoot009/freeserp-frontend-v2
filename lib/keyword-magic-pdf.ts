// Keyword Magic's PDF: the rows on screen as a report, in the house style of
// the audit PDF (lib/audit-pdf.ts): slate ink, hairline rules, and "Powered by
// FreeSERP" with the page count in the footer. The page imports it on demand,
// so jsPDF stays out of its bundle until someone exports.
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import { kdBand, type ExportRow } from "@/lib/keyword-magic"

type RGB = [number, number, number]
const INK: RGB = [15, 23, 42]
const MUTED: RGB = [100, 116, 139]
const FAINT: RGB = [148, 163, 184]
const HAIR: RGB = [226, 232, 240]
// The dashboard's own tokens (app/dashboard.css), so the PDF reads like the table.
const BRAND: RGB = [45, 91, 255]
const DOT: Record<string, RGB> = {
  informational: BRAND,
  navigational: [138, 147, 164],
  commercial: [194, 139, 0],
  transactional: [22, 163, 74],
}
const KD: Record<ReturnType<typeof kdBand>, { fill: RGB; text: RGB }> = {
  easy: { fill: [232, 247, 238], text: [22, 163, 74] },
  medium: { fill: [251, 243, 220], text: [194, 139, 0] },
  hard: { fill: [252, 235, 235], text: [220, 38, 38] },
}

export type KeywordPdf = {
  fileName: string
  rows: ExportRow[]
  title: string
  /** The search: seed, match type, market, date. */
  subtitle: string
  /** The filters narrowing the rows, or null when every row is in. */
  filtered: string | null
  stats: { label: string; value: string; note?: string }[]
  /** Column headings: #, keyword, intent, volume, KD, CPC, SERP features. */
  head: string[]
  pageLabel: (page: number, pages: number) => string
}

/**
 * Punctuation outside Latin-1 to its plain twin. The built-in fonts only have
 * Latin-1, and toLocaleString() puts some in numbers: French groups thousands
 * with a narrow no-break space.
 */
function plain(s: string): string {
  return s
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[ -​  ]/g, " ")
}

const LATIN1 = /^[\x20-\x7E\xA0-\xFF]*$/

/**
 * Text as a picture of itself, for anything still outside Latin-1: a Russian
 * or a Japanese keyword. Helvetica would print it as garbage; the browser's
 * own fonts draw every script. 4 pixels a point keeps it sharp on paper.
 */
function textImage(text: string, pt: number, rgb: RGB, bold = false): { url: string; w: number; h: number } {
  const k = 4
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")!
  const font = `${bold ? "600 " : ""}${pt * k}px system-ui, "Segoe UI", Roboto, "Noto Sans", sans-serif`
  ctx.font = font
  canvas.width = Math.ceil(ctx.measureText(text).width) + 2
  canvas.height = Math.ceil(pt * k * 1.4)
  ctx.font = font // resizing a canvas resets its state
  ctx.fillStyle = `rgb(${rgb.join(",")})`
  ctx.textBaseline = "middle"
  ctx.fillText(text, 0, canvas.height / 2)
  return { url: canvas.toDataURL("image/png"), w: canvas.width / k, h: canvas.height / k }
}

/** One line of text at (x, baseline y), as text when the fonts can, as a picture when not. */
function line(doc: jsPDF, text: string, x: number, y: number, pt: number, rgb: RGB, maxW: number, bold = false) {
  const s = plain(text)
  if (LATIN1.test(s)) {
    doc.setFont("helvetica", bold ? "bold" : "normal")
    doc.setFontSize(pt)
    doc.setTextColor(...rgb)
    doc.text(doc.splitTextToSize(s, maxW)[0] ?? "", x, y)
    return
  }
  const img = textImage(s, pt, rgb, bold)
  const scale = Math.min(1, maxW / img.w)
  doc.addImage(img.url, "PNG", x, y - (img.h * scale) * 0.68, img.w * scale, img.h * scale)
}

export function downloadKeywordMagicPdf(r: KeywordPdf) {
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 40
  const contentW = pageW - margin * 2

  // ── Title, the search, the filters ──
  let y = margin + 14
  line(doc, r.title, margin, y, 18, INK, contentW, true)
  y += 18
  line(doc, r.subtitle, margin, y, 9.5, MUTED, contentW)
  if (r.filtered) {
    y += 14
    line(doc, r.filtered, margin, y, 9, MUTED, contentW)
  }
  y += 16

  // ── Stat boxes, as the page's tiles ──
  const gap = 10
  const boxW = (contentW - gap * (r.stats.length - 1)) / r.stats.length
  const boxH = 50
  r.stats.forEach((s, i) => {
    const x = margin + i * (boxW + gap)
    doc.setFillColor(248, 250, 252)
    doc.setDrawColor(...HAIR)
    doc.roundedRect(x, y, boxW, boxH, 6, 6, "FD")
    line(doc, s.label.toUpperCase(), x + 12, y + 17, 7.5, MUTED, boxW - 24, true)
    line(doc, s.value, x + 12, y + 38, 15, INK, boxW - 24, true)
    if (s.note) {
      doc.setFont("helvetica", "bold")
      doc.setFontSize(15)
      const valueW = doc.getTextWidth(plain(s.value))
      line(doc, s.note, x + 12 + valueW + 5, y + 38, 8.5, MUTED, boxW - 29 - valueW)
    }
  })
  y += boxH + 18

  // ── The rows ──
  const KW = 1, INTENT = 2, KDCOL = 4
  autoTable(doc, {
    startY: y,
    head: [r.head.map((h) => plain(h).toUpperCase())],
    body: r.rows.map((row, i) => [
      String(i + 1),
      plain(row.keyword),
      plain(row.intent ?? "-"),
      row.volume != null ? plain(row.volume.toLocaleString()) : "-",
      row.difficulty != null ? String(row.difficulty) : "-",
      row.cpc != null ? `$${row.cpc.toFixed(2)}` : "-",
      plain(row.features.join(", ") || "-"),
    ]),
    theme: "plain",
    // Room at the foot of every page for the footer.
    margin: { left: margin, right: margin, top: margin, bottom: 52 },
    styles: { fontSize: 8.5, cellPadding: { top: 6, bottom: 6, left: 4, right: 4 }, valign: "middle", textColor: INK, overflow: "linebreak" },
    headStyles: { fontStyle: "bold", textColor: MUTED, fontSize: 7, lineWidth: { bottom: 0.75 }, lineColor: HAIR },
    bodyStyles: { lineWidth: { bottom: 0.5 }, lineColor: HAIR },
    columnStyles: {
      0: { cellWidth: 24, halign: "right", textColor: FAINT },
      [KW]: { cellWidth: "auto" },
      [INTENT]: { cellWidth: 82, cellPadding: { top: 6, bottom: 6, left: 13, right: 4 } },
      3: { cellWidth: 58, halign: "right" },
      [KDCOL]: { cellWidth: 36, halign: "center" },
      5: { cellWidth: 44, halign: "right" },
      6: { cellWidth: 112, textColor: MUTED, fontSize: 7.5 },
    },
    didParseCell: (d) => {
      if (d.section === "head") {
        if ([0, 3, 5].includes(d.column.index)) d.cell.styles.halign = "right"
        if (d.column.index === KDCOL) d.cell.styles.halign = "center"
        if (d.column.index === INTENT) d.cell.styles.cellPadding = { top: 6, bottom: 6, left: 4, right: 4 }
        return
      }
      const row = r.rows[d.row.index]
      // Drawn in didDrawCell: the KD badge, and a keyword the fonts can't print.
      if (d.column.index === KDCOL && row.difficulty != null) d.cell.text = [""]
      if (d.column.index === KW && !LATIN1.test(plain(row.keyword))) d.cell.text = [""]
    },
    didDrawCell: (d) => {
      if (d.section !== "body") return
      const row = r.rows[d.row.index]
      const { x, y: top, width, height } = d.cell
      const midY = top + height / 2
      if (d.column.index === INTENT && row.intentKey && DOT[row.intentKey]) {
        doc.setFillColor(...DOT[row.intentKey])
        doc.circle(x + 7, midY, 2.2, "F")
      }
      if (d.column.index === KDCOL && row.difficulty != null) {
        const c = KD[kdBand(row.difficulty)]
        const w = 24, h = 14
        doc.setFillColor(...c.fill)
        doc.roundedRect(x + (width - w) / 2, midY - h / 2, w, h, 3.5, 3.5, "F")
        doc.setFont("helvetica", "bold")
        doc.setFontSize(8)
        doc.setTextColor(...c.text)
        doc.text(String(row.difficulty), x + width / 2, midY + 2.8, { align: "center" })
      }
      if (d.column.index === KW && !LATIN1.test(plain(row.keyword))) {
        const pad = d.cell.padding("left")
        const img = textImage(plain(row.keyword), 8.5, INK)
        const scale = Math.min(1, (width - pad - d.cell.padding("right")) / img.w)
        doc.addImage(img.url, "PNG", x + pad, midY - (img.h * scale) / 2, img.w * scale, img.h * scale)
      }
    },
  })

  // ── Brand rule and footer on every page ──
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFillColor(...BRAND)
    doc.rect(0, 0, pageW, 4, "F")
    doc.setDrawColor(...HAIR)
    doc.line(margin, pageH - 36, pageW - margin, pageH - 36)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(...FAINT)
    doc.text("Powered by FreeSERP", margin, pageH - 22)
    doc.text(plain(r.pageLabel(p, pages)), pageW - margin, pageH - 22, { align: "right" })
  }

  doc.save(`${r.fileName}.pdf`)
}
