"use client"

import { useState } from "react"

/**
 * Country flag rendered as a small image (flagcdn.com) instead of an emoji.
 * Flag emoji don't render on Windows — Chrome/Edge/Brave fall back to the bare
 * ISO letters ("IN"), which is exactly what this replaces. Falls back to a
 * globe when the code is missing/unknown or the image fails to load.
 */
export function Flag({
  code,
  size = 16,
  title,
}: {
  code: string | null | undefined
  size?: number
  title?: string
}) {
  const norm = (code || "").trim().toLowerCase()
  const valid = /^[a-z]{2}$/.test(norm)
  const [failed, setFailed] = useState(false)

  if (!valid || failed) {
    return (
      <span style={{ fontSize: size - 2, lineHeight: 1 }} title={title} aria-hidden="true">
        {"\u{1F30D}"}
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny external asset, next/image is overkill
    <img
      src={`https://flagcdn.com/w40/${norm}.png`}
      srcSet={`https://flagcdn.com/w80/${norm}.png 2x`}
      width={size}
      height={Math.round(size * 0.75)}
      alt={norm.toUpperCase()}
      title={title ?? norm.toUpperCase()}
      loading="lazy"
      draggable={false}
      style={{
        borderRadius: 2,
        objectFit: "cover",
        display: "inline-block",
        verticalAlign: "-2px",
        flexShrink: 0,
        boxShadow: "0 0 0 1px rgba(11,13,18,0.08)",
      }}
      onError={() => setFailed(true)}
    />
  )
}
