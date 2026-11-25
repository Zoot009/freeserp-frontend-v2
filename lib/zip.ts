// A ZIP of files as they are, not compressed: for PNGs and JPEGs, which already
// are. Small enough not to need a library; not for files near 4 GB.

const CRC = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1
  return n >>> 0
})

const crc32 = (d: Uint8Array) => {
  let c = 0xffffffff
  for (const b of d) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Little-endian numbers, each `[value, bytes]`. */
const bytes = (...fields: [number, 2 | 4][]) => {
  const out = new Uint8Array(fields.reduce((n, [, size]) => n + size, 0))
  const view = new DataView(out.buffer)
  let at = 0
  for (const [value, size] of fields) {
    if (size === 2) view.setUint16(at, value, true)
    else view.setUint32(at, value, true)
    at += size
  }
  return out
}

/** Names may hold folders ("Client/1.png"), with "/" between. */
export function zip(files: { name: string; data: Uint8Array<ArrayBuffer> }[]): Blob {
  const now = new Date()
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  const body: Uint8Array<ArrayBuffer>[] = []
  const index: Uint8Array<ArrayBuffer>[] = []
  let at = 0
  for (const { name, data } of files) {
    const path = new Uint8Array(new TextEncoder().encode(name))
    // Version, UTF-8 names, stored, when, checksum, sizes: the same in the file's header and in the index.
    const about = bytes([20, 2], [0x0800, 2], [0, 2], [time, 2], [date, 2], [crc32(data), 4], [data.length, 4], [data.length, 4], [path.length, 2], [0, 2])
    body.push(bytes([0x04034b50, 4]), about, path, data)
    index.push(bytes([0x02014b50, 4], [20, 2]), about, bytes([0, 2], [0, 2], [0, 2], [0, 4], [at, 4]), path)
    at += 4 + about.length + path.length + data.length
  }
  const size = index.reduce((n, p) => n + p.length, 0)
  const end = bytes([0x06054b50, 4], [0, 2], [0, 2], [files.length, 2], [files.length, 2], [size, 4], [at, 4], [0, 2])
  return new Blob([...body, ...index, end], { type: "application/zip" })
}
