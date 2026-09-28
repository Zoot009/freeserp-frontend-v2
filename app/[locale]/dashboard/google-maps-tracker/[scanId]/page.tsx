"use client"

import { useEffect, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { Link, useRouter } from "@/i18n/navigation"
import { api, ApiError } from "@/lib/api"
import type { Scan } from "@/components/maps-tracker/types"

const LIST = "/dashboard/google-maps-tracker"

/**
 * The old address of a scan, now a forwarder to its report.
 *
 * A scan is read in one place: its report, at /reports/maps-tracker/…. This url
 * is still what the builder opens after creating a scan, what the overview card
 * links to, and what older links point at — so it stays, and sends each of them
 * on. With a keyword in the url the jump is immediate; without one (a scan
 * straight out of the builder) it looks up the scan's first keyword first.
 */
export default function ScanForwardPage() {
  const router = useRouter()
  const params = useParams<{ scanId: string }>()
  const searchParams = useSearchParams()
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    // `keyword` alongside `k`, so links written against the older spelling
    // still resolve.
    const wanted = searchParams.get("k") ?? searchParams.get("keyword")
    if (wanted) {
      router.replace(`/reports/maps-tracker/${params.scanId}/${wanted}`)
      return
    }

    let cancelled = false
    api
      .get<{ scan: Scan }>(`/api/maps-tracker/scans/${params.scanId}`)
      .then(({ scan }) => {
        if (cancelled) return
        const first = scan.keywords[0]?.id
        if (first) router.replace(`/reports/maps-tracker/${scan.id}/${first}`)
        else setProblem("This scan has no keywords to report on.")
      })
      .catch((err) => {
        if (cancelled) return
        setProblem(
          err instanceof ApiError && err.status === 404
            ? "That scan isn't here. It may have been removed, or it belongs to another account."
            : "Couldn't open this scan.",
        )
      })
    return () => {
      cancelled = true
    }
  }, [params.scanId, searchParams, router])

  return (
    <div className="page" style={{ padding: 60, textAlign: "center" }}>
      {problem ? (
        <>
          <div className="tiny muted" style={{ marginBottom: 14 }}>{problem}</div>
          <Link href={LIST} className="btn sm">All scans</Link>
        </>
      ) : (
        <span className="tiny muted">Opening report…</span>
      )}
    </div>
  )
}
