import { Loader2 } from "lucide-react"
import { BUILDING, STATUS_TONE, type ChatbotStatus } from "@/lib/chatbot-builder"

/** A chatbot's status as a pill; spinning while it's being built. */
export function StatusBadge({ status, label }: { status: ChatbotStatus; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[status] ?? STATUS_TONE.new}`}>
      {BUILDING.includes(status) && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
      {label}
    </span>
  )
}
