"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bot, Loader2, Plus, X } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { api, errorReason } from "@/lib/api"
import { BUILDING, LANGUAGES, day, host, type Category, type ClientRow } from "@/lib/chatbot-builder"
import { StatusBadge } from "@/components/chatbot-builder/status-badge"

const TH = "border-b border-border px-3 py-2 text-left text-xs font-medium text-muted-foreground"
const TD = "px-3 py-2.5 align-top"
const box =
  "flex h-11 items-center rounded-xl border border-border bg-background px-3 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20"
const inputCls = "h-full w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
const label = "mb-1.5 block text-xs font-medium text-muted-foreground"

export default function ChatbotBuilderPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [tab, setTab] = useState<"active" | "archived">("active")
  const [clients, setClients] = useState<ClientRow[] | null>(null)
  const [error, setError] = useState("")
  const [adding, setAdding] = useState(false)

  const load = useCallback(() => {
    setError("")
    api.get<{ clients: ClientRow[] }>(`/api/chatbot-builder/clients${tab === "archived" ? "?archived=1" : ""}`).then(
      (r) => setClients(r.clients),
      (e) => {
        setError(errorReason(e, "The clients couldn't be loaded."))
        setClients([])
      },
    )
  }, [tab])

  useEffect(() => {
    if (!user?.inhouse) return
    setClients(null)
    load()
  }, [user?.inhouse, load])

  // Chatbots still being built: the list checks back every 15 seconds until they settle.
  useEffect(() => {
    if (!clients?.some((c) => BUILDING.includes(c.status))) return
    const t = setTimeout(load, 15_000)
    return () => clearTimeout(t)
  }, [clients, load])

  if (loading) return null
  if (!user?.inhouse) {
    return (
      <div className="page">
        <p className="text-[13px] text-muted-foreground">This page isn&apos;t available for this account.</p>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1 className="flex items-center gap-2">
            <Bot className="h-6 w-6 text-brand" aria-hidden /> Chatbot Builder
          </h1>
          <div className="sub">
            AI chatbots for client businesses, trained on their own website. Add a client and the chatbot is crawled, trained and tested for you. For the in-house team only.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-deep"
        >
          <Plus className="h-4 w-4" aria-hidden /> New client
        </button>
      </div>

      {adding && <NewClient onClose={() => setAdding(false)} onCreated={(id) => router.push(`/dashboard/chatbot-builder/${id}`)} />}

      <div className="mb-4 inline-flex rounded-xl border border-border bg-card p-1 text-[13px]">
        {(["active", "archived"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-1.5 font-medium transition-colors ${tab === t ? "bg-brand/10 text-brand" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t === "active" ? "Active" : "Archived"}
          </button>
        ))}
      </div>

      <section className="rounded-2xl border border-border bg-card">
        {error && <p className="border-b border-border px-4 py-3 text-[13px] text-red-600 dark:text-red-400">{error}</p>}
        {!clients ? (
          <p className="flex items-center gap-2 px-4 py-4 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading clients…
          </p>
        ) : clients.length === 0 ? (
          !error && (
            <p className="px-4 py-4 text-[13px] text-muted-foreground">
              {tab === "active" ? "No clients yet. Add one with New client, from the business's website." : "No archived clients."}
            </p>
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className={TH}>Client</th>
                  <th className={TH}>Website</th>
                  <th className={TH}>Category</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Demo</th>
                  <th className={TH}>Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {clients.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/40">
                    <td className={TD}>
                      <Link href={`/dashboard/chatbot-builder/${c.id}`} className="font-medium hover:text-brand hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className={`${TD} text-muted-foreground`}>{host(c.website)}</td>
                    <td className={TD}>{c.category}</td>
                    <td className={TD}>
                      <StatusBadge status={c.status} label={c.suspended ? "Suspended" : c.statusLabel} />
                    </td>
                    <td className={TD}>
                      {c.demoUrl ? (
                        <a href={c.demoUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-brand hover:underline">
                          Open
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className={`${TD} text-muted-foreground`}>{day(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function NewClient({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [form, setForm] = useState({ name: "", websiteUrl: "", categoryKey: "", language: "en", description: "", contactEmail: "", contactPhone: "" })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    api.get<{ categories: Category[] }>("/api/chatbot-builder/categories").then(
      (r) => {
        setCategories(r.categories)
        setForm((f) => (f.categoryKey ? f : { ...f, categoryKey: r.categories.find((c) => c.key === "other")?.key ?? r.categories[0]?.key ?? "" }))
      },
      (e) => {
        setError(errorReason(e, "The business categories couldn't be loaded."))
        setCategories([])
      },
    )
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.websiteUrl.trim()) return setError("Add the business name and its website.")
    if (!form.categoryKey) return setError("Choose a business category.")
    setBusy(true)
    setError("")
    try {
      const r = await api.post<{ id: string; crawlStarted: boolean; crawlError: string | null }>("/api/chatbot-builder/clients", {
        name: form.name.trim(),
        websiteUrl: form.websiteUrl.trim(),
        categoryKey: form.categoryKey,
        language: form.language,
        description: form.description.trim() || undefined,
        contactEmail: form.contactEmail.trim() || undefined,
        contactPhone: form.contactPhone.trim() || undefined,
      })
      onCreated(r.id)
    } catch (err) {
      setError(errorReason(err, "The client couldn't be added."))
      setBusy(false)
    }
  }

  const field = (k: keyof typeof form, lbl: string, placeholder: string, type = "text") => (
    <label className="block">
      <span className={label}>{lbl}</span>
      <span className={box}>
        <input className={inputCls} type={type} placeholder={placeholder} value={form[k]} onChange={(e) => set(k)(e.target.value)} />
      </span>
    </label>
  )

  return (
    <form onSubmit={submit} className="mb-6 space-y-4 rounded-2xl border border-brand/30 bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">New client</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">The website is crawled as soon as you add it; the chatbot is trained and tested from what it says.</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {field("name", "Business name", "Orlando Express Movers")}
        {field("websiteUrl", "Website", "orlandoexpressmovers.com")}
        <label className="block">
          <span className={label}>Business category</span>
          <span className={box}>
            <select className={`${inputCls} cursor-pointer`} value={form.categoryKey} onChange={(e) => set("categoryKey")(e.target.value)} disabled={!categories?.length}>
              {!categories ? <option>Loading…</option> : categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </span>
        </label>
        <label className="block">
          <span className={label}>Chatbot language</span>
          <span className={box}>
            <select className={`${inputCls} cursor-pointer`} value={form.language} onChange={(e) => set("language")(e.target.value)}>
              {LANGUAGES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </span>
        </label>
        {field("contactEmail", "Contact email (optional)", "owner@business.com", "email")}
        {field("contactPhone", "Contact phone (optional)", "+1 407 555 0100", "tel")}
      </div>
      <label className="block">
        <span className={label}>About the business (optional)</span>
        <textarea
          className="min-h-[72px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          placeholder="Anything the website doesn't say that the chatbot should know."
          value={form.description}
          onChange={(e) => set("description")(e.target.value)}
          maxLength={2000}
        />
      </label>
      {error && (
        <p role="alert" className="text-[13px] text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="h-10 rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted">
          Cancel
        </button>
        <button type="submit" disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-60">
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Add client and start the crawl
        </button>
      </div>
    </form>
  )
}
