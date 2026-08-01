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

export default function OtpLoginPage() {
  return (
    <Suspense>
      <OtpLoginForm />
    </Suspense>
  )
}

// Allow only internal absolute paths as a post-login target so ?next can't be
// abused as an open redirect (mirrors login/page.tsx safeNext).
function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/dashboard/projects"
  }
  return next
}

function OtpLoginForm() {
  const t = useTranslations("otpLogin")
  const searchParams = useSearchParams()
  const nextPath = safeNext(searchParams.get("next"))
  const router = useRouter()
  const { user, loading: authLoading, requestLoginOtp, verifyLoginOtp } = useAuth()

  const containerRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const asideRef = useRef<HTMLElement>(null)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const [step, setStep] = useState<"email" | "code">("email")
  const [email, setEmail] = useState("")
  const [digits, setDigits] = useState(["", "", "", "", "", ""])
  const [sending, setSending] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (!authLoading && user) router.push(nextPath)
  }, [user, authLoading, router, nextPath])

  // Entrance animation — mirrors the login page. Re-run on step change so the
  // freshly-rendered code inputs animate in.
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
          { opacity: 1, y: 0, duration: 0.4, stagger: 0.06, ease: "power3.out", delay: 0.1 },
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
      }
    })
    return () => ctx.revert()
  }, [step])

  // Resend cooldown ticker
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const otp = digits.join("")

  const sendCode = useCallback(async () => {
    setSending(true)
    setError("")
    try {
      await requestLoginOtp(email)
      setStep("code")
      setCooldown(RESEND_COOLDOWN)
      setDigits(["", "", "", "", "", ""])
      // Focus the first box once it mounts.
      setTimeout(() => inputRefs.current[0]?.focus(), 50)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("errorSendFailed"))
    } finally {
      setSending(false)
    }
  }, [email, requestLoginOtp, t])

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) { setError(t("errorEmailRequired")); return }
    void sendCode()
  }

  const handleChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1)
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    setError("")
    if (digit && index < 5) inputRefs.current[index + 1]?.focus()
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
    inputRefs.current[Math.min(pasted.length, 5)]?.focus()
  }

  const handleCodeSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (otp.length < 6) { setError(t("errorAllDigits")); return }
    setSubmitting(true)
    setError("")
    try {
      const { isNewUser } = await verifyLoginOtp(email, otp)
      setSuccess(t("successSignedIn"))
      // Brand-new passwordless account = a signup — flag it for the GTM
      // conversion fired on the dashboard (mirrors the Google/Facebook flows).
      if (isNewUser) {
        try { sessionStorage.setItem("fs_just_signed_up", "1") } catch {}
      }
      // New accounts go straight to onboarding (flag above still fires the
      // conversion after it); existing users to their intended destination.
      setTimeout(() => router.push(isNewUser ? "/flow" : nextPath), 1000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("errorVerifyFailed"))
      setDigits(["", "", "", "", "", ""])
      inputRefs.current[0]?.focus()
    } finally {
      setSubmitting(false)
    }
  }, [otp, email, verifyLoginOtp, router, nextPath, t])

  // Auto-submit when all 6 digits are filled
  useEffect(() => {
    if (step === "code" && otp.length === 6 && !digits.includes("") && !submitting && !success) {
      void handleCodeSubmit()
    }
  }, [step, otp, digits, submitting, success, handleCodeSubmit])

  const handleResend = () => {
    if (cooldown > 0) return
    void sendCode()
  }

  return (
    <main className="min-h-screen bg-white text-slate-900 grid lg:grid-cols-2">
      {/* Left — form */}
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
              <Link href="/login" className="text-blue-600 font-medium hover:text-blue-700">
                {t("usePassword")}
              </Link>
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
              {step === "email" ? t("titleEmail") : t("titleCode")}
            </h1>
            <p className="mt-2 text-slate-500">
              {step === "email" ? (
                t("subtitleEmail")
              ) : (
                t.rich("subtitleCode", {
                  email,
                  em: (chunks) => <span className="font-medium text-slate-900">{chunks}</span>,
                })
              )}
            </p>

            {step === "email" ? (
              <form ref={formRef} onSubmit={handleEmailSubmit} className="mt-8 space-y-5">
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

                {error && (
                  <div className="field-row rounded-2xl border border-red-200 bg-red-50 px-4 py-3 animate-in fade-in slide-in-from-top-2">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                <div className="field-row pt-1">
                  <button
                    type="submit"
                    disabled={sending}
                    className="w-full rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-blue-600/20 hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/30 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-md transition-all duration-200"
                  >
                    {sending ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                        {t("sending")}
                      </span>
                    ) : (
                      t("sendCode")
                    )}
                  </button>
                </div>

                <p className="field-row text-sm text-slate-500">
                  {t("noAccountQuestion")}{" "}
                  <span className="text-slate-500">{t("noAccountHint")}</span>
                </p>
              </form>
            ) : (
              <form ref={formRef} onSubmit={handleCodeSubmit} className="mt-8 space-y-5">
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

                {error && (
                  <div className="field-row rounded-2xl border border-red-200 bg-red-50 px-4 py-3 animate-in fade-in slide-in-from-top-2">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                {success && (
                  <div className="field-row flex items-center gap-2 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 animate-in fade-in slide-in-from-top-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <p className="text-sm text-green-700">{success}</p>
                  </div>
                )}

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
                      t("signIn")
                    )}
                  </button>
                </div>

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

                <p className="field-row text-sm text-slate-500">
                  <button
                    type="button"
                    onClick={() => { setStep("email"); setError(""); setSuccess("") }}
                    className="font-medium text-blue-600 hover:text-blue-700"
                  >
                    {t("changeEmail")}
                  </button>
                </p>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Right — Marketing panel */}
      <aside ref={asideRef} className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-linear-to-br from-blue-600 via-blue-600 to-blue-700 text-white px-12 py-12 rounded-l-[2.5rem]">
        <div
          className="absolute inset-0 opacity-20"
          aria-hidden="true"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.15) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
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

        <div className="relative z-10" />
      </aside>
    </main>
  )
}
