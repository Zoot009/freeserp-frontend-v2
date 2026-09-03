"use client"

// One prompt: its rate over time, and the actual answers behind the latest run.
//
// Showing the answers is the trust mechanism. A percentage nobody can verify is
// a number to argue with; the answer text plus a link back to the real product
// is evidence.

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { api, ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { LineChart, StatTile } from "@/components/dashboard/primitives"
import {
  AnswerCard,
  PromptHero,
  PromptPlatformSwitch,
  PromptSources,
  RivalsSummary,
} from "@/components/dashboard/ai-tracker/prompt-detail"
import {
  ACTIVE_STATUSES,
  isPlatform,
  pct,
  PLATFORM_LABEL,
  relTime,
  type Platform,
  type RunSummary,
} from "@/lib/ai-tracker"

// ───── Types (mirror /api/llm-tracker/projects/:id/prompts/:promptId) ───────
// Platform, the status vocabulary, PLATFORM_LABEL and pct were each declared
// locally here as well as in lib/ai-tracker.ts — exactly the drift that module's
// header comment says it exists to stop. Imported now; only the fields this page
// asks for on top of RunSummary are declared below.
type Run = RunSummary & { modelName: string; manual?: boolean }

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
    /**
     * What the scorer ACTUALLY matched on, split by whether a hit counts.
     *
     * Optional because a frontend deployed ahead of the backend still has to
     * render; `terms` falls back to name + aliases, which is what this page used
     * before the field existed.
     */
    brandTerms?: { matched: string[]; ignored: string[] }
  }
  prompt: { id: string; prompt: string; platforms: Platform[]; samplesPerRun: number }
  runs: Run[]
  latestRunId: string | null
  samples: Sample[]
}

type Tab = "answers" | "history" | "sources"

