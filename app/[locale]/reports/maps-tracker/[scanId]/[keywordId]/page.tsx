"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { useParams } from "next/navigation"
import { api, ApiError } from "@/lib/api"
import { ScanReport } from "@/components/maps-tracker/scan-report"
import { useCompetitors } from "@/components/maps-tracker/use-competitors"
import type { Scan } from "@/components/maps-tracker/types"

/**
 * The shareable, printable report: the same ScanReport the dashboard opens a
 * scan into, on a clean sheet with the FreeSERP letterhead instead of the
 * dashboard around it.
 */
export default function ScanReportPage() {
  const params = useParams<{ scanId: string; keywordId: string }>()
  const [scan, setScan] = useState<Scan | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .get<{ scan: Scan }>(`/api/maps-tracker/scans/${params.scanId}`)
      .then(({ scan }) => {
        if (!cancelled) setScan(scan)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Couldn't load this report.")
      })
    return () => {
      cancelled = true
    }
  }, [params.scanId])

  // Its own fetch: the leaderboard is computed on demand, so a slow one never
  // holds up the rest of the report, and a failed one still leaves it readable.
  const { leaderboard, loading } = useCompetitors(params.scanId, params.keywordId, scan != null)

  if (error) return <div style={{ padding: 60, textAlign: "center" }} className="tiny muted">{error}</div>
  if (!scan) return <div style={{ padding: 60, textAlign: "center" }} className="tiny muted">Loading report…</div>

  const keyword = scan.keywords.find((k) => k.id === params.keywordId)
  if (!keyword) {
    return <div style={{ padding: 60, textAlign: "center" }} className="tiny muted">This keyword isn&apos;t part of this scan.</div>
  }

  return (
    <div className="mt-page mt-report">
      <div className="mt-sheet">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 40 }}>
          <div className="row" style={{ gap: 9 }}>
            {/* Same mark and wordmark as the dashboard sidebar. */}
            <Image src="/logo.png" alt="FreeSERP" width={32} height={32} className="mt-mark" priority />
            <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>FreeSERP</span>
          </div>
          <div className="tiny muted tabular">
            {new Date(scan.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }).toUpperCase()}
          </div>
        </div>

        <ScanReport scan={scan} keyword={keyword} leaderboard={leaderboard} leaderboardLoading={loading} />

        <div className="tiny muted" style={{ marginTop: 40, paddingTop: 18, borderTop: "1px solid var(--border)" }}>
          Prepared by FreeSERP · every figure measured from the {keyword.scoredPoints} searches above
        </div>
      </div>
    </div>
  )
}
