"use client"

import { useState } from "react"
import { CompetitorComparisonTable } from "@/components/competitor-comparison-table"
import { Icon } from "@/components/dashboard/icons"
import type { AnalysisData, AiPlan } from "@/types/competitor-analysis"

interface Props {
  data: AnalysisData & { agencyName: string }
}

export function ShareReportView({ data }: Props) {
  const aiPlan = data.aiPlan as AiPlan | null
  const [activeTab, setActiveTab] = useState<'comparison' | 'ai-plan'>(aiPlan ? 'ai-plan' : 'comparison')
  const [selectedAiCategory, setSelectedAiCategory] = useState<string>(
    aiPlan?.categories?.[0]?.id ?? ''
  )

  const exportCSV = () => {
    const rows: string[][] = [
      ['Domain', 'Position', 'Word Count', 'Images', 'Links', 'Internal Links', 'External Links', 'H1', 'H2', 'H3', 'Pages Crawled', 'Total Words', 'Avg Words/Page'],
    ]
    const addRow = (label: string, d: Partial<typeof data.competitors[0]> & { domain: string; position?: number | null }) => {
      rows.push([
        d.domain,
        String(d.position ?? ''),
        String(d.wordCount ?? ''),
        String(d.imageCount ?? ''),
        String(d.linkCount ?? ''),
        String(d.internalLinks ?? ''),
        String(d.externalLinks ?? ''),
        String(d.h1Count ?? ''),
        String(d.h2Count ?? ''),
        String(d.h3Count ?? ''),
        String(d.internalPagesCrawled ?? ''),
        String(d.totalInternalWordCount ?? ''),
        String(d.avgWordsPerPage ?? ''),
      ])
    }
    addRow('You', {
      domain: data.yourDomain,
      position: data.yourPosition,
      wordCount: data.yourWordCount,
      imageCount: data.yourImageCount,
      linkCount: data.yourLinkCount,
      internalLinks: data.yourInternalLinks ?? null,
      externalLinks: data.yourExternalLinks ?? null,
      h1Count: data.yourH1Count,
      h2Count: data.yourH2Count,
      h3Count: data.yourH3Count,
      internalPagesCrawled: data.yourInternalPagesCrawled,
      totalInternalWordCount: data.yourTotalInternalWordCount,
      avgWordsPerPage: data.yourAvgWordsPerPage,
    })
    data.competitors.forEach(c => addRow(c.domain, c))
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${data.keyword.replace(/\s+/g, '-')}-analysis.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const formattedDate = new Date(data.completedAt ?? data.createdAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
  const agencyInitial = (data.agencyName || 'F').trim().charAt(0).toUpperCase()

  return (
    <div className="fs-app" style={{ minHeight: "100vh", background: "var(--bg-sub)" }}>
      {/* Top bar — agency branding + export */}
      <header
        className="row between"
        style={{ padding: "14px 24px", background: "var(--bg-elev)", borderBottom: "1px solid var(--border)", gap: 12 }}
      >
        <div className="row" style={{ gap: 10, minWidth: 0 }}>
          <span
            style={{
              display: "grid", placeItems: "center", flexShrink: 0,
              width: 32, height: 32, borderRadius: 9,
              background: "var(--brand)", color: "#fff", fontWeight: 700, fontSize: 15,
            }}
          >
            {agencyInitial}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {data.agencyName}
            </div>
            <div className="tiny muted" style={{ marginTop: 1 }}>Competitor analysis report</div>
          </div>
        </div>
        <button className="btn" onClick={exportCSV} style={{ flexShrink: 0 }}>
          <Icon.download /> Export CSV
        </button>
      </header>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "clamp(20px, 4vw, 28px) clamp(14px, 4vw, 24px) 64px" }}>
        {/* Page header */}
        <div className="page-h" style={{ alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow"><span className="spark"><Icon.spark /></span> COMPETITOR ANALYSIS</div>
            <h1 style={{ overflowWrap: "anywhere" }}>{data.keyword}</h1>
            <div className="sub">
              <span className="mono">{data.yourDomain}</span>
              {data.yourPosition ? <> · Ranked <span className="b" style={{ color: "var(--text)" }}>#{data.yourPosition}</span></> : null}
              {" · "}{formattedDate}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs">
          {aiPlan && (
            <button
              className={"tab " + (activeTab === 'ai-plan' ? "active" : "")}
              onClick={() => setActiveTab('ai-plan')}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Icon.ai /> AI plan
            </button>
          )}
          <button
            className={"tab " + (activeTab === 'comparison' ? "active" : "")}
            onClick={() => setActiveTab('comparison')}
          >
            Comparison
          </button>
        </div>

        {/* Content */}
        <div style={{ marginTop: 18 }}>
          {activeTab === 'comparison' && (
            <CompetitorComparisonTable analysis={data} />
          )}

          {activeTab === 'ai-plan' && aiPlan && (
            <>
              {/* Summary card */}
              <div className="ai-summary">
                <div className="lbl">
                  <Icon.ai /> AI SUMMARY
                </div>
                <p>{aiPlan.summary}</p>
              </div>

              {/* Categories sidebar + task detail */}
              <div className="ap-grid">
                <div className="ap-cats">
                  <div className="ttl">Recommendation Categories</div>
                  {aiPlan.categories.map((cat, idx) => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedAiCategory(cat.id)}
                      className={"ap-cat " + (selectedAiCategory === cat.id ? "active" : "")}
                    >
                      <span className="nm">{String(idx + 1).padStart(2, "0")}</span>
                      <div>
                        <div className="lbl">{cat.name}</div>
                        <div className="sub">{cat.taskCount} task{cat.taskCount === 1 ? "" : "s"}</div>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="ap-detail">
                  {(() => {
                    const activeCat = aiPlan.categories.find((c) => c.id === selectedAiCategory) || aiPlan.categories[0]
                    if (!activeCat) return null
                    return (
                      <>
                        <div className="ap-detail-h">
                          <div className="row" style={{ gap: 10 }}>
                            {activeCat.icon && <span style={{ fontSize: 22 }}>{activeCat.icon}</span>}
                            <div>
                              <div className="t">{activeCat.name}</div>
                              <div className="s">Top recommendations for you</div>
                            </div>
                          </div>
                        </div>
                        {activeCat.tasks.map((task, i) => {
                          const impCls = task.priority === "HIGH" ? "high" : task.priority === "MEDIUM" ? "med" : "low"
                          return (
                            <div key={i} className="ap-task">
                              <span className="nm">{String(i + 1).padStart(2, "0")}</span>
                              <div>
                                <div className="ttl">{task.recommendation}</div>
                                {task.details && <div className="desc">{task.details}</div>}
                                {task.impact && <div className="why">{task.impact}</div>}
                              </div>
                              <span className={"imp " + impCls}>{task.priority}</span>
                            </div>
                          )
                        })}
                      </>
                    )
                  })()}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className="row between"
          style={{ marginTop: 36, paddingTop: 16, borderTop: "1px solid var(--border)", flexWrap: "wrap", gap: 8 }}
        >
          <span className="tiny muted">Powered by FreeSERP</span>
          <a href="https://freeserp.com" target="_blank" rel="noopener noreferrer" className="tiny muted" style={{ textDecoration: "none" }}>
            freeserp.com
          </a>
        </div>
      </div>
    </div>
  )
}
