import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { ShareKeywordsView, type ShareKeywordsData } from "@/components/share-keywords-view"
import axios from "@/lib/axios"

// Always live — the public page reflects current rankings on each visit.
export const dynamic = "force-dynamic"

/**
 * The shared rankings, or why there are none.
 *
 * "missing" is only ever the backend's 404 — a link that was turned off or
 * never existed. Everything else (a 500, a 429, the backend unreachable) is
 * "unavailable": every failure used to become notFound(), which told the
 * recipient the owner had revoked a link that was fine a minute later.
 */
type Shared = { kind: "ok"; data: ShareKeywordsData } | { kind: "missing" } | { kind: "unavailable" }

async function fetchSharedKeywords(shareToken: string): Promise<Shared> {
  const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
  try {
    const res = await axios.get<ShareKeywordsData>(`${backendUrl}/api/projects/share/k/${shareToken}`)
    if (res.status === 404) return { kind: "missing" }
    if (res.status < 200 || res.status >= 300) return { kind: "unavailable" }
    return { kind: "ok", data: res.data }
  } catch {
    return { kind: "unavailable" }
  }
}

interface Props {
  params: Promise<{ shareToken: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shareToken } = await params
  const shared = await fetchSharedKeywords(shareToken)
  if (shared.kind !== "ok") {
    return {
      title: shared.kind === "missing" ? "Rankings Not Found" : "Rankings Unavailable",
      robots: { index: false, follow: false },
    }
  }
  return {
    title: `${shared.data.name} — keyword rankings`,
    robots: { index: false, follow: false },
  }
}

export default async function ShareKeywordsPage({ params }: Props) {
  const { shareToken } = await params
  const shared = await fetchSharedKeywords(shareToken)
  if (shared.kind === "missing") notFound()
  if (shared.kind === "unavailable") {
    return (
      <div style={{ maxWidth: 520, margin: "96px auto", padding: "0 20px", textAlign: "center" }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px" }}>These rankings can&apos;t be loaded right now</h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text-soft, #4B5363)", margin: "0 0 20px" }}>
          The link is fine — our server didn&apos;t answer this time. Please try again in a moment.
        </p>
        {/* A plain link to this same page: a fresh request, with nothing to hydrate. */}
        <a href={`/share/keywords/${shareToken}`} style={{ fontSize: 14, fontWeight: 600 }}>
          Try again
        </a>
      </div>
    )
  }
  return <ShareKeywordsView data={shared.data} />
}
