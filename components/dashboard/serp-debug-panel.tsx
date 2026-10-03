"use client"

// Dev-only: raw SerpTask lifecycle for a keyword — timings, DataForSEO cost,
// depth, credit reservation. Backed by GET .../serp-debug, which the API only
// mounts when NODE_ENV=development. Rendered only in non-production builds.

import { useCallback, useEffect, useState } from "react"
import { api } from "@/lib/api"

type SerpDebugTask = {
  id: string
  status: string
  engine: string
  checkMode: string
  manual: boolean
  units: number
  startOffset: number
  depth: number
  expansionAttempts: number
  dataforseoTaskId: string | null
  errorMessage: string | null
  costUsd: number | null
  createdAt: string
  queuedMs: number | null
  dataforseoMs: number | null
  ingestMs: number | null
  totalMs: number | null
  rankCheck: { position: number | null; url: string | null; depthSearched: number | null } | null
  reservation: { dimension: string; units: number; status: string } | null
}

const dur = (ms: number | null) => (ms == null ? "—" : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`)
const usd = (n: number | null) => (n == null ? "—" : `$${n.toFixed(5)}`)
const isFailed = (t: { status: string }) => ["FAILED", "TIMED_OUT", "SUBMISSION_FAILED"].includes(t.status)
const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

const STATUS_CHIP: Record<string, string> = {
  COMPLETED: "chip pos",
  FAILED: "chip neg",
  TIMED_OUT: "chip neg",
  SUBMISSION_FAILED: "chip neg",
  QUEUED: "chip outline",
  SUBMITTED: "chip warn",
}

// Segment colours for the timing bar: where did the time go?
const SEGMENTS = [
  { key: "queuedMs", label: "Queued", color: "var(--text-mute)" },
  { key: "dataforseoMs", label: "DataForSEO", color: "var(--brand)" },
  { key: "ingestMs", label: "Ingest", color: "var(--pos)" },
] as const

function TimingBar({ t, scale }: { t: SerpDebugTask; scale: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 180 }}>
      <div
        style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--bg-inset)", display: "flex", overflow: "hidden" }}
        title={SEGMENTS.map((s) => `${s.label}: ${dur(t[s.key])}`).join("\n")}
      >
        {SEGMENTS.map((s) =>
          t[s.key] ? (
            <div key={s.key} style={{ width: `${(t[s.key]! / scale) * 100}%`, background: s.color }} />
          ) : null,
        )}
      </div>
      <span className="tabular" style={{ fontWeight: 500, width: 48, textAlign: "right" }}>{dur(t.totalMs)}</span>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ padding: "12px 18px", borderRight: "1px solid var(--border)", minWidth: 120 }}>
      <div className="tiny muted">{label}</div>
      <div className="tabular" style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>{value}</div>
      {sub && <div className="tiny muted tabular">{sub}</div>}
    </div>
  )
}

export function SerpDebugPanel({ projectId, keywordId }: { projectId: string; keywordId: string }) {
  const [tasks, setTasks] = useState<SerpDebugTask[] | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setError("")
    setLoading(true)
    api
      .get<{ tasks: SerpDebugTask[] }>(`/api/projects/${projectId}/keywords/${keywordId}/serp-debug`)
      .then((r) => setTasks(r.tasks))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false))
  }, [projectId, keywordId])

  useEffect(load, [load])

  const list = tasks ?? []
  const totals = list.map((t) => t.totalMs).filter((n): n is number => n != null)
  const costs = list.map((t) => t.costUsd).filter((n): n is number => n != null)
  const totalCost = costs.reduce((s, n) => s + n, 0)
  const failed = list.filter(isFailed).length
  const inFlight = list.filter((t) => t.totalMs == null && !isFailed(t)).length
  const scale = Math.max(1, ...totals)

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", marginTop: 14, borderStyle: "dashed" }}>
      <div
        className="card-h"
        style={{ padding: "14px 18px", marginBottom: 0, borderBottom: "1px solid var(--border)" }}
      >
        <div>
          <div className="t" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            SERP debug <span className="chip warn" style={{ fontSize: 10 }}>DEV ONLY</span>
          </div>
          <div className="tiny muted" style={{ marginTop: 2 }}>
            Last {list.length} SERP task{list.length === 1 ? "" : "s"} for this keyword · hover a bar for the breakdown
          </div>
        </div>
        <button className="btn sm" onClick={load} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
      </div>

      {error ? (
        <div style={{ padding: 24, color: "var(--neg)", fontSize: 13 }}>{error}</div>
      ) : !tasks ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>Loading…</div>
      ) : list.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
          No SERP tasks yet. Run a check to see its lifecycle here.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", borderBottom: "1px solid var(--border)", background: "var(--bg-sub)" }}>
            <Stat label="Median time" value={dur(median(totals))} sub={totals.length ? `fastest ${dur(Math.min(...totals))} · slowest ${dur(scale)}` : undefined} />
            <Stat label="Total cost" value={usd(totalCost)} sub={costs.length ? `avg ${usd(totalCost / costs.length)} / check` : undefined} />
            <Stat label="Completed" value={`${totals.length}/${list.length}`} sub={inFlight ? `${inFlight} in flight` : undefined} />
            <Stat label="Failed" value={String(failed)} />
            <div style={{ padding: "12px 18px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              {SEGMENTS.map((s) => (
                <span key={s.key} className="tiny muted" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>
          </div>

          <div className="tbl-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Status</th>
                  <th>Timing</th>
                  <th>Cost</th>
                  <th>Result</th>
                  <th>Window</th>
                  <th>Type</th>
                  <th>Credits</th>
                  <th>DataForSEO task</th>
                </tr>
              </thead>
              <tbody>
                {list.map((t) => (
                  <tr key={t.id} title={`SerpTask ${t.id}`}>
                    <td className="tiny tabular" style={{ whiteSpace: "nowrap" }}>
                      {new Date(t.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </td>
                    <td>
                      <span className={STATUS_CHIP[t.status] ?? "chip"} style={{ fontSize: 10 }}>{t.status}</span>
                    </td>
                    <td><TimingBar t={t} scale={scale} /></td>
                    <td className="tabular">{usd(t.costUsd)}</td>
                    <td className="tabular">
                      {t.rankCheck ? (
                        <>
                          <span style={{ fontWeight: 500 }}>{t.rankCheck.position != null ? `#${t.rankCheck.position}` : "Not found"}</span>
                          <span className="tiny muted"> / {t.rankCheck.depthSearched ?? "?"}</span>
                        </>
                      ) : "—"}
                    </td>
                    <td className="tabular tiny">
                      {t.startOffset + 1}–{t.startOffset + t.depth}
                      {t.expansionAttempts > 0 && <span className="chip warn" style={{ fontSize: 9, marginLeft: 6 }}>expanded</span>}
                    </td>
                    <td className="tiny" style={{ whiteSpace: "nowrap" }}>
                      {t.engine} · {t.checkMode} · {t.manual ? "manual" : "scheduled"} · {t.units}u
                    </td>
                    <td className="tiny" style={{ whiteSpace: "nowrap" }}>
                      {t.reservation ? `${t.reservation.units} ${t.reservation.dimension} · ${t.reservation.status}` : "—"}
                    </td>
                    <td className="tiny" style={{ fontFamily: "var(--font-mono)", maxWidth: 260 }}>
                      {t.errorMessage ? (
                        <span style={{ color: "var(--neg)" }}>{t.errorMessage}</span>
                      ) : t.dataforseoTaskId ? (
                        <span
                          style={{ cursor: "copy" }}
                          title="Click to copy"
                          onClick={() => navigator.clipboard?.writeText(t.dataforseoTaskId!)}
                        >
                          {t.dataforseoTaskId}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
