"use client"

import { useEffect, useState } from "react"
import { BadgeCheck, LoaderCircle, MessageCircleQuestion, Search, Shuffle } from "lucide-react"
import { api } from "@/lib/api"
import type { QuestionMix } from "@/lib/aeo"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const OPTIONS: { mix: QuestionMix; title: string; text: string; Icon: typeof Search; recommended?: true }[] = [
  {
    mix: "UNBRANDED",
    title: "Unbranded",
    text: "10 questions a new customer would ask, without your brand name. Shows whether AI engines find and recommend you.",
    Icon: Search,
    recommended: true,
  },
  {
    mix: "MIXED",
    title: "8 unbranded + 2 branded",
    text: "Mostly discovery questions, plus 2 that name your brand, to see what AI engines say about you as well.",
    Icon: Shuffle,
  },
  {
    mix: "BRANDED",
    title: "Branded",
    text: "10 questions that name your brand. Shows what AI engines say when people ask about you by name.",
    Icon: BadgeCheck,
  },
]
const LABEL: Record<QuestionMix, string> = { UNBRANDED: "unbranded", MIXED: "8 unbranded and 2 branded", BRANDED: "branded" }

const secondsLeft = (until: string) => Math.max(0, Math.ceil((Date.parse(until) - Date.now()) / 1000))

/**
 * The audit has reached the AI engines and waits for the user to pick how they're asked (aeo.run.ts, questionMix).
 * Pops up on its own; closed, it leaves a reminder in the page until the time runs out and the audit goes unbranded.
 */
export function QuestionChoice({ auditId, until }: { auditId: string; until: string }) {
  const [open, setOpen] = useState(true)
  const [left, setLeft] = useState(() => secondsLeft(until))
  const [chosen, setChosen] = useState<QuestionMix>()
  const [picking, setPicking] = useState<QuestionMix>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    const timer = setInterval(() => setLeft(secondsLeft(until)), 1000)
    return () => clearInterval(timer)
  }, [until])
  const pick = async (mix: QuestionMix) => {
    setPicking(mix)
    setError(undefined)
    try {
      await api.post(`/api/aeo-audit/${auditId}/question-mix`, { mix })
      setChosen(mix)
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't save your choice. Please try again.")
    } finally {
      setPicking(undefined)
    }
  }
  const countdown = left > 0 ? `No choice in ${left}s? It goes with unbranded.` : "Going with unbranded questions…"

  return (
    <>
      <div className="card tight flex flex-wrap items-center gap-x-3 gap-y-2" style={{ borderColor: "var(--brand)", background: "var(--brand-soft)", fontSize: 13 }} aria-live="polite">
        <MessageCircleQuestion className="size-4 shrink-0" style={{ color: "var(--brand)" }} aria-hidden />
        {chosen ? (
          <span>Got it: asking the AI engines {LABEL[chosen]} questions.</span>
        ) : (
          <>
            <span style={{ flex: 1, minWidth: 192 }}>
              The audit is waiting for you: how should it ask the AI engines? <span className="muted tnum">{countdown}</span>
            </span>
            <button type="button" className="btn primary sm" onClick={() => setOpen(true)}>
              Choose questions
            </button>
          </>
        )}
      </div>
      <Dialog open={open && !chosen} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[34rem]">
          <DialogHeader>
            <DialogTitle>How should we ask the AI engines?</DialogTitle>
            <DialogDescription>
              The audit is about to ask the AI engines you picked 10 questions about your kind of business, and check which sites their answers cite.
              Which questions?
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {OPTIONS.map(({ mix, title, text, Icon, recommended }) => (
              <button
                key={mix}
                type="button"
                disabled={!!picking}
                onClick={() => pick(mix)}
                className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary/60 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
              >
                {picking === mix ? (
                  <LoaderCircle className="mt-0.5 size-5 shrink-0 animate-spin text-primary" aria-hidden />
                ) : (
                  <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                )}
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {title}
                    {recommended && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-semibold text-primary">Recommended</span>}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{text}</span>
                </span>
              </button>
            ))}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter className="items-center sm:justify-between">
            <p className="text-xs text-muted-foreground tabular-nums">{countdown}</p>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Decide later
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
