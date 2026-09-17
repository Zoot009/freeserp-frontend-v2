/**
 * One keyword's grid as a CSV.
 *
 * Built in the browser from data already on screen: there is no export endpoint,
 * and adding one to re-serialise rows the client is holding would be a round
 * trip for nothing. The rank band comes from the same RANK_BANDS the map and the
 * distribution bar read, so an exported sheet can never disagree with the
 * picture it was exported from.
 */

import { RANK_BANDS, bandKeyFor, formatDistance, pointOffsetMeters, type DistanceUnit } from "./grid"
import type { Scan, ScanKeyword } from "./types"

function cell(v: string | number | null | undefined): string {
  if (v == null) return ""
  const s = String(v)
  // Quote anything that could break a field, and double any embedded quote.
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function buildScanCsv(scan: Scan, keyword: ScanKeyword): string {
  const header = [
    "row", "col", "latitude", "longitude",
    "distance_from_centre", "bearing",
    "status", "rank", "rank_band", "match_confidence",
  ]

  const lines = [header.join(",")]

  for (const p of keyword.points) {
    const { distanceMeters, bearing } = pointOffsetMeters(p.row, p.col, scan.gridSize, scan.spacingMeters)
    const band = bandKeyFor(p.rank, p.status)
    lines.push(
      [
        p.row,
        p.col,
        p.latitude,
        p.longitude,
        formatDistance(distanceMeters, scan.displayUnit),
        bearing,
        p.status,
        // Empty, not 0: a point that was searched and found nothing is not a
        // point that ranked zero, and a spreadsheet will average a 0.
        p.rank ?? "",
        band ? (RANK_BANDS.find((b) => b.key === band)?.label ?? "") : "",
        p.matchConfidence ?? "",
      ].map(cell).join(","),
    )
  }

  return lines.join("\n")
}

/** Slug safe for a filename on every OS. */
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "scan"
}

export function downloadScanCsv(scan: Scan, keyword: ScanKeyword): void {
  const csv = buildScanCsv(scan, keyword)
  // A BOM so Excel opens UTF-8 business names correctly instead of mojibake.
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${slug(scan.location.name)}-${slug(keyword.keyword)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
