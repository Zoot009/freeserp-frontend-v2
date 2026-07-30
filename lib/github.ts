// "Continue with GitHub" — the OAuth authorization-code flow.
//
// GitHub (unlike Google/Facebook) has no browser SDK that yields an access
// token: the token exchange needs the client SECRET and must stay server-side.
// So the browser only ever handles the one-time `code`:
//   1. startGithubLogin() → full-page redirect to GitHub's authorize screen.
//   2. GitHub redirects back to REDIRECT_PATH with ?code=&state=.
//   3. The callback page posts { code } to the backend, which does the exchange.
//
// A random `state` is stored before the redirect and re-checked on return (CSRF).

const CLIENT_ID = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
const AUTHORIZE = "https://github.com/login/oauth/authorize"
// user:email so the backend can read the primary verified email (GitHub keeps
// the public profile email null for most users).
const SCOPE = "read:user user:email"
const STATE_KEY = "freeserp:github_oauth_state"

// Locale-agnostic; register EXACTLY this as the GitHub app's Authorization
// callback URL. next-intl normalizes it to /<locale>/auth/github/callback,
// preserving the query string, and the page there completes the sign-in.
export const GITHUB_REDIRECT_PATH = "/auth/github/callback"

export function isGithubConfigured(): boolean {
  return Boolean(CLIENT_ID)
}

export function githubRedirectUri(): string {
  return `${window.location.origin}${GITHUB_REDIRECT_PATH}`
}

/** Redirect to GitHub's authorize screen. `next` is where to land after login. */
export function startGithubLogin(next = "/dashboard"): void {
  if (!CLIENT_ID) throw new Error("GitHub login is not configured")
  const state = `${crypto.randomUUID()}.${encodeURIComponent(next)}`
  sessionStorage.setItem(STATE_KEY, state)
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: githubRedirectUri(),
    scope: SCOPE,
    state,
    allow_signup: "true",
  })
  window.location.href = `${AUTHORIZE}?${params.toString()}`
}

/**
 * Validate the returned `state` against what we stored and return the intended
 * post-login destination. Returns null if state is missing/mismatched (possible
 * CSRF or a stale tab) — the caller should abort the exchange.
 */
export function consumeGithubState(returnedState: string | null): { next: string } | null {
  const stored = sessionStorage.getItem(STATE_KEY)
  sessionStorage.removeItem(STATE_KEY)
  if (!returnedState || !stored || returnedState !== stored) return null
  const next = decodeURIComponent(stored.split(".").slice(1).join(".") || "/dashboard")
  return { next: next.startsWith("/") ? next : "/dashboard" }
}
