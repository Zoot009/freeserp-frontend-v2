"use client"

import { Dropdown } from "@/components/dashboard/dropdown"
import { GRID_SIZES, RECOMMENDED_GRID_SIZE, RADIUS_STEPS, nearestRadiusStep, deriveSpacingMeters, toMeters, type DistanceUnit } from "./grid"

export function GridSizeDropdown({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <Dropdown
      value={String(value)}
      onChange={(v) => onChange(Number(v))}
      ariaLabel="Grid size"
      block
      options={GRID_SIZES.map((n) => ({
        value: String(n),
        label: (
          <span className="row" style={{ justifyContent: "space-between", width: "100%", gap: 12 }}>
            <span>
              {n} × {n} grid{n === RECOMMENDED_GRID_SIZE ? "  ·  Recommended" : ""}
            </span>
            <span className="tiny muted tabular">{n * n} points</span>
          </span>
        ),
      }))}
    />
  )
}

export function RadiusDropdown({
  value,
  unit,
  onChange,
}: {
  value: number
  unit: DistanceUnit
  onChange: (v: number) => void
}) {
  const steps = RADIUS_STEPS[unit]
  const label = unit === "IMPERIAL" ? "mi" : "km"
  return (
    <Dropdown
      value={String(nearestRadiusStep(value, unit))}
      onChange={(v) => onChange(Number(v))}
      ariaLabel="Radius"
      block
      options={steps.map((s) => ({ value: String(s), label: `${s} ${label} radius` }))}
    />
  )
}

export function UnitToggle({ value, onChange }: { value: DistanceUnit; onChange: (u: DistanceUnit) => void }) {
  return (
    <div className="pill-toggle">
      {(["IMPERIAL", "METRIC"] as const).map((u) => (
        <button key={u} type="button" className={value === u ? "active" : ""} onClick={() => onChange(u)}>
          {u === "IMPERIAL" ? "Imperial" : "Metric"}
        </button>
      ))}
    </div>
  )
}

export function spacingCaption(gridSize: number, radius: number, unit: DistanceUnit): string {
  const radiusMeters = toMeters(radius, unit)
  const spacingMeters = deriveSpacingMeters(gridSize, radiusMeters)
  const divisor = unit === "IMPERIAL" ? 1609.344 : 1000
  const spacingInUnit = spacingMeters / divisor
  const label = unit === "IMPERIAL" ? "miles" : "km"
  return `${spacingInUnit.toFixed(2)} ${label} between map pins`
}
