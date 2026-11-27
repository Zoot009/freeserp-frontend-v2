"use client"

import { useEffect, useState } from "react"
import { PostCard } from "@/components/report-builder/post-card"
import { BusinessCard, BusinessForm, ErrorBox, Waiting } from "@/components/gmb/business-form"
import { CreditCost } from "@/components/dashboard/credit-cost"
import { CREDIT_ACTION_KEYS } from "@/lib/credits"
import { askUntilReady, errorOf, GBP_MANAGE_URL, useGmbRun, type PostSet } from "@/lib/gmb"

type Result = Omit<PostSet, "status" | "ref" | "business">
/** How often a photo being made is checked on. */
const PHOTO_POLL_MS = 5_000

export default function PostCreatorPage() {
  const { data, setData, busy, error, run } = useGmbRun<Result>("/api/gmb/posts")
  const [acting, setActing] = useState(false)
  const [actionError, setActionError] = useState<ReturnType<typeof errorOf> | null>(null)

  /** Ask again about the same set: to rewrite a post, start a photo, or see how the photos are going. */
  const again = async (extra: Record<string, unknown> = {}, quiet = false) => {
    if (!data) return
    if (!quiet) setActing(true)
    setActionError(null)
    try {
      const res = await askUntilReady<Result>("/api/gmb/posts", { url: data.ref, keyword: data.keyword, ...extra })
      if (res) setData(res)
    } catch (err) {
      if (!quiet) setActionError(errorOf(err))
    } finally {
      if (!quiet) setActing(false)
    }
  }

  const making = data?.posts.some((p) => p.image === "pending")
  useEffect(() => {
    if (!making) return
    const t = setTimeout(() => void again({}, true), PHOTO_POLL_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-armed by each answer while a photo is being made
  }, [data])

  return (
    <div className="page space-y-4">
      <div className="page-h">
        <div>
          <h1>GMB Post Creator</h1>
          <div className="sub">
            Paste a Google Business Profile link and the keyword the post is about. AI writes three posts around it from the
            listing&apos;s own facts, each with a title and a description, on the business&apos;s own photo, or an AI photo made in
            its style.
          </div>
        </div>
      </div>

      <BusinessForm
        busy={busy}
        busyLabel="Writing…"
        cta="Write posts"
        costs={
          <>
            <span className="inline-flex items-center gap-1.5">
              Three posts <CreditCost action={CREDIT_ACTION_KEYS.gmbPost} units={3} />
            </span>
            {data?.imagesAvailable !== false && (
              <span className="inline-flex items-center gap-1.5">
                AI photo, only when you ask for one <CreditCost action={CREDIT_ACTION_KEYS.gmbPostImage} showBalance={false} />
              </span>
            )}
          </>
        }
        onSubmit={(v) => void run(v)}
      />
      <ErrorBox error={error ?? actionError} />
      {busy && <Waiting>Reading the listing and writing three posts. The first look at a business takes up to a minute.</Waiting>}

      {data && !busy && (
        <>
          <BusinessCard business={data.business} />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.posts.map((post, i) => (
              <PostCard
                key={post.id ?? i}
                post={post}
                index={i}
                business={data.business}
                actions={{
                  busy: acting,
                  regenerate: (n) => void again({ regenerate: n }),
                  reload: () => void again({}),
                  retryImages: () => void again({ image: i }),
                  ...(data.imagesAvailable && { createImage: (n: number) => void again({ image: n }) }),
                }}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            To publish: copy the text, download the picture, then add an update in{" "}
            <a href={GBP_MANAGE_URL} target="_blank" rel="noreferrer" className="font-medium text-brand hover:underline">
              Google Business Profile
            </a>
            . Google shows no title on an update, so the title is on the picture and is the first line of the copied text.
          </p>
        </>
      )}
    </div>
  )
}
