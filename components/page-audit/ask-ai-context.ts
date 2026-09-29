/**
 * What the Audit Assistant is told about a report.
 *
 * The backend reads the first 24,000 characters of this and silently drops the
 * rest (MAX_CONTEXT_CHARS in auditAsk.service.ts). The panel used to send the
 * whole report as JSON with the issue list first, so on a site audit the issue
 * rows spent the budget and the checks, internal links and backlinks never
 * reached the model — people paid a credit to be told "that isn't in the audit".
 *
 * So it is written summary-first, as compact text: scores, failing checks, the
 * internal-link and backlink summaries, then issues grouped by type. The early
 * sections each get a slice of the budget so none of them crowds out the rest,
 * and the whole is trimmed here rather than by the server's blind cut.
 *
 * A plain module rather than part of the panel: the panel's imports only load
 * inside Next, and this needs a unit test (ask-ai-context.test.ts).
 */

import type { AuditReport, Issue } from "@/components/page-audit/audit-ui"

/** Mirrors MAX_CONTEXT_CHARS in the backend's auditAsk.service.ts. */
export const ASK_CONTEXT_MAX_CHARS = 24_000

/** One problem across the site: a row of /issue-groups, or the same built here. */
export type AskIssueGroup = {
  type: string
  title: string
  description: string
  category: string
  severity: string
  affectedPages: number
}

/** The most each early section may take, so a long one can't starve the rest. */
const BUDGET = { checks: 7_000, links: 2_500, backlinks: 2_000 }

/**
 * Category labels as the report shows them, by scoring field and by key.
 *
 * Not imported from audit-ui: that module renders the panel that calls this,
 * so the import would be circular — and it would drag d3 into the unit test.
 */
const CATEGORIES = [
  ["onPage", "ON_PAGE", "On-Page SEO"],
  ["technical", "TECHNICAL", "Technical"],
  ["links", "LINKS", "Links"],
  ["security", "SECURITY", "Security"],
  ["performance", "PERFORMANCE", "Performance"],
  ["accessibility", "ACCESSIBILITY", "Accessibility"],
  ["structuredData", "STRUCTURED_DATA", "Structured Data"],
] as const

const LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map(([, key, label]) => [key, label]))

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 }

