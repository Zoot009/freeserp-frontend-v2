/**
 * The FreeSERP mark.
 *
 * Inline SVG rather than /logo.png, because the point of this component is that
 * the mark can be recoloured — and a raster image cannot be. The geometry is
 * the same artwork as the PNG and as emails/assets/logo-freeserp.svg: twelve
 * spokes radiating from a centre dot, on a rounded tile.
 *
 * The FLAG GOES ON THE TILE, and the mark stays one colour on top of it.
 *
 * The first attempt put the three flag colours on the spokes instead. It read
 * fine at 200px and turned to mush at 32px, which is the only size this
 * actually renders at — twelve thin strokes in three colours on a saturated
 * tile came out as a smudge nobody could identify as either a flag or a logo.
 * Three solid horizontal bands survive the size; twelve coloured hairlines do
 * not.
 *
 * The mark's colour is chosen against the middle band rather than fixed white,
 * because a white mark on India's white centre stripe would vanish. Picking the
 * dark option there is also what makes India come out right: saffron, white and
 * green with a navy mark in the middle is the flag.
 *
 * Colours come from CSS custom properties, set once on <html> by the root
 * layout. Not props: the logo renders in a dozen places, several of them client
 * components several levels deep, and threading a country through all of them
 * to reach a decorative fill would be a lot of plumbing for a tint. Variables
 * also mean no hydration mismatch — the server writes them into the document
 * before React ever runs.
 */

export function Logo({
  size = 32,
  className,
  title = "FreeSERP",
}: {
  size?: number
  className?: string
  /** Empty string marks it decorative, for places that already name the brand. */
  title?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}

      {/* The bands are clipped to the rounded tile, so three plain rects give a
          striped rounded square without needing a rounded shape each. */}
      <defs>
        <clipPath id="fs-logo-tile">
          <rect width="100" height="100" rx="22" />
        </clipPath>
      </defs>

      <g clipPath="url(#fs-logo-tile)">
        {/* One band each. All three default to brand blue, so with no flag
            palette set this is exactly the logo as it was. */}
        <rect y="0" width="100" height="34" fill="var(--fs-logo-1, #2d5bff)" />
        <rect y="33" width="100" height="34" fill="var(--fs-logo-2, #2d5bff)" />
        <rect y="66" width="100" height="34" fill="var(--fs-logo-3, #2d5bff)" />
      </g>

      {/* Keeps the silhouette when a band is white and the page behind it is
          too — without this the tile loses its edge on a light background. */}
      <rect
        x="0.5"
        y="0.5"
        width="99"
        height="99"
        rx="21.5"
        fill="none"
        stroke="rgba(0,0,0,0.12)"
      />

      {/* The mark, one colour, chosen to stay legible over the middle band. */}
      <g fill="var(--fs-logo-mark, #ffffff)">
        <polygon points="53.40,42.00 53.40,4.00 46.60,4.00 46.60,42.00" />
        <circle cx="50.00" cy="4.00" r="3.40" />
        <polygon points="56.94,44.77 75.94,11.86 70.06,8.46 51.06,41.37" />
        <circle cx="73.00" cy="10.16" r="3.40" />
        <polygon points="58.63,48.94 91.54,29.94 88.14,24.06 55.23,43.06" />
        <circle cx="89.84" cy="27.00" r="3.40" />
        <polygon points="58.00,53.40 96.00,53.40 96.00,46.60 58.00,46.60" />
        <circle cx="96.00" cy="50.00" r="3.40" />
        <polygon points="55.23,56.94 88.14,75.94 91.54,70.06 58.63,51.06" />
        <circle cx="89.84" cy="73.00" r="3.40" />
        <polygon points="51.06,58.63 70.06,91.54 75.94,88.14 56.94,55.23" />
        <circle cx="73.00" cy="89.84" r="3.40" />
        <polygon points="46.60,58.00 46.60,96.00 53.40,96.00 53.40,58.00" />
        <circle cx="50.00" cy="96.00" r="3.40" />
        <polygon points="43.06,55.23 24.06,88.14 29.94,91.54 48.94,58.63" />
        <circle cx="27.00" cy="89.84" r="3.40" />
        <polygon points="41.37,51.06 8.46,70.06 11.86,75.94 44.77,56.94" />
        <circle cx="10.16" cy="73.00" r="3.40" />
        <polygon points="42.00,46.60 4.00,46.60 4.00,53.40 42.00,53.40" />
        <circle cx="4.00" cy="50.00" r="3.40" />
        <polygon points="44.77,43.06 11.86,24.06 8.46,29.94 41.37,48.94" />
        <circle cx="10.16" cy="27.00" r="3.40" />
        <polygon points="48.94,41.37 29.94,8.46 24.06,11.86 43.06,44.77" />
        <circle cx="27.00" cy="10.16" r="3.40" />
        <circle cx="50" cy="50" r="7" />
      </g>
    </svg>
  )
}
