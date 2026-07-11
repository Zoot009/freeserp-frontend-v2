"use client"

import { useEffect, useState } from "react"
import { useRouter } from "@/i18n/navigation"
import { api, ApiError } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"
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
      <div className="page-h">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow"><span className="spark"><Icon.monitor /></span> On-Page Audit</div>
          <h1>Audit your website</h1>
          <div className="sub">Run a full on-page SEO audit of any page — overall score, technical, on-page &amp; performance checks, and prioritized fixes.</div>
        </div>
      </div>

      {/* Create form */}
      <form className="card" onSubmit={submit} style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 14 }}>
          <Field label="Website URL">
            <input
              className="input"
              placeholder="https://example.com/page"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </Field>
        </div>

        <button type="submit" className="btn primary" style={{ width: "100%", justifyContent: "center" }} disabled={!canSubmit}>
          {submitting ? <><span className="spin" style={{ display: "inline-flex" }}><Icon.refresh /></span> Starting…</> : <><Icon.monitor /> Audit Page</>}
        </button>
        <div className="tiny muted" style={{ textAlign: "center", marginTop: 10 }}>
          We crawl the page and score technical SEO, on-page factors, performance, accessibility, links &amp; security.
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
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="card-h" style={{ padding: "14px 16px", marginBottom: 0, borderBottom: "1px solid var(--border)" }}>
          <div className="b">Recent audits</div>
          {history.length > 0 && <span className="tiny muted">{history.length} saved</span>}
        </div>

        {loadingHistory ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
            <span className="spin" style={{ display: "inline-flex", marginRight: 8 }}><Icon.refresh /></span> Loading…
          </div>
        ) : history.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
            No audits yet. Run your first one above.
          </div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {history.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/dashboard/onpage-audit/results?id=${a.id}`)}
                  style={{ display: "flex", width: "100%", textAlign: "left", alignItems: "center", gap: 12, padding: "12px 16px", border: "none", borderBottom: "1px solid var(--border)", background: "transparent", cursor: "pointer" }}
                >
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="b mono" style={{ fontSize: 13, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayDomain(a.domain || a.url)}</span>
                    <span className="tiny muted">{a.status === "COMPLETED" && a.overallScore != null ? `Score ${a.overallScore}${a.grade ? ` · ${a.grade}` : ""}` : "—"}</span>
                  </span>
                  <span className="tiny muted tabular" style={{ flexShrink: 0 }}>{fmtDate(a.createdAt)}</span>
                  <StatusChip status={a.status} />
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
