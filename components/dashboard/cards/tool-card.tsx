"use client"

/**
 * A small "set this up" widget for one of the tools that isn't wired to the
 * project yet. Each one is its own widget, so a user who never wants the
 * Competitor Spy prompt can remove just that card.
 */

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
  /** Shown instead of the CTA once the tool has data — e.g. "Site health 82". */
  status?: React.ReactNode
}

export function ToolCard({ id, title, description, href, cta = "Set up", hint, status }: ToolCardProps) {
  return (
    // Compact by design: four of these share the narrow right-hand column beside
    // Position Tracking, so the padding and type are a step down from a full
    // widget's.
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
      <div className="mt-auto flex items-center gap-2">
        <Button asChild size="sm" className="h-7.5 px-3 text-xs"><Link href={href}>{status ? "Open" : cta}</Link></Button>
        {status && <span className="truncate text-xs text-muted-foreground">{status}</span>}
      </div>
    </Widget>
  )
}
