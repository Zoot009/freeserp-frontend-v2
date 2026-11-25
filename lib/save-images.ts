import { zip } from "@/lib/zip"

/** A name safe for a file or folder on Windows, Mac and Linux, whatever alphabet it is in. */
export const safeName = (s: string, fallback: string) =>
  s
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .replace(/[. ]+$/, "") || fallback

function saveAs(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export type SaveFile = { path: string; blob: Blob }

/** Save files as a ZIP holding a folder named after the client. (A web page can't make the folder itself.) */
export async function saveFolder(client: string, files: SaveFile[], zipName = client) {
  const folder = safeName(client, "Client")
  saveAs(zip(await Promise.all(files.map(async ({ path, blob }) => ({ name: `${folder}/${path}`, data: new Uint8Array(await blob.arrayBuffer()) })))), `${safeName(zipName, "Client")}.zip`)
}

/** Save one file as it is. `ext` with its dot. */
export const saveOne = (client: string, title: string, ext: string, blob: Blob) => saveAs(blob, `${safeName(`${client} - ${title}`, "Report")}${ext}`)
