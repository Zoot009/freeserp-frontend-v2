// Shared axios instance used across the app in place of the native `fetch`.
//
// It is configured to mirror `fetch`'s behaviour so call sites can keep
// inspecting the response themselves: `validateStatus: () => true` makes axios
// resolve for every HTTP status (it only rejects on network-level errors),
// which preserves the existing `res.status === 429` / 404 / error-body checks
// that the old `fetch` code relied on. Per-call options (`withCredentials`,
// auth headers, etc.) are passed at each call site, matching what the previous
// `fetch` options spelled out.
import axios from "axios"

export const http = axios.create({
  validateStatus: () => true,
})
