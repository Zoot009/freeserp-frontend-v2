/**
 * Brand marks for the search-engine picker.
 *
 * Inline SVG rather than <Favicon>: these paint on the first frame with no
 * network dependency, cannot be blocked by a privacy extension, and need no
 * engine→domain map — which matters because the backend deliberately withholds
 * `seDomain` (see engines.routes.ts). Fetching Bing's logo from Google's favicon
 * service to render inside a modal that must open instantly would be a strange
 * dependency to take on.
 *
 * Engines are config-driven (MULTI_ENGINE_IDS), so an id we have no mark for is
 * not an error — it is the ordinary consequence of an operator widening a config
 * variable without a frontend deploy. Unknown ids fall back to a disc with the
 * engine's initial, which is exactly what <Favicon> does for an unknown domain,
 * so the two fallbacks read as one idea rather than two.
 *
 * The marks are reproduced unmodified, at small size, to identify the engine an
 * option refers to. They must NOT inherit currentColor or be tinted per theme:
 * recolouring a third-party mark is the thing brand terms actually prohibit.
 */
import type { ReactElement } from "react"

const MARKS: Record<string, (size: number) => ReactElement> = {
  google: (s) => (
    <svg width={s} height={s} viewBox="0 0 48 48" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  ),
  bing: (s) => (
    <svg width={s} height={s} viewBox="0 0 48 48" aria-hidden focusable="false">
      <defs>
        <linearGradient id="fs-bing-a" x1="14" y1="4" x2="14" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#37BDFF" />
          <stop offset="1" stopColor="#1B8FE8" />
        </linearGradient>
        <linearGradient id="fs-bing-b" x1="22" y1="20" x2="40" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1DE8B5" />
          <stop offset="1" stopColor="#20C5D8" />
        </linearGradient>
        <linearGradient id="fs-bing-c" x1="38" y1="24" x2="20" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2B9DED" />
          <stop offset="1" stopColor="#3A5BD9" />
        </linearGradient>
      </defs>
      {/* Upright stroke */}
      <path fill="url(#fs-bing-a)" d="M10 3.5l8 2.8v25.4l-8-4.2z" />
      {/* Upper bowl */}
      <path fill="url(#fs-bing-b)" d="M18 17.4l19.8 7-9.9 5.6-9.9-5.2z" />
      {/* Lower sweep */}
      <path fill="url(#fs-bing-c)" d="M37.8 24.4v9.9L18 45.5v-9.6l9.9-5.6z" />
    </svg>
  ),
}

export function EngineMark({ id, label, size = 20 }: { id: string; label: string; size?: number }) {
  const mark = MARKS[id]
  if (mark) return mark(size)
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "inline-grid",
        placeItems: "center",
        background: "var(--bg-inset)",
        color: "var(--text-soft)",
        fontSize: Math.round(size * 0.5),
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      {label[0]?.toUpperCase() ?? "?"}
    </span>
  )
}
