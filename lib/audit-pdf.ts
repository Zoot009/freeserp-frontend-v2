// Generates a polished, branded multi-page PDF of an audit report using jsPDF.
// Layout mirrors a professional SEO report: intro, overall grade + screenshot,
// category grades, a recommendations list with priority badges, and per-category
// check sections with pass/fail marks. Triggered by the "Download" button.
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import {
  CATEGORY_SCORES_DEF,
  prefetchScreenshot,
  SECTION_BACKLINKS,
  SECTION_INTERNAL_LINKS,
  SECTION_RECOMMENDATIONS,
  sectionKeyForCategory,
  type AuditReport,
  type SEOAuditCheck,
} from "@/components/page-audit/audit-ui"

type RGB = [number, number, number]
const INK: RGB = [15, 23, 42]
const MUTED: RGB = [100, 116, 139]
const FAINT: RGB = [148, 163, 184]
const HAIR: RGB = [226, 232, 240]

function gradeRGB(grade?: string | null): RGB {
  switch ((grade ?? "").toUpperCase()) {
    case "A+":
    case "A":
      return [15, 157, 107]
    case "B":
      return [22, 163, 74]
    case "C+":
    case "C":
      return [217, 119, 6]
    case "D":
      return [234, 88, 12]
    default:
      return [220, 38, 38]
  }
}

