// Client-side CSV download. Quotes every cell (escaping embedded quotes) and
// triggers a browser download via an object URL. Shared across dashboard pages.
export function downloadCSV(filename: string, rows: (string | number | null | undefined)[][]) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n")
  // The BOM tells Excel the file is UTF-8. Without it Excel reads the system
  // code page, and "café" opens as "cafÃ©". Sheets and Numbers skip it.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
