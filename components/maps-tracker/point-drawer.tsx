"use client"

import { useEffect, useState } from "react"
import { api, ApiError } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"
import { formatDistance, rankColor, SCAN_DEPTH, type DistanceUnit } from "./grid"
import type { PointDetail } from "./types"

const MATCH_LABEL: Record<string, string> = {
  PLACE_ID: "Place ID",
  CID: "Google CID",
  FUZZY: "Business name",
}

/**
 * What Google actually returned at one coordinate.
 *
 * The target is NOT spliced into this list. The worker writes `rank` and
 * `topResults` from the same captured result set in one update, so the
 * business is already in `topResults` at `rankAbsolute === point.rank` —
 * inserting it again would list it twice. Marking the row that is already
 * there is also what makes the header rank and the list position incapable of
 * disagreeing.
 */
export function PointDrawer({
  scanId,
  pointId,
  keyword,
  unit,
  onClose,
}: {
  scanId: string
  pointId: string
  keyword: string
  unit: DistanceUnit
  onClose: () => void
}) {
  const [point, setPoint] = useState<PointDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setPoint(null)
    setError(null)
    api
      .get<{ point: PointDetail }>(`/api/maps-tracker/scans/${scanId}/points/${pointId}`)
      .then(({ point }) => {
        if (!cancelled) setPoint(point)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Couldn't load this point.")
      })
    return () => {
      cancelled = true
    }
  }, [scanId, pointId])

  const results = point?.topResults ?? []
  // Enough of the pack to see where the business sits, without making the
  // reader scroll a full twenty every time they check a green point.
  const shown = point?.rank != null ? Math.max(8, Math.min(SCAN_DEPTH, point.rank + 2)) : 8
  const hidden = Math.max(0, results.length - shown)

  return (
    <>
      <button className="mt-scrim" onClick={onClose} aria-label="Close" tabIndex={-1} />
      <aside className="mt-drawer" role="dialog" aria-label="Grid point detail">
        <div className="mt-drawer-h">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>What Google showed here</div>
            <div className="tiny muted" style={{ marginTop: 2 }}>
              {point ? `${formatDistance(point.distanceFromCenterMeters, unit)} ${point.bearingFromCenter} · ` : ""}
              &ldquo;{keyword}&rdquo;
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon.close /></button>
        </div>

        {error && <div className="tiny" style={{ padding: 20, color: "var(--neg)" }}>{error}</div>}
        {!point && !error && <div className="tiny muted" style={{ padding: 20 }}>Loading…</div>}

        {point && (
          <>
            <div className="mt-drawer-facts">
              <div>
                <div className="mt-drawer-k">YOUR RANK</div>
                <div
                  className="tabular"
                  style={{
                    fontSize: 22, fontWeight: 600, marginTop: 2,
                    color: point.rank != null ? rankColor(point.rank, "SUCCEEDED").bg : "var(--text-mute)",
                  }}
                >
                  {point.rank != null ? `#${point.rank}` : "Not found"}
                </div>
              </div>
              <div>
                <div className="mt-drawer-k">MATCHED ON</div>
                <div
                  className="tiny"
                  style={{ marginTop: 5, color: point.matchConfidence === "FUZZY" ? "var(--warn)" : undefined }}
                  // A name match is a weaker claim than a Place ID match, and
                  // the number above rests on it.
                  title={point.matchConfidence === "FUZZY" ? "Matched by name, not by Place ID — double-check this one." : undefined}
                >
                  {point.matchConfidence ? MATCH_LABEL[point.matchConfidence] ?? point.matchConfidence : "—"}
                </div>
              </div>
              <div>
                <div className="mt-drawer-k">COORDINATES</div>
                <div className="tiny tabular" style={{ marginTop: 6 }}>
                  {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}
                </div>
              </div>
            </div>

            <div className="mt-drawer-b" data-lenis-prevent>
              {results.length === 0 ? (
                <div className="tiny muted" style={{ padding: 10 }}>No results were captured at this point.</div>
              ) : (
                <>
                  {results.slice(0, shown).map((r) => {
                    const you = point.rank != null && r.rankAbsolute === point.rank
                    const c = rankColor(r.rankAbsolute, "SUCCEEDED")
                    return (
                      <div className={"mt-packrow" + (you ? " you" : "")} key={r.rankAbsolute}>
                        <span
                          className="mt-pos"
                          style={r.rankAbsolute <= 3 ? { background: c.bg, color: c.fg } : undefined}
                        >
                          {r.rankAbsolute}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: you ? 600 : 500, lineHeight: 1.3 }}>
                            {r.title}
                            {you && <span className="tiny" style={{ color: "var(--brand)" }}> You</span>}
                            {r.isAd && <span className="chip outline" style={{ marginLeft: 6, fontSize: 10 }}>Ad</span>}
                          </div>
                          <div className="tiny muted">
                            {r.category ?? "—"}
                            {r.rating != null && ` · ${r.rating} ★ (${r.ratingCount ?? 0})`}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {(hidden > 0 || point.rank == null) && (
                    <div className="tiny muted" style={{ padding: "10px 8px 0" }}>
                      {hidden > 0 && `${hidden} more result${hidden === 1 ? "" : "s"} captured at this point`}
                      {point.rank == null && `${hidden > 0 ? " — " : ""}you were not among them`}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  )
}
