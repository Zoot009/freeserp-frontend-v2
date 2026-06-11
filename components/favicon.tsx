"use client"

import { useState } from "react"

// A site favicon rendered like Google's SERP — a small rounded container with
// the real favicon inside. DataForSEO doesn't return favicons, so we fetch them
// from Google's public favicon service keyed on the domain, falling back to a
// coloured initial if the image can't load (no key, blocked, or no favicon).
export function Favicon({
  domain,
  size = 26,
  fallbackColor,
  bare = false,
}: {
  domain: string
  size?: number
  fallbackColor?: string
  // When true, the loaded favicon renders on its own with no rounded
  // container background or border (the image fills the box). The coloured
  // initial fallback still shows its background since it needs the contrast.
  bare?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const clean = domain.toLowerCase().replace(/^www\./, "")
  const letter = clean[0]?.toUpperCase() ?? "?"

  const box: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    flexShrink: 0,
    display: "inline-grid",
    placeItems: "center",
    overflow: "hidden",
  }

  if (failed || !clean) {
    return (
      <span
        aria-hidden
        style={{
          ...box,
          background: fallbackColor ?? "var(--bg-inset)",
          color: "#fff",
          fontSize: Math.round(size * 0.42),
          fontWeight: 600,
        }}
      >
        {letter}
      </span>
    )
  }

  const inner = bare ? size : Math.round(size * 0.62)
  return (
    <span style={bare ? box : { ...box, background: "var(--bg-inset)", border: "1px solid var(--border)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(clean)}`}
        alt=""
        width={inner}
        height={inner}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        style={{ width: inner, height: inner, objectFit: "contain" }}
      />
    </span>
  )
}
