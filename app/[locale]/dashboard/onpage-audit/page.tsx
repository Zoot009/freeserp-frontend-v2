"use client"

import { useEffect, useState } from "react"
import { useRouter } from "@/i18n/navigation"
import { api, ApiError } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"
import { Favicon } from "@/components/favicon"
import { displayDomain } from "@/lib/utils"

// A saved audit as returned by GET /api/on-page-audit (list shape — no report blob).
type AuditListItem = {
  id: string
  url: string
  domain: string | null
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"
  error: string | null
  overallScore: number | null
  onPageScore: number | null
  grade: string | null
  createdAt: string
  completedAt: string | null
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })

function StatusChip({ status }: { status: AuditListItem["status"] }) {
  const map: Record<AuditListItem["status"], { cls: string; label: string }> = {
    COMPLETED: { cls: "chip pos", label: "Ready" },
    FAILED: { cls: "chip neg", label: "Failed" },
    PROCESSING: { cls: "chip warn", label: "Auditing" },
    PENDING: { cls: "chip outline", label: "Queued" },
  }
  const { cls, label } = map[status]
  return <span className={cls}>{label}</span>
}

// Matches the pos/warn/neg score bands used across the dashboard (score cards,
// bars, etc.) so a saved audit's score badge reads consistently everywhere.
function scoreTone(v: number): { color: string; bg: string } {
  if (v >= 80) return { color: "var(--pos)", bg: "var(--pos-soft)" }
  if (v >= 60) return { color: "var(--brand)", bg: "var(--brand-soft)" }
  return { color: "var(--neg)", bg: "var(--neg-soft)" }
}

function ScoreBadge({ value }: { value: number | null }) {
  if (value == null) {
    return <span className="tiny muted" style={{ width: 36, textAlign: "center", flexShrink: 0 }}>—</span>
  }
  const tone = scoreTone(value)
  return (
    <span
      className="tabular"
      title={`Overall score: ${value}/100`}
      style={{
        display: "inline-grid",
        placeItems: "center",
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: `linear-gradient(135deg, ${tone.bg}, transparent)`,
        border: `1.5px solid color-mix(in srgb, ${tone.color} 55%, transparent)`,
        color: tone.color,
        fontSize: 13,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {value}
    </span>
  )
}

export default function OnPageAuditPage() {
  const router = useRouter()
  const [url, setUrl] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [history, setHistory] = useState<AuditListItem[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await api.get<{ audits: AuditListItem[] }>("/api/on-page-audit")
        if (!cancelled) setHistory(data.audits ?? [])
      } catch {
        /* history is non-critical — leave it empty */
      } finally {
        if (!cancelled) setLoadingHistory(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const canSubmit = url.trim().length > 0 && !submitting

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const trimmedUrl = url.trim()
    if (!trimmedUrl) {
      setError("A website URL is required.")
      return
    }
    // Prepend https:// when the user omits the scheme so the backend URL check passes.
    const normalizedUrl = /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`
    setSubmitting(true)
    try {
      const res = await api.post<{ audit: { id: string; status: string } }>(
        "/api/on-page-audit",
        { url: normalizedUrl },
      )
      router.push(`/dashboard/onpage-audit/results?id=${res.audit.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start audit. Please try again.")
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <div className="halo">
        <div className="page-h" style={{ marginBottom: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow"><span className="spark"><Icon.monitor /></span> On-Page Audit</div>
            <h1>Audit your website</h1>
            <div className="sub">Run a full on-page SEO audit of any page — overall score, technical, on-page &amp; performance checks, and prioritized fixes.</div>
          </div>
        </div>
      </div>

      {/* Create form */}
      <form className="card oa-fade-up" onSubmit={submit} style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 14 }}>
          <Field label="Website URL">
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 11, top: 0, bottom: 0, display: "grid", alignItems: "center", color: "var(--text-mute)" }}>
                <Icon.globe />
              </span>
              <input
                className="input"
                style={{ paddingLeft: 32 }}
                placeholder="https://example.com/page"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
          </Field>
        </div>

        <button type="submit" className="btn primary oa-cta" style={{ width: "100%", justifyContent: "center", background: "linear-gradient(135deg, var(--brand), var(--brand-deep))" }} disabled={!canSubmit}>
          {submitting ? <><span className="spin" style={{ display: "inline-flex" }}><Icon.refresh /></span> Starting…</> : <><Icon.monitor /> Audit Page</>}
        </button>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 12 }}>
          {["Technical SEO", "On-Page", "Performance", "Accessibility", "Links", "Structured Data", "Security"].map((c) => (
            <span key={c} className="chip outline">{c}</span>
          ))}
        </div>

        {error && (
          <div
            className="tiny"
            style={{ marginTop: 12, padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--neg-soft)", color: "var(--neg)", textAlign: "center" }}
          >
            {error}
          </div>
        )}
      </form>

      {/* History */}
      <div className="card oa-fade-up d1" style={{ padding: 0, overflow: "hidden" }}>
        <div className="card-h" style={{ padding: "14px 16px", marginBottom: 0, borderBottom: "1px solid var(--border)" }}>
          <div className="b">Recent audits</div>
          {history.length > 0 && <span className="tiny muted">{history.length} saved</span>}
        </div>

        {loadingHistory ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
            <span className="spin" style={{ display: "inline-flex", marginRight: 8 }}><Icon.refresh /></span> Loading…
          </div>
        ) : history.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <div style={{ color: "var(--text-mute)", marginBottom: 8, display: "flex", justifyContent: "center" }}>
              <span style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--bg-inset)", display: "grid", placeItems: "center" }}>
                <Icon.monitor />
              </span>
            </div>
            <div className="tiny muted">No audits yet. Run your first one above.</div>
          </div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {history.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/dashboard/onpage-audit/results?id=${a.id}`)}
                  className="list-row"
                  style={{ display: "flex", width: "100%", textAlign: "left", alignItems: "center", gap: 12, padding: "12px 16px", border: "none", borderBottom: "1px solid var(--border)", background: "transparent", cursor: "pointer" }}
                >
                  <Favicon domain={displayDomain(a.domain || a.url)} size={28} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="b" style={{ fontSize: 13, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayDomain(a.domain || a.url)}</span>
                    <span className="tiny muted mono" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.url.replace(/^https?:\/\//, "")}</span>
                  </span>
                  <ScoreBadge value={a.status === "COMPLETED" ? a.overallScore : null} />
                  <span className="tiny muted tabular" style={{ display: "inline-block", flexShrink: 0, width: 78 }}>{fmtDate(a.createdAt)}</span>
                  <span style={{ display: "inline-block", flexShrink: 0, width: 76 }}><StatusChip status={a.status} /></span>
                  <span style={{ flexShrink: 0, color: "var(--text-mute)" }}><Icon.chevR /></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="col" style={{ gap: 6 }}>
      <span className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  )
}
