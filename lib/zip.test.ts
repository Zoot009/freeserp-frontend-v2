import { describe, expect, it } from "vitest"
import { zip } from "./zip"
import { safeName } from "./save-images"

describe("zip", () => {
  it("stores each file under its name, with the checksum and place a reader looks for", async () => {
    const text = (s: string) => new Uint8Array(new TextEncoder().encode(s))
    const d = Buffer.from(await zip([{ name: "Café/1.png", data: text("123456789") }, { name: "Café/2.png", data: text("second") }]).arrayBuffer())
    const end = d.length - 22
    expect(d.readUInt32LE(end)).toBe(0x06054b50)
    expect(d.readUInt16LE(end + 10)).toBe(2)
    let at = d.readUInt32LE(end + 16)
    const seen: string[] = []
    for (let i = 0; i < 2; i++) {
      expect(d.readUInt32LE(at)).toBe(0x02014b50)
      const nameLength = d.readUInt16LE(at + 28)
      const local = d.readUInt32LE(at + 42)
      expect(d.readUInt32LE(local)).toBe(0x04034b50)
      const start = local + 30 + d.readUInt16LE(local + 26)
      seen.push(`${d.subarray(at + 46, at + 46 + nameLength)}=${d.subarray(start, start + d.readUInt32LE(at + 24))}`)
      // The standard check value for CRC-32.
      if (i === 0) expect(d.readUInt32LE(at + 16)).toBe(0xcbf43926)
      at += 46 + nameLength
    }
    expect(seen).toEqual(["Café/1.png=123456789", "Café/2.png=second"])
  })
})

describe("safeName", () => {
  it("keeps any alphabet and drops what a file system won't take", () => {
    expect(safeName('Café "Ünï" / Söhne: Movers?.', "x")).toBe("Café Ünï Söhne Movers")
    expect(safeName("  ...  ", "Client")).toBe("Client")
  })
})
