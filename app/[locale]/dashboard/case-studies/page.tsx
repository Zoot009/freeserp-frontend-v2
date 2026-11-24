"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, BookOpenCheck, ExternalLink, Loader2, Plus } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { api, errorReason } from "@/lib/api"
import { caseStudyUrl, type CaseStudyRow } from "@/lib/case-studies"

const TH = "border-b border-border px-3 py-2 text-left text-xs font-medium text-muted-foreground"
const TD = "px-3 py-2.5 align-top"
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })

export default function CaseStudiesPage() {
  const { user, loading } = useAuth()
  const [rows, setRows] = useState<CaseStudyRow[] | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!user?.inhouse) return
    api.get<{ caseStudies: CaseStudyRow[] }>("/api/case-studies").then(
      (r) => setRows(r.caseStudies),
      (e) => {
        setError(errorReason(e, "The case studies couldn't be loaded."))
        setRows([])
      },
    )
  }, [user?.inhouse])

  if (loading) return null
  if (!user?.inhouse) {
    return (
      <div className="page">
        <p className="text-[13px] text-muted-foreground">This page isn&apos;t available for this account.</p>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1 className="flex items-center gap-2">
            <BookOpenCheck className="h-6 w-6 text-brand" aria-hidden /> Case Studies
          </h1>
          <div className="sub">
            Client case-study pages on freeserp.com: rank grids, audit, backlinks, reviews and a review QR code. Fill in the form and share the link. For the in-house team only.
          </div>
        </div>
        <Link
          href="/dashboard/case-studies/new"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-deep"
        >
          <Plus className="h-4 w-4" aria-hidden /> New case study
        </Link>
      </div>

      <section className="rounded-2xl border border-border bg-card">
        {error && <p className="border-b border-border px-4 py-3 text-[13px] text-red-600 dark:text-red-400">{error}</p>}
        {!rows ? (
          <p className="flex items-center gap-2 px-4 py-4 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading case studies…
          </p>
        ) : rows.length === 0 ? (
          !error && <p className="px-4 py-4 text-[13px] text-muted-foreground">No case studies yet. Add one with New case study.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className={TH}>Client</th>
                  <th className={TH}>Agency</th>
                  <th className={TH}>Report numbers</th>
                  <th className={TH}>Updated</th>
                  <th className={TH}>Page</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/40">
                    <td className={TD}>
                      <Link href={`/dashboard/case-studies/${c.id}`} className="font-medium hover:text-brand hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className={`${TD} text-muted-foreground`}>{c.agency}</td>
                    <td className={TD}>
                      {c.snapshotError ? (
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400" title={c.snapshotError}>
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Last refresh failed
                        </span>
                      ) : c.snapshotAt ? (
                        <span className="text-muted-foreground">Pulled {day(c.snapshotAt)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className={`${TD} text-muted-foreground`}>{day(c.updatedAt)}</td>
                    <td className={TD}>
                      <a href={caseStudyUrl(c.agency, c.slug)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
                        Open <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
