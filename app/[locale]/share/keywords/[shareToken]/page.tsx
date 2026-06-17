import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { ShareKeywordsView, type ShareKeywordsData } from "@/components/share-keywords-view"
import axios from "@/lib/axios"

// Always live — the public page reflects current rankings on each visit.
export const dynamic = "force-dynamic"

async function fetchSharedKeywords(shareToken: string): Promise<ShareKeywordsData | null> {
  const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
  try {
    const res = await axios.get<ShareKeywordsData>(`${backendUrl}/api/projects/share/k/${shareToken}`)
    if (res.status < 200 || res.status >= 300) return null
    return res.data
  } catch {
    return null
  }
}

interface Props {
  params: Promise<{ shareToken: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shareToken } = await params
  const data = await fetchSharedKeywords(shareToken)
  if (!data) return { title: "Rankings Not Found" }
  return {
    title: `${data.name} — keyword rankings`,
    robots: { index: false, follow: false },
  }
}

export default async function ShareKeywordsPage({ params }: Props) {
  const { shareToken } = await params
  const data = await fetchSharedKeywords(shareToken)
  if (!data) notFound()
  return <ShareKeywordsView data={data} />
}
