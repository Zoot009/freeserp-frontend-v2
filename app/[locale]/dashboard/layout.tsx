import type { Viewport } from "next"
import { Tutorial } from "@/components/tutorial"
import { DashboardShell } from "@/components/dashboard/shell"
import { QuotaUpsellModal } from "@/components/dashboard/quota-upsell-modal"
import { Toaster } from "@/components/ui/sonner"

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <DashboardShell>{children}</DashboardShell>
      <Tutorial />
      <QuotaUpsellModal />
      <Toaster richColors position="bottom-right" />
    </>
  )
}
