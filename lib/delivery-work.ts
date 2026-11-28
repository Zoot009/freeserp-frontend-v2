// The in-house Delivery Work tool: what the team did for each client, from their PMS
// daily reports. GET /api/delivery-work/reports (the backend asks PMS with its key;
// see the backend's deliveryWork.client.ts).

export type TaskStatus = "NOT_ASSIGNED" | "ASSIGNED" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "OVERDUE"

export type ReportClient = {
  orderId: string
  orderNumber: string
  customerName: string | null
  orderType: string
  workDone: string
  completedTasks: { id: string; title: string; status: TaskStatus }[]
}

export type DailyReport = {
  date: string
  submittedAt: string
  updatedAt: string
  user: { id: string; employeeId: string | null; displayName: string | null; email: string }
  clients: ReportClient[]
}

export type ReportsResponse = { startDate: string; endDate: string; count: number; reports: DailyReport[] }

/** One person's work for one client on one day. */
export type Entry = { date: string; user: DailyReport["user"]; workDone: string; tasks: ReportClient["completedTasks"]; updatedAt: string }

export type ClientWork = { orderId: string; orderNumber: string; customerName: string | null; orderType: string; entries: Entry[]; tasks: number; last: string; people: number }

export type MemberWork = { user: DailyReport["user"]; days: { date: string; clients: ReportClient[] }[]; clients: number; tasks: number }

export const STATUS_LABEL: Record<TaskStatus, string> = {
  COMPLETED: "Completed",
  IN_PROGRESS: "In progress",
  PAUSED: "Paused",
  ASSIGNED: "Assigned",
  NOT_ASSIGNED: "Not assigned",
  OVERDUE: "Overdue",
}

export const nameOf = (u: DailyReport["user"]) => u.displayName?.trim() || u.email
export const clientName = (c: { customerName: string | null; orderNumber: string }) => c.customerName?.trim() || c.orderNumber

/** Each client's work, most recently worked on first, each one's entries newest first. */
export function byClient(reports: DailyReport[]): ClientWork[] {
  const map = new Map<string, ClientWork & { who: Set<string> }>()
  for (const r of reports) {
    for (const c of r.clients) {
      const w = map.get(c.orderId) ?? { orderId: c.orderId, orderNumber: c.orderNumber, customerName: c.customerName, orderType: c.orderType, entries: [], tasks: 0, last: r.date, people: 0, who: new Set<string>() }
      w.entries.push({ date: r.date, user: r.user, workDone: c.workDone, tasks: c.completedTasks, updatedAt: r.updatedAt })
      w.tasks += c.completedTasks.length
      if (r.date > w.last) w.last = r.date
      w.who.add(r.user.id)
      map.set(c.orderId, w)
    }
  }
  return [...map.values()]
    .map(({ who, ...w }) => ({ ...w, people: who.size, entries: w.entries.sort((a, z) => z.date.localeCompare(a.date) || nameOf(a.user).localeCompare(nameOf(z.user))) }))
    .sort((a, z) => z.last.localeCompare(a.last) || clientName(a).localeCompare(clientName(z)))
}

/** Each team member's days, newest first, people by name. */
export function byMember(reports: DailyReport[]): MemberWork[] {
  const map = new Map<string, MemberWork & { orders: Set<string> }>()
  for (const r of reports) {
    const m = map.get(r.user.id) ?? { user: r.user, days: [], clients: 0, tasks: 0, orders: new Set<string>() }
    m.days.push({ date: r.date, clients: r.clients })
    for (const c of r.clients) {
      m.orders.add(c.orderId)
      m.tasks += c.completedTasks.length
    }
    map.set(r.user.id, m)
  }
  return [...map.values()]
    .map(({ orders, ...m }) => ({ ...m, clients: orders.size, days: m.days.sort((a, z) => z.date.localeCompare(a.date)) }))
    .sort((a, z) => nameOf(a.user).localeCompare(nameOf(z.user)))
}

/** The reports, narrowed to one team member and to what matches the search (client, order or the work itself). */
export function filterReports(reports: DailyReport[], { member, search }: { member: string; search: string }): DailyReport[] {
  const q = search.trim().toLowerCase()
  return reports
    .filter((r) => member === "all" || r.user.id === member)
    .map((r) => ({
      ...r,
      clients: q
        ? r.clients.filter((c) => [c.customerName ?? "", c.orderNumber, c.orderType, c.workDone, ...c.completedTasks.map((t) => t.title)].some((s) => s.toLowerCase().includes(q)))
        : r.clients,
    }))
    .filter((r) => r.clients.length > 0 || !q)
}

// ── Dates: the writer's own calendar day, as PMS stores it ──────────────────

const pad = (n: number) => String(n).padStart(2, "0")
/** A date as yyyy-MM-dd in the viewer's own time zone. */
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const shift = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)

export type Preset = "today" | "yesterday" | "7d" | "30d" | "month" | "lastMonth"
export const PRESETS: { key: Preset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "month", label: "This month" },
  { key: "lastMonth", label: "Last month" },
]

export function presetRange(p: Preset, now = new Date()): { startDate: string; endDate: string } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (p) {
    case "today":
      return { startDate: isoDay(today), endDate: isoDay(today) }
    case "yesterday":
      return { startDate: isoDay(shift(today, -1)), endDate: isoDay(shift(today, -1)) }
    case "7d":
      return { startDate: isoDay(shift(today, -6)), endDate: isoDay(today) }
    case "30d":
      return { startDate: isoDay(shift(today, -29)), endDate: isoDay(today) }
    case "month":
      return { startDate: isoDay(new Date(today.getFullYear(), today.getMonth(), 1)), endDate: isoDay(today) }
    case "lastMonth":
      return { startDate: isoDay(new Date(today.getFullYear(), today.getMonth() - 1, 1)), endDate: isoDay(new Date(today.getFullYear(), today.getMonth(), 0)) }
  }
}

/** "Thu, 27 Nov" (with the year when it isn't this year's). */
export function dayLabel(day: string, now = new Date()) {
  const d = new Date(`${day}T00:00:00`)
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", ...(d.getFullYear() !== now.getFullYear() && { year: "numeric" }) })
}
