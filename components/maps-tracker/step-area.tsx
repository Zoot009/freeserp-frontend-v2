"use client"

import { GridSizeDropdown, RadiusDropdown, UnitToggle } from "./grid-controls"
import { validateArea, type DistanceUnit } from "./grid"

/**
 * Step 3 — how wide to look, and how fine the grid.
 *
 * The two numbers interact in a way that isn't obvious: a big grid over a small
 * radius packs points on top of each other. That used to be spelled out in a
 * caption under the controls ("9 points per keyword · 1.50 miles between map
 * pins"), which restated arithmetic the reader had just chosen and the map
 * beside it already draws — the pins ARE the spacing, and the map's own badge
 * counts the points.
 *
 * What the map cannot say is that a combination will not scan at all, so the
 * warning stays: it is the half of that caption which was load-bearing.
 */
export function AreaStep({
  gridSize,
  radius,
  unit,
  keywordCount,
  onGridSize,
  onRadius,
  onUnit,
}: {
  gridSize: number
  radius: number
  unit: DistanceUnit
  keywordCount: number
  onGridSize: (n: number) => void
  onRadius: (v: number) => void
  onUnit: (u: DistanceUnit) => void
}) {
  const problem = validateArea(gridSize, radius, unit, Math.max(1, keywordCount))

  return (
    <>
      <div className="col" style={{ gap: 8 }}>
        <GridSizeDropdown value={gridSize} onChange={onGridSize} />
        <RadiusDropdown value={radius} unit={unit} onChange={onRadius} />
        <UnitToggle value={unit} onChange={onUnit} />
      </div>
      {problem && (
        <div className="tiny" style={{ marginTop: 8, color: "var(--warn)" }} role="alert">{problem}</div>
      )}
    </>
  )
}
