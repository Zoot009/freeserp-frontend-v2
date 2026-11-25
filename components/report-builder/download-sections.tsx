"use client"

import { useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { captureCache, capturePng, keepMapPictures } from "@/lib/capture"
import { saveImages } from "@/lib/save-images"

// Before the report's maps load.
keepMapPictures()

/** A section of the report: the element it's in, and whether it's finished and in the report. */
export type SectionChoice = { id: string; title: string; ready: boolean }

/** Save any of the report's sections as pictures: one as a PNG, more as a ZIP with the client's folder inside. */
export function DownloadSections({ sections, client }: { sections: SectionChoice[]; client: string }) {
  const [open, setOpen] = useState(false)
  // The ones unticked: a section that finishes while this is open starts ticked, like the rest.
  const [off, setOff] = useState<string[]>([])
  const [step, setStep] = useState<{ n: number; of: number } | null>(null)
  const [error, setError] = useState("")
  const ready = sections.filter((s) => s.ready)
  const chosen = ready.filter((s) => !off.includes(s.id))

  const save = async () => {
    setError("")
    const images: { title: string; png: Blob }[] = []
    const failed: string[] = []
    const main = document.scrollingElement
    const top = main?.scrollTop ?? 0
    const cache = captureCache()
    try {
      // One at a time: each is scrolled into view, so its map and photos load.
      for (const [i, s] of chosen.entries()) {
        setStep({ n: i + 1, of: chosen.length })
        try {
          const el = document.getElementById(s.id)
          if (!el) throw new Error("no section")
          images.push({ title: s.title, png: await capturePng(el, { cache }) })
        } catch (e) {
          console.warn("[report] section not saved as an image", s.id, e)
          failed.push(s.title)
        }
      }
      if (images.length) await saveImages(client, images)
    } catch {
      failed.push(...images.map((i) => i.title))
    } finally {
      main?.scrollTo({ top })
      setStep(null)
    }
    if (failed.length) setError(`Couldn't make the image for: ${failed.join(", ")}. Please try again.`)
    else setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !step && setOpen(o)}>
      {/* The team's own controls are left out, as in the print, and the maps' zoom buttons. */}
      <style>{"[data-capturing] .print\\:hidden, [data-capturing] .gm-bundled-control { display: none !important }"}</style>
      <DialogTrigger asChild>
        <button
          type="button"
          disabled={!ready.length}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          title={ready.length ? "Save sections as images" : "Sections can be saved as they finish"}
        >
          <Download className="h-4 w-4" aria-hidden /> Download
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md" showCloseButton={!step}>
        <DialogHeader>
          <DialogTitle>Download as images</DialogTitle>
          <DialogDescription>Choose the sections to save. One is saved as a PNG; two or more as a ZIP with a folder named {client}.</DialogDescription>
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
                {!s.ready && <span className="shrink-0 text-xs text-muted-foreground">Not ready</span>}
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
          {step ? `Making image ${step.n} of ${step.of}…` : chosen.length > 1 ? `Download ${chosen.length} images (ZIP)` : "Download PNG"}
        </button>
      </DialogContent>
    </Dialog>
  )
}
