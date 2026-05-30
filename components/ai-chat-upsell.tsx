"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"

/**
 * Free-tier launcher for the AI chat. Mirrors the look of the paid-only
 * `AiChatPanel` floating button so the UX is consistent, but clicking it
 * opens an upsell modal explaining what's locked instead of starting a
 * session.
 */
export function AskAnalystUpsell() {
  const { resolvedTheme } = useTheme()
  const isLight = resolvedTheme === "light"
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  const features = [
    "Chat with our SEO analyst about your audit",
    "Drop-in fixes for titles, H1s, meta, and copy",
    "Why-it-matters explanations with competitor gaps",
    "Step-by-step implementation walkthroughs",
    "Scope the chat to a category or single problem",
    "Persistent chat history per analysis",
  ]

  return (
    <div className="aau-root" data-theme={isLight ? "light" : "dark"}>
      <button
        type="button"
        className="aau-launcher"
        onClick={() => setOpen(true)}
        aria-label="Ask the analyst (Upgrade required)"
      >
        <span className="aau-lglyph">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>
        Ask the analyst
        <span className="aau-tag mono">Paid</span>
      </button>

      {open && (
        <div className="aau-modal-root" role="dialog" aria-label="Audit Co-Pilot upgrade">
          <div className="aau-backdrop" onClick={() => setOpen(false)} />
          <div className="aau-modal">
            <header className="aau-head">
              <div className="aau-brand">
                <span className="aau-glyph">A</span>
                <span>Audit Co-Pilot</span>
              </div>
              <button className="aau-close" onClick={() => setOpen(false)} aria-label="Close">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </header>
            <div className="aau-body">
              <p className="aau-eyebrow mono">Paid feature</p>
              <h2 className="aau-title">Unlock the analyst chat</h2>
              <p className="aau-lead">Turn your audit into a conversation. Paid plan includes:</p>
              <ul className="aau-list">
                {features.map((f, i) => (
                  <li key={i}>
                    <svg className="aau-check" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 8l3.5 3.5L13 5" />
                    </svg>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="aau-actions">
                <a href="/pricing" className="aau-cta">Upgrade</a>
                <button className="aau-secondary" onClick={() => setOpen(false)}>Maybe later</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .aau-root {
          --bg: #0e0d0c;
          --panel: #1a1715;
          --line: #2a2522;
          --line-2: #3a322d;
          --ink: #efe7df;
          --ink-dim: #b8ada3;
          --ink-mute: #7a716a;
          --ink-faint: #4f4842;
          --accent: #ff6b35;
          --accent-soft: #ff8a5b;
          --accent-bg: rgba(255, 107, 53, 0.08);
          font-family: 'IBM Plex Sans', system-ui, sans-serif;
        }
        .aau-root[data-theme="light"] {
          --bg: #fafafa;
          --panel: #ffffff;
          --line: #e5e0db;
          --line-2: #cdc6bf;
          --ink: #1a1715;
          --ink-dim: #4a443e;
          --ink-mute: #7a716a;
          --ink-faint: #b4ada6;
          --accent: #d9531e;
          --accent-soft: #ef7044;
          --accent-bg: rgba(217, 83, 30, 0.08);
        }
        .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: 0.02em; }

        .aau-launcher {
          position: fixed; right: 28px; bottom: 28px; z-index: 50;
          height: 56px; padding: 0 18px 0 16px;
          background: var(--accent);
          color: #1a0c05;
          border: none;
          display: inline-flex; align-items: center; gap: 10px;
          font-family: 'IBM Plex Mono', monospace; font-size: 11px;
          letter-spacing: 0.14em; text-transform: uppercase;
          cursor: pointer;
          box-shadow: 0 12px 40px -12px rgba(255, 107, 53, 0.7), 0 0 0 1px rgba(255, 107, 53, 0.4);
          transition: transform 0.2s ease, box-shadow 0.2s;
        }
        .aau-launcher:hover {
          transform: translateY(-2px);
          box-shadow: 0 18px 50px -10px rgba(255, 107, 53, 0.85), 0 0 0 1px rgba(255, 107, 53, 0.5);
        }
        .aau-lglyph {
          width: 22px; height: 22px;
          display: inline-flex; align-items: center; justify-content: center;
          background: rgba(0, 0, 0, 0.18); border-radius: 50%;
        }
        .aau-tag {
          font-size: 9px; padding: 3px 6px;
          border: 1px solid rgba(0, 0, 0, 0.25);
          color: rgba(0, 0, 0, 0.65);
          background: rgba(255, 255, 255, 0.18);
          letter-spacing: 0.14em;
        }

        .aau-modal-root {
          position: fixed; inset: 0; z-index: 1000;
          display: flex; align-items: center; justify-content: center;
          padding: 24px;
        }
        .aau-backdrop {
          position: absolute; inset: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
        }
        .aau-modal {
          position: relative; z-index: 1;
          width: 100%; max-width: 380px;
          max-height: calc(100vh - 48px);
          overflow: auto;
          background: var(--panel);
          border: 1px solid var(--line-2);
          color: var(--ink);
          box-shadow: 0 30px 80px -20px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 107, 53, 0.18);
          font-family: 'IBM Plex Sans', sans-serif;
        }
        .aau-root[data-theme="light"] .aau-modal {
          box-shadow: 0 30px 80px -20px rgba(20, 18, 17, 0.18), 0 0 0 1px rgba(217, 83, 30, 0.18);
        }
        .aau-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 14px;
          border-bottom: 1px solid var(--line);
        }
        .aau-brand {
          display: flex; align-items: center; gap: 8px;
          font-family: 'IBM Plex Mono', monospace; font-size: 10px;
          color: var(--accent); letter-spacing: 0.14em; text-transform: uppercase;
        }
        .aau-glyph {
          width: 18px; height: 18px;
          display: inline-flex; align-items: center; justify-content: center;
          border: 1px solid var(--accent);
          color: var(--accent);
          font-family: 'Bebas Neue', 'Antonio', sans-serif; font-size: 11px;
        }
        .aau-close {
          width: 22px; height: 22px;
          background: transparent; border: 1px solid var(--line);
          color: var(--ink-mute); cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center;
        }
        .aau-close:hover { color: var(--ink); border-color: var(--line-2); }

        .aau-body { padding: 16px 16px 18px; }
        .aau-eyebrow {
          font-size: 9px; color: var(--accent);
          letter-spacing: 0.16em; text-transform: uppercase;
          margin: 0 0 4px;
        }
        .aau-title {
          margin: 0 0 6px;
          font-family: 'Bebas Neue', 'Antonio', sans-serif;
          font-size: 22px; line-height: 1.05; letter-spacing: 0.01em;
          color: var(--ink);
        }
        .aau-lead {
          margin: 0 0 12px;
          font-size: 12px; line-height: 1.45;
          color: var(--ink-dim);
        }
        .aau-list {
          list-style: none; padding: 0; margin: 0 0 16px;
          display: flex; flex-direction: column; gap: 4px;
        }
        .aau-list li {
          display: flex; gap: 8px; align-items: flex-start;
          font-size: 12px; line-height: 1.45;
          color: var(--ink-dim);
        }
        .aau-check {
          color: var(--accent);
          flex-shrink: 0;
          margin-top: 3px;
        }
        .aau-list li span { color: var(--ink); }
        .aau-actions {
          display: flex; gap: 8px; align-items: center;
        }
        .aau-cta {
          flex: 1;
          background: var(--accent); color: #1a0c05;
          padding: 9px 14px;
          font-family: 'IBM Plex Mono', monospace; font-size: 10px;
          letter-spacing: 0.16em; text-transform: uppercase;
          text-align: center;
          text-decoration: none;
          transition: background 0.15s;
        }
        .aau-cta:hover { background: var(--accent-soft); }
        .aau-secondary {
          background: transparent;
          border: 1px solid var(--line-2);
          color: var(--ink-mute);
          padding: 9px 14px;
          font-family: 'IBM Plex Mono', monospace; font-size: 10px;
          letter-spacing: 0.16em; text-transform: uppercase;
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s;
        }
        .aau-secondary:hover { color: var(--ink); border-color: var(--line); }

        @media (max-width: 720px) {
          .aau-launcher { right: 16px; bottom: 16px; }
          .aau-actions { flex-direction: column; align-items: stretch; }
        }
      `}</style>
    </div>
  )
}
