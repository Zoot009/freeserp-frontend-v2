"use client"

/**
 * The waiting screen for a running audit.
 *
 * Full-screen rather than a card in the page, because there is nothing useful
 * to do on the page while it runs — the form is disabled and the history below
 * is the thing being added to. A progress bar tucked between them competed with
 * content the reader can't act on.
 *
 * The stages are the honest reason it takes a minute: a real browser is
 * loading the site. Naming each one turns dead waiting into something legible,
 * and makes a slow site look slow rather than broken.
 */

import { Check, Loader2, X } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Progress is reported by the worker at fixed points (0 / 20 / 40 / 60 / 80 /
 * 100), so these thresholds mirror what it actually publishes rather than
 * inventing a smoother-looking scale.
 */
const STAGES = [
  { at: 0, single: "Loading the page in a real browser", site: "Starting the crawler" },
  { at: 20, single: "Reading the HTML, links and images", site: "Crawling pages and following links" },
  { at: 40, single: "Running 63 SEO checks", site: "Running 63 SEO checks on every page" },
  { at: 60, single: "Scoring and grading", site: "Scoring and grading the site" },
  { at: 80, single: "Building your report", site: "Building your report" },
] as const

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
  const pct = Math.min(100, Math.max(0, Math.round(progress)))
  // The stage in flight is the last one whose threshold has been passed.
  const current = STAGES.reduce((acc, s, i) => (pct >= s.at ? i : acc), 0)

  let host = url
  try {
    host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "")
  } catch {
    /* a URL the user is still typing — show it as given */
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/95 p-6 backdrop-blur-sm">
      {/* Leaving is allowed and non-destructive: the audit is a queued job on
          the server, so it finishes whether or not this screen is open. */}
      <button
        type="button"
        onClick={onHide}
        aria-label="Continue in the background"
        className="absolute right-5 top-5 flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="size-4.5" />
      </button>

      <div className="w-full max-w-md">
        <div className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-border/60 bg-muted/50">
            <Loader2 className="size-5 animate-spin text-primary" />
          </div>
          <h2 className="mt-4 text-lg font-bold leading-tight">Auditing {host}</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            {mode === "site"
              ? "Crawling your site in a real browser and scoring every page. This takes a few minutes."
              : "Loading your page in a real browser and running every check. This usually takes under a minute."}
          </p>
        </div>

        <div className="mt-6">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {STAGES[current]![mode === "site" ? "site" : "single"]}
            </span>
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">{pct}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
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
                    "flex size-5 shrink-0 items-center justify-center rounded-full border",
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
                {s[mode === "site" ? "site" : "single"]}
              </li>
            )
          })}
        </ol>

        <p className="mt-6 text-center text-xs text-muted-foreground/70">
          You can close this — the audit keeps running and appears in your history when it&apos;s done.
        </p>
      </div>
    </div>
  )
}
