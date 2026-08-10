"use client"

import { useEffect } from "react"
import { useRouter } from "@/i18n/navigation"
import { useAuth } from "@/lib/auth"

/**
 * Onboarding now lives in the multi-step `/flow` wizard. This route is kept only
 * so any old links / bookmarks still work — it forwards to the right place based
 * on session state.
 */
export default function OnboardingRedirect() {
  const router = useRouter()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (loading) return
    if (!user) router.replace("/login")
    else if (!user.emailVerified) router.replace("/verify-email")
    else if (user.occupationRole) router.replace("/dashboard")
    else router.replace("/flow")
  }, [user, loading, router])

  return (
    <main className="min-h-screen grid place-items-center bg-white text-slate-400 text-sm">
      Loading…
    </main>
  )
}
