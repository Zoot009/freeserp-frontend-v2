"use client"

import { GridSizeDropdown, RadiusDropdown, UnitToggle, spacingCaption } from "./grid-controls"
import { totalPoints, validateArea, type DistanceUnit } from "./grid"

/**
 * Step 3 — how wide to look, and how fine the grid.
 *
 * The two numbers interact in a way that isn't obvious (a big grid over a
 * small radius packs points on top of each other), so the caption under the
 * controls always states the resulting spacing, and an unscannable
 * combination says so here rather than failing after the click.
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
  const points = totalPoints(gridSize, 1)

  return (
    <>
      <div className="col" style={{ gap: 8 }}>
        <GridSizeDropdown value={gridSize} onChange={onGridSize} />
        <RadiusDropdown value={radius} unit={unit} onChange={onRadius} />
        <UnitToggle value={unit} onChange={onUnit} />
      </div>
      <div className="mt-step-hint">
        {points} points per keyword · {spacingCaption(gridSize, radius, unit)}
      </div>
      {problem && (
        <div className="tiny" style={{ marginTop: 8, color: "var(--warn)" }} role="alert">{problem}</div>
      )}
    </>
  )
}
