"use client"

import { useState } from "react"
import { Icon } from "@/components/dashboard/icons"
import type {
  AuditReport as AuditReportType,
  AuditCheck,
  AuditIssue,
  ScoringCategoryKey,
} from "@/types/onpage-audit"

// Presentational renderer for the external audit `report` blob. Mirrors the
// collapsible-section pattern of single-page-report.tsx but reads the audit
// report shape (scoring / checks / issues / passingChecks / pages). Uses the
// dashboard CSS-variable design system to match the results page ScoreCard.

const CATEGORY_LABELS: Record<ScoringCategoryKey, string> = {
  technical: "Technical",
  onPage: "On-Page",
  performance: "Performance",
  accessibility: "Accessibility",
  links: "Links",
  structuredData: "Structured Data",
  security: "Security",
}

// Order + labels for grouping checks by their `section` field.
const SECTION_LABELS: Record<string, string> = {
  seo: "SEO",
  performance: "Performance",
  ui: "UI / UX",
  links: "Links",
  technology: "Technology",
  social: "Social",
  geo: "Geo / Local",
}
const SECTION_ORDER = ["seo", "performance", "ui", "links", "technology", "social", "geo"]

function scoreVar(v: number): string {
  if (v >= 80) return "var(--pos)"
  if (v >= 60) return "var(--warn)"
  return "var(--neg)"
}

function severityStyle(sev: AuditIssue["severity"]): { color: string; bg: string } {
  switch (sev) {
    case "CRITICAL":
    case "HIGH":
      return { color: "var(--neg)", bg: "var(--neg-soft)" }
    case "MEDIUM":
      return { color: "var(--warn)", bg: "var(--warn-soft)" }
    default:
      return { color: "var(--text-mute)", bg: "var(--bg-inset)" }
  }
}

function CategoryScore({ label, score, grade, tier }: { label: string; score: number; grade: string; tier: string }) {
  return (
    <div className="stat">
      <div className="lbl">{label}</div>
      <div className="val tabular" style={{ color: scoreVar(score) }}>{score}</div>
      <div style={{ height: 5, borderRadius: 999, background: "var(--bg-inset)", overflow: "hidden", marginTop: 6 }}>
        <div style={{ height: "100%", width: `${score}%`, background: scoreVar(score), borderRadius: 999 }} />
      </div>
      <span className="tiny muted" style={{ marginTop: 4, display: "block" }}>{grade} · {tier}</span>
    </div>
  )
}

function CheckRow({ check }: { check: AuditCheck }) {
  const [open, setOpen] = useState(false)
  const failed = check.passed === false
  const na = check.passed === null
  const mark = na
    ? <span style={{ color: "var(--text-mute)" }}><Icon.dash /></span>
    : failed
      ? <span style={{ color: "var(--neg)" }}><Icon.close /></span>
      : <span style={{ color: "var(--pos)" }}><Icon.check /></span>

  const hasDetail = !!(check.recommendation || check.what || check.why || check.how)

  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <button
        type="button"
        onClick={() => hasDetail && setOpen((o) => !o)}
        style={{ display: "flex", width: "100%", alignItems: "flex-start", gap: 10, padding: "10px 14px", border: "none", background: "transparent", textAlign: "left", cursor: hasDetail ? "pointer" : "default" }}
      >
        <span style={{ flexShrink: 0, marginTop: 1 }}>{mark}</span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span className="b" style={{ fontSize: 13, display: "block" }}>{check.name}</span>
          {check.shortAnswer && <span className="tiny muted">{check.shortAnswer}</span>}
        </span>
        <span className="tiny muted tabular" style={{ flexShrink: 0 }}>{check.score}/{check.maxScore}</span>
        {hasDetail && (
          <span style={{ flexShrink: 0, color: "var(--text-mute)", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>
            <Icon.chevR />
          </span>
        )}
      </button>

      {open && hasDetail && (
        <div style={{ padding: "0 14px 12px 34px", display: "flex", flexDirection: "column", gap: 8 }}>
          {check.answer && <div className="tiny" style={{ color: "var(--text)" }}>{check.answer}</div>}
          {check.recommendation && (
            <div className="tiny" style={{ padding: "8px 10px", borderRadius: "var(--r-md)", background: "var(--warn-soft)", color: "var(--warn)" }}>
              <b>Fix:</b> {check.recommendation}{check.time ? ` · ~${check.time}` : ""}
            </div>
          )}
          {check.why && <div className="tiny muted"><b>Why it matters:</b> {check.why}</div>}
          {check.how && <div className="tiny muted"><b>How:</b> {check.how}</div>}
        </div>
      )}
    </div>
  )
}

function Section({ id, title, count, defaultOpen, children }: { id: string; title: string; count: number; defaultOpen: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 12 }} data-section={id}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, padding: "14px 16px", border: "none", background: "transparent", cursor: "pointer" }}
      >
        <span className="b" style={{ fontSize: 13, flex: 1, textAlign: "left", textTransform: "uppercase", letterSpacing: "0.04em" }}>{title}</span>
        <span className="tiny muted tabular">{count}</span>
        <span style={{ color: "var(--text-mute)", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}><Icon.chevR /></span>
      </button>
      {open && <div style={{ borderTop: "1px solid var(--border)" }}>{children}</div>}
    </div>
  )
}

