import { Quote } from "lucide-react"

/** The team's word in a client report: a quote, and an optional note under it. */
export function Pitch({ children, note }: { children?: React.ReactNode; note?: React.ReactNode }) {
  return (
    <figure className="relative rounded-[10px] border border-emerald-500/30 bg-emerald-500/[0.07] py-4 pl-14 pr-5 print:break-inside-avoid">
      <Quote className="absolute left-4 top-4 h-6 w-6 rotate-180 fill-emerald-500/20 text-emerald-600 dark:text-emerald-400" aria-hidden />
      {children && (
        <blockquote className="space-y-2 text-[14px] font-semibold leading-relaxed text-foreground [&_b]:font-bold [&_b]:text-emerald-700 dark:[&_b]:text-emerald-400 [&>p:first-child]:before:content-['“'] [&>p:last-child]:after:content-['”']">
          {children}
        </blockquote>
      )}
      {note && <div className={`space-y-2 text-[13px] leading-relaxed text-muted-foreground [&_b]:text-foreground ${children ? "mt-3 border-t border-emerald-500/20 pt-3" : ""}`}>{note}</div>}
    </figure>
  )
}
