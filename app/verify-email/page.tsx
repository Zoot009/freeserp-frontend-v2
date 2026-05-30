"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AnimatedNoise } from "@/components/animated-noise"
import { ScrambleTextOnHover } from "@/components/scramble-text"
import { useAuth } from "@/lib/auth"
import gsap from "gsap"

const RESEND_COOLDOWN = 60

export default function VerifyEmailPage() {
  const { user, token, loading, verifyEmail, resendVerify } = useAuth()
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const [digits, setDigits] = useState(["", "", "", "", "", ""])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [cooldown, setCooldown] = useState(0)

  // Redirect if already verified or not logged in
  useEffect(() => {
    if (!loading && !user && !token) router.push("/login")
    if (!loading && user?.emailVerified) router.push("/dashboard")
  }, [user, token, loading, router])

  // Entrance animation
  useEffect(() => {
    if (!containerRef.current) return
    const ctx = gsap.context(() => {
      gsap.fromTo(containerRef.current, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" })
    })
    return () => ctx.revert()
  }, [])

  // Resend cooldown ticker
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const otp = digits.join("")

  const handleChange = (index: number, value: string) => {
    // Only accept single digit
    const digit = value.replace(/\D/g, "").slice(-1)
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    setError("")
    // Auto-advance
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
    if (!pasted) return
    const next = ["", "", "", "", "", ""]
    pasted.split("").forEach((d, i) => { next[i] = d })
    setDigits(next)
    setError("")
    // Focus the last filled box or the one after
    const focusIdx = Math.min(pasted.length, 5)
    inputRefs.current[focusIdx]?.focus()
  }

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (otp.length < 6) { setError("Please enter all 6 digits"); return }
    setSubmitting(true)
    setError("")
    try {
      await verifyEmail(otp)
      setSuccess("Email verified! Redirecting...")
      setTimeout(() => router.push("/dashboard"), 1200)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verification failed")
      // Clear digits on wrong OTP
      setDigits(["", "", "", "", "", ""])
      inputRefs.current[0]?.focus()
    } finally {
      setSubmitting(false)
    }
  }, [otp, verifyEmail, router])

  // Auto-submit when all 6 digits filled
  useEffect(() => {
    if (otp.length === 6 && !digits.includes("") && !submitting && !success) {
      handleSubmit()
    }
  }, [otp, digits, submitting, success, handleSubmit])

  const handleResend = async () => {
    if (cooldown > 0) return
    try {
      await resendVerify()
      setCooldown(RESEND_COOLDOWN)
      setError("")
      setDigits(["", "", "", "", "", ""])
      inputRefs.current[0]?.focus()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to resend code")
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="h-4 w-4 rounded-full border border-accent/50 border-t-accent animate-spin" />
      </main>
    )
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

      {/* Corner tag */}
      <div className="fixed bottom-8 right-8">
        <div className="border border-border px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Email Verification
        </div>
      </div>

      <div ref={containerRef} className="relative z-10 w-full max-w-md">
        {/* Header */}
        <div className="mb-10">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">Step 2 of 2</span>
          <h1 className="mt-3 font-[var(--font-bebas)] text-6xl md:text-7xl tracking-tight leading-none">
            CHECK YOUR<br />EMAIL
          </h1>
          <p className="mt-4 font-mono text-xs text-muted-foreground leading-relaxed">
            We sent a 6-digit code to{" "}
            <span className="text-foreground">{user?.email ?? "your email"}</span>.
            Enter it below to verify your account.
          </p>
        </div>

        <div className="w-full h-px bg-border/40 mb-10" />

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* OTP boxes */}
          <div className="flex gap-3 justify-between" onPaste={handlePaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                disabled={submitting || !!success}
                className={`w-12 h-14 text-center bg-card border font-[var(--font-bebas)] text-3xl tracking-widest focus:outline-none transition-colors duration-200
                  ${error ? "border-red-500/60" : d ? "border-accent" : "border-border/50"}
                  ${submitting || success ? "opacity-50" : ""}
                  focus:border-accent`}
                aria-label={`Digit ${i + 1}`}
              />
            ))}
          </div>

          {/* Error / success */}
          {error && (
            <div className="border border-red-500/30 bg-red-500/5 px-4 py-3">
              <p className="font-mono text-[11px] text-red-400">{error}</p>
            </div>
          )}
          {success && (
            <div className="border border-accent/30 bg-accent/5 px-4 py-3 flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent" />
              </svg>
              <p className="font-mono text-[11px] text-accent">{success}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || !!success || otp.length < 6}
            className="w-full bg-accent text-accent-foreground px-6 py-3 font-mono text-xs uppercase tracking-widest hover:bg-accent/80 disabled:opacity-40 transition-all duration-200"
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded-full border border-accent-foreground/50 border-t-accent-foreground animate-spin" />
                Verifying...
              </span>
            ) : (
              <ScrambleTextOnHover text="Verify Email" as="span" duration={0.5} />
            )}
          </button>
        </form>

        {/* Resend */}
        <div className="mt-8 flex items-center gap-3">
          <span className="font-mono text-[11px] text-muted-foreground">Didn&apos;t get a code?</span>
          <button
            onClick={handleResend}
            disabled={cooldown > 0}
            className="font-mono text-[11px] text-foreground hover:text-accent disabled:text-muted-foreground/50 transition-colors duration-200 underline underline-offset-4"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </button>
        </div>

        {/* Wrong account */}
        <p className="mt-4 font-mono text-[11px] text-muted-foreground">
          Wrong account?{" "}
          <Link href="/login" className="text-foreground hover:text-accent transition-colors underline underline-offset-4">
            Sign in with a different email
          </Link>
        </p>
      </div>
    </main>
  )
}
