"use client"

import { AnimatedNoise } from "@/components/animated-noise"
import { XCircle } from "lucide-react"

export default function BillingCancelPage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden flex items-center justify-center">
      <AnimatedNoise opacity={0.025} />
      <div className="grid-bg fixed inset-0 opacity-15 pointer-events-none" aria-hidden="true" />

      <div className="relative z-10 max-w-md mx-auto px-6 text-center">
        <XCircle className="mx-auto h-12 w-12 text-muted-foreground mb-6" />
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Payment</span>
        <h1 className="mt-2 font-[var(--font-bebas)] text-5xl tracking-tight">CHECKOUT CANCELED</h1>
        <p className="mt-4 font-mono text-sm text-muted-foreground">
          No charges were made. You can try again any time.
        </p>
        <div className="mt-8 flex gap-3 justify-center">
          <a
            href="/pricing"
            className="bg-accent text-accent-foreground px-6 py-3 font-mono text-xs uppercase tracking-widest hover:bg-accent/80 transition-colors"
          >
            Back to Pricing
          </a>
          <a
            href="/dashboard"
            className="border border-border/40 px-6 py-3 font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          >
            Dashboard
          </a>
        </div>
      </div>
    </main>
  )
}
