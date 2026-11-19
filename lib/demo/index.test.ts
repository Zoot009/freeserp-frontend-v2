// Contract every registered demo must keep (spec: .claude/skills/demo-report).
// A tool added to DEMO_TOOLS is covered here automatically.

import { describe, expect, it } from "vitest"
import { DEMO_TOOLS, demoResponse } from "./index"
import instance from "../axios"

describe.each(DEMO_TOOLS.map((t) => [t.base, t] as const))("demo %s", (base) => {
  it("serves its root", () => {
    expect(demoResponse(`${base}/demo`, "GET")).toHaveProperty("data")
  })

  it("refuses every write", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(demoResponse(`${base}/demo/anything`, method)).toMatchObject({ error: { status: 403, code: "demo_read_only" } })
    }
  })

  it("404s an unknown path", () => {
    expect(demoResponse(`${base}/demo/__nope__/x`, "GET")).toMatchObject({ error: { status: 404 } })
  })

  it("leaves real ids, look-alikes and the list alone", () => {
    expect(demoResponse(`${base}/cm1a2b3c4`, "GET")).toBeNull()
    expect(demoResponse(`${base}/demographics`, "GET")).toBeNull()
    expect(demoResponse(base, "GET")).toBeNull()
  })

  it("matches full URLs and query strings, as the axios callers send", () => {
    expect(demoResponse(`http://localhost:3003${base}/demo?x=1`, "get")).toHaveProperty("data")
  })
})

describe("lib/axios demo interceptor", () => {
  it("answers a demo URL in-process and refuses writes without the network", async () => {
    const base = DEMO_TOOLS[0].base
    const read = await instance.get(`http://localhost:1${base}/demo`)
    expect(read.status).toBe(200)
    expect(read.data).toBeTruthy()
    const write = await instance.post(`http://localhost:1${base}/demo`, {})
    expect(write.status).toBe(403)
    expect(write.data).toMatchObject({ error: { code: "demo_read_only" } })
  })
})
