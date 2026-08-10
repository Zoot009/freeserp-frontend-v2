"use client"

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react"
import { api, ApiError, getAccessToken, setAccessToken, subscribeToToken } from "@/lib/api"
import { getVisitorId } from "@/lib/utm"

interface User {
  id: string
  email: string
  name?: string | null
  plan?: string
  emailVerified?: boolean
  // Self-reported audience segment. null/undefined = the user hasn't answered the
  // one-time role page yet, which makes the dashboard shell re-route to /onboarding.
  occupationRole?: string | null
  // Free-text detail supplied when occupationRole === "other" (else null).
  occupationRoleOther?: string | null
}

interface RegisterData {
  firstName: string
  lastName: string
  email: string
  password: string
}

interface LoginData {
  email: string
  password: string
}

interface AuthContextValue {
  user: User | null
  token: string | null
  loading: boolean
  register: (data: RegisterData) => Promise<void>
  login: (data: LoginData) => Promise<{ emailVerified: boolean }>
  loginWithGoogle: (accessToken: string) => Promise<{ isNewUser: boolean }>
  loginWithFacebook: (accessToken: string) => Promise<{ isNewUser: boolean }>
  loginWithGithub: (code: string, redirectUri?: string) => Promise<{ isNewUser: boolean }>
  requestLoginOtp: (email: string) => Promise<void>
  verifyLoginOtp: (email: string, otp: string) => Promise<{ isNewUser: boolean }>
  logout: () => void
  verifyEmail: (otp: string) => Promise<void>
  resendVerify: () => Promise<void>
  forgotPassword: (email: string) => Promise<void>
  resetPassword: (email: string, otp: string, password: string) => Promise<void>
  refreshUser: () => Promise<void>
}

interface AuthResponse {
  user: User
  accessToken: string
  refreshToken: string
  // Only present on the Google endpoint: true when this call created the account.
  isNewUser?: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(getAccessToken())
  const [loading, setLoading] = useState(true)

  // Mirror `loading` into a ref so the pageshow listener can read it without
  // re-subscribing on every change.
  const loadingRef = useRef(loading)
  useEffect(() => {
    loadingRef.current = loading
  }, [loading])

  useEffect(() => subscribeToToken((t) => setToken(t)), [])

