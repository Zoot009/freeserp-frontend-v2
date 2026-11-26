import type { ReactNode } from "react"
import { PaidToolGate } from "@/components/dashboard/paid-tool-gate"
import { ADS_ANALYSIS_DEMO_HREF } from "@/lib/demo/ads-analysis"

// A paid tool: free accounts see this page with a "paid tool" strip on top and the demo in its list; the API refuses their runs.
export default function Layout({ children }: { children: ReactNode }) {
  return <PaidToolGate tool="adsAnalysis" demoHref={ADS_ANALYSIS_DEMO_HREF}>{children}</PaidToolGate>
}
