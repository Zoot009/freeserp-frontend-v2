import type { ReactNode } from "react"
import { PaidToolGate } from "@/components/dashboard/paid-tool-gate"
import { DEMO_ID } from "@/lib/demo/shared"

// A paid tool: free accounts see this page with a "paid tool" strip on top and the demo in its list; the API refuses their runs.
export default function Layout({ children }: { children: ReactNode }) {
  return <PaidToolGate tool="mapsTracker" demoHref={`/dashboard/google-maps-tracker/${DEMO_ID}`}>{children}</PaidToolGate>
}
