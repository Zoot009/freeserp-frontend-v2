// Pre-configured axios instance used across the app in place of the native
// `fetch`. `validateStatus: () => true` makes axios resolve for every HTTP
// status (it only rejects on network-level errors) instead of throwing on
// non-2xx — this mirrors `fetch` and lets call sites keep inspecting
// `res.status` themselves (e.g. the 429 rate-limit and 404 branches). Per-call
// options (`withCredentials`, auth headers, etc.) are passed at each call site.
import axios from "axios"
import { demoResponse } from "@/lib/demo"

const instance = axios.create({
  validateStatus: () => true,
})

/**
 * Demo reports never reach the network (lib/demo/index.ts): a demo URL is
 * answered in-process by swapping in an adapter. A refused write comes back as
 * a plain 403, which the response interceptor below leaves alone — no credit
 * refresh, no quota prompt.
 */
instance.interceptors.request.use((config) => {
  const demo = demoResponse(config.url ?? "", config.method ?? "get")
  if (!demo) return config
  config.adapter = async (cfg) => ({
    data: demo.error ? { error: { code: demo.error.code, message: demo.error.message } } : demo.data,
    status: demo.error ? demo.error.status : 200,
    statusText: demo.error ? demo.error.code : "OK",
    headers: { "content-type": "application/json" },
    config: cfg,
  })
  return config
})

/**
 * The same two window signals `apiRequest` in lib/api.ts fires, for the pages
 * that still call the backend through this instance.
 *
 * Without them those pages were invisible to the rest of the app: a competitor
 * analysis or an internal-link crawl spent credits and the balance pill kept
 * its old number, and a 402 never reached the out-of-credits prompt, so the
 * page's own disabled button was the only thing the user saw. Firing here
 * covers every such call at once instead of one call site at a time.
 */
instance.interceptors.response.use((res) => {
  if (typeof window === "undefined") return res
  if (res.status === 402) {
    const err = (res.data as { error?: { code?: string; message?: string; details?: unknown } } | undefined)?.error
    window.dispatchEvent(
      new CustomEvent("billing:quota", {
        detail: { code: err?.code, message: err?.message, details: err?.details },
      }),
    )
  } else if (res.status >= 200 && res.status < 300 && (res.config.method ?? "get").toUpperCase() !== "GET") {
    window.dispatchEvent(new Event("credits:refresh"))
  }
  return res
})

export default instance
