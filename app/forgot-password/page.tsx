"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AnimatedNoise } from "@/components/animated-noise"
import { ScrambleTextOnHover } from "@/components/scramble-text"
import { useAuth } from "@/lib/auth"
import gsap from "gsap"

export default function ForgotPasswordPage() {
  const { forgotPassword } = useAuth()
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!containerRef.current) return
    const ctx = gsap.context(() => {
      gsap.fromTo(containerRef.current, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" })
    })
    return () => ctx.revert()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      await forgotPassword(email)
      setSent(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="relative min-h-screen flex items-center justify-center px-6">
      <AnimatedNoise opacity={0.03} />
      <div className="grid-bg fixed inset-0 opacity-30" aria-hidden="true" />

      {/* Wordmark */}
      <div className="fixed top-6 left-6 z-50">
        <Link href="/" className="font-[var(--font-bebas)] text-2xl tracking-widest text-foreground hover:text-accent transition-colors duration-200">
          FREE SERP
        </Link>
      </div>

      <div className="fixed bottom-8 right-8">
        <div className="border border-border px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Password Recovery
        </div>
      </div>

      <div ref={containerRef} className="relative z-10 w-full max-w-md">
        <div className="mb-10">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">Account Recovery</span>
          <h1 className="mt-3 font-[var(--font-bebas)] text-6xl md:text-7xl tracking-tight leading-none">
            FORGOT<br />PASSWORD?
          </h1>
          <p className="mt-4 font-mono text-xs text-muted-foreground leading-relaxed">
            Enter your email and we&apos;ll send a 6-digit reset code. It expires in 15 minutes.
          </p>
        </div>

        <div className="w-full h-px bg-border/40 mb-10" />

        {sent ? (
          /* Success state */
          <div className="space-y-6">
            <div className="border border-accent/30 bg-accent/5 px-6 py-5">
              <div className="flex items-start gap-3">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="mt-0.5 shrink-0">
                  <path d="M2 7L5.5 10.5L12 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent" />
                </svg>
                <div>
                  <p className="font-mono text-xs text-foreground leading-relaxed">
                    If <span className="text-accent">{email}</span> is registered, a reset code is on its way.
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground mt-2 leading-relaxed">
                    Check your inbox (and spam folder). The code expires in 15 minutes.
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={() => router.push(`/reset-password?email=${encodeURIComponent(email)}`)}
              className="w-full bg-accent text-accent-foreground px-6 py-3 font-mono text-xs uppercase tracking-widest hover:bg-accent/80 transition-all duration-200"
            >
              <ScrambleTextOnHover text="Enter Reset Code" as="span" duration={0.5} />
            </button>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Email Address
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-card border border-border/50 px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-accent transition-colors duration-200"
              />
            </div>

            {error && (
              <div className="border border-red-500/30 bg-red-500/5 px-4 py-3">
                <p className="font-mono text-[11px] text-red-400">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-accent-foreground px-6 py-3 font-mono text-xs uppercase tracking-widest hover:bg-accent/80 disabled:opacity-40 transition-all duration-200"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full border border-accent-foreground/50 border-t-accent-foreground animate-spin" />
                  Sending...
                </span>
              ) : (
                <ScrambleTextOnHover text="Send Reset Code" as="span" duration={0.5} />
              )}
            </button>
          </form>
        )}

        <p className="mt-10 font-mono text-[11px] text-muted-foreground">
          Remember your password?{" "}
          <Link href="/login" className="text-foreground hover:text-accent transition-colors underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  )
}
