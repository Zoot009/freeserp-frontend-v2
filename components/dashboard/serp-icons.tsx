import type { SVGProps } from "react"

/**
 * The SERP features, drawn as what they look like on the results page.
 *
 * These replaced a set of general-purpose icons — a speech bubble, a camera, a
 * book — which were each a reasonable *metaphor* and all read as the same thin
 * outline shape in a row 20px tall. The problem with a metaphor here is that
 * the reader already knows what these things look like: they have seen the
 * stacked "People also ask" rows and the row of image thumbnails a thousand
 * times. So each glyph is a miniature of the block itself, and the silhouettes
 * differ — solid bars, an outlined card, a pin, a star — rather than ten
 * variations on a 1.5px stroke.
 *
 * Drawn on a 16×16 grid, sized by the caller, painted in `currentColor` — which
 * on a filled chip is the knocked-out white, not the feature's colour. Secondary
 * shapes drop their opacity instead of taking a second colour, so they read as
 * the fill showing through. Everything is `aria-hidden`: the chip
 * carries the accessible name, and a glyph that also announced itself would say
 * it twice.
 */

type GlyphProps = SVGProps<SVGSVGElement> & { size?: number }

const svg = (size: number, p: SVGProps<SVGSVGElement>) => ({
  width: size,
  height: size,
  viewBox: "0 0 16 16",
  fill: "none",
  "aria-hidden": true as const,
  ...p,
})

/** AI Overview — the generated answer. A star, filled, with its own spark. */
export const AiOverviewGlyph = ({ size = 14, ...p }: GlyphProps) => (
  <svg {...svg(size, p)}>
    <path
      d="M6.3 1.5l1.08 3.12L10.5 5.7 7.38 6.78 6.3 9.9 5.22 6.78 2.1 5.7l3.12-1.08L6.3 1.5z"
      fill="currentColor"
    />
    <path
      d="M11.7 8.7l.62 1.78 1.78.62-1.78.62-.62 1.78-.62-1.78-1.78-.62 1.78-.62.62-1.78z"
      fill="currentColor"
      opacity=".55"
    />
  </svg>
)

/**
 * Cited in the AI Overview. The same star, badged.
 *
 * Composed rather than a second separate mark: the badge overlaps the star, so
 * it reads as one glyph with a state, the way a notification dot does — not as
 * two features in one chip. The tick is knocked out in the chip's own fill
 * (--feat-fill), so it is a hole in the badge rather than a stroke painted over
 * it, and it stays right whatever colour the chip is.
 */
