import type { ReactNode } from "react"
import { PaidToolGate } from "@/components/dashboard/paid-tool-gate"
import { COMPETITOR_ANALYSIS_DEMO_HREF } from "@/lib/demo/competitor-analysis"

// A paid tool: free accounts see this page with a "paid tool" strip on top and the demo in its list; the API refuses their runs.
export default function Layout({ children }: { children: ReactNode }) {
  return <PaidToolGate tool="competitorAnalysis" demoHref={COMPETITOR_ANALYSIS_DEMO_HREF}>{children}</PaidToolGate>
}
