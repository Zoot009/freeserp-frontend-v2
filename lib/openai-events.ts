import "server-only"

// OpenAI Conversions API (server-side ad attribution).
//
// The browser pixel (oaiq) lives on the marketing site, freeserp-ui — it never
// loads here, so the app funnel has no client-side signal at all. Registration
// completes in THIS app, which is why the conversion is reported server-to-
// server instead: same pixel property, opposite direction.
//
// Server-side is also the only option that keeps OPENAI_EVENTS_API_KEY out of
// the bundle. Nothing in this module may be imported from a "use client" file;
// the `server-only` import above turns that mistake into a build error rather
// than a leaked key.

const ENDPOINT = "https://bzr.openai.com/v1/events"

// Not a secret — it ships in the browser snippet on freeserp-ui. Env-overridable
// so a staging deployment can point at a different property, with the production
// property as the fallback so no config is needed for the common case.
const DEFAULT_PIXEL_ID = "7iq3PsaY5c9VB87YLnXeoH"

// A conversion is worth a moment, not a hung request. Signup already completed
// by the time we report it, so the caller's response must not wait on OpenAI.
const TIMEOUT_MS = 4000

// Whitelisted rather than free-form: the event type reaches this from a public
// route handler, and OpenAI bills attribution against whatever we send.
export const EVENT_TYPES = ["registration_completed"] as const
export type OpenAiEventType = (typeof EVENT_TYPES)[number]

export function isEventType(value: unknown): value is OpenAiEventType {
  return typeof value === "string" && (EVENT_TYPES as readonly string[]).includes(value)
}

export type SendEventArgs = {
  type: OpenAiEventType
  /** Dedupe key. OpenAI collapses repeats, so a retry of the same conversion must reuse it. */
  id: string
  /** The page the conversion happened on. */
  sourceUrl: string
  timestampMs?: number
  /** Ask OpenAI to validate the payload without recording a conversion. */
  validateOnly?: boolean
}

export type SendEventResult =
  | { ok: true; validated: boolean }
  | { ok: false; reason: "unconfigured" | "http" | "network"; status?: number }

/**
 * Report one conversion to OpenAI. Never throws — a failed conversion is a
 * reporting problem, not a user-facing one, and callers sit on paths where the
 * user's actual action has already succeeded.
 */
export async function sendOpenAiEvent(args: SendEventArgs): Promise<SendEventResult> {
  const apiKey = process.env.OPENAI_EVENTS_API_KEY
  if (!apiKey) {
    // Expected in local dev and on preview deployments. Not an error: reporting
    // is simply off until the key is set.
    return { ok: false, reason: "unconfigured" }
  }

  const pixelId = process.env.OPENAI_PIXEL_ID || DEFAULT_PIXEL_ID
  const validateOnly = args.validateOnly ?? false

  const url = new URL(ENDPOINT)
  url.searchParams.set("pid", pixelId)

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        validate_only: validateOnly,
        events: [
          {
            id: args.id,
            type: args.type,
            timestamp_ms: args.timestampMs ?? Date.now(),
            source_url: args.sourceUrl,
            action_source: "web",
            data: { type: "customer_action" },
          },
        ],
      }),
    })

    if (!res.ok) {
      // Body carries OpenAI's validation detail; without it a 400 is unactionable.
      const detail = await res.text().catch(() => "")
      console.error(
        `[openai-events] ${args.type} rejected: ${res.status} ${detail.slice(0, 500)}`,
      )
      return { ok: false, reason: "http", status: res.status }
    }

    return { ok: true, validated: validateOnly }
  } catch (err) {
    console.error(`[openai-events] ${args.type} failed:`, err)
    return { ok: false, reason: "network" }
  } finally {
    clearTimeout(timer)
  }
}
