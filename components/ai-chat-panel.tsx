"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTheme } from "next-themes"
import type {
  AiCategory,
  AiTask,
  ChatMessage,
  ChatSessionResponse,
  ChatSessionsResponse,
  ChatSessionSummary,
  ChatMessagePostResponse,
} from "@/types/competitor-analysis"
import { renderChatMarkdown } from "@/lib/chat-md"
import { http } from "@/lib/http"

/**
 * AI Chat — floating launcher + expanding panel.
 * Faithful port of `temp/AI Chat.html` (the design handed off via Claude Design),
 * adapted to talk to the session-based backend (each "+" starts a new session,
 * the history drawer lists prior sessions for this analysis).
 *
 * The design CSS is lifted into a scoped <style jsx> block under `.audit-chat-root`
 * so it doesn't leak into the rest of the app.
 */

interface Props {
  analysisId: string
  selectedCategory: string | null
  categories: AiCategory[]
  onScopeChange: (scope: string | null) => void
  /** Whether to render at all (e.g. only when the AI tab is active). */
  visible?: boolean
}

type PickerStep = "category" | "problem" | "action"

const QUICK_ACTIONS: { id: "fix" | "why" | "steps"; lbl: string; txt: string; build: (taskTitle: string) => string }[] = [
  { id: "fix",   lbl: "Fix it",       txt: "Show me the exact change",  build: (t) => `Show me how to fix this: ${t}. Give a concrete drop-in solution with the exact text/code I should use.` },
  { id: "why",   lbl: "Why",          txt: "Explain the SEO impact",     build: (t) => `Why does this matter? Explain the SEO impact of: ${t}. Cite the specific gap vs my competitors.` },
  { id: "steps", lbl: "Step-by-step", txt: "Walk me through it",         build: (t) => `Walk me through, step by step, how to implement: ${t}. Number each step.` },
]

const apiBase = () => process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

