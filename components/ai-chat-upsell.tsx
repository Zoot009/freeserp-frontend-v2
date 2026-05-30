"use client"

import { useEffect, useState } from "react"

/**
 * Free-tier launcher for the AI chat. Sits in the bottom-right corner of the
 * comparison results page where the paid `AiChatPanel` would. Clicking it
 * opens a small upgrade dialog rather than starting a chat session.
 *
 * Styling uses the dashboard tokens (--brand, --bg-elev, --text, --border,
 * --r-lg, --shadow-lg, …) defined in app/dashboard.css under `.fs-app`,
 * so it matches the rest of the SaaS dashboard chrome.
 */
export function AskAnalystUpsell() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  // Lock <body> scroll while the modal is open. Without this the page
  // underneath scrolls when the user scrolls inside the modal.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
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
    <div className="aau-root">
      <button
        type="button"
        className="aau-launcher"
        onClick={() => setOpen(true)}
        aria-label="Ask the analyst (Upgrade required)"
      >
        <span className="aau-lglyph" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </span>
        <span className="aau-llabel">Ask the analyst</span>
        <span className="aau-tag">PRO</span>
      </button>

      {open && (
        <div className="aau-modal-root" role="dialog" aria-label="Audit Co-Pilot upgrade">
          <div className="aau-backdrop" onClick={() => setOpen(false)} />
          <div className="aau-modal">
            <header className="aau-head">
              <div className="aau-brand">
                <span className="aau-glyph" aria-hidden>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5" />
                    <path d="M2 12l10 5 10-5" />
                  </svg>
                </span>
                <span>Audit Co-Pilot</span>
              </div>
              <button className="aau-close" onClick={() => setOpen(false)} aria-label="Close">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </header>
            <div className="aau-body">
              <p className="aau-eyebrow">Paid feature</p>
              <h2 className="aau-title">Unlock the analyst chat</h2>
              <p className="aau-lead">Turn your audit into a conversation. The paid plan includes:</p>
              <ul className="aau-list">
                {features.map((f, i) => (
                  <li key={i}>
                    <svg className="aau-check" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
        /* All colors / radii / shadows fall through to the dashboard tokens
           defined in app/dashboard.css under .fs-app. We avoid hard-coding
           palettes so the component tracks any future theme changes. */
        .aau-root {
          font-family: var(--font-sans), 'Geist', 'Inter', system-ui, sans-serif;
        }

        /* ── Floating launcher ────────────────────────────────────── */
        .aau-launcher {
          position: fixed;
          right: 24px;
          bottom: 24px;
          z-index: 50;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 0 14px 0 12px;
          height: 44px;
          background: var(--brand);
          color: #ffffff;
          border: 1px solid var(--brand);
          border-radius: var(--r-md);
          font-size: 13.5px;
          font-weight: 500;
          letter-spacing: -0.005em;
          cursor: pointer;
          box-shadow: var(--shadow-md);
          transition: background 0.15s ease, transform 0.12s ease, box-shadow 0.15s ease;
        }
        .aau-launcher:hover {
          background: var(--brand-deep);
          border-color: var(--brand-deep);
          transform: translateY(-1px);
          box-shadow: var(--shadow-lg);
        }
        .aau-lglyph {
          width: 24px; height: 24px;
          display: inline-flex; align-items: center; justify-content: center;
          background: rgba(255, 255, 255, 0.16);
          border-radius: var(--r-sm);
          flex-shrink: 0;
        }
        .aau-llabel { line-height: 1; }
        .aau-tag {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.05em;
          padding: 3px 6px;
          background: rgba(255, 255, 255, 0.16);
          color: rgba(255, 255, 255, 0.9);
          border-radius: 999px;
        }

        /* ── Modal scaffolding ────────────────────────────────────── */
        .aau-modal-root {
          position: fixed; inset: 0;
          z-index: 1000;
          display: flex; align-items: center; justify-content: center;
          padding: 24px;
        }
        .aau-backdrop {
          position: absolute; inset: 0;
          background: rgba(11, 13, 18, 0.5);
          backdrop-filter: blur(2px);
        }
        .aau-modal {
          position: relative; z-index: 1;
          width: 100%; max-width: 460px;
          max-height: calc(100vh - 48px);
          overflow: auto;
          background: var(--bg-elev);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: var(--r-lg);
          box-shadow: var(--shadow-lg);
        }

        /* ── Modal head ───────────────────────────────────────────── */
        .aau-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 18px;
          border-bottom: 1px solid var(--border);
        }
        .aau-brand {
          display: inline-flex; align-items: center; gap: 8px;
          font-size: 12px;
          font-weight: 600;
          color: var(--text);
          letter-spacing: -0.005em;
        }
        .aau-glyph {
          width: 24px; height: 24px;
          display: inline-flex; align-items: center; justify-content: center;
          background: var(--brand-soft);
          color: var(--brand);
          border-radius: var(--r-sm);
        }
        .aau-close {
          width: 28px; height: 28px;
          display: inline-flex; align-items: center; justify-content: center;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: var(--r-sm);
          color: var(--text-mute);
          cursor: pointer;
          transition: color 0.15s, background 0.15s, border-color 0.15s;
        }
        .aau-close:hover {
          color: var(--text);
          background: var(--bg-inset);
          border-color: var(--border-strong);
        }

        /* ── Modal body ───────────────────────────────────────────── */
        .aau-body { padding: 18px 18px 20px; }
        .aau-eyebrow {
          margin: 0 0 6px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--brand);
        }
        .aau-title {
          margin: 0 0 6px;
          font-size: 20px;
          font-weight: 600;
          line-height: 1.25;
          letter-spacing: -0.02em;
          color: var(--text);
        }
        .aau-lead {
          margin: 0 0 14px;
          font-size: 13.5px;
          line-height: 1.45;
          color: var(--text-soft);
        }
        .aau-list {
          list-style: none;
          padding: 0;
          margin: 0 0 18px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .aau-list li {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          font-size: 13px;
          line-height: 1.45;
          color: var(--text);
        }
        .aau-check {
          flex-shrink: 0;
          margin-top: 4px;
          color: var(--brand);
        }

        /* ── Actions ─────────────────────────────────────────────── */
        .aau-actions {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .aau-cta {
          flex: 1;
          display: inline-flex; align-items: center; justify-content: center;
          padding: 9px 14px;
          background: var(--brand);
          color: #ffffff;
          border: 1px solid var(--brand);
          border-radius: var(--r-sm);
          font-size: 13px;
          font-weight: 500;
          letter-spacing: -0.005em;
          text-decoration: none;
          transition: background 0.15s, border-color 0.15s;
        }
        .aau-cta:hover {
          background: var(--brand-deep);
          border-color: var(--brand-deep);
        }
        .aau-secondary {
          display: inline-flex; align-items: center; justify-content: center;
          padding: 9px 14px;
          background: var(--bg);
          color: var(--text-soft);
          border: 1px solid var(--border);
          border-radius: var(--r-sm);
          font-size: 13px;
          font-weight: 500;
          letter-spacing: -0.005em;
          cursor: pointer;
          transition: color 0.15s, background 0.15s, border-color 0.15s;
        }
        .aau-secondary:hover {
          color: var(--text);
          background: var(--bg-inset);
        }

        /* ── Responsive ──────────────────────────────────────────── */
        @media (max-width: 720px) {
          .aau-launcher { right: 16px; bottom: 16px; }
          .aau-llabel { display: none; }
          .aau-actions { flex-direction: column; align-items: stretch; }
        }
      `}</style>
    </div>
  )
}
