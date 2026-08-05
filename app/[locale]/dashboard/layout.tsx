import type { Viewport } from "next"
import { DashboardShell } from "@/components/dashboard/shell"
import { Toaster } from "@/components/ui/sonner"

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
}

// Blank-slate dashboard layout: just the auth guard (DashboardShell) + a toast
// host. The old Tutorial coach-marks and QuotaUpsellModal have been removed with
// the rest of the chrome — re-add per-feature when the new UI is rebuilt.
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <DashboardShell>{children}</DashboardShell>
      <Toaster richColors position="bottom-right" />
    </>
  )
}