function priorityOf(sev: string): { label: string; fill: RGB; text: RGB } {
  if (sev === "CRITICAL" || sev === "HIGH")
    return { label: "High Priority", fill: [252, 231, 243], text: [219, 39, 119] }
  if (sev === "MEDIUM")
    return { label: "Medium Priority", fill: [254, 243, 199], text: [180, 83, 9] }
  return { label: "Low Priority", fill: [220, 252, 231], text: [22, 163, 74] }
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

/**
 * jsPDF's standard fonts only support WinAnsi (Latin-1). Emojis, CJK, Greek,
 * etc. render as garbage, so strip anything outside printable ASCII + the
 * Latin-1 supplement (keeps accents like é/ñ, drops emoji/non-Latin scripts).
 */
function pdfText(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

export async function downloadAuditPdf(report: AuditReport, hiddenSections?: string[]) {
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 48
  const contentW = pageW - margin * 2
  const host = hostnameOf(report.url)
  const hidden = new Set(hiddenSections ?? [])

  let y = 0
  const ensure = (needed: number) => {
    if (y + needed > pageH - 56) {
      doc.addPage()
      y = margin
    }
  }

  // ── Title + intro ──
  y = margin + 6
  doc.setFont("helvetica", "bold")
  doc.setFontSize(22)
  doc.setTextColor(...INK)
  doc.text(`Website Report for ${host}`, margin, y)
  y += 26
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.setTextColor(...MUTED)
  y = paragraph(
    doc,
    "This report grades your website across a range of important factors — on-page SEO, links, usability, performance, social, security and more. The overall grade is on an A+ to F scale; most industry-leading sites sit in the A range. Improving your grade gives users a better experience and helps search engines rank and surface your site.",
    margin,
    y,
    contentW,
    14,
  )
  y += 16

  // ── Audit results header ──
  doc.setFont("helvetica", "bold")
  doc.setFontSize(15)
  doc.setTextColor(...INK)
  doc.text(`Audit Results for ${host}`, margin, y)
  y += 22

  // Overall grade RING + tagline + pills (left), screenshot (right)
  const overallGrade = report.scoring?.overall?.grade ?? "—"
  const overallScore = report.scoring?.overall?.score
  const blockTop = y
  const leftW = contentW * 0.46
  const ringCx = margin + leftW / 2
  const ringCy = blockTop + 56

  ring(doc, ringCx, ringCy, 46, pct(overallScore, overallGrade), gradeRGB(overallGrade), overallGrade, 30)

  // Tagline
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.setTextColor(...INK)
  doc.text(gradeTagline(overallGrade), ringCx, blockTop + 126, { align: "center" })

  // Pills row (centered): Grade · issues found · pages analyzed
  const gcOverall = gradeRGB(overallGrade)
  const pills: { label: string; fill: RGB; text: RGB }[] = [
    { label: `Grade ${overallGrade}`, fill: tint(gcOverall), text: gcOverall },
    {
      label: `${report.issues?.length ?? 0} issues found`,
      fill: [255, 237, 213],
      text: [194, 120, 3],
    },
  ]
  pillRow(doc, pills, ringCx, blockTop + 144)

  // Screenshot (right side)
  const shot = await loadScreenshot(report)
  let blockBottom = blockTop + 160
  if (shot) {
    try {
      const props = doc.getImageProperties(shot)
      const boxW = contentW * 0.5
      const imgH = Math.min(165, (props.height / props.width) * boxW)
      const imgW = (props.width / props.height) * imgH
      const sx = pageW - margin - imgW
      doc.addImage(shot, "JPEG", sx, blockTop, imgW, imgH)
      doc.setDrawColor(...HAIR)
      doc.rect(sx, blockTop, imgW, imgH)
      blockBottom = Math.max(blockBottom, blockTop + imgH)
    } catch {
      /* skip */
    }
  }
  y = blockBottom + 30

  // ── Category mini-rings row ──
  ensure(90)
  doc.setFillColor(249, 250, 251)
  doc.setDrawColor(...HAIR)
  doc.roundedRect(margin, y, contentW, 86, 10, 10, "FD")
  const n = CATEGORY_SCORES_DEF.length
  const cellW = (contentW - 24) / n
  CATEGORY_SCORES_DEF.forEach((d, i) => {
    const cat = report.scoring?.categories?.[d.category as keyof typeof report.scoring.categories]
    const grade = cat?.grade ?? "—"
    const cx = margin + 12 + cellW * (i + 0.5)
    const cyR = y + 34
    ring(doc, cx, cyR, 17, pct(cat?.score, grade), gradeRGB(grade), grade, 12)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(6.8)
    doc.setTextColor(...MUTED)
    const lbl = doc.splitTextToSize(d.label, cellW - 2) as string[]
    lbl.slice(0, 2).forEach((line, li) => {
      doc.text(line, cx, y + 62 + li * 8, { align: "center" })
    })
  })
  y += 86 + 28

  // ── Recommendations (priority badges) ──
  if (!hidden.has(SECTION_RECOMMENDATIONS)) {
  const issues = [...(report.issues ?? [])].sort(
    (a, b) => sevOrder(a.severity) - sevOrder(b.severity),
  )
  ensure(50)
  sectionTitle(doc, `Recommendations (${issues.length})`, margin, y)
  y += 6
  if (issues.length > 0) {
    autoTable(doc, {
      startY: y + 6,
      head: [["Recommendation", "Category", "Priority"]],
      body: issues.map((i) => [i.title, prettyCategory(i.category), priorityOf(i.severity).label]),
      theme: "plain",
      margin: { left: margin, right: margin },
      styles: { fontSize: 9.5, cellPadding: { top: 7, bottom: 7, left: 4, right: 4 }, valign: "middle" },
      headStyles: { fontStyle: "bold", textColor: MUTED, fontSize: 8, lineWidth: { bottom: 0.5 }, lineColor: HAIR },
      bodyStyles: { textColor: INK, lineWidth: { bottom: 0.5 }, lineColor: HAIR },
      columnStyles: {
        1: { cellWidth: 100, textColor: MUTED, fontSize: 8.5 },
        2: { cellWidth: 96, halign: "center", fontStyle: "bold", fontSize: 8 },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 2) {
          const p = priorityOf(issues[data.row.index].severity)
          data.cell.styles.fillColor = p.fill
          data.cell.styles.textColor = p.text
        }
      },
    })
    y = afterTable(doc) + 26
  } else {
    bodyText(doc, "No recommendations — your page is in great shape!", margin, y + 20)
    y += 40
  }
  }

  // ── Internal Link Analysis ──
  const lg = report.linkGraph
  if (lg?.metadata && !hidden.has(SECTION_INTERNAL_LINKS)) {
    const m = lg.metadata
    ensure(150)
    doc.setDrawColor(...HAIR)
    doc.line(margin, y, pageW - margin, y)
    y += 18
    sectionTitle(doc, "Internal Link Analysis", margin, y)
    // confidence badge (right)
    const conf = lg.orphanData?.confidence ?? "low"
    const cf: { fill: RGB; text: RGB } =
      conf === "high"
        ? { fill: [220, 252, 231], text: [22, 163, 74] }
        : conf === "medium"
          ? { fill: [254, 243, 199], text: [180, 83, 9] }
          : { fill: [254, 226, 226], text: [220, 38, 38] }
    const cLabel = `${conf} confidence`
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    const cw = doc.getTextWidth(cLabel) + 16
    doc.setFillColor(...cf.fill)
    doc.roundedRect(pageW - margin - cw, y - 11, cw, 16, 8, 8, "F")
    doc.setTextColor(...cf.text)
    doc.text(cLabel, pageW - margin - cw / 2, y, { align: "center" })

    y += 14
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9.5)
    doc.setTextColor(...MUTED)
    doc.text(`Full-site crawl · ${m.totalPages} pages · max depth ${m.maxDepth}`, margin, y)
    y += 16

    const stats: [string, string][] = [
      ["Pages Crawled", String(m.totalPages)],
      ["Total Links", String(m.totalLinks)],
      ["Orphan Pages", String(m.orphanPages)],
      ["Hub Pages", String(m.hubPages)],
      ["Authority Pages", String(m.authorityPages)],
      ["Avg Links / Page", m.averageLinksPerPage.toFixed(1)],
    ]
    const cols = 3
    const gap = 10
    const cw2 = (contentW - gap * (cols - 1)) / cols
    const ch = 50
    stats.forEach((s, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      if (col === 0) ensure(ch + 4)
      const sx = margin + col * (cw2 + gap)
      const sy = y + row * (ch + gap)
      doc.setDrawColor(...HAIR)
      doc.setFillColor(249, 250, 251)
      doc.roundedRect(sx, sy, cw2, ch, 8, 8, "FD")
      doc.setFont("helvetica", "normal")
      doc.setFontSize(8.5)
      doc.setTextColor(...MUTED)
      doc.text(s[0], sx + 12, sy + 19)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(18)
      doc.setTextColor(...INK)
      doc.text(s[1], sx + 12, sy + 40)
    })
    y += Math.ceil(stats.length / cols) * (ch + gap) + 8

    // Top linked pages
    const top = m.topLinkedPages ?? []
    if (top.length > 0) {
      ensure(50)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(11)
      doc.setTextColor(...INK)
      doc.text("Top linked pages", margin, y)
      y += 4
      autoTable(doc, {
        startY: y + 6,
        head: [["Page", "Inbound links"]],
        body: top.map((p) => [p.title ? `${p.title}\n${p.url}` : p.url, String(p.inboundLinks)]),
        theme: "plain",
        margin: { left: margin, right: margin },
        styles: { fontSize: 9, cellPadding: { top: 6, bottom: 6, left: 4, right: 4 }, valign: "middle" },
        headStyles: { fontStyle: "bold", textColor: MUTED, fontSize: 8, lineWidth: { bottom: 0.5 }, lineColor: HAIR },
        bodyStyles: { textColor: INK, lineWidth: { bottom: 0.5 }, lineColor: HAIR },
        columnStyles: { 1: { cellWidth: 90, halign: "center", fontStyle: "bold" } },
      })
      y = afterTable(doc) + 16
    }
  }

  // ── Backlink Profile (rendered inline, right after Keyword Consistency) ──
  const renderBacklinkSection = () => {
    const bl = report.backlinks
    if (!bl) return
    ensure(150)
    doc.setDrawColor(...HAIR)
    doc.line(margin, y, pageW - margin, y)
    y += 18
    sectionTitle(doc, "Backlink Profile", margin, y)
    y += 14
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9.5)
    doc.setTextColor(...MUTED)
    doc.text(`${bl.target} · informational, does not affect your score`, margin, y)
    y += 16

    const total = bl.dofollow + bl.nofollow
    const dofollowPct = total > 0 ? Math.round((bl.dofollow / total) * 100) : 0
    const stats: [string, string][] = [
      ["Domain Rank", String(bl.rank)],
      ["Total Backlinks", bl.backlinks.toLocaleString()],
      ["Referring Domains", bl.referringDomains.toLocaleString()],
      ["Referring IPs", bl.referringIps.toLocaleString()],
      ["Broken Backlinks", bl.brokenBacklinks.toLocaleString()],
      ["Dofollow", `${dofollowPct}%`],
    ]
    const cols = 3
    const gap = 10
    const cw2 = (contentW - gap * (cols - 1)) / cols
    const ch = 50
    stats.forEach((s, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      if (col === 0) ensure(ch + 4)
      const sx = margin + col * (cw2 + gap)
      const sy = y + row * (ch + gap)
      doc.setDrawColor(...HAIR)
      doc.setFillColor(249, 250, 251)
      doc.roundedRect(sx, sy, cw2, ch, 8, 8, "FD")
      doc.setFont("helvetica", "normal")
      doc.setFontSize(8.5)
      doc.setTextColor(...MUTED)
      doc.text(s[0], sx + 12, sy + 19)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(18)
      doc.setTextColor(...INK)
      doc.text(s[1], sx + 12, sy + 40)
    })
    y += Math.ceil(stats.length / cols) * (ch + gap) + 8

    const topLinks = bl.topBacklinks ?? []
    if (topLinks.length > 0) {
      ensure(50)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(11)
      doc.setTextColor(...INK)
      doc.text("Top Backlinks", margin, y)
      y += 4
      autoTable(doc, {
        startY: y + 6,
        head: [["Strength", "Referring Page", "Anchor Text"]],
        body: topLinks.map((b) => {
          const title = pdfText(b.pageTitle)
          const url = pdfText(b.urlFrom)
          const anchor = pdfText(b.anchor)
          return [
            String(b.domainStrength),
            title ? `${title}\n${url}` : url,
            anchor || "—",
          ]
        }),
        theme: "plain",
        margin: { left: margin, right: margin },
        styles: { fontSize: 9, cellPadding: { top: 6, bottom: 6, left: 4, right: 4 }, valign: "middle" },
        headStyles: { fontStyle: "bold", textColor: MUTED, fontSize: 8, lineWidth: { bottom: 0.5 }, lineColor: HAIR },
        bodyStyles: { textColor: INK, lineWidth: { bottom: 0.5 }, lineColor: HAIR },
        columnStyles: {
          0: { cellWidth: 56, halign: "center", fontStyle: "bold" },
          2: { cellWidth: 130, textColor: MUTED },
        },
      })
      y = afterTable(doc) + 16
    }
  }

  // ── Detailed results by category (pass/fail marks) ──
  // renderBacklinkSection() is invoked after the Links category group below
  // (mirrors the web report, where the Backlink Profile lives under Links).
  const checks = report.checks ?? []
  if (checks.length > 0) {
    for (const def of CATEGORY_SCORES_DEF) {
      if (hidden.has(sectionKeyForCategory(def.key))) continue
      const group = checks.filter((c) => c.category === def.key)
      if (group.length === 0) continue
      const grade =
        report.scoring?.categories?.[def.category as keyof typeof report.scoring.categories]?.grade ?? "—"

      ensure(56)
      // Section header
      doc.setDrawColor(...HAIR)
      doc.line(margin, y, pageW - margin, y)
      y += 18
      doc.setFont("helvetica", "bold")
      doc.setFontSize(13)
      doc.setTextColor(...INK)
      doc.text(`${def.label} Results`, margin, y)
      const ggc = gradeRGB(grade)
      doc.setTextColor(ggc[0], ggc[1], ggc[2])
      doc.setFontSize(13)
      doc.text(`Grade ${grade}`, pageW - margin, y, { align: "right" })
      y += 18

      for (const c of group) {
        renderCheck(doc, c, margin, contentW, () => y, (ny) => (y = ny), ensure)
      }
      // Backlink Profile sits inside the Links section (mirrors the web report).
      if (def.key === "LINKS" && !hidden.has(SECTION_BACKLINKS)) renderBacklinkSection()
      y += 10
    }
  } else {
    // Fallback: no per-check data — list passing checks.
    const passing = report.passingChecks ?? []
    if (passing.length > 0) {
      ensure(50)
      sectionTitle(doc, `What's working well (${passing.length})`, margin, y)
      y += 6
      autoTable(doc, {
        startY: y + 6,
        head: [["Passing check", "Category"]],
        body: passing.map((p) => [p.title, prettyCategory(p.category)]),
        theme: "striped",
        margin: { left: margin, right: margin },
        headStyles: { fillColor: [15, 157, 107], textColor: 255, fontStyle: "bold", fontSize: 10 },
        bodyStyles: { fontSize: 9.5, textColor: INK },
        columnStyles: { 1: { cellWidth: 110, textColor: MUTED } },
      })
      y = afterTable(doc) + 10
    }
  }

  // ── Footer on every page ──
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setDrawColor(...HAIR)
    doc.line(margin, pageH - 36, pageW - margin, pageH - 36)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(...FAINT)
    doc.text("Powered by Website Audit Tools", margin, pageH - 22)
    doc.text(`Page ${p} of ${pages}`, pageW - margin, pageH - 22, { align: "right" })
  }

  doc.save(`seo-audit-${host}.pdf`)
}

