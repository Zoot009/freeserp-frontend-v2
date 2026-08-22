"use client"

import { useEffect, useRef, useState } from "react"
import { CreditCost } from "@/components/dashboard/credit-cost"
import { CREDIT_ACTION_KEYS } from "@/lib/credits"
import {
  ArrowRight,
  History,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"
import { api, ApiError } from "@/lib/api"
import type { AuditReport } from "@/components/page-audit/audit-ui"
/**
 * Answered by POST /api/page-audit/ask, backed by DeepSeek.
 *
 * The type is inlined rather than imported: the package took it from its own
 * Next route handler, which doesn't exist here.
 *
 * Saved chat history is a separate matter. The /api/chat/sessions calls below
 * target endpoints this app doesn't have, so they 404 and `canSave` stays
 * false — asking works, threads just aren't persisted. That path needs the
 * package's ChatSession/ChatMessage models, which weren't ported.
 */
type AuditAskResponse = { output: string }

/**
 * "Audit Assistant" for the results page. A floating launcher pill opens a
 * docked chat widget. The same chat layout is used at both sizes — the
 * maximize button just scales it up to a near-fullscreen overlay.
 *
 * Sends the audit's scores + top issues + categories to the backend along with
 * a free-form question and renders the response as live markdown. Single-shot
 * per message — no server-side memory; each ask is re-seeded with full context.
 */
export function AskAiPanel({ report }: { report: AuditReport }) {
  const [open, setOpen] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [question, setQuestion] = useState("")
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  // How many characters of the currently-streaming assistant message are shown.
  const [revealLen, setRevealLen] = useState(0)

  // Chat history (DB-backed, signed-in users only).
  const [canSave, setCanSave] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Refs mirror state so save() can read the latest values without re-running.
  const sessionIdRef = useRef<string | null>(null)
  const canSaveRef = useRef(false)

  const auditReportId = report.id

  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])
  useEffect(() => {
    canSaveRef.current = canSave
  }, [canSave])

  // On first open, see whether history is available (i.e. the user is signed
  // in) and load this audit's saved threads.
  useEffect(() => {
    if (!open || !auditReportId) return
    let cancelled = false
    fetch(`/api/chat/sessions?auditReportId=${encodeURIComponent(auditReportId)}`)
      .then(async (res) => {
        if (cancelled) return
        if (res.status === 401) {
          setCanSave(false)
          return
        }
        if (!res.ok) return
        const data = (await res.json()) as { sessions: SessionMeta[] }
        setCanSave(true)
        setSessions(data.sessions ?? [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [open, auditReportId])

  async function loadSessions() {
    if (!canSave || !auditReportId) return
    try {
      const res = await fetch(`/api/chat/sessions?auditReportId=${encodeURIComponent(auditReportId)}`)
      if (!res.ok) return
      const data = (await res.json()) as { sessions: SessionMeta[] }
      setSessions(data.sessions ?? [])
    } catch {
      /* ignore */
    }
  }

  // Persist a thread after a completed assistant reply (signed-in users only).
  async function saveThread(thread: ChatMessage[]) {
    if (!canSaveRef.current || !auditReportId) return
    const payload = thread.map((m) => ({ role: m.role, content: m.content }))
    try {
      const res = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdRef.current, auditReportId, messages: payload }),
      })
      if (!res.ok) return
      const data = (await res.json()) as { id: string }
      sessionIdRef.current = data.id
      setSessionId(data.id)
      loadSessions()
    } catch {
      /* ignore */
    }
  }

  async function openThread(id: string) {
    try {
      const res = await fetch(`/api/chat/sessions/${id}`)
      if (!res.ok) return
      const data = (await res.json()) as { id: string; messages: ChatMessage[] }
      setMessages(data.messages)
      sessionIdRef.current = data.id
      setSessionId(data.id)
      setRevealLen(Number.MAX_SAFE_INTEGER) // show loaded history fully (no typewriter)
      setHistoryOpen(false)
    } catch {
      /* ignore */
    }
  }

  async function deleteThread(id: string) {
    setSessions((prev) => prev.filter((s) => s.id !== id))
    if (id === sessionId) startNewChat()
    try {
      await fetch(`/api/chat/sessions/${id}`, { method: "DELETE" })
    } catch {
      /* ignore */
    }
  }

  function startNewChat() {
    setMessages([])
    sessionIdRef.current = null
    setSessionId(null)
    setQuestion("")
    setHistoryOpen(false)
  }

  // Keep the thread pinned to the latest message (also as text types in).
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, loading, revealLen])

  // Typewriter reveal — progressively unveil the last assistant message.
  useEffect(() => {
    const last = messages[messages.length - 1]
    if (!last || last.role !== "assistant" || !last.streaming) return
    if (revealLen >= last.content.length) return
    const step = Math.max(2, Math.round(last.content.length / 200))
    const t = setTimeout(() => {
      setRevealLen((n) => Math.min(last.content.length, n + step))
    }, 16)
    return () => clearTimeout(t)
  }, [messages, revealLen])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open, maximized])

  async function ask(sendText: string, displayText?: string) {
    const trimmed = sendText.trim()
    if (!trimmed || loading) return

    const userMsg: ChatMessage = {
      role: "user",
      content: (displayText ?? sendText).trim(),
      time: nowMs(),
    }
    const base = messages // thread before this exchange

    setQuestion("")
    setMessages((prev) => [...prev, userMsg])
    setLoading(true)

    try {
      // Our API, via the shared client so the JWT rides along. The package
      // posted to its own Next route handler wrapping an OpenAI service; this
      // one is DeepSeek, rate-limited per user because every call costs money.
      let data: AuditAskResponse | { error: string }
      try {
        data = await api.post<AuditAskResponse>("/api/page-audit/ask", {
          // Serialised, not passed as an object: the endpoint takes context as
          // text (it goes straight into the prompt). Sending the object failed
          // validation on arrival, so every question answered "Validation failed".
          context: JSON.stringify(buildContext(report)),
          question: trimmed,
        })
      } catch (err) {
        // ApiError carries a human-readable message off our error envelope —
        // "not configured", "busy, try again", the rate-limit notice.
        data = { error: err instanceof ApiError ? err.message : "Something went wrong." }
      }
      if ("error" in data) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.error, error: true, time: nowMs() }])
      } else {
        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: data.output,
          streaming: true,
          time: nowMs(),
        }
        setRevealLen(0)
        setMessages((prev) => [...prev, assistantMsg])
        saveThread([...base, userMsg, assistantMsg]) // persist (signed-in users)
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Network error. Please try again.", error: true, time: nowMs() },
      ])
    } finally {
      setLoading(false)
    }
  }

  function submitComposer(e: React.FormEvent) {
    e.preventDefault()
    const q = question.trim()
    if (q) ask(q)
  }

  const showChips = messages.length === 0 && !loading

  return (
    <>
      {/* ── Floating launcher pill ── */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group fixed bottom-5 right-5 z-40 flex h-12 animate-[ask-float_3.5s_ease-in-out_infinite] items-center gap-2 rounded-full bg-primary pl-4 pr-5 text-sm font-medium text-primary-foreground shadow-lg transition-transform duration-200 hover:scale-[1.05] hover:animate-none active:scale-95"
        >
          <Sparkles className="h-4 w-4 animate-[ask-twinkle_2.2s_ease-in-out_infinite] transition-transform duration-300 group-hover:rotate-[18deg] group-hover:scale-110" />
          Ask from AI
        </button>
      )}

      {/* ── Backdrop (maximized only) ── */}
      {open && maximized && (
        <div
          className="fixed inset-0 z-[55] bg-[#0f172a]/30 backdrop-blur-[1px]"
          onClick={() => setMaximized(false)}
        />
      )}

      {/* ── Docked widget (same layout at both sizes) ── */}
      {open && (
        <div
          className={cn(
            "fixed z-[60] flex flex-col overflow-hidden bg-white text-[#0f172a] transition-all duration-200",
            maximized
              ? "inset-0 rounded-none"
              : "bottom-5 right-5 h-[600px] max-h-[calc(100dvh-2.5rem)] w-[380px] max-w-[calc(100vw-2.5rem)] rounded-[20px]",
          )}
          style={{ boxShadow: "0 24px 60px -12px rgba(15,23,42,.22), 0 0 0 1px rgba(15,23,42,.05)" }}
          role="dialog"
          aria-label="Audit Assistant"
        >
          {/* Header */}
          <header className="flex items-center gap-3 border-b border-[#e8ebf0] bg-white px-4 py-[14px]">
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-bold leading-tight">Audit Assistant</div>
              <div className="flex items-center gap-[5px] text-[11.5px]">
                <span className="flex items-center gap-[5px] font-semibold text-[#0f9d6b]">
                  <span className="h-[7px] w-[7px] rounded-full bg-[#0f9d6b]" />
                  Online
                </span>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              {canSave && (
                <HeaderBtn label="Chat history" onClick={() => setHistoryOpen((h) => !h)}>
                  <History className="h-[16px] w-[16px]" />
                </HeaderBtn>
              )}
              <HeaderBtn
                label={maximized ? "Restore size" : "Maximize"}
                onClick={() => setMaximized((m) => !m)}
              >
                {maximized ? (
                  <Minimize2 className="h-[15px] w-[15px]" />
                ) : (
                  <Maximize2 className="h-[15px] w-[15px]" />
                )}
              </HeaderBtn>
              <HeaderBtn label="Minimize" onClick={() => setOpen(false)}>
                <Minus className="h-[18px] w-[18px]" />
              </HeaderBtn>
              <HeaderBtn
                label="Close"
                onClick={() => {
                  setOpen(false)
                  setMaximized(false)
                }}
              >
                <X className="h-[18px] w-[18px]" />
              </HeaderBtn>
            </div>
          </header>

          {/* History panel */}
          {historyOpen && (
            <div className="absolute inset-0 z-20 flex flex-col bg-white">
              <div className="flex items-center justify-between border-b border-[#e8ebf0] px-4 py-3">
                <span className="text-[13px] font-bold text-[#0f172a]">Chat history</span>
                <HeaderBtn label="Close history" onClick={() => setHistoryOpen(false)}>
                  <X className="h-[16px] w-[16px]" />
                </HeaderBtn>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                {sessions.length === 0 ? (
                  <p className="px-1 py-6 text-center text-[13px] text-[#94a3b8]">
                    No saved conversations yet.
                  </p>
                ) : (
                  <ul className="mx-auto flex w-full max-w-2xl flex-col gap-1.5">
                    {sessions.map((s) => (
                      <li key={s.id}>
                        <div
                          className={cn(
                            "group flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors",
                            s.id === sessionId
                              ? "border-[#2563eb]/40 bg-[#2563eb]/[0.05]"
                              : "border-[#e8ebf0] bg-white hover:border-[#2563eb]/40 hover:bg-[#f7f8fa]",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => openThread(s.id)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="truncate text-[13px] font-medium text-[#0f172a]">
                              {s.title || "Untitled chat"}
                            </div>
                            <div className="text-[11px] text-[#475569]">
                              {formatDateTime(s.updatedAt)}
                            </div>
                            <div className="text-[10.5px] text-[#94a3b8]">
                              {formatRelative(s.updatedAt)} · {s.messageCount} messages
                            </div>
                          </button>
                          <button
                            type="button"
                            aria-label="Delete chat"
                            onClick={() => deleteThread(s.id)}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#94a3b8] opacity-0 transition-opacity hover:bg-[#fee2e2] hover:text-[#dc2626] group-hover:opacity-100"
                          >
                            <Trash2 className="h-[14px] w-[14px]" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* Thread */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto bg-[#f7f8fa]">
            {showChips ? (
              /* Welcome — simple & centered */
              <div className="flex h-full flex-col items-center justify-center gap-5 px-6 py-8 text-center">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2563eb] text-white"
                  style={{ boxShadow: "0 4px 12px rgba(37,99,235,.3)" }}
                >
                  <Sparkles className="h-6 w-6" />
                </div>
                <p className="max-w-md text-[14.5px] leading-[22px] text-[#475569]">
                  I can dig into anything from your audit — scores, specific issues, crawl data, or
                  step-by-step fixes. Where do you want to start?
                </p>
                <div className="flex w-full max-w-xs flex-col items-stretch gap-[7px]">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q.label}
                      type="button"
                      onClick={() => ask(q.prompt, q.label)}
                      className="flex items-center justify-between gap-[5px] rounded-full border border-[#2563eb]/30 bg-white px-4 py-[9px] text-left text-[12.5px] font-semibold text-[#2563eb] transition-colors hover:bg-[#2563eb] hover:text-white"
                    >
                      {q.label}
                      <ArrowRight className="h-[13px] w-[13px] shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Conversation */
              <div
                className={cn(
                  "flex w-full flex-col gap-3",
                  maximized ? "px-6 py-5" : "mx-auto max-w-2xl p-4",
                )}
              >
                {renderThread(messages, loading, revealLen)}
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-[#e8ebf0] bg-white px-[14px] py-3">
            <form
              onSubmit={submitComposer}
              className={cn(
                "flex w-full items-center gap-2 rounded-full border border-[#e8ebf0] bg-white py-[5px] pl-4 pr-[5px]",
                !maximized && "mx-auto max-w-2xl",
              )}
            >
              <input
                ref={inputRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask anything about your audit…"
                disabled={loading}
                className="min-w-0 flex-1 bg-transparent py-[1px] text-[14px] text-[#0f172a] outline-none placeholder:text-[#94a3b8] disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={loading || !question.trim()}
                aria-label="Send"
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-colors",
                  question.trim() && !loading
                    ? "bg-[#2563eb] hover:bg-[#1d4ed8]"
                    : "cursor-not-allowed bg-[#cbd5e1]",
                )}
              >
                {loading ? (
                  <Loader2 className="h-[15px] w-[15px] animate-spin" />
                ) : (
                  <Send className="h-[15px] w-[15px]" />
                )}
              </button>
            </form>
            {/* Each question costs a credit. Sitting it under the box means the
                price is visible while typing, not discovered afterwards. */}
            <CreditCost
              className="mt-[6px] justify-center text-[10.5px]"
              action={CREDIT_ACTION_KEYS.pageAuditAsk}
              showBalance={false}
            />
            <p className="mt-[4px] text-center text-[10.5px] text-[#cbd5e1]">
              Powered by <b className="font-semibold">FreeSERP</b>
            </p>
          </div>
        </div>
      )}
    </>
  )
}

type ChatMessage = {
  role: "user" | "assistant"
  content: string
  error?: boolean
  streaming?: boolean
  time: number
}

type SessionMeta = {
  id: string
  title: string | null
  updatedAt: string
  messageCount: number
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

// Module-level so the React Compiler treats it as an opaque call (these run in
// event handlers, not during render).
function nowMs() {
  return Date.now()
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatRelative(iso: string) {
  const then = new Date(iso).getTime()
  const diff = nowMs() - then
  const min = Math.round(diff / 60000)
  if (min < 1) return "just now"
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" })
}

/** Renders the user/assistant message bubbles + a typing indicator. */
function renderThread(messages: ChatMessage[], loading: boolean, revealLen: number) {
  return (
    <>
      {messages.map((m, i) => {
        if (m.role === "user") {
          return (
            <div key={i} className="flex justify-end">
              <div className="flex max-w-[80%] flex-col rounded-2xl rounded-br-sm bg-[#2563eb] px-[14px] py-[8px] text-[14px] leading-[21px] text-white">
                <span>{m.content}</span>
                <span className="mt-0.5 self-end text-[10px] leading-none text-white/70">
                  {formatTime(m.time)}
                </span>
              </div>
            </div>
          )
        }
        const isStreaming = !!m.streaming && i === messages.length - 1 && revealLen < m.content.length
        const text = isStreaming ? m.content.slice(0, revealLen) : m.content
        return (
          <div key={i} className="flex max-w-full items-end gap-[9px]">
            <Avatar />
            <div
              className={cn(
                "flex max-w-[640px] flex-col rounded-2xl rounded-bl-sm border px-[14px] py-[10px]",
                m.error
                  ? "border-destructive/30 bg-destructive/5 text-destructive"
                  : "border-[#e8ebf0] bg-white text-[#0f172a]",
              )}
            >
              <div className="prose-tool text-[14px] leading-[21.7px]">
                <Markdown>{text}</Markdown>
                {isStreaming && (
                  <span className="ml-0.5 inline-block h-[14px] w-[2px] translate-y-[2px] animate-pulse bg-[#2563eb] align-middle" />
                )}
              </div>
              {!isStreaming && (
                <span className="mt-1 self-end text-[10px] leading-none text-[#94a3b8]">
                  {formatTime(m.time)}
                </span>
              )}
            </div>
          </div>
        )
      })}
      {loading && <TypingDots />}
    </>
  )
}

function Avatar() {
  return (
    <div
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-[#2563eb] text-[13px] font-bold text-white"
      style={{ boxShadow: "0 2px 6px rgba(37,99,235,.28)" }}
    >
      A
    </div>
  )
}

/** Animated "typing" bubble — three bouncing dots. */
function TypingDots() {
  return (
    <div className="flex items-end gap-[9px]">
      <Avatar />
      <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-[#e8ebf0] bg-white px-4 py-[14px]">
        <span className="h-2 w-2 rounded-full bg-[#cbd5e1] animate-[chat-dot_1.2s_ease-in-out_infinite]" />
        <span
          className="h-2 w-2 rounded-full bg-[#cbd5e1] animate-[chat-dot_1.2s_ease-in-out_infinite]"
          style={{ animationDelay: "0.15s" }}
        />
        <span
          className="h-2 w-2 rounded-full bg-[#2563eb] animate-[chat-dot_1.2s_ease-in-out_infinite]"
          style={{ animationDelay: "0.3s" }}
        />
      </div>
    </div>
  )
}

/** Assistant markdown — adds language-labelled code blocks. */
function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre: ({ children }) => <>{children}</>,
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "")
          const isBlock = !!match || String(children).includes("\n")
          if (!isBlock) {
            return (
              <code className={className} {...props}>
                {children}
              </code>
            )
          }
          return (
            <span className="code-block">
              <span className="code-block-lang">{match?.[1] ?? "code"}</span>
              <span className="code-block-body">{children}</span>
            </span>
          )
        },
      }}
    >
      {children}
    </ReactMarkdown>
  )
}

function HeaderBtn({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-md text-[#64748b] transition-colors hover:bg-[#f1f5f9] hover:text-[#0f172a]"
    >
      {children}
    </button>
  )
}

const SUGGESTED_QUESTIONS = [
  { label: "Show my audit summary", prompt: "Give me a concise summary of my audit results." },
  { label: "What needs fixing first?", prompt: "What are the top 3 things I should fix first?" },
  { label: "Help me improve", prompt: "What's the single biggest win I can ship today?" },
  { label: "Any critical issues?", prompt: "Are there any critical issues I should fix immediately?" },
]

/**
 * Trim the full AuditReport down to the shape the backend's audit-ask
 * endpoint expects — scores + issues + category labels, not the full nested
 * check details.
 */
function buildContext(report: AuditReport) {
  return {
    url: report.url,
    pagesAnalyzed: report.pagesAnalyzed,
    passingCount: report.passingChecks?.length ?? 0,
    overall: {
      score: report.scoring?.overall?.score ?? null,
      grade: report.scoring?.overall?.grade ?? null,
    },
    categories: Object.entries(report.scoring?.categories ?? {}).map(([key, val]) => ({
      key,
      label: key,
      score: val?.score ?? null,
      grade: val?.grade ?? null,
    })),
    issues: (report.issues ?? []).map((i) => ({
      severity: i.severity,
      title: i.title,
      description: i.description,
      category: i.category,
    })),
    // Every individual check with its actual finding — this is what lets the AI
    // answer about any single signal (title tag, robots.txt, schema, etc.).
    checks: (report.checks ?? []).map((c) => ({
      name: c.name,
      category: c.category,
      status: c.passed === true ? "pass" : c.passed === false ? "fail" : "info",
      score: c.score,
      maxScore: c.maxScore,
      finding: c.shortAnswer || c.answer || "",
      value: c.value ?? null,
      recommendation: c.recommendation ?? null,
    })),
    passingChecks: (report.passingChecks ?? []).map((p) => ({
      title: p.title,
      category: p.category,
    })),
    internalLinks: report.linkGraph?.metadata
      ? {
          pagesCrawled: report.linkGraph.metadata.totalPages,
          totalLinks: report.linkGraph.metadata.totalLinks,
          orphanPages: report.linkGraph.metadata.orphanPages,
          hubPages: report.linkGraph.metadata.hubPages,
          authorityPages: report.linkGraph.metadata.authorityPages,
          avgLinksPerPage: report.linkGraph.metadata.averageLinksPerPage,
          maxDepth: report.linkGraph.metadata.maxDepth,
          confidence: report.linkGraph.orphanData?.confidence ?? null,
          topLinkedPages: (report.linkGraph.metadata.topLinkedPages ?? [])
            .slice(0, 10)
            .map((p) => ({ url: p.url, title: p.title, inboundLinks: p.inboundLinks })),
        }
      : null,
    // Off-page backlink profile (DataForSEO summary + top backlinks).
    backlinks: report.backlinks
      ? {
          domain: report.backlinks.target,
          domainRank: report.backlinks.rank,
          totalBacklinks: report.backlinks.backlinks,
          referringDomains: report.backlinks.referringDomains,
          referringIps: report.backlinks.referringIps,
          brokenBacklinks: report.backlinks.brokenBacklinks,
          dofollow: report.backlinks.dofollow,
          nofollow: report.backlinks.nofollow,
          topBacklinks: (report.backlinks.topBacklinks ?? []).slice(0, 10).map((b) => ({
            domainStrength: b.domainStrength,
            from: b.urlFrom,
            pageTitle: b.pageTitle,
            anchor: b.anchor,
            dofollow: b.dofollow,
          })),
        }
      : null,
  }
}
