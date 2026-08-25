"use client"

// One prompt: its rate over time, and the actual answers behind the latest run.
//
// Showing the answers is the trust mechanism. A percentage nobody can verify is
// a number to argue with; the answer text plus a link back to the real product
// is evidence.

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { api, ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { Favicon } from "@/components/favicon"
import { Icon } from "@/components/dashboard/icons"
import { LineChart, StatTile } from "@/components/dashboard/primitives"

// ───── Types (mirror /api/llm-tracker/projects/:id/prompts/:promptId) ───────
type Platform = "chat_gpt" | "gemini" | "perplexity" | "claude"

type Run = {
  id: string
  platform: Platform
  modelName: string
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"
  mentionRate: number | null
  citationRate: number | null
  avgProminence: number | null
  change: number | null
  samplesRequested: number
  samplesSucceeded: number
  runAt: string
}

type Citation = { title: string; url: string; domain: string; startIndex: number | null }

type Sample = {
  sampleIndex: number
  status: string
  responseText: string | null
  truncated: boolean
  mentioned: boolean
  mentionOffset: number | null
  prominence: number | null
  cited: boolean
  citations: Citation[] | null
  competitorsMentioned: string[] | null
  fanOutQueries: string[] | null
  checkUrl: string | null
}

type Detail = {
  project: {
    id: string
    name: string
    brandName: string
    brandDomain: string | null
    // Curated by the user; the backend matches on these too, so the highlight and
    // the mention rate agree on what counts as a mention.
    brandAliases?: string[]
  }
  prompt: { id: string; prompt: string; platforms: Platform[]; samplesPerRun: number }
  runs: Run[]
  latestRunId: string | null
  samples: Sample[]
}

const PLATFORM_LABEL: Record<Platform, string> = {
  chat_gpt: "ChatGPT",
  gemini: "Gemini",
  perplexity: "Perplexity",
  claude: "Claude",
}

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`)

type Tab = "answers" | "history" | "sources"

export default function LlmPromptDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string; promptId: string }>()
  const { user, loading: authLoading } = useAuth()

  const [data, setData] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [tab, setTab] = useState<Tab>("answers")

  useEffect(() => {
    if (!authLoading && !user) router.push("/login")
  }, [authLoading, user, router])

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      try {
        setData(
          await api.get<Detail>(`/api/llm-tracker/projects/${params.id}/prompts/${params.promptId}`),
        )
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 404) {
          router.replace(`/dashboard/ai-prompt-tracker/${params.id}`)
          return
        }
        if (!silent) setError(err instanceof Error ? err.message : "Failed to load")
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [params.id, params.promptId, router],
  )

  useEffect(() => {
    if (user) void load()
  }, [user, load])

  const latest = data?.runs.find((r) => r.id === data.latestRunId) ?? data?.runs[0] ?? null

  // Poll while the newest run is still gathering samples.
  useEffect(() => {
    if (!latest || (latest.status !== "PENDING" && latest.status !== "PROCESSING")) return
    const id = setInterval(() => void load(true), 3000)
    return () => clearInterval(id)
  }, [latest, load])

  const chart = useMemo(() => {
    if (!data) return []
    // Oldest → newest, one point per completed run, as a percentage.
    return [...data.runs]
      .filter((r) => r.status === "COMPLETED" && r.mentionRate != null)
      .reverse()
      .map((r, i) => ({ day: i, value: Math.round((r.mentionRate ?? 0) * 100) }))
  }, [data])

  if (authLoading || loading || !data) {
    return (
      <div className="page" style={{ color: "var(--text-mute)", fontSize: 13, padding: 60, textAlign: "center" }}>
        Loading…
      </div>
    )
  }

  const ok = data.samples.filter((s) => s.status === "COMPLETED")

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <div className="tiny muted">
            <Link href="/dashboard/ai-prompt-tracker">AI Prompt Tracker</Link> ·{" "}
            <Link href={`/dashboard/ai-prompt-tracker/${data.project.id}`}>{data.project.name}</Link>
          </div>
          <h1 style={{ fontSize: 20 }}>{data.prompt.prompt}</h1>
        </div>
      </div>

      {error && (
        <div className="card" style={{ padding: 16, marginBottom: 16, color: "var(--neg)", fontSize: 13 }}>
          {error}
        </div>
      )}

      <div className="grid g-4" style={{ marginBottom: 14 }}>
        <StatTile
          lbl="Mention rate"
          val={pct(latest?.mentionRate ?? null)}
          delta={latest?.change != null ? `${latest.change > 0 ? "+" : ""}${Math.round(latest.change * 100)} pts` : undefined}
          up={latest?.change != null && latest.change > 0}
          down={latest?.change != null && latest.change < 0}
          tip={latest ? `${latest.samplesSucceeded} of ${latest.samplesRequested} answers` : undefined}
        />
        <StatTile lbl="Cited as a source" val={pct(latest?.citationRate ?? null)} tip="AI linked to you" />
        <StatTile
          lbl="Prominence"
          val={latest?.avgProminence != null ? `${Math.round(latest.avgProminence * 100)}%` : "n/a"}
          // Prominence is where the BRAND falls in the answer text, so it exists on
          // every platform — it is null only when no sample mentioned you at all.
          tip={latest?.avgProminence != null ? "how early you appear" : "not mentioned in these answers"}
        />
        <StatTile lbl="Platform" val={latest ? PLATFORM_LABEL[latest.platform] : "—"} tip={latest?.modelName} />
      </div>

      <div className="tabs" style={{ marginBottom: 12 }}>
        {(
          [
            ["answers", `Answers${ok.length ? ` (${ok.length})` : ""}`],
            ["history", "Rate over time"],
            ["sources", "Cited sources"],
          ] as const
        ).map(([key, label]) => (
          <button key={key} className={`tab ${tab === key ? "active" : ""}`.trim()} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "answers" && (
        <AnswersTab
          samples={data.samples}
          terms={[data.project.brandName, ...(data.project.brandAliases ?? [])]}
        />
      )}

      {tab === "history" &&
        (chart.length > 1 ? (
          <div className="card">
            <div className="card-h">
              <div>
                <div className="t">Mention rate over time</div>
                <div className="tiny muted">{chart.length} runs · oldest to newest</div>
              </div>
            </div>
            {/* No `invert`: unlike a rank, a higher rate is better. */}
            <LineChart data={chart} yFormat={(v) => `${Math.round(v)}%`} height={240} />
          </div>
        ) : (
          <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
            Not enough history yet — run this prompt a few times to see a trend.
          </div>
        ))}

      {tab === "sources" && <SourcesTab samples={data.samples} brandDomain={data.project.brandDomain} />}
    </div>
  )
}

/** Escape a literal for use inside a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Rehype plugin: wrap every brand-alias occurrence in a <mark>.
 *
 * Highlighting used to slice the raw string at `mentionOffset`. That cannot work
 * once the answer is parsed as markdown — the offset indexes the ORIGINAL source,
 * where `**FreeSERP**` sits at a different position than the rendered "FreeSERP",
 * and the text is no longer one flat string anyway. So the offset stays what it
 * always was (the backend's prominence input) and the UI matches text instead.
 *
 * The word-boundary rule mirrors llmMetrics.matchBrand on the server: a bare
 * substring match would highlight "serp" inside "freeserp" while the metric next
 * to it says "not mentioned", and a UI that contradicts its own number is worse
 * than one that highlights nothing.
 */
function rehypeHighlightTerms(terms: string[]) {
  const cleaned = terms.map((t) => t.trim()).filter(Boolean)
  return () => (tree: unknown) => {
    if (cleaned.length === 0) return
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(${cleaned.map(escapeRe).join("|")})(?![\\p{L}\\p{N}])`, "giu")

    const walk = (node: { children?: unknown[]; tagName?: string }) => {
      if (!node || !Array.isArray(node.children)) return
      // Don't rewrite inside links or code — a <mark> there fights the element's
      // own styling and can break a URL's appearance.
      if (node.tagName === "a" || node.tagName === "code") return

      const out: unknown[] = []
      for (const child of node.children) {
        const c = child as { type?: string; value?: string }
        if (c?.type !== "text" || typeof c.value !== "string") {
          walk(child as { children?: unknown[] })
          out.push(child)
          continue
        }
        re.lastIndex = 0
        if (!re.test(c.value)) {
          out.push(child)
          continue
        }
        re.lastIndex = 0
        let last = 0
        let m: RegExpExecArray | null
        while ((m = re.exec(c.value)) !== null) {
          if (m.index > last) out.push({ type: "text", value: c.value.slice(last, m.index) })
          out.push({
            type: "element",
            tagName: "mark",
            properties: { className: ["llm-hit"] },
            children: [{ type: "text", value: m[0] }],
          })
          last = m.index + m[0].length
        }
        if (last < c.value.length) out.push({ type: "text", value: c.value.slice(last) })
      }
      node.children = out
    }

    walk(tree as { children?: unknown[] })
  }
}