/** One value on one line, capped — a single long field must not eat a section. */
function clip(value: unknown, max: number): string {
  const s = String(value ?? "").replace(/\s+/g, " ").trim()
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

/** A heading and as many of its lines as fit in `budget`, saying how many didn't. */
function section(title: string, lines: string[], budget: number): string {
  let text = title
  for (let i = 0; i < lines.length; i++) {
    const next = `${text}\n${lines[i]}`
    // The 30 keeps room for the note.
    if (next.length > budget - 30) return `${text}\n(${lines.length - i} more not shown)`
    text = next
  }
  return text
}

/** Issue rows rolled up by type, the way /issue-groups does it on the server. */
function groupIssues(issues: Issue[]): AskIssueGroup[] {
  const byType = new Map<string, { group: AskIssueGroup; pages: Set<string> }>()
  for (const i of issues) {
    let entry = byType.get(i.type)
    if (!entry) {
      const { type, title, description, category, severity } = i
      entry = { group: { type, title, description, category, severity, affectedPages: 0 }, pages: new Set() }
      byType.set(i.type, entry)
    }
    if (i.pageUrl) entry.pages.add(i.pageUrl)
    // A type's worst row decides where it ranks.
    if ((SEVERITY_RANK[i.severity] ?? 9) < (SEVERITY_RANK[entry.group.severity] ?? 9)) {
      entry.group.severity = i.severity
    }
  }
  return [...byType.values()].map(({ group, pages }) => ({ ...group, affectedPages: pages.size }))
}

/**
 * The context for one question, at most ASK_CONTEXT_MAX_CHARS long.
 *
 * `siteGroups` is the server's per-problem rollup, passed when the report's own
 * issue list is capped: counting the capped rows would put a problem found on
 * 400 pages at a dozen.
 */
export function buildAskContext(report: AuditReport, siteGroups?: AskIssueGroup[] | null): string {
  const site = report.mode === "SITE"
  const checks = report.checks ?? []
  const issues = report.issues ?? []
  const totalIssues = report.totals?.issues ?? issues.length

  // Inside one site a path says as much as the full URL, in a third the space.
  let origin = ""
  try {
    origin = new URL(report.url).origin
  } catch {
    /* not a URL — keep links whole */
  }
  const short = (raw: string) => {
    try {
      const u = new URL(raw)
      return u.origin === origin ? `${u.pathname}${u.search}` : raw
    } catch {
      return raw
    }
  }
  const score = (c?: { score?: number | null; grade?: string | null } | null) =>
    c?.score != null ? `${Math.round(c.score)}/100 (${c.grade ?? "no grade"})` : "not scored"
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

  // ── Summary ──
  const summary = [
    `${site ? "Whole-site audit" : "Single-page audit"} of ${report.url} (${plural(report.pagesAnalyzed ?? 0, "page")} analysed).`,
  ]
  if (report.pagesFailed) {
    summary.push(`Pages found but not loaded, so missing from these results: ${report.pagesFailed}.`)
  }
  if (report.crawlNote) summary.push(`Crawl note: ${clip(report.crawlNote, 400)}`)
  summary.push(`Overall score: ${score(report.scoring?.overall)}.`)
  summary.push(
    `Category scores: ${CATEGORIES.map(([key, , label]) =>
      key === "performance" && report.pageSpeedStatus === "pending"
        ? `${label} still being measured (no score yet)`
        : `${label} ${score(report.scoring?.categories?.[key])}`,
    ).join("; ")}.`,
  )
  summary.push(`Issues found: ${totalIssues}.`)
  const parts = [summary.join("\n")]

  // ── Failing checks ──
  if (checks.length) {
    const failing = checks
      .filter((c) => c.passed === false)
      .sort((a, b) => (a.priority ?? 3) - (b.priority ?? 3))
      .map((c) => {
        const line = [`- ${c.name} (${LABEL[c.category] ?? c.category}): ${clip(c.shortAnswer || c.answer, 220)}`]
        const value = clip(c.value, 120)
        if (value) line.push(`Value: ${value}`)
        const fix = clip(c.recommendation || c.how, 220)
        if (fix) line.push(`Fix: ${fix}`)
        return line.join(" | ")
      })
    parts.push(
      section(
        `FAILING CHECKS (${failing.length} of ${checks.length})`,
        failing.length ? failing : ["None: every check passed."],
        BUDGET.checks,
      ),
    )
  }

  // ── Internal links ──
  const graph = report.linkGraph
  const meta = graph?.metadata
  const links = meta
    ? [
        `${meta.totalPages} pages in the link graph, ${meta.totalLinks} internal links, ${Math.round(meta.averageLinksPerPage * 10) / 10} links per page on average, deepest page ${meta.maxDepth} clicks from the start.`,
        `Orphan pages (nothing links to them): ${meta.orphanPages}${graph?.orphanData?.confidence ? ` (${graph.orphanData.confidence} confidence)` : ""}. Hub pages: ${meta.hubPages}. Authority pages: ${meta.authorityPages}.`,
      ]
    : ["Not collected for this audit, so there is no internal-link data to answer from."]
  if (meta?.topLinkedPages?.length) {
    links.push(
      `Most-linked pages: ${meta.topLinkedPages
        .slice(0, 10)
        .map((p) => `${short(p.url)} (${p.inboundLinks} inbound)`)
        .join(", ")}.`,
    )
  }
  const orphans = graph?.orphanData?.graphOrphans ?? []
  if (orphans.length) {
    links.push(
      `Orphan URLs: ${orphans.slice(0, 25).map(short).join(", ")}${orphans.length > 25 ? `, and ${orphans.length - 25} more` : ""}.`,
    )
  }
  parts.push(section("INTERNAL LINKS", links, BUDGET.links))

  // ── Backlinks ──
  const b = report.backlinks
  const backlinks = b
    ? [
        `${b.target}: domain rank ${b.rank} (0–1000); ${b.backlinks} backlinks from ${b.referringDomains} referring domains on ${b.referringIps} IPs; ${b.dofollow} dofollow, ${b.nofollow} nofollow; ${b.brokenBacklinks} broken.${b.firstSeen ? ` First seen ${b.firstSeen.slice(0, 10)}.` : ""}`,
        ...(b.topBacklinks ?? [])
          .slice(0, 10)
          .map(
            (l) =>
              `- Strength ${l.domainStrength}: ${clip(l.urlFrom, 120)}, anchor "${clip(l.anchor, 60)}"${l.dofollow ? "" : " (nofollow)"}`,
          ),
      ]
    : ["Not collected for this audit, so there is no backlink data to answer from."]
  parts.push(section("BACKLINKS (informational, not part of the score)", backlinks, BUDGET.backlinks))

  // ── Issues by type: whatever the budget has left ──
  const groups = [...(siteGroups?.length ? siteGroups : groupIssues(issues))].sort(
    (a, b) =>
      (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) || b.affectedPages - a.affectedPages,
  )
  const examples = new Map<string, string[]>()
  for (const i of issues) {
    if (!i.pageUrl) continue
    const list = examples.get(i.type) ?? []
    if (list.length < 3 && !list.includes(i.pageUrl)) list.push(i.pageUrl)
    examples.set(i.type, list)
  }
  const issueLines = groups.map((g) => {
    // Reach only means something on a crawl; on one page every row is "1 page".
    const reach = !site ? "" : g.affectedPages > 0 ? ` — ${plural(g.affectedPages, "page")}` : " — site-wide"
    const eg = site ? (examples.get(g.type) ?? []).map(short) : []
    return `- [${g.severity}] ${clip(g.title, 100)} (${LABEL[g.category] ?? g.category})${reach}${eg.length ? `, e.g. ${eg.join(", ")}` : ""}: ${clip(g.description, 160)}`
  })
  const partial = !siteGroups?.length && totalIssues > issues.length
  let text = parts.join("\n\n")
  text += `\n\n${section(
    `ISSUES BY TYPE (${groups.length} problems, ${totalIssues} issues in all${partial ? `; page counts cover only the ${issues.length} highest-priority issues` : ""})`,
    issueLines,
    ASK_CONTEXT_MAX_CHARS - text.length - 2,
  )}`

  // ── Everything else that was checked, if there's room ──
  const others = checks.length
    ? checks
        .filter((c) => c.passed !== false)
        .map((c) => `- ${c.name}: ${c.passed ? "passed" : "for information"}${c.shortAnswer ? `, ${clip(c.shortAnswer, 100)}` : ""}`)
    : (report.passingChecks ?? []).map((p) => `- ${p.title}: passed`)
  const room = ASK_CONTEXT_MAX_CHARS - text.length - 2
  if (others.length && room > 200) text += `\n\n${section("OTHER CHECKS", others, room)}`

  return text.slice(0, ASK_CONTEXT_MAX_CHARS)
}