// ── rendering helpers ──

function renderCheck(
  doc: jsPDF,
  c: SEOAuditCheck,
  x: number,
  contentW: number,
  getY: () => number,
  setY: (n: number) => void,
  ensure: (n: number) => void,
) {
  const textW = contentW - 26 // leave room for the mark on the right
  const desc = (c.shortAnswer || c.answer || "").trim()
  doc.setFontSize(9)
  const descLines = desc ? doc.splitTextToSize(desc, textW) : []
  const needed = 16 + descLines.length * 12 + 8
  ensure(needed)
  let y = getY()

  // Title
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10.5)
  doc.setTextColor(...INK)
  doc.text(doc.splitTextToSize(c.name, textW), x, y)
  // Mark on the right (✓ pass / ✗ fail / – info)
  mark(doc, x + contentW - 12, y - 3, c.informational ? null : c.passed)
  y += 14

  // Description
  if (descLines.length) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text(descLines, x, y)
    y += descLines.length * 12
  }
  y += 8
  setY(y)
}

function mark(doc: jsPDF, x: number, y: number, state: boolean | null) {
  doc.setLineWidth(1.6)
  if (state === true) {
    doc.setDrawColor(15, 157, 107)
    doc.line(x - 9, y + 1, x - 5, y + 5)
    doc.line(x - 5, y + 5, x + 2, y - 4)
  } else if (state === false) {
    doc.setDrawColor(220, 38, 38)
    doc.line(x - 8, y - 4, x + 1, y + 5)
    doc.line(x + 1, y - 4, x - 8, y + 5)
  } else {
    doc.setDrawColor(...FAINT)
    doc.line(x - 8, y + 1, x + 1, y + 1)
  }
  doc.setLineWidth(0.2)
}

