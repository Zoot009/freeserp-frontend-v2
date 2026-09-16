"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"

/**
 * Marketing unsubscribe confirmation page.
 *
 * Deliberately outside app/[locale]/dashboard: someone unsubscribing is often
 * not signed in (and may no longer have an account at all), so this must work
 * with no session. Authorisation comes entirely from the HMAC in `t`.
 *
 * `e` and `t` are passed straight back to the API untouched — the server is the
 * only thing that decodes or verifies them.
 */

type Status = "loading" | "ready" | "done" | "resubscribed" | "invalid" | "error"

function api(path: string, e: string, t: string, method: "GET" | "POST") {
  return fetch(`/api/public/${path}?e=${encodeURIComponent(e)}&t=${encodeURIComponent(t)}`, {
    method,
    headers: { Accept: "application/json" },
  })
}

function UnsubscribeInner() {
  const t = useTranslations("unsubscribe")
  const params = useSearchParams()
  const e = params.get("e") ?? ""
  const token = params.get("t") ?? ""

  const [status, setStatus] = useState<Status>("loading")
  const [email, setEmail] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!e || !token) {
      setStatus("invalid")
      return
    }
    let cancelled = false
    api("unsubscribe/status", e, token, "GET")
      .then(async (res) => {
        if (cancelled) return
        if (res.status === 400) {
          setStatus("invalid")
          return
        }
        if (!res.ok) {
          setStatus("error")
          return
        }
        const body = (await res.json()) as { email: string; suppressed: boolean }
        setEmail(body.email)
        // A one-click unsubscribe from the mail client already suppressed them;
        // land straight on the confirmed state rather than asking again.
        setStatus(body.suppressed ? "done" : "ready")
      })
      .catch(() => {
        if (!cancelled) setStatus("error")
      })
    return () => {
      cancelled = true
    }
  }, [e, token])

  const act = useCallback(
    async (path: "unsubscribe" | "resubscribe", next: Status) => {
      setBusy(true)
      try {
        const res = await api(path, e, token, "POST")
        setStatus(res.ok ? next : res.status === 400 ? "invalid" : "error")
      } catch {
        setStatus("error")
      } finally {
        setBusy(false)
      }
    },
    [e, token],
  )

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-xl font-semibold text-slate-900">{t("title")}</h1>

        {status === "loading" && <p className="mt-4 text-slate-600">{t("loading")}</p>}

        {status === "invalid" && (
          <p className="mt-4 text-slate-600">{t("invalid")}</p>
        )}

        {status === "error" && (
          <p className="mt-4 text-slate-600">{t("error")}</p>
        )}

        {status === "ready" && (
          <>
            <p className="mt-4 text-slate-600">{t("prompt", { email: email ?? "" })}</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => act("unsubscribe", "done")}
              className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {busy ? t("working") : t("confirm")}
            </button>
            <p className="mt-4 text-sm text-slate-500">{t("transactionalNote")}</p>
          </>
        )}

        {status === "done" && (
          <>
            <p className="mt-4 text-slate-600">{t("done", { email: email ?? "" })}</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => act("resubscribe", "resubscribed")}
              className="mt-6 w-full rounded-lg border border-slate-300 px-4 py-2.5 font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {busy ? t("working") : t("undo")}
            </button>
            <p className="mt-4 text-sm text-slate-500">{t("transactionalNote")}</p>
          </>
        )}

        {status === "resubscribed" && (
          <p className="mt-4 text-slate-600">{t("resubscribed", { email: email ?? "" })}</p>
        )}

        <Link href="/" className="mt-8 block text-sm text-blue-600 hover:underline">
          {t("backHome")}
        </Link>
      </div>
    </main>
  )
}

export default function UnsubscribePage() {
  // useSearchParams needs a Suspense boundary to avoid opting the whole route
  // into client-side rendering at build time.
  return (
    <Suspense fallback={null}>
      <UnsubscribeInner />
    </Suspense>
  )
}
