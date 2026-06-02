"use client"

import { useState } from "react"
import { api, getAccessToken } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || ""

interface GeneratedReport {
  reportId: string
  shareToken: string
  shareUrl: string
}

export function ReportModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [report, setReport] = useState<GeneratedReport | null>(null)
  const [generating, setGenerating] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState("")

  const generate = async () => {
    setGenerating(true)
    setError("")
    try {
      const data = await api.post<GeneratedReport>(`/api/projects/${projectId}/reports`)
      setReport(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate report")
    } finally {
      setGenerating(false)
    }
  }

  const copyLink = async () => {
    if (!report) return
    try {
      await navigator.clipboard.writeText(report.shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked — the link is visible in the field regardless */
    }
  }

  // The api client only returns JSON, so fetch the PDF directly as a blob with
  // the bearer token attached, then trigger a browser download.
  const downloadPdf = async () => {
    if (!report) return
    setDownloading(true)
    setError("")
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/reports/${report.reportId}/pdf`, {
        headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
        credentials: "include",
      })
      if (!res.ok) throw new Error("Failed to download PDF")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "rank-report.pdf"
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download PDF")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-h">
          <div>
            <div className="eyebrow" style={{ margin: 0, fontSize: 11 }}>
              <span className="spark"><Icon.spark /></span> SHAREABLE REPORT
            </div>
            <div className="b" style={{ fontSize: 18, marginTop: 4 }}>Rank report</div>
          </div>
          <button onClick={onClose} className="icon-btn" aria-label="Close"><Icon.close /></button>
        </div>

        <div className="modal-b" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {!report ? (
            <div className="tiny muted">
              Generate a snapshot of this project&apos;s current rankings — top movers, positions, and SERP
              features. You&apos;ll get a shareable link and a downloadable PDF.
            </div>
          ) : (
            <>
              <div>
                <div className="tiny muted" style={{ marginBottom: 4 }}>Shareable link</div>
                <div className="row" style={{ gap: 8 }}>
                  <input className="input" readOnly value={report.shareUrl} style={{ flex: 1, fontSize: 12 }} />
                  <button className="btn" onClick={copyLink} type="button">{copied ? "Copied" : "Copy"}</button>
                </div>
                <div className="tiny muted" style={{ marginTop: 6 }}>
                  Anyone with this link can view the report — no login required.
                </div>
              </div>
            </>
          )}
          {error && <div className="tiny" style={{ color: "var(--neg)" }}>{error}</div>}
        </div>

        <div className="modal-f">
          <button className="btn" onClick={onClose}>Close</button>
          {!report ? (
            <button className="btn primary" onClick={generate} disabled={generating}>
              {generating ? "Generating…" : "Generate report"}
            </button>
          ) : (
            <button className="btn primary" onClick={downloadPdf} disabled={downloading}>
              {downloading ? "Preparing…" : "Download PDF"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