export function AiChatPanel({ analysisId, selectedCategory, categories, onScopeChange, visible = true }: Props) {
  const { resolvedTheme } = useTheme()
  const isLight = resolvedTheme === "light"
  const [open, setOpen] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  // Sessions list (drawer)
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)

  // Active session
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loadingSession, setLoadingSession] = useState(false)

  // Messaging
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Token meter
  const [tokensUsed, setTokensUsed] = useState(0)
  const [tokensCap, setTokensCap] = useState(20000)

  // Picker (only relevant when in a "new chat" state with no session yet)
  const [activeProblem, setActiveProblem] = useState<AiTask | null>(null)

  const threadRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const activeCategory = useMemo<AiCategory | null>(
    () => (selectedCategory ? categories.find((c) => c.id === selectedCategory) || null : null),
    [selectedCategory, categories]
  )

  const pickerStep: PickerStep = useMemo(() => {
    if (!activeCategory) return "category"
    if (!activeProblem) return "problem"
    return "action"
  }, [activeCategory, activeProblem])

  const hasMessages = messages.length > 0
  const inFreshChat = currentSessionId === null
  const budgetExhausted = tokensUsed >= tokensCap
  const tokenPct = Math.min(100, Math.round((tokensUsed / tokensCap) * 100))
  const usageState: "ok" | "warn" | "crit" = tokenPct >= 90 ? "crit" : tokenPct >= 60 ? "warn" : "ok"

  const placeholder = activeProblem
    ? `Ask about: ${activeProblem.recommendation.slice(0, 60)}${activeProblem.recommendation.length > 60 ? "…" : ""}`
    : activeCategory
      ? `Ask about ${activeCategory.name.toLowerCase()}…`
      : "Ask about your audit results…"

  // Reset problem when the category changes
  useEffect(() => { setActiveProblem(null) }, [selectedCategory])

  // ── Loading ───────────────────────────────────────────────────────────────

  const loadSessions = useCallback(async (): Promise<ChatSessionSummary[]> => {
    setSessionsLoading(true)
    try {
      const res = await http.get<ChatSessionsResponse>(`${apiBase()}/api/competitor-analysis/${analysisId}/chat/sessions`, {
        withCredentials: true,
      })
      if (res.status < 200 || res.status >= 300) throw new Error("Failed to load history")
      const data = res.data
      setSessions(data.sessions)
      setTokensUsed(data.tokensUsed)
      setTokensCap(data.tokensCap)
      return data.sessions
    } finally {
      setSessionsLoading(false)
    }
  }, [analysisId])

  const loadSession = useCallback(async (sessionId: string) => {
    setLoadingSession(true)
    setError("")
    try {
      const res = await http.get<ChatSessionResponse>(`${apiBase()}/api/competitor-analysis/${analysisId}/chat/sessions/${sessionId}`, {
        withCredentials: true,
      })
      if (res.status < 200 || res.status >= 300) throw new Error("Failed to load chat")
      const data = res.data
      setCurrentSessionId(data.session.id)
      setMessages(data.messages)
      setTokensUsed(data.tokensUsed)
      setTokensCap(data.tokensCap)
      // Restore scope from session
      if (data.session.category !== selectedCategory) {
        onScopeChange(data.session.category)
      }
      // Restore the problem chip if the session was scoped to one
      if (data.session.problemTitle && data.session.category) {
        const cat = categories.find((c) => c.id === data.session.category)
        const task = cat?.tasks.find((t) => t.recommendation === data.session.problemTitle)
        setActiveProblem(task || null)
      } else {
        setActiveProblem(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chat")
    } finally {
      setLoadingSession(false)
    }
  }, [analysisId, categories, onScopeChange, selectedCategory])

  // On panel open: load sessions, auto-load most recent if any
  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      try {
        const list = await loadSessions()
        if (cancelled) return
        if (list.length > 0 && currentSessionId === null) {
          await loadSession(list[0].id)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load chat")
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, analysisId])

  // Auto-scroll
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" })
  }, [messages.length, sending, pickerStep])

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 220)
  }, [open])

  // ── Sending ───────────────────────────────────────────────────────────────

  const sendMessage = async (rawText: string) => {
    const userMessage = rawText.trim()
    if (!userMessage || sending || budgetExhausted) return
    setInput("")
    setError("")
    setSending(true)

    const optimisticUser: ChatMessage = {
      id: `tmp-${Date.now()}`,
      role: "user",
      content: userMessage,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimisticUser])

    try {
      // Create the session lazily if this is a fresh chat
      let sessionId = currentSessionId
      if (!sessionId) {
        const createRes = await http.post(`${apiBase()}/api/competitor-analysis/${analysisId}/chat/sessions`, {
          category: selectedCategory,
          problemTitle: activeProblem?.recommendation ?? null,
        }, {
          withCredentials: true,
        })
        const createData = createRes.data ?? {}
        if (createRes.status < 200 || createRes.status >= 300) {
          setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id))
          setInput(userMessage)
          throw new Error(createData.error || "Failed to start chat session")
        }
        sessionId = createData.session.id
        setCurrentSessionId(sessionId)
      }

      const res = await http.post(`${apiBase()}/api/competitor-analysis/${analysisId}/chat/sessions/${sessionId}/messages`, {
        message: userMessage,
      }, {
        withCredentials: true,
      })
      const data = res.data ?? {}

      if (res.status === 429) {
        setTokensUsed(data.tokensUsed ?? tokensCap)
        setTokensCap(data.tokensCap ?? tokensCap)
        setError(data.error || "Chat budget exhausted for this analysis")
        setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id))
        setInput(userMessage)
        return
      }
      if (res.status < 200 || res.status >= 300) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id))
        setInput(userMessage)
        throw new Error(data.error || "Failed to send message")
      }

      const ok = data as ChatMessagePostResponse
      // Replace optimistic user message with the persisted one + append assistant
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id).concat(ok.userMessage, ok.message))
      setTokensUsed(ok.tokensUsed)
      setTokensCap(ok.tokensCap)

      // Refresh sessions list silently so the drawer stays current
      void loadSessions().catch(() => { /* drawer can be stale */ })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message")
    } finally {
      setSending(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleQuickAction = (a: typeof QUICK_ACTIONS[number]) => {
    if (!activeProblem) return
    sendMessage(a.build(activeProblem.recommendation))
  }

  const handleCopy = async (msg: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(msg.content)
      setCopiedId(msg.id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch { /* noop */ }
  }

  const newChat = () => {
    setCurrentSessionId(null)
    setMessages([])
    setActiveProblem(null)
    onScopeChange(null)
    setError("")
    setInput("")
    setHistoryOpen(false)
    inputRef.current?.focus()
  }

  const deleteSession = async (sessionId: string) => {
    try {
      const res = await http.delete(`${apiBase()}/api/competitor-analysis/${analysisId}/chat/sessions/${sessionId}`, {
        withCredentials: true,
      })
      if ((res.status < 200 || res.status >= 300) && res.status !== 204) throw new Error("Failed to delete chat")
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      if (currentSessionId === sessionId) newChat()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete chat")
    }
  }

  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

  const fmtRelative = (iso: string) => {
    const now = Date.now()
    const t = new Date(iso).getTime()
    const diff = Math.max(0, now - t)
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return "just now"
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 7) return `${days}d ago`
    return new Date(iso).toLocaleDateString()
  }

  const priorityClass = (p: string) =>
    p === "HIGH" ? "high" : p === "MEDIUM" ? "med" : "low"

  const sessionScopeLabel = (s: ChatSessionSummary): string => {
    if (s.problemTitle) return s.problemTitle
    if (s.category) return categories.find((c) => c.id === s.category)?.name || s.category
    return "General"
  }

  if (!visible) return null

  return (
    <div className="audit-chat-root" data-density="comfy" data-theme={isLight ? "light" : "dark"}>
      {/* Floating launcher (visible when panel closed) */}
      <button
        type="button"
        className={`chat-launcher${open ? " hidden" : ""}`}
        onClick={() => setOpen(true)}
        aria-label="Open AI assistant"
      >
        <span className="lglyph">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M4 6h16v11H9l-4 4v-4H4V6z" />
          </svg>
        </span>
        Ask the analyst
        <span className="ping" aria-hidden />
      </button>

      {/* Floating panel */}
      <aside className={`chat-panel${open ? " open" : ""}${maximized ? " maximized" : ""}`} role="dialog" aria-label="AI assistant" aria-hidden={!open}>
        {/* Header */}
        <header className="ch-head">
          <div className="brand">
            <span className="glyph">A</span>
            <span>Audit Co-Pilot</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span className="status">Online</span>
            <div className="ch-actions">
              <button className="ch-btn" title="Chat history" onClick={() => setHistoryOpen(true)} type="button" aria-label="Chat history">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.2}>
                  <path d="M2 8a6 6 0 1 0 1.7-4.2M2 2v3h3M8 5v3l2 2" />
                </svg>
              </button>
              <button className="ch-btn" title="New chat" onClick={newChat} type="button" aria-label="New chat">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round">
                  <path d="M8 3v10M3 8h10" />
                </svg>
              </button>
              <button
                className="ch-btn"
                title={maximized ? "Restore size" : "Maximize"}
                onClick={() => setMaximized(m => !m)}
                type="button"
                aria-label={maximized ? "Restore size" : "Maximize"}
              >
                {maximized ? (
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 2v4h4M2 10h4v4M6 6L2 2M14 14l-4-4" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="12" height="12" />
                  </svg>
                )}
              </button>

              <button className="ch-btn" title="Close" onClick={() => setOpen(false)} type="button" aria-label="Close">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        {/* Usage meter */}
        <div className={`usage-row${budgetExhausted ? " locked" : ""}`}>
          <div className="usage-meta">
            <span className="usage-label mono">Token usage</span>
            <span className="usage-count mono">
              <span style={{ color: "var(--ink)", fontWeight: 600 }}>{tokensUsed.toLocaleString()}</span> / {tokensCap.toLocaleString()}
            </span>
          </div>
          <div className="usage-track">
            <div className={`usage-fill${usageState === "warn" ? " warn" : usageState === "crit" ? " crit" : ""}`} style={{ width: `${tokenPct}%` }} />
          </div>
        </div>

        {/* Context chips row (when scoped) */}
        {(activeCategory || activeProblem) && (
          <div className="ch-context">
            <span className="ctx-label mono">Context</span>
            {activeCategory && (
              <span className="ctx-chip topic">
                <span className="ctx-tag mono">TOPIC</span>
                <span>{activeCategory.name}</span>
                {inFreshChat && (
                  <span className="x" onClick={() => onScopeChange(null)} role="button" aria-label="Clear topic">×</span>
                )}
              </span>
            )}
            {activeProblem && (
              <span className="ctx-chip problem">
                <span className="ctx-tag mono">PROBLEM</span>
                <span className="ellip" title={activeProblem.recommendation}>{activeProblem.recommendation}</span>
                {inFreshChat && (
                  <span className="x" onClick={() => setActiveProblem(null)} role="button" aria-label="Clear problem">×</span>
                )}
              </span>
            )}
          </div>
        )}

        {/* Thread */}
        <div ref={threadRef} className="ch-thread">
          {loadingSession && (
            <div style={{ display: "flex", justifyContent: "center", padding: "30px 0" }}>
              <span className="spinner" />
            </div>
          )}

          {!loadingSession && !hasMessages && pickerStep === "category" && (
            <div className="empty">
              <div className="greet">Hey, <em>where do you want to start?</em></div>
              <div className="lead">
                I have full context of your competitor analysis. Pick a <strong>category</strong> to focus the conversation, or just type a question below.
              </div>
              <div className="picker-step-label mono">Step 1 — Pick a category</div>
              <div className="topic-grid">
                {categories.map((cat, idx) => (
                  <button key={cat.id} className="topic-card" onClick={() => onScopeChange(cat.id)} type="button">
                    <span className="tc-num mono">{String(idx + 1).padStart(2, "0")}</span>
                    <span className="tc-name">{cat.name}</span>
                    <span className="tc-count mono">{cat.taskCount} task{cat.taskCount === 1 ? "" : "s"}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!loadingSession && !hasMessages && pickerStep === "problem" && activeCategory && (
            <div className="empty">
              <div className="picker-crumb mono">
                <button className="crumb-back" onClick={() => onScopeChange(null)} type="button">← All categories</button>
                <span className="crumb-sep">·</span>
                <span className="crumb-now">{activeCategory.name}</span>
              </div>
              <div className="picker-step-label mono">Step 2 — Pick a recommendation</div>
              <div className="prob-list">
                {activeCategory.tasks.map((task, idx) => (
                  <button key={`${activeCategory.id}-${idx}`} className="prob-card" onClick={() => setActiveProblem(task)} type="button">
                    <div className="pc-row">
                      <span className="pc-title">{task.recommendation}</span>
                      <span className={`badge ${priorityClass(task.priority)}`}>{task.priority}</span>
                    </div>
                    {task.details && <div className="pc-summary mono">{task.details}</div>}
                  </button>
                ))}
              </div>
              <div className="lead-mini mono">…or just type a question below to chat about {activeCategory.name.toLowerCase()} broadly.</div>
            </div>
          )}

          {!loadingSession && !hasMessages && pickerStep === "action" && activeCategory && activeProblem && (
            <div className="empty">
              <div className="picker-crumb mono">
                <button className="crumb-back" onClick={() => setActiveProblem(null)} type="button">← Recommendations</button>
                <span className="crumb-sep">·</span>
                <span className="crumb-now">{activeCategory.name}</span>
              </div>
              <div className="problem-banner">
                <div className="pb-label mono">Selected recommendation</div>
                <div className="pb-title">{activeProblem.recommendation}</div>
                {activeProblem.details && <div className="pb-summary mono">{activeProblem.details}</div>}
              </div>
              <div className="picker-step-label mono">Ask anything — or pick a quick action</div>
              <div className="chip-grid">
                {QUICK_ACTIONS.map((a) => (
                  <button key={a.id} className="chip" onClick={() => handleQuickAction(a)} disabled={sending || budgetExhausted} type="button">
                    <span className="lbl">{a.lbl}</span>
                    <span className="txt">{a.txt}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!loadingSession && hasMessages && (
            <>
              {messages.map((m) => {
                const isUser = m.role === "user"
                return (
                  <div key={m.id} className={`msg ${isUser ? "user" : "ai"}`}>
                    {!isUser && <div className="avatar">A</div>}
                    <div style={{ maxWidth: isUser ? "var(--m-bubble-max)" : undefined, display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
                      <div className="bubble" dangerouslySetInnerHTML={{ __html: renderChatMarkdown(m.content) }} />
                      <div className="meta">
                        <span>{isUser ? "You" : "Audit Co-Pilot"}</span>
                        <span>·</span>
                        <span>{fmtTime(m.createdAt)}</span>
                        {!isUser && !m.id.startsWith("tmp-") && (
                          <>
                            <span>·</span>
                            <button className="copy-btn" onClick={() => handleCopy(m)} type="button">
                              {copiedId === m.id ? "Copied" : "Copy"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {isUser && <div className="avatar user mono">You</div>}
                  </div>
                )
              })}
              {sending && (
                <div className="msg ai">
                  <div className="avatar">A</div>
                  <div className="bubble">
                    <span className="typing"><span /><span /><span /></span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="ch-error mono">{error}</div>
        )}

        {/* Scope bar above input */}
        {(activeCategory || activeProblem) && (
          <div className="scope-bar">
            <span className="sb-text mono">
              Scoped to: {activeProblem ? activeProblem.recommendation : activeCategory?.name}
            </span>
            <button className="sb-change" onClick={newChat} type="button">Change topic</button>
          </div>
        )}

        {/* Input */}
        <footer className="ch-input">
          {budgetExhausted ? (
            <div className="budget-locked mono">Token budget reached for this analysis.</div>
          ) : (
            <>
              <form className="input-row" onSubmit={handleSubmit}>
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={placeholder}
                  autoComplete="off"
                  disabled={sending}
                />
                <button className="send" type="submit" disabled={sending || !input.trim()} aria-label="Send">
                  {sending ? (
                    <span className="spinner small" />
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M2 2l12 6-12 6 2-6L2 2zm2.4 5L3.5 4l7.7 4-7.7 4 .9-3H8V7H4.4z" />
                    </svg>
                  )}
                </button>
              </form>
              <div className="hint mono">
                <span>Audit Co-Pilot may misjudge edge cases</span>
                <span><kbd>Enter</kbd> to send</span>
              </div>
            </>
          )}
        </footer>

        {/* History drawer (overlays the panel) */}
        <div
          className={`history-drawer${historyOpen ? " open" : ""}`}
          aria-hidden={!historyOpen}
        >
          <div className="hd-head">
            <span className="hd-title mono">Chat history</span>
            <button className="ch-btn" title="Close" onClick={() => setHistoryOpen(false)} type="button" aria-label="Close history">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
          <div className="hd-list">
            {sessionsLoading && sessions.length === 0 && (
              <div style={{ display: "flex", justifyContent: "center", padding: "30px 0" }}>
                <span className="spinner" />
              </div>
            )}
            {!sessionsLoading && sessions.length === 0 && (
              <div className="hd-empty">
                <div className="em">No chats yet</div>
                Your conversations will appear here.
              </div>
            )}
            {sessions.map((s) => {
              const title = s.title || "(untitled chat)"
              const isActive = s.id === currentSessionId
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`hd-item${isActive ? " active" : ""}`}
                  onClick={() => { setHistoryOpen(false); loadSession(s.id) }}
                >
                  <div className="hd-row">
                    <span className="hd-title-text">{title}</span>
                    <span
                      role="button"
                      aria-label="Delete chat"
                      tabIndex={0}
                      className="hd-del"
                      onClick={(e) => { e.stopPropagation(); deleteSession(s.id) }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          e.stopPropagation()
                          deleteSession(s.id)
                        }
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.2}>
                        <path d="M3 4h10M6 4V2.5h4V4M5 4l1 9h4l1-9M7 6v5M9 6v5" />
                      </svg>
                    </span>
                  </div>
                  <div className="hd-meta">
                    <span className="scope">{sessionScopeLabel(s)}</span>
                    <span>·</span>
                    <span>{s.messageCount} msg{s.messageCount === 1 ? "" : "s"}</span>
                    <span>·</span>
                    <span className="hd-time">{fmtRelative(s.updatedAt)}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </aside>

      {/* Scoped CSS — lifted from the design with adaptations for embedding. */}
      <style jsx>{`
        .audit-chat-root {
          /* Design tokens */
          --bg: #0e0d0c;
          --bg-2: #141211;
          --panel: #1a1715;
          --panel-2: #1f1b18;
          --line: #2a2522;
          --line-2: #3a322d;
          --ink: #efe7df;
          --ink-dim: #b8ada3;
          --ink-mute: #7a716a;
          --ink-faint: #4f4842;
          --accent: #ff6b35;
          --accent-soft: #ff8a5b;
          --accent-bg: rgba(255, 107, 53, 0.08);
          --accent-bg-2: rgba(255, 107, 53, 0.15);
          --warn: #d4a44a;
          --good: #7fb27a;

          /* Density (comfy default) */
          --m-pad-y: 10px;
          --m-pad-x: 14px;
          --m-gap: 18px;
          --m-font: 13.2px;
          --m-avatar: 26px;
          --m-bubble-max: 86%;
          --m-thread-pad: 18px 16px 20px;

          font-family: 'IBM Plex Sans', system-ui, sans-serif;
        }
        .audit-chat-root .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: 0.02em; }
        .audit-chat-root *, .audit-chat-root *::before, .audit-chat-root *::after { box-sizing: border-box; }

        /* ============== LIGHT MODE OVERRIDES ============== */
        .audit-chat-root[data-theme="light"] {
          --bg: #fafafa;
          --bg-2: #f4f2f0;
          --panel: #ffffff;
          --panel-2: #f7f5f3;
          --line: #e5e0db;
          --line-2: #cdc6bf;
          --ink: #1a1715;
          --ink-dim: #4a443e;
          --ink-mute: #7a716a;
          --ink-faint: #b4ada6;
          --accent: #d9531e;
          --accent-soft: #ef7044;
          --accent-bg: rgba(217, 83, 30, 0.08);
          --accent-bg-2: rgba(217, 83, 30, 0.18);
        }
        .audit-chat-root[data-theme="light"] .chat-panel {
          background: #ffffff;
          box-shadow: 0 30px 80px -20px rgba(20, 18, 17, 0.18), 0 0 0 1px rgba(217, 83, 30, 0.18);
        }
        .audit-chat-root[data-theme="light"] .chat-launcher {
          color: #ffffff;
          box-shadow: 0 12px 40px -12px rgba(217, 83, 30, 0.55), 0 0 0 1px rgba(217, 83, 30, 0.35);
        }
        .audit-chat-root[data-theme="light"] .chat-launcher:hover {
          box-shadow: 0 18px 50px -10px rgba(217, 83, 30, 0.7), 0 0 0 1px rgba(217, 83, 30, 0.45);
        }
        .audit-chat-root[data-theme="light"] .ping {
          background: #ffffff;
          box-shadow: 0 0 0 2px var(--accent);
        }
        .audit-chat-root[data-theme="light"] .ch-input { background: #fafafa; }
        .audit-chat-root[data-theme="light"] .history-drawer { background: #ffffff; }
        .audit-chat-root[data-theme="light"] .send { color: #ffffff; }
        .audit-chat-root[data-theme="light"] .ctx-chip,
        .audit-chat-root[data-theme="light"] .scope-bar { background: #f4f2f0; }
        .audit-chat-root[data-theme="light"] .copy-btn,
        .audit-chat-root[data-theme="light"] .hd-item { background: #ffffff; }
        .audit-chat-root[data-theme="light"] .msg .bubble { background: #f4f2f0; color: var(--ink); }
        .audit-chat-root[data-theme="light"] .msg.user .bubble { background: var(--accent-bg); color: var(--ink); border: 1px solid rgba(217, 83, 30, 0.25); }

        /* ============== LAUNCHER ============== */
        .chat-launcher {
          position: fixed; right: 28px; bottom: 28px; z-index: 50;
          height: 56px; padding: 0 22px 0 18px;
          background: var(--accent);
          color: #1a0c05;
          border: none;
          display: inline-flex; align-items: center; gap: 12px;
          font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
          cursor: pointer;
          box-shadow: 0 12px 40px -12px rgba(255, 107, 53, 0.7), 0 0 0 1px rgba(255, 107, 53, 0.4);
          transition: transform 0.2s ease, box-shadow 0.2s, opacity 0.2s;
        }
        .chat-launcher:hover { transform: translateY(-2px); box-shadow: 0 18px 50px -10px rgba(255, 107, 53, 0.85), 0 0 0 1px rgba(255, 107, 53, 0.5); }
        .chat-launcher .lglyph {
          width: 24px; height: 24px;
          display: inline-flex; align-items: center; justify-content: center;
          background: rgba(0, 0, 0, 0.18); border-radius: 50%;
        }
        .chat-launcher.hidden { opacity: 0; transform: scale(0.6) translateY(20px); pointer-events: none; }
        .ping {
          position: absolute; right: -4px; top: -4px;
          width: 10px; height: 10px; border-radius: 50%;
          background: #1a0c05;
          box-shadow: 0 0 0 2px var(--accent);
        }
        .ping::after {
          content: ''; position: absolute; inset: 0; border-radius: 50%;
          background: var(--accent);
          animation: ping 1.8s ease-out infinite;
        }
        @keyframes ping {
          0% { transform: scale(1); opacity: 0.7; }
          80%, 100% { transform: scale(2.6); opacity: 0; }
        }

        /* ============== PANEL ============== */
        .chat-panel {
          position: fixed; right: 28px; bottom: 28px; z-index: 60;
          width: 420px; height: 640px;
          max-height: calc(100vh - 56px);
          background: #131110;
          border: 1px solid var(--line-2);
          color: var(--ink);
          display: grid;
          grid-template-rows: auto auto auto auto 1fr auto auto auto;
          overflow: hidden;
          box-shadow: 0 30px 80px -20px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 107, 53, 0.15);
          transform-origin: bottom right;
          opacity: 0;
          transform: scale(0.85) translateY(24px);
          pointer-events: none;
          transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .chat-panel.open { opacity: 1; transform: scale(1) translateY(0); pointer-events: auto; }
        .chat-panel.maximized {
          right: 24px; bottom: 24px; left: 24px; top: 24px;
          width: auto; height: auto; max-height: none;
        }
        @media (max-width: 720px) {
          .chat-panel.maximized { right: 0; bottom: 0; left: 0; top: 0; }
        }

        /* Header */
        .ch-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 16px;
          border-bottom: 1px solid var(--line);
        }
        .ch-head .brand {
          display: flex; align-items: center; gap: 10px;
          font-family: 'IBM Plex Mono', monospace; font-size: 11px;
          color: var(--accent); letter-spacing: 0.14em; text-transform: uppercase;
        }
        .brand .glyph {
          width: 22px; height: 22px;
          display: inline-flex; align-items: center; justify-content: center;
          border: 1px solid var(--accent);
          color: var(--accent);
          font-family: 'Bebas Neue', 'Antonio', sans-serif; font-size: 13px;
        }
        .ch-head .status {
          color: var(--ink-mute); font-family: 'IBM Plex Mono', monospace; font-size: 9.5px;
          letter-spacing: 0.12em; text-transform: uppercase;
          display: flex; align-items: center; gap: 6px;
        }
        .ch-head .status::before {
          content: ''; width: 6px; height: 6px; border-radius: 50%;
          background: var(--good); box-shadow: 0 0 8px var(--good);
        }
        .ch-actions { display: flex; gap: 6px; }
        .ch-btn {
          width: 26px; height: 26px;
          background: transparent; border: 1px solid var(--line);
          color: var(--ink-mute); cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center;
        }
        .ch-btn:hover { color: var(--ink); border-color: var(--line-2); }

        /* Context chips row */
        .ch-context {
          padding: 10px 16px;
          border-bottom: 1px solid var(--line);
          background: rgba(255, 107, 53, 0.03);
          display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
        }
        .ctx-label {
          font-family: 'IBM Plex Mono', monospace; font-size: 9px;
          color: var(--ink-faint); letter-spacing: 0.16em; text-transform: uppercase;
        }
        .ctx-chip {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 5px 10px;
          font-family: 'IBM Plex Mono', monospace; font-size: 10.5px;
          max-width: 100%;
        }
        .ctx-chip.topic {
          border: 1px solid rgba(255, 107, 53, 0.4);
          background: rgba(255, 107, 53, 0.06);
          color: var(--accent-soft);
        }
        .ctx-chip.problem {
          border: 1px solid var(--line-2);
          background: rgba(255, 255, 255, 0.03);
          color: var(--ink-dim);
          max-width: 220px;
        }
        .ctx-chip .x { color: var(--ink-mute); cursor: pointer; margin-left: 2px; user-select: none; }
        .ctx-chip .x:hover { color: var(--ink); }
        .ctx-chip .ctx-tag {
          font-size: 8.5px; letter-spacing: 0.16em;
          color: var(--ink-faint);
          border-right: 1px solid var(--line-2);
          padding-right: 6px; margin-right: 2px;
        }
        .ctx-chip.topic .ctx-tag { color: var(--accent); border-right-color: rgba(255, 107, 53, 0.3); }
        .ctx-chip .ellip { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px; }

        /* Usage meter */
        .usage-row {
          padding: 10px 16px 12px;
          border-bottom: 1px solid var(--line);
          display: flex; flex-direction: column; gap: 6px;
          background: rgba(255, 255, 255, 0.015);
        }
        .usage-meta { display: flex; justify-content: space-between; align-items: baseline; }
        .usage-label {
          font-size: 9px; color: var(--ink-faint);
          letter-spacing: 0.16em; text-transform: uppercase;
        }
        .usage-count { font-size: 10px; color: var(--ink-dim); letter-spacing: 0.04em; }
        .usage-track {
          height: 4px;
          background: var(--bg);
          border: 1px solid var(--line);
          overflow: hidden;
          position: relative;
        }
        .usage-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--accent) 0%, var(--accent-soft) 100%);
          transition: width 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), background 0.3s;
          box-shadow: 0 0 8px rgba(255, 107, 53, 0.4);
        }
        .usage-fill.warn { background: linear-gradient(90deg, var(--warn) 0%, #e8b85c 100%); box-shadow: 0 0 8px rgba(212, 164, 74, 0.4); }
        .usage-fill.crit { background: linear-gradient(90deg, #e57373 0%, #ff8a8a 100%); box-shadow: 0 0 8px rgba(229, 115, 115, 0.5); }
        .usage-row.locked .usage-label::after { content: ' · LIMIT REACHED'; color: #e57373; }

        /* Thread */
        .ch-thread {
          overflow-y: auto;
          overscroll-behavior: contain;
          padding: var(--m-thread-pad);
          display: flex; flex-direction: column; gap: var(--m-gap);
          scrollbar-width: thin;
          scrollbar-color: var(--line-2) transparent;
        }
        .ch-thread::-webkit-scrollbar { width: 6px; }
        .ch-thread::-webkit-scrollbar-thumb { background: var(--line-2); }

        /* Empty state */
        .empty { padding: 8px 4px 4px; }
        .empty .greet {
          font-family: 'Bebas Neue', 'Antonio', sans-serif; font-size: 26px; font-weight: 400;
          color: var(--ink); line-height: 1.1; margin-bottom: 8px; letter-spacing: 0.01em;
        }
        .empty .greet em { color: var(--accent); font-style: normal; }
        .empty .lead { color: var(--ink-dim); font-size: 12.5px; line-height: 1.55; margin-bottom: 18px; }
        .empty .lead strong { color: var(--ink); font-weight: 600; }
        .empty .lead em { color: var(--accent-soft); font-style: normal; font-family: 'IBM Plex Mono', monospace; font-size: 12px; }
        .empty .lead-mini { color: var(--ink-mute); font-size: 10.5px; margin-top: 14px; }

        .picker-step-label {
          font-family: 'IBM Plex Mono', monospace; font-size: 9.5px;
          color: var(--ink-faint); letter-spacing: 0.16em; text-transform: uppercase;
          margin: 4px 0 10px;
        }
        .picker-crumb {
          display: flex; align-items: center; gap: 8px; margin-bottom: 14px;
          font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase;
        }
        .crumb-back {
          background: none; border: none; color: var(--ink-mute); cursor: pointer;
          font: inherit; padding: 0; letter-spacing: inherit; text-transform: inherit;
        }
        .crumb-back:hover { color: var(--accent); }
        .crumb-sep { color: var(--ink-faint); }
        .crumb-now { color: var(--accent); }

        /* Topic grid */
        .topic-grid { display: flex; flex-direction: column; gap: 6px; }
        .topic-card {
          display: grid; grid-template-columns: 28px 1fr auto; align-items: center; gap: 12px;
          padding: 12px 14px;
          background: var(--panel);
          border: 1px solid var(--line);
          text-align: left; cursor: pointer; color: var(--ink);
          transition: border-color 0.15s, background 0.15s, transform 0.1s;
          font-family: inherit;
        }
        .topic-card:hover { border-color: var(--accent); background: var(--accent-bg); transform: translateX(2px); }
        .tc-num { color: var(--ink-faint); font-size: 10px; }
        .topic-card:hover .tc-num { color: var(--accent); }
        .tc-name { font-size: 13.5px; }
        .tc-count { color: var(--ink-mute); font-size: 9.5px; letter-spacing: 0.1em; text-transform: uppercase; }

        /* Problem list */
        .prob-list { display: flex; flex-direction: column; gap: 6px; }
        .prob-card {
          display: flex; flex-direction: column; gap: 6px;
          padding: 12px 14px;
          background: var(--panel);
          border: 1px solid var(--line);
          text-align: left; cursor: pointer; color: var(--ink);
          transition: border-color 0.15s, background 0.15s, transform 0.1s;
          font-family: inherit;
        }
        .prob-card:hover { border-color: var(--accent); background: var(--accent-bg); transform: translateX(2px); }
        .pc-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
        .pc-title { font-size: 13px; line-height: 1.35; }
        .pc-summary { color: var(--ink-mute); font-size: 11px; line-height: 1.5; }

        /* Selected problem banner */
        .problem-banner {
          border: 1px solid var(--accent);
          background: var(--accent-bg);
          padding: 12px 14px; margin-bottom: 14px;
          display: flex; flex-direction: column; gap: 4px;
        }
        .pb-label { font-size: 9.5px; color: var(--accent); letter-spacing: 0.16em; text-transform: uppercase; }
        .pb-title { color: var(--ink); font-size: 13.5px; line-height: 1.35; }
        .pb-summary { color: var(--ink-dim); font-size: 11px; line-height: 1.5; }

        /* Quick action chips */
        .chip-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
        .chip {
          text-align: left;
          background: var(--panel);
          border: 1px solid var(--line);
          padding: 12px;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s, transform 0.1s;
          color: var(--ink-dim);
          display: flex; flex-direction: column; gap: 6px;
          font-family: inherit;
        }
        .chip:hover:not(:disabled) { border-color: var(--accent); background: var(--accent-bg); color: var(--ink); transform: translateY(-1px); }
        .chip:disabled { opacity: 0.5; cursor: not-allowed; }
        .chip .lbl {
          font-family: 'IBM Plex Mono', monospace; font-size: 9px;
          letter-spacing: 0.18em; text-transform: uppercase;
          color: var(--accent);
        }
        .chip .txt { font-size: 12.5px; line-height: 1.4; }

        /* Priority badges */
        .badge { font-family: 'IBM Plex Mono', monospace; font-size: 10px; padding: 4px 10px; letter-spacing: 0.1em; }
        .badge.high { color: #e57373; background: rgba(229, 115, 115, 0.1); border: 1px solid rgba(229, 115, 115, 0.4); }
        .badge.med { color: #d4a44a; background: rgba(212, 164, 74, 0.1); border: 1px solid rgba(212, 164, 74, 0.4); }
        .badge.low { color: var(--ink-mute); background: rgba(255, 255, 255, 0.02); border: 1px solid var(--line-2); }

        /* Messages */
        .msg { display: flex; gap: 10px; align-items: flex-start; }
        .msg.user { justify-content: flex-end; }
        .avatar {
          flex: 0 0 var(--m-avatar);
          width: var(--m-avatar); height: var(--m-avatar);
          border: 1px solid var(--accent);
          color: var(--accent);
          display: inline-flex; align-items: center; justify-content: center;
          font-family: 'Bebas Neue', 'Antonio', sans-serif;
          font-size: calc(var(--m-avatar) * 0.5);
          margin-top: 2px;
        }
        .avatar.user {
          border-color: var(--line-2); color: var(--ink-dim);
          font-family: 'IBM Plex Mono', monospace; font-size: 10px;
        }
        .bubble {
          max-width: var(--m-bubble-max);
          padding: var(--m-pad-y) var(--m-pad-x);
          font-size: var(--m-font);
          line-height: 1.6;
          color: var(--ink);
          background: var(--panel);
          border: 1px solid var(--line);
        }
        .msg.user .bubble {
          background: rgba(255, 107, 53, 0.08);
          border-color: rgba(255, 107, 53, 0.3);
          color: var(--ink);
        }
        .meta {
          display: flex; align-items: center; gap: 8px;
          margin-top: 6px;
          color: var(--ink-faint);
          font-family: 'IBM Plex Mono', monospace; font-size: 9.5px;
          letter-spacing: 0.1em;
        }
        .msg.user .meta { justify-content: flex-end; padding-right: 36px; }
        .msg.ai .meta { padding-left: 36px; }
        .copy-btn {
          background: none; border: none; color: var(--ink-faint);
          font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: 0.1em;
          cursor: pointer; padding: 2px 4px;
          text-transform: uppercase;
        }
        .copy-btn:hover { color: var(--accent); }

        /* Bubble markdown */
        .bubble :global(p) { margin: 0 0 8px; }
        .bubble :global(p:last-child) { margin-bottom: 0; }
        .bubble :global(strong) { color: var(--ink); font-weight: 600; }
        .bubble :global(em) { font-style: normal; color: var(--accent-soft); font-family: 'IBM Plex Mono', monospace; font-size: 12px; }
        .bubble :global(ul), .bubble :global(ol) { margin: 8px 0; padding-left: 20px; color: var(--ink-dim); }
        .bubble :global(li) { margin-bottom: 4px; font-size: 12.8px; }
        .bubble :global(li::marker) { color: var(--accent); }
        .bubble :global(code) {
          font-family: 'IBM Plex Mono', monospace; font-size: 11.5px;
          background: var(--bg);
          border: 1px solid var(--line-2);
          padding: 1px 5px; color: var(--accent-soft);
        }
        .bubble :global(pre) {
          background: var(--bg); border: 1px solid var(--line-2);
          padding: 10px 12px; margin: 8px 0;
          overflow-x: auto;
          font-family: 'IBM Plex Mono', monospace; font-size: 11.5px;
          color: var(--ink-dim);
          line-height: 1.55;
        }
        .bubble :global(pre code) { background: none; border: none; padding: 0; color: inherit; }

        /* Typing dots */
        .typing { display: inline-flex; gap: 4px; padding: 2px 0; }
        .typing span {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--ink-mute);
          animation: bounce 1.2s ease-in-out infinite;
        }
        .typing span:nth-child(2) { animation-delay: 0.15s; }
        .typing span:nth-child(3) { animation-delay: 0.3s; }
        @keyframes bounce {
          0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
          40% { opacity: 1; transform: translateY(-3px); background: var(--accent); }
        }

        /* Spinner */
        .spinner {
          width: 16px; height: 16px;
          border: 2px solid var(--line-2);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        .spinner.small { width: 12px; height: 12px; border-width: 1.5px; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Error row */
        .ch-error {
          padding: 8px 16px;
          font-size: 11px; color: #e57373;
          background: rgba(229, 115, 115, 0.06);
          border-top: 1px solid rgba(229, 115, 115, 0.3);
        }

        /* Scope bar */
        .scope-bar {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          padding: 8px 14px;
          border-top: 1px solid var(--line);
          background: rgba(255, 107, 53, 0.04);
        }
        .scope-bar .sb-text {
          color: var(--accent-soft); font-size: 10.5px;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .scope-bar .sb-change {
          background: none; border: 1px solid var(--line-2); color: var(--ink-mute);
          font-family: 'IBM Plex Mono', monospace; font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase;
          padding: 4px 8px; cursor: pointer; flex-shrink: 0;
        }
        .scope-bar .sb-change:hover { color: var(--accent); border-color: var(--accent); }

        /* Input */
        .ch-input {
          border-top: 1px solid var(--line);
          padding: 12px 14px 14px;
          background: #0f0d0c;
        }
        .input-row {
          display: flex; align-items: center; gap: 10px;
          border: 1px solid var(--line-2);
          padding: 4px 4px 4px 14px;
          transition: border-color 0.15s;
        }
        .input-row:focus-within { border-color: var(--accent); }
        .input-row input {
          flex: 1; min-width: 0;
          background: transparent; border: none; outline: none;
          color: var(--ink);
          font-family: 'IBM Plex Sans', sans-serif; font-size: 13px;
          padding: 8px 0;
        }
        .input-row input::placeholder { color: var(--ink-faint); }
        .input-row input:disabled { opacity: 0.6; }
        .send {
          height: 32px; min-width: 32px;
          background: var(--accent); color: #1a0c05;
          border: none; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center;
          transition: background 0.15s, opacity 0.15s;
        }
        .send:disabled { background: var(--line-2); color: var(--ink-faint); cursor: not-allowed; }
        .send:hover:not(:disabled) { background: var(--accent-soft); }
        .hint {
          margin-top: 8px; padding: 0 2px;
          display: flex; justify-content: space-between;
          font-size: 9px;
          letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--ink-faint);
        }
        .hint kbd {
          font-family: 'IBM Plex Mono', monospace; font-size: 9px;
          border: 1px solid var(--line-2); padding: 1px 5px; color: var(--ink-mute);
        }
        .budget-locked {
          padding: 12px;
          font-size: 11px; color: var(--ink-mute);
          text-align: center;
          border: 1px dashed var(--line-2);
        }

        /* History drawer (overlays the panel) */
        .history-drawer {
          position: absolute; inset: 0;
          background: #131110;
          z-index: 5;
          display: flex; flex-direction: column;
          transform: translateX(-100%);
          transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
          pointer-events: none;
        }
        .history-drawer.open { transform: translateX(0); pointer-events: auto; }
        .hd-head {
          padding: 14px 16px;
          border-bottom: 1px solid var(--line);
          display: flex; align-items: center; justify-content: space-between;
        }
        .hd-title { font-size: 11px; color: var(--accent); letter-spacing: 0.14em; text-transform: uppercase; }
        .hd-list {
          flex: 1; overflow-y: auto;
          overscroll-behavior: contain;
          padding: 8px 8px 16px;
          display: flex; flex-direction: column; gap: 4px;
        }
        .hd-empty {
          padding: 30px 20px; text-align: center;
          color: var(--ink-mute); font-size: 12px; line-height: 1.5;
        }
        .hd-empty .em {
          font-family: 'Bebas Neue', 'Antonio', sans-serif; font-size: 22px;
          color: var(--ink); margin-bottom: 6px;
        }
        .hd-item {
          background: var(--panel);
          border: 1px solid var(--line);
          padding: 10px 12px;
          cursor: pointer;
          display: flex; flex-direction: column; gap: 4px;
          transition: border-color 0.15s, background 0.15s, transform 0.1s;
          position: relative;
          text-align: left;
          color: var(--ink);
          font-family: inherit;
        }
        .hd-item:hover { border-color: var(--accent); background: var(--accent-bg); }
        .hd-item.active { border-color: var(--accent); background: var(--accent-bg-2); }
        .hd-row {
          display: flex; justify-content: space-between; align-items: center; gap: 8px;
        }
        .hd-title-text {
          color: var(--ink); font-size: 12.5px; line-height: 1.35;
          overflow: hidden; text-overflow: ellipsis;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
        }
        .hd-meta {
          display: flex; gap: 8px; align-items: center;
          font-family: 'IBM Plex Mono', monospace; font-size: 9.5px;
          color: var(--ink-faint); letter-spacing: 0.06em;
        }
        .hd-meta .scope { color: var(--accent); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .hd-time { color: var(--ink-mute); }
        .hd-del {
          color: var(--ink-faint);
          cursor: pointer; padding: 2px 4px; opacity: 0;
          transition: opacity 0.15s, color 0.15s;
          display: inline-flex; align-items: center; justify-content: center;
        }
        .hd-item:hover .hd-del { opacity: 1; }
        .hd-del:hover { color: #e57373; }

        /* Responsive */
        @media (max-width: 760px) {
          .chat-panel { right: 12px; left: 12px; bottom: 12px; width: auto; height: calc(100vh - 24px); }
          .chat-launcher { right: 16px; bottom: 16px; }
          .chip-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  )
}
