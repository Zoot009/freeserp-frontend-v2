import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { ShareReportView } from "@/components/share-report-view"
import type { AnalysisData } from "@/types/competitor-analysis"

interface SharePageData extends AnalysisData {
  agencyName: string
}

async function fetchSharedReport(shareToken: string): Promise<SharePageData | null> {
  const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
  try {
    const res = await fetch(`${backendUrl}/api/share/${shareToken}`, { cache: 'no-store' })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

interface Props {
  params: Promise<{ shareToken: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shareToken } = await params
  const data = await fetchSharedReport(shareToken)
  if (!data) return { title: 'Report Not Found' }
  return {
    title: `${data.keyword} — ${data.agencyName}`,
    robots: { index: false, follow: false },
  }
}

export default async function SharePage({ params }: Props) {
  const { shareToken } = await params
  const data = await fetchSharedReport(shareToken)
  if (!data) notFound()
  return <ShareReportView data={data} />
}
