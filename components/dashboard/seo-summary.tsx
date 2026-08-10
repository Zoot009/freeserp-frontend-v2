"use client"

import { useEffect, useState } from "react"
import { Area, AreaChart } from "recharts"
import { ChartContainer } from "@/components/ui/chart"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Info, X, ChevronDown, Monitor, Plus, Loader2, Globe } from "lucide-react"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

const nf = (n: number) => n.toLocaleString()

type TrendPoint = { label: string; v: number }
type AiKeyword = { id: string; keyword: string; position: number | null }

type AivChannel = { available: boolean; mentions: number; cited: number | null; checked: number }
type AiVisibility = {
  computedAt: string
  domain: string
  keywordsChecked: number
  channels: { aiOverview: AivChannel; chatgpt: AivChannel; gemini: AivChannel }
}

export type SeoSummaryProps = {
  projectId: string
  da: number | null
  visibility: number
  avgPos: number | null
  organicKeywords: number
  tracked: number
  keywordsDelta: number
  estTraffic: number
  backlinks: number | null
  trafficTrend: TrendPoint[]
  keywordsTrend: TrendPoint[]
  aiOverview: number
  aiOverviewPct: number
  aiOverviewKeywords: AiKeyword[]
}

// ── Sparkline area (shadcn chart / recharts Area) ─────────────────────────────
function Spark({ data, id }: { data: TrendPoint[]; id: string }) {
  if (data.length < 2) return <div className="mt-2 h-8" />
  return (
    <ChartContainer config={{ v: { color: "var(--primary)" } }} className="!aspect-auto mt-2 h-8 w-full">
      <AreaChart data={data} margin={{ top: 3, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-v)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--color-v)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area dataKey="v" type="monotone" stroke="var(--color-v)" strokeWidth={2} fill={`url(#${id})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ChartContainer>
  )
}

// Metric label with a shadcn Tooltip "i" mark.
function StatLabel({ children, hint }: { children: React.ReactNode; hint: string }) {
  return (
    <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <span>{children}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="inline-flex text-muted-foreground/50 transition-colors hover:text-foreground">
            <Info className="size-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-56 text-xs">{hint}</TooltipContent>
      </Tooltip>
    </div>
  )
}

// A bordered "block" tile — the unit every metric sits in.
function StatBlock({ label, hint, children, className }: { label: string; hint: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border bg-background p-3", className)}>
      <StatLabel hint={hint}>{label}</StatLabel>
      <div className="mt-2">{children}</div>
    </div>
  )
}

function Delta({ v }: { v: number }) {
  if (v === 0) return <span className="text-xs font-medium text-muted-foreground">0</span>
  const up = v > 0
  return <span className={cn("text-xs font-semibold", up ? "text-emerald-600" : "text-red-500")}>{up ? "+" : ""}{v}</span>
}

function ScopePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground">
      {children}
      <ChevronDown className="size-3 opacity-60" />
    </span>
  )
}

// ── Provider marks (nominative use, for identifying each assistant) ──
const ChatGptIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" className="shrink-0 fill-foreground">
    <path d="M21.6 9.8a5.9 5.9 0 0 0-.5-4.9 6 6 0 0 0-6.4-2.9A6 6 0 0 0 4.5 4.1a5.9 5.9 0 0 0-4 2.9 6 6 0 0 0 .7 7 5.9 5.9 0 0 0 .5 4.9 6 6 0 0 0 6.4 2.9 6 6 0 0 0 10.2-2.1 5.9 5.9 0 0 0 4-2.9 6 6 0 0 0-.7-7Zm-8.9 12.4a4.4 4.4 0 0 1-2.8-1l.1-.1 4.7-2.7a.8.8 0 0 0 .4-.7v-6.6l2 1.2v5.5a4.5 4.5 0 0 1-4.4 4.4ZM3.1 17.5a4.4 4.4 0 0 1-.5-3l.1.1 4.7 2.7a.8.8 0 0 0 .8 0l5.7-3.3v2.3l-4.8 2.8a4.5 4.5 0 0 1-6-1.6ZM1.9 7.7a4.4 4.4 0 0 1 2.3-1.9v5.6a.8.8 0 0 0 .4.7l5.7 3.3-2 1.1-4.8-2.7a4.5 4.5 0 0 1-1.6-6Zm16.6 3.9-5.7-3.3 2-1.1 4.8 2.7a4.5 4.5 0 0 1-.7 8.1v-5.6a.8.8 0 0 0-.4-.8Zm2-3-.1-.1-4.7-2.7a.8.8 0 0 0-.8 0L9.2 9.1V6.8L14 4a4.5 4.5 0 0 1 6.5 4.6ZM8.1 13.1l-2-1.2V6.4A4.5 4.5 0 0 1 14 3.5l-.1.1L9.2 6.3a.8.8 0 0 0-.4.7v6.1Zm1-2.3L11.7 9l2.6 1.5v3L11.7 15l-2.6-1.5v-3Z" />
  </svg>
)
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" className="shrink-0">
    <path fill="#4285f4" d="M45 24c0-1.6-.1-2.7-.4-4H24v8h12c-.2 2-1.5 4.9-4.4 6.9l6.7 5.2C42.2 36.4 45 30.8 45 24Z" />
    <path fill="#34a853" d="M24 46c6 0 11-2 14.3-5.4l-6.7-5.2c-1.8 1.2-4.3 2.1-7.6 2.1-5.8 0-10.8-3.8-12.6-9.1l-7 5.4C7.9 41 15.4 46 24 46Z" />
    <path fill="#fbbc05" d="M11.4 28.4A13.6 13.6 0 0 1 10.7 24c0-1.5.3-3 .7-4.4l-7-5.4A21.9 21.9 0 0 0 2 24c0 3.6.9 6.9 2.4 9.8l7-5.4Z" />
    <path fill="#ea4335" d="M24 10.5c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 4.4 30 2 24 2 15.4 2 7.9 7 4.4 14.2l7 5.4C13.2 14.3 18.2 10.5 24 10.5Z" />
  </svg>
)
const GeminiIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" className="shrink-0">
    <path fill="#4a7dfc" d="M12 2c.5 3.2 1.6 5.4 3.3 6.9C16.7 10.1 18.6 11 21 11.5c-2.5.6-4.4 1.5-5.8 2.8C13.5 15.9 12.5 18.3 12 22c-.5-3.5-1.5-5.9-3-7.4C7.6 13.2 5.7 12.2 3 11.6c2.7-.6 4.6-1.6 6-3C10.5 7.1 11.5 5 12 2Z" />
  </svg>
)

// Small speedometer half-gauge — grey track + primary arc filling `value`%.
function HalfGauge({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value))
  const r = 11, cx = 15, cy = 15
  const semi = Math.PI * r
  const d = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`
  return (
    <svg width="30" height="17" viewBox="0 0 30 16" className="block">
      <path d={d} fill="none" stroke="var(--muted)" strokeWidth="4" strokeLinecap="round" />
      <path d={d} fill="none" stroke="var(--primary)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(v / 100) * semi} ${semi}`} />
    </svg>
  )
}

// One assistant row: icon + name · Mentions · Cited pages.
function AiRow({ icon, name, ch }: { icon: React.ReactNode; name: string; ch: AivChannel }) {
  const cell = (n: number | null) =>
    !ch.available ? <span className="text-xs text-muted-foreground">connect key</span> :
    n == null ? <span className="text-muted-foreground">—</span> :
    <span className="tabular-nums text-primary">{n}</span>
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_1fr_1fr] items-center gap-3 border-t py-2.5 text-[15px] first:border-t-0">
      <span className="flex items-center gap-2.5">{icon}<span className="truncate">{name}</span></span>
      <span>{cell(ch.available ? ch.mentions : null)}</span>
      <span>{cell(ch.cited)}</span>
    </div>
  )
}

