import { NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { isEventType, sendOpenAiEvent } from "@/lib/openai-events"

// Browser-facing edge of the OpenAI Conversions API (see lib/openai-events.ts).
//
// This is a LOCAL Next route, reached from the client with a same-origin
// `fetch("/api/openai-event")` rather than via lib/api — NEXT_PUBLIC_API_URL
// points the `api` client straight at the backend, which knows nothing about
// this. As with /api/keyword-suggest, a filesystem route handler under /api/
// takes precedence over the /api/:path* rewrite in next.config.mjs, so this
// path is served here rather than proxied.
//
// It exists purely so OPENAI_EVENTS_API_KEY stays on the server: the payload
// itself is assembled here, and the client supplies only a dedupe id and the
// page it happened on.

// Conversions move ad spend, so this refuses to run at build time or serve a
// cached response.
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  // Same-origin gate. The endpoint is necessarily unauthenticated (the session
  // token lives with the backend, not with this Next server), so this is a
  // speed bump against drive-by conversion spam from another site, not real
  // authentication — a direct scripted POST still gets through. The event-type
  // whitelist below is the other half of that containment.
  const origin = req.headers.get("origin")
  if (origin && origin !== new URL(req.url).origin) {
    return NextResponse.json({ ok: false, error: "cross-origin" }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "invalid-json" }, { status: 400 })
  }

  const { type, id, sourceUrl } = (body ?? {}) as Record<string, unknown>

  if (!isEventType(type)) {
    return NextResponse.json({ ok: false, error: "unknown-event-type" }, { status: 400 })
  }

  const result = await sendOpenAiEvent({
    type,
    // Client-supplied so a retry of the same conversion dedupes; generated here
    // when absent so a missing id can never merge two distinct conversions into
    // one shared key.
    id: typeof id === "string" && id.length > 0 && id.length <= 200 ? id : randomUUID(),
    // Referer is the honest fallback: it is the page that actually made this call.
    sourceUrl:
      typeof sourceUrl === "string" && sourceUrl.startsWith("http")
        ? sourceUrl
        : (req.headers.get("referer") ?? new URL(req.url).origin),
  })

  // 202 either way. The caller fires this alongside a conversion that already
  // succeeded and has nothing to do with a failure; `result` is for debugging,
  // not for branching.
  return NextResponse.json(result, { status: 202 })
}
