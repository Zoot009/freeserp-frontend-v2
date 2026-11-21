"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, Check, Copy, ExternalLink, Loader2, RefreshCw } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { api, errorReason } from "@/lib/api"
import { BUILDING, LANGUAGES, day, host, shareUrl, type ClientDetail } from "@/lib/chatbot-builder"
import { StatusBadge } from "@/components/chatbot-builder/status-badge"

const card = "rounded-2xl border border-border bg-card p-4 sm:p-5"
const btn = "inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 text-[13px] font-medium transition-colors hover:bg-muted disabled:opacity-50"

export default function ChatbotClientPage() {
  const params = useParams()
  const id = String(params.id ?? "")
  const { user, loading } = useAuth()
  const [data, setData] = useState<ClientDetail | null>(null)
  const [error, setError] = useState("")
  const [crawling, setCrawling] = useState(false)
  const [notice, setNotice] = useState("")
  const [copied, setCopied] = useState(false)

  const load = useCallback(() => {
    api.get<ClientDetail>(`/api/chatbot-builder/clients/${encodeURIComponent(id)}`).then(
      (d) => {
        setData(d)
        setError("")
      },
      (e) => setError(errorReason(e, "This client couldn't be loaded.")),
    )
  }, [id])

  useEffect(() => {
    if (user?.inhouse && id) load()
  }, [user?.inhouse, id, load])

  // While the chatbot is being built, the page checks back every 10 seconds.
  const building = !!data && BUILDING.includes(data.chatbot.status)
  useEffect(() => {
    if (!building) return
    const t = setTimeout(load, 10_000)
    return () => clearTimeout(t)
  }, [building, data, load])

  const crawlAgain = async () => {
    setCrawling(true)
    setNotice("")
    try {
      await api.post(`/api/chatbot-builder/clients/${encodeURIComponent(id)}/crawl`, {})
      setNotice("The website is being crawled again. This page updates as the chatbot is rebuilt.")
      load()
    } catch (e) {
      setNotice(errorReason(e, "The crawl couldn't be started."))
    } finally {
      setCrawling(false)
    }
  }

  // The link the client gets: FreeSERP's own share page for the demo, not the chatbot CRM's address.
  const link = data ? shareUrl(data.chatbot.demoUrl, typeof window === "undefined" ? "" : window.location.origin) : null
  const copyDemo = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // The link is on the page to select by hand.
    }
  }

  if (loading) return null
  if (!user?.inhouse) {
    return (
      <div className="page">
        <p className="text-[13px] text-muted-foreground">This page isn&apos;t available for this account.</p>
      </div>
    )
  }

  const back = (
    <Link href="/dashboard/chatbot-builder" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium hover:underline">
      <ArrowLeft className="h-4 w-4" aria-hidden /> All clients
    </Link>
  )
  if (!data) {
    return (
      <div className="page">
        {back}
        {error ? (
          <p className="text-[13px] text-red-600 dark:text-red-400">{error}</p>
        ) : (
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
          </p>
        )}
      </div>
    )
  }

  const { client, chatbot, crawl, quality } = data
  const run = crawl.latest
  const language = LANGUAGES.find(([v]) => v === client.language)?.[1] ?? client.language

  return (
    <div className="page space-y-5">
      <div>{back}</div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight">{client.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            <a href={client.website} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
              {host(client.website)}
            </a>
            <span aria-hidden>·</span>
            <span>{client.category}</span>
            <StatusBadge status={chatbot.status} label={chatbot.suspended ? "Suspended" : chatbot.statusLabel} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={crawlAgain} disabled={crawling || building} className={btn} title={building ? "Wait for the current build to finish" : "Crawl the website again and rebuild the chatbot"}>
            <RefreshCw className={`h-4 w-4 ${crawling ? "animate-spin" : ""}`} aria-hidden /> Crawl again
          </button>
          <a href={data.crmUrl} target="_blank" rel="noopener noreferrer" className={btn}>
            <ExternalLink className="h-4 w-4" aria-hidden /> Open in Chatbot CRM
          </a>
        </div>
      </div>

      {notice && <p className="rounded-xl border border-border bg-muted/40 px-4 py-2.5 text-[13px]">{notice}</p>}
      {error && <p className="text-[13px] text-red-600 dark:text-red-400">{error}</p>}
      {chatbot.suspended && (
        <p className="rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-2.5 text-[13px]">
          <b className="font-medium">Suspended.</b> {chatbot.suspendedReason || "The chatbot doesn't answer visitors until it's switched back on in the CRM."}
        </p>
      )}

      {/* The demo page holds both the chat and the client report (with its PDF download). */}
      <section className={card}>
        <h2 className="text-[15px] font-semibold tracking-tight">Demo and client report</h2>
        {link ? (
          <>
            <p className="mt-1 text-[13px] text-muted-foreground">The client&apos;s demo page, at FreeSERP&apos;s address: they can chat with their chatbot and open or download their report.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="h-9 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-[13px]" aria-label="Demo link" />
              <button type="button" onClick={copyDemo} className={btn}>
                {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} {copied ? "Copied" : "Copy"}
              </button>
              <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand px-3.5 text-[13px] font-semibold text-white hover:bg-brand-deep">
                <ExternalLink className="h-4 w-4" aria-hidden /> Open demo
              </a>
            </div>
          </>
        ) : (
          <p className="mt-1 text-[13px] text-muted-foreground">
            {building
              ? "The chatbot is still being built. The demo link appears here once it passes its quality test."
              : chatbot.status === "failed"
                ? "The build didn't finish. Crawl again, or open it in the Chatbot CRM to see why."
                : "No live demo link yet. Publish the chatbot in the Chatbot CRM to get one."}
          </p>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className={card}>
          <h2 className="text-[15px] font-semibold tracking-tight">Chatbot</h2>
          <Facts
            rows={[
              ["Status", chatbot.suspended ? "Suspended" : chatbot.statusLabel],
              ["Last trained", day(chatbot.lastTrainedAt)],
              ["Demo link", chatbot.demoEnabled ? "On" : "Off"],
              ["Answers in", language],
            ]}
          />
        </section>

        <section className={card}>
          <h2 className="text-[15px] font-semibold tracking-tight">Website crawl</h2>
          {run ? (
            <Facts
              rows={[
                ["Latest run", `${run.status}${run.stage && run.stage !== run.status ? ` · ${run.stage}` : ""}`],
                ["Pages read", `${crawl.pages.fetched} of ${crawl.pages.total}`],
                ["Failed / skipped", `${crawl.pages.failed} / ${crawl.pages.skipped}`],
                ["Still to read", String(crawl.pages.pending)],
                ["Finished", run.finishedAt ? day(run.finishedAt) : building ? "In progress" : "—"],
              ]}
            />
          ) : (
            <p className="mt-2 text-[13px] text-muted-foreground">Not crawled yet. Use Crawl again to start.</p>
          )}
          {run?.lastError && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{run.lastError}</p>}
        </section>

        <section className={card}>
          <h2 className="text-[15px] font-semibold tracking-tight">Quality test</h2>
          {quality ? (
            <Facts
              rows={[
                ["Result", quality.status],
                ["Score", quality.score != null ? `${Math.round(quality.score)}% (pass at ${Math.round(quality.threshold)}%)` : "—"],
                ["Questions passed", `${quality.passed} of ${quality.total}`],
                ["Tested", day(quality.finishedAt)],
              ]}
            />
          ) : (
            <p className="mt-2 text-[13px] text-muted-foreground">Runs by itself once the chatbot is trained.</p>
          )}
          {quality?.error && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{quality.error}</p>}
        </section>
      </div>

      <section className={card}>
        <h2 className="text-[15px] font-semibold tracking-tight">Client details</h2>
        <Facts
          rows={[
            ["About", client.description || "—"],
            ["Contact email", client.contactEmail || "—"],
            ["Contact phone", client.contactPhone || "—"],
            ["Country", client.country || "—"],
            ["Added", day(client.createdAt)],
          ]}
        />
        <p className="mt-3 text-xs text-muted-foreground">
          To edit these, or to work on the chatbot&apos;s knowledge, settings, tests and conversations, open it in the Chatbot CRM.
        </p>
      </section>
    </div>
  )
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="mt-3 space-y-2 text-[13px]">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[130px_minmax(0,1fr)] gap-3">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="break-words first-letter:uppercase">{v}</dd>
        </div>
      ))}
    </dl>
  )
}
