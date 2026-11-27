"use client"

import { Panel, Notice, CheckRow } from "@/components/gbp-audit/report"
import { BusinessCard, BusinessForm, CopyButton, ErrorBox, Waiting } from "@/components/gmb/business-form"
import { CreditCost } from "@/components/dashboard/credit-cost"
import { CREDIT_ACTION_KEYS } from "@/lib/credits"
import { GBP_MANAGE_URL, useGmbRun, type Optimized } from "@/lib/gmb"

type Result = Omit<Optimized, "status" | "ref" | "business">
const DESCRIPTION_MAX = 750

export default function ProfileOptimizerPage() {
  const { data, busy, error, run } = useGmbRun<Result>("/api/gmb/optimize")
  const s = data?.suggestions

  return (
    <div className="page space-y-4">
      <div className="page-h">
        <div>
          <h1>GMB Profile Optimizer</h1>
          <div className="sub">
            Paste a Google Business Profile link and the keyword you want to be found for. We read the live listing and who ranks
            around it, then write the fixes for you to paste into Google: a new description, the categories your competitors use,
            and the services to list.
          </div>
        </div>
      </div>

      <BusinessForm
        keyword="optional"
        busy={busy}
        busyLabel="Optimizing…"
        cta="Optimize profile"
        costs={
          <span className="inline-flex items-center gap-1.5">
            Each optimization <CreditCost action={CREDIT_ACTION_KEYS.gmbOptimize} />. No keyword? We use the primary category.
          </span>
        }
        onSubmit={({ url, keyword }) => void run({ url, keyword: keyword || null })}
      />
      <ErrorBox error={error} />
      {busy && <Waiting>Reading the listing and searching Google Maps around it. The first look at a business takes up to a minute.</Waiting>}

      {data && s && !busy && (
        <>
          <BusinessCard business={data.business}>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
              {data.rank ? `#${data.rank}` : "Not in the top 20"} for “{data.keyword}” at its own address
            </span>
          </BusinessCard>
          {s.nameWarning && <Notice>{s.nameWarning}</Notice>}

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="New description" meta={<CopyButton text={s.description} />} hint="Google allows 750 characters. The keyword comes first, then what you do, for whom and where.">
              <p className="whitespace-pre-line text-[13px] leading-relaxed">{s.description}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {s.description.length}/{DESCRIPTION_MAX} characters
              </p>
              {data.business.description && (
                <details className="mt-3 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Current description</summary>
                  <p className="mt-1 whitespace-pre-line">{data.business.description}</p>
                </details>
              )}
            </Panel>

            <div className="space-y-4">
              <Panel title="Categories to add" hint="Categories the businesses ranking around you use and you don't. Add only the ones that describe what you really do.">
                {s.categories.length ? (
                  <ul className="space-y-2.5">
                    {s.categories.map((c) => (
                      <li key={c.name} className="text-[13px]">
                        <b className="font-medium">{c.name}</b>{" "}
                        <span className="text-xs text-muted-foreground">
                          used by {c.count} of the top 10 around you
                        </span>
                        {c.why && <p className="text-xs text-muted-foreground">{c.why}</p>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-muted-foreground">Nothing to add: the businesses around you use the categories you already have.</p>
                )}
              </Panel>
              <Panel title="Services to list" meta={s.services.length ? <CopyButton text={s.services.join("\n")} label="Copy all" /> : undefined}>
                <div className="flex flex-wrap gap-1.5">
                  {s.services.map((x) => (
                    <span key={x} className="rounded-full border border-border px-2.5 py-1 text-xs">
                      {x}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Add the ones you offer under Edit profile → Services.</p>
              </Panel>
            </div>
          </div>

          <Panel title="Profile checks" flush hint="The Google Maps Audit's checks for the listing itself. Run the full audit for reviews, website and citations.">
            <div className="divide-y divide-border">
              {data.checks.map((c) => (
                <CheckRow key={c.id} check={c} />
              ))}
            </div>
          </Panel>

          <Panel title={`Who ranks for “${data.keyword}” around you`} flush>
            <ol className="divide-y divide-border">
              {data.competitors.map((c) => (
                <li key={`${c.rank}-${c.title}`} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                  <span className="w-6 shrink-0 text-xs tabular-nums text-muted-foreground">#{c.rank}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{c.title}</span>
                  <span className="hidden truncate text-xs text-muted-foreground sm:block">{c.category}</span>
                  {c.rating != null && (
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      ★ {c.rating.toFixed(1)} ({c.reviewCount ?? 0})
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </Panel>

          <p className="text-xs text-muted-foreground">
            Make the changes in{" "}
            <a href={GBP_MANAGE_URL} target="_blank" rel="noreferrer" className="font-medium text-brand hover:underline">
              Google Business Profile
            </a>{" "}
            → Edit profile. Google can take a few days to review an edit.
          </p>
        </>
      )}
    </div>
  )
}
