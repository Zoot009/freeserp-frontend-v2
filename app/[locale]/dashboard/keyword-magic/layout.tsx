import type { ReactNode } from "react"
import { PaidToolGate } from "@/components/dashboard/paid-tool-gate"
import { KEYWORD_MAGIC_DEMO_HREF } from "@/lib/demo/keyword-magic"

// A paid tool: free accounts see a sample, the live demo and an upgrade prompt instead (the API refuses them too).
export default function Layout({ children }: { children: ReactNode }) {
  return <PaidToolGate tool="keywordMagic" demoHref={KEYWORD_MAGIC_DEMO_HREF}>{children}</PaidToolGate>
}
