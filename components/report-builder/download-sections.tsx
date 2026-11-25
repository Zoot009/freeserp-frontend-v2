"use client"

import { useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { captureCache, capturePdf, keepMapPictures } from "@/lib/capture"
import type { GbpPost } from "@/lib/report-builder"
import { safeName, saveFolder, saveOne, type SaveFile } from "@/lib/save-images"
import { postFiles, postItems } from "@/components/report-builder/post-card"

// Before the report's maps load.
keepMapPictures()

/** A section of the report: the element it's in, and whether it's finished and in the report. */
export type SectionChoice = { id: string; title: string; ready: boolean }

/** The AI Google Posts: a PNG of each, so always a ZIP. Every other section is a PDF. */
const POSTS = "section-aiPost"

/** Save any of the report's sections: one as a PDF; more, or the AI Google Posts, as a ZIP with the client's folder inside. */
export function DownloadSections({ sections, posts, client }: { sections: SectionChoice[]; posts: GbpPost[]; client: string }) {
  const [open, setOpen] = useState(false)
  // The ones unticked: a section that finishes while this is open starts ticked, like the rest.
  const [off, setOff] = useState<string[]>([])
  const [step, setStep] = useState<{ n: number; of: number } | null>(null)
  const [error, setError] = useState("")
  const ready = sections.filter((s) => s.ready)
  const chosen = ready.filter((s) => !off.includes(s.id))
  const zipped = chosen.length > 1 || chosen.some((s) => s.id === POSTS)

  const save = async () => {
    setError("")
    const files: SaveFile[] = []
    const failed: string[] = []
    const cache = captureCache()
    try {
      // One at a time: each is scrolled into view, so its map and photos load.
      for (const [i, s] of chosen.entries()) {
        setStep({ n: i + 1, of: chosen.length })
        try {
          const el = document.getElementById(s.id)
          if (!el) throw new Error("no section")
          const name = `${i + 1} - ${safeName(s.title, "Section")}`
          if (s.id === POSTS) {
            // Alone, the posts are the folder; among others, they have one of their own.
            const inside = chosen.length === 1 ? "" : `${name}/`
            files.push(...(await postFiles(postItems(posts), cache)).map((f) => ({ ...f, path: inside + f.path })))
          } else files.push({ path: `${name}.pdf`, blob: await capturePdf(el, { title: `${client} - ${s.title}`, footer: `${client} · ${s.title}`, cache }) })
        } catch (e) {
          console.warn("[report] section not saved", s.id, e)
          failed.push(s.title)
        }
      }
      if (files.length) await (zipped ? saveFolder(client, files) : saveOne(client, chosen[0].title, ".pdf", files[0].blob))
    } catch (e) {
      console.warn("[report] download failed", e)
      failed.push("the download")
    } finally {
      setStep(null)
    }
    if (failed.length) setError(`Couldn't save: ${failed.join(", ")}. Please try again.`)
    else setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !step && setOpen(o)}>
      <DialogTrigger asChild>
        <button
          type="button"
          disabled={!ready.length}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          title={ready.length ? "Save sections as PDFs, and the AI Google Posts as PNGs" : "Sections can be saved as they finish"}
        >
          <Download className="h-4 w-4" aria-hidden /> Download
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md" showCloseButton={!step}>
        <DialogHeader>
          <DialogTitle>Download</DialogTitle>
          <DialogDescription>Choose what to save. Each section is a PDF, and the AI Google Posts are PNGs. Two or more come in a ZIP with a folder named {client}.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {chosen.length} of {ready.length} chosen
          </span>
          <span className="flex gap-3">
            <button type="button" disabled={!!step} onClick={() => setOff([])} className="font-medium text-brand hover:underline disabled:opacity-50">
              Select all
            </button>
            <button type="button" disabled={!!step} onClick={() => setOff(sections.map((s) => s.id))} className="text-muted-foreground hover:underline disabled:opacity-50">
              Clear
            </button>
          </span>
        </div>
        <ul className="-mx-1 max-h-[46vh] space-y-1 overflow-y-auto px-1">
          {sections.map((s) => (
            <li key={s.id}>
              <label
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-[13px] transition-colors ${
                  !s.ready ? "border-border opacity-60" : off.includes(s.id) ? "cursor-pointer border-border hover:bg-muted/50" : "cursor-pointer border-brand/40 bg-brand/5"
                }`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand"
                  checked={s.ready && !off.includes(s.id)}
                  disabled={!s.ready || !!step}
                  onChange={() => setOff((cur) => (cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur, s.id]))}
                />
                <span className="min-w-0 flex-1 font-medium">{s.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{!s.ready ? "Not ready" : s.id === POSTS ? "PNG" : "PDF"}</span>
              </label>
            </li>
          ))}
        </ul>
        <div aria-live="polite" className="text-xs text-red-600 empty:hidden dark:text-red-400">
          {error}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={!chosen.length || !!step}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
        >
          {step ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
          {step ? `Making ${step.n} of ${step.of}…` : !zipped ? "Download PDF" : chosen.length > 1 ? `Download ${chosen.length} sections (ZIP)` : "Download PNGs (ZIP)"}
        </button>
      </DialogContent>
    </Dialog>
  )
}
