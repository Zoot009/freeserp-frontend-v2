"use client"

import { useEffect, useRef, useState, useCallback, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { AnimatedNoise } from "@/components/animated-noise"
import { ScrambleTextOnHover } from "@/components/scramble-text"
import { useAuth } from "@/lib/auth"
import gsap from "gsap"

const RESEND_COOLDOWN = 60

function ResetPasswordForm() {
  const { resetPassword, forgotPassword } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const [email, setEmail] = useState(searchParams.get("email") ?? "")
  const [digits, setDigits] = useState(["", "", "", "", "", ""])
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  const otp = digits.join("")

  useEffect(() => {
    if (!containerRef.current) return
    const ctx = gsap.context(() => {
      gsap.fromTo(containerRef.current, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" })
    })
    return () => ctx.revert()
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const handleDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1)
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    setError("")
    if (digit && index < 5) inputRefs.current[index + 1]?.focus()
  }

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
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
    inputRefs.current[Math.min(pasted.length, 5)]?.focus()
  }

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (otp.length < 6) { setError("Please enter all 6 digits of the reset code"); return }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return }
    setError("")
    setLoading(true)
    try {
      await resetPassword(email, otp, password)
      setSuccess(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Reset failed")
      setDigits(["", "", "", "", "", ""])
      inputRefs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }, [otp, password, email, resetPassword])

  const handleResend = async () => {
    if (cooldown > 0 || !email) return
    try {
      await forgotPassword(email)
      setCooldown(RESEND_COOLDOWN)
      setDigits(["", "", "", "", "", ""])
      setError("")
      inputRefs.current[0]?.focus()
    } catch {
      // forgotPassword always resolves — never leak if email exists
    }
  }

  if (success) {
    return (
      <div ref={containerRef} className="relative z-10 w-full max-w-md">
        <div className="mb-10">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">Done</span>
          <h1 className="mt-3 font-[var(--font-bebas)] text-6xl md:text-7xl tracking-tight leading-none">
            PASSWORD<br />UPDATED
          </h1>
          <p className="mt-4 font-mono text-xs text-muted-foreground leading-relaxed">
            Your password has been reset. You can now sign in with your new password.
          </p>
        </div>
        <div className="w-full h-px bg-border/40 mb-10" />
        <button
          onClick={() => router.push("/login")}
          className="w-full bg-accent text-accent-foreground px-6 py-3 font-mono text-xs uppercase tracking-widest hover:bg-accent/80 transition-all duration-200"
        >
          <ScrambleTextOnHover text="Sign In Now" as="span" duration={0.5} />
        </button>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative z-10 w-full max-w-md">
      <div className="mb-10">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">Password Reset</span>
        <h1 className="mt-3 font-[var(--font-bebas)] text-6xl md:text-7xl tracking-tight leading-none">
          SET NEW<br />PASSWORD
        </h1>
        <p className="mt-4 font-mono text-xs text-muted-foreground leading-relaxed">
          Enter the 6-digit code from your email and choose a new password.
        </p>
      </div>

      <div className="w-full h-px bg-border/40 mb-10" />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Email (editable in case pre-fill was wrong) */}
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

        {/* OTP boxes */}
        <div className="space-y-2">
          <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Reset Code
          </label>
          <div className="flex gap-2" onPaste={handlePaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleDigitKeyDown(i, e)}
                disabled={loading}
                className={`w-10 h-12 text-center bg-card border font-[var(--font-bebas)] text-2xl tracking-widest focus:outline-none transition-colors duration-200
                  ${error && !d ? "border-red-500/60" : d ? "border-accent" : "border-border/50"}
                  focus:border-accent`}
                aria-label={`Code digit ${i + 1}`}
              />
            ))}
            <button
              type="button"
              onClick={handleResend}
              disabled={cooldown > 0 || !email}
              className="ml-auto font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent disabled:text-muted-foreground/40 transition-colors duration-200 self-end pb-1"
            >
              {cooldown > 0 ? `${cooldown}s` : "Resend"}
            </button>
          </div>
        </div>

        {/* New password */}
        <div className="space-y-2">
          <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            New Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              required
              autoComplete="new-password"
              minLength={8}
              placeholder="Min. 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-card border border-border/50 px-4 py-3 pr-16 font-mono text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-accent transition-colors duration-200"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors duration-200"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="border border-red-500/30 bg-red-500/5 px-4 py-3">
            <p className="font-mono text-[11px] text-red-400">{error}</p>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-accent text-accent-foreground px-6 py-3 font-mono text-xs uppercase tracking-widest hover:bg-accent/80 disabled:opacity-40 transition-all duration-200"
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-full border border-accent-foreground/50 border-t-accent-foreground animate-spin" />
              Resetting...
            </span>
          ) : (
            <ScrambleTextOnHover text="Reset Password" as="span" duration={0.5} />
          )}
        </button>
      </form>

      <p className="mt-10 font-mono text-[11px] text-muted-foreground">
        Remember your password?{" "}
        <Link href="/login" className="text-foreground hover:text-accent transition-colors underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <main className="relative min-h-screen flex items-center justify-center px-6">
      <AnimatedNoise opacity={0.03} />
      <div className="grid-bg fixed inset-0 opacity-30" aria-hidden="true" />

      <div className="fixed top-6 left-6 z-50">
        <Link href="/" className="font-[var(--font-bebas)] text-2xl tracking-widest text-foreground hover:text-accent transition-colors duration-200">
          FREE SERP
        </Link>
      </div>
      <div className="fixed bottom-8 right-8">
        <div className="border border-border px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Reset Password
        </div>
      </div>

      <Suspense fallback={
        <div className="flex items-center justify-center">
          <div className="h-4 w-4 rounded-full border border-accent/50 border-t-accent animate-spin" />
        </div>
      }>
        <ResetPasswordForm />
      </Suspense>
    </main>
  )
}
