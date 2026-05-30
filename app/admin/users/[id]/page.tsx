"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { useAuth } from "@/lib/auth"
import { AnimatedNoise } from "@/components/animated-noise"
import { http } from "@/lib/http"

const API = process.env.NEXT_PUBLIC_API_URL || ""

interface UserDetailResponse {
  user: {
    id: string
    email: string
    name: string | null
    plan: string
    planExpiresAt: string | null
    emailVerified: boolean
    credits: number
    dodoCustomerId: string | null
    dodoSubscriptionId: string | null
    createdAt: string
    updatedAt: string
  }
  projects: Array<{
    id: string
    name: string
    domain: string
    isActive: boolean
    isPaused: boolean
    createdAt: string
    _count: { keywords: number }
  }>
  analyses: Array<{
    id: string
    keyword: string
    yourDomain: string
    status: string
    createdAt: string
    completedAt: string | null
  }>
  usage: {
    total: { credits: number; cost: number; requestCount: number }
    byAction: Array<{ action: string; credits: number; cost: number; requestCount: number }>
    recent: Array<{
      id: string
      action: string
      credits: number
      cost: number
      keyword: string | null
      domain: string | null
      createdAt: string
    }>
  }
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"
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

export default function AdminUserDetailPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const params = useParams<{ id: string }>()
  const userId = params?.id

  const [isAdmin, setIsAdmin] = useState(false)
  const [checkingAdmin, setCheckingAdmin] = useState(true)
  const [detail, setDetail] = useState<UserDetailResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace("/login")
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await http.get(`${API}/api/usage`, { withCredentials: true })
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

