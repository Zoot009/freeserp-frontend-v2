"use client"

import { createContext, useContext, useEffect, useState, useCallback } from "react"
import { api, getAccessToken, setAccessToken, subscribeToToken } from "@/lib/api"

interface User {
  id: string
  email: string
  name?: string | null
  plan?: string
  emailVerified?: boolean
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
  loginWithGoogle: (accessToken: string) => Promise<void>
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
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(getAccessToken())
  const [loading, setLoading] = useState(true)

  useEffect(() => subscribeToToken((t) => setToken(t)), [])

  useEffect(() => {
    let cancelled = false
    api
      .get<{ user: User }>("/api/auth/me")
      .then(({ user }) => {
        if (!cancelled) setUser(user)
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null)
          setAccessToken(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleAuth = (res: AuthResponse) => {
    setAccessToken(res.accessToken)
    setUser(res.user)
  }

  const register = useCallback(async ({ firstName, lastName, email, password }: RegisterData) => {
    const res = await api.post<AuthResponse>(
      "/api/auth/register",
      { email, password, name: `${firstName} ${lastName}`.trim() || undefined },
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
    const res = await api.post<AuthResponse>("/api/auth/google", { accessToken }, { skipAuth: true })
    handleAuth(res)
  }, [])

  const logout = useCallback(() => {
    api.post("/api/auth/logout").catch(() => undefined)
    setAccessToken(null)
    setUser(null)
  }, [])

  // Email verification is not part of v2's MVP scope. Pages that import these
  // still work; the call returns a friendly error if the backend route is
  // missing.
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
      value={{ user, token, loading, register, login, loginWithGoogle, logout, verifyEmail, resendVerify, forgotPassword, resetPassword, refreshUser }}
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
