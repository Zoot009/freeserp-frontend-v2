"use client"

import { useEffect, useState } from "react"
import { useRouter, Link } from "@/i18n/navigation"
import { api, ApiError } from "@/lib/api"
import { toast } from "sonner"
import { ArrowRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProjectDashboard } from "@/components/dashboard/project-dashboard"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

const normalize = (v: string) =>
  v.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]

// ── Small preview mocks (HTML, sample data) ──────────────────────────────────
function Donut({ value, color = "var(--primary)" }: { value: number; color?: string }) {
  const r = 22, c = 2 * Math.PI * r, pct = Math.max(0, Math.min(100, value)) / 100
  return (
    <svg width="58" height="58" viewBox="0 0 60 60">
      <circle cx="30" cy="30" r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
      <circle cx="30" cy="30" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 30 30)" />
    </svg>
  )
}
function Bars({ data, color = "var(--primary)" }: { data: number[]; color?: string }) {
  return (
    <div className="flex h-14 items-end gap-1">
      {data.map((h, i) => <div key={i} className="w-1.5 rounded-sm" style={{ height: `${h}%`, background: color }} />)}
    </div>
  )
}
const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={"rounded-xl border bg-background p-4 shadow-sm " + className}>{children}</div>
)

function PositionsPreview() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Card>
        <div className="text-xs font-medium text-muted-foreground">Rankings</div>
        <div className="mt-3 flex items-center justify-between text-sm"><span>Top 3</span><span className="font-bold text-primary">23</span></div>
        <div className="mt-2 flex items-center justify-between text-sm"><span>Top 10</span><span className="font-bold">88</span></div>
        <div className="mt-2 flex items-center justify-between text-sm"><span>Top 100</span><span className="font-bold">129</span></div>
      </Card>
      <Card>
        <div className="text-xs font-medium text-muted-foreground">Visibility</div>
        <div className="mt-1 text-2xl font-bold text-emerald-600">41% <span className="text-xs font-medium">+6%</span></div>
        <div className="mt-3"><Bars data={[35, 42, 40, 55, 60, 58, 70, 76, 82, 90]} /></div>
      </Card>
    </div>
  )
}
function KeywordPreview() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Card>
        <div className="text-xs font-medium text-muted-foreground">Volume</div>
        <div className="text-2xl font-bold">5.4K</div>
        <div className="mt-3 text-xs font-medium text-muted-foreground">Keyword Difficulty</div>
        <div className="mt-1 flex items-center gap-3"><Donut value={58} /><div><div className="text-xl font-bold">58%</div><div className="text-xs text-muted-foreground">Medium</div></div></div>
      </Card>
      <Card>
        <div className="text-xs font-medium text-muted-foreground">Global volume</div>
        <div className="text-2xl font-bold">17.5K</div>
        <div className="mt-3 text-xs font-medium text-muted-foreground">Trend</div>
        <div className="mt-1"><Bars data={[45, 60, 52, 70, 58, 66, 74, 62, 80, 88]} color="var(--brand-deep, #1e40d8)" /></div>
      </Card>
    </div>
  )
}
function CompetitorPreview() {
  return (
    <Card>
      <div className="text-xs font-medium text-muted-foreground">Main organic competitors</div>
      <div className="mt-3 space-y-2.5 text-sm">
        <div className="grid grid-cols-[1fr_auto_60px] items-center gap-3 text-[11px] font-medium text-muted-foreground"><span>Domain</span><span>Keywords</span><span>Overlap</span></div>
        {[["competitor-a.com", "185K", 90], ["competitor-b.com", "142K", 64], ["competitor-c.com", "98K", 41]].map(([d, k, o]) => (
          <div key={d as string} className="grid grid-cols-[1fr_auto_60px] items-center gap-3">
            <span className="truncate text-primary">{d}</span>
            <span className="text-xs">{k}</span>
            <span className="h-1.5 rounded-full bg-primary/20"><span className="block h-1.5 rounded-full bg-primary" style={{ width: `${o}%` }} /></span>
          </div>
        ))}
      </div>
    </Card>
  )
}
function IssuesPreview() {
  return (
    <Card>
      <div className="mb-2 text-xs font-medium text-muted-foreground">Errors</div>
      <div className="space-y-2 text-sm">
        {[["21 pages have duplicate content", "high"], ["16 internal links are broken", "high"], ["4 pages load slowly", "med"], ["1 image missing alt text", "low"]].map(([t, sev]) => (
          <div key={t as string} className="flex items-center justify-between">
            <span className="truncate text-primary">{t}</span>
            <span className={"ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold " + (sev === "high" ? "bg-red-100 text-red-600" : sev === "med" ? "bg-amber-100 text-amber-600" : "bg-muted text-muted-foreground")}>{sev === "high" ? "Error" : sev === "med" ? "Warn" : "Notice"}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}
function BacklinksPreview() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Card>
        <div className="text-xs font-medium text-muted-foreground">Authority Score</div>
        <div className="mt-1 flex items-center gap-3"><Donut value={54} color="#10b981" /><div className="text-2xl font-bold">54<span className="text-xs font-medium text-muted-foreground">/100</span></div></div>
      </Card>
      <Card>
        <div className="text-xs font-medium text-muted-foreground">Total backlinks</div>
        <div className="text-2xl font-bold">1.2K</div>
        <div className="mt-3"><Bars data={[30, 34, 44, 40, 52, 60, 58, 70, 78, 85]} color="#8b5cf6" /></div>
      </Card>
    </div>
  )
}
function DifficultyPreview() {
  return (
    <Card>
      <div className="text-xs font-medium text-muted-foreground">Keyword Difficulty</div>
      <div className="mt-2 flex items-center gap-4"><Donut value={82} color="#ef4444" /><div><div className="text-3xl font-bold">82%</div><div className="text-xs text-muted-foreground">Very hard</div></div></div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
        <div><div className="font-bold">$0.49</div><div className="text-[10px] text-muted-foreground">CPC</div></div>
        <div><div className="font-bold">Commercial</div><div className="text-[10px] text-muted-foreground">Intent</div></div>
        <div><div className="font-bold">0.56</div><div className="text-[10px] text-muted-foreground">Competition</div></div>
      </div>
    </Card>
  )
}

// ── Tool sections ────────────────────────────────────────────────────────────
const SECTIONS: { tag: string; title: string; desc: string; cta: string; href: string; preview: React.ReactNode }[] = [
  { tag: "Rank Tracking", title: "Track your positions on Google — every single day", desc: "Monitor where your keywords rank across 190+ countries, catch every gain and drop, and prove your SEO progress over time.", cta: "Track positions", href: "/dashboard/projects", preview: <PositionsPreview /> },
  { tag: "Keyword Magic Tool", title: "Find the right keywords & content ideas", desc: "Discover hundreds of high-intent keywords from a single seed — with real search volume, difficulty, CPC and intent.", cta: "Explore keyword ideas", href: "/dashboard/keyword-magic", preview: <KeywordPreview /> },
  { tag: "Competitor Analysis", title: "Outsmart your competition with high-impact analysis", desc: "Get a clear roadmap to outrank your rivals by uncovering their keywords, backlinks, and strategies.", cta: "Analyze competitors", href: "/dashboard/projects", preview: <CompetitorPreview /> },
  { tag: "Page Score Checker", title: "Understand the SEO issues holding you back", desc: "Audit any page, get an SEO score, and fix the exact issues hurting your rankings — with clear, actionable guidance.", cta: "Run a page audit", href: "/dashboard/onpage-audit", preview: <IssuesPreview /> },
  { tag: "Backlinks & Authority", title: "Build authority & trust that outlasts your rivals", desc: "Track your domain authority and site-wide backlinks over time to fuel search rankings and long-term SEO success.", cta: "View backlinks", href: "/dashboard/projects", preview: <BacklinksPreview /> },
  { tag: "Keyword Score Checker", title: "Check how hard it is to rank — before you invest", desc: "Instantly evaluate keyword difficulty and opportunity so you prioritise the terms you can actually win.", cta: "Check difficulty", href: "/dashboard/keyword-analysis", preview: <DifficultyPreview /> },
]

const STATS = [
  { value: "190+", label: "countries tracked" },
  { value: "100%", label: "free — no card" },
  { value: "Daily", label: "rank updates" },
  { value: "Real-time", label: "SERP data" },
]

const FAQ = [
  { q: "Is FreeSERP really free?", a: "Yes. You can track rankings, research keywords, analyze competitors, and audit pages for free — no credit card required. Paid plans simply raise your daily limits." },
  { q: "How often are rankings updated?", a: "Tracked keywords are checked daily on Google, and you can run an on-demand check anytime from your project." },
  { q: "Which tools does FreeSERP include?", a: "Rank Tracking, Keyword Magic, Keyword Score Checker, Page Score Checker, Quick SERP, competitor analysis, and backlink/authority tracking — all in one dashboard." },
  { q: "Do I need to install anything?", a: "No. FreeSERP runs entirely in your browser. Just enter your website and start tracking." },
  { q: "Can I track competitors?", a: "Yes — add competitors to any project to see how you stack up on the keywords that matter." },
]

export default function DashboardHome() {
  const router = useRouter()
  const [website, setWebsite] = useState("")
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(true)
  const [projectId, setProjectId] = useState<string | null>(null)

  // Overview IS the dashboard. If the user has a project, render its SEO
  // Dashboard right here; only users with NO project see the toolkit landing.
  useEffect(() => {
    api
      .get<{ id: string }[]>("/api/projects")
      .then((list) => { if (list?.length) setProjectId(list[0].id) })
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [])

  const start = async (input?: string) => {
    const domain = normalize(input ?? website)
    if (!domain || !domain.includes(".")) { toast.error("Enter a valid website, e.g. example.com"); return }
    setBusy(true)
    try {
      const p = await api.post<{ id?: string }>("/api/projects", { name: domain, domain })
      toast.success(`Tracking ${domain}`)
      window.dispatchEvent(new Event("fx:website-added"))
      setWebsite("")
      // Drop straight into the dashboard for the new project (auto-seeded).
      if (p?.id) setProjectId(p.id)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't start — please try again.")
    } finally { setBusy(false) }
  }

  const DomainForm = ({ cta = "Create project" }: { cta?: string }) => (
    <div className="mx-auto flex max-w-lg gap-2">
      <Input value={website} onChange={(e) => setWebsite(e.target.value)} onKeyDown={(e) => e.key === "Enter" && start()} placeholder="Enter your domain, e.g. example.com" className="h-12 text-base" />
      <Button size="lg" className="h-12 px-6" onClick={() => start()} disabled={busy}>{busy ? "Starting…" : cta}</Button>
    </div>
  )

  // While we check for an existing project, avoid flashing the toolkit landing.
  if (checking) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Has a project → Overview shows its SEO Dashboard.
  if (projectId) return <ProjectDashboard projectId={projectId} />

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      {/* ── Hero ── */}
      <section className="rounded-2xl border bg-card px-6 py-12 text-center shadow-sm">
        <h1 className="mx-auto max-w-3xl text-3xl font-bold tracking-tight md:text-[2.5rem] md:leading-tight">
          The FreeSERP SEO Toolkit — everything you need to rank higher
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[15px] text-muted-foreground">
          Track rankings, find keywords, analyze competitors, and audit your pages — with the SEO tools you can trust, 100% free.
        </p>
        <div className="mt-7"><DomainForm /></div>
        <p className="mt-3 text-xs text-muted-foreground">Free plan — no credit card required.</p>
      </section>

      {/* ── Run Research / Take Action / See Results ── */}
      <section className="mt-16 grid gap-8 text-center md:grid-cols-3">
        {[
          ["Run research", "Gather and interpret data about your SEO market — keywords, competitors, and backlinks."],
          ["Take action", "Get tailored recommendations and clear next steps for every keyword and page."],
          ["See results", "Watch your rankings, visibility, and traffic improve — and prove it with daily data."],
        ].map(([t, d]) => (
          <div key={t}>
            <h3 className="text-lg font-bold">{t}</h3>
            <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">{d}</p>
          </div>
        ))}
      </section>

      {/* ── Tool sections ── */}
      <div className="mt-8 space-y-6">
        {SECTIONS.map((s, i) => (
          <section key={s.tag} className="grid items-center gap-8 rounded-2xl border bg-card p-6 shadow-sm md:grid-cols-2 md:p-10">
            <div className={i % 2 === 1 ? "md:order-2" : ""}>
              <p className="text-sm font-semibold text-primary">{s.tag}</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight">{s.title}</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{s.desc}</p>
              <Button asChild className="mt-5">
                <Link href={s.href}>{s.cta} <ArrowRight className="size-4" /></Link>
              </Button>
            </div>
            <div className={i % 2 === 1 ? "md:order-1" : ""}>{s.preview}</div>
          </section>
        ))}
      </div>

      {/* ── Stats band ── */}
      <section className="mt-16 grid grid-cols-2 gap-6 rounded-2xl border bg-card px-6 py-10 text-center shadow-sm md:grid-cols-4">
        {STATS.map((st) => (
          <div key={st.label}>
            <div className="text-3xl font-bold text-primary">{st.value}</div>
            <div className="mt-1 text-sm text-muted-foreground">{st.label}</div>
          </div>
        ))}
      </section>

      {/* ── Final CTA ── */}
      <section className="mt-16 text-center">
        <h2 className="text-2xl font-bold">Ready to climb the rankings?</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Enter your website and get your first rankings in minutes.</p>
        <div className="mt-6"><DomainForm cta="Start now" /></div>
      </section>

      {/* ── FAQ ── */}
      <section className="mx-auto mt-16 max-w-3xl">
        <h2 className="text-center text-2xl font-bold">FreeSERP FAQs</h2>
        <Accordion type="single" collapsible className="mt-6">
          {FAQ.map((f) => (
            <AccordionItem key={f.q} value={f.q}>
              <AccordionTrigger className="text-left text-base font-semibold">{f.q}</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </div>
  )
}
