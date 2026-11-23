import type { Metadata } from "next"
import type React from "react"
import { notFound } from "next/navigation"
import { ExternalLink, FileText, Link2, MapPin, QrCode, Star } from "lucide-react"
import { AGENCIES } from "../../../case-studies"

type Props = { params: Promise<{ agency: string; client: string }> }

function find(agency: string, client: string) {
  const a = Object.hasOwn(AGENCIES, agency) ? AGENCIES[agency] : undefined
  const study = a && Object.hasOwn(a.clients, client) ? a.clients[client] : undefined
  return a && study ? { agencyName: a.name, study } : null
}

const host = (url: string) => new URL(url).hostname.replace(/^www\./, "")

// Shared with clients by link only: never indexed.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { agency, client } = await params
  const found = find(agency, client)
  return {
    title: found ? `${found.study.name} · Case study` : "Case study",
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  }
}

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
        <Icon className="h-4 w-4 text-brand" aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  )
}

export default async function CaseStudyPage({ params }: Props) {
  const { agency, client } = await params
  const found = find(agency, client)
  if (!found) notFound()
  const { agencyName, study: s } = found

  const qrTarget =
    s.qrUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.name}, ${s.address}`)}`
  // ponytail: third-party QR image; swap for a local generator if this needs to work offline.
  const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(qrTarget)}`

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <header className="rounded-2xl border border-border bg-card p-6">
          <p className="text-xs font-medium uppercase tracking-wider text-brand">Case study · {agencyName}</p>
          <h1 className="mt-1 text-3xl font-bold">{s.name}</h1>
          <p className="mt-2 flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {s.address}
          </p>
          <a href={s.website} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm text-brand hover:underline">
            {host(s.website)} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </header>

        {s.beforeAfter?.length ? (
          <Section icon={Star} title="Before & after">
            <div className="flex flex-col gap-6">
              {s.beforeAfter.map((p, i) => (
                <figure key={i}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(["before", "after"] as const).map((k) => (
                      <div key={k}>
                        <p className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">{k}</p>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p[k]} alt={`${s.name} ${k}`} className="w-full rounded-xl border border-border" />
                      </div>
                    ))}
                  </div>
                  {p.caption && <figcaption className="mt-2 text-sm text-muted-foreground">{p.caption}</figcaption>}
                </figure>
              ))}
            </div>
          </Section>
        ) : null}

        {s.auditReportUrl && (
          <Section icon={FileText} title="Audit report">
            <a href={s.auditReportUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-deep">
              View full audit report <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          </Section>
        )}

        <Section icon={Link2} title="Backlink sample">
          <h3 className="mb-2 text-sm font-semibold">Local citations</h3>
          <ul className="mb-5 flex flex-col gap-2">
            {s.citations.map((url) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 text-sm hover:border-brand">
                  <span className="font-medium">{host(url)}</span>
                  <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
          <h3 className="mb-2 text-sm font-semibold">Hidden sites</h3>
          <ul className="flex flex-wrap gap-2">
            {s.hiddenSites.map((name) => (
              <li key={name} className="rounded-full border border-border px-3 py-1 text-sm">{name}</li>
            ))}
            {s.ownSites ? (
              <li className="rounded-full bg-brand/10 px-3 py-1 text-sm font-medium text-brand">+ {s.ownSites} of our websites</li>
            ) : null}
          </ul>
        </Section>

        {s.reviews && (
          <Section icon={Star} title="Review management">
            <div className="grid grid-cols-2 gap-3">
              {(["before", "after"] as const).map((k) => (
                <div key={k} className="rounded-xl border border-border p-4">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">{k}</p>
                  <p className="mt-1 text-2xl font-bold">{s.reviews![k].rating.toFixed(1)} ★</p>
                  <p className="text-sm text-muted-foreground">{s.reviews![k].count} reviews</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section icon={QrCode} title="Review QR code">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrImg} alt={`QR code for ${s.name}`} width={180} height={180} className="rounded-xl border border-border bg-white" />
            <p className="text-sm text-muted-foreground">
              Print this at the counter or on receipts. Customers scan it to find {s.name} and leave a review.
            </p>
          </div>
        </Section>
      </div>
    </main>
  )
}
