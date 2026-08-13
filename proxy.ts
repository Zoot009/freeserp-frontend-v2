import createMiddleware from 'next-intl/middleware'
import type { NextRequest } from 'next/server'
import { routing } from './i18n/routing'
import { paletteFor } from './lib/flag-colors'

const intlMiddleware = createMiddleware(routing)

/** The tile the mark sits on; contrast is judged against it. */
const TILE = '#2d5bff'

/**
 * Country of the visitor, for the flag-coloured logo.
 *
 * Vercel resolves this from the IP at the edge and hands it over as a header,
 * so there is no lookup to do and no IP to store — the header is already there
 * on every request. Cloudflare's equivalent is checked too, in case the app
 * ends up behind it.
 *
 * The RESOLVED COLOURS go in the cookie, not the country code.
 *
 * Two reasons. The layout renders statically (setRequestLocale), so reading
 * cookies there would make every page in the app dynamic — a real cost for a
 * decorative tint. Instead a tiny inline script reads this cookie before first
 * paint, which keeps the pages static and avoids a flash of brand colours. And
 * putting colours rather than a country in the cookie keeps the 190-entry flag
 * table on the server: shipping it to the browser to look up one row would be
 * several KB on every page load.
 *
 * Not httpOnly on purpose — it holds three hex codes for decoration, and
 * hiding them from the client would defeat the script that has to read them.
 */
const LOGO_COOKIE = 'fs-logo'

function countryOf(req: NextRequest): string | null {
  const raw =
    req.headers.get('x-vercel-ip-country') ??
    req.headers.get('cf-ipcountry') ??
    null
  if (!raw) return null
  const cc = raw.trim().toUpperCase()
  // Two letters only. 'XX' and 'T1' are what these headers return for unknown
  // origins and Tor exits, and neither is a country we have a flag for.
  return /^[A-Z]{2}$/.test(cc) && cc !== 'XX' && cc !== 'T1' ? cc : null
}

export default function proxy(req: NextRequest) {
  const res = intlMiddleware(req)

  const palette = paletteFor(countryOf(req), TILE)
  const value = palette ? palette.join('|') : ''

  // Only write when it changes, so a returning visitor isn't handed the same
  // Set-Cookie on every navigation.
  if (req.cookies.get(LOGO_COOKIE)?.value !== value) {
    if (value) {
      res.cookies.set(LOGO_COOKIE, value, {
        path: '/',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
      })
    } else {
      // No country, or one we have no flag for — clear any stale palette so a
      // visitor who moves doesn't keep the last country's colours.
      res.cookies.delete(LOGO_COOKIE)
    }
  }

  return res
}

export const config = {
  // Match all pathnames except:
  // - /api (proxied to the backend via next.config rewrites — must NOT be touched)
  // - /_next and /_vercel internals
  // - any path containing a dot (static files: favicon.ico, sitemap.xml, feed.xml, images…)
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}
