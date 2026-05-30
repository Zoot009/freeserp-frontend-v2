// Central API client for the freeserp v2 backend.
// Talks to v2 endpoints, attaches the access token, and transparently rotates
// the refresh token on 401. Designed to be called from React via hooks or
// directly from server components.

const API_BASE =
  typeof window === "undefined"
    ? process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003"
    : process.env.NEXT_PUBLIC_API_URL || ""

const ACCESS_TOKEN_KEY = "freeserp:access_token"

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

async function readError(res: Response): Promise<ApiError> {
  let body: unknown
  try {
    body = await res.json()
  } catch {
    /* ignore */
  }
  const wrapped = (body as { error?: { code?: string; message?: string; details?: unknown } } | undefined)?.error
  const code = wrapped?.code ?? "http_error"
  const message = wrapped?.message ?? res.statusText ?? "Request failed"
  return new ApiError(message, res.status, code, wrapped?.details)
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (!res.ok) return null
      const data = (await res.json()) as { accessToken?: string }
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
  const buildHeaders = (token: string | null): HeadersInit => {
    const h: Record<string, string> = {
      "Accept": "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(headers as Record<string, string> | undefined),
    }
    if (token && !skipAuth) h["Authorization"] = `Bearer ${token}`
    return h
  }

  const doFetch = async (token: string | null): Promise<Response> =>
    fetch(buildUrl(path, query), {
      ...rest,
      credentials: "include",
      headers: buildHeaders(token),
      body: body === undefined ? undefined : JSON.stringify(body),
    })

  let res = await doFetch(skipAuth ? null : getAccessToken())

  if (res.status === 401 && !skipAuth && !skipRefresh) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      res = await doFetch(newToken)
    } else {
      setAccessToken(null)
      throw await readError(res)
    }
  }

  if (!res.ok) throw await readError(res)
  if (res.status === 204) return undefined as T
  const ct = res.headers.get("content-type") ?? ""
  if (!ct.includes("application/json")) return undefined as T
  return (await res.json()) as T
}

export const api = {
  get: <T>(path: string, opts?: RequestInitWithJson) => apiRequest<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: RequestInitWithJson) => apiRequest<T>(path, { ...opts, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestInitWithJson) => apiRequest<T>(path, { ...opts, method: "PATCH", body }),
  put: <T>(path: string, body?: unknown, opts?: RequestInitWithJson) => apiRequest<T>(path, { ...opts, method: "PUT", body }),
  delete: <T>(path: string, opts?: RequestInitWithJson) => apiRequest<T>(path, { ...opts, method: "DELETE" }),
}
