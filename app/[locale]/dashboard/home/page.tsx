"use client"

import { useEffect, useMemo, useState } from "react"
import { Link, useRouter } from "@/i18n/navigation"
import { api } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"

// ── Shapes (subset of the keywords page's ProjectDetail) ──
type ProjectSummary = { id: string; name: string; domain: string; _count: { keywords: number } }
type Kw = {
  id: string
  keyword: string
  position: number | null
  d7: number | null
  monthlyTraffic: number | null
  searchVolume: number | null
}
type ProjectDetail = {
  id: string
  name: string
  domain: string
  domainAuthority: number | null
  domainBacklinks: number | null
  keywords: Kw[]
}

// ── Sample series for the Semrush-only widgets FreeSERP has no data source for
//    (AI visibility, organic traffic, traffic analytics). Purely visual. ──
const SPARK_UP = [8, 9, 9, 11, 10, 12, 13, 13, 15, 16, 18, 20]
const AREA_TRAFFIC = [62, 60, 58, 61, 66, 72, 78, 84, 90, 96, 101, 108]
const POS_CHANGES = [6, 3, 8, 4, 7, 9, 5, 11, 6, 8, 4, 10, 7, 12, 5, 9, 6, 13, 7, 10]

export default function HomeDashboard() {
  const router = useRouter()
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [selectedId, setSelectedId] = useState<string>("")
  const [detail, setDetail] = useState<ProjectDetail | null>(null)

  useEffect(() => {
    api
      .get<ProjectSummary[]>("/api/projects")
      .then((list) => {
        setProjects(list ?? [])
        if (list?.length) setSelectedId(list[0].id)
      })
      .catch(() => setProjects([]))
  }, [])

  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    api.get<ProjectDetail>(`/api/projects/${selectedId}`).then(setDetail).catch(() => setDetail(null))
  }, [selectedId])

  const stats = useMemo(() => {
    const kws = detail?.keywords ?? []
    const positions = kws.map((k) => k.position).filter((p): p is number => p != null)
    const avg = positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : null
    const top10 = positions.filter((p) => p <= 10).length
    return {
      total: kws.length,
      avg,
      top3: positions.filter((p) => p <= 3).length,
      top10,
      top20: positions.filter((p) => p <= 20).length,
      top100: positions.length,
      gained: kws.filter((k) => (k.d7 ?? 0) > 0).length,
      lost: kws.filter((k) => (k.d7 ?? 0) < 0).length,
      visibility: kws.length ? Math.round((top10 / kws.length) * 100) : 0,
      da: detail?.domainAuthority ?? null,
      backlinks: detail?.domainBacklinks ?? null,
    }
  }, [detail])

  const topKeywords = useMemo(
    () =>
      [...(detail?.keywords ?? [])]
        .filter((k) => k.position != null)
        .sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
        .slice(0, 6),
    [detail],
  )

  if (projects === null) return <div className="sr-loading">Loading your dashboard…</div>
  if (projects.length === 0) {
    return (
      <div className="sr-empty">
        <div className="eyebrow" style={{ justifyContent: "center" }}><span className="spark"><Icon.spark /></span> SEO DASHBOARD</div>
        <h2>No project yet</h2>
        <p>Create your first project to see its dashboard.</p>
        <Link href="/dashboard/projects"><button className="btn primary">Create a project</button></Link>
      </div>
    )
  }

  const nf = (n: number) => n.toLocaleString()
  const domain = detail?.domain ?? ""

  return (
    <div className="sr">
      {/* Header */}
      <div className="sr-head">
        <div className="sr-head-left">
          <span className="sr-crumb">SEO Dashboard</span>
          <select className="sr-proj" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.domain}</option>)}
          </select>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link href="/dashboard/projects"><button className="btn sm"><Icon.plus /> New project</button></Link>
          {selectedId && <button className="btn primary sm" onClick={() => router.push(`/dashboard/project/${selectedId}/keywords`)}>Open project</button>}
        </div>
      </div>

      {/* Row 1 — AI Search + SEO */}
      <div className="sr-row cols-2">
        <section className="sr-card">
          <div className="sr-card-h"><span className="sr-tag ai">AI Search</span><span className="sr-scope">{domain}</span></div>
          <div className="sr-ai-top">
            <div><div className="sr-lbl">AI Visibility</div><div className="sr-ai-gauge"><Gauge value={0} /><span className="sr-ai-num">0</span></div></div>
            <div><div className="sr-lbl">Mentions</div><div className="sr-big">0</div></div>
            <div><div className="sr-lbl">Cited pages</div><div className="sr-big">0</div></div>
          </div>
          <table className="sr-ai-table">
            <tbody>
              {[["ChatGPT", 0, 0], ["AI Overview", 0, 0], ["AI Mode", 0, 0], ["Gemini", 0, 0]].map(([name, m, c]) => (
                <tr key={name as string}><td>{name}</td><td className="sr-link-cell">{m}</td><td className="sr-link-cell">{c}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="sr-note">Sample — AI visibility isn&apos;t tracked yet</div>
        </section>

        <section className="sr-card">
          <div className="sr-card-h">
            <span className="sr-tag seo">SEO</span>
            <span className="sr-scope">Scope: Root Domain · United States · Desktop</span>
          </div>
          <div className="sr-seo-grid">
            <SeoStat label="Authority Score" value={stats.da != null ? String(stats.da) : "—"} real gauge={stats.da ?? 0} />
            <SeoStat label="Organic Traffic" value="—" spark />
            <SeoStat label="Organic Keywords" value={nf(stats.total)} real spark />
            <SeoStat label="Paid Keywords" value="—" />
            <SeoStat label="Backlinks" value={stats.backlinks != null ? nf(stats.backlinks) : "—"} real />
            <SeoStat label="Ref. Domains" value="—" />
          </div>
        </section>
      </div>

      {/* Row 2 — Position Tracking + Site Audit */}
      <div className="sr-row wide-left">
        <section className="sr-card">
          <div className="sr-card-h"><span className="sr-card-title">Position Tracking</span><span className="sr-scope">United States (Google) · English</span></div>
          <div className="sr-pt">
            <div className="sr-pt-vis">
              <div className="sr-lbl">Visibility</div>
              <div className="sr-vis-num">{stats.visibility}%</div>
              <AreaChart data={AREA_TRAFFIC} height={110} />
            </div>
            <div className="sr-pt-rings">
              <RingStat label="Top 3" value={stats.top3} />
              <RingStat label="Top 10" value={stats.top10} />
              <RingStat label="Top 20" value={stats.top20} />
              <RingStat label="Top 100" value={stats.top100} />
            </div>
            <div className="sr-pt-kw">
              <div className="sr-lbl" style={{ marginBottom: 6 }}>Top Keywords</div>
              {topKeywords.length === 0 ? (
                <div className="sr-note" style={{ padding: "8px 0" }}>No ranked keywords yet.</div>
              ) : (
                <table className="sr-kw-table">
                  <thead><tr><th>Keyword</th><th>Pos.</th></tr></thead>
                  <tbody>{topKeywords.map((k) => (<tr key={k.id}><td className="sr-kw">{k.keyword}</td><td><span className="sr-pos">{k.position}</span></td></tr>))}</tbody>
                </table>
              )}
            </div>
          </div>
          {selectedId && <Link className="sr-full" href={`/dashboard/project/${selectedId}/keywords`}>View full report →</Link>}
        </section>

        <section className="sr-card">
          <div className="sr-card-h"><span className="sr-card-title">Site Audit</span></div>
          <div className="sr-audit">
            <div className="sr-audit-health"><Gauge value={0} big /><div className="sr-lbl" style={{ textAlign: "center", marginTop: 4 }}>Site Health</div></div>
            <div className="sr-audit-nums">
              <div><div className="sr-audit-val neg">0</div><div className="sr-lbl">Errors</div></div>
              <div><div className="sr-audit-val warn">0</div><div className="sr-lbl">Warnings</div></div>
              <div><div className="sr-audit-val">0</div><div className="sr-lbl">Crawled pages</div></div>
            </div>
          </div>
          <Link className="sr-full" href="/dashboard/onpage-audit">Run a page audit →</Link>
        </section>
      </div>

      {/* Row 3 — Set-up cards (mapped to FreeSERP tools) */}
      <div className="sr-row cols-4">
        <SetupCard title="On-Page SEO Checker" desc="Collect ideas on strategy, content, backlinks and more." href="/dashboard/onpage-audit" />
        <SetupCard title="Keyword Magic" desc="Find hundreds of keyword ideas with volume & difficulty." href="/dashboard/keyword-magic" />
        <SetupCard title="Backlink Audit" desc="Strengthen your backlink profile and rankings." href={selectedId ? `/dashboard/project/${selectedId}/keywords` : "/dashboard/projects"} />
        <SetupCard title="Quick SERP" desc="Check where any domain ranks for a keyword, instantly." href="/dashboard/serp-checker" />
      </div>

      {/* Row 4 — Traffic Analytics + Organic Rankings */}
      <div className="sr-row wide-left">
        <section className="sr-card">
          <div className="sr-card-h"><span className="sr-card-title">Traffic Analytics</span><span className="sr-note" style={{ marginLeft: "auto" }}>Sample</span></div>
          <div className="sr-ta-row">
            <TaStat label="Visits" value="—" /><TaStat label="Unique Visitors" value="—" /><TaStat label="Pages / Visit" value="—" /><TaStat label="Bounce Rate" value="—" />
          </div>
          <AreaChart data={AREA_TRAFFIC} height={150} muted />
          <div className="sr-full-muted">Connect Google Analytics to see real traffic.</div>
        </section>

        <section className="sr-card">
          <div className="sr-card-h"><span className="sr-card-title">Keyword Position Changes</span></div>
          <div className="sr-lbl" style={{ marginBottom: 8 }}>Last 30 days</div>
          <Bars gained={stats.gained} lost={stats.lost} data={POS_CHANGES} />
          <div className="sr-legend"><span className="sr-dot up" /> Improved <span className="sr-dot down" /> Declined</div>
        </section>
      </div>

      {/* Row 5 — Backlinks + Connect */}
      <div className="sr-row cols-2">
        <section className="sr-card">
          <div className="sr-card-h"><span className="sr-card-title">Backlinks</span><span className="sr-scope">Scope: Root Domain</span></div>
          <div className="sr-bl">
            <div className="sr-bl-cell"><div className="sr-big accent">{stats.da != null ? stats.da : "—"}<span className="sr-sub">/100</span></div><div className="sr-lbl">Domain authority</div></div>
            <div className="sr-bl-cell"><div className="sr-big">{stats.backlinks != null ? nf(stats.backlinks) : "—"}</div><div className="sr-lbl">Backlinks (site-wide)</div></div>
          </div>
          <AreaChart data={AREA_TRAFFIC} height={90} />
        </section>

        <section className="sr-card sr-connect">
          <div className="sr-connect-icon"><Icon.globe /></div>
          <div className="sr-connect-title">Connect Google services</div>
          <p>Enrich your analysis with real-time data from Google Analytics and Search Console.</p>
          <button className="btn sm">Connect</button>
        </section>
      </div>
    </div>
  )
}

// ── Chart & stat primitives (inline SVG, Semrush-style indigo) ──────────────
function Gauge({ value, big }: { value: number; big?: boolean }) {
  const size = big ? 88 : 56
  const r = size / 2 - 5
  const cx = size / 2
  const cy = size / 2
  const pct = Math.max(0, Math.min(100, value)) / 100
  // semicircle from 180° to 0°
  const a = Math.PI * (1 - pct)
  const x = cx + r * Math.cos(a)
  const y = cy - r * Math.sin(a)
  const large = pct > 0.5 ? 1 : 0
  return (
    <svg width={size} height={size / 2 + 6} viewBox={`0 0 ${size} ${size / 2 + 6}`}>
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="var(--border)" strokeWidth="6" strokeLinecap="round" />
      {pct > 0 && <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 ${large} 1 ${x} ${y}`} fill="none" stroke="#7c5cff" strokeWidth="6" strokeLinecap="round" />}
    </svg>
  )
}

function Spark({ data }: { data: number[] }) {
  const w = 72, h = 24
  const max = Math.max(...data), min = Math.min(...data)
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * (h - 4) - 2}`).join(" ")
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}><polyline points={pts} fill="none" stroke="#7c5cff" strokeWidth="1.5" /></svg>
}

function AreaChart({ data, height = 120, muted }: { data: number[]; height?: number; muted?: boolean }) {
  const w = 100, h = height
  const max = Math.max(...data), min = Math.min(...data)
  const y = (v: number) => h - ((v - min) / (max - min || 1)) * (h - 12) - 6
  const line = data.map((v, i) => `${(i / (data.length - 1)) * w},${y(v)}`).join(" ")
  const area = `0,${h} ${line} ${w},${h}`
  const color = muted ? "#a78bfa" : "#7c5cff"
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs><linearGradient id={`g${height}${muted ? "m" : ""}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.28" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <polygon points={area} fill={`url(#g${height}${muted ? "m" : ""})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Bars({ gained, lost, data }: { gained: number; lost: number; data: number[] }) {
  const h = 120
  const max = Math.max(...data, 1)
  return (
    <div>
      <div className="sr-bars-head"><span className="sr-up">▲ {gained} improved</span><span className="sr-down">▼ {lost} declined</span></div>
      <svg width="100%" height={h} viewBox={`0 0 ${data.length * 6} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
        {data.map((v, i) => {
          const bh = (v / max) * (h - 10)
          const up = i % 3 !== 0
          return <rect key={i} x={i * 6 + 1} y={h - bh} width="4" height={bh} rx="1" fill={up ? "#12b886" : "#f59f00"} />
        })}
      </svg>
    </div>
  )
}

function SeoStat({ label, value, spark, gauge, real }: { label: string; value: string; spark?: boolean; gauge?: number; real?: boolean }) {
  return (
    <div className="sr-seo-stat">
      <div className="sr-lbl">{label}{!real && <span className="sr-mini-note"> · sample</span>}</div>
      <div className="sr-seo-val-row">
        {gauge != null && <Gauge value={gauge} />}
        <span className="sr-seo-val">{value}</span>
        {spark && <Spark data={SPARK_UP} />}
      </div>
    </div>
  )
}

function RingStat({ label, value }: { label: string; value: number }) {
  const r = 20, c = 2 * Math.PI * r
  const pct = Math.min(1, value / 100)
  return (
    <div className="sr-ring">
      <svg width="52" height="52" viewBox="0 0 52 52">
        <circle cx="26" cy="26" r={r} fill="none" stroke="var(--border)" strokeWidth="5" />
        <circle cx="26" cy="26" r={r} fill="none" stroke="#7c5cff" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 26 26)" />
        <text x="26" y="30" textAnchor="middle" fontSize="14" fontWeight="700" fill="currentColor">{value}</text>
      </svg>
      <div className="sr-lbl">{label}</div>
    </div>
  )
}

function TaStat({ label, value }: { label: string; value: string }) {
  return <div className="sr-ta-stat"><div className="sr-lbl">{label}</div><div className="sr-big">{value}</div></div>
}

function SetupCard({ title, desc, href }: { title: string; desc: string; href: string }) {
  return (
    <div className="sr-setup">
      <div className="sr-setup-title">{title}</div>
      <div className="sr-setup-desc">{desc}</div>
      <Link href={href}><button className="sr-setup-btn">Set up</button></Link>
    </div>
  )
}