  // Resolve the current session from /api/auth/me. Only an actual 401 clears the
  // token — a timeout or network blip leaves it intact so the session can recover
  // on the next attempt rather than silently logging the user out.
  const checkAuth = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const { user } = await api.get<{ user: User }>("/api/auth/me")
      setUser(user)
    } catch (err) {
      // ONLY a real 401 ends the session. Clearing `user` on every error made a
      // transient failure indistinguishable from a logout: DashboardShell
      // redirects to /login the instant `user` is null, so an aborted request
      // bounced a signed-in user to the login page. Switching locale did exactly
      // that — the navigation remounts this provider and cancels the in-flight
      // /api/auth/me. On a blip we keep the current user (cache-hydrated or
      // otherwise) and let the next check settle it, which is what the note
      // above always intended.
      if (err instanceof ApiError && err.status === 401) {
        setUser(null)
        setAccessToken(null)
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  // Hydrate the session from a local cache first so a RELOAD renders the app
  // instantly instead of flashing "Loading…" while /api/auth/me is in flight,
  // then verify in the background (silent = no loading toggle). Falls back to a
  // normal blocking check when there's no cache (first-ever visit / logged out).
  useEffect(() => {
    let cached: User | null = null
    try {
      const c = localStorage.getItem("fs_user")
      if (c) cached = JSON.parse(c) as User
    } catch { /* ignore a bad/absent cache */ }
    if (cached) {
      setUser(cached)
      setLoading(false)
      void checkAuth(true)
    } else {
      void checkAuth(false)
    }
  }, [checkAuth])

  // Keep the cache in sync so the next reload can hydrate from it.
  useEffect(() => {
    try {
      if (user) localStorage.setItem("fs_user", JSON.stringify(user))
      else localStorage.removeItem("fs_user")
    } catch { /* storage full / disabled — non-fatal */ }
  }, [user])

  // Back/forward bfcache restores a frozen page — if the initial /api/auth/me was
  // still in flight when the page was cached, its promise never settles and the
  // app sits on "Loading…" forever (a reload fixes it). Re-run the check when the
  // page is restored from bfcache while still loading.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted && loadingRef.current) void checkAuth()
    }
    window.addEventListener("pageshow", onPageShow)
    return () => window.removeEventListener("pageshow", onPageShow)
  }, [checkAuth])

  const handleAuth = (res: AuthResponse) => {
    setAccessToken(res.accessToken)
    setUser(res.user)
  }

  const register = useCallback(async ({ firstName, lastName, email, password }: RegisterData) => {
    const res = await api.post<AuthResponse>(
      "/api/auth/register",
      { email, password, name: `${firstName} ${lastName}`.trim() || undefined, visitorId: getVisitorId() },
      { skipAuth: true },
    )
    handleAuth(res)
  }, [])

  const login = useCallback(async ({ email, password }: LoginData) => {
    const res = await api.post<AuthResponse>("/api/auth/login", { email, password }, { skipAuth: true })
    handleAuth(res)
    return { emailVerified: res.user.emailVerified ?? true }
  }, [])

  // Exchanges a Google OAuth access token (from useGoogleLogin's implicit flow)
  // for a FreeSerp session via the backend's /api/auth/google endpoint.
  const loginWithGoogle = useCallback(async (accessToken: string) => {
    const res = await api.post<AuthResponse>("/api/auth/google", { accessToken, visitorId: getVisitorId() }, { skipAuth: true })
    handleAuth(res)
    return { isNewUser: res.isNewUser ?? false }
  }, [])

  // Exchanges a Facebook Login access token (from FB.login) for a FreeSerp
  // session via the backend's /api/auth/facebook endpoint.
  const loginWithFacebook = useCallback(async (accessToken: string) => {
    const res = await api.post<AuthResponse>("/api/auth/facebook", { accessToken, visitorId: getVisitorId() }, { skipAuth: true })
    handleAuth(res)
    return { isNewUser: res.isNewUser ?? false }
  }, [])

  // Exchanges a GitHub authorization code (from the redirect callback) for a
  // FreeSerp session via the backend's /api/auth/github endpoint. The backend
  // does the secret-bearing token exchange; the browser only forwards the code.
  const loginWithGithub = useCallback(async (code: string, redirectUri?: string) => {
    const res = await api.post<AuthResponse>("/api/auth/github", { code, redirectUri, visitorId: getVisitorId() }, { skipAuth: true })
    handleAuth(res)
    return { isNewUser: res.isNewUser ?? false }
  }, [])

  // Passwordless email sign-in — step 1: request a one-time code. Always resolves
  // (the backend answers ok regardless) so no signal leaks about which emails exist.
  const requestLoginOtp = useCallback(async (email: string) => {
    await api.post("/api/auth/otp/request", { email, visitorId: getVisitorId() }, { skipAuth: true })
  }, [])

  // Step 2: confirm the code and establish the session.
  const verifyLoginOtp = useCallback(async (email: string, otp: string) => {
    const res = await api.post<AuthResponse>("/api/auth/otp/verify", { email, otp, visitorId: getVisitorId() }, { skipAuth: true })
    handleAuth(res)
    return { isNewUser: res.isNewUser ?? false }
  }, [])

  const logout = useCallback(() => {
    api.post("/api/auth/logout").catch(() => undefined)
    setAccessToken(null)
    setUser(null)
  }, [])

  // New signups start unverified; the backend gates the core app until the
  // user confirms the 6-digit OTP we email them. On success it clears the
  // verifyOtp and flips emailVerified, lifting the gate for the existing session.
  const verifyEmail = useCallback(async (otp: string) => {
    await api.post("/api/auth/verify-email", { otp })
    setUser((prev) => (prev ? { ...prev, emailVerified: true } : prev))
  }, [])

  const resendVerify = useCallback(async () => {
    await api.post("/api/auth/resend-verify", {})
  }, [])

  const forgotPassword = useCallback(async (email: string) => {
    await api.post("/api/auth/password/reset/request", { email }, { skipAuth: true })
  }, [])

  const resetPassword = useCallback(async (email: string, otp: string, newPassword: string) => {
    await api.post("/api/auth/password/reset/confirm", { email, otp, newPassword }, { skipAuth: true })
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const { user: u } = await api.get<{ user: User }>("/api/auth/me")
      setUser(u)
    } catch (err) {
      console.error("Failed to refresh user:", err)
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, token, loading, register, login, loginWithGoogle, loginWithFacebook, loginWithGithub, requestLoginOtp, verifyLoginOtp, logout, verifyEmail, resendVerify, forgotPassword, resetPassword, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>")
  return ctx
}