/** Shared styling for the rendered answer. Kept close to the .fs-app tokens. */
const MD_STYLES = `
.llm-md { font-size: 13px; line-height: 1.65; color: var(--text); overflow-wrap: anywhere; }
.llm-md > :first-child { margin-top: 0; }
.llm-md > :last-child { margin-bottom: 0; }
.llm-md h1, .llm-md h2, .llm-md h3, .llm-md h4 {
  margin: 18px 0 8px; font-weight: 600; line-height: 1.3; letter-spacing: -0.01em;
}
.llm-md h1 { font-size: 17px; } .llm-md h2 { font-size: 15.5px; }
.llm-md h3 { font-size: 14px; } .llm-md h4 { font-size: 13px; }
.llm-md p { margin: 0 0 10px; }
.llm-md ul, .llm-md ol { margin: 0 0 10px; padding-left: 20px; }
.llm-md li { margin: 3px 0; }
.llm-md a { color: var(--brand); text-decoration: none; }
.llm-md a:hover { text-decoration: underline; }
.llm-md code {
  font-family: var(--font-mono); font-size: 12px;
  background: var(--bg-inset); border-radius: 4px; padding: 1px 5px;
}
.llm-md pre {
  background: var(--bg-inset); border: 1px solid var(--border); border-radius: 8px;
  padding: 12px 14px; overflow-x: auto; margin: 0 0 10px;
}
.llm-md pre code { background: none; padding: 0; }
.llm-md blockquote {
  margin: 0 0 10px; padding: 2px 0 2px 12px;
  border-left: 2px solid var(--border-strong); color: var(--text-soft);
}
/* The answers routinely contain wide comparison tables — let them scroll rather
   than force the card wider than the page. */
.llm-td-scroll { overflow-x: auto; margin: 0 0 12px; }
.llm-md table { border-collapse: separate; border-spacing: 0; font-size: 12.5px; min-width: 100%; }
.llm-md th, .llm-md td {
  border-bottom: 1px solid var(--border); padding: 7px 12px;
  text-align: left; vertical-align: top; white-space: nowrap;
}
.llm-md th {
  background: var(--bg-sub); font-weight: 600; font-size: 11.5px;
  position: sticky; top: 0;
}
.llm-md td { white-space: normal; min-width: 90px; }
.llm-md hr { border: 0; border-top: 1px solid var(--border); margin: 14px 0; }
.llm-md .llm-hit {
  background: var(--brand-soft); color: var(--text);
  font-weight: 600; border-radius: 3px; padding: 0 3px;
}
`

