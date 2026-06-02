// Pre-configured axios instance used across the app in place of the native
// `fetch`. `validateStatus: () => true` makes axios resolve for every HTTP
// status (it only rejects on network-level errors) instead of throwing on
// non-2xx — this mirrors `fetch` and lets call sites keep inspecting
// `res.status` themselves (e.g. the 429 rate-limit and 404 branches). Per-call
// options (`withCredentials`, auth headers, etc.) are passed at each call site.
import axios from "axios"

const instance = axios.create({
  validateStatus: () => true,
})

export default instance
