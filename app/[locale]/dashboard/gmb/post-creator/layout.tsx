import type { ReactNode } from "react"
import { PaidToolGate } from "@/components/dashboard/paid-tool-gate"

// A paid tool: free accounts see this page with a "paid tool" strip on top; the API refuses their runs.
export default function Layout({ children }: { children: ReactNode }) {
  return <PaidToolGate tool="gmbPostCreator">{children}</PaidToolGate>
}
