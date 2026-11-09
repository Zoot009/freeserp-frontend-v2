"use client"

import { useState, type FormEvent } from "react"
import { Lock } from "lucide-react"
import { api, setAccessToken } from "@/lib/api"

export function InhouseLogin() {
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!password || busy) return
    setBusy(true)
    setError("")
    try {
      const res = await api.post<{ accessToken: string }>("/api/auth/inhouse", { password }, { skipAuth: true, skipAuthRedirect: true })
      setAccessToken(res.accessToken)
      // A full load, so the app starts with the new session.
      window.location.assign("/dashboard")
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't sign in. Try again.")
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand/10 text-brand">
            <Lock className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h1 className="text-[15px] font-semibold">FreeSERP team access</h1>
            <p className="text-xs text-muted-foreground">For the in-house team only.</p>
          </div>
        </div>
        <label htmlFor="inhouse-password" className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Password
        </label>
        <input
          id="inhouse-password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
        {error && (
          <p role="alert" className="mt-2 text-xs text-red-500">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !password}
          className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-brand text-sm font-semibold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  )
}
