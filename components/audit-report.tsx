"use client"

import { useEffect, useState } from "react"
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

// Shorter labels for the radar chart, where the full names collide at small
// sizes — the ring row below still uses the full CATEGORY_LABELS.
const CATEGORY_LABELS_SHORT: Record<ScoringCategoryKey, string> = {
  technical: "Technical",
  onPage: "On-Page",
  performance: "Performance",
  accessibility: "Accessibility",
  links: "Links",
  structuredData: "Structured",
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
const SECTION_ICONS: Record<string, keyof typeof Icon> = {
  seo: "search",
  performance: "zap",
  ui: "monitor",
  links: "external",
  technology: "settings",
  social: "users",
  geo: "globe",
}
const SECTION_ORDER = ["seo", "performance", "ui", "links", "technology", "social", "geo"]

// Most-to-least severe, so the issues list surfaces what needs attention first.
const SEVERITY_ORDER: Record<AuditIssue["severity"], number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
}

function scoreVar(v: number): string {
  if (v >= 80) return "var(--pos)"
  if (v >= 60) return "var(--brand)"
  return "var(--neg)"
}

// AuditIssue.category is a raw backend string (e.g. "structuredData") that
// doesn't always match a ScoringCategoryKey — fall back to a title-cased
// split of the camelCase string so unknown categories still read cleanly.
function formatCategoryLabel(cat: string): string {
  const known = CATEGORY_LABELS[cat as ScoringCategoryKey]
  if (known) return known
  const spaced = cat.replace(/([a-z])([A-Z])/g, "$1 $2")
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

// Maps the existing CRITICAL..INFO severity onto the High/Medium/Low priority
// framing used for the recommendations list — same data, friendlier label.
function priorityStyle(sev: AuditIssue["severity"]): { color: string; bg: string; label: string } {
  switch (sev) {
    case "CRITICAL":
    case "HIGH":
      return { color: "var(--neg)", bg: "var(--neg-soft)", label: "High Priority" }
    case "MEDIUM":
      return { color: "var(--warn)", bg: "var(--warn-soft)", label: "Medium Priority" }
    default:
      return { color: "var(--pos)", bg: "var(--pos-soft)", label: "Low Priority" }
  }
}

// Small ring gauge showing a category's letter grade — fills in on mount.
function CategoryRing({ label, score, grade, size = 84, stroke = 7 }: { label: string; score: number; grade: string; size?: number; stroke?: number }) {
  const color = scoreVar(score)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const [pct, setPct] = useState(0)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setPct(score))
    return () => cancelAnimationFrame(raf)
  }, [score])
  const offset = c - (Math.max(0, Math.min(100, pct)) / 100) * c
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: size + 10 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-inset)" strokeWidth={stroke} />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={color} strokeWidth={stroke}
            strokeDasharray={c} strokeDashoffset={offset}
            strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dashoffset .8s cubic-bezier(.16,1,.3,1)" }}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
          <span style={{ fontSize: 17, fontWeight: 700, color }}>{grade}</span>
        </div>
      </div>
      <span className="tiny muted" style={{ textAlign: "center" }}>{label}</span>
    </div>
  )
}

// Lightweight custom SVG radar chart (no charting dependency) — one axis per
// scoring category, plotting the same 0-100 scores the rings show.
function RadarChart({ data, size = 220 }: { data: { label: string; score: number }[]; size?: number }) {
  const n = data.length
  const [frac, setFrac] = useState(0)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setFrac(1))
    return () => cancelAnimationFrame(raf)
  }, [])
  if (n < 3) return null
  const cx = size / 2
  const cy = size / 2
  const R = size / 2 - 30
  const angleFor = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2
  const pointFor = (i: number, r: number) => {
    const a = angleFor(i)
    return [cx + R * r * Math.cos(a), cy + R * r * Math.sin(a)] as const
  }
  const dataPoints = data.map((d, i) => pointFor(i, (Math.max(0, Math.min(100, d.score)) / 100) * frac))
  const dataPath = dataPoints.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ") + " Z"
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {[0.25, 0.5, 0.75, 1].map((lvl, li) => {
        const pts = data.map((_, i) => pointFor(i, lvl))
        const path = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ") + " Z"
        return <path key={li} d={path} fill="none" stroke="var(--border)" strokeWidth="1" />
      })}
      {data.map((_, i) => {
        const p = pointFor(i, 1)
        return <line key={i} x1={cx} y1={cy} x2={p[0]} y2={p[1]} stroke="var(--border)" strokeWidth="1" />
      })}
      <path d={dataPath} fill="var(--brand)" fillOpacity="0.18" stroke="var(--brand)" strokeWidth="2" strokeLinejoin="round" style={{ transition: "d .8s cubic-bezier(.16,1,.3,1)" }} />
      {dataPoints.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="var(--brand)" />)}
      {data.map((d, i) => {
        const p = pointFor(i, 1.2)
        return (
          <text key={i} x={p[0]} y={p[1]} fontSize="9.5" fill="var(--text-mute)" textAnchor="middle" dominantBaseline="middle">
            {d.label}
          </text>
        )
      })}
    </svg>
  )
}

