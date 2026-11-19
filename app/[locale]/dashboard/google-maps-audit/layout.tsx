import type { ReactNode } from "react"
import { PaidToolGate } from "@/components/dashboard/paid-tool-gate"
import { MAPS_AUDIT_DEMO_HREF } from "@/lib/demo/maps-audit"

// A paid tool: free accounts see a sample, the live demo and an upgrade prompt instead (the API refuses them too).
export default function Layout({ children }: { children: ReactNode }) {
  return <PaidToolGate tool="mapsAudit" demoHref={MAPS_AUDIT_DEMO_HREF}>{children}</PaidToolGate>
}
