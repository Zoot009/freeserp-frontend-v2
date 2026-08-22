"use client"

/**
 * What a dashboard page shows when it throws.
 *
 * Without this file Next.js renders its own screen — "This page couldn't load",
 * a Reload button, and nothing else. That is the same screen for a missing
 * translation key, an expired session, a bad API response and a genuine bug, so
 * the one question worth answering (which of those happened) has no answer. It
 * cost a real support round-trip: every tool appeared broken, and neither the
 * user nor the logs could say why, because the error never left the browser.
 *
 * So: say what broke, keep the person moving, and give them something to quote.
 * The digest is Next's own id for the error and is what makes a screenshot
 * actionable — it ties this render to the stack trace on the server.
 */

import { useEffect } from "react"
import { AlertTriangle, RotateCw, ArrowLeft } from "lucide-react"
import { Link } from "@/i18n/navigation"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Also to the browser console, so a screenshot of devtools carries the
    // stack rather than only the message.
    console.error("[dashboard] render error:", error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <AlertTriangle className="size-8 text-amber-500" />
      <div>
        <h1 className="text-[20px] font-bold tracking-[-0.02em]">Something broke on this page</h1>
        <p className="mt-1.5 max-w-md text-[13px] text-muted-foreground">
          The rest of the dashboard still works — use the menu to carry on, or try this page again.
        </p>
      </div>

      {/* The actual message. Hidden behind a summary because it is for
          reporting, not for reading, but one click away rather than lost. */}
      <details className="mt-1 max-w-xl text-left">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
          Show error details
        </summary>
        <pre className="mt-2 max-h-48 overflow-auto rounded-lg border bg-muted/50 p-3 text-[11px] leading-relaxed">
          {error.message || "Unknown error"}
          {error.digest ? `\n\ndigest: ${error.digest}` : ""}
        </pre>
      </details>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-4 text-[13px] font-semibold text-white hover:brightness-110"
        >
          <RotateCw className="size-3.5" /> Try again
        </button>
        <Link
          href="/dashboard"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-4 text-[13px] font-semibold hover:bg-muted"
        >
          <ArrowLeft className="size-3.5" /> Back to dashboard
        </Link>
      </div>
    </div>
  )
}
