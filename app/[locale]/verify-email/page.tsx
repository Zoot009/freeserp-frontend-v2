"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Link, useRouter } from "@/i18n/navigation"
import Image from "next/image"
import { LanguageSwitcher } from "@/components/language-switcher"
import { useAuth } from "@/lib/auth"
import gsap from "gsap"

const RESEND_COOLDOWN = 60

export default function VerifyEmailPage() {
  const t = useTranslations("verifyEmail")
  const { user, token, loading, verifyEmail, resendVerify, logout } = useAuth()
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const asideRef = useRef<HTMLElement>(null)
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

  // Entrance animation — mirrors the login page
  useEffect(() => {
    if (!containerRef.current || !formRef.current) return
    const ctx = gsap.context(() => {
      gsap.fromTo(
        containerRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" },
      )
      const fields = formRef.current?.querySelectorAll(".field-row")
      if (fields) {
        gsap.fromTo(
          fields,
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: 0.4, stagger: 0.06, ease: "power3.out", delay: 0.2 },
        )
      }
      if (asideRef.current) {
        gsap.fromTo(
          asideRef.current.querySelector(".aside-headline"),
          { opacity: 0, y: 24 },
          { opacity: 1, y: 0, duration: 0.8, ease: "power3.out", delay: 0.1 },
        )
        gsap.fromTo(
          asideRef.current.querySelector(".aside-subtitle"),
          { opacity: 0, y: 16 },
          { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", delay: 0.3 },
        )
        const items = asideRef.current.querySelectorAll(".aside-item")
        if (items.length) {
          gsap.fromTo(
            items,
            { opacity: 0, x: -16 },
            { opacity: 1, x: 0, duration: 0.5, stagger: 0.08, ease: "power3.out", delay: 0.45 },
          )
        }
        const stats = asideRef.current.querySelectorAll(".aside-stat")
        if (stats.length) {
          gsap.fromTo(
            stats,
            { opacity: 0, y: 12 },
            { opacity: 1, y: 0, duration: 0.5, stagger: 0.1, ease: "power3.out", delay: 0.8 },
          )
        }
      }
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
    if (otp.length < 6) { setError(t("errorAllDigits")); return }
    setSubmitting(true)
    setError("")
    try {
      await verifyEmail(otp)
      setSuccess(t("successVerified"))
      setTimeout(() => router.push("/dashboard"), 1200)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("errorVerifyFailed"))
      // Clear digits on wrong OTP
      setDigits(["", "", "", "", "", ""])
      inputRefs.current[0]?.focus()
    } finally {
      setSubmitting(false)
    }
  }, [otp, verifyEmail, router, t])

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
      setError(err instanceof Error ? err.message : t("errorResendFailed"))
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center">
        <div className="h-5 w-5 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white text-slate-900 grid lg:grid-cols-2">
      {/* Left — Verify form */}
      <section className="relative flex flex-col px-6 sm:px-10 lg:px-16 py-8" id="main-content">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl shadow-sm transition-transform group-hover:scale-105">
              <Image src="/logo.png" alt="FreeSERP Logo" width={32} height={32} />
            </span>
            <span className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
              FreeSERP
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <LanguageSwitcher className="text-slate-600" />
            <p className="text-sm text-slate-500">
              {t("wrongAccount")}{" "}
              {/* Must end the current unverified session first, or the login page
                  bounces straight back here (user is still authenticated). */}
              <button
                type="button"
                onClick={() => { logout(); router.push("/login") }}
                className="text-blue-600 font-medium hover:text-blue-700"
              >
                {t("switch")}
              </button>
            </p>
          </div>
        </div>

        {/* Form area */}
        <div ref={containerRef} className="flex-1 flex items-center justify-center mt-10 lg:mt-0">
          <div className="w-full max-w-md">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 uppercase tracking-wider">
              <span className="text-blue-500">★</span> {t("badge")}
            </span>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900">
              {t("title")}
            </h1>
            <p className="mt-2 text-slate-500">
              {t.rich("subtitle", {
                email: user?.email ?? t("emailFallback"),
                em: (chunks) => <span className="font-medium text-slate-900">{chunks}</span>,
              })}
            </p>

            <form ref={formRef} onSubmit={handleSubmit} className="mt-8 space-y-5">
              {/* OTP boxes */}
              <div className="field-row space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {t("verificationCode")}
                </label>
                <div className="flex gap-2 sm:gap-3" onPaste={handlePaste}>
                  {digits.map((d, i) => (
                    <input
                      key={i}
                      ref={(el) => { inputRefs.current[i] = el }}
                      type="text"
                      inputMode="numeric"
                      autoComplete={i === 0 ? "one-time-code" : "off"}
                      maxLength={1}
                      value={d}
                      onChange={(e) => handleChange(i, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(i, e)}
                      disabled={submitting || !!success}
                      className={`h-14 w-full rounded-2xl border bg-white text-center text-2xl font-bold text-slate-900 focus:outline-none focus:ring-4 transition-all duration-200
                        ${error
                          ? "border-red-300 focus:border-red-500 focus:ring-red-100"
                          : d
                            ? "border-blue-500 ring-2 ring-blue-100"
                            : "border-slate-200 focus:border-blue-500 focus:ring-blue-100"}
                        ${submitting || success ? "opacity-60" : ""}`}
                      aria-label={t("digitAria", { n: i + 1 })}
                    />
                  ))}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="field-row rounded-2xl border border-red-200 bg-red-50 px-4 py-3 animate-in fade-in slide-in-from-top-2">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Success */}
              {success && (
                <div className="field-row flex items-center gap-2 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 animate-in fade-in slide-in-from-top-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <p className="text-sm text-green-700">{success}</p>
                </div>
              )}

              {/* Submit */}
              <div className="field-row pt-1">
                <button
                  type="submit"
                  disabled={submitting || !!success || otp.length < 6}
                  className="w-full rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-blue-600/20 hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/30 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-md transition-all duration-200"
                >
                  {submitting ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                      {t("verifying")}
                    </span>
                  ) : (
                    t("verifyEmail")
                  )}
                </button>
              </div>

              {/* Resend */}
              <p className="field-row text-sm text-slate-500">
                {t("didntGetCode")}{" "}
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={cooldown > 0}
                  className="font-medium text-blue-600 hover:text-blue-700 disabled:text-slate-400"
                >
                  {cooldown > 0 ? t("resendIn", { seconds: cooldown }) : t("resendCode")}
                </button>
              </p>
            </form>
          </div>
        </div>
      </section>

      {/* Right — Marketing panel */}
      <aside ref={asideRef} className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-linear-to-br from-blue-600 via-blue-600 to-blue-700 text-white px-12 py-12 rounded-l-[2.5rem]">
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-20"
          aria-hidden="true"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.15) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        {/* Drifting glow */}
        <div className="auth-blob absolute -top-32 -right-32 h-96 w-96 rounded-full bg-blue-400 blur-3xl" aria-hidden="true" />
        <div className="auth-blob-alt absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-blue-800 blur-3xl" aria-hidden="true" />

        <div className="relative z-10">
          <h2 className="aside-headline text-4xl xl:text-5xl font-bold leading-tight tracking-tight">
            {t.rich("asideHeadline", { br: () => <br /> })}
          </h2>
          <p className="aside-subtitle mt-4 text-blue-100 max-w-md">
            {t("asideSubtitle")}
          </p>
        </div>

        <div className="relative z-10 space-y-8">
          <ul className="space-y-3">
            {[
              t("feature1"),
              t("feature2"),
              t("feature3"),
              t("feature4"),
            ].map((item) => (
              <li key={item} className="aside-item flex items-center gap-3 text-blue-50">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <span className="text-sm">{item}</span>
              </li>
            ))}
          </ul>

          <div className="grid grid-cols-3 gap-6 pt-6 border-t border-white/20">
            <div className="aside-stat">
              <p className="text-2xl font-bold">{t("statCountriesValue")}</p>
              <p className="text-xs text-blue-100 mt-1">{t("statCountriesLabel")}</p>
            </div>
            <div className="aside-stat">
              <p className="text-2xl font-bold">{t("statFreeValue")}</p>
              <p className="text-xs text-blue-100 mt-1">{t("statFreeLabel")}</p>
            </div>
            <div className="aside-stat">
              <p className="text-2xl font-bold">{t("statRealtimeValue")}</p>
              <p className="text-xs text-blue-100 mt-1">{t("statRealtimeLabel")}</p>
            </div>
          </div>
        </div>
      </aside>
    </main>
  )
}
