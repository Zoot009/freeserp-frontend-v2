import type { ReactNode } from "react"
import { PaidToolGate } from "@/components/dashboard/paid-tool-gate"

// A paid tool (the free plan is the Google rank tracker only): free accounts see an upgrade prompt instead (the API refuses them too).
export default function Layout({ children }: { children: ReactNode }) {
  return <PaidToolGate tool="searchConsole">{children}</PaidToolGate>
}
