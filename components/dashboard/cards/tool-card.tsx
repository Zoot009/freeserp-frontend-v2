"use client"

/**
 * A small "set this up" widget for one of the tools that isn't wired to the
 * project yet. Each one is its own widget, so a user who never wants the
 * Competitor Spy prompt can remove just that card.
 */

import { useTranslations } from "next-intl"
import { Check } from "lucide-react"
import { Link } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { Widget } from "@/components/dashboard/widget"

export type ToolCardProps = {
  id: string
  title: string
  description: string
  href: string
  cta?: string
  hint?: string
  /**
   * What the tool actually gives you, three or four words each.
   *
   * A sentence says what a tool is; these say what you get out of it, which is
   * the part someone deciding whether to click is actually weighing. They also
   * give the card the height it needs to hold its own beside a keyword table —
   * a two-line card in a column this wide sat in a pool of its own whitespace.
   */
  points?: string[]
  /** Shown instead of the CTA once the tool has data — e.g. "Site health 82". */
  status?: React.ReactNode
}

export function ToolCard({ id, title, description, href, cta, hint, points, status }: ToolCardProps) {
  const t = useTranslations("dashOverview.tools")
  // Default lives here rather than in the signature: a default parameter is
  // evaluated before the hook can run, so "Set up" would be English for all.
  const label = status ? t("open") : (cta ?? t("setUp"))
  return (
    // Type and padding a step down from a full widget's: these are prompts
    // sharing a row, not cards competing with the panels around them.
    <Widget
      id={id}
      title={title}
      hint={hint}
      // h-full so the card fills its (now equal-height) grid cell rather than
      // shrinking to its text.
      className="h-full [&>div:first-child]:px-3.5 [&>div:first-child]:py-2.5 [&_h2]:text-[13.5px]"
      bodyClassName="flex flex-1 flex-col gap-3 p-3.5 pt-3"
    >
      <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>

      {points && points.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-1.5 text-xs leading-snug text-muted-foreground">
              {/* mt-px, because a 12px tick centred on a 16px line sits high
                  enough against the cap height to read as floating. */}
              <Check className="mt-px size-3 shrink-0 text-primary" strokeWidth={3} />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex items-center gap-2">
        <Button asChild size="sm" className="h-7.5 px-3 text-xs"><Link href={href}>{label}</Link></Button>
        {status && <span className="truncate text-xs text-muted-foreground">{status}</span>}
      </div>
    </Widget>
  )
}
