import type { Viewport } from "next"
import { Tutorial } from "@/components/tutorial"
import { DashboardShell } from "@/components/dashboard/shell"
import { QuotaUpsellModal } from "@/components/dashboard/quota-upsell-modal"
import { ChecksBackModal } from "@/components/dashboard/checks-back-modal"
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
      {/* In the LAYOUT, not on the rank tracker: the reset is about the account,
          and somebody reading the Overview can act on it just as well. */}
      <ChecksBackModal />
      <Toaster richColors position="bottom-right" />
    </>
  )
}