export function SeoSummary(p: SeoSummaryProps) {
  const [aiClosed, setAiClosed] = useState(false)
  const [seoClosed, setSeoClosed] = useState(false)
  useEffect(() => {
    try {
      setAiClosed(localStorage.getItem("fs_dash_ai_closed") === "1")
      setSeoClosed(localStorage.getItem("fs_dash_seo_closed") === "1")
    } catch {}
  }, [])
  const setClosed = (which: "ai" | "seo", closed: boolean) => {
    const key = which === "ai" ? "fs_dash_ai_closed" : "fs_dash_seo_closed"
    ;(which === "ai" ? setAiClosed : setSeoClosed)(closed)
    try { closed ? localStorage.setItem(key, "1") : localStorage.removeItem(key) } catch {}
  }

  // Real AI-search visibility (ChatGPT / Gemini / Google AI Overview) — computed
  // server-side and cached 24h; a first load may take a few seconds.
  const [aiv, setAiv] = useState<AiVisibility | null>(null)
  const [aivLoading, setAivLoading] = useState(true)
  useEffect(() => {
    if (!p.projectId) return
    let cancelled = false
    setAivLoading(true)
    api.get<AiVisibility>(`/api/projects/${p.projectId}/ai-visibility`)
      .then((r) => { if (!cancelled) setAiv(r) })
      .catch(() => { if (!cancelled) setAiv(null) })
      .finally(() => { if (!cancelled) setAivLoading(false) })
    return () => { cancelled = true }
  }, [p.projectId])

  // Fall back to the AI-Overview data already on the client if the endpoint is
  // still loading or failed — the card never shows less than what we know.
  const fallbackAiv: AiVisibility = {
    computedAt: "", domain: "", keywordsChecked: p.tracked,
    channels: {
      aiOverview: { available: true, mentions: p.aiOverview, cited: null, checked: p.tracked },
      chatgpt: { available: false, mentions: 0, cited: null, checked: 0 },
      gemini: { available: false, mentions: 0, cited: null, checked: 0 },
    },
  }
  const v = aiv ?? fallbackAiv
  const avail = [v.channels.aiOverview, v.channels.chatgpt, v.channels.gemini].filter((c) => c.available)
  const totalMentions = avail.reduce((s, c) => s + c.mentions, 0)
  const totalChecks = avail.reduce((s, c) => s + c.checked, 0)
  const totalCited = avail.reduce((s, c) => s + (c.cited ?? 0), 0)
  const aiVisPct = totalChecks ? Math.round((totalMentions / totalChecks) * 100) : 0
  const anyUnavailable = !v.channels.chatgpt.available || !v.channels.gemini.available

  const solo = aiClosed !== seoClosed

  return (
    <TooltipProvider delayDuration={150}>
      {(aiClosed || seoClosed) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Hidden cards:</span>
          {aiClosed && (
            <Button variant="outline" size="sm" className="h-7 gap-1 border-dashed text-xs" onClick={() => setClosed("ai", false)}>
              <Plus className="size-3" /> AI Search
            </Button>
          )}
          {seoClosed && (
            <Button variant="outline" size="sm" className="h-7 gap-1 border-dashed text-xs" onClick={() => setClosed("seo", false)}>
              <Plus className="size-3" /> SEO
            </Button>
          )}
        </div>
      )}

      {!(aiClosed && seoClosed) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* ── AI SEARCH (Semrush-style tab card) ──────────────────────── */}
          {!aiClosed && (
            <div className={cn(solo && "lg:col-span-2")}>
              {/* Folder tab */}
              <div className="ml-5 inline-flex h-7 items-center rounded-t-lg bg-fuchsia-500/12 px-3.5 text-[13px] font-medium text-fuchsia-600 dark:text-fuchsia-400">
                AI Search
              </div>
              <div className="rounded-xl rounded-tl-none border bg-card shadow-sm">
                {/* Header */}
                <div className="flex h-[46px] items-center gap-2 border-b px-4">
                  <ScopePill><Globe className="size-3.5" /> Worldwide</ScopePill>
                  <Button variant="ghost" size="icon" className="ml-auto size-7 text-muted-foreground" aria-label="Hide card" onClick={() => setClosed("ai", true)}>
                    <X className="size-4" />
                  </Button>
                </div>

                {/* Body */}
                <div className="px-5 py-4">
                  {aivLoading && !aiv ? (
                    <div className="flex h-32 items-center justify-center text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
                  ) : (
                    <>
                      {/* Column headers */}
                      <div className="grid grid-cols-[minmax(0,1fr)_1fr_1fr] gap-3 text-sm text-muted-foreground">
                        <div>AI Visibility</div>
                        <div>Mentions</div>
                        <div>Cited pages</div>
                      </div>

                      {/* Totals */}
                      <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_1fr_1fr] items-center gap-3">
                        <div className="flex items-center gap-2">
                          <HalfGauge value={aiVisPct} />
                          <span className="text-2xl font-bold leading-none text-primary">{aiVisPct}%</span>
                        </div>
                        <div className="text-2xl font-bold leading-none text-primary">{totalMentions}</div>
                        <div className="text-2xl font-bold leading-none text-primary">{totalCited || "—"}</div>
                      </div>

                      {/* Assistant rows */}
                      <div className="mt-3">
                        <AiRow icon={<ChatGptIcon />} name="ChatGPT" ch={v.channels.chatgpt} />
                        <AiRow icon={<GoogleIcon />} name="Google AI Overview" ch={v.channels.aiOverview} />
                        <AiRow icon={<GoogleIcon />} name="AI Mode" ch={{ available: false, mentions: 0, cited: null, checked: 0 }} />
                        <AiRow icon={<GeminiIcon />} name="Gemini" ch={v.channels.gemini} />
                      </div>

                      {anyUnavailable && (
                        <p className="mt-3 text-[11px] text-muted-foreground">
                          Rows marked “connect key” light up with real data once their provider key is set (OPENAI_API_KEY / GEMINI_API_KEY). AI Mode has no public API.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── SEO (Semrush-style tab card) ────────────────────────────── */}
          {!seoClosed && (
            <div className={cn(solo && "lg:col-span-2")}>
              {/* Folder tab */}
              <div className="ml-5 inline-flex h-7 items-center rounded-t-lg bg-primary/12 px-3.5 text-[13px] font-medium text-primary">
                SEO
              </div>
              <div className="rounded-xl rounded-tl-none border bg-card shadow-sm">
                {/* Header */}
                <div className="flex h-[46px] flex-wrap items-center gap-2 border-b px-4">
                  <span className="hidden text-xs text-muted-foreground sm:inline">Scope: Root Domain</span>
                  <ScopePill>United States</ScopePill>
                  <ScopePill><Monitor className="size-3" /> Desktop</ScopePill>
                  <Button variant="ghost" size="icon" className="ml-auto size-7 text-muted-foreground" aria-label="Hide card" onClick={() => setClosed("seo", true)}>
                    <X className="size-4" />
                  </Button>
                </div>

                {/* Body */}
                <div className="px-5 py-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <StatBlock label="Authority Score" hint="Domain authority (0–100), derived from the site's backlink profile.">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold tabular-nums text-primary">{p.da ?? "—"}</span>
                      <span className="text-xs text-muted-foreground">/100</span>
                    </div>
                    <Progress value={p.da ?? 0} className="mt-2 h-1.5" />
                  </StatBlock>

                  <StatBlock label="Organic Traffic" hint="Estimated monthly organic traffic, modelled from position × search volume.">
                    <div className="text-2xl font-bold tabular-nums">{nf(p.estTraffic)}</div>
                    <Spark data={p.trafficTrend} id="spark-traffic" />
                  </StatBlock>

                  <StatBlock label="Organic Keywords" hint="Tracked keywords currently ranking in Google's top 100.">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-bold tabular-nums text-primary">{nf(p.organicKeywords)}</span>
                      <Delta v={p.keywordsDelta} />
                    </div>
                    <Spark data={p.keywordsTrend} id="spark-keywords" />
                  </StatBlock>

                  <StatBlock label="Paid Keywords" hint="Paid-search keywords. FreeSERP does not track paid data.">
                    <div className="text-2xl font-bold tabular-nums text-muted-foreground">—</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">not tracked</div>
                  </StatBlock>

                  <StatBlock label="Ref. Domains" hint="Referring domains. FreeSERP tracks total backlinks, not unique referring domains.">
                    <div className="text-2xl font-bold tabular-nums text-muted-foreground">—</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">Backlinks <b className="text-foreground">{p.backlinks != null ? nf(p.backlinks) : "—"}</b></div>
                  </StatBlock>

                  <StatBlock label="Visibility" hint="CTR-weighted share of your tracked keywords across their SERPs.">
                    <div className="text-2xl font-bold tabular-nums">{p.visibility}%</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">Avg. pos <b className="text-foreground">{p.avgPos ?? "—"}</b></div>
                  </StatBlock>
                </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </TooltipProvider>
  )
}