export const AiCitedGlyph = ({ size = 14, ...p }: GlyphProps) => (
  <svg {...svg(size, p)}>
    <path
      d="M6 1.4l1.05 3.05L10.1 5.5 7.05 6.55 6 9.6 4.95 6.55 1.9 5.5l3.05-1.05L6 1.4z"
      fill="currentColor"
    />
    <circle cx="11.4" cy="11.3" r="3.9" fill="currentColor" />
    <path
      d="M9.7 11.35l1.15 1.15 2.2-2.4"
      stroke="var(--feat-fill)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

/** Featured snippet — the answer box: a heading bar and the lifted paragraph. */
export const SnippetGlyph = ({ size = 14, ...p }: GlyphProps) => (
  <svg {...svg(size, p)}>
    <rect x="1.4" y="2.6" width="13.2" height="10.8" rx="2.2" stroke="currentColor" strokeWidth="1.3" />
    <rect x="3.6" y="4.9" width="5.4" height="1.9" rx=".95" fill="currentColor" />
    <rect x="3.6" y="8" width="8.8" height="1.2" rx=".6" fill="currentColor" opacity=".5" />
    <rect x="3.6" y="10.3" width="6.2" height="1.2" rx=".6" fill="currentColor" opacity=".5" />
  </svg>
)

/** People also ask — the stack of collapsed rows, the first one open. */
export const PaaGlyph = ({ size = 14, ...p }: GlyphProps) => (
  <svg {...svg(size, p)}>
    <rect x="1.3" y="1.9" width="13.4" height="3.6" rx="1.3" fill="currentColor" />
    <rect x="1.3" y="6.6" width="13.4" height="3.6" rx="1.3" stroke="currentColor" strokeWidth="1.2" />
    <rect x="1.3" y="11.3" width="13.4" height="3.6" rx="1.3" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="12.1" cy="8.4" r=".85" fill="currentColor" />
    <circle cx="12.1" cy="13.1" r=".85" fill="currentColor" />
  </svg>
)

/** Video carousel — the player, with the play mark solid inside it. */
export const VideoGlyph = ({ size = 14, ...p }: GlyphProps) => (
  <svg {...svg(size, p)}>
    <rect x="1.4" y="3" width="13.2" height="10" rx="2.4" stroke="currentColor" strokeWidth="1.3" />
    <path d="M6.5 5.8l4.3 2.2-4.3 2.2V5.8z" fill="currentColor" />
  </svg>
)

/** Image pack — the row of thumbnails, not one picture. */
export const ImagePackGlyph = ({ size = 14, ...p }: GlyphProps) => (
  <svg {...svg(size, p)}>
    <rect x="1" y="4.6" width="4" height="6.8" rx="1.1" fill="currentColor" opacity=".45" />
    <rect x="5.9" y="2.8" width="4.2" height="10.4" rx="1.2" fill="currentColor" />
    <rect x="11" y="4.6" width="4" height="6.8" rx="1.1" fill="currentColor" opacity=".45" />
  </svg>
)

/** Local pack — the map pin. */
export const LocalGlyph = ({ size = 14, ...p }: GlyphProps) => (
  <svg {...svg(size, p)}>
    <path
      d="M8 14.6s4.7-4.6 4.7-7.9a4.7 4.7 0 1 0-9.4 0C3.3 10 8 14.6 8 14.6z"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinejoin="round"
    />
    <circle cx="8" cy="6.6" r="1.75" fill="currentColor" />
  </svg>
)

/** Knowledge graph — the portrait panel down the side, photo at the top. */
export const KnowledgeGlyph = ({ size = 14, ...p }: GlyphProps) => (
  <svg {...svg(size, p)}>
    <rect x="2.9" y="1.5" width="10.2" height="13" rx="2" stroke="currentColor" strokeWidth="1.3" />
    <rect x="4.9" y="3.5" width="6.2" height="4.2" rx="1" fill="currentColor" />
    <rect x="4.9" y="9.2" width="6.2" height="1.2" rx=".6" fill="currentColor" opacity=".5" />
    <rect x="4.9" y="11.4" width="4" height="1.2" rx=".6" fill="currentColor" opacity=".5" />
  </svg>
)

/** Shopping — the price tag. */
export const ShoppingGlyph = ({ size = 14, ...p }: GlyphProps) => (
  <svg {...svg(size, p)}>
    <path
      d="M7.7 1.9h5.2c.7 0 1.2.5 1.2 1.2v5.2c0 .3-.1.6-.4.8l-5.6 5.6a1.2 1.2 0 0 1-1.7 0L1.3 10.4a1.2 1.2 0 0 1 0-1.7l5.6-5.6c.2-.2.5-.3.8-.3z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
    <circle cx="11.1" cy="4.9" r="1.35" fill="currentColor" />
  </svg>
)

/** News — the columns, with the masthead across the top. */
export const NewsGlyph = ({ size = 14, ...p }: GlyphProps) => (
  <svg {...svg(size, p)}>
    <rect x="1.4" y="2.4" width="13.2" height="11.2" rx="1.8" stroke="currentColor" strokeWidth="1.3" />
    <rect x="3.4" y="4.5" width="9.2" height="1.6" rx=".8" fill="currentColor" />
    <rect x="3.4" y="7.6" width="4" height="4.1" rx=".8" fill="currentColor" opacity=".5" />
    <rect x="8.6" y="7.6" width="4" height="1.1" rx=".55" fill="currentColor" opacity=".5" />
    <rect x="8.6" y="9.7" width="4" height="1.1" rx=".55" fill="currentColor" opacity=".5" />
  </svg>
)
