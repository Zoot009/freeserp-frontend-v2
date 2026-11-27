"use client"

import { useState } from "react"
import { Loader2, MessageSquareReply, Sparkles } from "lucide-react"
import { Stars } from "@/components/gbp-audit/report"
import { BusinessCard, BusinessForm, CopyButton, ErrorBox, Waiting } from "@/components/gmb/business-form"
import { CreditCost } from "@/components/dashboard/credit-cost"
import { CREDIT_ACTION_KEYS } from "@/lib/credits"
import { CACHE_DAYS, fmtDay, type Review } from "@/lib/gbp-audit"
import { askUntilReady, errorOf, GBP_MANAGE_URL, useGmbRun, type Reply, type ReviewList } from "@/lib/gmb"

type Result = Omit<ReviewList, "status" | "ref" | "business">
type Filter = "all" | "unanswered" | "negative"
const FILTERS: { key: Filter; label: string; test: (r: Review) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  { key: "unanswered", label: "Needs a reply", test: (r) => !r.ownerAnswer },
  { key: "negative", label: "3★ and under", test: (r) => r.rating != null && r.rating <= 3 },
]

const pct = (n: number | null) => (n == null ? "–" : `${Math.round(n * 100)}%`)
const hours = (h: number | null | undefined) => (h == null ? "–" : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`)

export default function ReviewManagerPage() {
  const { data, busy, error, run } = useGmbRun<Result>("/api/gmb/reviews")
  const [filter, setFilter] = useState<Filter>("unanswered")
  const s = data?.stats
  const shown = data ? data.reviews.filter(FILTERS.find((f) => f.key === filter)!.test) : []

  return (
    <div className="page space-y-4">
      <div className="page-h">
        <div>
          <h1>GMB Review Manager</h1>
          <div className="sub">
            Paste a Google Business Profile link to see its newest reviews: which need a reply, and how fast you answer. AI drafts
            a reply to any of them in your voice, for you to check and post on Google.
          </div>
        </div>
      </div>

      <BusinessForm
        keyword="none"
        busy={busy}
        busyLabel="Loading…"
        cta="Load reviews"
        costs={
          <>
            <span className="inline-flex items-center gap-1.5">
              The 50 newest reviews <CreditCost action={CREDIT_ACTION_KEYS.gmbReviews} />, free again for {CACHE_DAYS} days
            </span>
            <span className="inline-flex items-center gap-1.5">
              Each AI reply <CreditCost action={CREDIT_ACTION_KEYS.gmbReviewReply} showBalance={false} />
            </span>
          </>
        }
        onSubmit={({ url }) => void run({ url })}
      />
      <ErrorBox error={error} />
      {busy && <Waiting>Fetching the newest reviews from Google. This takes up to a minute the first time.</Waiting>}

      {data && s && !busy && (
        <>
          <BusinessCard business={data.business} />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Replied to" value={pct(s.responseRate)} note={`of the ${s.sampled} newest`} />
            <Stat label="Negative, no reply" value={String(s.negativeUnanswered)} note={`of ${s.negative} at 3★ or under`} tone={s.negativeUnanswered ? "bad" : undefined} />
            <Stat label="Typical reply time" value={hours(s.medianReplyHours)} note="median, where replied" />
            <Stat label="Last 30 days" value={s.last30 ? `${s.last30.atLeast ? "≥" : ""}${s.last30.count}` : "–"} note="new reviews" />
          </div>

          <div className="flex flex-wrap gap-1.5" role="tablist">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filter === f.key ? "border-brand bg-brand text-white" : "border-border bg-card hover:bg-muted"}`}
              >
                {f.label} ({data.reviews.filter(f.test).length})
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {shown.length ? (
              shown.map((r, i) => <ReviewRow key={`${filter}-${i}-${r.publishedAt}`} review={r} businessRef={data.ref} replyUrl={data.business.mapsUrl ?? GBP_MANAGE_URL} />)
            ) : (
              <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">Nothing here. Every review in this list has a reply.</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "bad" }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold tabular-nums ${tone === "bad" ? "text-red-600" : ""}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{note}</div>
    </div>
  )
}

function ReviewRow({ review: r, businessRef, replyUrl }: { review: Review; businessRef: string; replyUrl: string }) {
  const [draft, setDraft] = useState("")
  const [instruction, setInstruction] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ReturnType<typeof errorOf> | null>(null)

  const write = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await askUntilReady<Omit<Reply, "status" | "ref" | "business">>("/api/gmb/reviews/reply", {
        url: businessRef,
        review: { author: r.author, rating: r.rating, text: r.text },
        instruction: instruction.trim() || null,
      })
      if (res) setDraft(res.reply)
    } catch (err) {
      setError(errorOf(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="rounded-2xl border border-border bg-card p-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {r.rating != null && <Stars value={r.rating} />}
        <b className="text-[13px] font-medium">{r.author ?? "A Google user"}</b>
        {r.localGuide && <span className="rounded bg-muted px-1.5 py-px text-[11px] text-muted-foreground">Local Guide</span>}
        <span className="text-xs text-muted-foreground">{r.publishedAt ? fmtDay(r.publishedAt) : r.timeAgo}</span>
      </header>
      {r.text ? <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed">{r.text}</p> : <p className="mt-2 text-xs italic text-muted-foreground">A rating with no text.</p>}
      {r.ownerAnswer && (
        <div className="mt-3 rounded-xl bg-muted/60 px-3 py-2 text-[13px]">
          <div className="text-[11px] font-medium text-muted-foreground">Owner&apos;s reply{r.ownerAnsweredAt ? ` · ${fmtDay(r.ownerAnsweredAt)}` : ""}</div>
          <p className="whitespace-pre-line">{r.ownerAnswer}</p>
        </div>
      )}

      {draft ? (
        <div className="mt-3 space-y-2">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} className="w-full rounded-xl border border-border bg-background p-3 text-[13px] leading-relaxed outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <CopyButton text={draft} label="Copy reply" />
            <a href={replyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline">
              <MessageSquareReply className="h-3.5 w-3.5" aria-hidden /> Reply on Google
            </a>
            <input
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              maxLength={300}
              placeholder="Change it: e.g. shorter, mention the new opening hours"
              className="h-8 min-w-[220px] flex-1 rounded-lg border border-border bg-background px-2.5 text-xs outline-none focus:border-brand"
            />
            <button type="button" onClick={write} disabled={busy} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline disabled:opacity-60">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />} Rewrite
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={write}
          disabled={busy}
          className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5 text-brand" aria-hidden />}
          {busy ? "Writing…" : r.ownerAnswer ? "Draft a new reply" : "Draft a reply"}
        </button>
      )}
      {error && (
        <div className="mt-2">
          <ErrorBox error={error} />
        </div>
      )}
    </article>
  )
}
