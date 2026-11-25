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

/**
 * Save a client's pictures: one as a PNG, more as a ZIP holding a folder named
 * after the client with the PNGs inside, numbered in order. (A web page can't
 * make the folder itself.)
 */
export async function saveImages(client: string, images: { title: string; png: Blob }[]) {
  const folder = safeName(client, "Client")
  if (images.length === 1) return saveAs(images[0].png, `${safeName(`${client} - ${images[0].title}`, "Image")}.png`)
  saveAs(
    zip(
      await Promise.all(
        images.map(async ({ title, png }, i) => ({ name: `${folder}/${i + 1} - ${safeName(title, "Image")}.png`, data: new Uint8Array(await png.arrayBuffer()) })),
      ),
    ),
    `${folder}.zip`,
  )
}
