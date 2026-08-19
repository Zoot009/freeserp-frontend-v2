"use client"

import { useTranslations } from "next-intl"

/**
 * Dashboard widget frame.
 *
 * Every card on the SEO Dashboard is a *widget*: it carries a stable id, a
 * header (pill or title + optional meta on the right) and an X that removes it
 * from the page. Removed widgets don't disappear for good — they collect in the
 * "Hidden Widgets" panel at the bottom, where one click puts them back. The
 * hidden set lives in localStorage so the layout a user builds survives a
 * reload.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { Info, LayoutGrid, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export type WidgetDef = { id: string; label: string }

const STORAGE_KEY = "fs_dash_hidden_widgets"

type WidgetCtx = {
  defs: WidgetDef[]
  hidden: string[]
  /** Hidden widgets still showing the "…is hidden now" notice in their slot. */
  noticed: string[]
  ready: boolean
  hide: (id: string) => void
  show: (id: string) => void
  showAll: () => void
  dismissNotice: (id: string) => void
}

const Ctx = createContext<WidgetCtx | null>(null)

export function WidgetProvider({ defs, children }: { defs: WidgetDef[]; children: React.ReactNode }) {
  const [hidden, setHidden] = useState<string[]>([])
  // Which hidden widgets are still explaining themselves. Deliberately NOT
  // persisted: the notice is the tail of an action you just took, so it belongs
  // to this session only — a reload should show the tidy layout you asked for.
  const [noticed, setNoticed] = useState<string[]>([])
  // Until localStorage has been read every widget renders, so the first paint is
  // the full dashboard rather than a flash of cards that then vanish.
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed: unknown = JSON.parse(raw)
        if (Array.isArray(parsed)) setHidden(parsed.filter((v): v is string => typeof v === "string"))
      }
    } catch {}
    setReady(true)
  }, [])

  const persist = useCallback((next: string[]) => {
    setHidden(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
  }, [])

  const value = useMemo<WidgetCtx>(() => ({
    defs,
    hidden,
    noticed,
    ready,
    // Hiding leaves the notice behind in the widget's own slot, so the layout
    // explains where the card went instead of silently collapsing.
    hide: (id) => {
      persist(hidden.includes(id) ? hidden : [...hidden, id])
      setNoticed((n) => (n.includes(id) ? n : [...n, id]))
    },
    // Undo and "add back" are the same operation — restoring also clears any
    // notice, so the slot goes straight back to the card.
    show: (id) => {
      persist(hidden.filter((h) => h !== id))
      setNoticed((n) => n.filter((x) => x !== id))
    },
    showAll: () => { persist([]); setNoticed([]) },
    dismissNotice: (id) => setNoticed((n) => n.filter((x) => x !== id)),
  }), [defs, hidden, noticed, ready, persist])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWidgets(): WidgetCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useWidgets must be used inside <WidgetProvider>")
  return ctx
}

/** True once the stored layout says this widget is hidden. */
export function useWidgetHidden(id: string): boolean {
  const { hidden, ready } = useWidgets()
  return ready && hidden.includes(id)
}

/**
 * What a widget leaves behind when you remove it: confirmation of what just
 * happened, where to find it again, and a one-click way out. Occupies the same
 * grid slot as the card did, so nothing reflows until the notice is dismissed.
 */
function HiddenNotice({ id, label, className }: { id: string; label: string; className?: string }) {
  const t = useTranslations("widgets")
  const { show, dismissNotice } = useWidgets()
  return (
    <section className={cn("flex min-w-0 flex-col items-center justify-center rounded-lg border bg-card px-5 py-10 text-center shadow-sm", className)}>
      <p className="max-w-xs text-[13px] leading-relaxed text-muted-foreground">
        {/* The widget's name is embedded in the sentence rather than prefixed to
            it: languages put the subject in different places, and a hardcoded
            "<name> widget is hidden" only reads correctly in English. */}
        {t.rich("hiddenNotice", {
          label,
          b: (chunks) => <span className="font-semibold text-foreground">{chunks}</span>,
        })}
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <Button size="sm" className="h-8 text-xs" onClick={() => show(id)}>{t("undo")}</Button>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => dismissNotice(id)}>{t("closeNotice")}</Button>
      </div>
    </section>
  )
}

// ── Header pieces ─────────────────────────────────────────────────────────────

const TONES = {
  brand: "bg-primary/10 text-primary",
  ai: "bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-400",
  neutral: "bg-muted text-muted-foreground",
} as const

