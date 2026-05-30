"use client"

import { useState } from "react"
import { Sparkles, Download } from "lucide-react"
import { CompetitorComparisonTable } from "@/components/competitor-comparison-table"
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

  const formattedDate = data.completedAt
    ? new Date(data.completedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : new Date(data.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b border-border/60 bg-card/30 px-4 sm:px-8 py-5">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-[var(--font-bebas)] text-3xl sm:text-4xl tracking-tight leading-none mb-1">
                {data.agencyName}
              </h1>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Competitor Analysis Report
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                <span className="font-mono text-xs text-foreground/70">
                  "{data.keyword}"
                </span>
                <span className="text-border/60">·</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {data.yourDomain}
                </span>
                <span className="text-border/60">·</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {formattedDate}
                </span>
              </div>
            </div>
            <button
              onClick={exportCSV}
              className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border border-border/40 hover:border-accent text-muted-foreground hover:text-accent transition-colors font-mono text-[10px] uppercase tracking-widest"
            >
              <Download className="h-3 w-3" />
              Export CSV
            </button>
          </div>
        </div>
      </header>

      {/* Tab bar */}
      <div className="border-b border-border/60 bg-card/20 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto flex">
          {aiPlan && (
            <button
              onClick={() => setActiveTab('ai-plan')}
              className={`px-5 py-3 font-mono text-[10px] uppercase tracking-widest border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
                activeTab === 'ai-plan'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Sparkles className="h-3 w-3" />
              AI Plan
            </button>
          )}
          <button
            onClick={() => setActiveTab('comparison')}
            className={`px-5 py-3 font-mono text-[10px] uppercase tracking-widest border-b-2 -mb-px transition-colors ${
              activeTab === 'comparison'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Comparison
          </button>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 px-4 sm:px-8 py-6">
        <div className="max-w-7xl mx-auto">
          {activeTab === 'comparison' && (
            <CompetitorComparisonTable analysis={data} />
          )}

          {activeTab === 'ai-plan' && aiPlan && (
            <div className="border border-border/60 bg-card/30 p-4 sm:p-6">
              {/* Summary */}
              <div className="mb-6 p-4 border border-accent/20 bg-accent/5">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-3.5 w-3.5 text-accent" />
                  <span className="font-mono text-[10px] uppercase tracking-widest text-accent">AI Summary</span>
                </div>
                <p className="font-mono text-sm text-foreground/90 leading-relaxed">{aiPlan.summary}</p>
              </div>

              {/* Categories + Tasks */}
              <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-0 border border-border/40">
                <div className="border-b lg:border-b-0 lg:border-r border-border/40 bg-background/50 p-4">
                  <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground mb-4">Recommendation Categories</p>
                  <div className="space-y-1">
                    {aiPlan.categories.map((cat, idx) => (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedAiCategory(cat.id)}
                        className={`w-full text-left px-3 py-3 transition-colors border ${
                          selectedAiCategory === cat.id
                            ? 'border-accent/40 bg-accent/10 text-foreground'
                            : 'border-transparent hover:border-border/40 hover:bg-muted/10 text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span className="font-mono text-[10px] text-muted-foreground/60 mt-0.5 flex-shrink-0">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <div>
                            <div className="font-[var(--font-bebas)] text-base tracking-tight leading-tight">{cat.name}</div>
                            <div className="font-mono text-[10px] text-muted-foreground">{cat.taskCount} tasks</div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 sm:p-6">
                  {(() => {
                    const activeCat = aiPlan.categories.find(c => c.id === selectedAiCategory) || aiPlan.categories[0]
                    if (!activeCat) return null
                    return (
                      <div>
                        <div className="flex items-center gap-2 mb-5">
                          <span className="text-lg">{activeCat.icon}</span>
                          <div>
                            <h3 className="font-[var(--font-bebas)] text-2xl tracking-tight leading-none">{activeCat.name}</h3>
                            <p className="font-mono text-[10px] text-muted-foreground mt-0.5">Top Recommendations</p>
                          </div>
                        </div>
                        <div className="space-y-3">
                          {activeCat.tasks.map((task, i) => (
                            <div key={i} className="flex items-start gap-3 p-4 border border-border/30 bg-background/40 hover:bg-muted/5 transition-colors">
                              <div className="flex-1 min-w-0">
                                <p className="font-mono text-sm text-foreground leading-snug mb-1">{task.recommendation}</p>
                                {task.details && (
                                  <p className="font-mono text-[11px] text-muted-foreground leading-relaxed">{task.details}</p>
                                )}
                                {task.impact && (
                                  <p className="font-mono text-[10px] text-accent/70 mt-1.5">{task.impact}</p>
                                )}
                              </div>
                              <div className="flex-shrink-0">
                                <span className={`font-mono text-[9px] uppercase tracking-widest px-2 py-1 border font-bold ${
                                  task.priority === 'HIGH'
                                    ? 'bg-orange-500/15 border-orange-500/40 text-orange-500'
                                    : task.priority === 'MEDIUM'
                                    ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-600'
                                    : 'bg-muted/20 border-border/40 text-muted-foreground'
                                }`}>
                                  {task.priority}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 px-4 sm:px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <span className="font-mono text-[10px] text-muted-foreground/50">
            Powered by FreeSERP
          </span>
          <a
            href="https://freeserp.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            freeserp.com
          </a>
        </div>
      </footer>
    </div>
  )
}
