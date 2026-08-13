"use client"

import { useEffect, useRef, useState, useCallback, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { Link, useRouter } from "@/i18n/navigation"
import { LanguageSwitcher } from "@/components/language-switcher"
import { useAuth } from "@/lib/auth"
import gsap from "gsap"
import Image from "next/image"

const RESEND_COOLDOWN = 60

function MarketingAside({ asideRef }: { asideRef: React.RefObject<HTMLElement | null> }) {
  const t = useTranslations("resetPassword")
  return (
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
  )
}

function ResetPasswordForm() {
  const t = useTranslations("resetPassword")
  const { resetPassword, forgotPassword } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const containerRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const asideRef = useRef<HTMLElement>(null)
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
    if (otp.length < 6) { setError(t("errorAllDigits")); return }
    if (password.length < 8) { setError(t("errorPasswordLength")); return }
    setError("")
    setLoading(true)
    try {
      await resetPassword(email, otp, password)
      setSuccess(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("errorResetFailed"))
      setDigits(["", "", "", "", "", ""])
      inputRefs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }, [otp, password, email, resetPassword, t])

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

  return (
    <main className="min-h-screen bg-white text-slate-900 grid lg:grid-cols-2">
      {/* Left — Reset password form */}
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
            <LanguageSwitcher className="text-slate-600 light" />
            <p className="text-sm text-slate-500">
              {t("rememberIt")}{" "}
              <Link href="/login" className="text-blue-600 font-medium hover:text-blue-700">
                {t("signIn")}
              </Link>
            </p>
          </div>
        </div>

        {/* Form area */}
        <div ref={containerRef} className="flex-1 flex items-center justify-center mt-10 lg:mt-0">
          <div className="w-full max-w-md">
            {success ? (
              /* Success state */
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 uppercase tracking-wider">
                  <span className="text-blue-500">★</span> {t("doneBadge")}
                </span>
                <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900">
                  {t("successTitle")}
                </h1>
                <p className="mt-2 text-slate-500">
                  {t("successSubtitle")}
                </p>
                <div className="mt-8">
                  <button
                    onClick={() => router.push("/login")}
                    className="w-full rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-blue-600/20 hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/30 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
                  >
                    {t("signInNow")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 uppercase tracking-wider">
                  <span className="text-blue-500">★</span> {t("badge")}
                </span>
                <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900">
                  {t("title")}
                </h1>
                <p className="mt-2 text-slate-500">
                  {t("subtitle")}
                </p>

                <form ref={formRef} onSubmit={handleSubmit} className="mt-8 space-y-5">
                  {/* Email (editable in case pre-fill was wrong) */}
                  <div className="field-row space-y-1.5">
                    <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                      {t("email")}
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder={t("emailPlaceholder")}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all duration-200"
                    />
                  </div>

                  {/* OTP boxes */}
                  <div className="field-row space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                        {t("resetCode")}
                      </label>
                      <button
                        type="button"
                        onClick={handleResend}
                        disabled={cooldown > 0 || !email}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
                      >
                        {cooldown > 0 ? t("resendIn", { seconds: cooldown }) : t("resendCode")}
                      </button>
                    </div>
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
                          className={`h-14 w-full rounded-2xl border bg-white text-center text-2xl font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all duration-200
                            ${error && !d ? "border-red-300" : d ? "border-blue-500" : "border-slate-200"}
                            focus:border-blue-500`}
                          aria-label={t("digitAria", { n: i + 1 })}
                        />
                      ))}
                    </div>
                  </div>

                  {/* New password */}
                  <div className="field-row space-y-1.5">
                    <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                      {t("newPassword")}
                    </label>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        required
                        autoComplete="new-password"
                        minLength={8}
                        placeholder={t("passwordPlaceholder")}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-12 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all duration-200"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showPassword ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Error */}
                  {error && (
                    <div className="field-row rounded-2xl border border-red-200 bg-red-50 px-4 py-3 animate-in fade-in slide-in-from-top-2">
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  )}

                  {/* Submit */}
                  <div className="field-row pt-1">
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-blue-600/20 hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/30 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-md transition-all duration-200"
                    >
                      {loading ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                          {t("resetting")}
                        </span>
                      ) : (
                        t("resetPassword")
                      )}
                    </button>
                  </div>

                  {/* Footer */}
                  <p className="field-row text-sm text-slate-500">
                    {t("rememberPassword")}{" "}
                    <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">
                      {t("signIn")}
                    </Link>
                  </p>
                </form>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Right — Marketing panel */}
      <MarketingAside asideRef={asideRef} />
    </main>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="h-5 w-5 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  )
}