/** Draws a progress ring (faint track + colored arc) with the grade centered. */
function ring(
  doc: jsPDF,
  cx: number,
  cy: number,
  r: number,
  fraction: number,
  color: RGB,
  grade: string,
  gradeSize: number,
) {
  const lineW = r >= 30 ? 7 : 3.4
  doc.setLineCap("round")
  doc.setLineWidth(lineW)
  doc.setDrawColor(...HAIR)
  doc.circle(cx, cy, r, "S")
  if (fraction > 0) {
    drawArc(doc, cx, cy, r, -90, -90 + 360 * Math.min(1, fraction), color, lineW)
  }
  doc.setLineCap("butt")
  doc.setLineWidth(0.2)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(gradeSize)
  doc.setTextColor(...color)
  doc.text(grade, cx, cy + gradeSize * 0.35, { align: "center" })
}

function drawArc(doc: jsPDF, cx: number, cy: number, r: number, a0: number, a1: number, color: RGB, w: number) {
  doc.setLineWidth(w)
  doc.setDrawColor(...color)
  const steps = Math.max(2, Math.round(Math.abs(a1 - a0) / 6))
  let prev: { x: number; y: number } | null = null
  for (let i = 0; i <= steps; i++) {
    const a = ((a0 + (a1 - a0) * (i / steps)) * Math.PI) / 180
    const x = cx + r * Math.cos(a)
    const yy = cy + r * Math.sin(a)
    if (prev) doc.line(prev.x, prev.y, x, yy)
    prev = { x, y: yy }
  }
}

