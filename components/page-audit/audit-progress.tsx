"use client"

/**
 * The waiting screen for a running audit.
 *
 * Full-screen rather than a card in the page, because there is nothing useful
 * to do on the page while it runs — the form is disabled and the history below
 * is the thing being added to. A progress bar tucked between them competed with
 * content the reader can't act on.
 *
 * Two rules about the copy here. It describes what the user gets, never how the
 * work is done — machinery is our problem, and naming it invites the reader to
 * wonder why their page needs any. And it never quotes a check count: a number
 * sets an expectation that changes the moment a rule is added or retired.
 *
 * The rotating tips are the actual reason someone tolerates a minute of
 * waiting. Each is worth reading on its own, so the wait spends the reader's
 * attention rather than just consuming it.
 */

import { useEffect, useState } from "react"
import { Check, Loader2, Lightbulb, X } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Progress is published by the worker at fixed points (0 / 20 / 40 / 60 / 80),
 * so these thresholds mirror what it actually reports rather than inventing a
 * smoother-looking scale that would sit still while claiming to move.
 */
const STAGES = [
  { at: 0, single: "Fetching your page", site: "Finding your pages" },
  { at: 20, single: "Reading your content and structure", site: "Reading every page" },
  { at: 40, single: "Checking technical health", site: "Checking technical health" },
  { at: 60, single: "Measuring speed and accessibility", site: "Measuring speed and accessibility" },
  { at: 80, single: "Scoring and writing your report", site: "Scoring and writing your report" },
] as const

/**
 * Shown one at a time while the audit runs.
 *
 * Each is a standalone, actionable fact — not filler. Someone who reads three
 * of these has learned something even if their score comes back fine.
 */
const TIPS = [
  "Title tags of 50–60 characters usually display in full, instead of being cut off.",
  "Your meta description won't change your ranking — but it decides who clicks.",
  "Alt text serves people using screen readers first, and search engines second.",
  "One H1 per page. Both readers and search engines use it to know what the page is about.",
  "Pages that load in under 2.5 seconds keep far more visitors than pages that don't.",
  "Internal links pass authority around your site. Pages nothing links to receive none.",
  "Two pages with the same title tag end up competing with each other.",
  "A canonical tag settles which version of a page is the original.",
  "Structured data is what earns rich results — star ratings, prices, FAQs.",
  "A broken link costs you a visitor and wastes the crawl budget that found it.",
  "Headings should nest in order. Skipping from H2 to H4 breaks the outline.",
  "Images are usually the heaviest thing on a page, and usually the easiest to fix.",
] as const

const TIP_INTERVAL_MS = 5_000

export function AuditProgressOverlay({
  url,
  mode,
  progress,
  onHide,
}: {
  url: string
  mode: "single" | "site"
  progress: number
  onHide: () => void
}) {
  const [tip, setTip] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setTip((i) => (i + 1) % TIPS.length), TIP_INTERVAL_MS)
    return () => clearInterval(t)
  }, [])

  const pct = Math.min(100, Math.max(0, Math.round(progress)))
  // The stage in flight is the last one whose threshold has been passed.
  const current = STAGES.reduce((acc, s, i) => (pct >= s.at ? i : acc), 0)
  const key = mode === "site" ? "site" : "single"

  let host = url
  try {
    host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "")
  } catch {
    /* a URL the user is still typing — show it as given */
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/95 p-6 backdrop-blur-sm">
      {/* Keyframes travel with the component so it stays self-contained; the
          names are prefixed to avoid colliding with anything global. */}
      <style>{`
        @keyframes fsa-shimmer { 0% { transform: translateX(-100%) } 100% { transform: translateX(300%) } }
        @keyframes fsa-fade-up { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }
        .fsa-shimmer::after {
          content: ""; position: absolute; inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.45), transparent);
          animation: fsa-shimmer 1.8s ease-in-out infinite;
        }
        .fsa-fade { animation: fsa-fade-up .4s ease-out }
        @media (prefers-reduced-motion: reduce) {
          .fsa-shimmer::after, .fsa-fade { animation: none }
        }
      `}</style>

      {/* Leaving is allowed and non-destructive: the audit is a queued job on
          the server, so it finishes whether or not this screen is open. */}
      <button
        type="button"
        onClick={onHide}
        aria-label="Continue in the background"
        className="absolute right-5 top-5 flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" />
      </button>

      <div className="w-full max-w-md">
        <div className="text-center">
          <div className="relative mx-auto flex size-14 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-2xl bg-primary/15" />
            <span className="absolute inset-0 rounded-2xl border border-border/60 bg-muted/50" />
            <Loader2 className="relative size-6 animate-spin text-primary" />
          </div>
          <h2 className="mt-4 text-lg font-bold leading-tight">Auditing {host}</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            {mode === "site"
              ? "Going through your site page by page — technical health, content, speed, accessibility and security. This takes a few minutes."
              : "Going through your page — technical health, content, speed, accessibility and security. This usually takes under a minute."}
          </p>
        </div>

        <div className="mt-6">
          <div className="flex items-baseline justify-between">
            <span key={current} className="fsa-fade text-xs font-medium text-foreground">
              {STAGES[current]![key]}
            </span>
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">{pct}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="fsa-shimmer relative h-full overflow-hidden rounded-full bg-primary transition-[width] duration-700 ease-out"
              // Never zero-width: a bar with nothing in it reads as "not started",
              // and the first stage is already doing the slowest part of the work.
              style={{ width: `${Math.max(4, pct)}%` }}
            />
          </div>
        </div>

        <ol className="mt-6 space-y-2.5">
          {STAGES.map((s, i) => {
            const done = i < current
            const active = i === current
            return (
              <li
                key={s.at}
                className={cn(
                  "flex items-center gap-3 text-[13px] transition-colors",
                  done && "text-muted-foreground",
                  active && "font-medium text-foreground",
                  !done && !active && "text-muted-foreground/50",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                    done && "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                    active && "border-primary/30 bg-primary/10 text-primary",
                    !done && !active && "border-border/60",
                  )}
                >
                  {done ? (
                    <Check className="size-3" />
                  ) : active ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : null}
                </span>
                {s[key]}
              </li>
            )
          })}
        </ol>

        {/* Keyed on the index so React remounts it and the fade replays. */}
        <div
          key={tip}
          className="fsa-fade mt-7 flex items-start gap-3 rounded-xl border border-border/60 bg-muted/40 px-4 py-3.5"
          aria-live="polite"
        >
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              While you wait
            </p>
            <p className="mt-1 text-[13px] leading-relaxed">{TIPS[tip]}</p>
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground/70">
          You can close this — the audit keeps running and appears in your history when it&apos;s
          done.
        </p>
      </div>
    </div>
  )
}
