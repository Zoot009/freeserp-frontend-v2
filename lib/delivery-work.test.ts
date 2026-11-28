import { describe, expect, it } from "vitest"
import { byClient, byMember, filterReports, presetRange, type DailyReport } from "./delivery-work"

const user = (id: string, displayName: string | null) => ({ id, employeeId: null, displayName, email: `${id}@example.com` })
const client = (orderId: string, customerName: string, workDone: string, tasks = 0) => ({
  orderId,
  orderNumber: `ORD-${orderId}`,
  customerName,
  orderType: "Standard",
  workDone,
  completedTasks: Array.from({ length: tasks }, (_, i) => ({ id: `${orderId}-t${i}`, title: `Task ${i}`, status: "COMPLETED" as const })),
})
const report = (date: string, u: ReturnType<typeof user>, clients: ReturnType<typeof client>[], source = "pms.zootcloud.com"): DailyReport => ({ source, date, submittedAt: `${date}T12:00:00Z`, updatedAt: `${date}T13:00:00Z`, user: u, clients })

const priya = user("u1", "Priya")
const arjun = user("u2", null)
const reports = [
  report("2026-11-26", priya, [client("o1", "Sunrise Bakery", "Banner draft", 1)]),
  report("2026-11-27", priya, [client("o1", "Sunrise Bakery", "Banner final", 2), client("o2", "Harbor Dental", "SEO audit")]),
  report("2026-11-27", arjun, [client("o1", "Sunrise Bakery", "", 1)]),
  // An order deleted in PMS leaves a report with no clients.
  report("2026-11-25", arjun, []),
]

describe("delivery work", () => {
  it("gathers each client's work, newest first, with its counts", () => {
    const clients = byClient(reports)
    expect(clients.map((c) => c.customerName)).toEqual(["Harbor Dental", "Sunrise Bakery"])
    const bakery = clients[1]!
    expect(bakery.entries.map((e) => [e.date, e.workDone])).toEqual([
      // Same day: by name, and one with no name goes by email.
      ["2026-11-27", "Banner final"],
      ["2026-11-27", ""],
      ["2026-11-26", "Banner draft"],
    ])
    expect([bakery.tasks, bakery.people, bakery.last]).toEqual([4, 2, "2026-11-27"])
  })

  it("gathers each member's days, by name (the email when there's none)", () => {
    const members = byMember(reports)
    expect(members.map((m) => m.user.id)).toEqual(["u1", "u2"])
    expect(members[0]).toMatchObject({ clients: 2, tasks: 3 })
    expect(members[0]!.days.map((d) => d.date)).toEqual(["2026-11-27", "2026-11-26"])
  })

  it("narrows to a member and to the clients the search matches", () => {
    expect(filterReports(reports, { member: "u2@example.com", search: "" }).length).toBe(2)
    const found = filterReports(reports, { member: "all", search: "audit" })
    expect(found.flatMap((r) => r.clients.map((c) => c.customerName))).toEqual(["Harbor Dental"])
  })

  it("puts one person on both sites together, and keeps each site's orders apart", () => {
    // The same person has a different PMS id on each site; the backend puts the site in front of order ids.
    const kpPriya = { ...priya, id: "kp-u9", email: "U1@example.com" }
    const both = [
      report("2026-11-27", priya, [client("pms.zootcloud.com:o1", "Sunrise Bakery", "Banner")]),
      report("2026-11-27", kpPriya, [client("pmskp.zootcloud.com:o1", "Lotus Spa", "Menu page", 1)], "pmskp.zootcloud.com"),
    ]
    const members = byMember(both)
    expect(members.length).toBe(1)
    expect(members[0]!.days.map((d) => [d.date, d.clients.map((c) => c.source)])).toEqual([["2026-11-27", ["pms.zootcloud.com", "pmskp.zootcloud.com"]]])
    expect(members[0]).toMatchObject({ clients: 2, tasks: 1 })
    expect(byClient(both).map((c) => [c.customerName, c.source])).toEqual([
      ["Lotus Spa", "pmskp.zootcloud.com"],
      ["Sunrise Bakery", "pms.zootcloud.com"],
    ])
    expect(filterReports(both, { member: "u1@example.com", search: "" }).length).toBe(2)
  })

  it("turns the period buttons into days", () => {
    const now = new Date(2026, 10, 28, 15, 0)
    expect(presetRange("today", now)).toEqual({ startDate: "2026-11-28", endDate: "2026-11-28" })
    expect(presetRange("7d", now)).toEqual({ startDate: "2026-11-22", endDate: "2026-11-28" })
    expect(presetRange("lastMonth", now)).toEqual({ startDate: "2026-10-01", endDate: "2026-10-31" })
  })
})
