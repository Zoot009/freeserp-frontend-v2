"use client"

// Share a finished Google Maps audit by link. Anyone with the link reads the
// report at /share/maps-audit/<token> without an account; stopping sharing
// makes every link already sent stop working.
import { useState } from "react"
import { Check, Copy, Link2, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { api, ApiError } from "@/lib/api"

const shareUrl = (token: string) => `${window.location.origin}/share/maps-audit/${token}`

export function ShareAuditDialog({
  auditId,
  shareToken,
  open,
  onOpenChange,
  onChange,
}: {
  auditId: string
  shareToken: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The new token, or null once sharing stops. */
  onChange: (token: string | null) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError("")
    try {
      await fn()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
    } finally {
      setBusy(false)
    }
  }
  const create = () =>
    run(async () => {
      const { shareToken: token } = await api.post<{ shareToken: string }>(`/api/gbp-audit/${auditId}/share`, {})
      onChange(token)
    })
  const stop = () =>
    run(async () => {
      await api.delete(`/api/gbp-audit/${auditId}/share`)
      onChange(null)
    })
  const copy = async () => {
    if (!shareToken) return
    try {
      await navigator.clipboard.writeText(shareUrl(shareToken))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // The link is in the field, selectable by hand.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share this report</DialogTitle>
          <DialogDescription>
            Anyone with the link can view the full report without signing up. Your account and your other audits aren&apos;t shown.
          </DialogDescription>
        </DialogHeader>

        {shareToken ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input readOnly value={shareUrl(shareToken)} onFocus={(e) => e.currentTarget.select()} aria-label="Share link" />
              <Button type="button" onClick={copy} className="shrink-0 gap-1.5">
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <button type="button" onClick={stop} disabled={busy} className="text-[13px] font-medium text-red-600 hover:underline disabled:opacity-60 dark:text-red-400">
              {busy ? "Stopping…" : "Stop sharing"}
            </button>
            <p className="text-xs text-muted-foreground">Stopping makes this link, and any copies already sent, stop working.</p>
          </div>
        ) : (
          <Button type="button" onClick={create} disabled={busy} className="w-full gap-1.5">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
            {busy ? "Creating link…" : "Create share link"}
          </Button>
        )}

        {error && (
          <p role="alert" className="text-[13px] text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
