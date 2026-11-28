"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { CheckCircle2, ClipboardCheck, Loader2, Search, Users } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { api, ApiError, errorReason } from "@/lib/api"
import { StatCard } from "@/components/dashboard/stat-card"
import {
  PRESETS,
  STATUS_LABEL,
  byClient,
  byMember,
  clientName,
  dayLabel,
  filterReports,
  nameOf,
  presetRange,
  type ClientWork,
  type DailyReport,
  type MemberWork,
  type Preset,
  type ReportsResponse,
  type TaskStatus,
} from "@/lib/delivery-work"

const card = "rounded-[10px] border border-border bg-card shadow-sm"
const chip = (on: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-medium transition-colors ${on ? "border-brand bg-brand/10 text-brand" : "border-border bg-card text-muted-foreground hover:text-foreground"}`
const field = "h-9 rounded-lg border border-border bg-background px-2.5 text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"

const STATUS_TONE: Record<TaskStatus, string> = {
  COMPLETED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  IN_PROGRESS: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  PAUSED: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  ASSIGNED: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  NOT_ASSIGNED: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  OVERDUE: "bg-red-500/10 text-red-700 dark:text-red-400",
}

export default function DeliveryWorkPage() {
  const { user, loading } = useAuth()
  const [preset, setPreset] = useState<Preset | null>("7d")
  const [range, setRange] = useState(() => presetRange("7d"))
  const [view, setView] = useState<"clients" | "team">("clients")
  const [member, setMember] = useState("all")
  const [search, setSearch] = useState("")
  const [data, setData] = useState<ReportsResponse | null>(null)
  const [error, setError] = useState<{ text: string; setup: boolean } | null>(null)

  useEffect(() => {
    if (!user?.inhouse || range.startDate > range.endDate) return
    let gone = false
    setData(null)
    setError(null)
    api.get<ReportsResponse>(`/api/delivery-work/reports?startDate=${range.startDate}&endDate=${range.endDate}`).then(
      (d) => !gone && setData(d),
      (e) => !gone && setError({ text: errorReason(e, "The daily reports couldn't be loaded."), setup: e instanceof ApiError && e.status === 503 }),
    )
    return () => {
      gone = true
    }
  }, [user?.inhouse, range.startDate, range.endDate])

  const reports = data?.reports ?? []
  const people = useMemo(() => byMember(reports).map((m) => m.user), [reports])
  const shown = useMemo(() => filterReports(reports, { member, search }), [reports, member, search])
  const clients = useMemo(() => byClient(shown), [shown])
  const members = useMemo(() => byMember(shown), [shown])

  if (loading) return null
  if (!user?.inhouse) {
    return (
      <div className="page">
        <p className="text-[13px] text-muted-foreground">This page isn&apos;t available for this account.</p>
      </div>
    )
  }

  const choose = (p: Preset) => {
    setPreset(p)
    setRange(presetRange(p))
  }
  const updates = clients.reduce((n, c) => n + c.entries.length, 0)
  const tasks = clients.reduce((n, c) => n + c.tasks, 0)

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1 className="flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-brand" aria-hidden /> Delivery Work
          </h1>
          <div className="sub">What the team did for each client, day by day, from their PMS daily reports. For the in-house team only.</div>
        </div>
      </div>

      <div className={`${card} mb-4 space-y-3 p-4`}>
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <button key={p.key} type="button" onClick={() => choose(p.key)} className={chip(preset === p.key)} aria-pressed={preset === p.key}>
              {p.label}
            </button>
          ))}
          <span className="ml-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="date"
              className={field}
              value={range.startDate}
              max={range.endDate}
              onChange={(e) => e.target.value && (setPreset(null), setRange((r) => ({ ...r, startDate: e.target.value })))}
              aria-label="From"
            />
            to
            <input
              type="date"
              className={field}
              value={range.endDate}
              min={range.startDate}
              onChange={(e) => e.target.value && (setPreset(null), setRange((r) => ({ ...r, endDate: e.target.value })))}
              aria-label="To"
            />
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input className={`${field} w-full pl-8`} placeholder="Search a client, order or the work done" value={search} onChange={(e) => setSearch(e.target.value)} />
          </span>
          <select className={field} value={member} onChange={(e) => setMember(e.target.value)} aria-label="Team member">
            <option value="all">Everyone ({people.length})</option>
            {people.map((u) => (
              <option key={u.id} value={u.id}>
                {nameOf(u)}
              </option>
            ))}
          </select>
          <span className="inline-flex rounded-lg border border-border bg-background p-0.5" role="group" aria-label="View">
            {(
              [
                ["clients", "By client"],
                ["team", "By team member"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={view === k}
                onClick={() => setView(k)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${view === k ? "bg-brand/10 text-brand" : "text-muted-foreground hover:text-foreground"}`}
              >
                {label}
              </button>
            ))}
          </span>
        </div>
      </div>

      {error ? (
        <div className={`${card} p-5 text-[13px]`}>
          <p className={error.setup ? "font-medium" : "text-red-600 dark:text-red-400"}>{error.text}</p>
          {error.setup && (
            <p className="mt-1.5 leading-relaxed text-muted-foreground">
              Set <code className="rounded bg-muted px-1">DAILY_REPORTS_API_KEY</code> on the FreeSERP backend to the same value as on PMS, then redeploy it.
            </p>
          )}
        </div>
      ) : !data ? (
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading the daily reports…
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard compact label="Clients worked on" hint="Client orders with at least one update in this period." value={clients.length} tone="text-foreground" caption={`${dayLabel(range.startDate)} – ${dayLabel(range.endDate)}`} />
            <StatCard compact label="Updates" hint="One person's work on one client on one day." value={updates} tone="text-foreground" caption="from the daily reports" />
            <StatCard compact label="Tasks ticked off" hint="PMS tasks the team ticked as done in their reports." value={tasks} tone="text-emerald-600 dark:text-emerald-400" caption="in PMS" />
            <StatCard compact label="Team members" hint="People who sent at least one daily report in this period. Anyone who didn't isn't listed." value={members.length} tone="text-foreground" caption={`${shown.length} daily ${shown.length === 1 ? "report" : "reports"}`} />
          </div>

          {reports.length === 0 ? (
            <Empty>No daily reports in this period yet.</Empty>
          ) : shown.length === 0 || (view === "clients" && clients.length === 0) ? (
            <Empty>Nothing matches. Clear the search or choose everyone.</Empty>
          ) : view === "clients" ? (
            clients.map((c) => <ClientCard key={c.orderId} work={c} />)
          ) : (
            members.map((m) => <MemberCard key={m.user.id} work={m} />)
          )}
        </div>
      )}
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <div className={`${card} p-8 text-center text-[13px] text-muted-foreground`}>{children}</div>
}