export default function LlmPromptDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string; promptId: string }>()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()

  /**
   * Which platform this page is about.
   *
   * The platform pages have always linked here with `?platform=`, and the API has
   * always honoured it — but this page never read it, so clicking a Claude row
   * showed whichever platform's run happened to finish last, under Claude's
   * heading. A prompt tracked on four platforms has four independent histories;
   * this is which one you are looking at.
   */
  const qp = searchParams.get("platform")
  const [focus, setFocus] = useState<Platform | null>(qp && isPlatform(qp) ? qp : null)

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
        const qs = focus ? `?platform=${focus}` : ""
        setData(
          await api.get<Detail>(
            `/api/llm-tracker/projects/${params.id}/prompts/${params.promptId}${qs}`,
          ),
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
    [params.id, params.promptId, router, focus],
  )

  useEffect(() => {
    if (user) void load()
  }, [user, load])

  // `?? runs[0]` is only safe with NO focus. With one it would fall back to some
  // OTHER platform's run, and the tiles would read "Claude" over ChatGPT's
  // answers — the exact mismatch the focus exists to fix.
  const latest =
    data?.runs.find((r) => r.id === data.latestRunId) ?? (focus ? null : (data?.runs[0] ?? null))

  /**
   * Which platform the page is actually showing, focused or not.
   *
   * With no query param there is still one platform on screen — whichever run is
   * newest — and the chart below has to filter on it either way, or it draws four
   * interleaved histories as one line.
   */
  const shown = focus ?? latest?.platform ?? null

  /** Only worth a switcher when there is somewhere else to switch to. */
  const hasSwitcher = (data?.prompt.platforms.length ?? 0) > 1

  const selectPlatform = (p: Platform) => {
    setFocus(p)
    // Keep the URL honest, so a reload or a shared link lands on the same view.
    router.replace(
      `/dashboard/ai-prompt-tracker/${params.id}/${params.promptId}?platform=${p}`,
      { scroll: false },
    )
  }

  // Poll while the newest run is still gathering samples.
  useEffect(() => {
    if (!latest || !ACTIVE_STATUSES.has(latest.status)) return
    const id = setInterval(() => void load(true), 3000)
    return () => clearInterval(id)
  }, [latest, load])

  /**
   * Each assistant's newest COMPLETED mention rate for this prompt.
   *
   * The detail route returns runs for every platform, not just the focused one,
   * so the switcher can compare them without a second request. A platform the
   * prompt is tracked on but has never completed maps to null — which the
   * switcher draws as a dash rather than 0%.
   */
  const ratesByPlatform = useMemo(() => {
    const m: Partial<Record<Platform, number | null>> = {}
    for (const p of data?.prompt.platforms ?? []) m[p] = null
    for (const r of data?.runs ?? []) {
      // Runs arrive newest-first, so the first completed one per platform wins.
      if (r.status !== "COMPLETED" || r.mentionRate == null) continue
      if (m[r.platform] == null) m[r.platform] = r.mentionRate
    }
    return m
  }, [data])

  const chart = useMemo(() => {
    if (!data) return []
    // Oldest → newest, one point per completed run, as a percentage.
    return [...data.runs]
      // One line per platform. Without the platform filter a prompt tracked on
      // ChatGPT and Claude drew both histories interleaved into a single zig-zag
      // that described no assistant at all.
      .filter(
        (r) =>
          r.status === "COMPLETED" && r.mentionRate != null && (!shown || r.platform === shown),
      )
      .reverse()
      .map((r, i) => ({ day: i, value: Math.round((r.mentionRate ?? 0) * 100) }))
  }, [data, shown])

  if (authLoading || loading || !data) {
    return (
      <div className="page" style={{ color: "var(--text-mute)", fontSize: 13, padding: 60, textAlign: "center" }}>
        Loading…
      </div>
    )
  }

  const ok = data.samples.filter((s) => s.status === "COMPLETED")

  return (
    // data-engine themes the whole page in the assistant whose answers it is
    // showing, so arriving from a teal Perplexity row lands somewhere teal. Off
    // it (no run yet) .llm-eng falls back to the brand accent.
    <div className="page llm-eng" data-engine={shown ?? undefined}>
      <PromptHero
        projectId={data.project.id}
        projectName={data.project.name}
        prompt={data.prompt.prompt}
        platform={shown}
        modelName={latest?.modelName}
        succeeded={latest?.samplesSucceeded}
        requested={latest?.samplesRequested}
      />

      {error && (
        <div className="card" style={{ padding: 16, marginBottom: 16, color: "var(--neg)", fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* A prompt tracked on several assistants has a separate history on each.
          This is the one screen where that difference is concrete — the same
          question, four answers — so the switcher shows each assistant's rate
          rather than asking you to click through them to find out. */}
      {hasSwitcher && (
        <PromptPlatformSwitch
          platforms={data.prompt.platforms}
          rates={ratesByPlatform}
          current={shown}
          onSelect={selectPlatform}
        />
      )}

      <div className="grid g-4" style={{ marginBottom: 16 }}>
        <StatTile
          lbl="Mention rate"
          val={pct(latest?.mentionRate ?? null)}
          delta={latest?.change != null ? `${latest.change > 0 ? "+" : ""}${Math.round(latest.change * 100)} pts` : undefined}
          up={latest?.change != null && latest.change > 0}
          down={latest?.change != null && latest.change < 0}
          tip={shown ? `on ${PLATFORM_LABEL[shown]}, latest run` : undefined}
        />
        <StatTile
          lbl="Cited as a source"
          val={pct(latest?.citationRate ?? null)}
          tip={shown ? `${PLATFORM_LABEL[shown]} linked to you` : "the assistant linked to you"}
        />
        <StatTile
          lbl="Position in answer"
          val={latest?.avgProminence != null ? pct(latest.avgProminence) : "n/a"}
          // Prominence is where the BRAND falls in the answer text, so it exists on
          // every platform — it is null only when no sample mentioned you at all.
          tip={
            latest?.avgProminence != null
              ? "how far in your first mention lands — lower is better"
              : "not mentioned in these answers"
          }
        />
        {/* When these answers were collected. An assistant's answer is a
            snapshot of a product that changes under us, so a rate with no date
            on it is a claim about an unspecified moment. This replaces the
            "Answered by" tile, whose model name now sits in the header. */}
        <StatTile
          lbl="Last checked"
          val={latest ? relTime(latest.runAt) : "—"}
          tip={latest ? `${latest.samplesSucceeded} of ${latest.samplesRequested} answers collected` : undefined}
        />
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
        <>
          {!!data.project.brandTerms?.ignored.length && (
            <GenericTermNotice
              ignored={data.project.brandTerms.ignored}
              matched={data.project.brandTerms.matched}
            />
          )}
          {/* Who was named instead, summed across this run. The per-answer chips
              were already there; nothing added them up. */}
          <RivalsSummary samples={data.samples} />
          <AnswersTab
            samples={data.samples}
            // The matched half only. Highlighting a term the rate refuses to count
            // is how "100% mention rate" looked defensible for three answers that
            // recommended Semrush — the page marked up the words itself.
            terms={data.project.brandTerms?.matched ?? [data.project.brandName, ...(data.project.brandAliases ?? [])]}
          />
        </>
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
            {/* No `invert`: unlike a rank, a higher rate is better. The colour
                is the assistant's, so the chart matches the page it sits on. */}
            <LineChart data={chart} yFormat={(v) => `${Math.round(v)}%`} height={240} color="var(--accent)" />
          </div>
        ) : (
          <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
            Not enough history yet
            {shown ? ` on ${PLATFORM_LABEL[shown]}` : ""} — run this prompt a few times to see a
            trend.
          </div>
        ))}

      {tab === "sources" && <PromptSources samples={data.samples} brandDomain={data.project.brandDomain} />}
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
/* .llm-hit is NOT defined here — it lives in dashboard.css under AI ENGINE
   PAGES, where it takes the accent of the assistant whose answer this is. */
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

/**
 * Explains a 0% that is a measurement decision rather than an absence.
 *
 * Without it the page is silently inconsistent: the brand name is right there in
 * the answer and the tile above says the brand was never mentioned. Naming the
 * ignored terms — and the ones used instead — turns that into a sentence the
 * customer can act on.
 */
function GenericTermNotice({ ignored, matched }: { ignored: string[]; matched: string[] }) {
  return (
    <div className="card" style={{ padding: 12, marginBottom: 12, fontSize: 12.5, lineHeight: 1.6 }}>
      <strong>{ignored.join('", "')}</strong>{" "}
      {ignored.length > 1 ? "are phrases" : "is a phrase"} any answer on this topic can use, so{" "}
      {ignored.length > 1 ? "they are" : "it is"} not counted as a mention on {ignored.length > 1 ? "their" : "its"} own.
      {matched.length > 0 ? (
        <>
          {" "}
          Mentions are matched on <strong>{matched.join(", ")}</strong> instead.
        </>
      ) : null}{" "}
      <span style={{ color: "var(--text-mute)" }}>
        Add an alias that is unique to your brand if answers name you another way.
      </span>
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
    <div>
      <style>{MD_STYLES}</style>
      {samples.map((s) => (
        <AnswerCard
          key={s.sampleIndex}
          index={s.sampleIndex}
          mentioned={s.status === "COMPLETED" && s.mentioned}
          cited={s.cited}
          failed={s.status !== "COMPLETED"}
          checkUrl={s.checkUrl}
          competitors={s.competitorsMentioned}
          fanOut={s.fanOutQueries}
        >
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
            <div className="tiny muted" style={{ padding: "10px 0" }}>
              {s.status === "COMPLETED" ? "No answer recorded." : "No answer recorded — this sample failed."}
            </div>
          )}
        </AnswerCard>
      ))}
    </div>
  )
}
