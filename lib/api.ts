// Central API client for the freeserp v2 backend.
// Talks to v2 endpoints, attaches the access token, and transparently rotates
// the refresh token on 401. Designed to be called from React via hooks or
// directly from server components.

import axios, { type AxiosResponse } from "axios"

export const API_BASE =
  typeof window === "undefined"
    ? process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003"
    : process.env.NEXT_PUBLIC_API_URL || ""

const ACCESS_TOKEN_KEY = "freeserp:access_token"

// Hard ceiling on any single request so a hung connection can never leave the
// app stuck on a loading screen — axios has no default timeout.
const REQUEST_TIMEOUT_MS = 20_000

let inMemoryAccessToken: string | null = null
let refreshPromise: Promise<string | null> | null = null

const listeners = new Set<(token: string | null) => void>()

export function subscribeToToken(fn: (token: string | null) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function notify(token: string | null) {
  for (const fn of listeners) fn(token)
}

export function getAccessToken(): string | null {
  if (inMemoryAccessToken) return inMemoryAccessToken
  if (typeof window !== "undefined") {
    const stored = window.sessionStorage.getItem(ACCESS_TOKEN_KEY)
    if (stored) {
      inMemoryAccessToken = stored
      return stored
    }
  }
  return null
}

export function setAccessToken(token: string | null) {
  inMemoryAccessToken = token
  if (typeof window !== "undefined") {
    if (token) window.sessionStorage.setItem(ACCESS_TOKEN_KEY, token)
    else window.sessionStorage.removeItem(ACCESS_TOKEN_KEY)
  }
  notify(token)
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(message: string, status: number, code = "unknown", details?: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
    this.details = details
  }
}

interface RequestInitWithJson extends Omit<RequestInit, "body"> {
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  skipAuth?: boolean
  skipRefresh?: boolean
}

function buildUrl(path: string, query?: RequestInitWithJson["query"]): string {
  const url = path.startsWith("http") ? new URL(path) : new URL(`${API_BASE}${path}`, "http://placeholder")
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue
      url.searchParams.set(k, String(v))
    }
  }
  return path.startsWith("http") ? url.toString() : `${API_BASE}${url.pathname}${url.search}`
}

function readError(res: AxiosResponse): ApiError {
  // axios has already parsed the body into `res.data` (an object for JSON
  // responses, a string otherwise); tolerate both shapes.
  const body = res.data
  const wrapped = (body as { error?: { code?: string; message?: string; details?: unknown } } | undefined)?.error
  const code = wrapped?.code ?? "http_error"
  const message = wrapped?.message ?? res.statusText ?? "Request failed"
  return new ApiError(message, res.status, code, wrapped?.details)
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    try {
      const res = await axios.post<{ accessToken?: string }>(
        `${API_BASE}/api/auth/refresh`,
        {},
        {
          withCredentials: true,
          headers: { "Content-Type": "application/json" },
          validateStatus: () => true,
          timeout: REQUEST_TIMEOUT_MS,
        },
      )
      if (res.status < 200 || res.status >= 300) return null
      const data = res.data
      if (data.accessToken) {
        setAccessToken(data.accessToken)
        return data.accessToken
      }
      return null
    } catch {
      return null
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

export async function apiRequest<T = unknown>(path: string, init: RequestInitWithJson = {}): Promise<T> {
  const { body, query, skipAuth, skipRefresh, headers, ...rest } = init
  const buildHeaders = (token: string | null): Record<string, string> => {
    const h: Record<string, string> = {
      "Accept": "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(headers as Record<string, string> | undefined),
    }
    if (token && !skipAuth) h["Authorization"] = `Bearer ${token}`
    return h
  }

  // axios serializes an object `data` to JSON itself (Content-Type is set
  // above), so we hand it the raw body rather than a pre-stringified string.
  const doRequest = async (token: string | null): Promise<AxiosResponse> =>
    axios.request({
      url: buildUrl(path, query),
      method: (rest.method as string | undefined) ?? "GET",
      signal: rest.signal as AbortSignal | undefined,
      withCredentials: true,
      headers: buildHeaders(token),
      data: body === undefined ? undefined : body,
      timeout: REQUEST_TIMEOUT_MS,
      validateStatus: () => true,
    })

  let res = await doRequest(skipAuth ? null : getAccessToken())

  if (res.status === 401 && !skipAuth && !skipRefresh) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      res = await doRequest(newToken)
    } else {
      /**
       * Refresh failed too, so the session is genuinely over.
       *
       * This used to clear the token and throw, and nothing was listening. The
       * throw travelled up through whatever component was fetching, hit React's
       * error boundary, and rendered "This page couldn't load" — which reads as
       * the product being broken rather than as a login having expired. Every
       * page did it, because every page fetches something, so an expired
       * session looked like a total outage.
       *
       * Sending to login is the honest end of a session. The current path goes
       * along so the user returns to where they were, and the redirect happens
       * once even if a dozen parallel requests all 401 together.
       */
      setAccessToken(null)
      if (typeof window !== "undefined" && !window.location.pathname.includes("/login")) {
        const from = window.location.pathname + window.location.search
        window.location.href = `/login?next=${encodeURIComponent(from)}`
      }
      throw readError(res)
    }
  }

  if (res.status < 200 || res.status >= 300) {
    const err = readError(res)
    // Global paywall signal: any 402 (quota exhausted, trial ended, plan limit
    // reached) also fires an event so the dashboard's upsell modal can offer the
    // upgrade path. Callers still receive the throw and keep their own handling.
    if (res.status === 402 && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("billing:quota", {
          detail: { code: err.code, message: err.message, details: err.details },
        }),
      )
    }
    throw err
  }
  if (res.status === 204) return undefined as T
  const ct = (res.headers["content-type"] as string | undefined) ?? ""
  if (!ct.includes("application/json")) return undefined as T
  return res.data as T
}

export const api = {
  get: <T>(path: string, opts?: RequestInitWithJson) => apiRequest<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: RequestInitWithJson) => apiRequest<T>(path, { ...opts, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestInitWithJson) => apiRequest<T>(path, { ...opts, method: "PATCH", body }),
  put: <T>(path: string, body?: unknown, opts?: RequestInitWithJson) => apiRequest<T>(path, { ...opts, method: "PUT", body }),
  delete: <T>(path: string, opts?: RequestInitWithJson) => apiRequest<T>(path, { ...opts, method: "DELETE" }),
}
