"use client"

// GitHub OAuth callback. GitHub redirects here with ?code=&state=; we validate
// state (CSRF), hand the code to the backend for the secret-bearing exchange,
// then land on the intended destination. Register EXACTLY this path
// (/auth/github/callback) as the GitHub app's Authorization callback URL.

import { Suspense, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useRouter, Link } from "@/i18n/navigation"
import { useAuth } from "@/lib/auth"
import { consumeGithubState, githubRedirectUri } from "@/lib/github"

const wrap: React.CSSProperties = {
  minHeight: "60vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  textAlign: "center",
  padding: 24,
}

function GithubCallbackInner() {
  const params = useSearchParams()
  const router = useRouter()
  const { loginWithGithub } = useAuth()
  const [error, setError] = useState<string | null>(null)
  // StrictMode double-invokes effects in dev; the code is single-use, so guard.
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    const code = params.get("code")
    const oauthError = params.get("error_description") || params.get("error")
    if (oauthError) {
      setError("GitHub sign-in was cancelled or didn't complete. Please try again.")
      return
    }

    const validated = consumeGithubState(params.get("state"))
    if (!code || !validated) {
      setError("This GitHub sign-in link is invalid or has expired. Please start again.")
      return
    }

    void loginWithGithub(code, githubRedirectUri())
      .then((r) => router.replace(r.isNewUser ? "/flow" : validated.next))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "GitHub sign-in failed. Please try again."),
      )
  }, [params, router, loginWithGithub])

  if (error) {
    return (
      <div style={wrap}>
        <p style={{ color: "var(--neg, #dc2626)", maxWidth: 360 }}>{error}</p>
        <Link href="/login" style={{ color: "var(--brand, #2d5bff)" }}>
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <div style={wrap}>
      <p style={{ color: "var(--text-mute, #8a93a4)" }}>Signing you in with GitHub…</p>
    </div>
  )
}

export default function GithubCallbackPage() {
  return (
    <Suspense fallback={<div style={wrap}><p>Signing you in…</p></div>}>
      <GithubCallbackInner />
    </Suspense>
  )
}