function pct(score: number | null | undefined, grade: string): number {
  // A+ always reads as a full ring (top grade), regardless of the raw score.
  if ((grade ?? "").toUpperCase() === "A+") return 1
  if (typeof score === "number" && isFinite(score)) return Math.max(0, Math.min(100, score)) / 100
  return (
    { A: 0.95, B: 0.85, "C+": 0.72, C: 0.65, D: 0.5, F: 0.3 }[(grade ?? "").toUpperCase()] ?? 0.3
  )
}

function tint(c: RGB): RGB {
  return [
    Math.round(c[0] + (255 - c[0]) * 0.85),
    Math.round(c[1] + (255 - c[1]) * 0.85),
    Math.round(c[2] + (255 - c[2]) * 0.85),
  ]
}

function pillRow(
  doc: jsPDF,
  pills: { label: string; fill: RGB; text: RGB }[],
  centerX: number,
  y: number,
) {
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8.5)
  const gap = 6
  const padX = 9
  const h = 17
  const widths = pills.map((p) => doc.getTextWidth(p.label) + padX * 2)
  const total = widths.reduce((a, b) => a + b, 0) + gap * (pills.length - 1)
  let x = centerX - total / 2
  pills.forEach((p, i) => {
    const w = widths[i]
    doc.setFillColor(...p.fill)
    doc.roundedRect(x, y - h + 4, w, h, h / 2, h / 2, "F")
    doc.setTextColor(...p.text)
    doc.text(p.label, x + w / 2, y, { align: "center" })
    x += w + gap
  })
}

