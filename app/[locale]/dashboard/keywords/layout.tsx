import type { ReactNode } from "react"
import { PaidToolGate } from "@/components/dashboard/paid-tool-gate"
import { KEYWORDS_DEMO_HREF } from "@/lib/demo/keywords"

// A paid tool: free accounts see a sample and an upgrade prompt instead (the API refuses them too).
export default function Layout({ children }: { children: ReactNode }) {
  return <PaidToolGate tool="keywords" demoHref={KEYWORDS_DEMO_HREF}>{children}</PaidToolGate>
}