function Tasks({ tasks }: { tasks: DailyReport["clients"][number]["completedTasks"] }) {
  if (!tasks.length) return null
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1.5">
      {tasks.map((t) => (
        <li key={t.id} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-0.5 text-xs">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
          {t.title}
          {/* The task's status in PMS now: ticked in a report before it was closed in PMS, it can still read "In progress". */}
          {t.status !== "COMPLETED" && <span className={`rounded px-1 text-[10px] font-medium ${STATUS_TONE[t.status]}`}>{STATUS_LABEL[t.status]}</span>}
        </li>
      ))}
    </ul>
  )
}

/** What was done, or a note when PMS has since removed it. */
function Work({ text, tasks }: { text: string; tasks: number }) {
  if (text.trim()) return <p className="whitespace-pre-line text-[13px] leading-relaxed">{text}</p>
  return tasks ? null : <p className="text-[13px] italic text-muted-foreground">No details left: the tasks for this were removed in PMS.</p>
}

function ClientCard({ work: c }: { work: ClientWork }) {
  const [all, setAll] = useState(false)
  const entries = all ? c.entries : c.entries.slice(0, 4)
  return (
    <section className={card}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold">{clientName(c)}</h2>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {c.orderNumber} · {c.orderType}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            <b className="font-semibold text-foreground">{c.entries.length}</b> {c.entries.length === 1 ? "update" : "updates"}
          </span>
          <span>
            <b className="font-semibold text-foreground">{c.tasks}</b> {c.tasks === 1 ? "task" : "tasks"} done
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" aria-hidden /> {c.people}
          </span>
          <span>Last: {dayLabel(c.last)}</span>
        </div>
      </header>
      <ol className="divide-y divide-border">
        {entries.map((e, i) => (
          <li key={`${e.date}-${e.user.id}-${i}`} className="grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[150px_minmax(0,1fr)]">
            <div className="text-xs">
              <div className="font-medium">{dayLabel(e.date)}</div>
              <div className="text-muted-foreground">{nameOf(e.user)}</div>
            </div>
            <div className="min-w-0">
              <Work text={e.workDone} tasks={e.tasks.length} />
              <Tasks tasks={e.tasks} />
            </div>
          </li>
        ))}
      </ol>
      {c.entries.length > 4 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="w-full border-t border-border px-4 py-2.5 text-xs font-medium text-brand hover:bg-muted/50">
          {all ? "Show fewer" : `Show all ${c.entries.length} updates`}
        </button>
      )}
    </section>
  )
}

function MemberCard({ work: m }: { work: MemberWork }) {
  const [all, setAll] = useState(false)
  const days = all ? m.days : m.days.slice(0, 3)
  return (
    <section className={card}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold">{nameOf(m.user)}</h2>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {[m.user.employeeId, m.user.displayName ? m.user.email : null].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            <b className="font-semibold text-foreground">{m.days.length}</b> {m.days.length === 1 ? "day" : "days"} reported
          </span>
          <span>
            <b className="font-semibold text-foreground">{m.clients}</b> {m.clients === 1 ? "client" : "clients"}
          </span>
          <span>
            <b className="font-semibold text-foreground">{m.tasks}</b> {m.tasks === 1 ? "task" : "tasks"} done
          </span>
        </div>
      </header>
      <ol className="divide-y divide-border">
        {days.map((d) => (
          <li key={d.date} className="grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[150px_minmax(0,1fr)]">
            <div className="text-xs font-medium">{dayLabel(d.date)}</div>
            <div className="min-w-0 space-y-3">
              {d.clients.length === 0 && <p className="text-[13px] italic text-muted-foreground">The clients on this report were removed in PMS.</p>}
              {d.clients.map((c) => (
                <div key={c.orderId}>
                  <div className="text-[13px] font-semibold">
                    {clientName(c)} <span className="font-normal text-muted-foreground">· {c.orderNumber}</span>
                  </div>
                  <Work text={c.workDone} tasks={c.completedTasks.length} />
                  <Tasks tasks={c.completedTasks} />
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>
      {m.days.length > 3 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="w-full border-t border-border px-4 py-2.5 text-xs font-medium text-brand hover:bg-muted/50">
          {all ? "Show fewer" : `Show all ${m.days.length} days`}
        </button>
      )}
    </section>
  )
}