export function AuditReport({ report }: { report: AuditReportType }) {
  const categories = report.scoring?.categories ?? {}
  const checks = report.checks ?? []
  const issues = report.issues ?? []
  const passing = report.passingChecks ?? []
  const pages = report.pages ?? []

  // Group checks by section, preserving the canonical order then any extras.
  const bySection = new Map<string, AuditCheck[]>()
  for (const c of checks) {
    const arr = bySection.get(c.section) ?? []
    arr.push(c)
    bySection.set(c.section, arr)
  }
  const sectionKeys = [
    ...SECTION_ORDER.filter((k) => bySection.has(k)),
    ...[...bySection.keys()].filter((k) => !SECTION_ORDER.includes(k)),
  ]

  return (
    <div>
      {/* Category scores */}
      {Object.keys(categories).length > 0 && (
        <div className="grid g-4" style={{ marginBottom: 16 }}>
          {(Object.entries(categories) as [ScoringCategoryKey, { score: number; grade: string; tier: string }][])
            .map(([key, val]) => (
              <CategoryScore key={key} label={CATEGORY_LABELS[key] ?? key} score={val.score} grade={val.grade} tier={val.tier} />
            ))}
        </div>
      )}

      {/* Issues */}
      {issues.length > 0 && (
        <Section id="issues" title="Issues found" count={issues.length} defaultOpen>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {issues.map((iss) => {
              const s = severityStyle(iss.severity)
              return (
                <li key={iss.id} style={{ display: "flex", gap: 10, padding: "12px 14px", borderBottom: "1px solid var(--border)", alignItems: "flex-start" }}>
                  <span className="chip" style={{ flexShrink: 0, color: s.color, background: s.bg, borderColor: "transparent" }}>{iss.severity}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="b" style={{ fontSize: 13, display: "block" }}>{iss.title}</span>
                    <span className="tiny muted">{iss.description}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </Section>
      )}

      {/* Checks grouped by section */}
      {sectionKeys.map((key) => {
        const list = bySection.get(key)!
        const hasFail = list.some((c) => c.passed === false)
        return (
          <Section key={key} id={key} title={SECTION_LABELS[key] ?? key} count={list.length} defaultOpen={hasFail}>
            {list.map((c) => <CheckRow key={c.id} check={c} />)}
          </Section>
        )
      })}

      {/* Passing checks */}
      {passing.length > 0 && (
        <Section id="passing" title="Passing checks" count={passing.length} defaultOpen={false}>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {passing.map((p) => (
              <li key={p.code} style={{ display: "flex", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--border)", alignItems: "flex-start" }}>
                <span style={{ color: "var(--pos)", flexShrink: 0, marginTop: 1 }}><Icon.check /></span>
                <span style={{ minWidth: 0 }}>
                  <span className="b" style={{ fontSize: 13, display: "block" }}>{p.title}</span>
                  <span className="tiny muted">{p.description}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Per-page metrics (only when the crawl covered more than one page) */}
      {pages.length > 1 && (
        <Section id="pages" title="Pages analyzed" count={pages.length} defaultOpen={false}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-mute)" }}>
                  <th style={{ padding: "8px 14px" }}>URL</th>
                  <th style={{ padding: "8px 14px" }}>Status</th>
                  <th style={{ padding: "8px 14px" }}>Words</th>
                  <th style={{ padding: "8px 14px" }}>Links</th>
                  <th style={{ padding: "8px 14px" }}>Images</th>
                  <th style={{ padding: "8px 14px" }}>H1</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((p) => (
                  <tr key={p.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="mono" style={{ padding: "8px 14px", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.url}</td>
                    <td className="tabular" style={{ padding: "8px 14px" }}>{p.statusCode}</td>
                    <td className="tabular" style={{ padding: "8px 14px" }}>{p.wordCount}</td>
                    <td className="tabular" style={{ padding: "8px 14px" }}>{p.linkCount}</td>
                    <td className="tabular" style={{ padding: "8px 14px" }}>{p.imageCount}</td>
                    <td className="tabular" style={{ padding: "8px 14px" }}>{p.h1Count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  )
}
