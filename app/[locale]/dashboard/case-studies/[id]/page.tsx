"use client"

import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { AlertTriangle, ArrowLeft, BookOpenCheck, Check, CheckCircle2, Copy, ExternalLink, Loader2, Trash2 } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { api, ApiError, errorReason } from "@/lib/api"
import { caseStudyUrl, slugify, type CaseStudy } from "@/lib/case-studies"

const box =
  "flex h-11 items-center rounded-xl border border-border bg-background px-3 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20"
const inputCls = "h-full w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground sm:text-sm"
const areaCls =
  "min-h-[120px] w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-base outline-none focus:border-brand sm:text-[13px] focus:ring-2 focus:ring-brand/20"
const labelCls = "mb-1.5 block text-xs font-medium text-muted-foreground"

const EMPTY = {
  agencyName: "Zoot",
  agency: "zoot",
  name: "",
  slug: "",
  address: "",
  website: "",
  rankBeforeUrl: "",
  rankAfterUrl: "",
  growthReportUrl: "",
  growthBeforeUrl: "",
  citations: "",
  hiddenSites: "",
  ownSites: "",
  qrUrl: "",
  hideQr: false,
}
type Form = typeof EMPTY
type TextKey = Exclude<keyof Form, "hideQr">

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean)

function toForm(c: CaseStudy): Form {
  const d = c.details
  return {
    agencyName: d.agencyName,
    agency: c.agency,
    name: c.name,
    slug: c.slug,
    address: d.address ?? "",
    website: d.website,
    rankBeforeUrl: d.rankBeforeUrl ?? "",
    rankAfterUrl: d.rankAfterUrl ?? "",
    growthReportUrl: d.growthReportUrl ?? "",
    growthBeforeUrl: d.growthBeforeUrl ?? "",
    citations: d.citations.join("\n"),
    hiddenSites: d.hiddenSites.join("\n"),
    ownSites: d.ownSites ? String(d.ownSites) : "",
    qrUrl: d.qrUrl ?? "",
    hideQr: d.hideQr ?? false,
  }
}

