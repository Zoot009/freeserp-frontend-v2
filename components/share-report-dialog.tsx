"use client"

import { useState } from "react"
import { Check, Link as LinkIcon, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import axios from "@/lib/axios"

interface Props {
  analysisId: string
  keyword: string
  isOpen: boolean
  onClose: () => void
}

export function ShareReportDialog({ analysisId, keyword, isOpen, onClose }: Props) {
  const [agencyName, setAgencyName] = useState("")
  const [step, setStep] = useState<'form' | 'success'>('form')
  const [shareUrl, setShareUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)

  const handleGenerate = async () => {
    if (!agencyName.trim()) {
      setError("Agency name is required")
      return
    }
    setLoading(true)
    setError("")
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const res = await axios.post(`${apiUrl}/api/competitor-analysis/${analysisId}/share`, { agencyName: agencyName.trim() }, {
        withCredentials: true,
      })
      const data = res.data
      if (res.status < 200 || res.status >= 300) throw new Error(data.error || 'Failed to generate link')
      setShareUrl(data.shareUrl)
      setStep('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate link')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback: select the input
    }
  }

  const handleClose = () => {
    setStep('form')
    setAgencyName("")
    setError("")
    setShareUrl("")
    setCopied(false)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose() }}>
      <DialogContent className="sm:max-w-md border border-border/60 bg-card">
        <DialogHeader>
          <DialogTitle className="font-[var(--font-bebas)] text-2xl tracking-tight">
            Share Report
          </DialogTitle>
          <p className="font-mono text-[11px] text-muted-foreground">
            {step === 'form'
              ? `Create a white-labeled shareable link for "${keyword}"`
              : 'Share this link — anyone with it can view the report'}
          </p>
        </DialogHeader>

        {step === 'form' && (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Agency Name
              </label>
              <Input
                value={agencyName}
                onChange={(e) => { setAgencyName(e.target.value); setError("") }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate() }}
                placeholder="e.g. Acme SEO Agency"
                className="font-mono text-sm border-border/60 focus:border-accent"
                autoFocus
              />
              {error && (
                <p className="font-mono text-[11px] text-red-400">{error}</p>
              )}
            </div>
            <p className="font-mono text-[10px] text-muted-foreground/70 leading-relaxed">
              Your agency name will appear in the report header. The link is permanent and can be shared without login.
            </p>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                onClick={handleClose}
                className="flex-1 font-mono text-[10px] uppercase tracking-widest border-border/40"
              >
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={loading || !agencyName.trim()}
                className="flex-1 font-mono text-[10px] uppercase tracking-widest"
              >
                {loading ? (
                  <><Loader2 className="h-3 w-3 mr-2 animate-spin" />Generating...</>
                ) : (
                  'Generate Link'
                )}
              </Button>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Share URL
              </label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={shareUrl}
                  className="font-mono text-xs border-border/60 text-foreground/80"
                  onFocus={(e) => e.target.select()}
                />
                <button
                  onClick={handleCopy}
                  className="flex items-center justify-center w-10 h-10 flex-shrink-0 border border-border/60 hover:border-accent hover:text-accent transition-colors"
                  aria-label="Copy link"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-accent" />
                  ) : (
                    <LinkIcon className="h-4 w-4" />
                  )}
                </button>
              </div>
              {copied && (
                <p className="font-mono text-[11px] text-accent">Link copied to clipboard</p>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => setStep('form')}
                className="flex-1 font-mono text-[10px] uppercase tracking-widest border-border/40"
              >
                Edit Agency Name
              </Button>
              <Button
                onClick={handleClose}
                className="flex-1 font-mono text-[10px] uppercase tracking-widest"
              >
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