export function WidgetPill({ tone = "brand", children }: { tone?: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", TONES[tone])}>{children}</span>
}

/** The little "i" that explains what a metric actually measures. */
export function InfoHint({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex shrink-0 text-muted-foreground/50 transition-colors hover:text-foreground">
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-60 text-xs">{children}</TooltipContent>
    </Tooltip>
  )
}

export type WidgetProps = {
  id: string
  /** Plain heading. Ignored when `pill` is given. */
  title?: string
  pill?: { label: string; tone?: keyof typeof TONES }
  hint?: React.ReactNode
  /** Sits immediately after the title, before the right-hand meta. For controls
   *  that change WHAT the card shows (a data-source switch, a segment picker) —
   *  they read as part of the heading rather than as trailing chrome. */
  actions?: React.ReactNode
  /** Right-hand side of the header: scope, date range, provider… */
  meta?: React.ReactNode
  /** Second header line (filters, sub-scope). */
  subheader?: React.ReactNode
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}

export function Widget({ id, title, pill, hint, actions, meta, subheader, className, bodyClassName, children }: WidgetProps) {
  const t = useTranslations("widgets")
  const { hide, noticed, defs } = useWidgets()
  const isHidden = useWidgetHidden(id)
  if (isHidden) {
    // Still explaining itself → keep the slot and show why. Notice dismissed →
    // the widget finally leaves the layout.
    if (!noticed.includes(id)) return null
    const label = defs.find((d) => d.id === id)?.label ?? pill?.label ?? title ?? t("fallbackLabel")
    // Same className, so the notice holds the widget's grid slot rather than
    // reflowing into column 1.
    return <HiddenNotice id={id} label={label} className={className} />
  }

  return (
    <section className={cn("flex min-w-0 flex-col rounded-lg border bg-card shadow-sm", className)}>
      {/* Header spacing follows the reference: a roomier px-4/py-3 band, the
          title at 15px semibold, and the meta line in 13px grey. */}
      <div className="border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {pill ? <WidgetPill tone={pill.tone}>{pill.label}</WidgetPill> : <h2 className="text-[15px] font-semibold leading-tight">{title}</h2>}
          {hint && <InfoHint>{hint}</InfoHint>}
          {actions && <div className="ml-1.5 flex items-center">{actions}</div>}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
            {meta}
            <button
              type="button"
              onClick={() => hide(id)}
              aria-label={`Hide ${pill?.label ?? title ?? "widget"}`}
              title={`Hide ${pill?.label ?? title ?? "widget"}`}
              /* Resting state matches the reference: a thin, light grey glyph
                 that stays out of the way. Removal is destructive though, so it
                 turns red on approach — the size-6 box is the hit area, not a
                 visible button. */
              className="ml-0.5 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/50 transition-colors duration-150 hover:bg-red-500/10 hover:text-red-600 active:bg-red-500/20 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-500 dark:hover:text-red-400"
            >
              <X className="size-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
        {subheader && <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">{subheader}</div>}
      </div>
      <div className={cn("min-w-0 flex-1 p-4", bodyClassName)}>{children}</div>
    </section>
  )
}

// ── The panel every hidden widget comes back from ────────────────────────────

export function HiddenWidgets() {
  const t = useTranslations("widgets")
  const { defs, hidden, ready, show, showAll } = useWidgets()
  const list = ready ? defs.filter((d) => hidden.includes(d.id)) : []

  return (
    <section className="rounded-lg border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b px-3.5 py-2.5">
        <h2 className="text-[15px] font-bold leading-tight">{t("hiddenTitle")}</h2>
        <InfoHint>{t("hiddenHint")}</InfoHint>
        {list.length > 0 && (
          <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={showAll}>{t("showAll")}</Button>
        )}
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-3.5 px-5 py-11">
          <div className="grid size-14 place-items-center rounded-full border-2 text-muted-foreground/50">
            <LayoutGrid className="size-6" />
          </div>
          <p className="max-w-56 text-center text-[13px] font-semibold leading-snug">{t("allShown")}</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 p-3.5">
          {list.map((d) => (
            <Button key={d.id} variant="outline" size="sm" className="h-8 gap-1.5 border-dashed text-xs" onClick={() => show(d.id)}>
              <Plus className="size-3.5" /> {d.label}
            </Button>
          ))}
        </div>
      )}
    </section>
  )
}
