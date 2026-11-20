import type { ReactNode } from "react"
import { PaidToolGate } from "@/components/dashboard/paid-tool-gate"
import { DEMO_ID } from "@/lib/demo/shared"

// A paid tool (the free plan is the Google rank tracker only): free accounts see a sample, the live demo and an upgrade prompt instead (the API refuses them too).
export default function Layout({ children }: { children: ReactNode }) {
  return <PaidToolGate tool="aiPromptTracker" demoHref={`/dashboard/ai-prompt-tracker/${DEMO_ID}`}>{children}</PaidToolGate>
}
