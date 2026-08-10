"use client"

/**
 * The notification bell in the dashboard header.
 *
 * Unread count polls on a timer; the list itself is only fetched when the panel
 * opens, so a dashboard left open all day costs one small request a minute
 * rather than a full feed.
 *
 * This component already existed and worked, but it was only ever rendered by
 * `topbar.tsx` — which the app stopped using when the sidebar shell landed. The
 * shell drew its own `<Bell/>` inside a Button with no handler, so the bell
 * every user actually sees did nothing at all. It's now styled to match the rest
 * of the header chrome and mounted in the shell, and the dead icon is gone.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Bell, Check } from "lucide-react"
import { useRouter } from "@/i18n/navigation"
import { api, getAccessToken } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

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
  const [failed, setFailed] = useState(false)
  // Guards the count poll against a request still in flight when the next tick
  // fires — on a slow connection those stack up and fight over `unread`.
  const inFlight = useRef(false)

  const refreshCount = useCallback(async () => {
    // Only poll when signed in — the api client would otherwise 401/redirect.
    if (!getAccessToken() || inFlight.current) return
    inFlight.current = true
    try {
      const { count } = await api.get<{ count: number }>("/api/notifications/unread-count")
      setUnread(count)
    } catch {
      /* silent — a transient failure shouldn't surface in the chrome */
    } finally {
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    void refreshCount()
    const timer = setInterval(() => void refreshCount(), POLL_MS)
    // Tabs get throttled in the background, so a count can be an hour stale by
    // the time someone comes back. Refresh on focus as well as on the timer.
    const onFocus = () => void refreshCount()
    window.addEventListener("focus", onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener("focus", onFocus)
    }
  }, [refreshCount])

  const loadList = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      const { items } = await api.get<{ items: Notification[] }>("/api/notifications?limit=20")
      setItems(items ?? [])
    } catch {
      // Distinguished from "no notifications" — the panel used to render the
      // empty state on a failed request, which reads as "you're all caught up"
      // when we simply don't know.
      setItems([])
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) void loadList()
  }

  const markAllRead = async () => {
    // Optimistic: the panel is already open and looking at the list, so waiting
    // on a round trip to grey out rows reads as a broken button.
    const before = items
    const beforeUnread = unread
    setUnread(0)
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })))
    try {
      await api.post("/api/notifications/read-all")
    } catch {
      setItems(before)
      setUnread(beforeUnread)
    }
  }

  const openItem = async (n: Notification) => {
    if (!n.readAt) {
      setUnread((c) => Math.max(0, c - 1))
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)))
      // Fire-and-forget: navigation shouldn't wait on the read receipt, and a
      // failed mark-read is corrected by the next count poll.
      api.post(`/api/notifications/${n.id}/read`).catch(() => void refreshCount())
    }
    setOpen(false)
    if (n.projectId) router.push(`/dashboard/project/${n.projectId}/keywords`)
    else router.push("/dashboard/alerts")
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative"
          aria-label={unread > 0 ? `${t("title")} (${unread} unread)` : t("title")}
        >
          <Bell className="size-4" />
          {unread > 0 && (
            // A count, not a dot: "you have something" and "you have eleven
            // things" are different messages, and the dot gave the same one.
            <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-[360px] max-w-[calc(100vw-24px)] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3.5 py-2.5">
          <span className="text-[13px] font-semibold">{t("title")}</span>
          {unread > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary transition-opacity hover:opacity-80"
            >
              <Check className="size-3" />
              {t("markAllRead")}
            </button>
          )}
        </div>

        <div className="fs-quiet-scroll max-h-[380px] overflow-y-auto">
          {loading ? (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">{t("loading")}</div>
          ) : failed ? (
            <div className="px-4 py-6 text-center">
              <p className="text-xs text-muted-foreground">Couldn&apos;t load notifications.</p>
              <button
                type="button"
                onClick={() => void loadList()}
                className="mt-2 text-xs font-semibold text-primary hover:underline"
              >
                Try again
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="grid place-items-center px-4 py-9 text-center">
              <div className="grid size-10 place-items-center rounded-full border-2 text-muted-foreground/40">
                <Bell className="size-4" />
              </div>
              <p className="mt-2.5 text-xs text-muted-foreground">{t("empty")}</p>
            </div>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => void openItem(n)}
                /* hover:bg-muted, NOT hover:bg-accent — this theme maps --accent
                   to the brand blue, so the stock hover paints a solid blue band
                   under near-black text. */
                className={cn(
                  "block w-full border-b px-3.5 py-2.5 text-left transition-colors last:border-0 hover:bg-muted",
                  !n.readAt && "bg-brand-soft",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 text-[12.5px] font-semibold leading-snug">{n.title}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(n.createdAt, t)}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground">{n.body}</p>
              </button>
            ))
          )}
        </div>

        {/* Always reachable, even from the empty state — "no notifications here"
            and "no alerts configured" are different problems, and the alerts
            page is where the second one is fixed. */}
        <button
          type="button"
          onClick={() => { setOpen(false); router.push("/dashboard/alerts") }}
          className="block w-full border-t px-3.5 py-2.5 text-center text-xs font-semibold text-primary transition-colors hover:bg-muted"
        >
          {t("viewAllAlerts")}
        </button>
      </PopoverContent>
    </Popover>
  )
}
