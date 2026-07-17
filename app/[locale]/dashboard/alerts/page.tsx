"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "@/i18n/navigation"
import { api } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"

interface Notification {
  id: string
  projectId: string | null
  type: string
  title: string
  body: string
  readAt: string | null
  createdAt: string
}

// type → tone + label key. Tone drives the left accent colour: positive
// movements green, negative red, plain movement neutral. labelKey indexes into
// the dashAlerts.types.* messages.
const TYPE_META: Record<string, { labelKey: string; tone: "up" | "down" | "neutral" }> = {
  RANK_MOVEMENT: { labelKey: "RANK_MOVEMENT", tone: "neutral" },
  PAGE1_ENTER: { labelKey: "PAGE1_ENTER", tone: "up" },
  PAGE1_LEAVE: { labelKey: "PAGE1_LEAVE", tone: "down" },
  SERP_FEATURE_GAINED: { labelKey: "SERP_FEATURE_GAINED", tone: "up" },
  SERP_FEATURE_LOST: { labelKey: "SERP_FEATURE_LOST", tone: "down" },
  BUDGET_CAP_HIT: { labelKey: "BUDGET_CAP_HIT", tone: "down" },
  DAILY_QUOTA_HIT: { labelKey: "DAILY_QUOTA_HIT", tone: "down" },
  PAYMENT_FAILED: { labelKey: "PAYMENT_FAILED", tone: "down" },
}

function toneColor(tone: "up" | "down" | "neutral"): string {
  if (tone === "up") return "var(--pos, #16a34a)"
  if (tone === "down") return "var(--neg, #dc2626)"
  return "var(--brand)"
}

const PAGE_SIZE = 30

export default function AlertsPage() {
  const t = useTranslations("dashAlerts")
  const router = useRouter()

  const relativeTime = useCallback(
    (iso: string): string => {
      const diff = Date.now() - new Date(iso).getTime()
      const mins = Math.floor(diff / 60_000)
      if (mins < 1) return t("time.justNow")
      if (mins < 60) return t("time.minutes", { count: mins })
      const hrs = Math.floor(mins / 60)
      if (hrs < 24) return t("time.hours", { count: hrs })
      const days = Math.floor(hrs / 24)
      if (days < 7) return t("time.days", { count: days })
      return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" })
    },
    [t],
  )

  const [items, setItems] = useState<Notification[]>([])
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")
  const [marking, setMarking] = useState(false)

  const fetchPage = useCallback(async (cur?: string) => {
    const q = `/api/notifications?limit=${PAGE_SIZE}${cur ? `&cursor=${cur}` : ""}`
    return api.get<{ items: Notification[]; nextCursor?: string }>(q)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await fetchPage()
        if (!cancelled) {
          setItems(data.items)
          setCursor(data.nextCursor)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t("errors.load"))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fetchPage, t])

  const loadMore = async () => {
    if (!cursor) return
    setLoadingMore(true)
    try {
      const data = await fetchPage(cursor)
      setItems((prev) => [...prev, ...data.items])
      setCursor(data.nextCursor)
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.loadMore"))
    } finally {
      setLoadingMore(false)
    }
  }

  const unreadCount = items.filter((n) => !n.readAt).length

  const markAllRead = async () => {
    setMarking(true)
    try {
      await api.post("/api/notifications/read-all")
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })))
    } catch {
      /* ignore */
    } finally {
      setMarking(false)
    }
  }

  const openItem = async (n: Notification) => {
    if (!n.readAt) {
      try {
        await api.post(`/api/notifications/${n.id}/read`)
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)))
      } catch {
        /* ignore */
      }
    }
    if (n.projectId) router.push(`/dashboard/project/${n.projectId}/keywords`)
  }

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1 style={{ margin: 0 }}>{t("title")}</h1>
          <div className="sub">
            {t("subtitle")}
            {unreadCount > 0 && ` · ${t("unreadCount", { count: unreadCount })}`}
          </div>
        </div>
        {unreadCount > 0 && (
          <button type="button" className="btn" onClick={markAllRead} disabled={marking}>
            {marking ? "…" : t("markAllRead")}
          </button>
        )}
      </div>

      {loading ? (
        <div className="tiny muted" style={{ padding: 40, textAlign: "center" }}>{t("loading")}</div>
      ) : error ? (
        <div className="tiny" style={{ color: "var(--neg)", padding: 40, textAlign: "center" }}>{error}</div>
      ) : items.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, color: "var(--muted, #888)" }}>
            <Icon.bell />
          </div>
          <div className="b" style={{ fontSize: 15 }}>{t("empty.title")}</div>
          <div className="tiny muted" style={{ marginTop: 6, maxWidth: 420, margin: "6px auto 0" }}>
            {t.rich("empty.body", {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </div>
        </div>
      ) : (
        <>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {items.map((n) => {
              const meta = TYPE_META[n.type]
              const metaLabel = meta ? t(`types.${meta.labelKey}`) : n.type
              const metaTone = meta?.tone ?? "neutral"
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => void openItem(n)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "14px 16px",
                    border: "none",
                    borderBottom: "1px solid var(--border)",
                    borderLeft: `3px solid ${toneColor(metaTone)}`,
                    cursor: "pointer",
                    background: n.readAt ? "transparent" : "var(--brand-soft)",
                  }}
                >
                  <div className="row" style={{ justifyContent: "space-between", gap: 10 }}>
                    <div className="row" style={{ gap: 8, minWidth: 0 }}>
                      {!n.readAt && (
                        <span
                          aria-label={t("unread")}
                          style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--brand)", flexShrink: 0 }}
                        />
                      )}
                      <span className="b" style={{ fontSize: 13.5 }}>{n.title}</span>
                    </div>
                    <span className="tiny muted" style={{ flexShrink: 0 }}>{relativeTime(n.createdAt)}</span>
                  </div>
                  <div className="row" style={{ gap: 8, marginTop: 4 }}>
                    <span
                      className="tiny"
                      style={{
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        fontSize: 10,
                        fontWeight: 600,
                        color: toneColor(metaTone),
                      }}
                    >
                      {metaLabel}
                    </span>
                  </div>
                  <div className="tiny muted" style={{ marginTop: 4 }}>{n.body}</div>
                </button>
              )
            })}
          </div>

          {cursor && (
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button type="button" className="btn" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? t("loading") : t("loadMore")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
