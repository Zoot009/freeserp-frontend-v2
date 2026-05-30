"use client"

// v2 backend does not produce internal-link-graph data (Stage 2 crawl is out
// of scope). This component now renders nothing for fresh v2 analyses; it
// still supports reading legacy v1 rows when present in the shared DB.

interface LinkNode {
  url: string
  text?: string
  anchorText?: string
  section?: string
  wordCount?: number
}

interface PageData {
  url: string
  wordCount: number
  outboundCount: number
  linksToRanking: boolean
}

export interface LinkGraphDomain {
  domain: string
  isOwnSite: boolean
  position: number | null
  rankingUrl: string
  outboundLinks: LinkNode[]
  inboundLinks: LinkNode[]
  totalCrawledPages: number
  allPages: PageData[]
  hasLinkData: boolean
  internalCrawlStatus?: 'pending' | 'crawling' | 'done' | 'failed' | 'locked'
}

interface Props {
  data: LinkGraphDomain[]
}

function hasUsableData(rows: LinkGraphDomain[]): boolean {
  return rows.some(
    (d) => d.totalCrawledPages > 0 || d.inboundLinks.length > 0 || d.outboundLinks.length > 0,
  )
}

export function InternalLinkGraph({ data }: Props) {
  if (!data || data.length === 0 || !hasUsableData(data)) {
    return (
      <div className="border border-border/40 bg-muted/5 p-6 text-center">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Internal Link Analysis
        </p>
        <p className="font-mono text-[11px] text-muted-foreground/70 mt-2 max-w-md mx-auto">
          Not available for this analysis. Internal-link crawling is not enabled in the current version.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {data.map((d) => (
        <div key={d.domain} className="border border-border/40 bg-card/10 p-4">
          <div className="font-mono text-[11px] uppercase tracking-widest text-accent mb-2">
            {d.isOwnSite ? "★ " : ""}
            {d.domain}
            {d.position ? ` #${d.position}` : ""}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <Stat label="Inbound" value={d.inboundLinks.length} />
            <Stat label="Outbound" value={d.outboundLinks.length} />
            <Stat label="Crawled" value={d.totalCrawledPages} />
            <Stat label="Position" value={d.position ?? "—"} />
          </div>
        </div>
      ))}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="font-mono text-lg font-bold text-foreground">{value}</div>
    </div>
  )
}
