"use client"

/**
 * Backlinks & Authority widget — the domain's authority score and inbound link
 * count (refreshed daily from the backlink provider), with the spread of the
 * project's keywords across the ranking bands underneath.
 */

import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { InfoHint, Widget } from "@/components/dashboard/widget"

const nf = (n: number) => n.toLocaleString()

export type Band = { label: string; count: number }

export function BacklinksCard({
  loading, da, backlinks, bands, total, checkedAt,
}: { loading: boolean; da: number | null; backlinks: number | null; bands: Band[]; total: number; checkedAt: string | null }) {
  return (
    <Widget
      id="backlinks"
      title="Backlinks"
      hint="How strong this domain is, and how many links from other sites point at it."
      meta={<>{checkedAt && <span>Checked {checkedAt}</span>}</>}
    >
      <div className="grid grid-cols-2 gap-4 border-b pb-3.5">
        <div>
          <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">Authority Score <InfoHint>How strong this domain is, from 0 to 100.</InfoHint></div>
          {loading ? <Skeleton className="h-6 w-14" /> : (
            <>
              <div className="text-xl font-bold tabular-nums text-primary">{da ?? "—"}</div>
              <Progress value={da ?? 0} className="mt-2 h-1.5" />
            </>
          )}
        </div>
        <div className="border-l pl-4">
          <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">Backlinks <InfoHint>Total inbound links pointing at the domain.</InfoHint></div>
          {loading ? <Skeleton className="h-6 w-16" /> : <div className="text-xl font-bold tabular-nums">{backlinks != null ? nf(backlinks) : "—"}</div>}
        </div>
      </div>

      <div className="mb-2.5 mt-3.5 flex items-center gap-1 text-xs text-muted-foreground">
        Keywords by position band <InfoHint>Where this project&apos;s ranking keywords sit in the SERPs right now.</InfoHint>
      </div>
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}</div>
      ) : (
        <div className="flex flex-col gap-2">
          {bands.map((b) => {
            const pct = total ? Math.round((b.count / total) * 1000) / 10 : 0
            return (
              <div key={b.label} className="grid grid-cols-[52px_minmax(0,1fr)_50px_30px] items-center gap-2.5 text-xs">
                <span className="text-muted-foreground">{b.label}</span>
                <span className="h-2.5 overflow-hidden rounded-sm bg-muted">
                  <span className="block h-full rounded-sm bg-primary" style={{ width: `${pct}%` }} />
                </span>
                <span className="text-right tabular-nums text-muted-foreground">{pct}%</span>
                <span className="text-right tabular-nums font-medium">{b.count}</span>
              </div>
            )
          })}
        </div>
      )}
    </Widget>
  )
}
