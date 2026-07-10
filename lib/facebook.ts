// Thin wrapper around the Facebook JS SDK for the "Continue with Facebook" flow.
// The SDK is lazy-loaded on first use (not shipped on every page) and initialized
// with NEXT_PUBLIC_FACEBOOK_APP_ID. `facebookLogin()` opens the login popup and
// resolves to the user's access token, which the backend verifies at
// POST /api/auth/facebook.

interface FbAuthResponse {
  accessToken?: string
}
interface FbLoginResponse {
  authResponse?: FbAuthResponse | null
  status?: string
}
interface FbSdk {
  init: (opts: { appId: string; cookie: boolean; xfbml: boolean; version: string }) => void
  login: (cb: (res: FbLoginResponse) => void, opts: { scope: string }) => void
}

declare global {
  interface Window {
    FB?: FbSdk
    fbAsyncInit?: () => void
  }
}

const APP_ID = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID
const SDK_VERSION = "v19.0"

// Kill-switch: Facebook login is intentionally hidden for now (pending Meta app
// access). Flip this back to `true` — the button then shows wherever a
// NEXT_PUBLIC_FACEBOOK_APP_ID is also configured. No other code change needed.
const FACEBOOK_LOGIN_ENABLED = false

let sdkPromise: Promise<void> | null = null

// True only when Facebook login is enabled AND an app id is configured — lets the
// UI hide the button entirely rather than render one that can only error.
export function isFacebookConfigured(): boolean {
  return FACEBOOK_LOGIN_ENABLED && Boolean(APP_ID)
}

function loadSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Facebook SDK unavailable"))
  if (window.FB) return Promise.resolve()
  if (sdkPromise) return sdkPromise

  sdkPromise = new Promise<void>((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB?.init({ appId: APP_ID as string, cookie: true, xfbml: false, version: SDK_VERSION })
      resolve()
    }
    const script = document.createElement("script")
    script.src = "https://connect.facebook.net/en_US/sdk.js"
    script.async = true
    script.defer = true
    script.crossOrigin = "anonymous"
    script.onerror = () => {
      sdkPromise = null // allow a retry on the next attempt
      reject(new Error("Failed to load the Facebook SDK"))
    }
    document.body.appendChild(script)
  })
  return sdkPromise
}

// Opens the Facebook login popup with the `email` scope and resolves to the
// short-lived access token. Rejects if the user cancels or the SDK can't load.
export async function facebookLogin(): Promise<string> {
  if (!APP_ID) throw new Error("Facebook login is not configured")
  await loadSdk()
  return new Promise<string>((resolve, reject) => {
    window.FB?.login(
      (res) => {
        const token = res.authResponse?.accessToken
        if (token) resolve(token)
        else reject(new Error("Facebook login was cancelled"))
      },
      { scope: "email" },
    )
  })
}
