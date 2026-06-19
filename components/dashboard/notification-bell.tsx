"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "@/emails/i18n/navigation"
import { api, getAccessToken } from "@/lib/api"
import { Icon } from "./icons"

interface Notification {
  id: string
  projectId: string | null
  type: string
  title: string
  body: string
  readAt: string | null
  createdAt: string
}

const POLL_MS = 60_000

function relativeTime(iso: string, t: ReturnType<typeof useTranslations>): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return t("justNow")
  if (mins < 60) return t("minutesAgo", { count: mins })
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return t("hoursAgo", { count: hrs })
  const days = Math.floor(hrs / 24)
  return t("daysAgo", { count: days })
}

export function NotificationBell() {
  const t = useTranslations("notifications")
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const refreshCount = useCallback(async () => {
    // Only poll when signed in — the api client would otherwise 401/redirect.
    if (!getAccessToken()) return
    try {
      const { count } = await api.get<{ count: number }>("/api/notifications/unread-count")
      setUnread(count)
    } catch {
      /* silent — a transient failure shouldn't surface in the chrome */
    }
  }, [])

  useEffect(() => {
    void refreshCount()
    const t = setInterval(() => void refreshCount(), POLL_MS)
    return () => clearInterval(t)
  }, [refreshCount])

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [open])

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const { items } = await api.get<{ items: Notification[] }>("/api/notifications?limit=20")
      setItems(items)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) void loadList()
  }

  const markAllRead = async () => {
    try {
      await api.post("/api/notifications/read-all")
      setUnread(0)
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })))
    } catch {
      /* ignore */
    }
  }

  const openItem = async (n: Notification) => {
    if (!n.readAt) {
      try {
        await api.post(`/api/notifications/${n.id}/read`)
        setUnread((c) => Math.max(0, c - 1))
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)))
      } catch {
        /* ignore */
      }
    }
    setOpen(false)
    if (n.projectId) router.push(`/dashboard/project/${n.projectId}/keywords`)
  }

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button className="icon-btn" title={t("title")} aria-label={t("title")} onClick={toggle}>
        <Icon.bell />
        {unread > 0 && <span className="dot" />}
      </button>

      {open && (
        <div
          className="card"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            width: 340,
            maxWidth: "calc(100vw - 24px)",
            maxHeight: 440,
            overflowY: "auto",
            padding: 0,
            zIndex: 50,
            boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
          }}
        >
          <div
            className="row"
            style={{ justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid var(--border)" }}
          >
            <span className="b" style={{ fontSize: 13 }}>{t("title")}</span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                type="button"
                style={{ background: "transparent", border: "none", color: "var(--brand)", cursor: "pointer", fontSize: 11, fontWeight: 600 }}
              >
                {t("markAllRead")}
              </button>
            )}
          </div>

          {loading ? (
            <div className="tiny muted" style={{ padding: 16 }}>{t("loading")}</div>
          ) : items.length === 0 ? (
            <div className="tiny muted" style={{ padding: 16, textAlign: "center" }}>{t("empty")}</div>
          ) : (
            <>
              {items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => void openItem(n)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 14px",
                    border: "none",
                    borderBottom: "1px solid var(--border)",
                    cursor: "pointer",
                    background: n.readAt ? "transparent" : "var(--brand-soft)",
                  }}
                >
                  <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                    <span className="b" style={{ fontSize: 12.5 }}>{n.title}</span>
                    <span className="tiny muted" style={{ flexShrink: 0 }}>{relativeTime(n.createdAt, t)}</span>
                  </div>
                  <div className="tiny muted" style={{ marginTop: 2 }}>{n.body}</div>
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setOpen(false); router.push("/dashboard/alerts") }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "10px 14px",
                  border: "none",
                  background: "transparent",
                  color: "var(--brand)",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {t("viewAllAlerts")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