function CheckRow({ check }: { check: AuditCheck }) {
  const [open, setOpen] = useState(false)
  const failed = check.passed === false
  const na = check.passed === null
  const markColor = na ? "var(--text-mute)" : failed ? "var(--neg)" : "var(--pos)"
  const mark = na ? <Icon.dash /> : failed ? <Icon.close /> : <Icon.check />

  const description = check.answer || check.shortAnswer
  const hasFix = !!(check.recommendation || check.why || check.how)

  return (
    <div
      className="oa-row-hover"
      style={{ display: "flex", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--border)", borderLeft: `3px solid ${failed ? "var(--neg)" : "transparent"}`, background: failed ? "var(--neg-soft)" : "transparent" }}
    >
      <span
        style={{
          width: 22, height: 22, borderRadius: "50%", flexShrink: 0, marginTop: 1,
          background: `color-mix(in srgb, ${markColor} 16%, transparent)`, color: markColor,
          display: "grid", placeItems: "center",
        }}
      >
        {mark}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="b" style={{ fontSize: 13.5 }}>{check.name}</div>
        {description && <div className="tiny muted" style={{ marginTop: 3, lineHeight: 1.5 }}>{description}</div>}
        {hasFix && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="tiny b"
            style={{ marginTop: 6, color: "var(--brand)", background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            How to fix
            <span style={{ display: "inline-flex", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}><Icon.chevR /></span>
          </button>
        )}
        {open && hasFix && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
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
      <span className="tiny muted tabular" style={{ flexShrink: 0 }}>{check.score}/{check.maxScore}</span>
    </div>
  )
}

function Section({
  id,
  icon,
  title,
  count,
  failedCount,
  defaultOpen,
  children,
}: {
  id: string
  icon?: keyof typeof Icon
  title: string
  count: number
  failedCount?: number
  defaultOpen: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const IconCmp = icon ? Icon[icon] : null
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 12 }} data-section={id}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="oa-section-btn"
        style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, padding: "14px 16px", border: "none", background: "transparent", cursor: "pointer" }}
      >
        {IconCmp && <span style={{ color: "var(--text-mute)", flexShrink: 0 }}><IconCmp /></span>}
        <span className="b" style={{ fontSize: 13, flex: 1, textAlign: "left", textTransform: "uppercase", letterSpacing: "0.04em" }}>{title}</span>
        {failedCount ? <span className="chip neg">{failedCount} to fix</span> : null}
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
  const issues = [...(report.issues ?? [])].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
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

  const categoryEntries = Object.entries(categories) as [ScoringCategoryKey, { score: number; grade: string; tier: string }][]

  return (
    <div>
      {/* Category overview — ring per category + a radar summarizing all of them */}
      {categoryEntries.length > 0 && (
        <div className="card oa-hero oa-fade-up" style={{ marginBottom: 16 }}>
          <div className="grid g-21" style={{ gap: 20, alignItems: "center" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 22 }}>
              {categoryEntries.map(([key, val]) => (
                <CategoryRing key={key} label={CATEGORY_LABELS[key] ?? key} score={val.score} grade={val.grade} />
              ))}
            </div>
            {categoryEntries.length >= 3 && (
              <div style={{ display: "flex", justifyContent: "center" }}>
                <RadarChart data={categoryEntries.map(([key, val]) => ({ label: CATEGORY_LABELS_SHORT[key] ?? key, score: val.score }))} />
              </div>
            )}
          </div>
          {report.completedAt && (
            <div className="tiny muted" style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
              Generated {new Date(report.completedAt).toLocaleString("en-US", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}
            </div>
          )}
        </div>
      )}

      {/* Recommendations, most severe first — always expanded since it's the
          highest-priority section of the report. */}
      {issues.length > 0 && (
        <div className="card oa-fade-up d1" style={{ padding: 0, overflow: "hidden", marginBottom: 12 }}>
          <div style={{ padding: "16px 16px 12px" }}>
            <div className="b" style={{ fontSize: 14 }}>Recommendations</div>
            <div className="tiny muted" style={{ marginTop: 2 }}>{issues.length} issue{issues.length === 1 ? "" : "s"} to fix, ordered by priority.</div>
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {issues.map((iss) => {
              const p = priorityStyle(iss.severity)
              return (
                <li key={iss.id} className="oa-row-hover" style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="b" style={{ fontSize: 13, display: "block" }}>{iss.title}</span>
                    {iss.description && <span className="tiny muted">{iss.description}</span>}
                  </span>
                  <span className="tiny" style={{ color: "var(--brand)", flexShrink: 0, width: 110, textAlign: "right" }}>{formatCategoryLabel(iss.category)}</span>
                  <span className="chip" style={{ flexShrink: 0, width: 112, justifyContent: "center", color: p.color, background: p.bg, borderColor: "transparent" }}>{p.label}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Checks grouped by section */}
      {sectionKeys.map((key) => {
        const list = bySection.get(key)!
        const failedCount = list.filter((c) => c.passed === false).length
        return (
          <Section key={key} id={key} icon={SECTION_ICONS[key]} title={SECTION_LABELS[key] ?? key} count={list.length} failedCount={failedCount} defaultOpen={failedCount > 0}>
            {list.map((c) => <CheckRow key={c.id} check={c} />)}
          </Section>
        )
      })}

      {/* Passing checks */}
      {passing.length > 0 && (
        <Section id="passing" icon="check" title="Passing checks" count={passing.length} defaultOpen={false}>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {passing.map((p) => (
              <li key={p.code} className="oa-row-hover" style={{ display: "flex", gap: 12, padding: "10px 16px", borderBottom: "1px solid var(--border)", alignItems: "flex-start" }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, marginTop: 1, background: "color-mix(in srgb, var(--pos) 16%, transparent)", color: "var(--pos)", display: "grid", placeItems: "center" }}>
                  <Icon.check />
                </span>
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
        <Section id="pages" icon="globe" title="Pages analyzed" count={pages.length} defaultOpen={false}>
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
