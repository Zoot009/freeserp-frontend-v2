"use client"

import { useEffect, useRef, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { Link, useRouter } from "@/i18n/navigation"
import { LanguageSwitcher } from "@/components/language-switcher"
import { useAuth } from "@/lib/auth"
import { useGoogleLogin } from "@react-oauth/google"
import { facebookLogin, isFacebookConfigured } from "@/lib/facebook"
import { isGithubConfigured, startGithubLogin } from "@/lib/github"
import gsap from "gsap"
import { persistPendingDomain } from "@/lib/pendingDomain"
import { Logo } from "@/components/brand/logo"

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  )
}

function SignupForm() {
  const t = useTranslations("signup")
  const searchParams = useSearchParams()
  const keyword = searchParams.get("keyword") || ""
  const pendingDomain = searchParams.get("domain") || ""
  const router = useRouter()
  const { user, loading: authLoading, register, loginWithGoogle, loginWithFacebook } = useAuth()
  const facebookEnabled = isFacebookConfigured()
  const githubEnabled = isGithubConfigured()
  const containerRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const asideRef = useRef<HTMLElement>(null)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [facebookLoading, setFacebookLoading] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!authLoading && user) {
      router.push("/dashboard")
    }
  }, [user, authLoading, router])

  // Arriving from the marketing landing page's dashboard preview. The domain
  // normally travels in a `.freeserp.com` cookie; this re-writes it on the app's
  // own origin so the handoff still works if that cookie didn't survive (Safari
  // ITP, a preview deployment on an unrelated host, cookies cleared between
  // visits). Must happen HERE — the redirect above drops the query string, so
  // /dashboard/projects never sees it otherwise.
  useEffect(() => {
    if (pendingDomain) persistPendingDomain(pendingDomain)
  }, [pendingDomain])

  const googleLogin = useGoogleLogin({
    scope: "openid email profile",
    onSuccess: async ({ access_token }) => {
      setGoogleLoading(true)
      setError("")
      try {
        // Google auth on the signup page only counts as a signup when it
        // actually creates a new account. An existing user clicking "Sign up
        // with Google" is really logging in — the backend tells us which, so we
        // mark the ?first-sign-up GTM conversion (fired on the dashboard) only
        // for genuinely new accounts.
        const { isNewUser } = await loginWithGoogle(access_token)
        if (isNewUser) {
          try { sessionStorage.setItem("fs_just_signed_up", "1") } catch {}
          // New account → straight to the one-time role page, never the dashboard.
          router.replace("/flow")
          return
        }
        router.push("/dashboard")
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : t("errorGoogleFailed"))
      } finally {
        setGoogleLoading(false)
      }
    },
    onError: () => setError(t("errorGoogleCancelled")),
  })

  const handleFacebook = async () => {
    setFacebookLoading(true)
    setError("")
    try {
      // As with Google, a Facebook click on the signup page only counts as a
      // signup when it actually creates a new account (the backend tells us).
      const { isNewUser } = await loginWithFacebook(await facebookLogin())
      if (isNewUser) {
        try { sessionStorage.setItem("fs_just_signed_up", "1") } catch {}
        router.replace("/flow")
        return
      }
      router.push("/dashboard")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("errorFacebookFailed"))
    } finally {
      setFacebookLoading(false)
    }
  }

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      await register({ firstName, lastName, email, password })
      router.push("/verify-email")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("errorGeneric"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-white text-slate-900 grid lg:grid-cols-2">
      {/* Left — Marketing panel */}
      <aside ref={asideRef} className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-linear-to-br from-blue-600 via-blue-600 to-blue-700 text-white px-12 py-12 rounded-r-[2.5rem]">
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
        <div className="auth-blob absolute -top-32 -left-32 h-96 w-96 rounded-full bg-blue-400 blur-3xl" aria-hidden="true" />
        <div className="auth-blob-alt absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-blue-800 blur-3xl" aria-hidden="true" />

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
              <p className="text-2xl font-bold">{t("statFreeValue")}</p>
              <p className="text-xs text-blue-100 mt-1">{t("statFreeLabel")}</p>
            </div>
            <div className="aside-stat">
              <p className="text-2xl font-bold">{t("statCountriesValue")}</p>
              <p className="text-xs text-blue-100 mt-1">{t("statCountriesLabel")}</p>
            </div>
            <div className="aside-stat">
              <p className="text-2xl font-bold">{t("statTimeValue")}</p>
              <p className="text-xs text-blue-100 mt-1">{t("statTimeLabel")}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Right — Signup form */}
      <section className="relative flex flex-col px-6 sm:px-10 lg:px-16 py-8" id="main-content">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl transition-transform group-hover:scale-105">
              <Logo size={32} className="rounded-lg" />
            </span>
            <span className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
              FreeSERP
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <LanguageSwitcher className="text-slate-600 light" />
            <p className="text-sm text-slate-500">
              {t("haveAccount")}{" "}
              <Link href="/login" className="text-blue-600 font-medium hover:text-blue-700">
                {t("signIn")}
              </Link>
            </p>
          </div>
        </div>

        <div ref={containerRef} className="flex-1 flex items-center justify-center mt-10 lg:mt-0">
          <div className="w-full max-w-md">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 uppercase tracking-wider">
              <span className="text-blue-500">★</span> {t("badge")}
            </span>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900">
              {t("title")}
            </h1>
            {keyword ? (
              <p className="mt-2 text-slate-500">
                {t.rich("subtitleKeyword", {
                  keyword,
                  kw: (chunks) => <span className="text-blue-600 font-medium">{chunks}</span>,
                })}
              </p>
            ) : (
              <p className="mt-2 text-slate-500">
                {t("subtitleDefault")}
              </p>
            )}

            <form ref={formRef} onSubmit={handleSubmit} className="mt-8 space-y-5">
              {/* Google */}
              <div className="field-row">
                <button
                  type="button"
                  onClick={() => googleLogin()}
                  disabled={googleLoading}
                  className="w-full flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm disabled:opacity-50 transition-all duration-200"
                >
                  {googleLoading ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 rounded-full border-2 border-slate-300 border-t-slate-700 animate-spin" />
                      {t("connecting")}
                    </span>
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                      {t("signUpWithGoogle")}
                    </>
                  )}
                </button>
              </div>

              {/* Facebook */}
              {facebookEnabled && (
                <div className="field-row">
                  <button
                    type="button"
                    onClick={handleFacebook}
                    disabled={facebookLoading}
                    className="w-full flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm disabled:opacity-50 transition-all duration-200"
                  >
                    {facebookLoading ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="h-4 w-4 rounded-full border-2 border-slate-300 border-t-slate-700 animate-spin" />
                        {t("connecting")}
                      </span>
                    ) : (
                      <>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2">
                          <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
                        </svg>
                        {t("signUpWithFacebook")}
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* GitHub */}
              {githubEnabled && (
                <div className="field-row">
                  <button
                    type="button"
                    onClick={() => startGithubLogin()}
                    className="w-full flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm disabled:opacity-50 transition-all duration-200"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="#181717" aria-hidden>
                      <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.05-.02-2.06-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.96 0-1.32.47-2.39 1.24-3.23-.12-.3-.54-1.53.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 3-.4c1.02 0 2.05.14 3 .4 2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.23 0 4.63-2.81 5.65-5.49 5.95.43.37.81 1.1.81 2.22 0 1.6-.01 2.9-.01 3.29 0 .32.22.7.83.58A12.01 12.01 0 0 0 24 12.5C24 5.87 18.63.5 12 .5z" />
                    </svg>
                    {t("signUpWithGithub")}
                  </button>
                </div>
              )}

              {/* Divider */}
              <div className="field-row flex items-center gap-3 text-xs text-slate-400">
                <div className="h-px flex-1 bg-slate-200" />
                <span>{t("orWithEmail")}</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              {/* Name row */}
              <div className="field-row grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="firstName" className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {t("firstName")}
                  </label>
                  <input
                    id="firstName"
                    type="text"
                    required
                    autoComplete="given-name"
                    placeholder={t("firstNamePlaceholder")}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all duration-200"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="lastName" className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {t("lastName")}
                  </label>
                  <input
                    id="lastName"
                    type="text"
                    required
                    autoComplete="family-name"
                    placeholder={t("lastNamePlaceholder")}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all duration-200"
                  />
                </div>
              </div>

              {/* Email */}
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

              {/* Password */}
              <div className="field-row space-y-1.5">
                <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {t("password")}
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

              {/* Terms */}
              <div className="field-row flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => setAgreed((v) => !v)}
                  className={`mt-0.5 h-4 w-4 shrink-0 rounded border transition-colors flex items-center justify-center ${
                    agreed ? "bg-blue-600 border-blue-600" : "border-slate-300 bg-white hover:border-slate-400"
                  }`}
                  aria-pressed={agreed}
                  aria-label={t("agreeAria")}
                >
                  {agreed && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {t.rich("agree", {
                    terms: (chunks) => <Link href="#" className="text-blue-600 font-medium hover:text-blue-700">{chunks}</Link>,
                    privacy: (chunks) => <Link href="#" className="text-blue-600 font-medium hover:text-blue-700">{chunks}</Link>,
                  })}
                </p>
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
                  disabled={loading || !agreed}
                  className="w-full rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-blue-600/20 hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/30 hover:-translate-y-0.5 active:translate-y-0 disabled:bg-blue-400 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-md transition-all duration-200"
                >
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                      {t("creating")}
                    </span>
                  ) : (
                    t("createFreeAccount")
                  )}
                </button>
              </div>

              {/* Footer */}
              <p className="field-row text-sm text-slate-500">
                {t("alreadyHaveAccount")}{" "}
                <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">
                  {t("signIn")}
                </Link>
              </p>
            </form>
          </div>
        </div>
      </section>
    </main>
  )
}