  const loadDetail = useCallback(async () => {
    if (!userId) return
    setDetailLoading(true)
    try {
      const res = await http.get<UserDetailResponse>(`${API}/api/admin/users/${userId}`, { withCredentials: true })
      if (res.status === 404) {
        setError("User not found")
        setDetail(null)
        return
      }
      if (res.status < 200 || res.status >= 300) throw new Error("Failed to load user")
      const data = res.data
      setDetail(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load user")
    } finally {
      setDetailLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (!isAdmin) return
    loadDetail()
  }, [isAdmin, loadDetail])

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

      <header className="border-b border-border/40 px-6 md:px-10 py-5 flex items-center justify-between gap-4 relative z-10">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-[var(--font-bebas)] text-2xl tracking-tight hover:text-accent transition-colors">
            FREE SERP
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent border border-accent/40 px-2 py-1">Admin</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin" className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors">
            ← All Users
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
        {error && (
          <div className="mb-6 border border-red-500/30 bg-red-500/5 px-4 py-3">
            <p className="font-mono text-[11px] text-red-400">{error}</p>
          </div>
        )}

        {detailLoading || !detail ? (
          <div className="py-20 flex justify-center">
            <span className="inline-block h-6 w-6 rounded-full border-2 border-accent/50 border-t-accent animate-spin" />
          </div>
        ) : (
          <>
            <div className="mb-10">
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">User Profile</span>
              <h1 className="mt-1 font-[var(--font-bebas)] text-5xl md:text-6xl tracking-tight leading-none break-all">
                {detail.user.email.toUpperCase()}
              </h1>
              <p className="mt-3 font-mono text-xs text-muted-foreground">
                {detail.user.name || "(no name set)"} · ID <span className="text-foreground">{detail.user.id}</span>
              </p>
            </div>

            {/* Profile + payment cards */}
            <section className="mb-10">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3">Profile</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card label="Plan" value={detail.user.plan.toUpperCase()} accent={detail.user.plan === "paid"} />
                <Card label="Plan Expires" value={fmtDate(detail.user.planExpiresAt)} />
                <Card label="Email Verified" value={detail.user.emailVerified ? "Yes" : "No"} />
                <Card label="Signed Up" value={fmtDate(detail.user.createdAt)} />
                <Card label="Last Update" value={fmtRelative(detail.user.updatedAt)} />
                <Card label="Lifetime Credits" value={detail.user.credits.toLocaleString()} mono />
                <Card label="Dodo Customer" value={detail.user.dodoCustomerId || "—"} small />
                <Card label="Dodo Subscription" value={detail.user.dodoSubscriptionId || "—"} small />
              </div>
            </section>

            {/* Real scrape.do credit usage */}
            <section className="mb-10">
              <div className="flex items-baseline gap-3 mb-3">
                <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Credit Usage (scrape.do)</h2>
                <span className="font-mono text-[9px] text-muted-foreground/60 uppercase tracking-widest">
                  Read from scrape.do response headers
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <Card label="API Requests" value={detail.usage.total.requestCount.toLocaleString()} />
                <Card label="Credits Used" value={detail.usage.total.credits.toLocaleString()} />
                <Card label="Cost" value={`$${detail.usage.total.cost.toFixed(4)}`} />
              </div>

              {detail.usage.byAction.length === 0 ? (
                <p className="font-mono text-xs text-muted-foreground/70">No credit usage recorded for this user yet.</p>
              ) : (
                <div className="border border-border/40 overflow-x-auto mb-4">
                  <table className="w-full font-mono text-xs">
                    <thead className="bg-card/20 border-b border-border/40">
                      <tr>
                        <Th>Action</Th>
                        <Th right>Calls</Th>
                        <Th right>Credits</Th>
                        <Th right>Cost</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.usage.byAction.map((row) => (
                        <tr key={row.action} className="border-b border-border/30 last:border-b-0">
                          <td className="px-3 py-2 text-foreground">{row.action}</td>
                          <td className="px-3 py-2 text-right">{row.requestCount.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{row.credits.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">${row.cost.toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {detail.usage.recent.length > 0 && (
                <details className="font-mono text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-accent uppercase tracking-widest text-[10px] mb-2">
                    Last {detail.usage.recent.length} requests
                  </summary>
                  <div className="border border-border/40 overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-card/20 border-b border-border/40">
                        <tr>
                          <Th>When</Th>
                          <Th>Action</Th>
                          <Th>Keyword / Domain</Th>
                          <Th right>Credits</Th>
                          <Th right>Cost</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.usage.recent.map((row) => (
                          <tr key={row.id} className="border-b border-border/30 last:border-b-0">
                            <td className="px-3 py-2 text-muted-foreground">{fmtRelative(row.createdAt)}</td>
                            <td className="px-3 py-2 text-foreground">{row.action}</td>
                            <td className="px-3 py-2 text-muted-foreground/80">{row.keyword || row.domain || "—"}</td>
                            <td className="px-3 py-2 text-right">{row.credits}</td>
                            <td className="px-3 py-2 text-right">${row.cost.toFixed(4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </section>

            {/* Projects */}
            <section className="mb-10">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3">
                Projects ({detail.projects.length})
              </h2>
              {detail.projects.length === 0 ? (
                <p className="font-mono text-xs text-muted-foreground/70">No projects.</p>
              ) : (
                <div className="border border-border/40 overflow-x-auto">
                  <table className="w-full font-mono text-xs">
                    <thead className="bg-card/20 border-b border-border/40">
                      <tr>
                        <Th>Name</Th>
                        <Th>Domain</Th>
                        <Th right>Keywords</Th>
                        <Th>Status</Th>
                        <Th>Created</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.projects.map((p) => (
                        <tr key={p.id} className="border-b border-border/30 last:border-b-0">
                          <td className="px-3 py-2 text-foreground">{p.name}</td>
                          <td className="px-3 py-2 text-muted-foreground">{p.domain}</td>
                          <td className="px-3 py-2 text-right">{p._count.keywords}</td>
                          <td className="px-3 py-2 text-muted-foreground/80">
                            {!p.isActive ? "Inactive" : p.isPaused ? "Paused" : "Active"}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground/80">{fmtDate(p.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Analyses */}
            <section>
              <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3">
                Recent Competitor Analyses ({detail.analyses.length})
              </h2>
              {detail.analyses.length === 0 ? (
                <p className="font-mono text-xs text-muted-foreground/70">No analyses run.</p>
              ) : (
                <div className="border border-border/40 overflow-x-auto">
                  <table className="w-full font-mono text-xs">
                    <thead className="bg-card/20 border-b border-border/40">
                      <tr>
                        <Th>Keyword</Th>
                        <Th>Domain</Th>
                        <Th>Status</Th>
                        <Th>Started</Th>
                        <Th>Completed</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.analyses.map((a) => (
                        <tr key={a.id} className="border-b border-border/30 last:border-b-0">
                          <td className="px-3 py-2 text-foreground">{a.keyword}</td>
                          <td className="px-3 py-2 text-muted-foreground">{a.yourDomain}</td>
                          <td className="px-3 py-2 text-muted-foreground/80">{a.status}</td>
                          <td className="px-3 py-2 text-muted-foreground/80">{fmtRelative(a.createdAt)}</td>
                          <td className="px-3 py-2 text-muted-foreground/80">{a.completedAt ? fmtRelative(a.completedAt) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}

function Card({ label, value, accent, small, mono }: { label: string; value: string; accent?: boolean; small?: boolean; mono?: boolean }) {
  return (
    <div className="border border-border/40 bg-card/20 p-4">
      <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70 mb-2">{label}</div>
      <div
        className={`${small ? "font-mono text-xs break-all" : mono ? "font-[var(--font-bebas)] text-3xl tracking-tight" : "font-[var(--font-bebas)] text-3xl tracking-tight"} ${accent ? "text-accent" : "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground/70 font-normal ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  )
}
