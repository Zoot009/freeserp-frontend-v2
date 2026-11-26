import type { ReactNode } from "react"
import { PaidToolGate } from "@/components/dashboard/paid-tool-gate"
import { AEO_AUDIT_DEMO_HREF } from "@/lib/demo/aeo-audit"

// A paid tool: free accounts see this page with a "paid tool" strip on top and the demo in its list; the API refuses their runs.
export default function Layout({ children }: { children: ReactNode }) {
  return <PaidToolGate tool="aeoAudit" demoHref={AEO_AUDIT_DEMO_HREF}>{children}</PaidToolGate>
}