export default function CaseStudyEditor() {
  const { id } = useParams<{ id: string }>()
  const isNew = id === "new"
  const router = useRouter()
  const { user, loading } = useAuth()
  const [form, setForm] = useState<Form>(EMPTY)
  const [saved, setSaved] = useState<CaseStudy | null>(null)
  const [loaded, setLoaded] = useState(isNew)
  // New case study: the link follows the names until it's edited by hand.
  const [linkEdited, setLinkEdited] = useState(!isNew)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!user?.inhouse || isNew) return
    api.get<{ caseStudy: CaseStudy }>(`/api/case-studies/${encodeURIComponent(id)}`).then(
      (r) => {
        setSaved(r.caseStudy)
        setForm(toForm(r.caseStudy))
        setLoaded(true)
      },
      (e) => {
        setError(errorReason(e, "The case study couldn't be loaded."))
        setLoaded(true)
      },
    )
  }, [user?.inhouse, id, isNew])

  const set = (k: TextKey) => (v: string) =>
    setForm((f) => {
      const next = { ...f, [k]: v }
      if (!linkEdited && k === "agencyName") next.agency = slugify(v)
      if (!linkEdited && k === "name") next.slug = slugify(v)
      return next
    })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError("")
    setFieldErrors({})
    const body = {
      agencyName: form.agencyName.trim(),
      agency: form.agency.trim(),
      name: form.name.trim(),
      slug: form.slug.trim(),
      address: form.address.trim(),
      website: form.website.trim(),
      rankBeforeUrl: form.rankBeforeUrl.trim(),
      rankAfterUrl: form.rankAfterUrl.trim(),
      growthReportUrl: form.growthReportUrl.trim(),
      growthBeforeUrl: form.growthBeforeUrl.trim(),
      citations: lines(form.citations),
      hiddenSites: lines(form.hiddenSites),
      ownSites: Number(form.ownSites) || 0,
      qrUrl: form.qrUrl.trim(),
      hideQr: form.hideQr,
    }
    try {
      const r = isNew
        ? await api.post<{ caseStudy: CaseStudy }>("/api/case-studies", body)
        : await api.put<{ caseStudy: CaseStudy }>(`/api/case-studies/${encodeURIComponent(id)}`, body)
      setSaved(r.caseStudy)
      setForm(toForm(r.caseStudy))
      setLinkEdited(true)
      if (isNew) router.replace(`/dashboard/case-studies/${r.caseStudy.id}`)
    } catch (err) {
      const fe = err instanceof ApiError ? (err.details as { fieldErrors?: Record<string, string[]> } | undefined)?.fieldErrors : undefined
      if (fe && Object.keys(fe).length) {
        setFieldErrors(fe)
        setError("Some fields need fixing; see the notes in red.")
      } else setError(errorReason(err, "The case study couldn't be saved."))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!saved || !window.confirm(`Delete the case study for ${saved.name}? Its link stops working.`)) return
    setBusy(true)
    try {
      await api.delete(`/api/case-studies/${encodeURIComponent(saved.id)}`)
      router.push("/dashboard/case-studies")
    } catch (err) {
      setError(errorReason(err, "The case study couldn't be deleted."))
      setBusy(false)
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

  const link = form.agency && form.slug ? caseStudyUrl(form.agency, form.slug) : ""
  const liveLink = saved ? caseStudyUrl(saved.agency, saved.slug) : ""

  const field = (k: TextKey, label: string, placeholder: string, hint?: string, type = "text") => (
    <Field label={label} hint={hint} errors={fieldErrors[k]}>
      <span className={box}>
        <input className={inputCls} type={type} placeholder={placeholder} value={form[k]} onChange={(e) => set(k)(e.target.value)} />
      </span>
    </Field>
  )

  return (
    <div className="page">
      <Link href="/dashboard/case-studies" className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All case studies
      </Link>
      <div className="page-h">
        <div>
          <h1 className="flex items-center gap-2">
            <BookOpenCheck className="h-6 w-6 text-brand" aria-hidden /> {isNew ? "New case study" : saved?.name ?? "Case study"}
          </h1>
          <div className="sub">Saving reads the rank and growth reports and stores their numbers, so the page keeps working after report links expire. Save again any time to refresh them.</div>
        </div>
      </div>

      {!loaded ? (
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          {saved && (
            <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Client link</p>
                <p className="truncate font-mono text-[13px]">{liveLink}</p>
                {saved.snapshotError ? (
                  <p className="mt-1 flex items-start gap-1.5 text-[13px] text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    The reports couldn&apos;t be read: {saved.snapshotError} The page keeps the numbers from the last good read.
                  </p>
                ) : saved.snapshotAt ? (
                  <p className="mt-1 flex items-center gap-1.5 text-[13px] text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" aria-hidden /> Report numbers pulled {new Date(saved.snapshotAt).toLocaleString()}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-2 *:flex-1 *:justify-center sm:*:flex-none">
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(liveLink).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-600" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} {copied ? "Copied" : "Copy link"}
                </button>
                <a href={liveLink} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-3 text-sm font-semibold text-white hover:bg-brand-deep">
                  Open page <ExternalLink className="h-4 w-4" aria-hidden />
                </a>
              </div>
            </section>
          )}

          <Card title="Business">
            <div className="grid gap-4 sm:grid-cols-2">
              {field("name", "Business name", "Ci Siamo")}
              {field("website", "Website", "https://www.cisiamo.com/")}
              <div className="sm:col-span-2">{field("address", "Address", "440 W 33rd St Ste 100, New York, NY 10001, United States")}</div>
              {field("agencyName", "Agency (shown on the page)", "Zoot")}
            </div>
          </Card>

          <Card title="Page link" description="The client opens this link. Lowercase letters, numbers and dashes only.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Agency part" errors={fieldErrors.agency}>
                <span className={box}>
                  <input className={inputCls} value={form.agency} onChange={(e) => { setLinkEdited(true); set("agency")(e.target.value) }} placeholder="zoot" />
                </span>
              </Field>
              <Field label="Client part" errors={fieldErrors.slug}>
                <span className={box}>
                  <input className={inputCls} value={form.slug} onChange={(e) => { setLinkEdited(true); set("slug")(e.target.value) }} placeholder="ci-siamo" />
                </span>
              </Field>
            </div>
            {link && <p className="mt-3 truncate font-mono text-xs text-muted-foreground">{link}</p>}
          </Card>

          <Card title="Reports" description="The rank grids, leaderboard, audit and reviews on the page are read from these.">
            <div className="grid gap-4 sm:grid-cols-2">
              {field("rankBeforeUrl", "Before rank report", "https://localrankreports.com/reports/…", "localrankreports.com link")}
              {field("rankAfterUrl", "After rank report", "https://localrankreports.com/reports/…", "localrankreports.com link")}
              {field("growthBeforeUrl", "Before growth report (optional)", "https://app.freeserp.com/share/report/…", "A report from before the work. Shows before → after audit and AI visibility scores.")}
              {field("growthReportUrl", "After growth report (optional)", "https://app.freeserp.com/share/report/…", "The share link from Client Report Builder. Adds the audit, AI visibility, reviews and business photo.")}
            </div>
          </Card>

          <Card title="Backlinks">
            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="Local citations (shown as live links)" hint="One link per line." errors={fieldErrors.citations}>
                <textarea className={areaCls} value={form.citations} onChange={(e) => set("citations")(e.target.value)} placeholder={"https://www.yelp.com/biz/…\nhttps://www.tripadvisor.com/…"} />
              </Field>
              <Field label="Hidden sites (shown blurred, by name)" hint="One site per line." errors={fieldErrors.hiddenSites}>
                <textarea className={areaCls} value={form.hiddenSites} onChange={(e) => set("hiddenSites")(e.target.value)} placeholder={"Trustpilot\nFoursquare\nLocal Yahoo"} />
              </Field>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {field("ownSites", "Our websites (count)", "25", "Shown as “+ N sites from our private network”.", "number")}
            </div>
          </Card>

          <Card title="Review QR code">
            {field("qrUrl", "QR code link (optional)", "https://g.page/r/…/review", "Best: the client's Google review link. Empty: their Google Maps listing.")}
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.hideQr} onChange={(e) => setForm((f) => ({ ...f, hideQr: e.target.checked }))} className="h-4 w-4 accent-brand" />
              Hide the QR code on this client&apos;s page
            </label>
          </Card>

          {error && (
            <p role="alert" className="text-[13px] text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-3 *:justify-center sm:flex-row sm:items-center sm:justify-between">
            {saved ? (
              <button type="button" onClick={remove} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 dark:hover:bg-red-950/30">
                <Trash2 className="h-4 w-4" aria-hidden /> Delete
              </button>
            ) : (
              <span className="hidden sm:block" />
            )}
            <button type="submit" disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {busy ? "Saving and reading the reports…" : isNew ? "Create case study" : "Save and refresh numbers"}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function Card({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Field({ label, hint, errors, children }: { label: string; hint?: string; errors?: string[]; children: ReactNode }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {children}
      {errors?.length ? <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{errors.join(" ")}</span> : hint ? <span className="mt-1 block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  )
}