/**
 * The answer, rendered as the markdown it actually is.
 *
 * No `rehype-raw`: react-markdown drops embedded HTML by default, and this is
 * third-party text we neither wrote nor control. Links keep the default URL
 * sanitiser (which rejects `javascript:` and friends) and open in a new tab.
 */
function AnswerMarkdown({ text, terms }: { text: string; terms: string[] }) {
  return (
    <div className="llm-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlightTerms(terms)]}
        components={{
          // Wrap tables so a wide comparison scrolls inside the card.
          table: ({ children }) => (
            <div className="llm-td-scroll">
              <table>{children}</table>
            </div>
          ),
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

function AnswersTab({ samples, terms }: { samples: Sample[]; terms: string[] }) {
  if (samples.length === 0) {
    return (
      <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
        No answers yet — run this prompt to collect some.
      </div>
    )
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <style>{MD_STYLES}</style>
      {samples.map((s) => (
        <div className="card" key={s.sampleIndex}>
          <div className="card-h">
            <div className="row" style={{ gap: 8 }}>
              <span className="tiny muted">Answer {s.sampleIndex + 1}</span>
              {s.status !== "COMPLETED" ? (
                <span className="chip neg">Failed</span>
              ) : s.mentioned ? (
                <span className="chip brand">Mentioned</span>
              ) : (
                // A real, reportable finding — not an empty state.
                <span className="chip">Not mentioned</span>
              )}
              {s.cited && <span className="chip pos">Cited</span>}
            </div>
            {s.checkUrl && (
              <a href={s.checkUrl} target="_blank" rel="noopener noreferrer" className="tiny">
                Reproduce <Icon.external size={11} />
              </a>
            )}
          </div>

          {s.responseText ? (
            <>
              <AnswerMarkdown text={s.responseText} terms={terms} />
              {s.truncated && (
                <div className="tiny muted" style={{ marginTop: 8 }}>
                  Answer truncated for storage.
                </div>
              )}
            </>
          ) : (
            <div className="tiny muted">
              {s.status === "COMPLETED" ? "No answer recorded." : "No answer recorded — this sample failed."}
            </div>
          )}

          {!!s.competitorsMentioned?.length && (
            <div className="row" style={{ gap: 6, marginTop: 12, flexWrap: "wrap" }}>
              <span className="tiny muted">Also named:</span>
              {s.competitorsMentioned.map((c) => (
                <span key={c} className="chip outline">
                  {c}
                </span>
              ))}
            </div>
          )}

          {!!s.fanOutQueries?.length && (
            <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <span className="tiny muted">Searched:</span>
              {s.fanOutQueries.map((q, i) => (
                <span key={`${q}-${i}`} className="chip">
                  {q}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function SourcesTab({ samples, brandDomain }: { samples: Sample[]; brandDomain: string | null }) {
  // Aggregate citations across the run's answers, counting how often each domain
  // was used as a source.
  const rows = useMemo(() => {
    const byDomain = new Map<string, { domain: string; count: number; title: string; url: string }>()
    for (const s of samples) {
      for (const c of s.citations ?? []) {
        const prev = byDomain.get(c.domain)
        if (prev) prev.count += 1
        else byDomain.set(c.domain, { domain: c.domain, count: 1, title: c.title, url: c.url })
      }
    }
    return [...byDomain.values()].sort((a, b) => b.count - a.count)
  }, [samples])

  const own = (brandDomain ?? "").toLowerCase().replace(/^www\./, "")

  if (rows.length === 0) {
    return (
      <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
        No sources cited in these answers.
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>Source</th>
              <th style={{ textAlign: "right" }}>Times cited</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isOwn = !!own && (r.domain === own || r.domain.endsWith(`.${own}`))
              return (
                <tr key={r.domain} style={isOwn ? { background: "var(--brand-soft)", fontWeight: 600 } : undefined}>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <Favicon domain={r.domain} size={18} />
                      <a href={r.url} target="_blank" rel="noopener noreferrer">
                        {r.title || r.domain}
                      </a>
                      {isOwn && <span className="chip brand">You</span>}
                    </span>
                    <div className="tiny muted">{r.domain}</div>
                  </td>
                  <td style={{ textAlign: "right" }} className="tabular">
                    {r.count}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
