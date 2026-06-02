"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { useAuth } from "@/lib/auth"
import { AnimatedNoise } from "@/components/animated-noise"
import axios from "@/lib/axios"

const API = process.env.NEXT_PUBLIC_API_URL || ""

interface Overview {
  totalUsers: number
  totalLeads: number
  totalReports: number
  hotLeads: number
  todaySignups: number
  todayReports: number
  totalCredits: number
  totalCost: number
  pricePerRequest: number
}

interface AdminUserRow {
  id: string
  email: string
  name: string | null
  plan: string
  planExpiresAt: string | null
  emailVerified: boolean
  creditsLifetime: number
  dodoCustomerId: string | null
  createdAt: string
  lastActivityAt: string
  projectCount: number
  keywordCount: number
  analysisCount: number
  creditsTracked: number
  costTracked: number
}

interface AdminUserListResponse {
  users: AdminUserRow[]
  nextCursor: string | null
  limit: number
}

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—")
const fmtRelative = (iso: string) => {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime())
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return fmtDate(iso)
}

// Build a YYYY-MM-DD string from a Date in the local timezone — matches what
// <input type="date"> expects/produces and avoids a UTC off-by-one near
// midnight that would otherwise drop / double-count yesterday's signups.
function toDateInputValue(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

type DatePreset = "all" | "today" | "7d" | "30d" | "custom"

// Compute the date-range bounds for each preset. `null` means "no bound".
function presetRange(preset: DatePreset): { from: string | null; to: string | null } {
  if (preset === "all" || preset === "custom") return { from: null, to: null }
  const today = new Date()
  const to = toDateInputValue(today)
  if (preset === "today") return { from: to, to }
  const back = new Date(today)
  back.setDate(today.getDate() - (preset === "7d" ? 6 : 29))
  return { from: toDateInputValue(back), to }
}
export default function AdminPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()

  const [checkingAdmin, setCheckingAdmin] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [planFilter, setPlanFilter] = useState<"all" | "free" | "paid">("all")
  const [datePreset, setDatePreset] = useState<DatePreset>("all")
  const [fromDate, setFromDate] = useState<string>("")
  const [toDate, setToDate] = useState<string>("")
  const [error, setError] = useState("")

  // Gate access — check both that auth has loaded and that the user is admin
  // (via the isAdmin flag on /api/usage). Non-admins get bounced to /dashboard.
  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace("/login")
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await axios.get(`${API}/api/usage`, { withCredentials: true })
        const data = res.data
        if (cancelled) return
        if (!data.isAdmin) {
          router.replace("/dashboard")
          return
        }
        setIsAdmin(true)
      } catch {
        if (!cancelled) router.replace("/dashboard")
      } finally {
        if (!cancelled) setCheckingAdmin(false)
      }
    })()
    return () => { cancelled = true }
  }, [authLoading, user, router])

  const loadOverview = useCallback(async () => {
    try {
      const res = await axios.get<Overview>(`${API}/api/admin/overview`, { withCredentials: true })
      if (res.status < 200 || res.status >= 300) throw new Error("Failed to load overview")
      const data = res.data
      setOverview(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load overview")
    }
  }, [])

  const loadUsers = useCallback(async (opts: { append?: boolean; cursor?: string | null } = {}) => {
    setUsersLoading(true)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set("q", search.trim())
      if (planFilter !== "all") params.set("plan", planFilter)
      if (fromDate) params.set("from", fromDate)
      if (toDate) params.set("to", toDate)
      if (opts.cursor) params.set("cursor", opts.cursor)
      params.set("limit", "50")
      const res = await axios.get<AdminUserListResponse>(`${API}/api/admin/users?${params}`, { withCredentials: true })
      if (res.status < 200 || res.status >= 300) throw new Error("Failed to load users")
      const data = res.data
      setUsers((prev) => (opts.append ? [...prev, ...data.users] : data.users))
      setNextCursor(data.nextCursor)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users")
    } finally {
      setUsersLoading(false)
    }
  }, [search, planFilter, fromDate, toDate])

  // When a preset (Today / 7d / 30d / All) is picked, sync the date inputs so
  // they reflect the active range and the user can switch to "Custom" for
  // fine-tuning without losing context.
  const applyPreset = useCallback((p: DatePreset) => {
    setDatePreset(p)
    if (p === "custom") return
    const { from, to } = presetRange(p)
    setFromDate(from ?? "")
    setToDate(to ?? "")
  }, [])

  // Typing in either date input implicitly switches to "custom" so the preset
  // chips don't mislead the operator about what's being applied.
  const handleFromChange = (v: string) => { setFromDate(v); setDatePreset("custom") }
  const handleToChange = (v: string) => { setToDate(v); setDatePreset("custom") }
  const clearDates = () => { setFromDate(""); setToDate(""); setDatePreset("all") }

  useEffect(() => {
    if (!isAdmin) return
    loadOverview()
  }, [isAdmin, loadOverview])

  useEffect(() => {
    if (!isAdmin) return
    loadUsers()
  }, [isAdmin, loadUsers])

  const stats = useMemo(() => {
    if (!overview) return []
    return [
      { label: "Total Users", value: overview.totalUsers.toLocaleString() },
      { label: "Signups Today", value: overview.todaySignups.toLocaleString() },
      { label: "Reports Today", value: overview.todayReports.toLocaleString() },
      { label: "Total Reports", value: overview.totalReports.toLocaleString() },
      { label: "Total Credits", value: overview.totalCredits.toLocaleString() },
      { label: "Total Spend", value: `$${overview.totalCost.toFixed(2)}` },
    ]
  }, [overview])

  if (authLoading || checkingAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-6 w-6 rounded-full border-2 border-accent/50 border-t-accent animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AnimatedNoise opacity={0.025} />

      {/* Top bar */}
      <header className="border-b border-border/40 px-6 md:px-10 py-5 flex items-center justify-between gap-4 relative z-10">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-[var(--font-bebas)] text-2xl tracking-tight hover:text-accent transition-colors">
            FREE SERP
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent border border-accent/40 px-2 py-1">Admin</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors">
            ← Dashboard
          </Link>
          <button
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors px-2 py-1 border border-border/40"
          >
            {resolvedTheme === "dark" ? "Light" : "Dark"}
          </button>
        </div>
      </header>

      <main className="relative z-10 px-6 md:px-10 py-10 max-w-7xl mx-auto w-full">
        <div className="mb-10">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">Operator Console</span>
          <h1 className="mt-1 font-[var(--font-bebas)] text-5xl md:text-6xl tracking-tight leading-none">ADMIN DASHBOARD</h1>
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            Hello {user?.name || user?.email}. Visible only to operators in <span className="text-foreground">ADMIN_EMAILS</span>.
          </p>
        </div>

        {error && (
          <div className="mb-6 border border-red-500/30 bg-red-500/5 px-4 py-3">
            <p className="font-mono text-[11px] text-red-400">{error}</p>
          </div>
        )}

        {/* Overview cards */}
        <section className="mb-10">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3">Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {stats.length === 0
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="border border-border/40 bg-card/20 p-4 h-24 animate-pulse" />
                ))
              : stats.map((s) => (
                  <div key={s.label} className="border border-border/40 bg-card/20 p-4">
                    <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70 mb-2">{s.label}</div>
                    <div className="font-[var(--font-bebas)] text-3xl tracking-tight text-foreground">{s.value}</div>
                  </div>
                ))}
          </div>
        </section>

        {/* Users */}
        <section>
          <div className="flex items-end justify-between mb-3 flex-wrap gap-3">
            <div>
              <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">All Users</h2>
              {(fromDate || toDate) && (
                <p className="mt-1 font-mono text-[10px] text-muted-foreground/70">
                  Joined {fromDate ? <span className="text-accent">{fromDate}</span> : "anytime"}
                  {" → "}
                  {toDate ? <span className="text-accent">{toDate}</span> : "today"}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="search"
                placeholder="Search by email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-card border border-border/50 px-3 py-1.5 font-mono text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-accent transition-colors w-56"
              />
              <select
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value as typeof planFilter)}
                className="bg-card border border-border/50 px-3 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:border-accent"
              >
                <option value="all">All plans</option>
                <option value="free">Free</option>
                <option value="paid">Paid</option>
              </select>
            </div>
          </div>

          {/* Date range filter — preset chips + custom inputs */}
          <div className="mb-3 border border-border/40 bg-card/10 px-3 py-2.5 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground mr-1">
              Joined
            </span>
            {([
              { key: "all",   label: "All time" },
              { key: "today", label: "Today" },
              { key: "7d",    label: "7 Days" },
              { key: "30d",   label: "30 Days" },
              { key: "custom",label: "Custom" },
            ] as { key: DatePreset; label: string }[]).map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p.key)}
                className={`font-mono text-[10px] uppercase tracking-widest px-2.5 py-1 border transition-colors ${
                  datePreset === p.key
                    ? "bg-accent text-accent-foreground border-accent"
                    : "border-border/40 text-muted-foreground hover:border-accent/60 hover:text-accent"
                }`}
              >
                {p.label}
              </button>
            ))}

            <div className="flex items-center gap-1.5 ml-1">
              <label className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70">From</label>
              <input
                type="date"
                value={fromDate}
                max={toDate || undefined}
                onChange={(e) => handleFromChange(e.target.value)}
                className="bg-card border border-border/50 px-2 py-1 font-mono text-[11px] text-foreground focus:outline-none focus:border-accent"
              />
              <label className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70 ml-1">To</label>
              <input
                type="date"
                value={toDate}
                min={fromDate || undefined}
                onChange={(e) => handleToChange(e.target.value)}
                className="bg-card border border-border/50 px-2 py-1 font-mono text-[11px] text-foreground focus:outline-none focus:border-accent"
              />
              {(fromDate || toDate) && (
                <button
                  type="button"
                  onClick={clearDates}
                  className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-red-400 ml-1 px-2 py-1 border border-transparent hover:border-red-400/40 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="border border-border/40 overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="bg-card/20 border-b border-border/40">
                <tr>
                  <th className="px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground/70 font-normal">Email</th>
                  <th className="px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground/70 font-normal">Plan</th>
                  <th className="px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground/70 font-normal">Joined</th>
                  <th className="px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground/70 font-normal text-right">Projects</th>
                  <th className="px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground/70 font-normal text-right">Keywords</th>
                  <th className="px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground/70 font-normal text-right">Analyses</th>
                  <th className="px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground/70 font-normal text-right">Credits</th>
                  <th className="px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground/70 font-normal text-right">Spend</th>
                  <th className="px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground/70 font-normal">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && !usersLoading && (
                  <tr>
                    <td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">
                      No users match.
                    </td>
                  </tr>
                )}
                {users.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => router.push(`/admin/users/${u.id}`)}
                    className="border-b border-border/30 last:border-b-0 cursor-pointer hover:bg-accent/5 transition-colors"
                  >
                    <td className="px-3 py-2.5">
                      <div className="text-foreground">{u.email}</div>
                      {u.name && <div className="text-[10px] text-muted-foreground/60">{u.name}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 text-[10px] uppercase tracking-widest border ${
                        u.plan === "paid"
                          ? "border-accent/50 text-accent bg-accent/5"
                          : "border-border/40 text-muted-foreground"
                      }`}>
                        {u.plan}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{fmtDate(u.createdAt)}</td>
                    <td className="px-3 py-2.5 text-right text-foreground">{u.projectCount}</td>
                    <td className="px-3 py-2.5 text-right text-foreground">{u.keywordCount}</td>
                    <td className="px-3 py-2.5 text-right text-foreground">{u.analysisCount}</td>
                    <td className="px-3 py-2.5 text-right text-foreground">{u.creditsTracked.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground">${u.costTracked.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground/80">{fmtRelative(u.lastActivityAt)}</td>
                  </tr>
                ))}
                {usersLoading && (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center">
                      <span className="inline-block h-4 w-4 rounded-full border-2 border-accent/50 border-t-accent animate-spin" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {nextCursor && (
            <div className="mt-3 flex justify-center">
              <button
                onClick={() => loadUsers({ append: true, cursor: nextCursor })}
                disabled={usersLoading}
                className="border border-border/50 hover:border-accent hover:text-accent px-5 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors disabled:opacity-40"
              >
                Load more
              </button>
            </div>
          )}
        </section>
      </main>

    </div>
  )
}