function sectionTitle(doc: jsPDF, text: string, x: number, y: number) {
  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.setTextColor(...INK)
  doc.text(text, x, y)
}

function bodyText(doc: jsPDF, text: string, x: number, y: number) {
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.setTextColor(...MUTED)
  doc.text(text, x, y)
}

function paragraph(doc: jsPDF, text: string, x: number, y: number, maxW: number, lineH: number): number {
  const lines = doc.splitTextToSize(text, maxW)
  doc.text(lines, x, y)
  return y + lines.length * lineH
}

function afterTable(doc: jsPDF): number {
  // @ts-expect-error lastAutoTable is attached by the plugin at runtime
  return doc.lastAutoTable?.finalY ?? 0
}

async function loadScreenshot(report: AuditReport): Promise<string | null> {
  let base64 = report.screenshots?.desktop ?? null
  if (!base64) {
    try {
      const data = await prefetchScreenshot(report.url, report.id)
      base64 = data.desktop ?? data.mobile ?? null
    } catch {
      base64 = null
    }
  }
  return base64 ? `data:image/jpeg;base64,${base64}` : null
}

function gradeTagline(grade: string): string {
  const g = (grade ?? "").toUpperCase()
  if (g === "A+" || g === "A") return "Your page is doing great"
  if (g === "B") return "Your page is doing well"
  if (g === "C+" || g === "C") return "Your page could be better"
  return "Your page needs improvement"
}

function sevOrder(sev: string): number {
  return { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 }[sev] ?? 5
}

function prettyCategory(key: string): string {
  return (
    CATEGORY_SCORES_DEF.find((d) => d.key === key)?.label ??
    key.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
  )
}
